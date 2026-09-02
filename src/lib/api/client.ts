import type { AIReport, AssessmentInput, AssessmentRecord, Identity } from '../../server/contracts';

export type ClientAssessment = Omit<AssessmentRecord, 'birthDate' | 'riasecAnswers'>;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? body.error?.message : undefined;
    throw new ApiError(response.status, message ?? '暫時無法連線到資料服務，請稍後再試。');
  }
  return body as T;
}

export interface SessionResponse {
  authenticated: boolean;
  mock?: boolean;
  identity?: Identity;
}

export function getSession(): Promise<SessionResponse> {
  return request('/api/auth/session');
}

export function exchangeLiffIdToken(idToken: string): Promise<SessionResponse> {
  return request('/api/auth/liff', { method: 'POST', body: JSON.stringify({ idToken }) });
}

export function createAssessment(input: AssessmentInput): Promise<{ assessment: ClientAssessment }> {
  return request('/api/assessments', { method: 'POST', body: JSON.stringify(input) });
}

export function getLatestAssessment(): Promise<{ assessment: ClientAssessment | null }> {
  return request('/api/assessments/latest');
}

export function generateReport(assessmentId: string): Promise<{ report: AIReport; cached?: boolean }> {
  return request('/api/reports/generate', { method: 'POST', body: JSON.stringify({ assessmentId }) });
}

export function getReport(assessmentId: string): Promise<{ report: AIReport }> {
  return request(`/api/reports/${encodeURIComponent(assessmentId)}`);
}
