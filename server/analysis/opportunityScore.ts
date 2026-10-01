import type { ClusterAnalysis, ConceptCluster, InternalScore, SupplyGapResult, CommercialUseProfile, LongevityProfile } from '../types.js';

export function computeInternalPriorityScore(
  cluster: ConceptCluster,
  supply?: SupplyGapResult,
  commercialUse?: CommercialUseProfile,
  longevity?: LongevityProfile
): InternalScore {
  let recurrenceWeight = 10;
  if (cluster.recurrence_level === 'High') recurrenceWeight = 25;
  else if (cluster.recurrence_level === 'Moderate') recurrenceWeight = 18;

  const evidenceDensity = Math.min(25, cluster.evidence_count * 3.5);
  const commercialBreadth = Math.min(20, (commercialUse?.primaryUseCases.length || cluster.commercial_domains.length || 1) * 5);
  const supplyGapPotential = supply ? supply.differentiationPotential * 0.2 : 0;
  const longevityFactor = longevity?.shelfLifeRating === 'Evergreen (Multi-Year)' ? 10 : longevity?.shelfLifeRating === 'Cyclical / Annual' ? 6 : 2;

  const total = Math.max(0, Math.min(100,
    recurrenceWeight + evidenceDensity + commercialBreadth + supplyGapPotential + longevityFactor
  ));

  return {
    score: Number(total.toFixed(1)),
    breakdown: {
      recurrenceWeight,
      evidenceDensity: Number(evidenceDensity.toFixed(1)),
      commercialBreadth: Number(commercialBreadth.toFixed(1)),
      supplyGapPotential: Number(supplyGapPotential.toFixed(1)),
      longevityFactor
    },
    explanation: 'Internal prioritization index derived from collected evidence density, cross-source recurrence, inferred commercial usefulness, observed sample differentiation, and longevity heuristics. It is not a sales forecast, download estimate, or probability.'
  };
}
