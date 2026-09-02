import type { PresenterPayload } from './contracts';
import { HttpError } from './http';
import type { Repositories } from './repositories';

/** A literal allowlist prevents accidental expansion when AssessmentRecord grows. */
export function presenterAllowlist(input: {
  displayName: string;
  assessment: Awaited<ReturnType<Repositories['assessments']['findById']>>;
  repeatedSignals?: string[];
}): PresenterPayload | null {
  const { assessment } = input;
  if (!assessment?.presenterConsent) return null;
  return {
    displayName: input.displayName,
    lifePath: assessment.lifePath.value,
    riasecScores: assessment.riasecResult.scores,
    top3: assessment.riasecResult.top3,
    top3Code: assessment.riasecResult.top3Code,
    subjectiveDriver: assessment.subjectiveDriver,
    talentUsage: assessment.talentUsage,
    ...(assessment.birthProfile ? {
      birthProfileSignal: `出生結構核心數 ${assessment.birthProfile.pyramid.main} · ${assessment.birthProfile.currentStage.label}`,
    } : {}),
    ...(input.repeatedSignals ? { repeatedSignals: input.repeatedSignals } : {}),
  };
}

export async function currentPresenterPayload(eventId: string, repositories: Repositories): Promise<PresenterPayload | null> {
  const event = await repositories.events.findById(eventId);
  if (!event || event.status !== 'active' || !event.currentPresenterAssessmentId) return null;
  const assessment = await repositories.assessments.findById(event.currentPresenterAssessmentId);
  if (!assessment || !assessment.presenterConsent || assessment.eventId !== event.eventId) return null;
  const report = await repositories.reports.findByAssessmentId(assessment.assessmentId);
  // Resolve the participant only through the assessment explicitly bound to this event.
  const participant = await repositories.participants.findByParticipantId(assessment.participantId);
  if (!participant) throw new HttpError(404, 'participant_not_found', '找不到分享資料。');
  return presenterAllowlist({ displayName: participant.displayName, assessment, repeatedSignals: report?.repeated_signals });
}
