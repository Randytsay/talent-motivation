import type { AssessmentRecord, Participant } from './contracts';
import { HttpError, json, requireMethod } from './http';
import {
  buildExplorationPrompt,
  type ExplorationTrack,
  type LineMessagingConfig,
  verifyLineSignature,
} from './linePostCourse';
import type { RuntimeServices } from './runtime';

const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const TRIGGER_WORDS = new Set(['我的原動力', '原動力']);
const HELP_WORDS = new Set(['使用說明', '怎麼使用', '如何使用', '幫助']);
const MAX_LINE_TEXT = 4800;

type LineFetch = typeof fetch;
type LineMessage = Record<string, unknown>;

interface LineWebhookEvent {
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
}

interface PromptableAssessment {
  assessment: AssessmentRecord;
  label: string;
}

const RIASEC_SHORT: Record<string, string> = {
  R: '實作型', I: '探索型', A: '創造型', S: '連結型', E: '推動型', C: '組織型',
};

const LIFE_PATH_LABELS: Record<number, string> = {
  1: '開創者', 2: '連結者', 3: '表達者', 4: '建構者', 5: '探索者', 6: '守護者',
  7: '洞察者', 8: '成就者', 9: '理想者', 11: '啟發者', 22: '實踐者', 33: '賦能者',
};

const TRACK_GUIDE: Record<ExplorationTrack, { title: string; short: string; purpose: string }> = {
  self: {
    title: '🌱 更了解自己',
    short: '看懂自己的能量與反覆線索',
    purpose: '適合想先把自己看得更清楚的人。AI 會陪你從結果與真實經驗中，整理能量來源、消耗點、反覆出現的能力，以及可能還沒有充分使用的部分。',
  },
  career: {
    title: '💼 工作與第二曲線',
    short: '探索工作、轉職、副業與第二曲線',
    purpose: '適合正在思考工作方向、轉職、副業或第二曲線的人。AI 不會直接替你指定職業，而是把線索拆成活動、角色、環境與任務，陪你一步步驗證。',
  },
  action: {
    title: '🧭 7～14 天行動實驗',
    short: '把想法變成可以驗證的小行動',
    purpose: '適合已經有一些想法，卻不知道怎麼開始的人。AI 會把方向變成 7～14 天、低風險的小實驗，不需要立刻離職，也不需要重大投資。',
  },
};

function parseEvents(rawBody: string): LineWebhookEvent[] {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || !('events' in parsed)) return [];
    const events = (parsed as { events?: unknown }).events;
    return Array.isArray(events)
      ? events.filter((item): item is LineWebhookEvent => Boolean(item && typeof item === 'object'))
      : [];
  } catch {
    throw new HttpError(400, 'invalid_line_webhook_json', 'LINE webhook payload 無法解析。');
  }
}

function splitLineText(text: string): string[] {
  if (text.length <= MAX_LINE_TEXT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_LINE_TEXT && chunks.length < 4) {
    let cut = remaining.lastIndexOf('\n', MAX_LINE_TEXT);
    if (cut < MAX_LINE_TEXT * 0.65) cut = MAX_LINE_TEXT;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining.slice(0, MAX_LINE_TEXT));
  return chunks.slice(0, 5);
}

function textMessages(text: string): LineMessage[] {
  return splitLineText(text).map((chunk) => ({ type: 'text', text: chunk }));
}

async function replyLine(
  replyToken: string,
  messages: LineMessage[],
  config: LineMessagingConfig,
  fetchImpl: LineFetch,
): Promise<void> {
  const response = await fetchImpl(LINE_REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.channelAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!response.ok) {
    console.error('LINE reply API failed', { status: response.status });
    throw new HttpError(502, 'line_reply_failed', 'LINE 回覆暫時無法送出。');
  }
}

export function formatAssessmentDate(completedAt: string): string {
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return completedAt.slice(0, 10).replaceAll('-', '/');
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function promptableAssessments(
  participant: Participant,
  services: RuntimeServices,
): Promise<PromptableAssessment[]> {
  const subjects = await services.repositories.subjects.listForParticipant(participant.participantId);
  const ownedSubjects = subjects.filter((subject) =>
    subject.ownerParticipantId === participant.participantId ||
    (subject.subjectKind === 'self' && subject.createdByParticipantId === participant.participantId));

  const nested = await Promise.all(ownedSubjects.map(async (subject) => {
    const history = await services.repositories.assessments.listForSubject(subject.subjectId);
    const label = subject.subjectKind === 'self' ? '我的結果' : subject.displayLabel || '已認領的結果';
    return history.map((assessment) => ({ assessment, label } satisfies PromptableAssessment));
  }));
  const results = nested.flat();

  const legacy = await services.repositories.assessments.findLatestForParticipant(participant.participantId);
  if (legacy && !legacy.subjectId && !results.some((item) => item.assessment.assessmentId === legacy.assessmentId)) {
    results.push({ assessment: legacy, label: '我的結果' });
  }

  return results
    .sort((left, right) => right.assessment.completedAt.localeCompare(left.assessment.completedAt))
    .slice(0, 5);
}

async function ownedAssessment(
  participant: Participant,
  assessmentId: string,
  services: RuntimeServices,
): Promise<AssessmentRecord | null> {
  const assessment = await services.repositories.assessments.findById(assessmentId);
  if (!assessment) return null;
  if (!assessment.subjectId) return assessment.participantId === participant.participantId ? assessment : null;
  const subject = await services.repositories.subjects.findById(assessment.subjectId);
  if (!subject || subject.archived) return null;
  const isOwner = subject.ownerParticipantId === participant.participantId ||
    (subject.subjectKind === 'self' && subject.createdByParticipantId === participant.participantId);
  return isOwner ? assessment : null;
}

function summaryBody(assessment: AssessmentRecord): string {
  const date = formatAssessmentDate(assessment.completedAt);
  const lifePath = `${assessment.lifePath.value}｜${LIFE_PATH_LABELS[assessment.lifePath.value] ?? '生命靈數'}`;
  const top3 = assessment.riasecResult.top3.map((code) => `${code} ${RIASEC_SHORT[code] ?? ''}`).join('・');
  const priorities = assessment.priorities.length ? assessment.priorities.slice(0, 2).join('／') : '尚未選擇';
  return [
    `測驗日期：${date}`,
    `生命靈數：${lifePath}`,
    `RIASEC：${assessment.riasecResult.top3Code}（${top3}）`,
    `天賦使用率：${assessment.talentUsage}%`,
    `目前最想改善：${priorities}`,
  ].join('\n');
}

function welcomeFlex(appBaseUrl: string): LineMessage {
  return {
    type: 'flex',
    altText: '歡迎來到天賦原動力',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EEF4ED',
        paddingAll: '22px',
        contents: [
          { type: 'text', text: '🌿 歡迎來到天賦原動力', weight: 'bold', size: 'xl', color: '#294C43', wrap: true },
          { type: 'text', text: '這裡不是替你貼標籤，而是陪你慢慢看見自己。', size: 'sm', color: '#65756D', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '22px',
        contents: [
          { type: 'text', text: '你可以在這裡繼續探索：', weight: 'bold', color: '#33423D' },
          { type: 'text', text: '・哪些事情讓你更有精神\n・哪些能力值得多用一點\n・現在的你真正想往哪裡走', wrap: true, size: 'md', color: '#52615B' },
          { type: 'separator', margin: 'md', color: '#E4D8C2' },
          { type: 'text', text: '如果你已完成「天賦原動力」測驗，點下面的按鈕，我會接著你那一次的結果繼續陪你探索。', wrap: true, size: 'sm', color: '#6C6457' },
          { type: 'text', text: '不用急著一次把自己弄懂。認識自己，本來就是一段可以慢慢走的旅程。', wrap: true, size: 'sm', color: '#7B6B56' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '18px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4F7C6C',
            action: { type: 'postback', label: '🌱 查看我的原動力', data: 'action=start', displayText: '查看我的原動力' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'uri', label: '還沒測驗，先開始', uri: appBaseUrl },
          },
          { type: 'text', text: '之後也可以隨時輸入「我的原動力」回來。', wrap: true, size: 'xs', color: '#8A918D', align: 'center' },
        ],
      },
    },
  };
}

function selectorFlex(items: PromptableAssessment[]): LineMessage {
  return {
    type: 'flex',
    altText: '請選擇要繼續探索的測驗結果',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '你想從哪一次開始？', weight: 'bold', size: 'xl', color: '#294C43' },
          { type: 'text', text: '人的狀態會隨時間改變，所以我保留測驗日期，讓你知道自己正在回看哪一個階段。', size: 'sm', color: '#708078', wrap: true },
          ...items.map((item) => {
            const date = formatAssessmentDate(item.assessment.completedAt);
            return {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: `${date}｜${item.label}｜${item.assessment.riasecResult.top3Code}`.slice(0, 40),
                data: `action=summary&assessmentId=${encodeURIComponent(item.assessment.assessmentId)}`,
                displayText: `查看 ${date} 的結果`,
              },
            };
          }),
          { type: 'text', text: '最多顯示最近 5 次、且目前由你本人擁有的結果。', size: 'xs', color: '#8A918D', wrap: true },
        ],
      },
    },
  };
}

function guideBlock(
  assessmentId: string,
  track: ExplorationTrack,
  primary = false,
): Record<string, unknown> {
  const guide = TRACK_GUIDE[track];
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      { type: 'text', text: guide.title, weight: 'bold', size: 'md', color: '#294C43', wrap: true },
      { type: 'text', text: guide.short, size: 'sm', color: '#65756D', wrap: true },
      {
        type: 'button',
        style: primary ? 'primary' : 'secondary',
        ...(primary ? { color: '#4F7C6C' } : {}),
        margin: 'sm',
        action: {
          type: 'postback',
          label: track === 'self' ? '開始了解自己' : track === 'career' ? '開始探索方向' : '開始設計行動',
          data: `action=prompt&track=${track}&assessmentId=${encodeURIComponent(assessmentId)}`,
          displayText: guide.title.replace(/^.\s*/, ''),
        },
      },
    ],
  };
}

function summaryFlex(assessment: AssessmentRecord): LineMessage {
  return {
    type: 'flex',
    altText: '你的天賦探索已準備好',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EEF4ED',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '🌱 我的天賦探索', weight: 'bold', size: 'xl', color: '#294C43' },
          { type: 'text', text: '每一次測驗都代表當下的你，不需要和過去一模一樣。', size: 'sm', color: '#65756D', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: summaryBody(assessment), wrap: true, size: 'md', color: '#33423D' },
          { type: 'separator', margin: 'md', color: '#E4D8C2' },
          { type: 'text', text: '接下來想怎麼使用這份結果？', weight: 'bold', size: 'lg', color: '#294C43', wrap: true },
          { type: 'text', text: '三個選項目的不同，不需要全部做。挑一個最符合你現在需要的就好。', wrap: true, size: 'sm', color: '#7B6B56' },
          guideBlock(assessment.assessmentId, 'self', true),
          { type: 'separator', margin: 'sm', color: '#EFE8DB' },
          guideBlock(assessment.assessmentId, 'career'),
          { type: 'separator', margin: 'sm', color: '#EFE8DB' },
          guideBlock(assessment.assessmentId, 'action'),
        ],
      },
    },
  };
}

function noResultFlex(appBaseUrl: string): LineMessage {
  return {
    type: 'flex',
    altText: '還找不到你的天賦探索結果',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '還找不到你的結果', weight: 'bold', size: 'xl', color: '#294C43' },
          { type: 'text', text: '請先用同一個 LINE 帳號完成「天賦原動力」探索，再回來輸入「我的原動力」。', wrap: true, size: 'md', color: '#65756D' },
          { type: 'button', style: 'primary', color: '#4F7C6C', action: { type: 'uri', label: '開始探索', uri: appBaseUrl } },
        ],
      },
    },
  };
}

function identityNotLinkedFlex(appBaseUrl: string): LineMessage {
  return {
    type: 'flex',
    altText: '請先連結你的天賦探索結果',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '先把結果和 LINE 連起來', weight: 'bold', size: 'xl', color: '#294C43' },
          { type: 'text', text: '請用這個 LINE 帳號進入「天賦原動力」並完成登入／探索。完成後再輸入「我的原動力」。', wrap: true, size: 'md', color: '#65756D' },
          { type: 'button', style: 'primary', color: '#4F7C6C', action: { type: 'uri', label: '前往天賦原動力', uri: appBaseUrl } },
        ],
      },
    },
  };
}

async function promptMessages(
  assessment: AssessmentRecord,
  track: ExplorationTrack,
  services: RuntimeServices,
): Promise<LineMessage[]> {
  const report = await services.repositories.reports.findByAssessmentId(assessment.assessmentId);
  const prompt = buildExplorationPrompt(assessment, track, report);
  const date = formatAssessmentDate(assessment.completedAt);
  const guide = TRACK_GUIDE[track];
  const datedPrompt = `【本次探索時間】\n測驗日期：${date}\n\n${prompt}`;
  return [
    {
      type: 'text',
      text: `${guide.title}\n\n${guide.purpose}\n\n接下來會把你 ${date} 這次測驗的資料整理成專屬提示詞。長按下面的文字即可複製，再貼到 ChatGPT、Gemini 或其他你慣用的 AI。`,
    },
    ...textMessages(datedPrompt),
  ].slice(0, 5);
}

async function handleStart(
  event: LineWebhookEvent,
  services: RuntimeServices,
  config: LineMessagingConfig,
  fetchImpl: LineFetch,
): Promise<void> {
  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId;
  if (!replyToken || !lineUserId) return;

  const participant = await services.repositories.participants.findByLineUserId(lineUserId);
  if (!participant) {
    await replyLine(replyToken, [identityNotLinkedFlex(config.appBaseUrl)], config, fetchImpl);
    return;
  }

  const available = await promptableAssessments(participant, services);
  if (!available.length) {
    await replyLine(replyToken, [noResultFlex(config.appBaseUrl)], config, fetchImpl);
    return;
  }
  if (available.length > 1) {
    await replyLine(replyToken, [selectorFlex(available)], config, fetchImpl);
    return;
  }
  await replyLine(replyToken, [summaryFlex(available[0].assessment)], config, fetchImpl);
}

async function handlePostback(
  event: LineWebhookEvent,
  services: RuntimeServices,
  config: LineMessagingConfig,
  fetchImpl: LineFetch,
): Promise<void> {
  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId;
  const data = event.postback?.data;
  if (!replyToken || !lineUserId || !data) return;

  const params = new URLSearchParams(data);
  const action = params.get('action');
  if (action === 'start') {
    await handleStart(event, services, config, fetchImpl);
    return;
  }

  const participant = await services.repositories.participants.findByLineUserId(lineUserId);
  if (!participant) {
    await replyLine(replyToken, [identityNotLinkedFlex(config.appBaseUrl)], config, fetchImpl);
    return;
  }

  const assessmentId = params.get('assessmentId');
  if (!assessmentId) return;
  const assessment = await ownedAssessment(participant, assessmentId, services);
  if (!assessment) {
    await replyLine(replyToken, textMessages('這份結果目前不屬於你的帳號，或已無法存取。請重新輸入「我的原動力」。'), config, fetchImpl);
    return;
  }

  if (action === 'summary') {
    await replyLine(replyToken, [summaryFlex(assessment)], config, fetchImpl);
    return;
  }

  if (action === 'prompt') {
    const track = params.get('track');
    if (track !== 'self' && track !== 'career' && track !== 'action') return;
    await replyLine(replyToken, await promptMessages(assessment, track, services), config, fetchImpl);
  }
}

export function createLinePostCourseExperienceWebhookHandler(
  services: RuntimeServices,
  config: LineMessagingConfig,
  fetchImpl: LineFetch = fetch,
): (request: Request) => Promise<Response> {
  return async (request) => {
    requireMethod(request, 'POST');
    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature');
    if (!verifyLineSignature(rawBody, signature, config.channelSecret)) {
      throw new HttpError(401, 'invalid_line_signature', 'LINE webhook signature 驗證失敗。');
    }

    const events = parseEvents(rawBody);
    for (const event of events) {
      if (event.type === 'follow' && event.replyToken) {
        await replyLine(event.replyToken, [welcomeFlex(config.appBaseUrl)], config, fetchImpl);
      } else if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text?.trim() ?? '';
        if (TRIGGER_WORDS.has(text)) {
          await handleStart(event, services, config, fetchImpl);
        } else if (HELP_WORDS.has(text) && event.replyToken) {
          await replyLine(event.replyToken, [welcomeFlex(config.appBaseUrl)], config, fetchImpl);
        }
      } else if (event.type === 'postback') {
        await handlePostback(event, services, config, fetchImpl);
      }
    }

    return json({ ok: true });
  };
}
