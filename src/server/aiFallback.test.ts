import { describe, expect, it, vi } from 'vitest';
import type { AssessmentRecord } from './contracts';
import { HttpError } from './http';
import type { AIReportContent, RealAIProvider } from './ai';
import { FallbackAIProvider, shouldFallback } from './aiFallback';

const assessment = {} as AssessmentRecord;
const report: AIReportContent = {
  repeated_signals: ['signal'],
  birth_profile_summary: 'birth',
  motivator_summary: 'motivation',
  possible_tensions: ['tension'],
  unused_potential: 'potential',
  exploration_directions: ['direction'],
  reflection_question: 'question',
  summary: 'summary',
};

function provider(name: string, generate: RealAIProvider['generate']): RealAIProvider {
  return { providerName: name, generate };
}

describe('automatic AI fallback', () => {
  it('keeps the primary result when Vertex succeeds', async () => {
    const primaryGenerate = vi.fn(async () => report);
    const fallbackGenerate = vi.fn(async () => report);
    const fallback = new FallbackAIProvider(
      provider('vertex:gemini-3.7-flash', primaryGenerate),
      provider('minimax:MiniMax-M3', fallbackGenerate),
    );

    await expect(fallback.generate(assessment)).resolves.toEqual(report);
    expect(primaryGenerate).toHaveBeenCalledOnce();
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('falls back to MiniMax M3 on provider 5xx failures', async () => {
    const primaryGenerate = vi.fn(async () => { throw new HttpError(502, 'vertex_generation_failed', 'upstream failed'); });
    const fallbackGenerate = vi.fn(async () => report);
    const fallback = new FallbackAIProvider(
      provider('vertex:gemini-3.7-flash', primaryGenerate),
      provider('minimax:MiniMax-M3', fallbackGenerate),
    );

    await expect(fallback.generate(assessment)).resolves.toEqual(report);
    expect(fallbackGenerate).toHaveBeenCalledOnce();
  });

  it('does not fall back on a client/business validation error', async () => {
    const validationError = new HttpError(400, 'invalid_payload', 'bad input');
    const primaryGenerate = vi.fn(async () => { throw validationError; });
    const fallbackGenerate = vi.fn(async () => report);
    const fallback = new FallbackAIProvider(
      provider('vertex:gemini-3.7-flash', primaryGenerate),
      provider('minimax:MiniMax-M3', fallbackGenerate),
    );

    await expect(fallback.generate(assessment)).rejects.toBe(validationError);
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('treats unexpected network/runtime errors as fallback eligible', () => {
    expect(shouldFallback(new TypeError('fetch failed'))).toBe(true);
    expect(shouldFallback(new HttpError(503, 'vertex_auth_failed', 'auth unavailable'))).toBe(true);
    expect(shouldFallback(new HttpError(409, 'assessment_conflict', 'conflict'))).toBe(false);
  });
});
