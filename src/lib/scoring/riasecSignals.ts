import { RIASEC_QUESTIONS } from '../../data/riasecQuestions';
import type { RiasecAnswer, RiasecCode } from '../../types/domain';

export interface RiasecItemSignal {
  id: `q${string}`;
  dimension: RiasecCode;
  text: string;
  answer: RiasecAnswer;
}

export interface RiasecItemSignals {
  highItems: RiasecItemSignal[];
  lowItems: RiasecItemSignal[];
}

/** Preserve item-level texture without giving the LLM the raw q01-q18 answer map. */
export function extractRiasecItemSignals(
  answers: Record<`q${string}`, RiasecAnswer>,
): RiasecItemSignals {
  const answered = RIASEC_QUESTIONS.map((question) => ({
    id: question.id,
    dimension: question.dimension,
    text: question.text,
    answer: answers[question.id],
  })).filter((item): item is RiasecItemSignal => item.answer === 1 || item.answer === 2 || item.answer === 3 || item.answer === 4);

  return {
    highItems: answered.filter((item) => item.answer === 4),
    lowItems: answered.filter((item) => item.answer === 1),
  };
}
