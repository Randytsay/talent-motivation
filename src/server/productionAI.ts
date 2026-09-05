import { sign } from 'node:crypto';
import type { AssessmentRecord } from './contracts';
import { HttpError } from './http';
import type { AIReportContent, RealAIProvider } from './ai';
import { validateAIReport } from './ai';
import { birthProfileFacts } from '../lib/scoring/birthProfile';
import { birthSignatureFacts } from '../lib/scoring/birthSignature';
import { extractRiasecItemSignals } from '../lib/scoring/riasecSignals';

const REQUIRED_KEYS = [
  'repeated_signals', 'birth_profile_summary', 'motivator_summary', 'possible_tensions', 'unused_potential', 'exploration_directions', 'reflection_question', 'summary',
] as const;

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
  '語氣請像一位溫和、具體的陪伴者：先指出回答中看得見的線索，再說它可能代表什麼，讓人感到被理解而不是被評分。全文使用第二人稱「你」，多用「可能、似乎、可以觀察」，避免冷硬的測驗報告語氣。',
  '讓讀者感到「這段真的在說我」：每個段落至少連回一個 facts 中的具體線索（例如 Top3 向度、主觀能量選擇、優先關注或反思主題），說明你如何從該線索得到這個觀察；不要只寫任何人都適用的稱讚。不可捏造 facts 沒有提供的經歷。',
  'summary 必須是 2 句以內的溫暖開場：先肯定一個從 facts 看見的努力或特質，再說這份報告是邀請你驗證的線索，不是標籤或定論。',
  'repeated_signals 必須提供 2 至 3 個獨立項目，每項只寫一個訊號，20 至 55 字；不要把多個訊號用空格、頓號或分號串在同一項。',
  'birth_profile_summary 與 motivator_summary 各用 1 至 2 句，將數字或類型當成反思角度，連回可感受到的生活經驗；不要寫成命定或人格判決。',
  'unused_potential 要改寫成「可以再發揮的空間」，先承認你已經擁有的能力，再提出一個可以嘗試的延伸；不要使用「不足、缺乏、偏低、沒用好」等讓人被否定的字眼。',
  'possible_tensions 提供 1 至 2 個獨立項目，將拉扯寫成同時在乎兩件事的自然現象，並補一句這不代表你做錯了；不要把它寫成缺點或風險警告。',
  'exploration_directions 提供 2 至 3 個獨立項目，每項是一個低成本、可在 1 至 2 週內完成的小行動，包含情境或觀察方式；不要一次塞入多個動詞或抽象口號。',
  'reflection_question 只提出一個溫和、具體、沒有標準答案的問題，能讓人回想最近一個真實情境。',
  '可以在真正值得先讀的短語外加【重點】與【/重點】標記，每個文字段落最多 1 至 2 次；沒有必要時不要標記。不要使用 Markdown 粗體。',
  `輸出必須符合這份 JSON Schema：${JSON.stringify(REPORT_JSON_SCHEMA)}`,
  '所有文字使用繁體中文且不可空白；三個清單各提供 1 至 3 個非空白字串，每項及每個文字欄位以 80 字內為原則。',
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

function parseProviderJson(text: string, errorCode: string): AIReportContent {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const withoutFence = withoutThinking.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? withoutFence.slice(firstBrace, lastBrace + 1) : withoutFence;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (!parsed.birth_profile_summary) parsed.birth_profile_summary = '出生結構可作為觀察自己的象徵語言，請與實際經驗一起理解。';
    if (!parsed.unused_potential) parsed.unused_potential = '可以從一個小任務開始觀察天賦使用感的變化。';
    return validateAIReport(parsed);
  } catch (error) {
    console.error('AI report validation failed', {
      provider: errorCode.replace('_invalid_response', ''),
      code: error instanceof HttpError ? error.code : errorCode,
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, errorCode, 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
  }
}

interface VertexServiceAccount { client_email: string; private_key: string; token_uri?: string }

function parseVertexServiceAccount(serialized: string): VertexServiceAccount {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。'); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  const record = parsed as Record<string, unknown>;
  if (typeof record.client_email !== 'string' || typeof record.private_key !== 'string') throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。');
  return { client_email: record.client_email, private_key: record.private_key, ...(typeof record.token_uri === 'string' ? { token_uri: record.token_uri } : {}) };
}

function encodedJson(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }

async function vertexToken(serializedCredentials: string, fetcher: typeof fetch): Promise<{ accessToken: string; expiresIn: number }> {
  const credentials = parseVertexServiceAccount(serializedCredentials);
  const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodedJson({ alg: 'RS256', typ: 'JWT' })}.${encodedJson({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: tokenUri, iat: now, exp: now + 3600 })}`;
  let signature: string;
  try { signature = sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url'); }
  catch { throw new HttpError(503, 'vertex_credentials_invalid', 'Vertex AI 驗證設定無效。'); }
  const response = await fetcher(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!response.ok || !body?.access_token) {
    console.error('Vertex OAuth failed', { status: response.status, error: body?.error });
    throw new HttpError(502, 'vertex_auth_failed', 'Vertex AI 驗證暫時無法完成。');
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

export class ProductionVertexAIProvider implements RealAIProvider {
  readonly providerName: string;
  private cachedToken?: { accessToken: string; expiresAt: number };

  constructor(private readonly config: { projectId: string; location: string; serviceAccountJson: string; model: string }, private readonly fetcher: typeof fetch = fetch) {
    this.providerName = `vertex:${config.model}`;
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.accessToken;
    const token = await vertexToken(this.config.serviceAccountJson, this.fetcher);
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
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: REPORT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `請根據以下已驗證事實產生報告：\n${aiFacts(assessment)}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: REPORT_JSON_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 4096,
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
        },
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: { code?: number; status?: string; message?: string }; candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> } | null;
    if (!response.ok) {
      console.error('Vertex generation failed', {
        status: response.status,
        googleCode: body?.error?.code,
        googleStatus: body?.error?.status,
        googleMessage: body?.error?.message?.slice(0, 500),
        model: this.config.model,
        location,
        serviceAccount: parseVertexServiceAccount(this.config.serviceAccountJson).client_email,
      });
      throw new HttpError(502, 'vertex_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    }
    const candidate = body?.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.error('Vertex report truncated', { model: this.config.model, finishReason: candidate.finishReason });
      throw new HttpError(502, 'vertex_output_truncated', 'AI 解析內容尚未完整產生，請重新嘗試；你的測驗結果已保存。');
    }
    const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
    if (!text) throw new HttpError(502, 'vertex_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    return parseProviderJson(text, 'vertex_invalid_response');
  }
}

export class ProductionMiniMaxAIProvider implements RealAIProvider {
  readonly providerName: string;

  constructor(private readonly config: { apiKey: string; model: string; baseUrl: string }, private readonly fetcher: typeof fetch = fetch) {
    this.providerName = `minimax:${config.model}`;
  }

  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const response = await this.fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          { role: 'user', content: `請根據以下已驗證事實產生報告。只輸出 JSON：\n${aiFacts(assessment)}` },
        ],
        stream: false,
        thinking: { type: 'disabled' },
        reasoning_split: true,
        max_completion_tokens: 4096,
        temperature: 0.2,
        top_p: 0.9,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; reasoning_content?: string | null } }>;
      base_resp?: { status_code?: number; status_msg?: string };
    } | null;
    if (!response.ok || (body?.base_resp?.status_code && body.base_resp.status_code !== 0)) {
      console.error('MiniMax generation failed', {
        status: response.status,
        baseStatusCode: body?.base_resp?.status_code,
        baseStatusMessage: body?.base_resp?.status_msg?.slice(0, 300),
        model: this.config.model,
      });
      throw new HttpError(502, 'minimax_generation_failed', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    }
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      console.error('MiniMax report truncated', { model: this.config.model, finishReason: 'length' });
      throw new HttpError(502, 'minimax_output_truncated', 'AI 解析內容尚未完整產生，請重新嘗試；你的測驗結果已保存。');
    }
    const text = choice?.message?.content?.trim();
    if (!text) {
      console.error('MiniMax returned no content', {
        status: response.status,
        baseStatusCode: body?.base_resp?.status_code,
        finishReason: choice?.finish_reason,
        hasReasoning: Boolean(choice?.message?.reasoning_content),
        model: this.config.model,
      });
      throw new HttpError(502, 'minimax_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    }
    return parseProviderJson(text, 'minimax_invalid_response');
  }
}
