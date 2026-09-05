import { randomUUID } from 'node:crypto';
import { RIASEC_QUESTIONS } from '../data/riasecQuestions';
import { calculateLifePath } from '../lib/scoring/lifePath';
import { scoreRiasec } from '../lib/scoring/riasec';
import { calculateBirthProfile } from '../lib/scoring/birthProfile';
import { calculateBirthSignature } from '../lib/scoring/birthSignature';
import type { ExplorationInterest, LifePathResonance, Priority, RiasecAnswer, RiasecCode, TalentUsage } from '../types/domain';
import type { AssessmentInput, AssessmentRecord, Identity, Participant } from './contracts';
import { HttpError } from './http';
import type { EventsRepository, Repositories } from './repositories';
import { canParticipantAccessSubject, type SubjectKind, type SubjectRecord } from './subject';

const VALID_RESONANCE = new Set<LifePathResonance>(['high', 'partial', 'low']);
const VALID_CODES = new Set<RiasecCode>(['R', 'I', 'A', 'S', 'E', 'C']);
const VALID_USAGE = new Set<TalentUsage>([20, 40, 60, 80, 100]);
const VALID_EXPLORATION = new Set<ExplorationInterest>(['很想', '可以了解看看', '目前還沒有']);
const VALID_PRIORITIES = new Set<Priority>([
  '收入更多元', '工作更穩定', '更多時間自主', '更有成就感',
  '更能發揮自己的能力', '改善工作／人際環境', '新的學習與發展方向', '我現在還不確定',
]);

function invalid(message: string): never {
  throw new HttpError(400, 'invalid_assessment', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function answersFrom(value: unknown): Record<`q${string}`, RiasecAnswer> {
  if (!isRecord(value)) return invalid('RIASEC 作答格式無效。');
  const answers: Record<`q${string}`, RiasecAnswer> = {} as Record<`q${string}`, RiasecAnswer>;
  for (const question of RIASEC_QUESTIONS) {
    const answer = value[question.id];
    if (answer !== 1 && answer !== 2 && answer !== 3 && answer !== 4) return invalid('請完成全部 18 題 RIASEC 作答。');
    answers[question.id] = answer;
  }
  if (Object.keys(value).length !== RIASEC_QUESTIONS.length) return invalid('RIASEC 題目數不正確。');
  return answers;
}

function inputFrom(payload: Record<string, unknown>): AssessmentInput {
  const birthDate = payload.birthDate;
  const lifePathResonance = payload.lifePathResonance;
  const lifePathTopResonance = payload.lifePathTopResonance;
  const subjectiveDriver = payload.subjectiveDriver;
  const talentUsage = payload.talentUsage;
  const priorities = payload.priorities;
  const explorationInterest = payload.explorationInterest;
  if (typeof birthDate !== 'string') return invalid('出生日期格式無效。');
  if (!VALID_RESONANCE.has(lifePathResonance as LifePathResonance)) return invalid('Life Path 回饋格式無效。');
  if (typeof lifePathTopResonance !== 'string' || !lifePathTopResonance.trim()) return invalid('請提供最有感的 Life Path 線索。');
  if (!VALID_CODES.has(subjectiveDriver as RiasecCode)) return invalid('主觀能量線索格式無效。');
  if (!VALID_USAGE.has(talentUsage as TalentUsage)) return invalid('天賦使用感格式無效。');
  if (!Array.isArray(priorities) || priorities.length < 1 || priorities.length > 2 || new Set(priorities).size !== priorities.length || !priorities.every((priority) => VALID_PRIORITIES.has(priority as Priority))) {
    return invalid('目前關注項目格式無效。');
  }
  if (!VALID_EXPLORATION.has(explorationInterest as ExplorationInterest)) return invalid('探索意願格式無效。');
  if (payload.eventId !== undefined && typeof payload.eventId !== 'string') return invalid('活動識別格式無效。');
  if (payload.presenterConsent !== undefined && typeof payload.presenterConsent !== 'boolean') return invalid('Presenter 同意格式無效。');
  if (payload.lifePath !== undefined && !isRecord(payload.lifePath)) return invalid('Life Path 結果格式無效。');
  if (payload.riasecResult !== undefined && !isRecord(payload.riasecResult)) return invalid('RIASEC 結果格式無效。');
  if (payload.subjectId !== undefined && (typeof payload.subjectId !== 'string' || !payload.subjectId.trim())) return invalid('Subject 識別格式無效。');
  if (payload.assessmentMode !== undefined && payload.assessmentMode !== 'self' && payload.assessmentMode !== 'co_present') return invalid('測驗模式格式無效。');
  if (payload.birthProfile !== undefined && !isRecord(payload.birthProfile)) return invalid('Birth Profile 結果格式無效。');
  if (payload.birthSignature !== undefined && !isRecord(payload.birthSignature)) return invalid('Birth Signature 結果格式無效。');
  const reflections = payload.reflections;
  if (reflections !== undefined) {
    if (!isRecord(reflections)) return invalid('反思回答格式無效。');
    const energizing = reflections.energizingExperience;
    if (typeof energizing !== 'string' || energizing.trim().length < 3 || energizing.trim().length > 300) return invalid('請提供至少 3 個字且不超過 300 字的能量反思。');
    for (const key of ['currentFriction', 'unconstrainedExploration'] as const) {
      const value = reflections[key];
      if (value !== undefined && (typeof value !== 'string' || value.trim().length > 300)) return invalid('反思回答不可超過 300 字。');
    }
  }

  return {
    birthDate,
    subjectId: payload.subjectId as string | undefined,
    assessmentMode: payload.assessmentMode as AssessmentInput['assessmentMode'],
    lifePath: payload.lifePath as AssessmentInput['lifePath'],
    lifePathResonance: lifePathResonance as LifePathResonance,
    lifePathTopResonance,
    riasecAnswers: answersFrom(payload.riasecAnswers),
    riasecResult: payload.riasecResult as AssessmentInput['riasecResult'],
    subjectiveDriver: subjectiveDriver as RiasecCode,
    talentUsage: talentUsage as TalentUsage,
    priorities: priorities as Priority[],
    explorationInterest: explorationInterest as ExplorationInterest,
    reflections: reflections === undefined ? undefined : {
      energizingExperience: (reflections as Record<string, unknown>).energizingExperience as string,
      ...((reflections as Record<string, unknown>).currentFriction ? { currentFriction: String((reflections as Record<string, unknown>).currentFriction).trim() } : {}),
      ...((reflections as Record<string, unknown>).unconstrainedExploration ? { unconstrainedExploration: String((reflections as Record<string, unknown>).unconstrainedExploration).trim() } : {}),
    },
    birthProfile: payload.birthProfile as AssessmentInput['birthProfile'],
    birthSignature: payload.birthSignature as AssessmentInput['birthSignature'],
    eventId: payload.eventId as string | undefined,
    presenterConsent: payload.presenterConsent as boolean | undefined,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Validates every client-provided derived value against canonical TypeScript calculations. */
export function validateAssessment(payload: Record<string, unknown>): Omit<AssessmentRecord, 'assessmentId' | 'participantId' | 'completedAt'> {
  const input = inputFrom(payload);
  let lifePath;
  try {
    lifePath = calculateLifePath(input.birthDate);
  } catch {
    return invalid('出生日期格式無效。');
  }
  if (input.lifePath && !sameJson(input.lifePath, lifePath)) return invalid('Life Path 結果與伺服器計算不一致。');

  const birthProfile = calculateBirthProfile(input.birthDate);
  const birthSignature = calculateBirthSignature(input.birthDate);
  if (input.birthProfile && !sameJson(input.birthProfile, birthProfile)) return invalid('Birth Profile 結果與伺服器計算不一致。');
  if (input.birthSignature && !sameJson(input.birthSignature, birthSignature)) return invalid('Birth Signature 結果與伺服器計算不一致。');

  const riasecResult = scoreRiasec(RIASEC_QUESTIONS, input.riasecAnswers);
  if (input.riasecResult && !sameJson(input.riasecResult, riasecResult)) return invalid('RIASEC 結果與伺服器計算不一致。');

  return {
    eventId: input.eventId,
    birthDate: input.birthDate,
    lifePath,
    birthProfile,
    birthSignature,
    subjectId: input.subjectId,
    assessmentMode: input.assessmentMode,
    lifePathResonance: input.lifePathResonance,
    lifePathTopResonance: input.lifePathTopResonance.trim(),
    riasecAnswers: input.riasecAnswers as Record<`q${string}`, RiasecAnswer>,
    riasecResult,
    subjectiveDriver: input.subjectiveDriver,
    talentUsage: input.talentUsage,
    priorities: input.priorities,
    explorationInterest: input.explorationInterest,
    reflections: input.reflections,
    presenterConsent: Boolean(input.eventId && input.presenterConsent === true),
    presenterConsentAt: input.eventId && input.presenterConsent ? new Date().toISOString() : undefined,
  };
}

export async function saveAssessment(
  payload: Record<string, unknown>,
  identity: Identity,
  repositories: Repositories,
  eventRepository: EventsRepository = repositories.events,
  now: () => string = () => new Date().toISOString(),
): Promise<{ participant: Participant; assessment: AssessmentRecord }> {
  const validated = validateAssessment(payload);
  const participantPromise = repositories.participants.upsertIdentity(identity);
  const explicitSubjectPromise = validated.subjectId
    ? repositories.subjects.findById(validated.subjectId)
    : undefined;
  const participant = await participantPromise;
  let subject: SubjectRecord | null = validated.subjectId
    ? await explicitSubjectPromise ?? null
    : await repositories.subjects.findSelfForParticipant(participant.participantId);
  if (validated.subjectId && !subject) throw new HttpError(404, 'subject_not_found', '找不到這個探索對象。');
  if (subject && !canParticipantAccessSubject(subject, participant.participantId)) {
    throw new HttpError(403, 'subject_forbidden', '你目前無法存取這個探索對象。');
  }
  if (subject && subject.birthDate !== validated.birthDate) {
    throw new HttpError(409, 'subject_birth_date_mismatch', '這個出生日期和目前探索對象保存的資料不同，請建立另一個探索對象。');
  }
  if (!subject) {
    const nowValue = now();
    const subjectKind: SubjectKind = validated.assessmentMode === 'co_present' ? 'guest' : 'self';
    subject = await repositories.subjects.create({
      subjectId: randomUUID(), ownerParticipantId: subjectKind === 'self' ? participant.participantId : undefined,
      createdByParticipantId: participant.participantId, subjectKind, displayLabel: subjectKind === 'self' ? '我自己' : '另一位探索者',
      birthDate: validated.birthDate, claimStatus: subjectKind === 'self' ? 'not_applicable' : 'unclaimed',
      createdAt: nowValue, updatedAt: nowValue, archived: false,
    });
  }
  const assessment: AssessmentRecord = {
    ...validated,
    assessmentId: randomUUID(),
    participantId: participant.participantId,
    subjectId: subject.subjectId,
    createdByParticipantId: participant.participantId,
    assessmentMode: validated.assessmentMode ?? (subject.subjectKind === 'guest' ? 'co_present' : 'self'),
    presenterConsentAt: validated.presenterConsent ? now() : undefined,
    completedAt: now(),
  };
  await repositories.assessments.append(assessment);
  await Promise.all([
    repositories.participants.setLatestAssessment(participant.participantId, assessment.assessmentId),
    repositories.subjects.setLastAssessment(subject.subjectId, assessment.assessmentId),
  ]);
  if (assessment.presenterConsent && assessment.eventId) {
    const event = await eventRepository.findById(assessment.eventId);
    if (event?.status === 'active') await eventRepository.setCurrentPresenterAssessment(event.eventId, assessment.assessmentId);
  }
  return { participant: { ...participant, latestAssessmentId: assessment.assessmentId }, assessment };
}

export function assessmentForClient(assessment: AssessmentRecord): Omit<AssessmentRecord, 'birthDate' | 'riasecAnswers'> {
  const safe = { ...assessment } as Partial<AssessmentRecord>;
  delete safe.birthDate;
  delete safe.riasecAnswers;
  return safe as Omit<AssessmentRecord, 'birthDate' | 'riasecAnswers'>;
}
