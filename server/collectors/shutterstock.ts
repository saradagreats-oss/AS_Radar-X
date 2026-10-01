import { BaseCollector, type CollectorResult } from './base.js';
import type { RawEvidence } from '../types.js';

const SHOT_LIST_URL = 'https://www.shutterstock.com/explore/the-shot-list';
const CONTENT_BRIEF_URL = 'https://www.shutterstock.com/explore/contributor-content-briefs';
const SUPPORT_URL = 'https://support.submit.shutterstock.com/s/?language=en_US';

export class ShutterstockCollector extends BaseCollector {
  public readonly name = 'Shutterstock' as const;

  public async collect(targetTopics: string[] = []): Promise<CollectorResult[]> {
    const results: CollectorResult[] = [];
    const timestamp = new Date().toISOString();
    const topics = this.uniqueTopics(targetTopics);

    for (const topic of topics) {
      const url = `https://www.shutterstock.com/search/${encodeURIComponent(topic)}`;
      try {
        const response = await this.safeFetch(url, { timeoutMs: 10000, referer: 'https://www.shutterstock.com/' });
        if (response.blocked) {
          results.push(this.makeStatus('Shutterstock', `Search: ${topic}`, url, 'BLOCKED', [], { notes: `HTTP ${response.status}; source access was denied. No synthetic replacement was used.` }));
          continue;
        }
        if (!response.ok) {
          results.push(this.makeStatus('Shutterstock', `Search: ${topic}`, url, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` }));
          continue;
        }
        const evidence = this.extractSearchEvidence(response.text, url, timestamp, topic);
        results.push(this.makeStatus('Shutterstock', `Search: ${topic}`, url, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence));
      } catch (err: any) {
        results.push(this.makeStatus('Shutterstock', `Search: ${topic}`, url, 'ERROR', [], { error: err.message }));
      }
    }

    results.push(await this.collectGuidance(SHOT_LIST_URL, 'Shot List', timestamp));
    results.push(await this.collectGuidance(CONTENT_BRIEF_URL, 'Contributor Content Briefs', timestamp));
    results.push(await this.collectGuidance(SUPPORT_URL, 'Contributor Standards', timestamp));

    return results;
  }

  private async collectGuidance(url: string, label: string, timestamp: string): Promise<CollectorResult> {
    try {
      const response = await this.safeFetch(url, { timeoutMs: 10000, referer: 'https://www.shutterstock.com/' });
      if (response.blocked) {
        return this.makeStatus('Shutterstock', label, url, 'BLOCKED', [], { notes: `HTTP ${response.status}; source access was denied. No synthetic replacement was used.` });
      }
      if (!response.ok) {
        return this.makeStatus('Shutterstock', label, url, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` });
      }
      const evidence = this.extractGuidanceEvidence(response.text, url, timestamp, label);
      return this.makeStatus('Shutterstock', label, url, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence);
    } catch (err: any) {
      return this.makeStatus('Shutterstock', label, url, 'ERROR', [], { error: err.message });
    }
  }

  private extractSearchEvidence(html: string, url: string, timestamp: string, topic: string): RawEvidence[] {
    const evidence: RawEvidence[] = [];
    const seen = new Set<string>();
    const titleMatches = [
      ...Array.from(html.matchAll(/<img[^>]+alt=["']([^"']{10,160})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|description)["'][^>]+content=["']([^"']{10,240})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)).map((m) => m[1].replace(/<[^>]+>/g, ' '))
    ];
    for (const raw of titleMatches.slice(0, 24)) {
      const title = raw.replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
      if (!title || title.toLowerCase().includes('shutterstock') || title.length < 8 || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      evidence.push({
        source: 'Shutterstock',
        url,
        collected_at: timestamp,
        evidence_type: 'search_observation',
        raw_title: title,
        raw_keywords: [topic, ...title.split(/\s+/).filter((w) => w.length > 3).slice(0, 18)]
      });
    }
    return evidence;
  }

  private extractGuidanceEvidence(html: string, url: string, timestamp: string, label: string): RawEvidence[] {
    const evidence: RawEvidence[] = [];
    const headings = Array.from(html.matchAll(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi));
    const links = Array.from(html.matchAll(/<a[^>]+href=["'][^"']+["'][^>]*>(.*?)<\/a>/gi));
    const candidates = [...headings.map((m) => m[1]), ...links.map((m) => m[1])];
    const seen = new Set<string>();

    for (const raw of candidates) {
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 10 || text.length > 180 || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      evidence.push({
        source: 'Shutterstock',
        url,
        collected_at: timestamp,
        evidence_type: label === 'Shot List' ? 'shot_list' : 'contributor_guidance',
        raw_title: text,
        raw_keywords: text.split(/\s+/).filter((w) => w.length > 3).slice(0, 20)
      });
      if (evidence.length >= 20) break;
    }
    return evidence;
  }
}
