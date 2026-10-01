import { calculateJaccardSimilarity } from '../normalization/dedupe.js';
import { extractTokens } from '../normalization/textNormalizer.js';

export interface HistoryCheckResult {
  isRepetitive: boolean;
  conflictingTitle?: string;
  explanation?: string;
}

export function checkHistoryProtection(
  candidateTitle: string,
  candidateConcept: string,
  history: Array<{ title: string; concept: string }>
): HistoryCheckResult {
  const candidateTokens = extractTokens(`${candidateTitle} ${candidateConcept}`);

  for (const past of history) {
    const pastTokens = extractTokens(`${past.title} ${past.concept}`);
    const similarity = calculateJaccardSimilarity(candidateTokens, pastTokens);

    // High overlap indicates repetition of same visual angle
    if (similarity > 0.7) {
      return {
        isRepetitive: true,
        conflictingTitle: past.title,
        explanation: `Concept has high token similarity (${Math.round(similarity * 100)}%) with previously generated opportunity '${past.title}'.`
      };
    }
  }

  return { isRepetitive: false };
}
