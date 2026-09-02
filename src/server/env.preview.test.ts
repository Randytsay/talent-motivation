import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './env';

const larkEnv = {
  LARK_APP_ID: 'lark-app',
  LARK_APP_SECRET: 'lark-secret',
  LARK_BASE_APP_TOKEN: 'base',
  LARK_PARTICIPANTS_TABLE_ID: 'participants',
  LARK_ASSESSMENTS_TABLE_ID: 'assessments',
  LARK_AI_REPORTS_TABLE_ID: 'reports',
  LARK_EVENTS_TABLE_ID: 'events',
};

describe('persistent preview runtime mode', () => {
  it('uses mock identity and AI with Lark persistence on Vercel Preview', () => {
    const config = loadRuntimeConfig({
      VERCEL_ENV: 'preview',
      APP_RUNTIME_MODE: 'preview',
      ...larkEnv,
    });

    expect(config.deployment).toBe('preview');
    expect(config.identityMode).toBe('mock');
    expect(config.persistenceMode).toBe('lark');
    expect(config.aiMode).toBe('mock');
    expect(config.line).toBeUndefined();
    expect(config.ai).toBeUndefined();
    expect(config.lark).toMatchObject({ appId: 'lark-app', baseAppToken: 'base' });
  });

  it('fails closed when persistent preview mode has no complete Lark configuration', () => {
    expect(() => loadRuntimeConfig({
      VERCEL_ENV: 'preview',
      APP_RUNTIME_MODE: 'preview',
    })).toThrow('requires complete Lark configuration');
  });

  it('does not allow preview mode in production', () => {
    expect(() => loadRuntimeConfig({
      VERCEL_ENV: 'production',
      APP_RUNTIME_MODE: 'preview',
      SESSION_SECRET: 'secret',
      ...larkEnv,
    })).toThrow('can only use live runtime mode');
  });
});
