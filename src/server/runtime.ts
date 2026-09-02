import { MockAIProvider, type AIProvider } from './ai';
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
export function createRuntime(config = loadRuntimeConfig(), repositories?: Repositories, aiProvider: AIProvider = new MockAIProvider()): RuntimeServices {
  if (config.persistenceMode === 'lark' && !repositories && config.lark) {
    return { config, repositories: new LarkRepositories(new LarkOpenApiClient(config.lark), config.lark), aiProvider };
  }
  localRepositories ??= new InMemoryRepositories();
  return { config, repositories: repositories ?? localRepositories, aiProvider };
}
