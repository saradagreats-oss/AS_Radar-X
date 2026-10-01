import type { ConceptCluster } from '../types.js';

export interface RecurrenceResult {
  clusterId: string;
  recurrenceScore: number; // 1 to 5 scale
  observedSourcesCount: number;
  evidenceObservations: string;
}

export function analyzeRecurrence(cluster: ConceptCluster): RecurrenceResult {
  const sourcesCount = cluster.sources_observed.length;
  const count = cluster.evidence_count;

  let score = 2;
  if (sourcesCount >= 2 && count >= 4) {
    score = 5;
  } else if (sourcesCount >= 2 || count >= 3) {
    score = 4;
  } else if (count >= 2) {
    score = 3;
  }

  const sourcesList = cluster.sources_observed.join(', ');
  const observation =
    sourcesCount > 1
      ? `Cross-marketplace recurrence verified across ${sourcesCount} active sources (${sourcesList}).`
      : `Single-source repeated presence detected in ${sourcesList}.`;

  return {
    clusterId: cluster.id,
    recurrenceScore: score,
    observedSourcesCount: sourcesCount,
    evidenceObservations: observation
  };
}
