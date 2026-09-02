import { GeminiAIProvider, MiniMaxAIProvider, MockAIProvider, VertexAIProvider, type AIProvider } from './ai';
import { loadRuntimeConfig, type RuntimeConfig } from './env';
import type { Repositories } from './repositories';
import { InMemoryRepositories } from './repositories';
import { LarkOpenApiClient, LarkRepositories, type LarkFetch } from './lark';

export interface RuntimeServices {
  config: RuntimeConfig;
  repositories: Repositories;
  aiProvider: AIProvider;
}

let localRepositories: InMemoryRepositories | undefined;

const LARK_GLOBAL_API_HOST = 'open.larksuite.com';

function larkOperation(url: URL): string {
  if (url.pathname.includes('/auth/v3/tenant_access_token/internal')) return 'tenant_access_token';
  if (url.pathname.includes('/records/')) return 'base_record';
  if (url.pathname.includes('/records')) return 'base_records';
  return 'open_api';
}

/**
 * The project uses Lark (international), not Feishu (China). The repository
 * client intentionally stays transport-agnostic, so runtime rewrites its
 * legacy Feishu host to the Lark international OpenAPI host.
 */
const larkInternationalFetch: LarkFetch = async (input, init) => {
  let url: URL;
  let rewrittenInput: RequestInfo | URL;

  if (input instanceof Request) {
    url = new URL(input.url);
    if (url.hostname === 'open.feishu.cn') url.hostname = LARK_GLOBAL_API_HOST;
    rewrittenInput = new Request(url, input);
  } else {
    url = new URL(input.toString());
    if (url.hostname === 'open.feishu.cn') url.hostname = LARK_GLOBAL_API_HOST;
    rewrittenInput = url;
  }

  const response = await fetch(rewrittenInput, init);
  const diagnostic = (await response.clone().json().catch(() => null)) as { code?: number; msg?: string } | null;
  const upstreamFailed = !response.ok || (typeof diagnostic?.code === 'number' && diagnostic.code !== 0);

  if (upstreamFailed) {
    // Log only non-secret diagnostics. Never log app credentials, tokens, table IDs, or request payloads.
    console.error('Lark OpenAPI request failed', {
      operation: larkOperation(url),
      status: response.status,
      code: diagnostic?.code,
      msg: diagnostic?.msg,
    });
  }

  return response;
};

/** Composition root used by functions. The selected live provider stays server-only. */
function aiProviderFor(config: RuntimeConfig): AIProvider {
  if (config.aiMode === 'mock') return new MockAIProvider();
  if (config.ai?.provider === 'gemini') return new GeminiAIProvider(config.ai);
  if (config.ai?.provider === 'vertex') return new VertexAIProvider(config.ai);
  if (config.ai?.provider === 'minimax') return new MiniMaxAIProvider(config.ai);
  throw new Error('Real AI runtime requires a configured AI provider.');
}

export function createRuntime(config = loadRuntimeConfig(), repositories?: Repositories, aiProvider: AIProvider = aiProviderFor(config)): RuntimeServices {
  if (config.persistenceMode === 'lark' && !repositories && config.lark) {
    const client = new LarkOpenApiClient(config.lark, larkInternationalFetch);
    return { config, repositories: new LarkRepositories(client, config.lark), aiProvider };
  }
  localRepositories ??= new InMemoryRepositories();
  return { config, repositories: repositories ?? localRepositories, aiProvider };
}
