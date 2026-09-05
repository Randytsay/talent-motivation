import { createHmac, timingSafeEqual } from 'node:crypto';
import { birthProfileFacts } from '../lib/scoring/birthProfile';
import type { RiasecCode } from '../types/domain';
import type { AIReport, AssessmentRecord, Participant } from './contracts';
import { HttpError, json, requireMethod } from './http';
import type { RuntimeServices } from './runtime';

export interface LineMessagingConfig {
  channelSecret: string;
  channelAccessToken: string;
  appBaseUrl: string;
}

export type ExplorationTrack = 'self' | 'career' | 'action';

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

const TRIGGER_WORDS = new Set(['我的原動力', '原動力']);
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const MAX_LINE_TEXT = 4800;

const RIASEC_LABELS: Record<RiasecCode, string> = {
  R: 'R 實作型（做）',
  I: 'I 探索型（想）',
  A: 'A 創造型（創）',
  S: 'S 連結型（幫）',
  E: 'E 推動型（帶）',
  C: 'C 組織型（整）',
};

const LIFE_PATH_LABELS: Record<number, string> = {
  1: '開創者',
  2: '連結者',
  3: '表達者',
  4: '建構者',
  5: '探索者',
  6: '守護者',
  7: '洞察者',
  8: '成就者',
  9: '理想者',
  11: '啟發者',
  22: '實踐者',
  33: '賦能者',
};

export function lineMessagingConfigFromEnv(
  environment: Record<string, string | undefined> = process.env,
): LineMessagingConfig | undefined {
  const channelSecret = environment.LINE_MESSAGING_CHANNEL_SECRET;
  const channelAccessToken = environment.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret && !channelAccessToken) return undefined;
  if (!channelSecret || !channelAccessToken) {
    throw new HttpError(503, 'line_messaging_configuration_incomplete', 'LINE Messaging API 設定尚未完成。');
  }
  return {
    channelSecret,
    channelAccessToken,
    appBaseUrl: environment.APP_BASE_URL ?? 'http://localhost:5173',
  };
}

export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function parseEvents(rawBody: string): LineWebhookEvent[] {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || !('events' in parsed)) return [];
    const events = (parsed as { events?: unknown }).events;
    return Array.isArray(events) ? events.filter((item): item is LineWebhookEvent => Boolean(item && typeof item === 'object')) : [];
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

function textMessages(text: string): LineMessage[] {
  return splitLineText(text).map((chunk) => ({ type: 'text', text: chunk }));
}

async function promptableAssessments(participant: Participant, services: RuntimeServices): Promise<PromptableAssessment[]> {
  const subjects = await services.repositories.subjects.listForParticipant(participant.participantId);
  const ownedSubjects = subjects.filter((subject) =>
    subject.ownerParticipantId === participant.participantId ||
    (subject.subjectKind === 'self' && subject.createdByParticipantId === participant.participantId));

  const results = (await Promise.all(ownedSubjects.map(async (subject) => {
    const history = await services.repositories.assessments.listForSubject(subject.subjectId);
    const latest = history[0];
    if (!latest) return null;
    const label = subject.subjectKind === 'self' ? '我的結果' : subject.displayLabel || '已認領的結果';
    return { assessment: latest, label } satisfies PromptableAssessment;
  }))).filter((item): item is PromptableAssessment => item !== null);

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
  const lifePath = `${assessment.lifePath.value}｜${LIFE_PATH_LABELS[assessment.lifePath.value] ?? '生命靈數'}`;
  const top3 = assessment.riasecResult.top3.map((code) => RIASEC_LABELS[code]).join('・');
  const priorities = assessment.priorities.length ? assessment.priorities.slice(0, 2).join('／') : '尚未選擇';
  return `生命靈數：${lifePath}\nRIASEC：${assessment.riasecResult.top3Code}（${top3}）\n天賦使用率：${assessment.talentUsage}%\n目前最想改善：${priorities}`;
}

function selectorFlex(items: PromptableAssessment[]): LineMessage {
  return {
    type: 'flex',
    altText: '請選擇要繼續探索的結果',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '你想繼續探索哪一份？', weight: 'bold', size: 'xl', color: '#294C43' },
          { type: 'text', text: '只會顯示目前由你本人擁有的結果。', size: 'sm', color: '#708078', wrap: true },
          ...items.map((item) => ({
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: `${item.label}｜${item.assessment.riasecResult.top3Code}`.slice(0, 40),
              data: `action=summary&assessmentId=${encodeURIComponent(item.assessment.assessmentId)}`,
              displayText: `查看 ${item.label}`,
            },
          })),
        ],
      },
    },
  };
}

function summaryFlex(assessment: AssessmentRecord): LineMessage {
  const encodedAssessmentId = encodeURIComponent(assessment.assessmentId);
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
          { type: 'text', text: '今天的結果，是下一段探索的起點。', size: 'sm', color: '#65756D', wrap: true, margin: 'sm' },
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
          { type: 'text', text: '回家有時間再慢慢探索，不用現在看完。', wrap: true, size: 'sm', color: '#7B6B56', margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4F7C6C',
            action: { type: 'postback', label: '🌱 更了解自己', data: `action=prompt&track=self&assessmentId=${encodedAssessmentId}`, displayText: '更了解自己' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: '💼 工作與第二曲線', data: `action=prompt&track=career&assessmentId=${encodedAssessmentId}`, displayText: '探索工作與第二曲線' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: '🧭 7～14 天行動', data: `action=prompt&track=action&assessmentId=${encodedAssessmentId}`, displayText: '找到下一步' },
          },
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

function safeBirthFacts(assessment: AssessmentRecord): string[] {
  if (!assessment.birthProfile) return [`生命靈數：${assessment.lifePath.value}｜${LIFE_PATH_LABELS[assessment.lifePath.value] ?? '生命靈數'}`];
  const facts = birthProfileFacts(assessment.birthProfile);
  return [
    `生命靈數：${assessment.lifePath.value}｜${LIFE_PATH_LABELS[assessment.lifePath.value] ?? '生命靈數'}`,
    `核心出生結構：${facts.pyramid_main.number} ${facts.pyramid_main.label}（${facts.pyramid_main.keywords.join('、')}）`,
    `外在互動線索：${facts.outer_profile.label}（${facts.outer_profile.keywords.join('、')}）`,
    `內在需求線索：${facts.inner_profile.label}（${facts.inner_profile.keywords.join('、')}）`,
    `目前階段：${facts.current_stage.label}${facts.current_stage.theme ? `｜${facts.current_stage.theme}` : ''}`,
  ];
}

function promptFacts(assessment: AssessmentRecord, report?: AIReport | null): string {
  const reflections = assessment.reflections;
  const repeated = report?.repeated_signals?.length ? report.repeated_signals.slice(0, 3).join('、') : '尚未整理';
  return [
    '【出生結構線索】',
    ...safeBirthFacts(assessment),
    '',
    '【RIASEC 活動偏好】',
    `Top 3：${assessment.riasecResult.top3Code}｜${assessment.riasecResult.top3.map((code) => RIASEC_LABELS[code]).join('、')}`,
    `本人主觀能量：${RIASEC_LABELS[assessment.subjectiveDriver]}`,
    '',
    '【目前狀況】',
    `天賦使用率：約 ${assessment.talentUsage}%`,
    `目前最想改善：${assessment.priorities.length ? assessment.priorities.join('、') : '尚未選擇'}`,
    `探索意願：${assessment.explorationInterest}`,
    '',
    '【真實經驗】',
    `做完雖然累、卻有成就感的事情：${reflections?.energizingExperience?.trim() || '尚未填寫'}`,
    `目前最消耗：${reflections?.currentFriction?.trim() || '尚未填寫'}`,
    `如果暫時不考慮限制，最想嘗試：${reflections?.unconstrainedExploration?.trim() || '尚未填寫'}`,
    `既有 AI 報告曾整理出的重複線索：${repeated}`,
  ].join('\n');
}

export function buildExplorationPrompt(
  assessment: AssessmentRecord,
  track: ExplorationTrack,
  report?: AIReport | null,
): string {
  const facts = promptFacts(assessment, report);
  const sharedRules = `
請遵守以下原則：
- 不要用「你就是、你天生適合、你命中注定、你一定要」等定論語氣。
- 使用「可能、看起來、值得留意、可以透過經驗驗證」。
- 不把任何生命靈數、RIASEC 或 AI 分析當成人格診斷或職涯定論。
- 一次只問我一個問題；優先問真實事件，而不是抽象假設。
- 如果資料彼此不一致，不要判定哪一個錯；把落差當成值得探索的線索。
- 不要要求我提供姓名、完整生日、LINE ID、帳號或其他識別資料。
`;

  if (track === 'career') {
    return `你現在是我的「職涯與第二曲線探索教練」。

下面是我完成「天賦原動力」後整理出的非識別化線索：

${facts}

${sharedRules}
你的任務不是直接告訴我「適合什麼職業」，而是陪我找出哪些「活動、角色、工作環境與任務型態」比較容易讓我投入。

請依序進行：
1. 先整理 3～5 個重複出現的職涯線索，並區分「已有證據」與「仍需驗證」。
2. 接著一次只問我一個具體問題，例如：最近什麼時候做過類似事情？哪一部分讓我最有成就感？
3. 至少理解 5 個真實案例後，再提出 3 個值得探索的方向。方向不要只寫職業名稱，請寫成「活動＋角色＋環境＋任務」。
4. 每個方向都要說明：為什麼值得探索、目前證據、還缺什麼證據、可能的風險或張力。
5. 最後替每個方向設計一個 7～14 天、低成本、不必離職的小實驗。

現在先不要給我職業清單。請先告訴我：目前你看到哪 3 個最值得驗證的職涯線索？然後只問我第一個問題。`;
  }

  if (track === 'action') {
    return `你現在是我的「7～14 天行動實驗教練」。

下面是我完成「天賦原動力」後整理出的非識別化線索：

${facts}

${sharedRules}
請幫我把自我探索變成可以驗證的小行動，而不是一次做重大人生決定。

請先整理目前最值得驗證的 3 個假設，例如：「我可能在整理複雜資訊並幫助別人理解時比較有能量。」
然後為我設計 3 個低風險實驗，每個實驗都必須：
- 7～14 天內可以開始
- 不需要立刻離職
- 不需要重大投資
- 一次只驗證一個主要假設
- 有清楚的完成條件與觀察方式

每個實驗請用這個格式：
【要驗證的假設】
【我要做什麼】
【預計多久】
【完成條件】
【我要觀察】做完後是更有精神還是更疲憊？我最喜歡／最不喜歡哪一部分？我願不願意再次做？
【下一步判斷】繼續、調整或停止的判斷標準。

現在先不要一次排滿兩週。先告訴我哪一個假設最值得優先驗證，並只問我第一個澄清問題。`;
  }

  return `你現在是我的「自我探索對話教練」。

下面是我完成「天賦原動力」後整理出的非識別化線索：

${facts}

${sharedRules}
你的任務不是替我定義人格或決定人生，而是透過提問、整理與反思，幫我更了解自己的能量來源、反覆出現的能力、容易消耗的情境，以及尚未充分使用的可能性。

請依序進行：
1. 先整理 A. 3～5 個重複線索 B. 可能讓我有能量的情境 C. 可能讓我消耗的情境 D. 一致之處 E. 看似不一致但值得理解的地方。
2. 接下來一次只問我一個問題，透過真實經驗驗證你的推測。優先問「最近什麼時候發生過？」「當時你在做什麼？」「哪一部分讓你特別有成就感？」。
3. 至少理解我 5 個真實案例後，再整理：我的能量來源、容易投入的活動、可能尚未充分使用的能力、容易消耗的情境、目前真正重視的需求，以及 3 個值得繼續探索的方向。
4. 方向不要直接等同於職業，請描述成「活動、角色、環境或任務」。
5. 最後再和我一起設計 3 個 7～14 天內可開始的低風險小實驗。

最重要的是：任何測驗都不能定義我；測驗只是鏡子，我的真實人生經驗才是最後的驗證。

現在請先告訴我：從目前資料中，你看到哪 3 個最值得我繼續探索的重複線索？然後只問我第一個問題。`;
}

async function promptMessages(
  assessment: AssessmentRecord,
  track: ExplorationTrack,
  services: RuntimeServices,
): Promise<LineMessage[]> {
  const report = await services.repositories.reports.findByAssessmentId(assessment.assessmentId);
  const prompt = buildExplorationPrompt(assessment, track, report);
  const trackTitle: Record<ExplorationTrack, string> = {
    self: '🌱 更了解自己',
    career: '💼 工作與第二曲線',
    action: '🧭 7～14 天行動實驗',
  };
  return [
    { type: 'text', text: `${trackTitle[track]}\n\n下面是你的專屬 AI 探索提示詞。長按文字即可複製，再貼到 ChatGPT、Gemini 或其他你慣用的 AI。` },
    ...textMessages(prompt),
  ].slice(0, 5);
}

async function handleTrigger(
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

  const participant = await services.repositories.participants.findByLineUserId(lineUserId);
  if (!participant) {
    await replyLine(replyToken, [identityNotLinkedFlex(config.appBaseUrl)], config, fetchImpl);
    return;
  }

  const params = new URLSearchParams(data);
  const action = params.get('action');
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

export function createLinePostCourseWebhookHandler(
  services: RuntimeServices,
  config: LineMessagingConfig | undefined = lineMessagingConfigFromEnv(),
  fetchImpl: LineFetch = fetch,
): (request: Request) => Promise<Response> {
  return async (request) => {
    requireMethod(request, 'POST');
    if (!config) throw new HttpError(503, 'line_messaging_not_configured', 'LINE Messaging API 尚未設定。');

    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature');
    if (!verifyLineSignature(rawBody, signature, config.channelSecret)) {
      throw new HttpError(401, 'invalid_line_signature', 'LINE webhook signature 驗證失敗。');
    }

    const events = parseEvents(rawBody);
    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text?.trim() ?? '';
        if (TRIGGER_WORDS.has(text)) await handleTrigger(event, services, config, fetchImpl);
      } else if (event.type === 'postback') {
        await handlePostback(event, services, config, fetchImpl);
      }
    }

    return json({ ok: true });
  };
}
