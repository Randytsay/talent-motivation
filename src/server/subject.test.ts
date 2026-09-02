import { describe, expect, it } from 'vitest';
import { canParticipantAccessSubject, shouldAutoMergeSubjects, type SubjectRecord } from './subject';

function subject(overrides: Partial<SubjectRecord> = {}): SubjectRecord {
  return {
    subjectId: 'subject-1',
    createdByParticipantId: 'facilitator',
    subjectKind: 'guest',
    displayLabel: '朋友 A',
    birthDate: '1980-01-01',
    claimStatus: 'unclaimed',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    archived: false,
    ...overrides,
  };
}

describe('Subject access model', () => {
  it('allows an owner to access their Subject', () => {
    expect(canParticipantAccessSubject(subject({ ownerParticipantId: 'owner', claimStatus: 'claimed' }), 'owner')).toBe(true);
  });

  it('allows the facilitator to access an unclaimed guest temporarily', () => {
    expect(canParticipantAccessSubject(subject(), 'facilitator')).toBe(true);
  });

  it('removes facilitator access after a guest is claimed', () => {
    const claimed = subject({
      ownerParticipantId: 'guest-owner',
      subjectKind: 'claimed',
      claimStatus: 'claimed',
      claimedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(canParticipantAccessSubject(claimed, 'facilitator')).toBe(false);
    expect(canParticipantAccessSubject(claimed, 'guest-owner')).toBe(true);
  });

  it('does not expose archived Subjects through normal access', () => {
    expect(canParticipantAccessSubject(subject({ ownerParticipantId: 'owner', archived: true }), 'owner')).toBe(false);
  });

  it('never auto-merges Subjects based on matching birthdays', () => {
    expect(shouldAutoMergeSubjects()).toBe(false);
  });
});
