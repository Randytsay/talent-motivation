import { describe, expect, it, vi } from 'vitest';
import { MockAIProvider } from './ai';
import { saveAssessment } from './assessment';
import { loadRuntimeConfig } from './env';
import { HttpError } from './http';
import { createSessionCookie } from './identity';
import { InMemoryRepositories } from './repositories';
import { createRouteHandlers } from './routes';
import { createRuntime } from './runtime';

const facilitator = { lineUserId: 'facilitator', displayName: 'Facilitator' };
const owner = { lineUserId: 'owner', displayName: 'Owner' };
const input = {
  birthDate: '1978-11-05', lifePathResonance: 'high', lifePathTopResonance: '探索',
  riasecAnswers: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${String(i + 1).padStart(2, '0')}`, 4])),
  subjectiveDriver: 'I', talentUsage: 60, priorities: ['更多時間自主'], explorationInterest: '很想',
};
const config = loadRuntimeConfig({ NODE_ENV: 'test', APP_RUNTIME_MODE: 'mock' });
function request(path: string, identity = facilitator, payload?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { cookie: createSessionCookie(identity, config) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

describe('report and guest lifecycle regression', () => {
  it('recovers a failed report without altering history and returns a cached report on subsequent retries', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(input, facilitator, repositories);
    const mock = new MockAIProvider();
    const generate = vi.fn().mockRejectedValueOnce(new HttpError(502, 'ai_invalid_schema', 'invalid report'))
      .mockImplementation(() => mock.generate(assessment));
    const routes = createRouteHandlers(createRuntime(config, repositories, { generate }));
    const retry = () => routes.generateReport(request('/api/reports/generate', facilitator, { assessmentId: assessment.assessmentId }));
    await expect(retry()).rejects.toMatchObject({ code: 'ai_invalid_schema' });
    expect(await repositories.reports.findByAssessmentId(assessment.assessmentId)).toBeNull();
    expect((await retry()).status).toBe(201);
    expect(await (await retry()).json()).toMatchObject({ cached: true });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await repositories.assessments.listForSubject(assessment.subjectId!)).toHaveLength(1);
  });

  it('retains both guest assessments after claiming and revokes facilitator report access', async () => {
    const repositories = new InMemoryRepositories();
    const first = await saveAssessment({ ...input, assessmentMode: 'co_present' }, facilitator, repositories);
    const second = await saveAssessment({ ...input, subjectId: first.assessment.subjectId }, facilitator, repositories);
    const routes = createRouteHandlers(createRuntime(config, repositories));
    const claim = await (await routes.createClaim(request('/api/claims', facilitator, { subjectId: first.assessment.subjectId }))).json();
    const token = claim.claim.token;
    const preview = await (await routes.claimPreview(request(`/api/claims/preview?token=${token}`, owner))).json();
    expect(Object.keys(preview.preview).sort()).toEqual(['completedAt', 'displayLabel', 'expiresAt', 'lifePath', 'top3Code']);
    await routes.redeemClaim(request('/api/claims/redeem', owner, { token }));
    await expect(routes.redeemClaim(request('/api/claims/redeem', facilitator, { token }))).rejects.toMatchObject({ status: 410 });
    for (const assessment of [first.assessment, second.assessment]) {
      await expect(routes.generateReport(request('/api/reports/generate', facilitator, { assessmentId: assessment.assessmentId }))).rejects.toMatchObject({ status: 404 });
      expect((await routes.generateReport(request('/api/reports/generate', owner, { assessmentId: assessment.assessmentId }))).status).toBe(201);
      await expect(routes.report(request(`/api/reports/${assessment.assessmentId}`), assessment.assessmentId)).rejects.toMatchObject({ status: 404 });
    }
    const history = await (await routes.subjectAssessments(request('/api/subjects/history', owner), first.assessment.subjectId!)).json();
    expect(history.assessments).toHaveLength(2);
    expect(JSON.stringify(history)).not.toContain('birthDate');
    expect(JSON.stringify(history)).not.toContain('riasecAnswers');
  });

  it('exposes only the documented public-share fields', async () => {
    const repositories = new InMemoryRepositories();
    const { assessment } = await saveAssessment(input, facilitator, repositories);
    const routes = createRouteHandlers(createRuntime(config, repositories));
    await routes.generateReport(request('/api/reports/generate', facilitator, { assessmentId: assessment.assessmentId }));
    const { share } = await (await routes.publicShare(new Request('https://example.test/api/share/result'), assessment.assessmentId)).json();
    expect(Object.keys(share).sort()).toEqual(['landingUrl', 'lifePath', 'repeatedSignals', 'summary', 'top3', 'top3Code']);
    expect(JSON.stringify(share)).not.toMatch(/1978-11-05|lineUserId|riasecAnswers|claimToken/);
  });
});
