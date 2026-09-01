import { describe, expect, it } from 'vitest';
import { calculateLifePath, LifePathValidationError } from './lifePath';

describe('calculateLifePath', () => {
  it.each([
    ['1978-11-05', 5],
    ['1950-03-29', 11],
    ['1950-01-06', 22],
    ['1950-07-29', 33],
  ] as const)('calculates the locked V1 example %s as %i', (birthDate, expected) => {
    expect(calculateLifePath(birthDate).value).toBe(expected);
  });

  it.each([
    ['1900-01-08', 1],
    ['1900-01-09', 2],
    ['1900-01-01', 3],
    ['1900-01-02', 4],
    ['1900-01-03', 5],
    ['1900-01-04', 6],
    ['1900-01-05', 7],
    ['1900-01-06', 8],
    ['1900-01-07', 9],
  ] as const)('supports standard Life Path %i for %s', (birthDate, expected) => {
    expect(calculateLifePath(birthDate).value).toBe(expected);
  });

  it('records every reduction step and stops at a master number', () => {
    expect(calculateLifePath('1978-11-05')).toEqual({ value: 5, rawDigitSum: 32, reductionSteps: [32, 5] });
    expect(calculateLifePath('1950-03-29').reductionSteps).toEqual([29, 11]);
    expect(calculateLifePath('1950-01-06').reductionSteps).toEqual([22]);
    expect(calculateLifePath('1950-07-29').reductionSteps).toEqual([33]);
  });

  it.each(['2000-02-29', '2024-02-29'])('accepts a valid leap day: %s', (birthDate) => {
    expect(() => calculateLifePath(birthDate)).not.toThrow();
  });

  it.each(['2026-02-30', '2023-02-29', '2026-13-01', '2026-00-01', '2026-01-32', 'abcd-11-05', '', '2026-1-05'])(
    'rejects malformed or impossible dates: %s',
    (birthDate) => {
      expect(() => calculateLifePath(birthDate)).toThrow(LifePathValidationError);
    },
  );
});
