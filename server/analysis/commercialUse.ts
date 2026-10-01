import type { CommercialUseProfile, ConceptCluster } from '../types.js';

const USE_MAP: Array<{ match: RegExp; buyers: string[]; uses: string[] }> = [
  { match: /health|medic|patient|care|clinic/, buyers: ['healthcare brands', 'health-tech products', 'hospital and clinic communications'], uses: ['web/landing-page hero', 'patient education', 'healthcare campaign/editorial'] },
  { match: /tech|data|cloud|cyber|software|ai/, buyers: ['B2B software companies', 'technology marketers', 'enterprise communications teams'], uses: ['SaaS marketing', 'product presentations', 'B2B editorial/whitepaper'] },
  { match: /sustain|energy|solar|climat|environment/, buyers: ['clean-energy brands', 'ESG/impact communications teams', 'sustainability publishers'], uses: ['ESG reporting', 'campaign/website creative', 'industry editorial'] },
  { match: /logistic|supply|cargo|warehouse|transport/, buyers: ['logistics operators', 'supply-chain software brands', 'industrial publishers'], uses: ['B2B campaigns', 'trade/editorial content', 'recruitment/operations communications'] },
  { match: /finance|fintech|bank|invest|tax|wealth/, buyers: ['financial-services brands', 'fintech products', 'business publishers'], uses: ['financial education', 'product marketing', 'corporate/editorial reporting'] }
];

export function analyzeCommercialUse(cluster: ConceptCluster): CommercialUseProfile {
  const text = `${cluster.name} ${cluster.primary_keywords.join(' ')} ${cluster.commercial_domains.join(' ')}`.toLowerCase();
  const mapping = USE_MAP.find((item) => item.match.test(text));

  if (!mapping) {
    return {
      targetBuyers: ['commercial publishers', 'brand/marketing teams', 'professional service organizations'],
      primaryUseCases: ['website/content creative', 'business/editorial storytelling', 'presentation/report creative'],
      editorialVsCommercial: 'Dual-Use',
      confidence: 'Inferred'
    };
  }

  return {
    targetBuyers: mapping.buyers,
    primaryUseCases: mapping.uses,
    editorialVsCommercial: mapping.uses.some((u) => u.includes('editorial')) ? 'Dual-Use' : 'Commercial Advertising & Brand',
    confidence: 'Inferred'
  };
}
