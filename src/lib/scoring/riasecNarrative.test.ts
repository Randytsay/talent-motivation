import { describe, expect, it } from 'vitest';
import type { RiasecResult } from '../../types/domain';
import { buildRiasecNarrative } from './riasecNarrative';

function result(top3: RiasecResult['top3'], normalized: Partial<Record<keyof RiasecResult['scores'], number>> = {}): RiasecResult {
  const codes = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
  const scores = Object.fromEntries(codes.map((code) => [code, {
    code,
    raw: 9,
    normalized: normalized[code] ?? (top3.indexOf(code) >= 0 ? 80 - top3.indexOf(code) * 8 : 40),
  }])) as RiasecResult['scores'];
  return { scores, top3, top3Code: top3.join('') };
}

describe('RIASEC personalized narrative', () => {
  it('turns SEA into a readable, tailored paragraph', () => {
    const narrative = buildRiasecNarrative(result(['S', 'E', 'A']));
    expect(narrative.headline).toContain('SEA');
    expect(narrative.headline).toContain('助人型');
    expect(narrative.body).toContain('幫助對方成長');
    expect(narrative.body).toContain('把事情往前推');
    expect(narrative.body).toContain('自己的表達');
    expect(narrative.reflection).toContain('幫、帶、創');
  });

  it('mentions a blended profile when the top two scores are close', () => {
    const narrative = buildRiasecNarrative(result(['I', 'S', 'E'], { I: 84, S: 80, E: 70 }));
    expect(narrative.body).toContain('前兩項分數很接近');
    expect(narrative.body).toContain('想＋幫');
  });

  it('keeps the language exploratory rather than deterministic', () => {
    const narrative = buildRiasecNarrative(result(['R', 'C', 'I']));
    expect(narrative.body).toContain('可能');
    expect(narrative.body).not.toContain('你一定');
    expect(narrative.body).not.toContain('命定');
  });
});
