import { HttpError } from './http';

type Environment = Record<string, string | undefined>;
type RuntimeMode = 'mock' | 'preview' | 'live';

export interface RuntimeConfig {
  deployment: 'production' | 'preview' | 'development';
  isProduction: boolean;
  isMockMode: boolean;
  appBaseUrl: string;
  sessionSecret: string;
  identityMode: 'mock' | 'line';
  persistenceMode: 'memory' | 'lark';
  aiMode: 'mock' | 'real';
  line?: { channelId: string; channelSecret: string };
  lark?: {
    appId: string;
    appSecret: string;
    baseAppToken: string;
    participantsTableId: string;
    assessmentsTableId: string;
    aiReportsTableId: string;
    eventsTableId: string;
  };
  ai?: { provider: string; apiKey: string; model: string };
}

export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

function required(environment: Environment, names: string[]): string[] {
  return names.filter((name) => !environment[name]);
}

function readGroup<T extends Record<string, string>>(environment: Environment, mapping: Record<keyof T, string>): T | undefined {
  const names = Object.values(mapping);
  const present = names.filter((name) => Boolean(environment[name]));
  if (present.length === 0) return undefined;
  const missing = required(environment, names);
  if (missing.length) throw new EnvironmentError(`Incomplete runtime configuration: ${missing.join(', ')}`);

  return Object.fromEntries(
    Object.entries(mapping).map(([key, name]) => [key, environment[name] as string]),
  ) as T;
}

/**
 * This module is imported only by Vercel Functions. It intentionally never
 * reads `VITE_*` secrets or passes a configuration object to browser code.
 *
 * APP_RUNTIME_MODE values:
 * - mock: mock identity + process-local memory + mock AI (local/CI only)
 * - preview: mock identity + Lark persistence + mock AI (Vercel Preview QA)
 * - live: LINE identity + Lark persistence + real Gemini AI
 */
export function loadRuntimeConfig(environment: Environment = process.env): RuntimeConfig {
  const deployment = environment.VERCEL_ENV === 'production'
    ? 'production'
    : environment.VERCEL_ENV === 'preview'
      ? 'preview'
      : 'development';
  const isProduction = deployment === 'production';
  const runtimeMode = environment.APP_RUNTIME_MODE as RuntimeMode | undefined;
  if (runtimeMode !== undefined && runtimeMode !== 'mock' && runtimeMode !== 'preview' && runtimeMode !== 'live') {
    throw new EnvironmentError('APP_RUNTIME_MODE must be mock, preview, or live.');
  }
  if (isProduction && runtimeMode === 'mock') {
    throw new EnvironmentError('Production deployment cannot use mock runtime mode.');
  }
  if (isProduction && runtimeMode === 'preview') {
    throw new EnvironmentError('Production deployment can only use live runtime mode.');
  }
  const sessionSecret = environment.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    throw new EnvironmentError('SESSION_SECRET is required in production.');
  }

  const line = readGroup<{ channelId: string; channelSecret: string }>(environment, {
    channelId: 'LINE_LOGIN_CHANNEL_ID',
    channelSecret: 'LINE_LOGIN_CHANNEL_SECRET',
  });
  const lark = readGroup<RuntimeConfig['lark'] & Record<string, string>>(environment, {
    appId: 'LARK_APP_ID',
    appSecret: 'LARK_APP_SECRET',
    baseAppToken: 'LARK_BASE_APP_TOKEN',
    participantsTableId: 'LARK_PARTICIPANTS_TABLE_ID',
    assessmentsTableId: 'LARK_ASSESSMENTS_TABLE_ID',
    aiReportsTableId: 'LARK_AI_REPORTS_TABLE_ID',
    eventsTableId: 'LARK_EVENTS_TABLE_ID',
  });
  const requestedProvider = environment.LLM_PROVIDER;
  const ai = requestedProvider && requestedProvider !== 'mock'
    ? readGroup<{ provider: string; apiKey: string; model: string }>(environment, {
        provider: 'LLM_PROVIDER',
        apiKey: 'LLM_API_KEY',
        model: 'LLM_MODEL',
      })
    : undefined;

  if (ai && ai.provider !== 'gemini') {
    throw new EnvironmentError('Only LLM_PROVIDER=gemini is supported by this runtime.');
  }

  const defaultDevelopmentMock = deployment === 'development' && !line && !lark && !ai;
  const isMemoryMock = runtimeMode === 'mock' || defaultDevelopmentMock;
  const isPersistentPreview = runtimeMode === 'preview';
  const isMockMode = isMemoryMock;

  if (isPersistentPreview && !lark) {
    throw new EnvironmentError('APP_RUNTIME_MODE=preview requires complete Lark configuration for shared persistence.');
  }
  if (deployment === 'preview' && !isMemoryMock && !isPersistentPreview && (!line || !lark || !ai || !sessionSecret)) {
    throw new EnvironmentError('Preview requires APP_RUNTIME_MODE=mock, APP_RUNTIME_MODE=preview with Lark, or complete live runtime configuration.');
  }
  if (isProduction && (!line || !lark || !ai || !sessionSecret || !environment.APP_BASE_URL)) {
    throw new EnvironmentError('Production requires complete LINE, Lark, Gemini, session, and APP_BASE_URL configuration.');
  }
  if (!isMemoryMock && !isPersistentPreview && !sessionSecret) {
    throw new EnvironmentError('SESSION_SECRET is required for live runtime mode.');
  }

  const identityMode: RuntimeConfig['identityMode'] = isMemoryMock || isPersistentPreview ? 'mock' : 'line';
  const persistenceMode: RuntimeConfig['persistenceMode'] = isPersistentPreview || !isMemoryMock ? 'lark' : 'memory';
  const aiMode: RuntimeConfig['aiMode'] = isMemoryMock || isPersistentPreview ? 'mock' : 'real';

  return {
    deployment,
    isProduction,
    isMockMode,
    appBaseUrl: environment.APP_BASE_URL ?? 'http://localhost:5173',
    // This fallback can only create mock sessions. Production remains fail-closed.
    sessionSecret: sessionSecret ?? 'local-mock-session-not-for-production',
    identityMode,
    persistenceMode,
    aiMode,
    line: identityMode === 'line' ? line : undefined,
    lark: persistenceMode === 'lark' ? lark : undefined,
    ai: aiMode === 'real' ? ai : undefined,
  };
}

export function requireConfigured<T>(value: T | undefined, feature: string): T {
  if (!value) throw new HttpError(503, 'configuration_required', `${feature} 尚未完成安全設定。`);
  return value;
}
