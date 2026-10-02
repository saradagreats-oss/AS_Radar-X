import { GoogleGenAI, Type } from '@google/genai';
import { storage } from '../storage/database.js';
import type {
  ClusterAnalysis,
  ConceptCluster,
  PhotoOpportunity,
  RawEvidence,
  ResearchReport,
  VideoOpportunity,
  WebResearchResult,
  WebResearchSource
} from '../types.js';
import { evaluateRiskAndRejections } from '../analysis/riskFilter.js';
import { checkHistoryProtection } from '../analysis/historyProtection.js';
import { calculateJaccardSimilarity } from '../normalization/dedupe.js';
import { extractTokens } from '../normalization/textNormalizer.js';

interface AnalystInput {
  clusters: ConceptCluster[];
  clusterAnalyses: ClusterAnalysis[];
  rawEvidence: RawEvidence[];
  sourceStatuses: Record<string, string>;
  requestedPhotoCount: number;
  requestedVideoCount: number;
  userCustomInstructions?: string;
  rejectedContentList?: string[];
  pastOpportunitiesHistory?: Array<{ title: string; concept: string }>;
  webResearch?: WebResearchResult;
  isPlatformDataEnabled?: boolean;
}

interface GroundedResearchInput {
  clusters: ConceptCluster[];
  rawEvidence: RawEvidence[];
  sourceStatuses: Record<string, string>;
  requestedPhotoCount: number;
  requestedVideoCount: number;
  userCustomInstructions?: string;
  rejectedContentList?: string[];
  researchTopics?: string[];
  isPlatformDataEnabled?: boolean;
}

interface GeminiWebResearchOutput {
  summary: string;
  findings: Array<{
    topic: string;
    observed_fact: string;
    commercial_signal: string;
    supply_or_differentiation_signal: string;
    inference: string;
  }>;
}

interface GeminiAnalystOutput {
  evidence_summary: string;
  warnings?: string[];
  photos: PhotoOpportunity[];
  videos: VideoOpportunity[];
}

function getClient() {
  const apiKey = storage.getCustomApiKey() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Set your Gemini API key in Settings.');
  }
  return new GoogleGenAI({ apiKey });
}

function candidateModels(): string[] {
  const custom = storage.getCustomModel()?.trim();
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([
    'gemini-3.1-flash-lite',
    custom,
    preferred,
    'gemini-3.7-flash'
  ].filter(Boolean))] as string[];
}

function sourceStatusText(sourceStatuses: Record<string, string>): string {
  return Object.entries(sourceStatuses).map(([source, status]) => `${source}: ${status}`).join('\n');
}

function extractGroundedSources(response: any): WebResearchSource[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: WebResearchSource[] = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    const url = web?.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      id: sources.length + 1,
      title: String(web?.title || url),
      url: String(url)
    });
  }
  return sources;
}

export async function runGeminiWebResearch(input: GroundedResearchInput): Promise<WebResearchResult> {
  const ai = getClient();
  const sourceHints = [
    'site:reddit.com/r/StockPhotography',
    'site:reddit.com/r/AdobeStock',
    'site:reddit.com/r/graphic_design',
    'site:reddit.com/r/VideoEditing',
    'site:reddit.com/r/editors'
  ];
  const concepts = input.clusters.slice(0, 10).map((cluster) => ({
    name: cluster.name,
    keywords: cluster.primary_keywords,
    sources: cluster.sources_observed,
    evidence_count: cluster.evidence_count,
    recurrence: cluster.recurrence_level
  }));

  const prompt = `Perform market intelligence web research for AS-Radar-X stock content intelligence.

Focus on detecting authentic creator demand, recurring complaints, and missing asset searches across creator forums and communities.

PRIMARY COMMUNITY CONTEXT:
${sourceHints.join('\n')}

SOURCE STATUS:
${sourceStatusText(input.sourceStatuses)}

CURRENT DISCUSSION CLUSTERS:
${JSON.stringify(concepts, null, 2)}

RESEARCH TARGET TOPICS:
${JSON.stringify(input.researchTopics || [], null, 2)}

DIRECT EVIDENCE SAMPLE:
${JSON.stringify(input.rawEvidence.slice(0, 60), null, 2)}

RESEARCH RULES:
1. Search for repeated needs, complaints ("cannot find good b-roll for X"), and requests from creators, video editors, and designers.
2. Search for stock content gaps where existing stock libraries are considered fake, outdated, or oversaturated.
3. Distinguish observed creator statements from your strategic inference.
4. Do not invent sales, downloads, or fake percentage figures.
5. Identify recurring commercial use cases that need new, authentic stock photos and video footage.
6. Return a compact research summary with findings.

USER INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

USER REJECTIONS:
${(input.rejectedContentList || []).join('\n') || 'None'}
`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      findings: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            observed_fact: { type: Type.STRING },
            commercial_signal: { type: Type.STRING },
            supply_or_differentiation_signal: { type: Type.STRING },
            inference: { type: Type.STRING }
          },
          required: ['topic', 'observed_fact', 'commercial_signal', 'supply_or_differentiation_signal', 'inference']
        }
      }
    },
    required: ['summary', 'findings']
  };

  let lastError: any = null;
  for (const model of candidateModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema,
          systemInstruction: 'You are the market research analyst for AS-Radar-X. Search the public web for real creator discussions, complaints, asset requests, and commercial stock content gaps. Do not fabricate statistics.'
        }
      });
      const parsed = JSON.parse(response.text || '{}') as GeminiWebResearchOutput;
      return {
        summary: parsed.summary || 'Web research completed.',
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 12) : [],
        sources: extractGroundedSources(response),
        search_queries: response?.candidates?.[0]?.groundingMetadata?.webSearchQueries || []
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Grounded web research failed.');
}

function evidenceReferencePrompt(webResearch?: WebResearchResult): string {
  if (!webResearch) return 'No secondary web research was available.';
  const sources = webResearch.sources.length
    ? webResearch.sources.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join('\n')
    : 'No grounded web source metadata returned.';
  return `SECONDARY WEB RESEARCH MEMO:\n${webResearch.summary}\n\nFINDINGS:\n${JSON.stringify(webResearch.findings, null, 2)}\n\nGROUNDED SOURCES:\n${sources}`;
}

function buildProductionSpecRules(media: 'photo' | 'video') {
  return media === 'photo'
    ? `For every PHOTO produce a detailed production_spec with:
- subject
- setting
- action
- shot_type
- camera_height
- lens
- aperture
- shutter
- lighting
- color_palette
- depth_of_field
- composition
- copy_space
- aspect_ratio
- texture_detail
- realism_constraints
- negative_constraints
Then write the final prompt as a coherent, production-ready prompt derived from those fields. Avoid generic "8k photorealistic" cliché filler.`
    : `For every VIDEO produce a detailed production_spec with:
- subject
- setting
- action
- shot_type
- camera_height
- lens
- aperture
- shutter
- lighting
- color_palette
- composition
- copy_space
- aspect_ratio
- motion_path
- frame_rate
- stabilization
- loop_strategy
- texture_detail
- realism_constraints
- negative_constraints
Then write the final video prompt as a coherent, production-ready motion prompt derived from those fields.`;
}

export async function runGeminiStrategicAnalyst(input: AnalystInput): Promise<GeminiAnalystOutput> {
  const ai = getClient();
  const webMemo = evidenceReferencePrompt(input.webResearch);

  const evidencePayload = {
    is_platform_data_enabled: input.isPlatformDataEnabled ?? true,
    source_statuses: input.sourceStatuses,
    deterministic_analysis: input.clusterAnalyses.map((a) => ({
      cluster: {
        id: a.cluster.id,
        name: a.cluster.name,
        keywords: a.cluster.primary_keywords,
        sources: a.cluster.sources_observed,
        evidence_count: a.cluster.evidence_count,
        recurrence_level: a.cluster.recurrence_level,
        evergreen_assessment: a.cluster.evergreen_assessment
      },
      recurrence: a.recurrence,
      supply: a.supply,
      commercial_use: a.commercialUse,
      longevity: a.longevity,
      score: a.score
    })),
    raw_evidence_count: input.rawEvidence.length,
    human_discussion_evidence_sample: input.rawEvidence.slice(0, 80).map((e) => ({
      source: e.source,
      url: e.url,
      evidence_type: e.evidence_type,
      title: e.raw_title,
      description: e.raw_description?.slice(0, 200),
      keywords: e.raw_keywords,
      metadata: e.metadata
    }))
  };

  const systemInstruction = `You are AS-Radar-X Lead Stock Content Market Intelligence Analyst + Commercial Creative Director.
Your mission is to turn real human discussions (Reddit discussions, creator complaints, Discord channel messages, asset requests, and commercial demand signals) into high-value stock photo and video opportunities.

CORE INTELLIGENCE WORKFLOW:
1. DETECT HUMAN DEMAND & COMPLAINTS:
   Analyze the conversations for repeated needs, creators struggling to find specific visuals ("can't find realistic b-roll of X"), complaints about cliché or outdated stock photos, and genuine commercial bottlenecks.
2. SYNTHESIZE OPPORTUNITIES:
   Combine:
   - Human Demand (what real people and creators are asking for or complaining about)
   - Recurrence (signals appearing repeatedly across discussions)
   - Commercial Use (how B2B brands, marketing agencies, editors, healthcare, tech companies would actually license this)
   - Existing Supply / Saturation (avoiding generic stock tropes like fake corporate handshakes or plastic smiles)
   - Differentiation Gap (how a creator can produce this with authentic lighting, realistic staging, and fresh angles)
   - Longevity (multi-year evergreen commercial utility vs temporary fad)
3. HARD PRODUCTION SPECIFICATIONS:
   For every opportunity, produce complete photographic/cinematographic production specifications that a creator or AI generator can execute immediately.
4. RIGOROUS STANDARDS:
   - Never invent fake download or sales counts.
   - Strictly honor the user's rejection list.
   - For video, ensure the motion has genuine editorial/commercial purpose.
   - If Platform Data is disabled, draw upon Gemini commercial intelligence, past opportunity history, and user instructions.

${buildProductionSpecRules('photo')}
${buildProductionSpecRules('video')}

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

USER REJECTION LIST:
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

PAST OPPORTUNITY HISTORY (Do NOT duplicate previous titles or concepts):
${(input.pastOpportunitiesHistory || []).slice(0, 30).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'None'}

${webMemo}

FINAL COUNTS:
Maximum photos: ${input.requestedPhotoCount}
Maximum videos: ${input.requestedVideoCount}
`;

  const prompt = `Synthesize the final AS-Radar-X stock content opportunity report based on this human discussion and market evidence package:

${JSON.stringify(evidencePayload, null, 2)}

Return strictly JSON matching the response schema.`;

  const evidenceSchema = {
    type: Type.OBJECT,
    properties: {
      source: { type: Type.STRING },
      url: { type: Type.STRING },
      observation: { type: Type.STRING },
      inference: { type: Type.STRING },
      source_ref_ids: { type: Type.ARRAY, items: { type: Type.INTEGER } }
    },
    required: ['source', 'url', 'observation', 'inference']
  };

  const productionSpecSchema = {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING },
      setting: { type: Type.STRING },
      action: { type: Type.STRING },
      shot_type: { type: Type.STRING },
      camera_height: { type: Type.STRING },
      lens: { type: Type.STRING },
      aperture: { type: Type.STRING },
      shutter: { type: Type.STRING },
      lighting: { type: Type.STRING },
      color_palette: { type: Type.STRING },
      depth_of_field: { type: Type.STRING },
      composition: { type: Type.STRING },
      copy_space: { type: Type.STRING },
      aspect_ratio: { type: Type.STRING },
      texture_detail: { type: Type.STRING },
      realism_constraints: { type: Type.STRING },
      negative_constraints: { type: Type.STRING },
      motion_path: { type: Type.STRING },
      frame_rate: { type: Type.STRING },
      stabilization: { type: Type.STRING },
      loop_strategy: { type: Type.STRING }
    }
  };

  const photoOpportunitySchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: { type: Type.STRING },
      concept: { type: Type.STRING },
      description: { type: Type.STRING },
      why_selected: { type: Type.STRING },
      market_evidence: { type: Type.STRING },
      commercial_use: { type: Type.STRING },
      visual_angle: { type: Type.STRING },
      supply_gap: { type: Type.STRING },
      longevity: { type: Type.STRING },
      trend_dependence: { type: Type.STRING },
      prompt: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      production_spec: productionSpecSchema,
      differentiation_strategy: { type: Type.STRING },
      buyer_use_case: { type: Type.STRING },
      risk_notes: { type: Type.STRING },
      evidence: evidenceSchema
    },
    required: [
      'id',
      'title',
      'concept',
      'description',
      'why_selected',
      'market_evidence',
      'commercial_use',
      'visual_angle',
      'supply_gap',
      'longevity',
      'trend_dependence',
      'prompt',
      'tags',
      'evidence'
    ]
  };

  const videoOpportunitySchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: { type: Type.STRING },
      concept: { type: Type.STRING },
      description: { type: Type.STRING },
      why_selected: { type: Type.STRING },
      motion_value: { type: Type.STRING },
      commercial_use: { type: Type.STRING },
      motion_action: { type: Type.STRING },
      duration: { type: Type.STRING },
      loop_potential: { type: Type.STRING },
      aspect_ratio: { type: Type.STRING },
      supply_gap: { type: Type.STRING },
      longevity: { type: Type.STRING },
      prompt: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      production_spec: productionSpecSchema,
      differentiation_strategy: { type: Type.STRING },
      buyer_use_case: { type: Type.STRING },
      risk_notes: { type: Type.STRING },
      evidence: evidenceSchema
    },
    required: [
      'id',
      'title',
      'concept',
      'description',
      'why_selected',
      'motion_value',
      'commercial_use',
      'motion_action',
      'duration',
      'loop_potential',
      'aspect_ratio',
      'supply_gap',
      'longevity',
      'prompt',
      'tags',
      'evidence'
    ]
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      evidence_summary: { type: Type.STRING },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
      photos: { type: Type.ARRAY, items: photoOpportunitySchema },
      videos: { type: Type.ARRAY, items: videoOpportunitySchema }
    },
    required: ['evidence_summary', 'photos', 'videos']
  };

  let lastError: any = null;
  for (const model of candidateModels()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            systemInstruction,
            temperature: 0.3
          }
        });

        const parsed = JSON.parse(response.text || '{}') as GeminiAnalystOutput;
        return {
          evidence_summary: parsed.evidence_summary || 'Analysis completed.',
          warnings: parsed.warnings || [],
          photos: (parsed.photos || []).slice(0, input.requestedPhotoCount),
          videos: (parsed.videos || []).slice(0, input.requestedVideoCount)
        };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if ((msg.includes('503') || msg.includes('high demand') || msg.includes('429')) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2500));
        } else {
          break;
        }
      }
    }
  }

  throw lastError || new Error('Gemini strategic analyst generation failed.');
}

export function buildReportWarningText(input: {
  requestedPhotoCount: number;
  requestedVideoCount: number;
  photos: PhotoOpportunity[];
  videos: VideoOpportunity[];
  sourceStatuses: Record<string, any>;
}): string[] {
  const warnings: string[] = [];
  if (input.photos.length < input.requestedPhotoCount) {
    warnings.push(
      `Returned ${input.photos.length} photo opportunities (requested ${input.requestedPhotoCount}) to adhere strictly to human discussion evidence standards.`
    );
  }
  if (input.videos.length < input.requestedVideoCount) {
    warnings.push(
      `Returned ${input.videos.length} video opportunities (requested ${input.requestedVideoCount}) to adhere strictly to human discussion evidence standards.`
    );
  }
  return warnings;
}
