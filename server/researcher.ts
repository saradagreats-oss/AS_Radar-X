import crypto from 'node:crypto';
import { AdobeStockCollector } from './collectors/adobeStock.js';
import { Pond5Collector } from './collectors/pond5.js';
import { ShutterstockCollector } from './collectors/shutterstock.js';
import { runGeminiStrategicAnalyst, runGeminiWebResearch, buildReportWarningText } from './gemini/analyst.js';
import { analyzeCommercialUse } from './analysis/commercialUse.js';
import { checkHistoryProtection } from './analysis/historyProtection.js';
import { analyzeLongevity } from './analysis/longevity.js';
import { computeInternalPriorityScore } from './analysis/opportunityScore.js';
import { analyzeRecurrence } from './analysis/recurrence.js';
import { evaluateRiskAndRejections } from './analysis/riskFilter.js';
import { analyzeSupplyAndGaps } from './analysis/supply.js';
import { clusterEvidence } from './normalization/clustering.js';
import { deduplicateEvidence } from './normalization/dedupe.js';
import { normalizeEvidence } from './normalization/textNormalizer.js';
import { storage } from './storage/database.js';
import type {
  ClusterAnalysis,
  CollectorStatus,
  RawEvidence,
  ResearchJobState,
  ResearchReport,
  ResearchStage
} from './types.js';

const BASE_RESEARCH_DOMAINS = [
  'healthcare technology',
  'business software',
  'cybersecurity',
  'clean energy',
  'logistics automation',
  'financial services',
  'workplace collaboration',
  'food systems',
  'education technology',
  'healthy aging',
  'manufacturing technology',
  'sustainable infrastructure'
];

function buildResearchTopics(userInstructions: string, pastHistory: Array<{ title: string; concept: string }>): string[] {
  const instructionTerms = (userInstructions || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .slice(0, 10);

  const historyTerms = pastHistory
    .flatMap((item) => `${item.title} ${item.concept}`.split(/\s+/))
    .map((word) => word.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter((word) => word.length >= 6)
    .slice(0, 8);

  const seeds = [...BASE_RESEARCH_DOMAINS, ...instructionTerms.map((term) => `${term} commercial use`), ...historyTerms.map((term) => `${term} alternative use case`)];
  return Array.from(new Set(seeds)).slice(0, 12);
}

class ResearchCoordinator {
  private activeJobs = new Map<string, ResearchJobState>();

  public createJob(photoCount: number, videoCount: number): string {
    const safePhotos = Math.max(0, Math.min(10, Math.floor(photoCount)));
    const safeVideos = Math.max(0, Math.min(10, Math.floor(videoCount)));
    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const state: ResearchJobState = {
      jobId,
      status: 'RUNNING',
      stage: 'INITIALIZING',
      progress: 5,
      message: 'Initializing research engine...',
      startedAt: Date.now()
    };

    this.activeJobs.set(jobId, state);
    this.executePipeline(jobId, safePhotos, safeVideos).catch((err) => {
      console.error(`Research pipeline error for job ${jobId}:`, err);
      const current = this.activeJobs.get(jobId);
      if (current) {
        current.status = 'FAILED';
        current.error = err?.message || 'Unknown research pipeline failure';
        current.message = `Engine failed: ${current.error}`;
      }
    });

    return jobId;
  }

  public getJobState(jobId: string): ResearchJobState | null {
    const job = this.activeJobs.get(jobId);
    if (job) return job;
    const saved = storage.getReport(jobId);
    if (!saved) return null;
    return {
      jobId,
      status: saved.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
      stage: 'COMPLETE',
      progress: 100,
      message: 'Report ready',
      startedAt: new Date(saved.created_at).getTime(),
      report: saved
    };
  }

  private updateStage(jobId: string, stage: ResearchStage, progress: number, message: string) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.stage = stage;
      job.progress = progress;
      job.message = message;
    }
  }

  private async executePipeline(jobId: string, photoCount: number, videoCount: number) {
    const startTime = Date.now();
    const warnings: string[] = [];

    this.updateStage(jobId, 'INITIALIZING', 8, 'Loading user research preferences, history, and rejection memory...');
    const userInstructions = storage.getInstructions();
    const rejectedItems = storage.getRejectedContent();
    const pastHistory = storage.getRecentOpportunityHistory(30);
    const researchTopics = buildResearchTopics(userInstructions, pastHistory);

    this.updateStage(jobId, 'COLLECTING', 20, `Collecting live marketplace evidence across ${researchTopics.length} research topics...`);
    const shutterstock = new ShutterstockCollector();
    const adobeStock = new AdobeStockCollector();
    const pond5 = new Pond5Collector();

    const [shutterResults, adobeResults, pondResults] = await Promise.all([
      shutterstock.collect(researchTopics),
      adobeStock.collect(researchTopics),
      pond5.collect(researchTopics)
    ]);

    const allCollectorResults = [...shutterResults, ...adobeResults, ...pondResults];
    const sourceStatus: Record<string, CollectorStatus> = {
      Shutterstock: shutterResults.some((r) => r.status === 'AVAILABLE') ? 'AVAILABLE' : (shutterResults.find((r) => r.status !== 'EMPTY')?.status || 'EMPTY'),
      'Adobe Stock': adobeResults.some((r) => r.status === 'AVAILABLE') ? 'AVAILABLE' : (adobeResults.find((r) => r.status !== 'EMPTY')?.status || 'EMPTY'),
      Pond5: pondResults.some((r) => r.status === 'AVAILABLE') ? 'AVAILABLE' : (pondResults.find((r) => r.status !== 'EMPTY')?.status || 'EMPTY')
    };

    for (const result of allCollectorResults) {
      if (result.status !== 'AVAILABLE') {
        warnings.push(`${result.sourceName} / ${result.subSource}: ${result.status}${result.notes ? ` — ${result.notes}` : ''}`);
      }
    }

    const rawEvidence: RawEvidence[] = allCollectorResults.flatMap((r) => r.evidence || []);
    storage.saveRawEvidence(jobId, rawEvidence);

    this.updateStage(jobId, 'NORMALIZING', 34, `Normalizing ${rawEvidence.length} real evidence records...`);
    const normalized = rawEvidence.map(normalizeEvidence);

    this.updateStage(jobId, 'DEDUPLICATING', 43, 'Removing duplicate observations without inventing missing data...');
    const deduplicated = deduplicateEvidence(normalized);

    this.updateStage(jobId, 'CLUSTERING', 52, 'Building evidence-based commercial clusters...');
    const clusters = clusterEvidence(deduplicated);

    this.updateStage(jobId, 'DEMAND_ANALYSIS', 61, 'Analyzing recurrence and multi-source demand signals...');
    this.updateStage(jobId, 'SUPPLY_GAP', 68, 'Measuring observed sample saturation and differentiation potential...');
    this.updateStage(jobId, 'COMMERCIAL_USE', 74, 'Mapping inferred commercial buyer/use cases...');
    this.updateStage(jobId, 'LONGEVITY', 79, 'Assessing longevity and trend dependence...');
    this.updateStage(jobId, 'SCORING', 84, 'Calculating transparent internal opportunity priority...');

    const clusterAnalyses: ClusterAnalysis[] = clusters.map((cluster) => {
      const recurrence = analyzeRecurrence(cluster);
      const commercialUse = analyzeCommercialUse(cluster);
      const longevity = analyzeLongevity(cluster);
      const supply = analyzeSupplyAndGaps(cluster);
      const score = computeInternalPriorityScore(cluster, supply, commercialUse, longevity);
      return { cluster, recurrence, commercialUse, longevity, supply, score };
    });

    const deterministicCandidates = clusterAnalyses.filter((analysis) => {
      const text = `${analysis.cluster.name} ${analysis.cluster.primary_keywords.join(' ')}`;
      const hasMarketplaceObservation = analysis.cluster.evidence_samples.some((e) =>
        ['search_observation', 'shot_list', 'contributor_guidance', 'footage_demand'].includes(e.evidence_type)
      );
      // A trend/editorial label by itself is not enough to become a stock opportunity.
      // It must be anchored by at least one marketplace/contributor observation and the deterministic evidence gates.
      return hasMarketplaceObservation
        && !evaluateRiskAndRejections(text, rejectedItems).rejected
        && analysis.score.score >= 30;
    });

    let webResearch = undefined;
    try {
      this.updateStage(jobId, 'SCORING', 88, 'Running a grounded web-research pass for current commercial context and missing source signals...');
      webResearch = await runGeminiWebResearch({
        clusters: deterministicCandidates.slice(0, 10).map((a) => a.cluster),
        rawEvidence: rawEvidence.slice(0, 100),
        sourceStatuses: sourceStatus,
        requestedPhotoCount: photoCount,
        requestedVideoCount: videoCount,
        researchTopics,
        userCustomInstructions: userInstructions,
        rejectedContentList: rejectedItems
      });
      if (webResearch.sources.length === 0) warnings.push('Gemini web-research pass returned no grounded source metadata.');
    } catch (err: any) {
      warnings.push(`Gemini grounded web research unavailable: ${err.message}`);
    }

    this.updateStage(jobId, 'PREPARING_PHOTOS', 92, 'Turning evidence into differentiated photo opportunities with detailed production specs...');
    this.updateStage(jobId, 'PREPARING_VIDEOS', 96, 'Turning evidence into motion-specific video opportunities with detailed production specs...');

    let analystOutput;
    try {
      analystOutput = await runGeminiStrategicAnalyst({
        clusters: deterministicCandidates.slice(0, 12).map((a) => a.cluster),
        clusterAnalyses: deterministicCandidates.slice(0, 12),
        rawEvidence,
        sourceStatuses: sourceStatus,
        requestedPhotoCount: photoCount,
        requestedVideoCount: videoCount,
        userCustomInstructions: userInstructions,
        rejectedContentList: rejectedItems,
        pastOpportunitiesHistory: pastHistory,
        webResearch
      });
    } catch (err: any) {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const failedReport: ResearchReport = {
        id: jobId,
        job_id: jobId,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        duration: `${elapsedSeconds}s`,
        status: 'FAILED',
        sources_processed: Object.keys(sourceStatus),
        source_status: sourceStatus,
        evidence_summary: 'Gemini strategic analysis could not complete. The collected source evidence was preserved in SQLite.',
        warnings: [...warnings, `Gemini analysis failed: ${err.message}`],
        photo_count_requested: photoCount,
        video_count_requested: videoCount,
        photos: [],
        videos: [],
        analysis_stats: {
          raw_evidence_count: rawEvidence.length,
          deduplicated_evidence_count: deduplicated.length,
          cluster_count: clusters.length,
          evidence_backed_candidate_count: deterministicCandidates.length,
          rejected_candidate_count: Math.max(0, clusters.length - deterministicCandidates.length)
        },
        web_research: webResearch
      };
      storage.saveReport(failedReport);
      const current = this.activeJobs.get(jobId);
      if (current) {
        current.status = 'FAILED';
        current.stage = 'COMPLETE';
        current.progress = 100;
        current.message = 'Research finished with Gemini analysis failure.';
        current.error = err.message;
        current.report = failedReport;
      }
      return;
    }

    const validationWarnings = buildReportWarningText({
      requestedPhotoCount: photoCount,
      requestedVideoCount: videoCount,
      photos: analystOutput.photos,
      videos: analystOutput.videos,
      sourceStatuses: sourceStatus
    });

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const report: ResearchReport = {
      id: jobId,
      job_id: jobId,
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      duration: `${elapsedSeconds}s`,
      status: analystOutput.photos.length || analystOutput.videos.length ? 'COMPLETED' : 'INSUFFICIENT_EVIDENCE',
      sources_processed: Object.keys(sourceStatus),
      source_status: sourceStatus,
      evidence_summary: analystOutput.evidence_summary,
      warnings: Array.from(new Set([...warnings, ...(analystOutput.warnings || []), ...validationWarnings])),
      photo_count_requested: photoCount,
      video_count_requested: videoCount,
      photos: analystOutput.photos,
      videos: analystOutput.videos,
      internal_score_explanation: deterministicCandidates[0]?.score.explanation,
      analysis_stats: {
        raw_evidence_count: rawEvidence.length,
        deduplicated_evidence_count: deduplicated.length,
        cluster_count: clusters.length,
        evidence_backed_candidate_count: deterministicCandidates.length,
        rejected_candidate_count: Math.max(0, clusters.length - deterministicCandidates.length)
      },
      web_research: webResearch
    };

    storage.saveReport(report);

    const current = this.activeJobs.get(jobId);
    if (current) {
      current.status = 'COMPLETED';
      current.stage = 'COMPLETE';
      current.progress = 100;
      current.message = report.status === 'COMPLETED' ? 'Report ready' : 'Insufficient evidence for a complete report';
      current.report = report;
    }
  }
}

export const researchCoordinator = new ResearchCoordinator();
