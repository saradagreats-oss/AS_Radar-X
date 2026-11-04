export type CollectorStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR' | 'BLOCKED' | 'EMPTY' | 'DISABLED';

export type DataSourceType = 'Browser Research' | 'AI Intelligence';

export interface RawEvidence {
  source: DataSourceType;
  url: string;
  collected_at: string;
  evidence_type: 'post' | 'comment' | 'message' | 'thread_message' | 'human_discussion' | 'search_observation' | 'trends';
  raw_title: string;
  raw_description?: string;
  raw_keywords: string[];
  metadata?: Record<string, any>;
}

export interface NormalizedEvidence {
  source: DataSourceType;
  url: string;
  collected_at: string;
  evidence_type: string;
  normalized_title: string;
  normalized_keywords: string[];
  category: string;
  commercial_intent: string;
  raw_id?: string;
}

export interface ConceptCluster {
  id: string;
  name: string;
  primary_keywords: string[];
  sources_observed: string[];
  evidence_count: number;
  evidence_samples: NormalizedEvidence[];
  recurrence_level: 'High' | 'Moderate' | 'Emerging';
  commercial_domains: string[];
  suggested_angles: string[];
  evergreen_assessment: 'Evergreen' | 'Cyclical' | 'Temporary';
}

export interface CommercialUseProfile {
  targetBuyers: string[];
  primaryUseCases: string[];
  editorialVsCommercial: 'Commercial Advertising & Brand' | 'Editorial & Industry Report' | 'Dual-Use';
  confidence: 'Observed' | 'Inferred';
}

export interface SupplyGapResult {
  sampleSize: number;
  sourceCount: number;
  titleSimilarity: number;
  keywordConcentration: number;
  saturationRisk: 'Low' | 'Moderate' | 'High' | 'Unknown';
  differentiationPotential: number;
  observations: string[];
  gapHypotheses: string[];
  recommendedAngle: string;
}

export interface LongevityProfile {
  shelfLifeRating: 'Evergreen (Multi-Year)' | 'Cyclical / Annual' | 'Short-Term';
  reasoning: string;
  trendDependence: 'Low (Fundamental Business Need)' | 'Moderate' | 'High';
}

export interface InternalScore {
  score: number;
  breakdown: {
    recurrenceWeight: number;
    evidenceDensity: number;
    commercialBreadth: number;
    supplyGapPotential: number;
    longevityFactor: number;
  };
  explanation: string;
}

export interface ClusterAnalysis {
  cluster: ConceptCluster;
  recurrence: {
    recurrenceScore: number;
    observedSourcesCount: number;
    evidenceObservations: string;
  };
  commercialUse: CommercialUseProfile;
  longevity: LongevityProfile;
  supply: SupplyGapResult;
  score: InternalScore;
}

export interface WebResearchSource {
  id: number;
  title: string;
  url: string;
}

export interface WebResearchResult {
  summary: string;
  findings: Array<{
    topic: string;
    observed_fact: string;
    commercial_signal: string;
    supply_or_differentiation_signal: string;
    inference: string;
  }>;
  sources: WebResearchSource[];
  search_queries: string[];
}

export interface ProductionSpec {
  subject?: string;
  setting?: string;
  action?: string;
  shot_type?: string;
  camera_height?: string;
  lens?: string;
  aperture?: string;
  shutter?: string;
  lighting?: string;
  color_palette?: string;
  depth_of_field?: string;
  composition?: string;
  copy_space?: string;
  aspect_ratio?: string;
  texture_detail?: string;
  realism_constraints?: string;
  negative_constraints?: string;
  motion_path?: string;
  frame_rate?: string;
  stabilization?: string;
  loop_strategy?: string;
}

export interface ScoreComponent {
  score: number;
  reason: string;
  evidence_ids: number[];
}

export interface OpportunityScore {
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: {
    recurring_demand: ScoreComponent;
    commercial_use: ScoreComponent;
    marketplace_evidence: ScoreComponent;
    supply_gap: ScoreComponent;
    longevity: ScoreComponent;
    production_feasibility: ScoreComponent;
  };
  formula: string;
}

export interface SourceEvidenceRecord {
  id: number;
  title: string;
  url: string;
  source_family?: string;
  observation?: string;
}

export interface PhotoOpportunity {
  id: string;
  title: string; // Unified SEO-optimized Title merging main subject and visual context
  prompt: string; // Top-level detailed prompt with texture, lighting, camera framing, visual style
  tags: string[]; // User-selected count; first 10 are the highest-impact relevant tags
  description?: string;
  concept?: string;
  why_selected?: string;
  market_evidence?: string;
  commercial_use?: string;
  visual_angle?: string;
  supply_gap?: string;
  longevity?: string;
  trend_dependence?: string;
  production_spec?: ProductionSpec;
  differentiation_strategy?: string;
  buyer_use_case?: string;
  risk_notes?: string;
  evidence?: Record<string, any>;
  score?: OpportunityScore;
}

export interface VideoOpportunity {
  id: string;
  title: string; // Unified SEO-optimized Title merging main subject and cinematic movement context
  prompt: string; // Top-level detailed motion prompt with texture, camera motion, frame rate, lighting
  tags: string[]; // User-selected count; first 10 are the highest-impact relevant tags
  description?: string;
  concept?: string;
  why_selected?: string;
  motion_value?: string;
  commercial_use?: string;
  motion_action?: string;
  duration?: string;
  loop_potential?: string;
  aspect_ratio?: string;
  supply_gap?: string;
  longevity?: string;
  production_spec?: ProductionSpec;
  differentiation_strategy?: string;
  buyer_use_case?: string;
  risk_notes?: string;
  evidence?: Record<string, any>;
  score?: OpportunityScore;
}

export interface ResearchReport {
  id: string;
  job_id: string;
  date: string;
  created_at: string;
  duration: string;
  status: 'COMPLETED' | 'INSUFFICIENT_EVIDENCE' | 'FAILED';
  sources_processed: string[];
  source_status: Record<string, CollectorStatus | { status: CollectorStatus; note?: string }>;
  evidence_summary: string;
  photo_count_requested: number;
  video_count_requested: number;
  photos: PhotoOpportunity[];
  videos: VideoOpportunity[];
  warnings?: string[];
  internal_score_explanation?: string;
  score_summary?: { average: number; highest: number; scored: number; formula: string };
  browser_research?: { pages: number; actions: number; screenshots: number; model: string; turn_limit_reached?: boolean };
  evidence_sources?: SourceEvidenceRecord[];
  analysis_stats?: {
    raw_evidence_count: number;
    deduplicated_evidence_count: number;
    cluster_count: number;
    evidence_backed_candidate_count: number;
    rejected_candidate_count: number;
  };
  web_research?: WebResearchResult;
}

export interface HistoryRecord {
  job_id: string;
  date: string;
  photo_count: number;
  video_count: number;
  status: string;
  duration?: string;
  major_topics?: string[];
  source_status?: Record<string, any>;
}

export type ResearchStage =
  | 'INITIALIZING'
  | 'PLANNING'
  | 'BROWSER_RESEARCH'
  | 'PAUSED_FOR_USER'
  | 'FINAL_ANALYSIS'
  | 'COLLECTING'
  | 'NORMALIZING'
  | 'DEDUPLICATING'
  | 'CLUSTERING'
  | 'DEMAND_ANALYSIS'
  | 'SUPPLY_GAP'
  | 'COMMERCIAL_USE'
  | 'LONGEVITY'
  | 'SCORING'
  | 'PREPARING_PHOTOS'
  | 'PREPARING_VIDEOS'
  | 'COMPLETE';

export interface ResearchJobState {
  jobId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  stage: ResearchStage;
  progress: number;
  message: string;
  startedAt: number;
  error?: string;
  report?: ResearchReport;
}
