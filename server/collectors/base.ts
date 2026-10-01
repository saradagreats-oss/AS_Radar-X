import type { CollectorStatus, RawEvidence } from '../types.js';

export interface CollectorResult {
  sourceName: 'Shutterstock' | 'Adobe Stock' | 'Pond5';
  subSource: string;
  status: CollectorStatus;
  url: string;
  evidence: RawEvidence[];
  error?: string;
  notes?: string;
}

export abstract class BaseCollector {
  public abstract readonly name: 'Shutterstock' | 'Adobe Stock' | 'Pond5';

  protected uniqueTopics(targetTopics: string[], max = 8): string[] {
    return Array.from(new Set(
      targetTopics
        .map((topic) => String(topic || '').trim())
        .filter((topic) => topic.length >= 3)
    )).slice(0, max);
  }

  protected async safeFetch(
    url: string,
    options: {
      timeoutMs?: number;
      accept?: string;
      referer?: string;
    } = {}
  ): Promise<{ status: number; text: string; ok: boolean; blocked: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

    const headers: Record<string, string> = {
      'User-Agent': 'AS-Radar-X/1.0 (+public-market-research; respects robots.txt and access controls)',
      Accept: options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    };

    if (options.referer) headers.Referer = options.referer;

    try {
      const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeout);
      const text = await res.text();
      const status = res.status;
      const lower = text.toLowerCase();
      const blocked =
        status === 403 || status === 429 || status === 503 ||
        lower.includes('captcha') ||
        lower.includes('challenge-platform') ||
        lower.includes('attention required! | cloudflare') ||
        lower.includes('please enable js and disable any ad blocker');

      return { status, text, ok: res.ok && !blocked, blocked };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        throw new Error(`Timeout after ${options.timeoutMs || 12000}ms connecting to ${url}`);
      }
      throw err;
    }
  }

  protected makeStatus(
    sourceName: CollectorResult['sourceName'],
    subSource: string,
    url: string,
    status: CollectorStatus,
    evidence: RawEvidence[] = [],
    extra: Partial<CollectorResult> = {}
  ): CollectorResult {
    return { sourceName, subSource, url, status, evidence, ...extra };
  }

  public abstract collect(targetTopics?: string[]): Promise<CollectorResult[]>;
}
