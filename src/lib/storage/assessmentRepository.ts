import type {
  AssessmentDraft,
  AssessmentStep,
  ExplorationInterest,
  LifePath,
  LifePathResonance,
  Priority,
  RiasecAnswer,
  RiasecCode,
  TalentUsage,
} from '../../types/domain';

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
const VALID_LIFE_PATHS = new Set<LifePath>([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);
const VALID_RESONANCE = new Set<LifePathResonance>(['high', 'partial', 'low']);
const VALID_RIASEC_CODES = new Set<RiasecCode>(['R', 'I', 'A', 'S', 'E', 'C']);
const VALID_ANSWERS = new Set<RiasecAnswer>([1, 2, 3, 4]);
const VALID_TALENT_USAGE = new Set<TalentUsage>([20, 40, 60, 80, 100]);
const VALID_EXPLORATION = new Set<ExplorationInterest>(['很想', '可以了解看看', '目前還沒有']);
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

const LIFE_PATH_REQUIRED = new Set<AssessmentStep>([
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
const RESONANCE_REQUIRED = new Set<AssessmentStep>([
  'transition',
  'riasec',
  'energy',
  'riasec-result',
  'talent-usage',
  'priorities',
  'report',
]);
const FULL_RIASEC_REQUIRED = new Set<AssessmentStep>(['energy', 'riasec-result', 'talent-usage', 'priorities', 'report']);
const SUBJECTIVE_REQUIRED = new Set<AssessmentStep>(['riasec-result', 'talent-usage', 'priorities', 'report']);
const TALENT_USAGE_REQUIRED = new Set<AssessmentStep>(['priorities', 'report']);

export interface AssessmentDraftRepository {
  load(): AssessmentDraft | null;
  save(draft: AssessmentDraft): void;
  clear(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLifePathResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    VALID_LIFE_PATHS.has(value.value as LifePath) &&
    Number.isInteger(value.rawDigitSum) &&
    Array.isArray(value.reductionSteps) &&
    value.reductionSteps.every((step) => Number.isInteger(step))
  );
}

function hasValidAnswers(value: unknown): value is Record<string, RiasecAnswer> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, answer]) => /^q(?:0[1-9]|1[0-8])$/.test(key) && VALID_ANSWERS.has(answer as RiasecAnswer),
  );
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
    candidate.priorities.length > 2 ||
    !candidate.priorities.every((priority) => VALID_PRIORITIES.has(priority as Priority))
  ) {
    return false;
  }

  const step = candidate.step as AssessmentStep;
  const answerCount = Object.keys(candidate.riasecAnswers).length;

  if (candidate.lifePath !== undefined && !isLifePathResult(candidate.lifePath)) return false;
  if (LIFE_PATH_REQUIRED.has(step) && !isLifePathResult(candidate.lifePath)) return false;

  if (candidate.lifePathResonance !== undefined && !VALID_RESONANCE.has(candidate.lifePathResonance)) return false;
  if (
    RESONANCE_REQUIRED.has(step) &&
    (!candidate.lifePathResonance || !VALID_RESONANCE.has(candidate.lifePathResonance) || !candidate.lifePathTopResonance)
  ) {
    return false;
  }

  if (step === 'riasec' && answerCount > 17) return false;
  if (FULL_RIASEC_REQUIRED.has(step) && answerCount !== 18) return false;

  if (candidate.subjectiveDriver !== undefined && !VALID_RIASEC_CODES.has(candidate.subjectiveDriver)) return false;
  if (SUBJECTIVE_REQUIRED.has(step) && !candidate.subjectiveDriver) return false;

  if (candidate.talentUsage !== undefined && !VALID_TALENT_USAGE.has(candidate.talentUsage)) return false;
  if (TALENT_USAGE_REQUIRED.has(step) && !candidate.talentUsage) return false;

  if (candidate.explorationInterest !== undefined && !VALID_EXPLORATION.has(candidate.explorationInterest)) return false;
  if (step === 'report' && (candidate.priorities.length === 0 || !candidate.explorationInterest)) return false;
  if (candidate.presenterConsent !== undefined && typeof candidate.presenterConsent !== 'boolean') return false;

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
