import { GeminiAIProvider, MockAIProvider, type AIProvider } from './ai';
import { loadRuntimeConfig, type RuntimeConfig } from './env';
import type { Repositories } from './repositories';
import { InMemoryRepositories } from './repositories';
import { LarkOpenApiClient, LarkRepositories } from './lark';

export interface RuntimeServices {
  config: RuntimeConfig;
  repositories: Repositories;
  aiProvider: AIProvider;
}

let localRepositories: InMemoryRepositories | undefined;

/** Composition root used by functions. The mock repository is process-local by design. */
function aiProviderFor(config: RuntimeConfig): AIProvider {
  if (config.aiMode === 'mock') return new MockAIProvider();
  if (config.ai?.provider === 'gemini') return new GeminiAIProvider(config.ai);
  throw new Error('Real AI runtime requires a configured Gemini provider.');
}

export function createRuntime(config = loadRuntimeConfig(), repositories?: Repositories, aiProvider: AIProvider = aiProviderFor(config)): RuntimeServices {
  if (config.persistenceMode === 'lark' && !repositories && config.lark) {
    return { config, repositories: new LarkRepositories(new LarkOpenApiClient(config.lark), config.lark), aiProvider };
  }
  localRepositories ??= new InMemoryRepositories();
  return { config, repositories: repositories ?? localRepositories, aiProvider };
}
