import type { ConceptCluster, SupplyGapResult } from '../types.js';
import { calculateJaccardSimilarity } from '../normalization/dedupe.js';
import { extractTokens } from '../normalization/textNormalizer.js';

export function analyzeSupplyAndGaps(cluster: ConceptCluster): SupplyGapResult {
  const titles = cluster.evidence_samples.map((e) => extractTokens(e.normalized_title));
  const similarities: number[] = [];
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      similarities.push(calculateJaccardSimilarity(titles[i], titles[j]));
    }
  }

  const titleSimilarity = similarities.length
    ? similarities.reduce((a, b) => a + b, 0) / similarities.length
    : 0;

  const keywordCounts = new Map<string, number>();
  for (const sample of cluster.evidence_samples) {
    for (const token of sample.normalized_keywords) {
      keywordCounts.set(token, (keywordCounts.get(token) || 0) + 1);
    }
  }
  const totalTokens = [...keywordCounts.values()].reduce((a, b) => a + b, 0);
  const keywordConcentration = totalTokens
    ? Math.max(...keywordCounts.values()) / totalTokens
    : 0;

  const sampleSize = cluster.evidence_count;
  const sourceCount = cluster.sources_observed.length;
  const saturationRisk: SupplyGapResult['saturationRisk'] =
    sampleSize === 0
      ? 'Unknown'
      : titleSimilarity >= 0.65 || keywordConcentration >= 0.45
        ? 'High'
        : titleSimilarity >= 0.42 || keywordConcentration >= 0.30
          ? 'Moderate'
          : 'Low';

  const diversityBoost = (1 - Math.min(1, titleSimilarity)) * 55;
  const sourceBoost = Math.min(25, sourceCount * 8);
  const samplePenalty = Math.min(35, sampleSize * 4);
  const differentiationPotential = Math.round(
    Math.max(0, Math.min(100, diversityBoost + sourceBoost - samplePenalty + (1 - keywordConcentration) * 20))
  );

  const observations = [
    `Observed sample size: ${sampleSize}.`,
    `Observed source count: ${sourceCount}.`,
    `Observed title-token similarity: ${Math.round(titleSimilarity * 100)}%.`,
    `Observed keyword concentration: ${Math.round(keywordConcentration * 100)}%.`,
    'These figures describe the collected sample only; they are not total marketplace inventory counts.'
  ];

  if (saturationRisk === 'High') {
    observations.push('The collected sample is repetitive, so differentiation risk is high.');
  } else if (saturationRisk === 'Moderate') {
    observations.push('The collected sample has moderate overlap; a narrower visual or buyer-use gap should be demonstrated before selection.');
  } else if (saturationRisk === 'Low') {
    observations.push('The collected sample is comparatively diverse, but absence from this sample does not prove the wider market is undersupplied.');
  }

  return {
    sampleSize,
    sourceCount,
    titleSimilarity: Number(titleSimilarity.toFixed(3)),
    keywordConcentration: Number(keywordConcentration.toFixed(3)),
    saturationRisk,
    differentiationPotential,
    observations,
    gapHypotheses: [],
    recommendedAngle: ''
  };
}
