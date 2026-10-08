import type { QuestionSet } from './types.ts';

/**
 * Rejects a question set that would silently score wrong: duplicate ids, a source
 * file that is not in the KB, answerable questions without facts or sources,
 * unanswerable ones that expect facts, or follow-ups with a single turn.
 */
export function validateQuestions(set: QuestionSet, documents: Set<string>): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const question of set.questions) {
    const label = question.id || '(missing id)';
    if (seen.has(question.id)) {
      problems.push(`${label}: duplicate id`);
    }
    seen.add(question.id);
    if (!question.turns.length || question.turns.some((turn) => !turn.trim())) {
      problems.push(`${label}: empty turn`);
    }
    const missing = question.docs.filter((doc) => !documents.has(doc));
    if (missing.length) {
      problems.push(`${label}: unknown KB file(s) ${missing.join(', ')}`);
    }
    if (
      question.facts.some((fact) => !fact.length || fact.some((alternative) => !alternative.trim()))
    ) {
      problems.push(`${label}: empty fact alternative`);
    }
    if (question.kind === 'unanswerable' && (question.facts.length || question.docs.length)) {
      problems.push(`${label}: unanswerable questions take no facts or docs`);
    }
    if (question.kind !== 'unanswerable' && (!question.facts.length || !question.docs.length)) {
      problems.push(`${label}: answerable questions need facts and docs`);
    }
    if (question.kind === 'followup' && question.turns.length < 2) {
      problems.push(`${label}: follow-ups need at least two turns`);
    }
  }
  if (problems.length) {
    throw new Error(`Invalid question set:\n${problems.join('\n')}`);
  }
}
