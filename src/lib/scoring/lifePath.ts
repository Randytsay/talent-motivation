import type { LifePath, LifePathResult } from '../../types/domain';

const MASTER_NUMBERS = new Set<number>([11, 22, 33]);
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class LifePathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifePathValidationError';
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const calendar = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return calendar[month - 1] ?? 0;
}

export function assertValidBirthDate(birthDate: string): void {
  const match = DATE_PATTERN.exec(birthDate);
  if (!match) {
    throw new LifePathValidationError('請輸入完整有效的出生日期（YYYY-MM-DD）。');
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new LifePathValidationError('請輸入有效的 Gregorian calendar date。');
  }
}

function sumDigits(value: number): number {
  return String(value)
    .split('')
    .reduce((sum, digit) => sum + Number(digit), 0);
}

/**
 * Deterministically calculate a Life Path from a strictly valid ISO calendar date.
 * Master numbers 11, 22, and 33 stop the reduction immediately.
 */
export function calculateLifePath(birthDate: string): LifePathResult {
  assertValidBirthDate(birthDate);

  const rawDigitSum = birthDate
    .replaceAll('-', '')
    .split('')
    .reduce((sum, digit) => sum + Number(digit), 0);
  const reductionSteps = [rawDigitSum];
  let current = rawDigitSum;

  while (current > 9 && !MASTER_NUMBERS.has(current)) {
    current = sumDigits(current);
    reductionSteps.push(current);
  }

  return {
    value: current as LifePath,
    rawDigitSum,
    reductionSteps,
  };
}
