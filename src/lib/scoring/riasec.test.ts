import { describe, expect, it } from 'vitest';
import { RIASEC_QUESTIONS } from '../../data/riasecQuestions';
import { RIASEC_CODES } from '../../types/domain';
import type { RiasecAnswer } from '../../types/domain';
import { normalizeRiasecScore, RIASEC_TIE_BREAK_ORDER, scoreRiasec } from './riasec';

function answersFor(value: RiasecAnswer): Record<`q${string}`, RiasecAnswer> {
  return Object.fromEntries(RIASEC_QUESTIONS.map((question) => [question.id, value])) as Record<`q${string}`, RiasecAnswer>;
}

describe('RIASEC questions', () => {
  it('has the specified 18 questions and exactly three items in every dimension', () => {
    expect(RIASEC_QUESTIONS).toHaveLength(18);
    expect(RIASEC_QUESTIONS.map((question) => question.dimension)).toEqual([
      'I', 'R', 'S', 'A', 'E', 'C', 'I', 'R', 'S', 'A', 'E', 'C', 'I', 'R', 'S', 'A', 'E', 'C',
    ]);
    for (const code of RIASEC_CODES) {
      expect(RIASEC_QUESTIONS.filter((question) => question.dimension === code)).toHaveLength(3);
    }
  });
});

describe('scoreRiasec', () => {
  it('returns the minimum raw and normalized score', () => {
    const result = scoreRiasec(RIASEC_QUESTIONS, answersFor(1));
    for (const code of RIASEC_CODES) {
      expect(result.scores[code]).toEqual({ code, raw: 3, normalized: 0 });
    }
  });

  it('returns the maximum raw and normalized score', () => {
    const result = scoreRiasec(RIASEC_QUESTIONS, answersFor(4));
    for (const code of RIASEC_CODES) {
      expect(result.scores[code]).toEqual({ code, raw: 12, normalized: 100 });
    }
  });

  it('normalizes scores using the locked formula and display rounding', () => {
    expect(normalizeRiasecScore(3)).toBe(0);
    expect(normalizeRiasecScore(6)).toBe(33);
    expect(normalizeRiasecScore(9)).toBe(67);
    expect(normalizeRiasecScore(12)).toBe(100);
  });

  it('orders Top 3 by normalized score', () => {
    const answers = answersFor(1);
    for (const question of RIASEC_QUESTIONS) {
      if (question.dimension === 'I') answers[question.id] = 4;
      if (question.dimension === 'S') answers[question.id] = 3;
      if (question.dimension === 'E') answers[question.id] = 2;
    }

    expect(scoreRiasec(RIASEC_QUESTIONS, answers)).toMatchObject({
      top3: ['I', 'S', 'E'],
      top3Code: 'ISE',
    });
  });

  it('uses the documented R, I, A, S, E, C order to resolve ties', () => {
    const result = scoreRiasec(RIASEC_QUESTIONS, answersFor(2));
    expect(RIASEC_TIE_BREAK_ORDER).toEqual(['R', 'I', 'A', 'S', 'E', 'C']);
    expect(result.top3).toEqual(['R', 'I', 'A']);
    expect(result.top3Code).toBe('RIA');
  });

  it('rejects incomplete answers and invalid score ranges', () => {
    expect(() => scoreRiasec(RIASEC_QUESTIONS, {})).toThrow('Missing or invalid answer for q01');
    expect(() => normalizeRiasecScore(2)).toThrow(RangeError);
    expect(() => normalizeRiasecScore(13)).toThrow(RangeError);
  });
});
