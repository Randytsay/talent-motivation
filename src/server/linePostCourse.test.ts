import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AssessmentRecord } from './contracts';
import { loadRuntimeConfig } from './env';
import { buildExplorationPrompt, createLinePostCourseWebhookHandler, verifyLineSignature } from './linePostCourse';
import { InMemoryRepositories } from './repositories';
import { createRuntime } from './runtime';

function assessmentFixture(participantId = 'participant-1'): AssessmentRecord {
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

describe('LINE post-course exploration', () => {
  it('verifies LINE HMAC signatures', () => {
    const body = '{"events":[]}';
    const signature = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(verifyLineSignature(body, signature, 'secret')).toBe(true);
    expect(verifyLineSignature(`${body}x`, signature, 'secret')).toBe(false);
    expect(verifyLineSignature(body, null, 'secret')).toBe(false);
  });

  it('builds privacy-preserving prompts without birth date or raw RIASEC answers', () => {
    const assessment = assessmentFixture();
    const prompt = buildExplorationPrompt(assessment, 'self');
    expect(prompt).toContain('ISE');
    expect(prompt).toContain('天賦使用率：約 60%');
    expect(prompt).toContain('把複雜問題整理清楚');
    expect(prompt).not.toContain('1978-11-05');
    expect(prompt).not.toContain('q1');
    expect(prompt).not.toContain('participant-1');
    expect(prompt).not.toContain('assessment-1');
  });

  it('returns the exploration Flex card when the trigger word is received', async () => {
    const repositories = new InMemoryRepositories(() => '2026-09-05T12:00:00.000Z');
    const participant = await repositories.participants.upsertIdentity({
      lineUserId: 'U-test-user',
      displayName: '測試學員',
    });
    await repositories.assessments.append(assessmentFixture(participant.participantId));
    const runtime = createRuntime(loadRuntimeConfig({ APP_RUNTIME_MODE: 'mock' }), repositories);
    const requests: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    };
    const handler = createLinePostCourseWebhookHandler(runtime, {
      channelSecret: 'messaging-secret',
      channelAccessToken: 'token',
      appBaseUrl: 'https://talent.example.com',
    }, fetchImpl);
    const body = JSON.stringify({
      events: [{
        type: 'message',
        replyToken: 'reply-token',
        source: { userId: 'U-test-user' },
        message: { type: 'text', text: '我的原動力' },
      }],
    });
    const response = await handler(signedRequest(body));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    const reply = requests[0] as { messages: Array<{ type: string; altText?: string }> };
    expect(reply.messages[0]).toMatchObject({ type: 'flex', altText: '你的天賦探索已準備好' });
  });

  it('returns a deterministic AI prompt when a track button is clicked', async () => {
    const repositories = new InMemoryRepositories(() => '2026-09-05T12:00:00.000Z');
    const participant = await repositories.participants.upsertIdentity({
      lineUserId: 'U-test-user',
      displayName: '測試學員',
    });
    const assessment = assessmentFixture(participant.participantId);
    await repositories.assessments.append(assessment);
    const runtime = createRuntime(loadRuntimeConfig({ APP_RUNTIME_MODE: 'mock' }), repositories);
    const requests: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    };
    const handler = createLinePostCourseWebhookHandler(runtime, {
      channelSecret: 'messaging-secret',
      channelAccessToken: 'token',
      appBaseUrl: 'https://talent.example.com',
    }, fetchImpl);
    const body = JSON.stringify({
      events: [{
        type: 'postback',
        replyToken: 'reply-token',
        source: { userId: 'U-test-user' },
        postback: { data: `action=prompt&track=career&assessmentId=${assessment.assessmentId}` },
      }],
    });
    const response = await handler(signedRequest(body));
    expect(response.status).toBe(200);
    const reply = requests[0] as { messages: Array<{ type: string; text?: string }> };
    expect(reply.messages.some((message) => message.text?.includes('職涯與第二曲線探索教練'))).toBe(true);
    expect(JSON.stringify(reply)).not.toContain('1978-11-05');
  });
});
