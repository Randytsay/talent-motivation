import { describe, expect, it } from 'vitest';
import { birthSignatureFacts, calculateBirthSignature } from './birthSignature';

describe('Birth Signature V2', () => {
  it('preserves the legacy grid signature for 1978-11-05', () => {
    const result = calculateBirthSignature('1978-11-05');
    expect(result).toMatchObject({
      birthdayNumber: 5,
      supportDigits: [3, 2],
      zodiacNumber: 8,
      innateDigits: [1, 5, 7, 8, 9],
      missingNumbers: [4, 6],
      repeatedNumbers: [{ number: 1, count: 3 }, { number: 5, count: 3 }],
    });
    expect(result.gridCounts).toEqual({ 1: 3, 2: 1, 3: 1, 4: 0, 5: 3, 6: 0, 7: 1, 8: 2, 9: 1 });
    expect(result.activeLines.map((line) => line.key)).toEqual(['123', '789', '258', '159', '357']);
  });

  it('projects only symbolic derived signals to the LLM layer', () => {
    const facts = birthSignatureFacts(calculateBirthSignature('1978-11-05'));
    const serialized = JSON.stringify(facts);
    expect(facts.active_patterns).toEqual([
      { key: '123', label: '美感與行動' },
      { key: '789', label: '影響與整合' },
      { key: '258', label: '人際與推動' },
      { key: '159', label: '目標與成效' },
      { key: '357', label: '溝通與連結' },
    ]);
    expect(serialized).not.toContain('1978-11-05');
  });
});
