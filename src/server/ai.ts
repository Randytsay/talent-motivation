import { randomUUID, sign } from 'node:crypto';
import type { AIReport, AssessmentRecord } from './contracts';
import { HttpError } from './http';
import { birthProfileFacts } from '../lib/scoring/birthProfile';
import { birthSignatureFacts } from '../lib/scoring/birthSignature';
import { extractRiasecItemSignals } from '../lib/scoring/riasecSignals';
import { RIASEC_META } from '../data/riasecQuestions';

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
    const top = assessment.riasecResult.top3Code;
    const topName = assessment.riasecResult.top3.map((code) => RIASEC_META[code].name.replace('型', '')).join('、');
    const subjectiveName = RIASEC_META[assessment.subjectiveDriver].name;
    const priorities = assessment.priorities.join('、') || '目前在意的生活方向';
    return validateAIReport({
      repeated_signals: [
        `偏好 ${top} 的活動，可能讓你比較容易投入`,
        `你評估天賦使用感為 ${assessment.talentUsage}%`,
        `你目前在意：${priorities}`,
      ],
      birth_profile_summary: assessment.birthProfile
        ? `如果這個出生結構的 ${assessment.birthProfile.pyramid.main} 號反思角度符合你的經驗，你可以想想哪些選擇空間對你特別重要。`
        : '出生日期只提供一個象徵角度；如果有共鳴，可以想想它和哪些生活經驗連得上。',
      motivator_summary: `你的活動偏好較靠近${topName}，你選的能量線索是「${subjectiveName}」。如果這兩者都符合你的經驗，你可能在先理解問題、再用自己的方式回應時比較容易投入；這是偏好線索，不等於已驗證的能力。`,
      possible_tensions: ['如果你同時在意保留選擇與完成眼前的事，這可能是自然的兩難；可以回想最近哪個條件讓兩邊比較能兼顧。'],
      unused_potential: `你已經感覺到 ${assessment.talentUsage}% 的天賦使用感，也清楚目前在意「${priorities}」。可以觀察自主空間、討論品質或界線的哪一項，最影響你把想法帶進生活。`,
      exploration_directions: [
        '這週記下一次投入與一次耗損的時刻，留意當時的內容、選擇空間和互動方式。',
        '從記下的差別挑一項小調整，下一次多保留一點提問或改做法的空間。',
      ],
      reflection_question: `如果想讓現在的 ${assessment.talentUsage}% 多一點滿意，你最希望增加哪一種時刻？`,
      summary: `你把天賦使用感評為 ${assessment.talentUsage}%，也在意「${priorities}」。你可能已經有能發揮自己的時刻，只是還想看看哪些條件能讓它更常出現。`,
    });
  }
}

/** Adapter boundary for a live model; credentials and network wiring stay server-only. */
export interface RealAIProvider extends AIProvider {
  /** Identifies the configured server-side model adapter for audit metadata. */
  readonly providerName: string;
}

const REPORT_JSON_SCHEMA = {
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

const REPORT_SYSTEM_PROMPT = [
  '你是「天賦原動力」的自我探索報告整理者。',
  '只能依據提供的 deterministic facts 解讀，不能重算或修改 Life Path、RIASEC scores、Top3。',
  '只輸出固定八欄 JSON，不包含 markdown、生日、原始作答、推理過程或額外欄位。',
  '使用繁體中文與第二人稱「你」，語氣溫暖、自然、具體，像仔細聽完回答後給出整理；不要寫成制式測驗報告。',
  '不可使用「你就是、你天生就是、你的天命、你一定適合、這證明你、你應該辭職、命中注定」等定論，也不可預測財運、疾病或健康。請用「可能、可以觀察、如果符合你的經驗」留下確認或不同意的空間。',
  '寫作順序固定：先呼應這次回答中的具體資料，再翻譯成一個日常情境，最後邀請讀者自行確認；不要先丟類型標籤或泛泛稱讚。',
  '內容依據優先順序：1. priorities 與 talent_usage_pct；2. exploration_interest、reflections、subjective_energy；3. top3 與 riasec_item_signals；4. birth_profile 與 birth_signature 只作次要反思提示，不能主導結論。',
  '至少在 summary 或 repeated_signals 中呼應一項使用者明確填答（若有 talent_usage_pct，請寫出百分比；若有 priorities，請具體提到至少一項）。資料不足時如實說明並邀請回想，不可編造工作、家庭、團隊、經歷或情緒。',
  '把類型與向度翻譯成日常行為，例如「遇到問題時可能想先弄懂原因，再決定怎麼做」。RIASEC 與主觀能量代表偏好或投入線索，不等於能力、職業適性或已驗證的表現。',
  '若 subjective_energy 與 top3 有相同向度，請在 motivator_summary 明確說出「你選的能量線索」與「對應的活動偏好」如何呼應；若兩者不同，請具體說明差異，不要只寫「兩個角度出現相同線索」。',
  'summary 是摘要開場：1 至 2 句、約 40 至 70 字。先承認已存在的投入，再說明這些資料可以拿來觀察，不與完整解析重複堆疊。',
  'repeated_signals 提供 3 個簡短個人線索，每項約 12 至 22 字；每項只放一個具體訊號與行為情境，不要用空格、頓號或分號串成長段落。',
  'exploration_directions 提供 1 至 3 個方向；第一項是約 30 至 50 字、低負擔且可在近期嘗試的小行動，優先觀察讓人投入或耗損的條件。其他項目可補充一個環境調整或小型嘗試，不預設使用者有正職、團隊、跨部門資源或餘力做副業，也不要把每項都寫成更多工作。',
  'motivator_summary 用 1 至 2 句、約 60 至 110 字，連結 top3、subjective_energy 或 reflections，說明什麼情境可能讓人投入，清楚區分偏好與能力。',
  'unused_potential 用 1 至 2 句、約 60 至 110 字，先承認已存在的投入，再指出可能影響發揮的條件（例如自主空間、討論品質、界線或互動）；不要寫成能力不足，也不要要求更努力。',
  'possible_tensions 提供 1 至 2 個、每項約 45 至 80 字的條件式觀察。若資料中有兩組不同線索，寫「如果你也同時在乎 A 與 B，這可能是自然的兩難」，邀請核對生活；不要從出生數字推導責任、孤獨、人生階段或心理狀態。',
  'birth_profile_summary 用 1 至 2 句、約 40 至 80 字，明確寫成「如果這個反思角度符合你的經驗，你可以想想……」。出生日期只提供象徵語言，不代表命定的人格、近期狀態或人生方向。',
  'reflection_question 只提出一個約 30 至 60 字、沒有標準答案的問題，優先回扣 talent_usage_pct、priorities 或一個可回想的近期情境。',
  '可以在真正值得先讀的短語外加【重點】與【/重點】標記，每個文字欄位最多一次；不要使用 Markdown 粗體。',
  `輸出必須符合這份 JSON Schema：${JSON.stringify(REPORT_JSON_SCHEMA)}`,
].join('\n');


function aiFacts(assessment: AssessmentRecord): string {
  const itemSignals = extractRiasecItemSignals(assessment.riasecAnswers);
  return JSON.stringify({
    birth_profile: assessment.birthProfile ? birthProfileFacts(assessment.birthProfile) : undefined,
    birth_signature: assessment.birthSignature ? birthSignatureFacts(assessment.birthSignature) : undefined,
    life_path: assessment.lifePath.value,
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
    promptVersion: 'p5-summary-first-reflective-v1',
    modelName: provider instanceof MockAIProvider ? 'mock-ai-provider' : (provider as RealAIProvider).providerName,
    generatedAt: now(),
  };
}
