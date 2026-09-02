import { randomUUID, sign } from 'node:crypto';
import type { AIReport, AssessmentRecord } from './contracts';
import { HttpError } from './http';
import { birthProfileFacts } from '../lib/scoring/birthProfile';
import { birthSignatureFacts } from '../lib/scoring/birthSignature';
import { extractRiasecItemSignals } from '../lib/scoring/riasecSignals';

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
    return validateAIReport({
      repeated_signals: [
        `活動偏好結果中的 ${top} 是值得留意的投入線索。`,
        `你選擇「${assessment.subjectiveDriver}」作為做了反而有精神的線索。`,
      ],
      birth_profile_summary: assessment.birthProfile
        ? `出生結構的核心數 ${assessment.birthProfile.pyramid.main}，外顯與內在兩層可作為觀察自己的象徵語言。`
        : '出生結構可作為觀察自己的象徵語言，請與實際經驗一起理解。',
      motivator_summary: '這些線索可能反映你在特定投入方式中更容易感到有意義；可以持續觀察實際情境。',
      possible_tensions: ['活動偏好與你主觀感受到的能量可能不完全相同，兩者都可以保留並繼續觀察。'],
      unused_potential: assessment.talentUsage < 60 ? '目前的天賦使用感偏低，可以從一個小任務開始試著增加投入。' : '目前已使用一部分天賦，仍可觀察哪些情境能讓投入感更穩定。',
      exploration_directions: ['先從現職中調整一個可嘗試的小任務，再觀察投入後的感受。'],
      reflection_question: '最近哪一件具體事情，讓你投入後感到更有精神？',
      summary: `這是一份以 ${top} 與你的主觀回饋為線索的探索摘要，不是職涯或人格定論。`,
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
  '不可使用「你就是、你的天命、你一定適合、這證明你、你應該辭職」等定論；可使用「可能、值得留意、可以探索」。',
  '探索方向優先寫現職調整與小型副專案，不可導向特定商業機會。',
  '只輸出固定八欄 JSON，不包含 markdown、生日、原始作答、推理過程或額外欄位。',
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
      ? record.birth_profile_summary : '出生結構可作為觀察自己的象徵語言，請與實際經驗一起理解。',
    unused_potential: typeof record.unused_potential === 'string' && record.unused_potential.trim()
      ? record.unused_potential : '可以從一個小任務開始觀察天賦使用感的變化。',
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
    promptVersion: 'p1-content-system-v1',
    modelName: provider instanceof MockAIProvider ? 'mock-ai-provider' : (provider as RealAIProvider).providerName,
    generatedAt: now(),
  };
}
