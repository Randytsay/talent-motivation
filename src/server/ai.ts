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
    modelName: provider instanceof MockAIProvider ? 'mock-ai-provider' : 'provider-defined',
    generatedAt: now(),
  };
}
