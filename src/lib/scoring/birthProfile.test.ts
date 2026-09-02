import { describe, expect, it } from 'vitest';
import { ageBandFor, birthProfileFacts, calculateBirthProfile } from './birthProfile';

describe('Birth Profile V2', () => {
  it('preserves the legacy Inner Number pyramid math for the 1978-11-05 fixture', () => {
    const result = calculateBirthProfile('1978-11-05', new Date('2026-09-02T00:00:00Z'));

    expect(result.lifePath.value).toBe(5);
    expect(result.pyramid).toMatchObject({
      main: 5,
      outerPair: [5, 2],
      innerPair: [1, 6],
      outerComposite: 7,
      innerComposite: 7,
    });
    expect(result.stages).toEqual({ general: 3, leadership: 6, professional: 3 });
    expect(result.currentStage).toEqual({ key: 'leadership', label: '成年中期／領導力', number: 6 });
    expect(result.ageBand).toBe('45–54');
  });

  it('keeps Life Path master-number behavior separate from the single-digit pyramid', () => {
    expect(calculateBirthProfile('1950-03-29', new Date('2026-09-02T00:00:00Z')).lifePath.value).toBe(11);
    expect(calculateBirthProfile('1950-03-29', new Date('2026-09-02T00:00:00Z')).pyramid.main).toBe(2);

    expect(calculateBirthProfile('1950-01-06', new Date('2026-09-02T00:00:00Z')).lifePath.value).toBe(22);
    expect(calculateBirthProfile('1950-01-06', new Date('2026-09-02T00:00:00Z')).pyramid.main).toBe(4);

    expect(calculateBirthProfile('1950-07-29', new Date('2026-09-02T00:00:00Z')).lifePath.value).toBe(33);
    expect(calculateBirthProfile('1950-07-29', new Date('2026-09-02T00:00:00Z')).pyramid.main).toBe(6);
  });

  it('uses deterministic non-overlapping adult-stage boundaries', () => {
    expect(calculateBirthProfile('2006-09-03', new Date('2026-09-02T00:00:00Z')).currentStage.key).toBe('general');
    expect(calculateBirthProfile('1986-09-02', new Date('2026-09-02T00:00:00Z')).currentStage.key).toBe('leadership');
    expect(calculateBirthProfile('1961-09-02', new Date('2026-09-02T00:00:00Z')).currentStage.key).toBe('professional');
  });

  it('projects useful birth-profile facts without birth date or raw birthday digits', () => {
    const profile = calculateBirthProfile('1978-11-05', new Date('2026-09-02T00:00:00Z'));
    const facts = birthProfileFacts(profile);
    const serialized = JSON.stringify(facts);

    expect(facts).toMatchObject({
      life_path: 5,
      pyramid_main: { number: 5, label: '探索' },
      outer_profile: { pair: [5, 2], composite: 7, label: '洞察' },
      inner_profile: { pair: [1, 6], composite: 7, label: '洞察' },
      current_stage: { key: 'leadership', number: 6, theme: '關懷' },
      age_band: '45–54',
    });
    expect(serialized).not.toContain('1978-11-05');
    expect(serialized).not.toContain('"A"');
    expect(serialized).not.toContain('"H"');
  });

  it('returns privacy-friendly age bands', () => {
    expect(ageBandFor(17)).toBe('under-18');
    expect(ageBandFor(24)).toBe('18–24');
    expect(ageBandFor(34)).toBe('25–34');
    expect(ageBandFor(44)).toBe('35–44');
    expect(ageBandFor(54)).toBe('45–54');
    expect(ageBandFor(64)).toBe('55–64');
    expect(ageBandFor(65)).toBe('65+');
  });
});
