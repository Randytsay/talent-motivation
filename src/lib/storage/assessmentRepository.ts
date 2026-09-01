import type { AssessmentDraft, AssessmentStep, Priority, RiasecAnswer, RiasecCode, TalentUsage } from '../../types/domain';

const LOCAL_DRAFT_KEY = 'talent-motivation:assessment-draft:v1';

const VALID_STEPS = new Set<AssessmentStep>([
  'landing',
  'consent',
  'birthday',
  'life-path',
  'resonance',
  'transition',
  'riasec',
  'energy',
  'riasec-result',
  'talent-usage',
  'priorities',
  'report',
]);
const VALID_RIASEC_CODES = new Set<RiasecCode>(['R', 'I', 'A', 'S', 'E', 'C']);
const VALID_ANSWERS = new Set<RiasecAnswer>([1, 2, 3, 4]);
const VALID_TALENT_USAGE = new Set<TalentUsage>([20, 40, 60, 80, 100]);
const VALID_PRIORITIES = new Set<Priority>([
  '收入更多元',
  '工作更穩定',
  '更多時間自主',
  '更有成就感',
  '更能發揮自己的能力',
  '改善工作／人際環境',
  '新的學習與發展方向',
  '我現在還不確定',
]);

export interface AssessmentDraftRepository {
  load(): AssessmentDraft | null;
  save(draft: AssessmentDraft): void;
  clear(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValidAnswers(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, answer]) => /^q\d{2}$/.test(key) && VALID_ANSWERS.has(answer as RiasecAnswer));
}

function isDraft(value: unknown): value is AssessmentDraft {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<AssessmentDraft>;

  if (
    candidate.version !== 1 ||
    !VALID_STEPS.has(candidate.step as AssessmentStep) ||
    typeof candidate.birthDate !== 'string' ||
    !hasValidAnswers(candidate.riasecAnswers) ||
    !Array.isArray(candidate.priorities) ||
    !candidate.priorities.every((priority) => VALID_PRIORITIES.has(priority as Priority))
  ) {
    return false;
  }

  if (candidate.subjectiveDriver !== undefined && !VALID_RIASEC_CODES.has(candidate.subjectiveDriver)) return false;
  if (candidate.talentUsage !== undefined && !VALID_TALENT_USAGE.has(candidate.talentUsage)) return false;
  return true;
}

export const localAssessmentDraftRepository: AssessmentDraftRepository = {
  load() {
    try {
      const value = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!value) return null;
      const parsed: unknown = JSON.parse(value);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(draft) {
    try {
      window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage is a convenience for Phase 1 recovery, not a hard dependency.
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(LOCAL_DRAFT_KEY);
    } catch {
      // Users must still be able to continue when browser storage is unavailable.
    }
  },
};
