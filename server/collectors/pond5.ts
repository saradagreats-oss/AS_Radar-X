import { BaseCollector, type CollectorResult } from './base.js';
import type { RawEvidence } from '../types.js';

const POND5_TRENDS_FOOTAGE = 'https://contributor.pond5.com/data-trends/footage/';
const POND5_TRENDS_PHOTOS = 'https://contributor.pond5.com/data-trends/photos/';
const POND5_BLOG = 'https://blog.pond5.com/';

export class Pond5Collector extends BaseCollector {
  public readonly name = 'Pond5' as const;

  public async collect(targetTopics: string[] = []): Promise<CollectorResult[]> {
    const results: CollectorResult[] = [];
    const timestamp = new Date().toISOString();
    const topics = this.uniqueTopics(targetTopics);

    for (const topic of topics) {
      const footageUrl = `https://www.pond5.com/search?kw=${encodeURIComponent(topic)}&media=footage`;
      try {
        const response = await this.safeFetch(footageUrl, { timeoutMs: 10000, referer: 'https://www.pond5.com/' });
        if (response.blocked) {
          results.push(this.makeStatus('Pond5', `Footage Search: ${topic}`, footageUrl, 'BLOCKED', [], { notes: `HTTP ${response.status}; no synthetic replacement was used.` }));
          continue;
        }
        if (!response.ok) {
          results.push(this.makeStatus('Pond5', `Footage Search: ${topic}`, footageUrl, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` }));
          continue;
        }
        const evidence = this.extractSearchEvidence(response.text, footageUrl, timestamp, topic, 'footage_demand');
        results.push(this.makeStatus('Pond5', `Footage Search: ${topic}`, footageUrl, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence));
      } catch (err: any) {
        results.push(this.makeStatus('Pond5', `Footage Search: ${topic}`, footageUrl, 'ERROR', [], { error: err.message }));
      }
    }

    results.push(await this.collectPage(POND5_TRENDS_FOOTAGE, 'Pond5 Footage Data & Trends', timestamp));
    results.push(await this.collectPage(POND5_TRENDS_PHOTOS, 'Pond5 Photo Data & Trends', timestamp));
    results.push(await this.collectPage(POND5_BLOG, 'Pond5 Blog', timestamp));

    return results;
  }

  private async collectPage(url: string, label: string, timestamp: string): Promise<CollectorResult> {
    try {
      const response = await this.safeFetch(url, { timeoutMs: 10000, referer: 'https://www.pond5.com/' });
      if (response.blocked) {
        return this.makeStatus('Pond5', label, url, 'BLOCKED', [], { notes: `HTTP ${response.status}; no synthetic replacement was used.` });
      }
      if (!response.ok) {
        return this.makeStatus('Pond5', label, url, 'UNAVAILABLE', [], { notes: `HTTP ${response.status}` });
      }
      const evidence = this.extractPageEvidence(response.text, url, timestamp, label);
      return this.makeStatus('Pond5', label, url, evidence.length ? 'AVAILABLE' : 'EMPTY', evidence);
    } catch (err: any) {
      return this.makeStatus('Pond5', label, url, 'ERROR', [], { error: err.message });
    }
  }

  private extractSearchEvidence(html: string, url: string, timestamp: string, topic: string, type: 'footage_demand' | 'search_observation'): RawEvidence[] {
    const candidates = [
      ...Array.from(html.matchAll(/<img[^>]+alt=["']([^"']{10,160})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|description)["'][^>]+content=["']([^"']{10,240})["']/gi)).map((m) => m[1]),
      ...Array.from(html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)).map((m) => m[1].replace(/<[^>]+>/g, ' '))
    ];
    const evidence: RawEvidence[] = [];
    const seen = new Set<string>();
    for (const raw of candidates.slice(0, 24)) {
      const title = raw.replace(/\s+/g, ' ').trim();
      if (title.length < 8 || title.toLowerCase().includes('pond5') || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      evidence.push({
        source: 'Pond5',
        url,
        collected_at: timestamp,
        evidence_type: type,
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
        source: 'Pond5',
        url,
        collected_at: timestamp,
        evidence_type: label.includes('Blog') ? 'trends' : 'footage_demand',
        raw_title: text,
        raw_keywords: text.split(/\s+/).filter((w) => w.length > 3).slice(0, 20)
      });
    }
    return evidence;
  }
}
