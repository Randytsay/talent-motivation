import type { AssessmentDraft } from '../../types/domain';

const LOCAL_DRAFT_KEY = 'talent-motivation:assessment-draft:v1';

export interface AssessmentDraftRepository {
  load(): AssessmentDraft | null;
  save(draft: AssessmentDraft): void;
  clear(): void;
}

function isDraft(value: unknown): value is AssessmentDraft {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AssessmentDraft>;
  return (
    candidate.version === 1 &&
    typeof candidate.step === 'string' &&
    typeof candidate.birthDate === 'string' &&
    typeof candidate.riasecAnswers === 'object' &&
    candidate.riasecAnswers !== null &&
    Array.isArray(candidate.priorities)
  );
}

export const localAssessmentDraftRepository: AssessmentDraftRepository = {
  load() {
    try {
      const value = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!value) return null;
      const parsed: unknown = JSON.parse(value);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(draft) {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
  },
  clear() {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY);
  },
};
