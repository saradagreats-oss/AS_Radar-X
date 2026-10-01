import type { ConceptCluster, NormalizedEvidence } from '../types.js';

export function clusterEvidence(items: NormalizedEvidence[]): ConceptCluster[] {
  const clusters: ConceptCluster[] = [];

  // Categorize by domain
  const groups = new Map<string, NormalizedEvidence[]>();
  for (const item of items) {
    const key = item.category || 'General Commercial';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  let clusterIndex = 1;
  for (const [category, groupItems] of groups.entries()) {
    // Collect all tokens
    const tokenFreq = new Map<string, number>();
    const sourcesSeen = new Set<string>();

    for (const item of groupItems) {
      sourcesSeen.add(item.source);
      for (const token of item.normalized_keywords) {
        tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
      }
    }

    // Top tokens
    const sortedTokens = Array.from(tokenFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tok]) => tok);

    const recurrence =
      sourcesSeen.size >= 2 ? 'High' : groupItems.length >= 3 ? 'Moderate' : 'Emerging';

    // Evergreen classification
    let evergreen: 'Evergreen' | 'Cyclical' | 'Temporary' = 'Evergreen';
    const joined = sortedTokens.join(' ');
    if (joined.includes('seasonal') || joined.includes('holiday') || joined.includes('summer') || joined.includes('winter')) {
      evergreen = 'Cyclical';
    }

    clusters.push({
      id: `cluster-${clusterIndex++}`,
      name: `${category}: ${sortedTokens.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
      primary_keywords: sortedTokens,
      sources_observed: Array.from(sourcesSeen),
      evidence_count: groupItems.length,
      evidence_samples: groupItems.slice(0, 5),
      recurrence_level: recurrence,
      commercial_domains: [category],
      // Keep angle generation evidence-driven. The supply analysis + Gemini research pass create
      // differentiated angles from the collected market evidence instead of a hard-coded shot list.
      suggested_angles: [],
      evergreen_assessment: evergreen
    });
  }

  return clusters;
}
