import { randomUUID } from 'node:crypto';
import type { AIReport, AssessmentRecord } from './contracts';
import { HttpError } from './http';

export interface AIProvider {
  generate(assessment: AssessmentRecord): Promise<AIReportContent>;
}

const REQUIRED_KEYS = [
  'repeated_signals', 'motivator_summary', 'possible_tensions', 'exploration_directions', 'reflection_question', 'summary',
] as const;
const PROHIBITED_PATTERNS = [/你就是/, /你的天命/, /你一定適合/, /這證明你/, /你應該辭職/, /加入某商業機會/];

export interface AIReportContent {
  repeated_signals: string[];
  motivator_summary: string;
  possible_tensions: string[];
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
  const keys = Object.keys(record).sort();
  if (keys.length !== REQUIRED_KEYS.length || !REQUIRED_KEYS.every((key) => keys.includes(key))) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告欄位不符合固定格式。');
  }
  if (!strings(record.repeated_signals) || !strings(record.possible_tensions) || !strings(record.exploration_directions)) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告清單格式無效。');
  }
  const textKeys = ['motivator_summary', 'reflection_question', 'summary'] as const;
  if (!textKeys.every((key) => typeof record[key] === 'string' && record[key].trim())) {
    throw new HttpError(502, 'ai_invalid_schema', 'AI 報告文字格式無效。');
  }
  const allCopy = REQUIRED_KEYS.flatMap((key) => Array.isArray(record[key]) ? record[key] as string[] : [record[key] as string]).join('\n');
  if (PROHIBITED_PATTERNS.some((pattern) => pattern.test(allCopy))) {
    throw new HttpError(502, 'ai_content_guardrail', 'AI 報告未通過內容安全檢查。');
  }
  return {
    repeated_signals: record.repeated_signals as string[],
    motivator_summary: record.motivator_summary as string,
    possible_tensions: record.possible_tensions as string[],
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
      motivator_summary: '這些線索可能反映你在特定投入方式中更容易感到有意義；可以持續觀察實際情境。',
      possible_tensions: ['活動偏好與你主觀感受到的能量可能不完全相同，兩者都可以保留並繼續觀察。'],
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

const GEMINI_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    repeated_signals: { type: 'array', items: { type: 'string' } },
    motivator_summary: { type: 'string' },
    possible_tensions: { type: 'array', items: { type: 'string' } },
    exploration_directions: { type: 'array', items: { type: 'string' } },
    reflection_question: { type: 'string' },
    summary: { type: 'string' },
  },
  required: [...REQUIRED_KEYS],
  additionalProperties: false,
  propertyOrdering: [...REQUIRED_KEYS],
} as const;

function aiFacts(assessment: AssessmentRecord): string {
  return JSON.stringify({
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
  });
}

/** Server-only Gemini REST adapter. No model receives a birth date or raw answers. */
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
          systemInstruction: {
            parts: [{ text: [
              '你是「天賦原動力」的自我探索報告整理者。',
              '只能依據提供的 deterministic facts 解讀，不能重算或修改 Life Path、RIASEC scores、Top3。',
              '不可使用「你就是、你的天命、你一定適合、這證明你、你應該辭職」等定論；可使用「可能、值得留意、可以探索」。',
              '探索方向優先寫現職調整與小型副專案，不可導向特定商業機會。',
              '只輸出符合 schema 的 JSON，不包含 markdown、生日、原始作答或額外欄位。',
            ].join('\n') }],
          },
          contents: [{ role: 'user', parts: [{ text: `請根據以下已驗證事實產生報告：\n${aiFacts(assessment)}` }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: GEMINI_REPORT_SCHEMA,
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
    try {
      return validateAIReport(JSON.parse(text));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'gemini_invalid_response', 'AI 綜合解析暫時無法完成；你的測驗結果已保存。');
    }
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
