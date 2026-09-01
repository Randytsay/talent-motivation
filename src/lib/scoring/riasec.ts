import { RIASEC_CODES } from '../../types/domain';
import type { RiasecAnswer, RiasecCode, RiasecQuestion, RiasecResult, RiasecScores } from '../../types/domain';

/** Canonical ordering is the explicit, deterministic tie-breaker for equal scores. */
export const RIASEC_TIE_BREAK_ORDER = RIASEC_CODES;

export function normalizeRiasecScore(raw: number): number {
  if (!Number.isInteger(raw) || raw < 3 || raw > 12) {
    throw new RangeError('RIASEC raw score must be an integer from 3 to 12.');
  }

  return Math.round(((raw - 3) / 9) * 100);
}

function isAnswer(value: number | undefined): value is RiasecAnswer {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function scoreRiasec(
  questions: readonly RiasecQuestion[],
  answers: Partial<Record<`q${string}`, RiasecAnswer>>,
): RiasecResult {
  const rawScores = Object.fromEntries(RIASEC_CODES.map((code) => [code, 0])) as Record<RiasecCode, number>;
  const itemCounts = Object.fromEntries(RIASEC_CODES.map((code) => [code, 0])) as Record<RiasecCode, number>;

  for (const question of questions) {
    const answer = answers[question.id];
    if (!isAnswer(answer)) {
      throw new Error(`Missing or invalid answer for ${question.id}.`);
    }
    rawScores[question.dimension] += answer;
    itemCounts[question.dimension] += 1;
  }

  for (const code of RIASEC_CODES) {
    if (itemCounts[code] !== 3) {
      throw new Error(`Expected exactly three RIASEC items for ${code}.`);
    }
  }

  const scores = Object.fromEntries(
    RIASEC_CODES.map((code) => [
      code,
      { code, raw: rawScores[code], normalized: normalizeRiasecScore(rawScores[code]) },
    ]),
  ) as RiasecScores;

  const top3 = [...RIASEC_TIE_BREAK_ORDER]
    .sort((left, right) => scores[right].normalized - scores[left].normalized)
    .slice(0, 3);

  return { scores, top3, top3Code: top3.join('') };
}
