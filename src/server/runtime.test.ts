import { describe, expect, it } from 'vitest';
import { GeminiAIProvider, generateValidatedReport, MockAIProvider, validateAIReport } from './ai';
import { assessmentForClient, saveAssessment, validateAssessment } from './assessment';
import type { AssessmentRecord, Identity } from './contracts';
import { loadRuntimeConfig } from './env';
import { createOAuthState, createSessionCookie, currentIdentity, LineLiffIdentityVerifier, readSession, verifyOAuthState } from './identity';
import { LarkOpenApiClient } from './lark';
import { currentPresenterPayload } from './presenter';
import { InMemoryRepositories } from './repositories';
import { createRouteHandlers } from './routes';
import { createRuntime } from './runtime';
import healthFunction from '../../api/health';

const identity: Identity = { lineUserId: 'mock-line-user-001', displayName: 'Mock LINE User' };
const answers = Object.fromEntries(Array.from({ length: 18 }, (_, index) => [`q${String(index + 1).padStart(2, '0')}`, 4]));

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    birthDate: '1978-11-05',
    lifePathResonance: 'high',
    lifePathTopResonance: '我需要有空間探索新的可能。',
    riasecAnswers: answers,
    subjectiveDriver: 'I',
    talentUsage: 60,
    priorities: ['更多時間自主'],
    explorationInterest: '很想',
    ...overrides,
  };
}

function testConfig() {
  return loadRuntimeConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173' });
}

function liveConfig() {
  return loadRuntimeConfig({
    NODE_ENV: 'test', APP_RUNTIME_MODE: 'live', SESSION_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173',
    LINE_LOGIN_CHANNEL_ID: 'line-channel', LINE_LOGIN_CHANNEL_SECRET: 'line-secret',
    LARK_APP_ID: 'lark-app', LARK_APP_SECRET: 'lark-secret', LARK_BASE_APP_TOKEN: 'base',
    LARK_PARTICIPANTS_TABLE_ID: 'participants', LARK_ASSESSMENTS_TABLE_ID: 'assessments', LARK_AI_REPORTS_TABLE_ID: 'reports', LARK_EVENTS_TABLE_ID: 'events',
    LLM_PROVIDER: 'gemini', LLM_API_KEY: 'gemini-key', LLM_MODEL: 'gemini-test-model',
  });
}

describe('P1 server runtime', () => {
  it('exports Vercel Web Standard fetch handlers', async () => {
    expect(healthFunction).toHaveProperty('fetch');
    const response = await healthFunction.fetch(new Request('http://localhost/api/health'));
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'talent-motivation' });
  });

  it('fails closed when production session configuration is missing', () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toThrow('SESSION_SECRET');
    expect(() => loadRuntimeConfig({ VERCEL_ENV: 'production', APP_RUNTIME_MODE: 'mock' })).toThrow('cannot use mock');
    expect(() => loadRuntimeConfig({ VERCEL_ENV: 'preview' })).toThrow('APP_RUNTIME_MODE=mock');
    expect(loadRuntimeConfig({ VERCEL_ENV: 'preview', APP_RUNTIME_MODE: 'mock' }).isMockMode).toBe(true);
    expect(() => loadRuntimeConfig({ NODE_ENV: 'test', LINE_LOGIN_CHANNEL_ID: 'only-one' })).toThrow('Incomplete runtime configuration');
  });

  it('signs, parses, and rejects tampered session cookies', () => {
    const config = testConfig();
    const cookie = createSessionCookie(identity, config);
    const request = new Request('http://localhost/api/auth/session', { headers: { cookie } });
    expect(readSession(request, config)).toMatchObject(identity);
    const tampered = new Request('http://localhost/api/auth/session', { headers: { cookie: `${cookie.split(';')[0]}x` } });
    expect(readSession(tampered, config)).toBeNull();
  });

  it('accepts matching OAuth state and rejects mismatch', () => {
    const config = testConfig();
    const { state, cookie } = createOAuthState(config);
    const request = new Request(`http://localhost/api/auth/line/callback?state=${encodeURIComponent(state)}`, { headers: { cookie } });
    expect(() => verifyOAuthState(request, state, config)).not.toThrow();
    expect(() => verifyOAuthState(request, 'wrong-state', config)).toThrow('LINE 登入狀態驗證失敗');
  });

  it('uses one deterministic mock LINE identity without a session', () => {
    const mock = currentIdentity(new Request('http://localhost'), testConfig());
    expect(mock).toEqual(identity);
  });

  it('verifies a LIFF ID token server-side and maps only its LINE sub to identity', async () => {
    const verifier = new LineLiffIdentityVerifier(liveConfig().line!, async (_url, init) => {
      expect(String(init?.body)).toContain('client_id=line-channel');
      return new Response(JSON.stringify({
        iss: 'https://access.line.me', aud: 'line-channel', sub: 'verified-line-user', exp: Math.floor(Date.now() / 1000) + 60,
        name: 'Verified User', picture: 'https://example.test/profile.png',
      }));
    });
    await expect(verifier.verifyIdToken('untrusted-browser-token')).resolves.toEqual({
      lineUserId: 'verified-line-user', displayName: 'Verified User', pictureUrl: 'https://example.test/profile.png',
    });

    const wrongAudience = new LineLiffIdentityVerifier(liveConfig().line!, async () => new Response(JSON.stringify({
      iss: 'https://access.line.me', aud: 'another-channel', sub: 'wrong', exp: Math.floor(Date.now() / 1000) + 60,
    })));
    await expect(wrongAudience.verifyIdToken('token')).rejects.toMatchObject({ code: 'liff_token_invalid' });
  });

  it('completes mock OAuth callback and establishes a secure session cookie', async () => {
    const routes = createRouteHandlers(createRuntime(testConfig(), new InMemoryRepositories()));
    const start = await routes.lineStart(new Request('http://localhost/api/auth/line/start'));
    const location = start.headers.get('location');
    const cookie = start.headers.get('set-cookie');
    expect(start.status).toBe(302);
    expect(location).toContain('code=mock-authorized');
    expect(cookie).toContain('HttpOnly');
    const callback = await routes.lineCallback(new Request(location!, { headers: { cookie: cookie! } }));
    const session = new Request('http://localhost/api/auth/session', { headers: { cookie: callback.headers.get('set-cookie')! } });
    expect(readSession(session, testConfig())).toMatchObject(identity);
  });

  it('uses Lark OpenAPI token then writes a record with mocked fetch', async () => {
    const requests: string[] = [];
    const client = new LarkOpenApiClient({
      appId: 'app', appSecret: 'secret', baseAppToken: 'base', participantsTableId: 'p', assessmentsTableId: 'a', aiReportsTableId: 'r', eventsTableId: 'e',
    }, async (input) => {
      requests.push(String(input));
      return requests.length === 1
        ? new Response(JSON.stringify({ code: 0, tenant_access_token: 'tenant' }))
        : new Response(JSON.stringify({ code: 0, data: { record: { record_id: 'rec_1' } } }));
    });
    await expect(client.createRecord('table', { participant_id: 'p1' })).resolves.toEqual({ recordId: 'rec_1' });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('/tables/table/records');
  });

  it('returns a safe upstream error when Lark rejects a write', async () => {
    const client = new LarkOpenApiClient({
      appId: 'app', appSecret: 'secret', baseAppToken: 'base', participantsTableId: 'p', assessmentsTableId: 'a', aiReportsTableId: 'r', eventsTableId: 'e',
    }, async () => new Response(JSON.stringify({ code: 999, msg: 'not exposed' }), { status: 400 }));
    await expect(client.createRecord('table', {})).rejects.toMatchObject({ code: 'lark_auth_failed' });
  });

  it('validates facts server-side and rejects forged deterministic scores', () => {
    expect(validateAssessment(payload()).lifePath.value).toBe(5);
    expect(() => validateAssessment(payload({ lifePath: { value: 9 } }))).toThrow('Life Path 結果與伺服器計算不一致');
    expect(() => validateAssessment(payload({ riasecResult: { top3Code: 'EEE' } }))).toThrow('RIASEC 結果與伺服器計算不一致');
  });

  it('appends assessment history and moves the latest pointer for the same LINE identity', async () => {
    const repositories = new InMemoryRepositories(() => '2026-01-01T00:00:00.000Z');
    const first = await saveAssessment(payload(), identity, repositories);
    const second = await saveAssessment(payload({ talentUsage: 80 }), identity, repositories);
    const participant = await repositories.participants.findByLineUserId(identity.lineUserId);
    expect(first.assessment.assessmentId).not.toBe(second.assessment.assessmentId);
    expect(participant?.latestAssessmentId).toBe(second.assessment.assessmentId);
    expect(await repositories.assessments.findLatestForParticipant(participant!.participantId)).toMatchObject({ assessmentId: second.assessment.assessmentId });
    expect(assessmentForClient(first.assessment)).not.toHaveProperty('birthDate');
    expect(assessmentForClient(first.assessment)).not.toHaveProperty('riasecAnswers');
  });

  it('enforces the AI fixed JSON contract and content guardrails', async () => {
    expect(() => validateAIReport({ summary: 'missing' })).toThrow('固定格式');
    expect(() => validateAIReport({
      repeated_signals: ['你就是一個人'], motivator_summary: 'x', possible_tensions: ['x'], exploration_directions: ['x'], reflection_question: 'x', summary: 'x',
    })).toThrow('內容安全檢查');
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    await expect(generateValidatedReport(assessment, new MockAIProvider())).resolves.toMatchObject({ assessmentId: assessment.assessmentId, repeated_signals: expect.any(Array) });
  });

  it('uses Gemini only with server-side facts and validates its structured output', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(payload(), identity, repositories);
    let sentBody = '';
    const provider = new GeminiAIProvider({ apiKey: 'secret', model: 'gemini-test-model' }, async (_url, init) => {
      sentBody = String(init?.body);
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('secret');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        repeated_signals: ['結果中反覆出現的投入線索值得留意。'],
        motivator_summary: '這可能反映你重視理解與探索。',
        possible_tensions: ['不同線索可以一起觀察。'],
        exploration_directions: ['先從現職調整一個小任務開始。'],
        reflection_question: '哪個情境最讓你有精神？',
        summary: '這是一份探索摘要，不是人格定論。',
      }) }] } }] }));
    });
    const report = await generateValidatedReport(assessment, provider);
    expect(report.modelName).toBe('gemini:gemini-test-model');
    expect(sentBody).not.toContain('1978-11-05');
    expect(sentBody).not.toContain('riasecAnswers');
    expect(createRuntime(liveConfig(), repositories).aiProvider).toBeInstanceOf(GeminiAIProvider);
  });

  it('returns only allowlisted, consented Presenter fields', async () => {
    const repositories = new InMemoryRepositories();
    const noConsent = await saveAssessment(payload({ eventId: 'mock-event-001', presenterConsent: false }), identity, repositories);
    expect(await currentPresenterPayload('mock-event-001', repositories)).toBeNull();
    const consented = await saveAssessment(payload({ eventId: 'mock-event-001', presenterConsent: true }), identity, repositories);
    const report = await generateValidatedReport(consented.assessment, new MockAIProvider());
    await repositories.reports.save(report);
    const presenter = await currentPresenterPayload('mock-event-001', repositories);
    expect(presenter).toMatchObject({ displayName: 'Mock LINE User', talentUsage: 60 });
    expect(presenter).not.toHaveProperty('birthDate');
    expect(presenter).not.toHaveProperty('priorities');
    expect(noConsent.assessment.presenterConsent).toBe(false);
  });

  it('completes the mock API E2E and restores latest assessment after a simulated reload', async () => {
    const repositories = new InMemoryRepositories();
    const runtime = createRuntime(testConfig(), repositories);
    const routes = createRouteHandlers(runtime);
    const created = await routes.createAssessment(new Request('http://localhost/api/assessments', { method: 'POST', body: JSON.stringify(payload({ eventId: 'mock-event-001', presenterConsent: true })) }));
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { assessment: AssessmentRecord };
    const report = await routes.generateReport(new Request('http://localhost/api/reports/generate', { method: 'POST', body: JSON.stringify({ assessmentId: createdBody.assessment.assessmentId }) }));
    expect(report.status).toBe(201);
    const reloadedRoutes = createRouteHandlers(createRuntime(testConfig(), repositories));
    const latest = await reloadedRoutes.latestAssessment(new Request('http://localhost/api/assessments/latest'));
    const latestBody = await latest.json() as { assessment: AssessmentRecord };
    expect(latestBody.assessment.assessmentId).toBe(createdBody.assessment.assessmentId);
    expect(currentIdentity(new Request('http://localhost'), testConfig()).lineUserId).toBe(identity.lineUserId);
    const presenter = await reloadedRoutes.presenterCurrent(new Request('http://localhost/api/presenter/current?eventId=mock-event-001'));
    expect((await presenter.json() as { presenter: unknown }).presenter).not.toBeNull();
  });
});
