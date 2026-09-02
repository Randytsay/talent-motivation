import { HttpError } from './http';

type Environment = Record<string, string | undefined>;

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
 */
export function loadRuntimeConfig(environment: Environment = process.env): RuntimeConfig {
  const deployment = environment.VERCEL_ENV === 'production'
    ? 'production'
    : environment.VERCEL_ENV === 'preview'
      ? 'preview'
      : 'development';
  const isProduction = deployment === 'production';
  const runtimeMode = environment.APP_RUNTIME_MODE;
  if (runtimeMode !== undefined && runtimeMode !== 'mock' && runtimeMode !== 'live') {
    throw new EnvironmentError('APP_RUNTIME_MODE must be either mock or live.');
  }
  if (isProduction && runtimeMode === 'mock') {
    throw new EnvironmentError('Production deployment cannot use mock runtime mode.');
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
  const isMockMode = runtimeMode === 'mock' || defaultDevelopmentMock;
  if (deployment === 'preview' && !isMockMode && (!line || !lark || !ai || !sessionSecret)) {
    throw new EnvironmentError('Preview requires APP_RUNTIME_MODE=mock or complete live runtime configuration.');
  }
  if (isProduction && (!line || !lark || !ai || !sessionSecret || !environment.APP_BASE_URL)) {
    throw new EnvironmentError('Production requires complete LINE, Lark, Gemini, session, and APP_BASE_URL configuration.');
  }
  if (!isMockMode && !sessionSecret) {
    throw new EnvironmentError('SESSION_SECRET is required for live runtime mode.');
  }

  return {
    deployment,
    isProduction,
    isMockMode,
    appBaseUrl: environment.APP_BASE_URL ?? 'http://localhost:5173',
    // The local fallback can only create mock sessions. Production is always fail-closed.
    sessionSecret: sessionSecret ?? 'local-mock-session-not-for-production',
    identityMode: isMockMode ? 'mock' : 'line',
    persistenceMode: isMockMode ? 'memory' : 'lark',
    aiMode: isMockMode ? 'mock' : 'real',
    line: isMockMode ? undefined : line,
    lark: isMockMode ? undefined : lark,
    ai: isMockMode ? undefined : ai,
  };
}

export function requireConfigured<T>(value: T | undefined, feature: string): T {
  if (!value) throw new HttpError(503, 'configuration_required', `${feature} 尚未完成安全設定。`);
  return value;
}
