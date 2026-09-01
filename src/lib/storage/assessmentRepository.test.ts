import { afterEach, describe, expect, it } from 'vitest';
import type { AssessmentDraft, RiasecAnswer } from '../../types/domain';
import { localAssessmentDraftRepository } from './assessmentRepository';

const originalWindow = globalThis.window;

function installStorage(overrides: Partial<Storage>) {
  const storage: Storage = {
    length: 0,
    clear() {},
    getItem() { return null; },
    key() { return null; },
    removeItem() {},
    setItem() {},
    ...overrides,
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
}

function completeDraft(): AssessmentDraft {
  const riasecAnswers = Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [`q${String(index + 1).padStart(2, '0')}`, 3 as RiasecAnswer]),
  ) as AssessmentDraft['riasecAnswers'];

  return {
    version: 1,
    step: 'report',
    birthDate: '1978-11-05',
    lifePath: { value: 5, rawDigitSum: 32, reductionSteps: [32, 5] },
    lifePathResonance: 'high',
    lifePathTopResonance: '保有調整方向的自由',
    riasecAnswers,
    subjectiveDriver: 'S',
    talentUsage: 60,
    priorities: ['更多時間自主'],
    explorationInterest: '可以了解看看',
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('localAssessmentDraftRepository', () => {
  it('returns null for malformed JSON instead of crashing', () => {
    installStorage({ getItem: () => '{broken-json' });
    expect(localAssessmentDraftRepository.load()).toBeNull();
  });

  it('rejects an unknown assessment step', () => {
    installStorage({ getItem: () => JSON.stringify({ ...completeDraft(), step: 'unknown-step' }) });
    expect(localAssessmentDraftRepository.load()).toBeNull();
  });

  it('rejects an inconsistent completed state', () => {
    const stale = { ...completeDraft(), subjectiveDriver: undefined };
    installStorage({ getItem: () => JSON.stringify(stale) });
    expect(localAssessmentDraftRepository.load()).toBeNull();
  });

  it('restores a valid completed report snapshot', () => {
    const draft = completeDraft();
    installStorage({ getItem: () => JSON.stringify(draft) });
    expect(localAssessmentDraftRepository.load()).toEqual(draft);
  });

  it('does not crash when localStorage setItem is unavailable', () => {
    installStorage({ setItem: () => { throw new DOMException('denied', 'SecurityError'); } });
    expect(() => localAssessmentDraftRepository.save(completeDraft())).not.toThrow();
  });

  it('does not crash when localStorage removeItem is unavailable', () => {
    installStorage({ removeItem: () => { throw new DOMException('denied', 'SecurityError'); } });
    expect(() => localAssessmentDraftRepository.clear()).not.toThrow();
  });
});
