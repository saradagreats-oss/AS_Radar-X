import type { CollectorStatus, RawEvidence } from '../types.js';

export interface CollectorResult {
  sourceName: 'Reddit' | 'Discord';
  subSource: string;
  status: CollectorStatus;
  url: string;
  evidence: RawEvidence[];
  error?: string;
  notes?: string;
}

export abstract class BaseCollector {
  public abstract readonly name: 'Reddit' | 'Discord';

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
