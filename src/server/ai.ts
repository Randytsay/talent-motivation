import { randomUUID, sign } from 'node:crypto';
import type { AIReport, AssessmentRecord } from './contracts';
import { HttpError } from './http';
import { birthProfileFacts } from '../lib/scoring/birthProfile';
import { birthSignatureFacts } from '../lib/scoring/birthSignature';
import { extractRiasecItemSignals } from '../lib/scoring/riasecSignals';
import { RIASEC_META } from '../data/riasecQuestions';
import { LIFE_PATH_CONTENT } from '../data/lifePathContent';

export interface AIProvider {
  generate(assessment: AssessmentRecord): Promise<AIReportContent>;
}

const REQUIRED_KEYS = [
  'repeated_signals', 'birth_profile_summary', 'motivator_summary', 'possible_tensions', 'unused_potential', 'exploration_directions', 'reflection_question', 'summary',
] as const;
const PROHIBITED_PATTERNS = [/你就是/, /你的天命/, /你一定適合/, /這證明你/, /你應該辭職/, /加入某商業機會/, /命中注定/, /財運/, /疾病/, /健康預測/, /你天生就是/, /你一定要/, /命定職業/, /天生不足/];

export interface AIReportContent {
  repeated_signals: string[];
  birth_profile_summary: string;
  motivator_summary: string;
  possible_tensions: string[];
  unused_potential: string;
  exploration_directions: string[];
  reflection_question: string;
  summary: string;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

/** Enforces the fixed content contract before a provider response can be saved. */
export function validateAIReport(value: unknown): AIReportContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(502, 'ai_invalid_schema', 'AI 報告格式無效。');
  const record = value as Record<string, unknown>;
  const rawCopy = JSON.stringify(record);
  if (PROHIBITED_PATTERNS.some((pattern) => pattern.test(rawCopy))) {
    throw new HttpError(502, 'ai_content_guardrail', 'AI 報告未通過內容安全檢查。');
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== REQUIRED_KEYS.length || !REQUIRED_KEYS.every((key) => keys.includes(key))) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告欄位不符合固定格式。');
  }
  if (!strings(record.repeated_signals) || !strings(record.possible_tensions) || !strings(record.exploration_directions)) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告清單格式無效。');
  }
  const textKeys = ['birth_profile_summary', 'motivator_summary', 'unused_potential', 'reflection_question', 'summary'] as const;
  if (!textKeys.every((key) => typeof record[key] === 'string' && record[key].trim())) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告文字格式無效。');
  }
  const allCopy = REQUIRED_KEYS.flatMap((key) => Array.isArray(record[key]) ? record[key] as string[] : [record[key] as string]).join('\n');
  if (PROHIBITED_PATTERNS.some((pattern) => pattern.test(allCopy))) {
    throw new HttpError(502, 'ai_content_guardrail', 'AI 報告未通過內容安全檢查。');
  }
  return {
    repeated_signals: record.repeated_signals as string[],
    birth_profile_summary: record.birth_profile_summary as string,
    motivator_summary: record.motivator_summary as string,
    possible_tensions: record.possible_tensions as string[],
    unused_potential: record.unused_potential as string,
    exploration_directions: record.exploration_directions as string[],
    reflection_question: record.reflection_question as string,
    summary: record.summary as string,
  };
}

/** Deterministic local stand-in. It interprets validated facts but never calculates them. */
export class MockAIProvider implements AIProvider {
  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    const topName = assessment.riasecResult.top3.map((code) => RIASEC_META[code].name.replace('型', '')).join('、');
    const subjectiveName = RIASEC_META[assessment.subjectiveDriver].name;
    const priorities = assessment.priorities.join('、') || '目前在意的生活方向';
    const lifePathResonance = assessment.lifePathTopResonance.trim();
    return validateAIReport({
      repeated_signals: [
        '在需要釐清複雜脈絡或獨立推進時，能展現出敏銳而清晰的洞察力',
        `面對天賦使用感約 ${assessment.talentUsage}% 的現況，內心清楚知道自己還有很多能量尚未充分舒展`,
        `目前極度渴望在生活中找回「${priorities}」，擺脫被瑣碎事務消耗的狀態`,
      ],
      birth_profile_summary: assessment.birthProfile
        ? `你選了「${lifePathResonance}」作為最有共鳴的線索。這深刻貼近你的日常節奏：骨子裡你對事物的自主性與真實價值有著天然的堅持，當環境能給予充分信任與摸索空間時，你的專注與爆發力會自然湧現；相反地，若被困在僵化流程或反覆等待中，便容易感到內在熱情被悄悄磨損。`
        : '出生結構反映出你骨子裡獨特的處事節奏；當生活貼近你的日常核心堅持時，你會感覺特別自在踏實。',
      motivator_summary: `最能讓你自然進入心流的高光時刻，通常發生在結合了「${topName}」特質的情境中，特別是能呼應內心「${subjectiveName}」驅動力的瞬間。當你能先弄明白背後的本質邏輯，再用自己的專業把想法落地成扎實的成果時，哪怕過程充滿挑戰，你也會感到無比充實且眼裡有光。`,
      possible_tensions: [
        '你內心深處最常拉扯的兩個聲音：一方面你想把事情做得周全扎實、對責任毫不敷衍；但另一方面，內心深處又極度渴望擁有不受打擾的個人自主節奏。當這兩者在現實中衝突時，往往容易演變成無聲的內耗。',
      ],
      unused_potential: `你把目前的天賦使用感評為 ${assessment.talentUsage}%，並特別在乎「${priorities}」。這說明你並非能力不足，而是當前的環境與協作條件可能正卡住了你的施展——過多的溝通摩擦、缺乏掌控感的推進方式，讓你常常感到「有力使不上」。`,
      exploration_directions: [
        '這週為自己刻意保留一個 90 分鐘「不被打擾的專注微時段」，完全依照自己的步調去推進一件你在意的事。',
        '在一次感到暗耗心累的時刻，記錄下究竟是哪條界線或哪種互動方式踩到了底線，作為後續為自己微調空間的依據。',
      ],
      reflection_question: `如果能為現在的生活鬆開一個束縛，你最希望換取哪種真正讓自己放鬆或全心投入的時刻？`,
      summary: `你很清楚自己不是沒有能力，但現在的環境常常讓你感到「有力使不上」。你把天賦使用感評為 ${assessment.talentUsage}%，也在意「${priorities}」；這份報告想告訴你：你不需要變得更迎合外界標準，而是需要為自己爭取更能自在舒展的空間與條件。`,
    });
  }
}

/** Adapter boundary for a live model; credentials and network wiring stay server-only. */
export interface RealAIProvider extends AIProvider {
  /** Identifies the configured server-side model adapter for audit metadata. */
  readonly providerName: string;
}

export const REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    repeated_signals: { type: 'array', items: { type: 'string' } },
    birth_profile_summary: { type: 'string' },
    motivator_summary: { type: 'string' },
    possible_tensions: { type: 'array', items: { type: 'string' } },
    unused_potential: { type: 'string' },
    exploration_directions: { type: 'array', items: { type: 'string' } },
    reflection_question: { type: 'string' },
    summary: { type: 'string' },
  },
  required: [...REQUIRED_KEYS],
  additionalProperties: false,
  propertyOrdering: [...REQUIRED_KEYS],
} as const;

export const REPORT_SYSTEM_PROMPT = [
  '你是「天賦原動力」的深度自我探索教練與心靈畫像整理者。',
  '你的核心任務：根據提供的已驗證客觀事實，寫出一份讓讀者讀完會「全身起雞皮疙瘩、深深覺得被懂、被同理、被看見」的專屬天賦講評。',
  '只能依據提供的 deterministic facts 解讀，不能重算或修改 Life Path、RIASEC scores、Top3。',
  '只輸出固定八欄 JSON，不包含 markdown 外框、生日、原始作答、推理過程或額外欄位。',
  '【語言與同理風格要求】',
  '- 使用繁體中文與第二人稱「你」，語氣像一位默默懂你很久的敏銳導師或溫暖摯友，深刻、真誠、富有心理洞察力。',
  '- 堅決告別冷冰冰的制式測驗口吻、HR 報告腔調或外交官式的防禦性套話。',
  '- 不要在每句話裡塞「這不等於能力、留待你確認、純屬偏好」等破壞閱讀體驗的免責緩衝詞（免責宣告由前端系統統一展示，你的正文必須專注於深刻的心理描繪與情境同理）。',
  '- 善用「日常微場景（Micro-moments）」與「內心獨白」：把抽象向度翻譯成有畫面、有痛感或有光芒的具體生活/工作細節（例如：面對模糊指示時、開著冗長無效的會議時、獨自把複雜混亂理出頭緒時）。',
  '- 嚴格遵守倫理底線：不可使用「命中注定、你的天命、算命吉凶、財富命定、疾病預測」等迷信定論，不可指導使用者離職或參與特定商業投資。',
  '【八欄內容撰寫指引】',
  '1. summary（💡 為你整理的一句心底話 / 情境畫像）：約 90 至 150 字。先描摹出一個立體、鮮活的心理畫像，直接說出讀者藏在心底說不出口的委屈、矛盾與真實渴望。先同理讀者目前「有力使不上」或「很想做好但被環境條件牽制」的心聲，並自然回扣 talent_usage_pct（百分比）與 priorities（至少一項）。讓讀者第一眼就覺得「天啊，你真的懂我」。',
  '2. repeated_signals（🔍 這次回答中反覆浮現的特質線索）：精準提供 3 個鮮活特質線索，每項約 20 至 35 字。每項結合具體的日常行為或場景，點出讀者讓人點頭稱是的鮮明特質（例如在混亂中總想先找出規律、比起空泛讚美更重視掌控感等）。',
  '3. birth_profile_summary（🌱 你習慣看待世界的方式 · 深層底色）：約 100 至 160 字。深入解讀讀者骨子裡的心理底色與思維節奏。優先引用 life_path_top_resonance，並結合 life_path_context 中的動力與特質素材，生動描述讀者骨子裡對事物的看法、內在節奏與深層堅持，以及在什麼環境條件下最能展現這種力量，在什麼壓迫下會想抽離。',
  '4. motivator_summary（⚡ 最能讓你自然進入心流的事情 · 高光時刻）：約 120 至 180 字。生動刻畫「你的高光時刻」——在什麼樣的具體場景、任務型態、協作氛圍下，讀者整個人會眼睛發亮、專注沉浸、哪怕再累也充滿成就感。將 top3 與 subjective_energy 的特質轉化為一個鮮活生動的做事畫面，讓讀者讀了恨不得立刻去做。',
  '5. unused_potential（🪞 你現在心裡最真實的卡點 · 暗耗時刻）：約 120 至 180 字。精準描寫「你的暗耗時刻」——回扣 talent_usage_pct 與 priorities，深入同理讀者在現實環境中「有力使不上」的真正癥結（例如：多頭馬車的指令、缺乏自主主導空間、無意義的人際消耗）。肯定讀者的能力已經存在，只是環境條件卡住了施展。',
  '6. possible_tensions（⚖️ 你內心深處最常拉扯的兩個聲音）：提供 1 至 2 個、每項約 70 至 120 字的深刻張力觀察。生動寫出讀者內心最常打架的兩個聲音（例如：「一方面追求極致與完美、不想辜負期待，另一方面又極度渴望能擁有完全屬於自己的節奏與界線」），一針見血戳中內心深處的矛盾拉扯。',
  '7. exploration_directions（🧭 可以嘗試的微小方向）：提供 1 至 3 個方向；第一項是約 40 至 70 字、極低心理負擔、本週就能嘗試的「微實驗」（例如為自己留出一段不被打擾的專注時間、或在某個情境下劃下一個微小界線）。其他項目可提供環境或心態上的小嘗試。',
  '8. reflection_question（💭 今天留給自己的一句提問）：一句約 35 至 65 字、直擊靈魂又溫柔的開放提問，引導讀者回扣 talent_usage_pct 或當前生活，放下焦慮，看清自己真正渴望的生活模樣。',
  '可以在真正值得觸動心靈或關鍵洞察的短語外加【重點】與【/重點】標記，每個文字欄位最多一次；不要使用 Markdown 粗體。',
  `輸出必須符合這份 JSON Schema：${JSON.stringify(REPORT_JSON_SCHEMA)}`,
].join('\n');


function aiFacts(assessment: AssessmentRecord): string {
  const itemSignals = extractRiasecItemSignals(assessment.riasecAnswers);
  return JSON.stringify({
    birth_profile: assessment.birthProfile ? birthProfileFacts(assessment.birthProfile) : undefined,
    birth_signature: assessment.birthSignature ? birthSignatureFacts(assessment.birthSignature) : undefined,
    life_path: assessment.lifePath.value,
    life_path_context: {
      label: LIFE_PATH_CONTENT[assessment.lifePath.value].label,
      core_motivation: LIFE_PATH_CONTENT[assessment.lifePath.value].coreMotivation,
      strengths: LIFE_PATH_CONTENT[assessment.lifePath.value].strengths,
      drains: LIFE_PATH_CONTENT[assessment.lifePath.value].drains,
    },
    life_path_resonance: assessment.lifePathResonance,
    life_path_top_resonance: assessment.lifePathTopResonance,
    riasec_scores: assessment.riasecResult.scores,
    top3: assessment.riasecResult.top3,
    top3_code: assessment.riasecResult.top3Code,
    subjective_energy: assessment.subjectiveDriver,
    talent_usage_pct: assessment.talentUsage,
    priorities: assessment.priorities,
    exploration_interest: assessment.explorationInterest,
    riasec_item_signals: {
      high: itemSignals.highItems.map(({ dimension, text }) => ({ dimension, text })),
      low: itemSignals.lowItems.map(({ dimension, text }) => ({ dimension, text })),
    },
    reflections: assessment.reflections,
    age_band: assessment.birthProfile?.ageBand,
  });
}

function withV2Defaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    birth_profile_summary: typeof record.birth_profile_summary === 'string' && record.birth_profile_summary.trim()
      ? record.birth_profile_summary : '出生日期只提供一個象徵角度；如果有共鳴，可以想想它和哪些生活經驗連得上。',
    unused_potential: typeof record.unused_potential === 'string' && record.unused_potential.trim()
      ? record.unused_potential : '可以先觀察一個讓你投入或耗損的時刻，記下當時的條件。',
  };
}

function parseProviderJson(text: string, errorCode: string): AIReportContent {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const withoutFence = withoutThinking
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const candidate = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
  try {
    return validateAIReport(withV2Defaults(JSON.parse(candidate)));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, errorCode, 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
  }
}

/** Server-only Gemini Developer API adapter retained for backwards compatibility. */
export class GeminiAIProvider implements RealAIProvider {
  readonly providerName: string;

  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.providerName = `gemini:${config.model}`;
  }

  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    const model = this.config.model.replace(/^models\//, '');
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: REPORT_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `請根據以下已驗證事實產生報告：\n${aiFacts(assessment)}` }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: REPORT_JSON_SCHEMA,
            temperature: 0.2,
          },
        }),
      },
    );
    if (!response.ok) throw new HttpError(502, 'gemini_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    const body = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) throw new HttpError(502, 'gemini_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    return parseProviderJson(text, 'gemini_invalid_response');
  }
}

interface VertexServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseVertexServiceAccount(serialized: string): VertexServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.client_email !== 'string' || typeof record.private_key !== 'string') {
    throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  }
  return {
    client_email: record.client_email,
    private_key: record.private_key,
    ...(typeof record.token_uri === 'string' ? { token_uri: record.token_uri } : {}),
  };
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Standard Google service-account OAuth flow for a server-only Vertex AI request. */
async function vertexServiceAccountToken(
  serializedCredentials: string,
  fetcher: typeof fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const credentials = parseVertexServiceAccount(serializedCredentials);
  const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodedJson({ alg: 'RS256', typ: 'JWT' })}.${encodedJson({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  let signature: string;
  try {
    signature = sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url');
  } catch {
    throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  }
  const assertion = `${unsigned}.${signature}`;
  const response = await fetcher(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) {
    throw new HttpError(502, 'vertex_auth_failed', 'Vertex AI 驗證暫時無法完成。');
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

/** Server-only Vertex AI adapter. Requests are billed to the configured Google Cloud project. */
export class VertexAIProvider implements RealAIProvider {
  readonly providerName: string;
  private cachedToken?: { accessToken: string; expiresAt: number };

  constructor(
    private readonly config: { projectId: string; location: string; serviceAccountJson: string; model: string },
    private readonly fetcher: typeof fetch = fetch,
    private readonly tokenProvider?: () => Promise<string>,
  ) {
    this.providerName = `vertex:${config.model}`;
  }

  private async accessToken(): Promise<string> {
    if (this.tokenProvider) return this.tokenProvider();
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.accessToken;
    const token = await vertexServiceAccountToken(this.config.serviceAccountJson, this.fetcher);
    this.cachedToken = { accessToken: token.accessToken, expiresAt: Date.now() + token.expiresIn * 1000 };
    return token.accessToken;
  }

  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    const location = this.config.location || 'global';
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    const model = this.config.model.replace(/^publishers\/google\/models\//, '').replace(/^models\//, '');
    const url = `https://${host}/v1/projects/${encodeURIComponent(this.config.projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: REPORT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `請根據以下已驗證事實產生報告：\n${aiFacts(assessment)}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: REPORT_JSON_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 1400,
        },
      }),
    });
    if (!response.ok) throw new HttpError(502, 'vertex_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    const body = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) throw new HttpError(502, 'vertex_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    return parseProviderJson(text, 'vertex_invalid_response');
  }
}

/** MiniMax OpenAI-compatible adapter. Supports Token Plan keys without exposing them to the browser. */
export class MiniMaxAIProvider implements RealAIProvider {
  readonly providerName: string;

  constructor(
    private readonly config: { apiKey: string; model: string; baseUrl: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.providerName = `minimax:${config.model}`;
  }

  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const response = await this.fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          { role: 'user', content: `請根據以下已驗證事實產生報告。只輸出 JSON：\n${aiFacts(assessment)}` },
        ],
        stream: false,
        max_completion_tokens: 1400,
        temperature: 0.2,
        top_p: 0.9,
        reasoning_split: true,
      }),
    });
    if (!response.ok) throw new HttpError(502, 'minimax_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: { status_code?: number };
    } | null;
    if (body?.base_resp?.status_code && body.base_resp.status_code !== 0) {
      throw new HttpError(502, 'minimax_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    }
    const text = body?.choices?.[0]?.message?.content;
    if (!text) throw new HttpError(502, 'minimax_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    return parseProviderJson(text, 'minimax_invalid_response');
  }
}

export async function generateValidatedReport(
  assessment: AssessmentRecord,
  provider: AIProvider,
  now: () => string = () => new Date().toISOString(),
): Promise<AIReport> {
  const generated = await provider.generate(assessment);
  const valid = validateAIReport(generated);
  return {
    ...valid,
    reportId: randomUUID(),
    assessmentId: assessment.assessmentId,
    promptVersion: 'p5-summary-first-reflective-v2-life-path-resonance',
    modelName: provider instanceof MockAIProvider ? 'mock-ai-provider' : (provider as RealAIProvider).providerName,
    generatedAt: now(),
  };
}
