import type {
  ExplorationInterest,
  LifePathResult,
  LifePathResonance,
  Priority,
  RiasecAnswer,
  RiasecCode,
  RiasecResult,
  TalentUsage,
} from '../types/domain';

/** Server-side identity. `lineUserId` is the only stable user key. */
export interface Identity {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
}

export interface Participant extends Identity {
  participantId: string;
  latestAssessmentId?: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface AssessmentInput {
  birthDate: string;
  /** Optional client echo; it is checked, never trusted. */
  lifePath?: Partial<LifePathResult>;
  lifePathResonance: LifePathResonance;
  lifePathTopResonance: string;
  riasecAnswers: Partial<Record<`q${string}`, RiasecAnswer>>;
  /** Optional client echo; it is checked, never trusted. */
  riasecResult?: Partial<RiasecResult>;
  subjectiveDriver: RiasecCode;
  talentUsage: TalentUsage;
  priorities: Priority[];
  explorationInterest: ExplorationInterest;
  eventId?: string;
  presenterConsent?: boolean;
}

export interface AssessmentRecord {
  assessmentId: string;
  participantId: string;
  eventId?: string;
  /** Private at rest: never include this field in presenter responses. */
  birthDate: string;
  lifePath: LifePathResult;
  lifePathResonance: LifePathResonance;
  lifePathTopResonance: string;
  riasecAnswers: Record<`q${string}`, RiasecAnswer>;
  riasecResult: RiasecResult;
  subjectiveDriver: RiasecCode;
  talentUsage: TalentUsage;
  priorities: Priority[];
  explorationInterest: ExplorationInterest;
  presenterConsent: boolean;
  presenterConsentAt?: string;
  completedAt: string;
}

export interface AIReport {
  reportId: string;
  assessmentId: string;
  repeated_signals: string[];
  motivator_summary: string;
  possible_tensions: string[];
  exploration_directions: string[];
  reflection_question: string;
  summary: string;
  promptVersion: string;
  modelName: string;
  generatedAt: string;
}

export interface EventRecord {
  eventId: string;
  eventCode: string;
  eventName: string;
  status: 'draft' | 'active' | 'closed';
  currentPresenterAssessmentId?: string;
  createdAt: string;
}

export interface PresenterPayload {
  displayName: string;
  lifePath: number;
  riasecScores: RiasecResult['scores'];
  top3: RiasecCode[];
  top3Code: string;
  subjectiveDriver: RiasecCode;
  talentUsage: TalentUsage;
  repeatedSignals?: string[];
}
