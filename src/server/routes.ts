import { assessmentForClient, saveAssessment } from './assessment';
import { generateValidatedReport } from './ai';
import type { AssessmentRecord } from './contracts';
import { createOAuthState, createSessionCookie, currentIdentity, identityProviderFor, readSession, verifyOAuthState } from './identity';
import { HttpError, json, readJsonObject, requireMethod } from './http';
import { currentPresenterPayload } from './presenter';
import { createRuntime, type RuntimeServices } from './runtime';

function ownAssessment(assessment: AssessmentRecord | null, participantId: string): AssessmentRecord {
  if (!assessment || assessment.participantId !== participantId) throw new HttpError(404, 'assessment_not_found', '找不到這份測驗結果。');
  return assessment;
}

export function createRouteHandlers(services: RuntimeServices = createRuntime()) {
  return {
    health: async (request: Request) => {
      requireMethod(request, 'GET');
      return json({ ok: true, service: 'talent-motivation', runtime: services.config.persistenceMode === 'memory' ? 'mock' : 'configured' });
    },
    session: async (request: Request) => {
      requireMethod(request, 'GET');
      const identity = readSession(request, services.config);
      if (identity) return json({ authenticated: true, identity });
      if (services.config.identityMode === 'mock') return json({ authenticated: true, identity: currentIdentity(request, services.config), mock: true });
      return json({ authenticated: false });
    },
    lineStart: async (request: Request) => {
      requireMethod(request, 'GET');
      const { state, cookie } = createOAuthState(services.config);
      const provider = identityProviderFor(services.config);
      const authorizationUrl = provider.authorizationUrl(state);
      return new Response(null, { status: 302, headers: { location: authorizationUrl.toString(), 'set-cookie': cookie, 'cache-control': 'no-store' } });
    },
    lineCallback: async (request: Request) => {
      requireMethod(request, 'GET');
      const url = new URL(request.url);
      verifyOAuthState(request, url.searchParams.get('state'), services.config);
      const code = url.searchParams.get('code');
      if (!code) throw new HttpError(400, 'missing_authorization_code', '缺少 LINE authorization code。');
      const identity = await identityProviderFor(services.config).exchangeCode(code);
      await services.repositories.participants.upsertIdentity(identity);
      return new Response(null, {
        status: 302,
        headers: {
          location: new URL('/', services.config.appBaseUrl).toString(),
          'set-cookie': createSessionCookie(identity, services.config),
          'cache-control': 'no-store',
        },
      });
    },
    createAssessment: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const { assessment } = await saveAssessment(await readJsonObject(request), identity, services.repositories);
      return json({ assessment: assessmentForClient(assessment) }, 201);
    },
    latestAssessment: async (request: Request) => {
      requireMethod(request, 'GET');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const assessment = await services.repositories.assessments.findLatestForParticipant(participant.participantId);
      return json({ assessment: assessment ? assessmentForClient(assessment) : null });
    },
    generateReport: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const payload = await readJsonObject(request);
      if (typeof payload.assessmentId !== 'string') throw new HttpError(400, 'invalid_payload', '請提供 assessmentId。');
      const assessment = ownAssessment(await services.repositories.assessments.findById(payload.assessmentId), participant.participantId);
      const existing = await services.repositories.reports.findByAssessmentId(assessment.assessmentId);
      if (existing) return json({ report: existing, cached: true });
      const report = await generateValidatedReport(assessment, services.aiProvider);
      await services.repositories.reports.save(report);
      return json({ report }, 201);
    },
    report: async (request: Request, assessmentId: string) => {
      requireMethod(request, 'GET');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      ownAssessment(await services.repositories.assessments.findById(assessmentId), participant.participantId);
      const report = await services.repositories.reports.findByAssessmentId(assessmentId);
      if (!report) throw new HttpError(404, 'report_not_found', '尚未產生 AI 報告。');
      return json({ report });
    },
    presenterCurrent: async (request: Request) => {
      requireMethod(request, 'GET');
      const eventId = new URL(request.url).searchParams.get('eventId');
      if (!eventId) throw new HttpError(400, 'missing_event_id', '請提供 eventId。');
      return json({ presenter: await currentPresenterPayload(eventId, services.repositories) });
    },
    lineWebhook: async (request: Request) => {
      requireMethod(request, 'POST');
      // Reserved deliberately: signature verification cannot be enabled before a
      // real Messaging API secret is supplied in server configuration.
      throw new HttpError(501, 'webhook_not_configured', 'LINE webhook 尚未設定。');
    },
  };
}
