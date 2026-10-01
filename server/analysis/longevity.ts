import type { ConceptCluster, LongevityProfile } from '../types.js';

const SHORT_TERM = /viral|breaking|election|celebrity|championship|final|launch event|announcement|memecoin|meme|yesterday|today|tonight|2025|2026/;
const CYCLICAL = /christmas|holiday|halloween|valentine|summer|winter|spring|autumn|seasonal|tax season|back to school|black friday/;

export function analyzeLongevity(cluster: ConceptCluster): LongevityProfile {
  const text = `${cluster.name} ${cluster.primary_keywords.join(' ')}`.toLowerCase();

  if (SHORT_TERM.test(text)) {
    return {
      shelfLifeRating: 'Short-Term',
      reasoning: 'Topic language contains explicit event/news/temporary signals; it should not be treated as evergreen demand without stronger recurring evidence.',
      trendDependence: 'High'
    };
  }

  if (CYCLICAL.test(text) || cluster.evergreen_assessment === 'Cyclical') {
    return {
      shelfLifeRating: 'Cyclical / Annual',
      reasoning: 'The collected concept contains recurring calendar/seasonal indicators; demand may recur but is timing-dependent.',
      trendDependence: 'Moderate'
    };
  }

  if (cluster.recurrence_level === 'High' && cluster.sources_observed.length >= 2) {
    return {
      shelfLifeRating: 'Evergreen (Multi-Year)',
      reasoning: 'The collected evidence shows cross-source recurring presence without an explicit short-lived event dependency.',
      trendDependence: 'Low (Fundamental Business Need)'
    };
  }

  return {
    shelfLifeRating: 'Evergreen (Multi-Year)',
    reasoning: 'No explicit short-lived event dependency was detected; treat evergreen status as an analytical hypothesis until recurrence is supported by multiple observations.',
    trendDependence: 'Moderate'
  };
}
