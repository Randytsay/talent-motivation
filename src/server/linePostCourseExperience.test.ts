import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AssessmentRecord } from './contracts';
import { loadRuntimeConfig } from './env';
import { createLinePostCourseExperienceWebhookHandler, formatAssessmentDate } from './linePostCourseExperience';
import { InMemoryRepositories } from './repositories';
import { createRuntime } from './runtime';
import type { SubjectRecord } from './subject';

function assessmentFixture(
  participantId = 'participant-1',
  overrides: Partial<AssessmentRecord> = {},
): AssessmentRecord {
  const scores = {
    R: { code: 'R' as const, raw: 7, normalized: 58 },
    I: { code: 'I' as const, raw: 11, normalized: 92 },
    A: { code: 'A' as const, raw: 8, normalized: 67 },
    S: { code: 'S' as const, raw: 10, normalized: 83 },
    E: { code: 'E' as const, raw: 9, normalized: 75 },
    C: { code: 'C' as const, raw: 5, normalized: 42 },
  };
  return {
    assessmentId: 'assessment-1',
    participantId,
    birthDate: '1978-11-05',
    lifePath: { value: 5, rawDigitSum: 32, reductionSteps: [32, 5] },
    lifePathResonance: 'high',
    lifePathTopResonance: '喜歡自由、變化與新的體驗',
    riasecAnswers: { q1: 4, q2: 3, q3: 2 } as AssessmentRecord['riasecAnswers'],
    riasecResult: { scores, top3: ['I', 'S', 'E'], top3Code: 'ISE' },
    subjectiveDriver: 'S',
    talentUsage: 60,
    priorities: ['收入更多元', '更能發揮自己的能力'],
    explorationInterest: '很想',
    reflections: {
      energizingExperience: '把複雜問題整理清楚，幫同事快速理解。',
      currentFriction: '重複性高、缺乏自主權的工作。',
      unconstrainedExploration: '分享知識並幫助別人成長。',
    },
    presenterConsent: false,
    completedAt: '2026-09-05T12:00:00.000Z',
    ...overrides,
  };
}

function signedRequest(body: string, secret = 'messaging-secret'): Request {
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  return new Request('https://example.com/api/line/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': signature },
    body,
  });
}

function testHandler(repositories: InMemoryRepositories, requests: unknown[]) {
  const runtime = createRuntime(loadRuntimeConfig({ APP_RUNTIME_MODE: 'mock' }), repositories);
  const fetchImpl: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  };
  return createLinePostCourseExperienceWebhookHandler(runtime, {
    channelSecret: 'messaging-secret',
    channelAccessToken: 'token',
    appBaseUrl: 'https://talent.example.com',
  }, fetchImpl);
}

describe('LINE post-course experience UX', () => {
  it('formats assessment dates in Taiwan time', () => {
    expect(formatAssessmentDate('2026-09-05T16:30:00.000Z')).toBe('2026/09/06');
  });

  it('sends a warm welcome card on first follow', async () => {
    const repositories = new InMemoryRepositories();
    const requests: unknown[] = [];
    const handler = testHandler(repositories, requests);
    const body = JSON.stringify({
      events: [{ type: 'follow', replyToken: 'follow-reply', source: { userId: 'U-new' } }],
    });

    const response = await handler(signedRequest(body));
    expect(response.status).toBe(200);
    const payload = requests[0] as { messages: Array<{ altText?: string }> };
    expect(payload.messages[0].altText).toBe('歡迎來到天賦原動力');
    expect(JSON.stringify(payload)).toContain('不是替你貼標籤');
    expect(JSON.stringify(payload)).toContain('查看我的原動力');
    expect(JSON.stringify(payload)).toContain('還沒測驗，先開始');
  });

  it('shows assessment date and explains all three ways to use the result', async () => {
    const repositories = new InMemoryRepositories(() => '2026-09-05T12:00:00.000Z');
    const participant = await repositories.participants.upsertIdentity({
      lineUserId: 'U-test-user', displayName: '測試學員',
    });
    await repositories.assessments.append(assessmentFixture(participant.participantId));

    const requests: unknown[] = [];
    const handler = testHandler(repositories, requests);
    const body = JSON.stringify({
      events: [{
        type: 'message', replyToken: 'reply-token', source: { userId: 'U-test-user' },
        message: { type: 'text', text: '我的原動力' },
      }],
    });

    const response = await handler(signedRequest(body));
    expect(response.status).toBe(200);
    const rendered = JSON.stringify(requests[0]);
    expect(rendered).toContain('測驗日期：2026/09/05');
    expect(rendered).toContain('看懂自己的能量與反覆線索');
    expect(rendered).toContain('探索工作、轉職、副業與第二曲線');
    expect(rendered).toContain('把想法變成可以驗證的小行動');
  });

  it('keeps multiple owned assessment dates selectable instead of hiding older results', async () => {
    const repositories = new InMemoryRepositories(() => '2026-09-05T12:00:00.000Z');
    const participant = await repositories.participants.upsertIdentity({
      lineUserId: 'U-test-user', displayName: '測試學員',
    });
    const subject: SubjectRecord = {
      subjectId: 'subject-self',
      ownerParticipantId: participant.participantId,
      createdByParticipantId: participant.participantId,
      subjectKind: 'self',
      displayLabel: '我自己',
      birthDate: '1978-11-05',
      claimStatus: 'not_applicable',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      archived: false,
    };
    await repositories.subjects.create(subject);
    await repositories.assessments.append(assessmentFixture(participant.participantId, {
      assessmentId: 'assessment-old', subjectId: subject.subjectId, completedAt: '2026-08-01T12:00:00.000Z',
    }));
    await repositories.assessments.append(assessmentFixture(participant.participantId, {
      assessmentId: 'assessment-new', subjectId: subject.subjectId, completedAt: '2026-09-05T12:00:00.000Z',
    }));

    const requests: unknown[] = [];
    const handler = testHandler(repositories, requests);
    const body = JSON.stringify({
      events: [{
        type: 'message', replyToken: 'reply-token', source: { userId: 'U-test-user' },
        message: { type: 'text', text: '我的原動力' },
      }],
    });

    await handler(signedRequest(body));
    const rendered = JSON.stringify(requests[0]);
    expect(rendered).toContain('2026/09/05');
    expect(rendered).toContain('2026/08/01');
    expect(rendered).toContain('你想從哪一次開始？');
  });

  it('includes the selected assessment date and a plain-language purpose before the AI prompt', async () => {
    const repositories = new InMemoryRepositories(() => '2026-09-05T12:00:00.000Z');
    const participant = await repositories.participants.upsertIdentity({
      lineUserId: 'U-test-user', displayName: '測試學員',
    });
    const assessment = assessmentFixture(participant.participantId);
    await repositories.assessments.append(assessment);

    const requests: unknown[] = [];
    const handler = testHandler(repositories, requests);
    const body = JSON.stringify({
      events: [{
        type: 'postback', replyToken: 'reply-token', source: { userId: 'U-test-user' },
        postback: { data: `action=prompt&track=career&assessmentId=${assessment.assessmentId}` },
      }],
    });

    await handler(signedRequest(body));
    const rendered = JSON.stringify(requests[0]);
    expect(rendered).toContain('工作方向、轉職、副業或第二曲線');
    expect(rendered).toContain('測驗日期：2026/09/05');
    expect(rendered).not.toContain('1978-11-05');
  });
});
