import crypto from 'node:crypto';
import { runComputerUseResearch } from './agent/computerUseResearch.js';
import { runGeminiStrategicAnalyst, buildReportWarningText } from './gemini/analyst.js';
import { browserBridge } from './agent/browserBridge.js';
import { normalizeResearchPages } from './normalization/researchKnowledge.js';
import { storage } from './storage/database.js';
import type {
  CollectorStatus,
  PortfolioSummary,
  ResearchJobState,
  ResearchReport,
  ResearchStage,
  SourceEvidenceRecord,
  WebResearchResult
} from './types.js';

export interface ResearchJobOptions {
  niche?: string;
  titleInstructions?: string;
  tagCount?: number;
}

class ResearchCoordinator {
  private activeJobs = new Map<string, ResearchJobState>();

  public createJob(photoCount: number, videoCount: number, options: ResearchJobOptions = {}): string {
    const safePhotos = Math.max(0, Math.min(10, Math.floor(photoCount)));
    const safeVideos = Math.max(0, Math.min(10, Math.floor(videoCount)));
    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const state: ResearchJobState = {
      jobId,
      status: 'RUNNING',
      stage: 'INITIALIZING',
      progress: 3,
      message: 'Preparing autonomous research...',
      startedAt: Date.now()
    };
    this.activeJobs.set(jobId, state);
    void this.executePipeline(jobId, safePhotos, safeVideos, options).catch((err: any) => {
      console.error(`Research pipeline error for job ${jobId}:`, err);
      const current = this.activeJobs.get(jobId);
      if (current) {
        current.status = 'FAILED';
        current.stage = 'COMPLETE';
        current.progress = 100;
        current.error = err?.message || 'Unknown research pipeline failure';
        current.message = `Research failed: ${current.error}`;
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
      message: saved.status === 'INSUFFICIENT_EVIDENCE' ? 'Research completed with insufficient evidence.' : 'Report ready',
      startedAt: new Date(saved.created_at).getTime(),
      report: saved
    };
  }

  private updateStage(jobId: string, stage: ResearchStage, progress: number, message: string) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    job.stage = stage;
    job.progress = Math.max(0, Math.min(100, progress));
    job.message = message;
    storage.appendResearchEvent({
      id: crypto.randomUUID(),
      jobId,
      at: new Date().toISOString(),
      type: 'stage',
      message,
      details: { stage, progress }
    });
  }

  private buildSourceEvidence(jobId: string): { pages: any[]; sources: SourceEvidenceRecord[] } {
    const events = storage.getResearchEvents(jobId);
    const pageEvents = events.filter((event: any) => event.type === 'page_visited');
    const seen = new Set<string>();
    const pages = pageEvents.filter((event: any) => {
      const url = String(event.url || event.details?.url || '');
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    const sources: SourceEvidenceRecord[] = pages.map((event: any, index: number) => {
      let sourceFamily = 'website';
      try { sourceFamily = new URL(String(event.url || '')).hostname.replace(/^www\./, ''); } catch { /* keep default */ }
      return {
        id: index + 1,
        title: String(event.message || event.details?.title || event.url || `Source ${index + 1}`).slice(0, 220),
        url: String(event.url || event.details?.url || ''),
        source_family: sourceFamily,
        observation: String(event.details?.text || '').slice(0, 1200)
      };
    });
    return { pages, sources };
  }

  private buildMemoryContext(pastHistory: Array<{ title: string; concept: string }>, rejectedItems: string[], knowledge: Array<Record<string, any>>, portfolioSnapshot: any): string {
    const opportunities = pastHistory.slice(0, 120).map((item, index) => String(index + 1) + '. ' + item.title + ' | ' + (item.concept || '')).join('\n');
    const priorPages = knowledge.slice(0, 80).map((item: any) => {
      const keywords = Array.isArray(item.keywords) ? item.keywords.slice(0, 16).join(', ') : '';
      return '- ' + item.title + ' | ' + item.sourceFamily + ' | category=' + item.category + ' | seen=' + (item.seenCount || 1) + ' | terms=' + keywords + ' | url=' + item.canonicalUrl;
    }).join('\n');
    return [
      'PREVIOUS OPPORTUNITIES (avoid exact and near repeats; not current market evidence):',
      opportunities || 'None recorded.',
      '',
      'USER REJECTIONS (strict negative constraints):',
      rejectedItems.map(item => '- ' + item).join('\n') || 'None supplied.',
      '',
      'PREVIOUSLY NORMALIZED RESEARCH KNOWLEDGE (deduplication and discovery memory only; not proof of current demand):',
      priorPages || 'No normalized pages recorded yet.',
      '',
      'PREVIOUS ADOBE PORTFOLIO SNAPSHOT (duplicate/status reference only; re-check the live portfolio):',
      JSON.stringify(portfolioSnapshot?.summary || null)
    ].join('\n');
  }
  private buildResearchMemo(agentMemo: string, pages: any[], sources: SourceEvidenceRecord[]): string {
    const observations = pages.slice(0, 45).map((event: any, index: number) => {
      const detail = event.details || {};
      return [
        `EVIDENCE SOURCE ID: ${index + 1}`,
        `TITLE: ${event.message || ''}`,
        `URL: ${event.url || ''}`,
        `VISIBLE PAGE TEXT: ${String(detail.text || '').slice(0, 2200)}`,
        `HEADINGS: ${(detail.headings || []).slice(0, 12).join(' | ')}`
      ].join('\n');
    }).join('\n\n');
    return [
      'GEMINI COMPUTER-USE RESEARCH DIRECTOR MEMO:',
      (agentMemo || 'The browsing agent did not return a written summary. Use the independently captured page observations below.').slice(0, 30000),
      '',
      'INDEPENDENTLY RECORDED BROWSER OBSERVATIONS:',
      observations,
      '',
      'SOURCE INDEX:',
      JSON.stringify(sources, null, 2)
    ].join('\n');
  }

  private async executePipeline(jobId: string, photoCount: number, videoCount: number, options: ResearchJobOptions) {
    const started = Date.now();
    const warnings: string[] = [];
    const userInstructions = storage.getInstructions();
    const rejectedItems = storage.getRejectedContent();
    const pastHistory = storage.getRecentOpportunityHistory(120);
    const pdfDoc = storage.getPdfDocument();
    const tagCount = Math.max(1, Math.min(50, Math.floor(Number(options.tagCount) || 25)));
    const titleInstructions = String(options.titleInstructions || '').trim();
    const niche = String(options.niche || '').trim() ||
      'Discover the strongest evidence-backed, durable commercial stock photo and video opportunities across all relevant industries. Choose the research direction autonomously from current evidence and portfolio gaps.';

    const previousPortfolio = storage.getLatestPortfolioSnapshot();
    const priorKnowledge = storage.getRecentNormalizedResearchEvidence(100);
    const memoryContext = this.buildMemoryContext(pastHistory, rejectedItems, priorKnowledge, previousPortfolio);
    let agentResult: any = null;
    let evidenceSources: SourceEvidenceRecord[] = [];
    let portfolioSummary: PortfolioSummary | null = null;
    let webResearch: WebResearchResult | undefined;

    try {
      this.updateStage(jobId, 'PLANNING', 7, 'Gemini is planning the portfolio audit and live market research.');
      if (pdfDoc) {
        this.updateStage(jobId, 'PDF_ANALYSIS', 9, `Loading user reference document: ${pdfDoc.fileName}`);
      }

      agentResult = await runComputerUseResearch({
        jobId,
        niche,
        instructions: userInstructions + (pdfDoc?.instructions ? `\nPDF REFERENCE DIRECTIVES: ${pdfDoc.instructions}` : ''),
        photoCount,
        videoCount,
        model: storage.getCustomModel() || process.env.GEMINI_MODEL || 'auto',
        maxTurns: 55,
        memoryContext,
        onProgress: (stage, progress, message) => {
          this.updateStage(jobId, stage as ResearchStage, progress, message);
        },
        onHandoff: (message) => this.updateStage(jobId, 'PAUSED_FOR_USER', this.activeJobs.get(jobId)?.progress || 30, message),
        onResume: () => this.updateStage(jobId, 'BROWSER_RESEARCH', this.activeJobs.get(jobId)?.progress || 35, 'Human verification completed. Gemini is resuming research.')
      });

      await browserBridge.hide().catch(() => undefined);
      this.updateStage(jobId, 'PORTFOLIO_SYNC', 81, 'Comparing the latest visible Adobe portfolio data with previous snapshots.');
      const latestPortfolio = storage.getLatestPortfolioSnapshot(jobId);
      if (latestPortfolio?.summary) {
        const p: any = latestPortfolio.summary;
        const old: any = previousPortfolio?.summary || {};
        const syncedAssets = storage.getPortfolioAssetsForJob(jobId).length;
        const changedAssets = storage.getPortfolioChanges(jobId).length;
        portfolioSummary = {
          rowCount: Number(p.rowCount) || 0,
          accepted: p.accepted ?? null,
          rejected: p.rejected ?? null,
          pending: p.pending ?? null,
          totalDownloads: p.totalDownloads ?? null,
          changedAssets,
          syncedAssets,
          sourceUrl: latestPortfolio.sourceUrl,
          capturedAt: latestPortfolio.capturedAt
        };
        const deltas = [
          p.accepted != null && old.accepted != null ? `accepted ${Number(p.accepted) - Number(old.accepted) >= 0 ? '+' : ''}${Number(p.accepted) - Number(old.accepted)}` : '',
          p.rejected != null && old.rejected != null ? `rejected ${Number(p.rejected) - Number(old.rejected) >= 0 ? '+' : ''}${Number(p.rejected) - Number(old.rejected)}` : '',
          p.totalDownloads != null && old.totalDownloads != null ? `downloads ${Number(p.totalDownloads) - Number(old.totalDownloads) >= 0 ? '+' : ''}${Number(p.totalDownloads) - Number(old.totalDownloads)}` : ''
        ].filter(Boolean);
        storage.appendResearchEvent({
          id: crypto.randomUUID(), jobId, at: new Date().toISOString(), type: 'portfolio_delta',
          message: deltas.length ? `Portfolio changes since previous snapshot: ${deltas.join(', ')}` : 'Latest portfolio snapshot saved. Previous comparable totals were not available.',
          url: latestPortfolio.sourceUrl,
          details: { changedAssets, syncedAssets, changes: storage.getPortfolioChanges(jobId), deltas, current: portfolioSummary, previous: old }
        });
      } else {
        warnings.push('Adobe Contributor portfolio could not be read in this run. Previous locally stored portfolio data has been retained; no new status or download figures were guessed.');
        const old: any = previousPortfolio?.summary || {};
        if (previousPortfolio) {
          portfolioSummary = {
            rowCount: Number(old.rowCount) || 0, accepted: old.accepted ?? null, rejected: old.rejected ?? null,
            pending: old.pending ?? null, totalDownloads: old.totalDownloads ?? null, changedAssets: 0,
            sourceUrl: previousPortfolio.sourceUrl, capturedAt: previousPortfolio.capturedAt
          };
        }
      }

      this.updateStage(jobId, 'NORMALIZING', 84, 'Deduplicating captured pages and normalizing source evidence.');
      const built = this.buildSourceEvidence(jobId);
      evidenceSources = built.sources;
      const normalizedRecords = normalizeResearchPages(built.pages, jobId);
      storage.saveNormalizedResearchEvidence(jobId, normalizedRecords);
      storage.appendResearchEvent({
        id: crypto.randomUUID(), jobId, at: new Date().toISOString(),
        type: 'normalized_evidence_saved',
        message: 'Browser observations were normalized, fingerprinted and stored for future deduplication.',
        details: { rawPages: built.pages.length, normalizedRecords: normalizedRecords.length, priorKnowledgeRecords: priorKnowledge.length, totalStoredObservationVersions: storage.getNormalizedEvidenceObservationCount(jobId) }
      });
      if (evidenceSources.length < 3) {
        warnings.push(`Only ${evidenceSources.length} unique source pages were captured. Treat confidence conservatively; the final analyst will not invent missing market evidence.`);
      }
      if (agentResult?.turnLimitReached) {
        warnings.push('The browser agent reached its action limit. Captured evidence was preserved, but the source coverage may be incomplete.');
      }

      const observations = built.pages.map((event: any, index: number) => ({
        topic: String(event.message || `Source ${index + 1}`),
        observed_fact: String(event.details?.text || '').slice(0, 1000),
        commercial_signal: '',
        supply_or_differentiation_signal: '',
        inference: ''
      }));
      const researchMemo = this.buildResearchMemo(agentResult?.finalText || '', built.pages, evidenceSources) + '\n\nHISTORICAL DEDUPLICATION MEMORY (not current evidence):\n' + memoryContext.slice(0, 18000);
      webResearch = {
        summary: agentResult?.finalText || 'Computer-use research finished without a narrative memo. The captured source observations remain available.',
        findings: observations.slice(0, 40),
        sources: evidenceSources.map(source => ({ id: source.id, title: source.title, url: source.url })),
        search_queries: []
      };

      const status: Record<string, CollectorStatus> = {
        'Gemini Computer Use': agentResult?.model ? 'AVAILABLE' : 'ERROR',
        'Visible stock and commercial web pages': evidenceSources.length ? 'AVAILABLE' : 'EMPTY',
        'Adobe Contributor portfolio': latestPortfolio && Number((latestPortfolio.summary as any)?.rowCount || 0) > 0 ? 'AVAILABLE' : 'UNAVAILABLE'
      };
      const sourceNames = Array.from(new Set(evidenceSources.map(source => source.source_family || 'Public web')));
      if (latestPortfolio) sourceNames.push('Adobe Contributor Portfolio');

      this.updateStage(jobId, 'FINAL_ANALYSIS', 87, 'The final analyst is synthesizing evidence, checking portfolio conflicts and scoring each candidate.');
      const analystOutput = await runGeminiStrategicAnalyst({
        clusters: [],
        clusterAnalyses: [],
        rawEvidence: [],
        sourceStatuses: status,
        requestedPhotoCount: photoCount,
        requestedVideoCount: videoCount,
        userCustomInstructions: userInstructions,
        rejectedContentList: rejectedItems,
        pastOpportunitiesHistory: pastHistory,
        webResearch,
        pdfDoc,
        tagCount,
        titleInstructions,
        researchMemo,
        evidenceSources,
        portfolioSummary,
        model: agentResult?.model || storage.getCustomModel(),
        allowModelFallback: String(storage.getCustomModel() || '').toLowerCase() === 'auto'
      });

      const photos = analystOutput.photos || [];
      const videos = analystOutput.videos || [];
      const scoreValues = [...photos, ...videos].map(item => item.score?.score).filter((value): value is number => Number.isFinite(value));
      const scoreSummary = {
        average: scoreValues.length ? Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) : 0,
        highest: scoreValues.length ? Math.max(...scoreValues) : 0,
        scored: scoreValues.length,
        formula: 'Demand 25% + Commercial use 20% + Marketplace evidence 20% + Supply/angle gap 15% + Longevity 10% + Production feasibility 10%'
      };
      if (photos.length < photoCount || videos.length < videoCount) {
        warnings.push('Some requested opportunities were withheld because the evidence, differentiation or anti-duplicate checks did not support enough unique candidates.');
      }
      if ([...photos, ...videos].some(item => item.score?.confidence === 'LOW')) {
        warnings.push('At least one opportunity has LOW evidence confidence. Review the source references and score breakdown before producing the asset.');
      }

      const validationWarnings = buildReportWarningText({
        requestedPhotoCount: photoCount,
        requestedVideoCount: videoCount,
        photos,
        videos,
        sourceStatuses: status
      }).map(warning => warning.replace(/human discussion evidence/gi, 'collected market evidence'));

      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      const report: ResearchReport = {
        id: jobId,
        job_id: jobId,
        date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        duration: `${elapsed}s`,
        status: photos.length || videos.length ? 'COMPLETED' : 'INSUFFICIENT_EVIDENCE',
        sources_processed: sourceNames,
        source_status: status,
        evidence_summary: analystOutput.evidence_summary || webResearch.summary,
        warnings: [...new Set([...warnings, ...(analystOutput.warnings || []), ...validationWarnings])],
        photo_count_requested: photoCount,
        video_count_requested: videoCount,
        photos,
        videos,
        internal_score_explanation: scoreSummary.formula,
        score_summary: scoreSummary,
        portfolio_summary: portfolioSummary,
        browser_research: {
          pages: Number(agentResult?.pages) || evidenceSources.length,
          actions: Number(agentResult?.actions) || 0,
          screenshots: Number(agentResult?.screenshots) || 0,
          model: String(agentResult?.model || 'unknown'),
          turn_limit_reached: !!agentResult?.turnLimitReached
        },
        evidence_sources: evidenceSources,
        analysis_stats: {
          raw_evidence_count: built.pages.length,
          deduplicated_evidence_count: normalizedRecords.length,
          cluster_count: normalizedRecords.length,
          evidence_backed_candidate_count: photos.length + videos.length,
          rejected_candidate_count: Math.max(0, photoCount + videoCount - photos.length - videos.length)
        },
        web_research: webResearch
      };
      storage.saveReport(report);
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.status = 'COMPLETED';
        job.stage = 'COMPLETE';
        job.progress = 100;
        job.message = report.status === 'COMPLETED' ? 'Evidence-backed report is ready.' : 'Research completed; there was not enough evidence for a reliable opportunity set.';
        job.report = report;
      }
      storage.appendResearchEvent({
        id: crypto.randomUUID(), jobId, at: new Date().toISOString(), type: 'report_complete',
        message: 'Research report saved with score breakdown, portfolio snapshot and source evidence.',
        details: { status: report.status, photos: photos.length, videos: videos.length, scoreSummary, portfolioSummary }
      });
    } catch (error: any) {
      await browserBridge.hide().catch(() => undefined);
      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      const built = this.buildSourceEvidence(jobId);
      const failedReport: ResearchReport = {
        id: jobId,
        job_id: jobId,
        date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        duration: `${elapsed}s`,
        status: 'FAILED',
        sources_processed: built.sources.map(source => source.source_family || 'Public web'),
        source_status: { 'Gemini Computer Use': 'ERROR' },
        evidence_summary: 'The research agent did not complete the final report. Any browser observations and event logs collected before the error remain stored locally for review.',
        warnings: [...warnings, error?.message || String(error)],
        photo_count_requested: photoCount,
        video_count_requested: videoCount,
        photos: [],
        videos: [],
        evidence_sources: built.sources,
        browser_research: {
          pages: built.pages.length, actions: Number(agentResult?.actions) || 0,
          screenshots: Number(agentResult?.screenshots) || 0, model: String(agentResult?.model || 'unknown')
        },
        analysis_stats: {
          raw_evidence_count: built.sources.length, deduplicated_evidence_count: built.sources.length,
          cluster_count: built.sources.length, evidence_backed_candidate_count: 0, rejected_candidate_count: 0
        },
        web_research: webResearch
      };
      storage.saveReport(failedReport);
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.status = 'FAILED';
        job.stage = 'COMPLETE';
        job.progress = 100;
        job.message = 'Research ended with an error. Captured evidence was preserved.';
        job.error = error?.message || String(error);
        job.report = failedReport;
      }
    }
  }
}

export const researchCoordinator = new ResearchCoordinator();
