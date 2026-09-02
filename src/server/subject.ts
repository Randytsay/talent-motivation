export type SubjectKind = 'self' | 'guest' | 'claimed';
export type ClaimStatus = 'not_applicable' | 'unclaimed' | 'claimed' | 'expired' | 'revoked';
export type AssessmentMode = 'self' | 'co_present';

export interface SubjectRecord {
  subjectId: string;
  ownerParticipantId?: string;
  createdByParticipantId: string;
  subjectKind: SubjectKind;
  displayLabel: string;
  /** Private. Never include in Presenter, claim preview, public share, or LLM facts. */
  birthDate: string;
  claimStatus: ClaimStatus;
  /** SHA-256 only. Plaintext claim tokens must never be persisted. */
  claimTokenHash?: string;
  claimExpiresAt?: string;
  claimedAt?: string;
  lastAssessmentId?: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface ClaimPreview {
  displayLabel: string;
  lifePath?: number;
  top3Code?: string;
  completedAt?: string;
  expiresAt: string;
}

/**
 * Access rule for private Subject data.
 * Owners always retain access. Facilitators retain temporary access only while
 * a guest remains unclaimed. After claim, normal facilitator access ends.
 */
export function canParticipantAccessSubject(subject: SubjectRecord, participantId: string): boolean {
  if (subject.archived) return false;
  if (subject.ownerParticipantId === participantId) return true;
  return subject.claimStatus === 'unclaimed' && subject.createdByParticipantId === participantId;
}

/** Birthday equality is never enough to infer that two Subject records are the same person. */
export function shouldAutoMergeSubjects(): false {
  return false;
}
