import { describe, expect, it } from 'vitest';
import { saveAssessment } from './assessment';
import type { Identity } from './contracts';
import { loadRuntimeConfig } from './env';
import { InMemoryRepositories } from './repositories';
import { createRuntime } from './runtime';
import { ProductionMiniMaxAIProvider, ProductionVertexAIProvider } from './productionAI';
import { generateValidatedReport } from './ai';

const identity: Identity = { lineUserId: 'mock-line-user-001', displayName: 'Mock LINE User' };
const answers = Object.fromEntries(Array.from({ length: 18 }, (_, index) => [`q${String(index + 1).padStart(2, '0')}`, 4]));

function payload(): Record<string, unknown> {
  return {
    birthDate: '1978-11-05',
    lifePathResonance: 'high',
    lifePathTopResonance: '我需要有空間探索新的可能。',
    riasecAnswers: answers,
    subjectiveDriver: 'I',
    talentUsage: 60,
    priorities: ['更多時間自主'],
    explorationInterest: '很想',
  };
}

const validReport = {
  repeated_signals: ['結果中反覆出現的投入線索值得留意。'],
  birth_profile_summary: '出生結構可作為自我觀察線索。',
  motivator_summary: '這可能反映你重視理解與探索。',
  possible_tensions: ['不同線索可以一起觀察。'],
  unused_potential: '可以從小任務觀察尚未充分使用的能力。',
  exploration_directions: ['先從現職調整一個小任務開始。'],
  reflection_question: '哪個情境最讓你有精神？',
  summary: '這是一份探索摘要，不是人格定論。',
};

function liveBase() {
  return {
    NODE_ENV: 'test', APP_RUNTIME_MODE: 'live', SESSION_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173',
    LINE_LOGIN_CHANNEL_ID: 'line-channel', LINE_LOGIN_CHANNEL_SECRET: 'line-secret',
    LARK_APP_ID: 'lark-app', LARK_APP_SECRET: 'lark-secret', LARK_BASE_APP_TOKEN: 'base',
    LARK_PARTICIPANTS_TABLE_ID: 'participants', LARK_ASSESSMENTS_TABLE_ID: 'assessments', LARK_AI_REPORTS_TABLE_ID: 'reports', LARK_EVENTS_TABLE_ID: 'events',
  };
}

describe('selectable live AI providers', () => {
  it('loads Vertex AI configuration without requiring a Gemini API key', () => {
    const config = loadRuntimeConfig({
      ...liveBase(),
      LLM_PROVIDER: 'vertex',
      LLM_MODEL: 'gemini-3.7-flash',
      VERTEX_PROJECT_ID: 'trial-project',
      VERTEX_LOCATION: 'global',
      VERTEX_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'vertex@example.test', private_key: 'unused-in-test' }),
    });
    expect(config.ai).toMatchObject({ provider: 'vertex', projectId: 'trial-project', location: 'global', model: 'gemini-3.7-flash' });
    expect(createRuntime(config, new InMemoryRepositories()).aiProvider).toBeInstanceOf(ProductionVertexAIProvider);
  });

  it('uses Vertex project auth, responseSchema, and server-side facts only', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    let requestUrl = '';
    let requestBody = '';
    const credentials = {
      client_email: 'vertex@example.test',
      private_key: `-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEII7qHsTsNZdFfODNH/eUy1RwTuiczuCFFb8Uzs9W+IMU\n-----END PRIVATE KEY-----`,
    };
    const provider = new ProductionVertexAIProvider({
      projectId: 'trial-project', location: 'global', serviceAccountJson: JSON.stringify(credentials), model: 'gemini-3.7-flash',
    }, async (input, init) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'vertex-access-token', expires_in: 3600 }), { status: 200 });
      }
      requestUrl = url;
      requestBody = String(init?.body);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer vertex-access-token');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validReport) }] } }] }), { status: 200 });
    });

    await expect(generateValidatedReport(assessment, provider)).resolves.toMatchObject({ modelName: 'vertex:gemini-3.7-flash' });
    expect(requestUrl).toContain('/projects/trial-project/locations/global/publishers/google/models/gemini-3.7-flash:generateContent');
    expect(requestBody).toContain('responseSchema');
    expect(requestBody).not.toContain('responseJsonSchema');
    expect(requestBody).not.toContain('1978-11-05');
    expect(requestBody).not.toContain('riasecAnswers');
  });

  it('loads MiniMax CN Token Plan configuration and creates its production provider', () => {
    const config = loadRuntimeConfig({
      ...liveBase(), LLM_PROVIDER: 'minimax', LLM_MODEL: 'MiniMax-M3', MINIMAX_API_KEY: 'sk-cp-test', MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1',
    });
    expect(config.ai).toEqual({ provider: 'minimax', apiKey: 'sk-cp-test', model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1' });
    expect(createRuntime(config, new InMemoryRepositories()).aiProvider).toBeInstanceOf(ProductionMiniMaxAIProvider);
  });

  it('uses MiniMax M3 CN v2 endpoint and keeps private raw facts out of the request', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    let requestBody = '';
    const provider = new ProductionMiniMaxAIProvider({ apiKey: 'sk-cp-test', model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1' }, async (input, init) => {
      expect(String(input)).toBe('https://api.minimaxi.com/v1/text/chatcompletion_v2');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-cp-test');
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validReport) } }], base_resp: { status_code: 0 } }), { status: 200 });
    });

    const report = await generateValidatedReport(assessment, provider);
    expect(report.modelName).toBe('minimax:MiniMax-M3');
    expect(report.summary).toBe(validReport.summary);
    expect(requestBody).not.toContain('1978-11-05');
    expect(requestBody).not.toContain('riasecAnswers');
  });

  it('fails closed when the selected provider configuration is incomplete', () => {
    expect(() => loadRuntimeConfig({ ...liveBase(), LLM_PROVIDER: 'vertex', LLM_MODEL: 'gemini-3.7-flash' })).toThrow('VERTEX_PROJECT_ID');
    expect(() => loadRuntimeConfig({ ...liveBase(), LLM_PROVIDER: 'minimax', LLM_MODEL: 'MiniMax-M3' })).toThrow('MINIMAX_API_KEY');
    expect(() => loadRuntimeConfig({ ...liveBase(), LLM_PROVIDER: 'unknown', LLM_MODEL: 'x' })).toThrow('LLM_PROVIDER');
  });
});
