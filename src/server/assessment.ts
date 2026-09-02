import { randomUUID } from 'node:crypto';
import { RIASEC_QUESTIONS } from '../data/riasecQuestions';
import { calculateLifePath } from '../lib/scoring/lifePath';
import { scoreRiasec } from '../lib/scoring/riasec';
import type { ExplorationInterest, LifePathResonance, Priority, RiasecAnswer, RiasecCode, TalentUsage } from '../types/domain';
import type { AssessmentInput, AssessmentRecord, Identity, Participant } from './contracts';
import { HttpError } from './http';
import type { EventsRepository, Repositories } from './repositories';

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

  return {
    birthDate,
    lifePath: payload.lifePath as AssessmentInput['lifePath'],
    lifePathResonance: lifePathResonance as LifePathResonance,
    lifePathTopResonance,
    riasecAnswers: answersFrom(payload.riasecAnswers),
    riasecResult: payload.riasecResult as AssessmentInput['riasecResult'],
    subjectiveDriver: subjectiveDriver as RiasecCode,
    talentUsage: talentUsage as TalentUsage,
    priorities: priorities as Priority[],
    explorationInterest: explorationInterest as ExplorationInterest,
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

  const riasecResult = scoreRiasec(RIASEC_QUESTIONS, input.riasecAnswers);
  if (input.riasecResult && !sameJson(input.riasecResult, riasecResult)) return invalid('RIASEC 結果與伺服器計算不一致。');

  return {
    eventId: input.eventId,
    birthDate: input.birthDate,
    lifePath,
    lifePathResonance: input.lifePathResonance,
    lifePathTopResonance: input.lifePathTopResonance.trim(),
    riasecAnswers: input.riasecAnswers as Record<`q${string}`, RiasecAnswer>,
    riasecResult,
    subjectiveDriver: input.subjectiveDriver,
    talentUsage: input.talentUsage,
    priorities: input.priorities,
    explorationInterest: input.explorationInterest,
    presenterConsent: input.presenterConsent === true,
    presenterConsentAt: input.presenterConsent ? new Date().toISOString() : undefined,
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
  const participant = await repositories.participants.upsertIdentity(identity);
  const assessment: AssessmentRecord = {
    ...validated,
    assessmentId: randomUUID(),
    participantId: participant.participantId,
    completedAt: now(),
  };
  await repositories.assessments.append(assessment);
  await repositories.participants.setLatestAssessment(participant.participantId, assessment.assessmentId);
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
