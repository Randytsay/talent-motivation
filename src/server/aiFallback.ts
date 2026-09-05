import type { AssessmentRecord } from './contracts';
import { HttpError } from './http';
import type { AIProvider, AIReportContent, RealAIProvider } from './ai';

/**
 * Automatic live-provider fallback. It only activates for provider-side/server
 * failures (5xx-class HttpErrors or unexpected network/runtime failures).
 * Validation/auth/business errors raised before provider.generate() never reach
 * this wrapper and therefore never trigger a fallback.
 */
export class FallbackAIProvider implements RealAIProvider {
  readonly providerName: string;

  constructor(
    private readonly primary: RealAIProvider,
    private readonly fallback: RealAIProvider,
  ) {
    this.providerName = `${primary.providerName}|fallback:${fallback.providerName}`;
  }

  async generate(assessment: AssessmentRecord): Promise<AIReportContent> {
    try {
      return await this.primary.generate(assessment);
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn('AI provider fallback activated', {
        from: this.primary.providerName,
        to: this.fallback.providerName,
        status: error instanceof HttpError ? error.status : undefined,
        code: error instanceof HttpError ? error.code : 'unexpected_provider_error',
      });
      return this.fallback.generate(assessment);
    }
  }
}

export function shouldFallback(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500;
  // Fetch/network/runtime failures from a provider are safe to retry on the
  // configured backup because user/business validation happens upstream.
  return true;
}

export function asRealProvider(provider: AIProvider): RealAIProvider {
  if ('providerName' in provider && typeof provider.providerName === 'string') return provider as RealAIProvider;
  throw new Error('Fallback requires real AI providers.');
}
