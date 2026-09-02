import { assertValidBirthDate, calculateLifePath } from './lifePath';
import type { BirthNumber } from './birthProfile';

export interface BirthSignatureLine {
  key: string;
  digits: BirthNumber[];
  legacyName: string;
  label: string;
  isSub?: boolean;
}

const LINE_DEFINITIONS: readonly BirthSignatureLine[] = [
  { key: '123', digits: [1, 2, 3], legacyName: '美感藝術線', label: '美感與行動' },
  { key: '456', digits: [4, 5, 6], legacyName: '完美組織線', label: '組織與完成' },
  { key: '789', digits: [7, 8, 9], legacyName: '權勢靈性線', label: '影響與整合' },
  { key: '147', digits: [1, 4, 7], legacyName: '務實物質線', label: '務實與執行' },
  { key: '258', digits: [2, 5, 8], legacyName: '熱情公關線', label: '人際與推動' },
  { key: '369', digits: [3, 6, 9], legacyName: '創意智慧線', label: '創意與理解' },
  { key: '159', digits: [1, 5, 9], legacyName: '事業成效線', label: '目標與成效' },
  { key: '357', digits: [3, 5, 7], legacyName: '最佳人緣線', label: '溝通與連結' },
  { key: '24', digits: [2, 4], legacyName: '靈巧變通線', label: '靈活與變通', isSub: true },
  { key: '48', digits: [4, 8], legacyName: '工作策略線', label: '策略與執行', isSub: true },
  { key: '26', digits: [2, 6], legacyName: '公平正義線', label: '公平與協調', isSub: true },
  { key: '68', digits: [6, 8], legacyName: '親切誠懇線', label: '可靠與承擔', isSub: true },
] as const;

export interface BirthSignatureResult {
  birthdayNumber: BirthNumber;
  supportDigits: BirthNumber[];
  zodiacNumber: BirthNumber;
  innateDigits: BirthNumber[];
  gridCounts: Record<BirthNumber, number>;
  missingNumbers: BirthNumber[];
  repeatedNumbers: Array<{ number: BirthNumber; count: number }>;
  activeLines: BirthSignatureLine[];
}

export interface BirthSignatureFacts {
  birthday_number: BirthNumber;
  support_digits: BirthNumber[];
  innate_digits: BirthNumber[];
  repeated_numbers: Array<{ number: BirthNumber; count: number }>;
  low_presence_numbers: BirthNumber[];
  active_patterns: Array<{ key: string; label: string }>;
}

function reduceToSingle(value: number): BirthNumber {
  let current = value;
  while (current > 9) current = String(current).split('').reduce((sum, digit) => sum + Number(digit), 0);
  return current as BirthNumber;
}

/** Exact legacy zodiac-to-number mapping retained only as one symbolic grid input. */
function legacyZodiacNumber(month: number, day: number): BirthNumber {
  if ((month === 1 && day <= 19) || (month === 12 && day >= 22)) return 1;
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 2;
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 3;
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 1;
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 2;
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return 3;
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return 4;
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 5;
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 6;
  if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) return 7;
  if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) return 8;
  return 9;
}

export function calculateBirthSignature(birthDate: string): BirthSignatureResult {
  assertValidBirthDate(birthDate);
  const [year, month, day] = birthDate.split('-').map(Number);
  const fullDate = `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const lifePath = calculateLifePath(birthDate);
  const birthdayNumber = reduceToSingle(day);
  const supportDigits = lifePath.rawDigitSum > 9
    ? String(lifePath.rawDigitSum).slice(0, 2).split('').map(Number).filter(Boolean) as BirthNumber[]
    : [lifePath.rawDigitSum as BirthNumber];
  const zodiacNumber = legacyZodiacNumber(month, day);
  const innateDigits = [...new Set(fullDate.split('').map(Number).filter((value) => value > 0))].sort((a, b) => a - b) as BirthNumber[];

  const gridCounts = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 0])) as Record<BirthNumber, number>;
  for (const digit of fullDate.split('').map(Number)) if (digit > 0) gridCounts[digit as BirthNumber] += 1;
  gridCounts[reduceToSingle(lifePath.value)] += 1;
  for (const digit of supportDigits) if (digit > 0) gridCounts[digit] += 1;
  gridCounts[birthdayNumber] += 1;
  gridCounts[zodiacNumber] += 1;

  const missingNumbers = (Object.keys(gridCounts).map(Number) as BirthNumber[]).filter((number) => gridCounts[number] === 0);
  const repeatedNumbers = (Object.keys(gridCounts).map(Number) as BirthNumber[])
    .filter((number) => gridCounts[number] >= 3)
    .map((number) => ({ number, count: gridCounts[number] }));
  const activeLines = LINE_DEFINITIONS.filter((line) => line.digits.every((digit) => gridCounts[digit] > 0));

  return { birthdayNumber, supportDigits, zodiacNumber, innateDigits, gridCounts, missingNumbers, repeatedNumbers, activeLines };
}

/** LLM projection: symbolic derived signals only; no full birth date or exact grid source is exposed. */
export function birthSignatureFacts(signature: BirthSignatureResult): BirthSignatureFacts {
  return {
    birthday_number: signature.birthdayNumber,
    support_digits: signature.supportDigits,
    innate_digits: signature.innateDigits,
    repeated_numbers: signature.repeatedNumbers,
    low_presence_numbers: signature.missingNumbers,
    active_patterns: signature.activeLines.map(({ key, label }) => ({ key, label })),
  };
}
