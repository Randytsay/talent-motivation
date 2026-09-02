import { describe, expect, it } from 'vitest';
import { extractRiasecItemSignals } from './riasecSignals';
import type { RiasecAnswer } from '../../types/domain';

const answers = Object.fromEntries(Array.from({ length: 18 }, (_, index) => [
  `q${String(index + 1).padStart(2, '0')}`,
  (index % 4) + 1,
])) as Record<`q${string}`, RiasecAnswer>;

describe('RIASEC item signals', () => {
  it('exposes only strongly endorsed or rejected items to interpretation', () => {
    const result = extractRiasecItemSignals(answers);
    expect(result.highItems.length).toBeGreaterThan(0);
    expect(result.lowItems.length).toBeGreaterThan(0);
    expect(result.highItems.every((item) => item.answer === 4)).toBe(true);
    expect(result.lowItems.every((item) => item.answer === 1)).toBe(true);
    expect(result.highItems[0]).toHaveProperty('text');
    expect(result.highItems[0]).toHaveProperty('dimension');
  });
});
