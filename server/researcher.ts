import crypto from 'node:crypto';
import { RedditCollector } from './collectors/reddit.js';
import { DiscordCollector } from './collectors/discord.js';
import { runGeminiStrategicAnalyst, runGeminiWebResearch, buildReportWarningText } from './gemini/analyst.js';
import { analyzeCommercialUse } from './analysis/commercialUse.js';
import { analyzeLongevity } from './analysis/longevity.js';
import { computeInternalPriorityScore } from './analysis/opportunityScore.js';
import { analyzeRecurrence } from './analysis/recurrence.js';
import { evaluateRiskAndRejections } from './analysis/riskFilter.js';
import { checkHistoryProtection } from './analysis/historyProtection.js';
import { analyzeSupplyAndGaps } from './analysis/supply.js';
import { clusterEvidence } from './normalization/clustering.js';
import { deduplicateEvidence } from './normalization/dedupe.js';
import { normalizeEvidence } from './normalization/textNormalizer.js';
import { storage } from './storage/database.js';
import type {
  ClusterAnalysis,
  CollectorStatus,
  RawEvidence,
  NormalizedEvidence,
  ConceptCluster,
  ResearchJobState,
  ResearchReport,
  ResearchStage
} from './types.js';



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

    let rawEvidence: RawEvidence[] = [];
    const sourceStatus: Record<string, CollectorStatus> = {};

    if (isPlatformDataEnabled) {
      this.updateStage(jobId, 'COLLECTING', 22, 'Collecting live creator discussions, requests, and complaints from Reddit & Discord...');
      const redditCollector = new RedditCollector();
      const discordCollector = new DiscordCollector();

      const [redditResults, discordResults] = await Promise.all([
        redditCollector.collect(),
        discordCollector.collect()
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

    // Gemini-only mode is intentionally isolated from the deterministic topic/category
    // heuristics. When Platform Data is OFF, Gemini receives the user's instructions,
    // prior opportunity history, and live grounded web research, then decides what to
    // investigate and how to interpret it. The existing deterministic pipeline remains
    // intact for Reddit/Discord mode.
    let deduplicated: NormalizedEvidence[] = [];
    let clusters: ConceptCluster[] = [];
    let deterministicCandidates: ClusterAnalysis[] = [];
    let webResearch = undefined;

    if (isPlatformDataEnabled) {
      this.updateStage(jobId, 'NORMALIZING', 35, `Normalizing ${rawEvidence.length} conversation evidence records...`);
      const normalized = rawEvidence.map(normalizeEvidence);

      this.updateStage(jobId, 'DEDUPLICATING', 44, 'Removing duplicate discussion signals...');
      deduplicated = deduplicateEvidence(normalized);

      this.updateStage(jobId, 'CLUSTERING', 52, 'Clustering recurring human discussion needs, asset requests, and complaints...');
      clusters = clusterEvidence(deduplicated);

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

      deterministicCandidates = clusterAnalyses.filter((analysis) => {
        const text = `${analysis.cluster.name} ${analysis.cluster.primary_keywords.join(' ')}`;
        return !evaluateRiskAndRejections(text, rejectedItems).rejected;
      });

      try {
        this.updateStage(jobId, 'SCORING', 88, 'Executing grounded web-research pass for broader creator community discussions...');
        webResearch = await runGeminiWebResearch({
          clusters: deterministicCandidates.slice(0, 10).map((a) => a.cluster),
          rawEvidence: rawEvidence.slice(0, 80),
          sourceStatuses: sourceStatus,
          requestedPhotoCount: photoCount,
          requestedVideoCount: videoCount,
          researchTopics: [],
          userCustomInstructions: userInstructions,
          rejectedContentList: rejectedItems,
          pastOpportunitiesHistory: pastHistory,
          isPlatformDataEnabled
        });
        if (webResearch.sources.length === 0) {
          warnings.push('Gemini web-research pass returned no grounded external sources.');
        }
      } catch (err: any) {
        warnings.push(`Grounded web research pass unavailable: ${err.message}`);
      }
    } else {
      this.updateStage(jobId, 'NORMALIZING', 38, 'Gemini-only mode: no fixed topic taxonomy or deterministic category heuristics are being applied...');
      this.updateStage(jobId, 'SCORING', 55, 'Gemini is choosing the research direction from your instructions, history, and current web evidence...');

      try {
        webResearch = await runGeminiWebResearch({
          clusters: [],
          rawEvidence: [],
          sourceStatuses: sourceStatus,
          requestedPhotoCount: photoCount,
          requestedVideoCount: videoCount,
          researchTopics: [],
          userCustomInstructions: userInstructions,
          rejectedContentList: rejectedItems,
          pastOpportunitiesHistory: pastHistory,
          isPlatformDataEnabled
        });
        if (webResearch.sources.length === 0) {
          warnings.push('Gemini-only research returned no grounded external sources.');
        }
        if (webResearch.findings.length === 0) {
          warnings.push('Gemini-only research returned no structured findings.');
        }
      } catch (err: any) {
        warnings.push(`Gemini-only grounded web research unavailable: ${err.message}`);
      }
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

      // Preserve the existing history feature at the application boundary too.
      // Gemini is told to avoid repeats, but this final guard prevents near-duplicates
      // from being surfaced even when the model ignores that instruction.
      const historyBefore = analystOutput.photos.length + analystOutput.videos.length;
      analystOutput.photos = analystOutput.photos.filter((item) => {
        const check = checkHistoryProtection(item.title, item.concept, pastHistory);
        return !check.isRepetitive;
      });
      analystOutput.videos = analystOutput.videos.filter((item) => {
        const check = checkHistoryProtection(item.title, item.concept, pastHistory);
        return !check.isRepetitive;
      });
      const historyRemoved = historyBefore - (analystOutput.photos.length + analystOutput.videos.length);
      if (historyRemoved > 0) {
        warnings.push(`History protection removed ${historyRemoved} opportunity candidate(s) that closely repeated prior reports.`);
      }
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
        evidence_summary: 'Gemini strategic analysis could not complete. Collected research inputs were safely preserved in SQLite.',
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
      sourceStatuses: sourceStatus,
      isPlatformDataEnabled
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
