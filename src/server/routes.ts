import { assessmentForClient, saveAssessment } from './assessment';
import { generateValidatedReport } from './ai';
import type { AssessmentRecord } from './contracts';
import { clearOAuthStateCookie, clearPendingClaimCookie, createOAuthState, createPendingClaimCookie, createSessionCookie, currentIdentity, identityProviderFor, liffIdentityVerifierFor, readPendingClaim, readSession, verifyOAuthState } from './identity';
import { HttpError, json, readJsonObject, requireMethod } from './http';
import { currentPresenterPayload } from './presenter';
import { createRuntime, type RuntimeServices } from './runtime';
import { createClaimToken, hashClaimToken, isClaimExpired } from './claimToken';
import { canParticipantAccessSubject, subjectForClient, type SubjectRecord } from './subject';
import { assertValidBirthDate } from '../lib/scoring/lifePath';
import { randomUUID } from 'node:crypto';

async function ownAssessment(assessment: AssessmentRecord | null, participantId: string, services: RuntimeServices): Promise<AssessmentRecord> {
  if (!assessment) throw new HttpError(404, 'assessment_not_found', '找不到這份測驗結果。');
  if (assessment.subjectId) {
    const subject = await services.repositories.subjects.findById(assessment.subjectId);
    if (!subject || !canParticipantAccessSubject(subject, participantId)) throw new HttpError(404, 'assessment_not_found', '找不到這份測驗結果。');
  } else if (assessment.participantId !== participantId) {
    throw new HttpError(404, 'assessment_not_found', '找不到這份測驗結果。');
  }
  return assessment;
}

function subjectPayload(subject: SubjectRecord) {
  return subjectForClient(subject);
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
      const headers = new Headers({ location: authorizationUrl.toString(), 'set-cookie': cookie, 'cache-control': 'no-store' });
      const claimToken = new URL(request.url).searchParams.get('claimToken');
      if (claimToken) headers.append('set-cookie', createPendingClaimCookie(claimToken, services.config));
      return new Response(null, { status: 302, headers });
    },
    lineCallback: async (request: Request) => {
      requireMethod(request, 'GET');
      const url = new URL(request.url);
      verifyOAuthState(request, url.searchParams.get('state'), services.config);
      const code = url.searchParams.get('code');
      if (!code) throw new HttpError(400, 'missing_authorization_code', '缺少 LINE authorization code。');
      const identity = await identityProviderFor(services.config).exchangeCode(code);
      await services.repositories.participants.upsertIdentity(identity);
      const pendingClaim = readPendingClaim(request);
      const headers = new Headers({
        location: new URL(pendingClaim ? `/claim?token=${encodeURIComponent(pendingClaim)}` : '/', services.config.appBaseUrl).toString(),
        'cache-control': 'no-store',
      });
      headers.append('set-cookie', createSessionCookie(identity, services.config));
      headers.append('set-cookie', clearOAuthStateCookie(services.config));
      if (pendingClaim) headers.append('set-cookie', clearPendingClaimCookie(services.config));
      return new Response(null, { status: 302, headers });
    },
    liffAuthenticate: async (request: Request) => {
      requireMethod(request, 'POST');
      const payload = await readJsonObject(request);
      if (typeof payload.idToken !== 'string' || !payload.idToken.trim()) {
        throw new HttpError(400, 'invalid_liff_token', '缺少 LIFF ID token。');
      }
      const identity = await liffIdentityVerifierFor(services.config).verifyIdToken(payload.idToken);
      await services.repositories.participants.upsertIdentity(identity);
      return json({ authenticated: true, identity }, 200, { 'set-cookie': createSessionCookie(identity, services.config) });
    },
    createAssessment: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const { assessment } = await saveAssessment(await readJsonObject(request), identity, services.repositories);
      return json({ assessment: assessmentForClient(assessment) }, 201);
    },
    listSubjects: async (request: Request) => {
      requireMethod(request, 'GET');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const subjects = await services.repositories.subjects.listForParticipant(participant.participantId);
      return json({ subjects: subjects.map(subjectPayload) });
    },
    createSubject: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const payload = await readJsonObject(request);
      const kind = payload.subjectKind ?? payload.kind ?? 'self';
      if (kind !== 'self' && kind !== 'guest') throw new HttpError(400, 'invalid_subject', '探索對象類型無效。');
      if (typeof payload.birthDate !== 'string') throw new HttpError(400, 'invalid_subject', '請提供出生日期。');
      try { assertValidBirthDate(payload.birthDate); } catch { throw new HttpError(400, 'invalid_subject', '請提供有效的出生日期。'); }
      const displayLabel = typeof payload.displayLabel === 'string' && payload.displayLabel.trim()
        ? payload.displayLabel.trim().slice(0, 80) : kind === 'self' ? '我自己' : '另一位探索者';
      if (kind === 'self') {
        const existing = await services.repositories.subjects.findSelfForParticipant(participant.participantId);
        if (existing) {
          if (existing.birthDate !== payload.birthDate) throw new HttpError(409, 'subject_birth_date_mismatch', '你原本的出生日期不同；請選擇陪另一位探索或明確更正。');
          return json({ subject: subjectPayload(existing), reused: true });
        }
      }
      const now = new Date().toISOString();
      const subject: SubjectRecord = {
        subjectId: randomUUID(), ownerParticipantId: kind === 'self' ? participant.participantId : undefined,
        createdByParticipantId: participant.participantId, subjectKind: kind, displayLabel,
        birthDate: payload.birthDate, claimStatus: kind === 'self' ? 'not_applicable' : 'unclaimed',
        createdAt: now, updatedAt: now, archived: false,
      };
      await services.repositories.subjects.create(subject);
      return json({ subject: subjectPayload(subject) }, 201);
    },
    subjectAssessments: async (request: Request, subjectId: string) => {
      requireMethod(request, 'GET');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const subject = await services.repositories.subjects.findById(subjectId);
      if (!subject || !canParticipantAccessSubject(subject, participant.participantId)) throw new HttpError(404, 'subject_not_found', '找不到這個探索對象。');
      const assessments = await services.repositories.assessments.listForSubject(subjectId);
      return json({ assessments: assessments.map(assessmentForClient) });
    },
    createClaim: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const payload = await readJsonObject(request);
      if (typeof payload.subjectId !== 'string') throw new HttpError(400, 'invalid_payload', '請提供 subjectId。');
      const subject = await services.repositories.subjects.findById(payload.subjectId);
      if (!subject || !canParticipantAccessSubject(subject, participant.participantId)) throw new HttpError(404, 'subject_not_found', '找不到這個探索對象。');
      if (subject.subjectKind !== 'guest' || subject.claimStatus !== 'unclaimed') throw new HttpError(409, 'claim_not_available', '這份結果目前無法建立認領連結。');
      if (!subject.lastAssessmentId || !(await services.repositories.assessments.findById(subject.lastAssessmentId))) throw new HttpError(409, 'claim_not_available', '完成探索後才能建立認領連結。');
      const material = createClaimToken();
      const updated = await services.repositories.subjects.update(subject.subjectId, { claimTokenHash: material.tokenHash, claimExpiresAt: material.expiresAt, claimStatus: 'unclaimed' });
      return json({ claim: { subjectId: updated.subjectId, token: material.token, expiresAt: material.expiresAt } }, 201);
    },
    claimPreview: async (request: Request) => {
      requireMethod(request, 'GET');
      const token = new URL(request.url).searchParams.get('token');
      if (!token) throw new HttpError(400, 'missing_claim_token', '請提供認領連結。');
      const subject = await services.repositories.subjects.findByClaimTokenHash(hashClaimToken(token));
      if (!subject || subject.claimStatus !== 'unclaimed' || !subject.claimExpiresAt || isClaimExpired(subject.claimExpiresAt)) throw new HttpError(410, 'claim_expired', '這個認領連結已失效。');
      const assessment = subject.lastAssessmentId ? await services.repositories.assessments.findById(subject.lastAssessmentId) : null;
      return json({ preview: { displayLabel: subject.displayLabel, ...(assessment ? { lifePath: assessment.lifePath.value, top3Code: assessment.riasecResult.top3Code, completedAt: assessment.completedAt } : {}), expiresAt: subject.claimExpiresAt } });
    },
    redeemClaim: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const payload = await readJsonObject(request);
      if (typeof payload.token !== 'string' || !payload.token.trim()) throw new HttpError(400, 'missing_claim_token', '請提供認領連結。');
      const subject = await services.repositories.subjects.findByClaimTokenHash(hashClaimToken(payload.token));
      if (!subject) throw new HttpError(410, 'claim_invalid', '這個認領連結已失效或已使用。');
      if (subject.claimStatus === 'claimed') {
        if (subject.ownerParticipantId === participant.participantId) return json({ subject: subjectPayload(subject), alreadyClaimed: true });
        throw new HttpError(409, 'claim_already_used', '這份結果已由其他帳號保存。');
      }
      if (subject.claimStatus !== 'unclaimed' || !subject.claimExpiresAt || isClaimExpired(subject.claimExpiresAt)) {
        throw new HttpError(410, 'claim_expired', '這個認領連結已失效。');
      }
      const updated = await services.repositories.subjects.update(subject.subjectId, {
        ownerParticipantId: participant.participantId, subjectKind: 'claimed', claimStatus: 'claimed', claimedAt: new Date().toISOString(),
        claimTokenHash: undefined, claimExpiresAt: undefined,
      });
      return json({ subject: subjectPayload(updated) });
    },
    latestAssessment: async (request: Request) => {
      requireMethod(request, 'GET');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const candidate = await services.repositories.assessments.findLatestForParticipant(participant.participantId);
      let assessment = candidate;
      if (candidate?.subjectId) {
        const subject = await services.repositories.subjects.findById(candidate.subjectId);
        if (!subject || !canParticipantAccessSubject(subject, participant.participantId)) assessment = null;
      }
      if (!assessment) {
        const subjects = await services.repositories.subjects.listForParticipant(participant.participantId);
        const history = (await Promise.all(subjects.map((subject) => services.repositories.assessments.listForSubject(subject.subjectId)))).flat();
        assessment = history.sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0] ?? null;
      }
      return json({ assessment: assessment ? assessmentForClient(assessment) : null });
    },
    generateReport: async (request: Request) => {
      requireMethod(request, 'POST');
      const identity = currentIdentity(request, services.config);
      const participant = await services.repositories.participants.upsertIdentity(identity);
      const payload = await readJsonObject(request);
      if (typeof payload.assessmentId !== 'string') throw new HttpError(400, 'invalid_payload', '請提供 assessmentId。');
      const assessment = await ownAssessment(await services.repositories.assessments.findById(payload.assessmentId), participant.participantId, services);
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
      await ownAssessment(await services.repositories.assessments.findById(assessmentId), participant.participantId, services);
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
    publicShare: async (request: Request, assessmentId: string) => {
      requireMethod(request, 'GET');
      const assessment = await services.repositories.assessments.findById(assessmentId);
      if (!assessment) throw new HttpError(404, 'assessment_not_found', '找不到這份測驗結果。');
      const report = await services.repositories.reports.findByAssessmentId(assessmentId);
      const configuredBaseUrl = services.config.appBaseUrl;
      const landingBaseUrl = /^(https?:\/\/)(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(configuredBaseUrl)
        ? new URL(request.url).origin
        : configuredBaseUrl;
      return json({ share: {
        lifePath: assessment.lifePath.value,
        top3: assessment.riasecResult.top3,
        top3Code: assessment.riasecResult.top3Code,
        repeatedSignals: report?.repeated_signals?.slice(0, 3) ?? [],
        summary: report?.summary ?? '這是一份自我探索摘要，不是人格或職涯定論。',
        landingUrl: new URL('/', landingBaseUrl).toString(),
      } });
    },
    lineWebhook: async (request: Request) => {
      requireMethod(request, 'POST');
      // Reserved deliberately: signature verification cannot be enabled before a
      // real Messaging API secret is supplied in server configuration.
      throw new HttpError(501, 'webhook_not_configured', 'LINE webhook 尚未設定。');
    },
  };
}
