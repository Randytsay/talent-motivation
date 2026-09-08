import { describe, expect, it } from 'vitest';
import { normalizeClassroomPromptText, transformClassroomLinePayload } from './lineClassroomAdapter';

describe('Classroom LINE post-course adapter', () => {
  it('normalizes RIASEC labels and removes classroom-only missing reflection placeholders', () => {
    const input = [
      '【RIASEC 活動偏好】',
      'Top 3：ISE｜I 探索型（想）、S 連結型（幫）、E 推動型（帶）',
      '探索意願：未詢問',
      '',
      '【真實經驗】',
      '做完雖然累、卻有成就感的事情：尚未填寫',
      '目前最消耗：尚未填寫',
      '如果暫時不考慮限制，最想嘗試：尚未填寫',
    ].join('\n');

    const output = normalizeClassroomPromptText(input);
    expect(output).toContain('I 研究型（想）');
    expect(output).toContain('S 助人型（幫）');
    expect(output).toContain('探索意願：課堂版未詢問；不要據此推論意願高低。');
    expect(output).toContain('請直接從一個最近的真實生活或工作微時刻開始追問');
    expect(output).not.toContain('尚未填寫');
  });

  it('keeps real reflection content intact', () => {
    const input = '【真實經驗】\n目前最消耗：會議太多，沒有專注時間。';
    expect(normalizeClassroomPromptText(input)).toContain('目前最消耗：會議太多，沒有專注時間。');
  });

  it('adds a full-report CTA to the result Flex card', () => {
    const payload = {
      replyToken: 'token',
      messages: [{
        type: 'flex',
        altText: '你的天賦探索已準備好',
        contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [] } },
      }],
    };

    const output = transformClassroomLinePayload(payload, 'https://talent.example.com/') as {
      messages: Array<{ contents: { footer?: { contents?: Array<{ action?: { label?: string; uri?: string } }> } } }>;
    };
    const action = output.messages[0].contents.footer?.contents?.[0].action;
    expect(action?.label).toBe('📖 查看我的完整報告');
    expect(action?.uri).toBe('https://talent.example.com/report/latest');
  });

  it('does not add a report button to unrelated messages', () => {
    const payload = { messages: [{ type: 'text', text: 'hello' }] };
    expect(transformClassroomLinePayload(payload, 'https://talent.example.com')).toEqual(payload);
  });
});
