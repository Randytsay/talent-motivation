import type {
  ExplorationInterest,
  LifePathResult,
  LifePathResonance,
  Priority,
  RiasecAnswer,
  RiasecCode,
  RiasecResult,
  TalentUsage,
  ReflectionAnswers,
} from '../types/domain';
import type { BirthProfileResult } from '../lib/scoring/birthProfile';
import type { BirthSignatureResult } from '../lib/scoring/birthSignature';
import type { AssessmentMode } from './subject';

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
  /** V2 Subject this point-in-time exploration is about. Optional for V1 migration. */
  subjectId?: string;
  assessmentMode?: AssessmentMode;
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
  reflections?: ReflectionAnswers;
  /** Optional client echoes; the server always recalculates and validates these. */
  birthProfile?: BirthProfileResult;
  birthSignature?: BirthSignatureResult;
  eventId?: string;
  presenterConsent?: boolean;
}

export interface AssessmentRecord {
  assessmentId: string;
  participantId: string;
  subjectId?: string;
  createdByParticipantId?: string;
  assessmentMode?: AssessmentMode;
  eventId?: string;
  /** Private at rest: never include this field in presenter responses. */
  birthDate: string;
  lifePath: LifePathResult;
  birthProfile?: BirthProfileResult;
  birthSignature?: BirthSignatureResult;
  lifePathResonance: LifePathResonance;
  lifePathTopResonance: string;
  riasecAnswers: Record<`q${string}`, RiasecAnswer>;
  riasecResult: RiasecResult;
  subjectiveDriver: RiasecCode;
  talentUsage: TalentUsage;
  priorities: Priority[];
  explorationInterest: ExplorationInterest;
  reflections?: ReflectionAnswers;
  presenterConsent: boolean;
  presenterConsentAt?: string;
  completedAt: string;
}

export interface AIReport {
  reportId: string;
  assessmentId: string;
  repeated_signals: string[];
  birth_profile_summary: string;
  motivator_summary: string;
  possible_tensions: string[];
  unused_potential: string;
  exploration_directions: string[];
  reflection_question: string;
  summary: string;
  promptVersion: string;
  modelName: string;
  generatedAt: string;
}

export type { ReflectionAnswers } from '../types/domain';

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
  /** A concise deterministic/summarized birth signal, never raw profile data. */
  birthProfileSignal?: string;
}
