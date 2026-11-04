import crypto from 'node:crypto';
import { normalizeEvidence, extractTokens } from './textNormalizer.js';
import type { RawEvidence } from '../types.js';

export interface NormalizedResearchRecord {
  fingerprint: string;
  canonicalUrl: string;
  title: string;
  sourceFamily: string;
  collectedAt: string;
  contentHash: string;
  category: string;
  commercialIntent: string;
  keywords: string[];
  observation: string;
  jobId: string;
}

function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    const tracking = [...url.searchParams.keys()].filter(key => /^(utm_|fbclid|gclid|ref$|source$|campaign$)/i.test(key));
    for (const key of tracking) url.searchParams.delete(key);
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

export function normalizeResearchPage(event: any, jobId: string): NormalizedResearchRecord | null {
  const url = String(event?.url || event?.details?.url || '').trim();
  const title = String(event?.message || event?.details?.title || '').replace(/\s+/g, ' ').trim();
  if (!url || !title) return null;
  const detail = event?.details || {};
  const observation = String(detail.text || detail.observation || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const headings = Array.isArray(detail.headings) ? detail.headings.map((item: unknown) => String(item).trim()).filter(Boolean) : [];
  let sourceFamily = 'website';
  try { sourceFamily = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* keep generic */ }

  const raw: RawEvidence = {
    source: 'Browser Research',
    url,
    collected_at: String(event?.at || new Date().toISOString()),
    evidence_type: 'search_observation',
    raw_title: title,
    raw_description: observation,
    raw_keywords: [...headings, ...extractTokens(title + ' ' + observation).slice(0, 35)],
    metadata: { sourceFamily, eventId: String(event?.id || ''), pageUrl: url }
  };
  const normalized = normalizeEvidence(raw);
  const canonicalUrl = canonicalizeUrl(url);
  const keywords = [...new Set(normalized.normalized_keywords)].sort();
  const identity = [canonicalUrl, normalized.normalized_title.toLowerCase()].join('|');
  const fingerprint = crypto.createHash('sha256').update(identity).digest('hex');
  const contentHash = crypto.createHash('sha256').update([title, observation, headings.join('|')].join('\n')).digest('hex');

  return {
    fingerprint,
    canonicalUrl,
    title: normalized.normalized_title,
    sourceFamily,
    collectedAt: raw.collected_at,
    contentHash,
    category: normalized.category,
    commercialIntent: normalized.commercial_intent,
    keywords,
    observation,
    jobId
  };
}

export function normalizeResearchPages(events: any[], jobId: string) {
  const seen = new Set<string>();
  const records: NormalizedResearchRecord[] = [];
  for (const event of events) {
    const record = normalizeResearchPage(event, jobId);
    if (!record) continue;
    const unique = record.fingerprint + ':' + record.contentHash;
    if (seen.has(unique)) continue;
    seen.add(unique);
    records.push(record);
  }
  return records;
}
