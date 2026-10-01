import type { NormalizedEvidence } from '../types.js';

export function calculateJaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function deduplicateEvidence(items: NormalizedEvidence[], threshold = 0.65): NormalizedEvidence[] {
  const result: NormalizedEvidence[] = [];

  for (const item of items) {
    let isDuplicate = false;
    for (const existing of result) {
      const similarity = calculateJaccardSimilarity(item.normalized_keywords, existing.normalized_keywords);
      if (similarity >= threshold) {
        isDuplicate = true;
        // Merge unique keywords
        const merged = Array.from(new Set([...existing.normalized_keywords, ...item.normalized_keywords]));
        existing.normalized_keywords = merged;
        break;
      }
    }
    if (!isDuplicate) {
      result.push({ ...item });
    }
  }

  return result;
}
