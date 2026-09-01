export type LifePath = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;

export interface LifePathResult {
  value: LifePath;
  rawDigitSum: number;
  reductionSteps: number[];
}

export interface LifePathContent {
  value: LifePath;
  label: string;
  coreMotivation: string;
  keywords: string[];
  strengths: string[];
  drains: string[];
  reflectionQuestion: string;
  resonanceOptions: string[];
}

export const RIASEC_CODES = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
export type RiasecCode = (typeof RIASEC_CODES)[number];
export type RiasecAnswer = 1 | 2 | 3 | 4;

export interface RiasecQuestion {
  id: `q${string}`;
  dimension: RiasecCode;
  text: string;
}

export interface RiasecDimensionScore {
  code: RiasecCode;
  raw: number;
  normalized: number;
}

export type RiasecScores = Record<RiasecCode, RiasecDimensionScore>;

export interface RiasecResult {
  scores: RiasecScores;
  top3: RiasecCode[];
  top3Code: string;
}

export type LifePathResonance = 'high' | 'partial' | 'low';
export type TalentUsage = 20 | 40 | 60 | 80 | 100;
export type Priority =
  | '收入更多元'
  | '工作更穩定'
  | '更多時間自主'
  | '更有成就感'
  | '更能發揮自己的能力'
  | '改善工作／人際環境'
  | '新的學習與發展方向'
  | '我現在還不確定';
export type ExplorationInterest = '很想' | '可以了解看看' | '目前還沒有';

export type AssessmentStep =
  | 'landing'
  | 'birthday'
  | 'life-path'
  | 'resonance'
  | 'transition'
  | 'riasec'
  | 'energy'
  | 'riasec-result'
  | 'talent-usage'
  | 'priorities'
  | 'report';

export interface AssessmentDraft {
  version: 1;
  step: AssessmentStep;
  birthDate: string;
  lifePath?: LifePathResult;
  lifePathResonance?: LifePathResonance;
  lifePathTopResonance?: string;
  riasecAnswers: Partial<Record<`q${string}`, RiasecAnswer>>;
  subjectiveDriver?: RiasecCode;
  talentUsage?: TalentUsage;
  priorities: Priority[];
  explorationInterest?: ExplorationInterest;
}
