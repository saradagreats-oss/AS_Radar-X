import { BaseCollector, type CollectorResult } from './base.js';
import type { RawEvidence } from '../types.js';

const ADOBE_PORTAL = 'https://contributor.stock.adobe.com/';
const ADOBE_BLOG = 'https://blog.adobe.com/en/topics/stock';
const ADOBE_GUIDE = 'https://helpx.adobe.com/stock/contributor/user-guide.html';

export class AdobeStockCollector extends BaseCollector {
  public readonly name = 'Adobe Stock' as const;

  public async collect(targetTopics: string[] = []): Promise<CollectorResult[]> {
    const results: CollectorResult[] = [];
    const timestamp = new Date().toISOString();
    const topics = this.uniqueTopics(targetTopics);

    for (const topic of topics) {
      const url = `https://stock.adobe.com/search?k=${encodeURIComponent(topic)}`;
      try {
        const response = await this.safeFetch(url, { timeoutMs: 10000, referer: 'https://stock.adobe.com/' });
        if (response.blocked) {
          results.push(this.makeStatus('Adobe Stock', `Search: ${topic}`, url, 'BLOCKED', [], { notes: `HTTP ${response.status}; no synthetic replacement was used.` }));
          continue;
        }
        if (!response.ok) {
          results.push(this.makeStatus('Adobe Stock', `Search: ${topic}`, url, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` }));
          continue;
        }
        const evidence = this.extractSearchEvidence(response.text, url, timestamp, topic);
        results.push(this.makeStatus('Adobe Stock', `Search: ${topic}`, url, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence));
      } catch (err: any) {
        results.push(this.makeStatus('Adobe Stock', `Search: ${topic}`, url, 'ERROR', [], { error: err.message }));
      }
    }

    results.push(await this.collectPage(ADOBE_PORTAL, 'Adobe Contributor Portal', timestamp));
    results.push(await this.collectPage(ADOBE_BLOG, 'Adobe Stock Blog', timestamp));
    results.push(await this.collectPage(ADOBE_GUIDE, 'Adobe Contributor Guide', timestamp));
    return results;
  }

  private async collectPage(url: string, label: string, timestamp: string): Promise<CollectorResult> {
    try {
      const response = await this.safeFetch(url, { timeoutMs: 10000, referer: 'https://stock.adobe.com/' });
      if (response.blocked) {
        return this.makeStatus('Adobe Stock', label, url, 'BLOCKED', [], { notes: `HTTP ${response.status}; no synthetic replacement was used.` });
      }
      if (!response.ok) {
        return this.makeStatus('Adobe Stock', label, url, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` });
      }
      const evidence = this.extractPageEvidence(response.text, url, timestamp, label);
      return this.makeStatus('Adobe Stock', label, url, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence);
    } catch (err: any) {
      return this.makeStatus('Adobe Stock', label, url, 'ERROR', [], { error: err.message });
    }
  }

  private extractSearchEvidence(html: string, url: string, timestamp: string, topic: string): RawEvidence[] {
    const evidence: RawEvidence[] = [];
    const candidates = [
      ...Array.from(html.matchAll(/<img[^>]+alt=["']([^"']{10,160})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|description)["'][^>]+content=["']([^"']{10,240})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)).map((m) => m[1].replace(/<[^>]+>/g, ' '))
    ];
    const seen = new Set<string>();
    for (const raw of candidates.slice(0, 30)) {
      const title = raw.replace(/\s+/g, ' ').trim();
      if (title.length < 8 || title.toLowerCase().includes('adobe stock') || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      evidence.push({
        source: 'Adobe Stock',
        url,
        collected_at: timestamp,
        evidence_type: 'search_observation',
        raw_title: title,
        raw_keywords: [topic, ...title.split(/\s+/).filter((w) => w.length > 3).slice(0, 18)]
      });
    }
    return evidence;
  }

  private extractPageEvidence(html: string, url: string, timestamp: string, label: string): RawEvidence[] {
    const evidence: RawEvidence[] = [];
    const headings = Array.from(html.matchAll(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi));
    for (const match of headings.slice(0, 24)) {
      const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 10 || text.length > 180) continue;
      evidence.push({
        source: 'Adobe Stock',
        url,
        collected_at: timestamp,
        evidence_type: label === 'Adobe Stock Blog' ? 'trends' : 'contributor_guidance',
        raw_title: text,
        raw_keywords: text.split(/\s+/).filter((w) => w.length > 3).slice(0, 20)
      });
    }
    return evidence;
  }
}
