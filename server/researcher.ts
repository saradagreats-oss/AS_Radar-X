import crypto from 'node:crypto';
import { RedditCollector } from './collectors/reddit.js';
import { DiscordCollector } from './collectors/discord.js';
import { runGeminiStrategicAnalyst, runGeminiWebResearch, buildReportWarningText } from './gemini/analyst.js';
import { analyzeCommercialUse } from './analysis/commercialUse.js';
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
  'commercial enterprise',
  'video editing workflows',
  'graphic design bottlenecks',
  'modern healthcare b-roll',
  'clean sustainable energy',
  'logistics automation',
  'fintech and security',
  'blender and 3d assets',
  'midjourney and ai creator workflows',
  'motion graphics needs',
  'authentic workplace collaboration'
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

  const seeds = [
    ...BASE_RESEARCH_DOMAINS,
    ...instructionTerms.map((term) => `${term} creator request`),
    ...historyTerms.map((term) => `${term} alternative angle`)
  ];
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

    this.updateStage(jobId, 'INITIALIZING', 8, 'Loading settings, community lists, rejection memory, and platform toggles...');
    const userInstructions = storage.getInstructions();
    const rejectedItems = storage.getRejectedContent();
    const pastHistory = storage.getRecentOpportunityHistory(30);
    const isPlatformDataEnabled = storage.getPlatformDataEnabled();
    const researchTopics = buildResearchTopics(userInstructions, pastHistory);

    let rawEvidence: RawEvidence[] = [];
    const sourceStatus: Record<string, CollectorStatus> = {};

    if (isPlatformDataEnabled) {
      this.updateStage(jobId, 'COLLECTING', 22, 'Collecting live creator discussions, requests, and complaints from Reddit & Discord...');
      const redditCollector = new RedditCollector();
      const discordCollector = new DiscordCollector();

      const [redditResults, discordResults] = await Promise.all([
        redditCollector.collect(researchTopics),
        discordCollector.collect(researchTopics)
      ]);

      const allResults = [...redditResults, ...discordResults];

      sourceStatus['Reddit'] = redditResults.some((r) => r.status === 'AVAILABLE')
        ? 'AVAILABLE'
        : (redditResults.find((r) => r.status !== 'EMPTY')?.status || 'EMPTY');

      sourceStatus['Discord'] = discordResults.some((r) => r.status === 'AVAILABLE')
        ? 'AVAILABLE'
        : (discordResults.find((r) => r.status !== 'EMPTY')?.status || 'EMPTY');

      for (const res of allResults) {
        if (res.status !== 'AVAILABLE') {
          warnings.push(`${res.sourceName} / ${res.subSource}: ${res.status}${res.notes ? ` — ${res.notes}` : ''}`);
        }
      }

      rawEvidence = allResults.flatMap((r) => r.evidence || []);
    } else {
      this.updateStage(jobId, 'COLLECTING', 25, 'Platform Data disabled by user. Operating in pure Gemini AI Intelligence + Historical Data mode...');
      sourceStatus['Reddit'] = 'DISABLED';
      sourceStatus['Discord'] = 'DISABLED';
      sourceStatus['AI Intelligence'] = 'AVAILABLE';
      warnings.push('Platform Data (Reddit/Discord) was disabled in Settings. Opportunities were synthesized via Gemini Strategic Intelligence and historical demand data.');
    }

    storage.saveRawEvidence(jobId, rawEvidence);

    this.updateStage(jobId, 'NORMALIZING', 35, `Normalizing ${rawEvidence.length} conversation evidence records...`);
    const normalized = rawEvidence.map(normalizeEvidence);

    this.updateStage(jobId, 'DEDUPLICATING', 44, 'Removing duplicate discussion signals...');
    const deduplicated = deduplicateEvidence(normalized);

    this.updateStage(jobId, 'CLUSTERING', 52, 'Clustering recurring human discussion needs, asset requests, and complaints...');
    const clusters = clusterEvidence(deduplicated);

    this.updateStage(jobId, 'DEMAND_ANALYSIS', 62, 'Analyzing human demand recurrence across communities...');
    this.updateStage(jobId, 'SUPPLY_GAP', 68, 'Measuring creator-reported asset shortages and differentiation gaps...');
    this.updateStage(jobId, 'COMMERCIAL_USE', 74, 'Mapping commercial brand and editorial buyer use cases...');
    this.updateStage(jobId, 'LONGEVITY', 80, 'Assessing multi-year evergreen viability vs short-lived fads...');
    this.updateStage(jobId, 'SCORING', 85, 'Calculating transparent internal opportunity priority score...');

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
      return !evaluateRiskAndRejections(text, rejectedItems).rejected;
    });

    let webResearch = undefined;
    try {
      this.updateStage(jobId, 'SCORING', 88, 'Executing grounded web-research pass for broader creator community discussions...');
      webResearch = await runGeminiWebResearch({
        clusters: deterministicCandidates.slice(0, 10).map((a) => a.cluster),
        rawEvidence: rawEvidence.slice(0, 80),
        sourceStatuses: sourceStatus,
        requestedPhotoCount: photoCount,
        requestedVideoCount: videoCount,
        researchTopics,
        userCustomInstructions: userInstructions,
        rejectedContentList: rejectedItems,
        isPlatformDataEnabled
      });
      if (webResearch.sources.length === 0) {
        warnings.push('Gemini web-research pass returned no grounded external sources.');
      }
    } catch (err: any) {
      warnings.push(`Grounded web research pass unavailable: ${err.message}`);
    }

    this.updateStage(jobId, 'PREPARING_PHOTOS', 92, 'Formulating differentiated photo opportunities with complete production specifications...');
    this.updateStage(jobId, 'PREPARING_VIDEOS', 96, 'Formulating high-value motion video opportunities with cinematic camera specifications...');

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
        webResearch,
        isPlatformDataEnabled
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
        evidence_summary: 'Gemini strategic analysis could not complete. Raw conversation evidence was safely preserved in SQLite.',
        warnings: [...warnings, `Gemini analysis error: ${err.message}`],
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
        current.message = 'Research ended with Gemini analysis failure.';
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
