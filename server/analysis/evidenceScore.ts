import type { OpportunityScore, ScoreComponent } from '../types.js';

export type ScoreComponentKey =
  | 'recurring_demand'
  | 'commercial_use'
  | 'marketplace_evidence'
  | 'supply_gap'
  | 'longevity'
  | 'production_feasibility';

export const SCORE_WEIGHTS: Record<ScoreComponentKey, number> = {
  recurring_demand: 25,
  commercial_use: 20,
  marketplace_evidence: 20,
  supply_gap: 15,
  longevity: 10,
  production_feasibility: 10
};

const DEFAULT_COMPONENT: ScoreComponent = {
  score: 0,
  reason: 'Not supported by the collected evidence.',
  evidence_ids: []
};

function clampScore(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function cleanComponent(value: any, validEvidenceIds?: Set<number>): ScoreComponent {
  return {
    score: clampScore(value?.score),
    reason: String(value?.reason || DEFAULT_COMPONENT.reason).slice(0, 700),
    evidence_ids: Array.isArray(value?.evidence_ids)
      ? [...new Set(value.evidence_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0 && (!validEvidenceIds || validEvidenceIds.has(id))))]
      : []
  };
}

/**
 * Calculates a reproducible prioritization score from six evidence-anchored
 * component assessments. The output is not a forecast or probability of sales.
 */
export function calculateOpportunityScore(raw: any, validEvidenceIds?: Set<number>): OpportunityScore {
  const breakdown = {
    recurring_demand: cleanComponent(raw?.recurring_demand, validEvidenceIds),
    commercial_use: cleanComponent(raw?.commercial_use, validEvidenceIds),
    marketplace_evidence: cleanComponent(raw?.marketplace_evidence, validEvidenceIds),
    supply_gap: cleanComponent(raw?.supply_gap, validEvidenceIds),
    longevity: cleanComponent(raw?.longevity, validEvidenceIds),
    production_feasibility: cleanComponent(raw?.production_feasibility, validEvidenceIds)
  };
  if (validEvidenceIds) {
    for (const component of Object.values(breakdown)) {
      if (!component.evidence_ids.length) {
        component.score = 0;
        component.reason = 'No valid source reference was attached; component not credited.';
      }
    }
  }
  const score = Math.round(
    Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => {
      const component = breakdown[key as ScoreComponentKey];
      return sum + component.score * weight / 100;
    }, 0)
  );
  const evidenceIds = new Set(Object.values(breakdown).flatMap(component => component.evidence_ids));
  const supportedComponents = Object.values(breakdown).filter(component => component.evidence_ids.length > 0).length;
  const confidence = evidenceIds.size >= 6 && supportedComponents >= 5
    ? 'HIGH'
    : evidenceIds.size >= 3 && supportedComponents >= 3
      ? 'MEDIUM'
      : 'LOW';
  return {
    score,
    confidence,
    breakdown,
    formula: 'Demand 25% + Commercial use 20% + Marketplace evidence 20% + Supply/angle gap 15% + Longevity 10% + Production feasibility 10%'
  };
}
