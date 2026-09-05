import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { VertexAIProvider, generateValidatedReport } from './ai';
import { ProductionMiniMaxAIProvider, ProductionVertexAIProvider } from './productionAI';
import { saveAssessment } from './assessment';
import type { Identity } from './contracts';
import { loadRuntimeConfig } from './env';
import { InMemoryRepositories } from './repositories';
import { createRuntime } from './runtime';

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
  motivator_summary: '這可能反映你重視理解與探索。',
  possible_tensions: ['不同線索可以一起觀察。'],
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

  it('keeps the legacy Vertex adapter contract and private-fact boundary covered', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    let requestUrl = '';
    let requestBody = '';
    const provider = new VertexAIProvider({
      projectId: 'trial-project',
      location: 'global',
      serviceAccountJson: '{}',
      model: 'gemini-3.7-flash',
    }, async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer vertex-access-token');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validReport) }] } }] }));
    }, async () => 'vertex-access-token');

    const report = await generateValidatedReport(assessment, provider);
    expect(report.modelName).toBe('vertex:gemini-3.7-flash');
    expect(requestUrl).toContain('/projects/trial-project/locations/global/publishers/google/models/gemini-3.7-flash:generateContent');
    expect(requestBody).not.toContain('1978-11-05');
    expect(requestBody).not.toContain('riasecAnswers');
  });

  it('loads MiniMax CN Token Plan configuration and creates its production provider', () => {
    const config = loadRuntimeConfig({
      ...liveBase(),
      LLM_PROVIDER: 'minimax',
      LLM_MODEL: 'MiniMax-M3',
      MINIMAX_API_KEY: 'sk-cp-test',
      MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1',
    });
    expect(config.ai).toEqual({
      provider: 'minimax', apiKey: 'sk-cp-test', model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1',
    });
    expect(createRuntime(config, new InMemoryRepositories()).aiProvider).toBeInstanceOf(ProductionMiniMaxAIProvider);
  });

  it('uses the current MiniMax M3 OpenAI-compatible CN endpoint and keeps private raw facts out of the request', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    let requestBody = '';
    const provider = new ProductionMiniMaxAIProvider({
      apiKey: 'sk-cp-test',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/v1',
    }, async (input, init) => {
      expect(String(input)).toBe('https://api.minimaxi.com/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-cp-test');
      requestBody = String(init?.body);
      const parsedBody = JSON.parse(requestBody) as Record<string, unknown>;
      const system = (parsedBody.messages as Array<{ content: string }>)[0].content;
      for (const key of ['repeated_signals', 'birth_profile_summary', 'motivator_summary', 'possible_tensions', 'unused_potential', 'exploration_directions', 'reflection_question', 'summary']) {
        expect(system).toContain(`"${key}"`);
      }
      expect(system).toContain('"additionalProperties":false');
      expect(parsedBody.thinking).toEqual({ type: 'disabled' });
      expect(parsedBody.reasoning_split).toBe(true);
      expect(parsedBody.max_completion_tokens).toBe(4096);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validReport) } }],
        base_resp: { status_code: 0 },
      }));
    });

    const report = await generateValidatedReport(assessment, provider);
    expect(report.modelName).toBe('minimax:MiniMax-M3');
    expect(report.summary).toBe(validReport.summary);
    expect(requestBody).not.toContain('1978-11-05');
    expect(requestBody).not.toContain('riasecAnswers');
  });

  it('fails closed when the selected provider configuration is incomplete', () => {
    expect(() => loadRuntimeConfig({
      ...liveBase(), LLM_PROVIDER: 'vertex', LLM_MODEL: 'gemini-3.7-flash',
    })).toThrow('VERTEX_PROJECT_ID');
    expect(() => loadRuntimeConfig({
      ...liveBase(), LLM_PROVIDER: 'minimax', LLM_MODEL: 'MiniMax-M3',
    })).toThrow('MINIMAX_API_KEY');
    expect(() => loadRuntimeConfig({
      ...liveBase(), LLM_PROVIDER: 'unknown', LLM_MODEL: 'x',
    })).toThrow('LLM_PROVIDER');
  });
});


describe('production report failure diagnostics', () => {
  it('exercises the actual Vertex OAuth and report request with a signed assertion', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { assessment } = await saveAssessment(payload(), identity, new InMemoryRepositories());
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === 'https://oauth2.googleapis.com/token') {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        expect(form.get('assertion')?.split('.')).toHaveLength(3);
        return Response.json({ access_token: 'test-token', expires_in: 3600 });
      }
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token');
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.responseSchema.required).toHaveLength(8);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
      return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'SENSITIVE-THOUGHT' }, { text: JSON.stringify(validReport) }] } }] });
    });
    const provider = new ProductionVertexAIProvider({ projectId: 'test-project', location: 'global', model: 'gemini-3.7-flash',
      serviceAccountJson: JSON.stringify({ client_email: 'test@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    }, fetcher);
    await expect(provider.generate(assessment)).resolves.toMatchObject(validReport);
    await provider.generate(assessment);
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(validReport) }] } }] }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(provider.generate(assessment)).rejects.toMatchObject({ code: 'vertex_output_truncated' });
      expect(JSON.stringify(log.mock.calls)).not.toContain('SENSITIVE-THOUGHT');
    } finally { log.mockRestore(); }
  });

  it.each([
    ['wrong fields', { choices: [{ message: { content: '{"private-note":"SENSITIVE-CONTENT"}' } }] }, 'ai_invalid_schema'],
    ['malformed JSON', { choices: [{ message: { content: 'SENSITIVE-CONTENT' } }] }, 'minimax_invalid_response'],
    ['truncated JSON', { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(validReport) } }] }, 'minimax_output_truncated'],
    ['reasoning only', { choices: [{ message: { reasoning_content: 'SENSITIVE-CONTENT' } }] }, 'minimax_invalid_response'],
  ])('rejects %s and records only safe diagnostics', async (_name, body, code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { assessment } = await saveAssessment(payload(), identity, new InMemoryRepositories());
      const provider = new ProductionMiniMaxAIProvider({ apiKey: 'secret-key', model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1' }, async () => Response.json(body));
      await expect(provider.generate(assessment)).rejects.toMatchObject({ code });
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/SENSITIVE-CONTENT|secret-key|1978-11-05/);
    } finally { log.mockRestore(); }
  });
});
