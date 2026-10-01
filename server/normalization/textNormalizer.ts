import type { NormalizedEvidence, RawEvidence } from '../types.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'image', 'photo',
  'picture', 'footage', 'video', 'royalty', 'free', 'stock', 'shutterstock', 'adobe', 'pond5'
]);

export function cleanText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTokens(text: string): string[] {
  const cleaned = cleanText(text).toLowerCase();
  const words = cleaned.split(/[\s-]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

export function normalizeEvidence(raw: RawEvidence): NormalizedEvidence {
  const cleanedTitle = cleanText(raw.raw_title);
  const titleTokens = extractTokens(cleanedTitle);
  const keywordTokens = (raw.raw_keywords || [])
    .map((k) => cleanText(k).toLowerCase())
    .filter((k) => k.length > 2 && !STOP_WORDS.has(k));

  const allTokens = Array.from(new Set([...titleTokens, ...keywordTokens]));

  // Infer commercial category
  let category = 'Commercial & Business';
  const joined = allTokens.join(' ');
  if (joined.includes('health') || joined.includes('medic') || joined.includes('patient') || joined.includes('doctor') || joined.includes('care')) {
    category = 'Healthcare & Medicine';
  } else if (joined.includes('tech') || joined.includes('data') || joined.includes('cloud') || joined.includes('code') || joined.includes('cyber')) {
    category = 'Technology & Infrastructure';
  } else if (joined.includes('sustain') || joined.includes('energy') || joined.includes('solar') || joined.includes('green') || joined.includes('climat')) {
    category = 'Sustainability & Environment';
  } else if (joined.includes('logistic') || joined.includes('supply') || joined.includes('cargo') || joined.includes('ship') || joined.includes('warehous')) {
    category = 'Logistics & Supply Chain';
  } else if (joined.includes('agri') || joined.includes('farm') || joined.includes('crop') || joined.includes('food')) {
    category = 'Agriculture & Food Systems';
  } else if (joined.includes('financ') || joined.includes('invest') || joined.includes('bank') || joined.includes('tax') || joined.includes('wealth')) {
    category = 'Finance & FinTech';
  }

  // Commercial intent
  let commercialIntent = 'B2B Marketing & Editorial';
  if (joined.includes('guideline') || joined.includes('licens') || joined.includes('standard')) {
    commercialIntent = 'Marketplace Guidance & Submission Standard';
  } else if (joined.includes('footag') || joined.includes('motion')) {
    commercialIntent = 'Video Ad & Website Hero Motion';
  }

  return {
    source: raw.source,
    url: raw.url,
    collected_at: raw.collected_at,
    evidence_type: raw.evidence_type,
    normalized_title: cleanedTitle,
    normalized_keywords: allTokens,
    category,
    commercial_intent: commercialIntent
  };
}
