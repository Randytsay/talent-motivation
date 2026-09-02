import { calculateLifePath, assertValidBirthDate } from './lifePath';
import type { LifePathResult } from '../../types/domain';

export type BirthNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type AdultStageKey = 'pre-adult' | 'general' | 'leadership' | 'professional';

export interface BirthNumberTheme {
  number: BirthNumber;
  label: string;
  keywords: string[];
}

export const BIRTH_NUMBER_THEMES: Record<BirthNumber, BirthNumberTheme> = {
  1: { number: 1, label: '開創', keywords: ['自主', '起步', '主導'] },
  2: { number: 2, label: '連結', keywords: ['協調', '關係', '感受'] },
  3: { number: 3, label: '表達', keywords: ['創意', '溝通', '展現'] },
  4: { number: 4, label: '建構', keywords: ['秩序', '穩定', '完成'] },
  5: { number: 5, label: '探索', keywords: ['變化', '自由', '體驗'] },
  6: { number: 6, label: '關懷', keywords: ['責任', '支持', '價值感'] },
  7: { number: 7, label: '洞察', keywords: ['深度', '理解', '內省'] },
  8: { number: 8, label: '成果', keywords: ['資源', '影響', '推進'] },
  9: { number: 9, label: '意義', keywords: ['貢獻', '整合', '放下'] },
};

export interface BirthPyramidNodes {
  A: number; B: number; C: number; D: number; E: number; F: number; G: number; H: number;
  I: BirthNumber; J: BirthNumber; K: BirthNumber; L: BirthNumber;
  M: BirthNumber; N: BirthNumber; O: BirthNumber;
  P: BirthNumber; Q: BirthNumber; R: BirthNumber;
  S: BirthNumber; T: BirthNumber; U: BirthNumber;
  V: BirthNumber; W: BirthNumber; X: BirthNumber;
}

export interface BirthProfileResult {
  lifePath: LifePathResult;
  pyramid: {
    main: BirthNumber;
    outerPair: [BirthNumber, BirthNumber];
    innerPair: [BirthNumber, BirthNumber];
    outerComposite: BirthNumber;
    innerComposite: BirthNumber;
    nodes: BirthPyramidNodes;
  };
  stages: {
    general: BirthNumber;
    leadership: BirthNumber;
    professional: BirthNumber;
  };
  currentStage: {
    key: AdultStageKey;
    label: string;
    number?: BirthNumber;
  };
  ageBand: string;
}

export interface BirthProfileFacts {
  life_path: number;
  pyramid_main: { number: BirthNumber; label: string; keywords: string[] };
  outer_profile: {
    pair: [BirthNumber, BirthNumber];
    composite: BirthNumber;
    label: string;
    keywords: string[];
  };
  inner_profile: {
    pair: [BirthNumber, BirthNumber];
    composite: BirthNumber;
    label: string;
    keywords: string[];
  };
  current_stage: {
    key: AdultStageKey;
    label: string;
    number?: BirthNumber;
    theme?: string;
    keywords?: string[];
  };
  age_band: string;
}

function reduceToSingle(value: number): BirthNumber {
  let current = Math.abs(Math.trunc(value));
  while (current > 9) {
    current = String(current).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current as BirthNumber;
}

function parseIsoBirthDate(birthDate: string): { year: number; month: number; day: number } {
  assertValidBirthDate(birthDate);
  const [year, month, day] = birthDate.split('-').map(Number);
  return { year, month, day };
}

function calculateAge(birthDate: string, referenceDate: Date): number {
  const { year, month, day } = parseIsoBirthDate(birthDate);
  let age = referenceDate.getUTCFullYear() - year;
  const referenceMonth = referenceDate.getUTCMonth() + 1;
  const referenceDay = referenceDate.getUTCDate();
  if (referenceMonth < month || (referenceMonth === month && referenceDay < day)) age -= 1;
  return Math.max(0, age);
}

export function ageBandFor(age: number): string {
  if (age < 18) return 'under-18';
  if (age <= 24) return '18–24';
  if (age <= 34) return '25–34';
  if (age <= 44) return '35–44';
  if (age <= 54) return '45–54';
  if (age <= 64) return '55–64';
  return '65+';
}

function currentAdultStage(age: number, stages: BirthProfileResult['stages']): BirthProfileResult['currentStage'] {
  if (age < 18) return { key: 'pre-adult', label: '成年前' };
  if (age < 40) return { key: 'general', label: '成年早期／通用力', number: stages.general };
  if (age < 65) return { key: 'leadership', label: '成年中期／領導力', number: stages.leadership };
  return { key: 'professional', label: '成年晚期／專業力', number: stages.professional };
}

/** Deterministic adaptation of Randytsay/innernumber pyramid math. */
export function calculateBirthProfile(birthDate: string, referenceDate: Date = new Date()): BirthProfileResult {
  const { year, month, day } = parseIsoBirthDate(birthDate);
  const yearText = String(year).padStart(4, '0');
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');

  const A = Number(dayText[0]);
  const B = Number(dayText[1]);
  const C = Number(monthText[0]);
  const D = Number(monthText[1]);
  const E = Number(yearText[0]);
  const F = Number(yearText[1]);
  const G = Number(yearText[2]);
  const H = Number(yearText[3]);

  const I = reduceToSingle(A + B);
  const J = reduceToSingle(C + D);
  const K = reduceToSingle(E + F);
  const L = reduceToSingle(G + H);
  const M = reduceToSingle(I + J);
  const N = reduceToSingle(K + L);
  const O = reduceToSingle(M + N);
  const Q = reduceToSingle(N + O);
  const P = reduceToSingle(M + O);
  const R = reduceToSingle(Q + P);
  const T = reduceToSingle(I + M);
  const S = reduceToSingle(J + M);
  const U = reduceToSingle(T + S);
  const V = reduceToSingle(K + N);
  const W = reduceToSingle(L + N);
  const X = reduceToSingle(V + W);

  const nodes: BirthPyramidNodes = { A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X };
  const stages = { general: U, leadership: R, professional: X };
  const age = calculateAge(birthDate, referenceDate);

  return {
    lifePath: calculateLifePath(birthDate),
    pyramid: {
      main: O,
      outerPair: [I, J],
      innerPair: [K, L],
      outerComposite: M,
      innerComposite: N,
      nodes,
    },
    stages,
    currentStage: currentAdultStage(age, stages),
    ageBand: ageBandFor(age),
  };
}

/** Privacy-preserving LLM projection. It deliberately excludes birth date and raw A-H digits. */
export function birthProfileFacts(profile: BirthProfileResult): BirthProfileFacts {
  const mainTheme = BIRTH_NUMBER_THEMES[profile.pyramid.main];
  const outerTheme = BIRTH_NUMBER_THEMES[profile.pyramid.outerComposite];
  const innerTheme = BIRTH_NUMBER_THEMES[profile.pyramid.innerComposite];
  const currentNumber = profile.currentStage.number;
  const currentTheme = currentNumber ? BIRTH_NUMBER_THEMES[currentNumber] : undefined;

  return {
    life_path: profile.lifePath.value,
    pyramid_main: { number: profile.pyramid.main, label: mainTheme.label, keywords: mainTheme.keywords },
    outer_profile: {
      pair: profile.pyramid.outerPair,
      composite: profile.pyramid.outerComposite,
      label: outerTheme.label,
      keywords: outerTheme.keywords,
    },
    inner_profile: {
      pair: profile.pyramid.innerPair,
      composite: profile.pyramid.innerComposite,
      label: innerTheme.label,
      keywords: innerTheme.keywords,
    },
    current_stage: {
      key: profile.currentStage.key,
      label: profile.currentStage.label,
      ...(currentNumber ? { number: currentNumber, theme: currentTheme?.label, keywords: currentTheme?.keywords } : {}),
    },
    age_band: profile.ageBand,
  };
}
