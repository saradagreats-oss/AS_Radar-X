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
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey });
}

function candidateModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([
    preferred,
    storage.getCustomModel(),
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview'
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
    'site:shutterstock.com',
    'site:stock.adobe.com',
    'site:pond5.com',
    'site:helpx.adobe.com',
    'site:blog.pond5.com'
  ];
  const concepts = input.clusters.slice(0, 10).map((cluster) => ({
    name: cluster.name,
    keywords: cluster.primary_keywords,
    sources: cluster.sources_observed,
    evidence_count: cluster.evidence_count,
    recurrence: cluster.recurrence_level
  }));

  const prompt = `Perform a second research pass for AS-Radar-X using Google Search grounding.

The direct marketplace collectors may be blocked or incomplete. Your job is NOT to invent replacements. Instead, use current public web evidence to enrich the research and to discover missing context.

PRIMARY SOURCE PREFERENCE:
${sourceHints.join('\n')}

SOURCE STATUS FROM DIRECT COLLECTORS:
${sourceStatusText(input.sourceStatuses)}

CURRENT CLUSTERS:
${JSON.stringify(concepts, null, 2)}

RESEARCH TARGET TOPICS:
${JSON.stringify(input.researchTopics || [], null, 2)}

DIRECT EVIDENCE SAMPLE:
${JSON.stringify(input.rawEvidence.slice(0, 80), null, 2)}

RESEARCH RULES:
1. Search for durable commercial need, not just viral trends.
2. Prefer primary sources, stock-contributor guidance, current marketplace pages, industry associations, and reputable commercial/industry research.
   When direct stock pages are blocked, still research the target topics using reputable public web sources; do not stop the analysis merely because one marketplace refused automated access.
3. Distinguish observed fact from your inference.
4. Search for saturation/differentiation clues where public evidence exists; do not claim complete marketplace inventory.
5. Do not invent sales, downloads, demand percentages, or supply counts.
6. Look for recurring business use cases that could support stock content over time.
7. Identify where the direct stock sites are unavailable and use other public sources only as secondary context.
8. Return a compact evidence research memo, not the final stock concepts.

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
          systemInstruction: 'You are the research librarian for AS-Radar-X. Search the public web for current, traceable evidence and cite only what you can ground. Do not fabricate marketplace statistics.'
        }
      });
      const parsed = JSON.parse(response.text || '{}') as GeminiWebResearchOutput;
      return {
        summary: parsed.summary || 'No additional grounded web research was returned.',
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
  return `SECONDARY WEB RESEARCH MEMO:\n${webResearch.summary}\n\nFINDINGS:\n${JSON.stringify(webResearch.findings, null, 2)}\n\nGROUNDED WEB SOURCES:\n${sources}`;
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
Then write the final prompt as a coherent, production-ready prompt derived from those fields. Do not use a generic "8k photorealistic" filler line by itself.`
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
Then write the final video prompt as a coherent, production-ready prompt derived from those fields.`;
}

export async function runGeminiStrategicAnalyst(input: AnalystInput): Promise<GeminiAnalystOutput> {
  const ai = getClient();
  const webMemo = evidenceReferencePrompt(input.webResearch);

  const evidencePayload = {
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
    evidence_samples: input.rawEvidence.slice(0, 100).map((e) => ({
      source: e.source,
      url: e.url,
      evidence_type: e.evidence_type,
      title: e.raw_title,
      keywords: e.raw_keywords,
      collected_at: e.collected_at
    }))
  };

  const systemInstruction = `You are AS-Radar-X Strategic Stock Market Analyst + Creative Director.
You are NOT a trend paraphraser. You are expected to synthesize multiple layers of evidence and make a human-quality commercial judgment.

ABSOLUTE RULES:
1. NEVER invent sales, downloads, search volume, market share, demand percentages, or total marketplace inventory counts.
2. Treat direct marketplace evidence, grounded web evidence, and strategic inference as three different layers.
3. Every opportunity must explain what evidence supports it and what is inference.
4. Do NOT turn a generic trend into a stock idea. Demand is only useful when paired with supply/saturation and a meaningful differentiation angle.
5. Reject saturated, generic, copy-like ideas. A concept that is already heavily represented must earn its way back in through a specific underserved use case or materially different visual angle.
6. A gap is a hypothesis unless supported by observed evidence. Use phrases such as "observed sample suggests" or "research indicates" when certainty is limited.
7. If there is not enough evidence to support all requested items, return FEWER items. Never manufacture the remainder.
8. Every opportunity must reference at least one source from the provided direct evidence or grounded web research.
9. Never repeat a previous opportunity's concept/angle just by changing the wording.
10. Respect the user's rejection list strictly.
11. For video, motion must have real commercial value and should not be a photo with a zoom effect.

RESEARCH → ANALYSIS → CREATION:
First assess the evidence. Then choose the strongest opportunity candidates. Then create original visual concepts. Do not create concepts first and retrofit the evidence later.

${buildProductionSpecRules('photo')}
${buildProductionSpecRules('video')}

PROMPT QUALITY:
Prompts must include concrete visual decisions such as subject action, environment, camera position, focal length, aperture, lighting direction/quality, depth of field, texture/material detail, framing/copy space, color treatment, and negative constraints where helpful. Vague phrases like "professional, high quality, 8k" are not enough.

TAGS:
Provide 15–25 commercially useful tags. Avoid spam and near-duplicate keyword stuffing.

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

USER REJECTION LIST:
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

HISTORY:
${(input.pastOpportunitiesHistory || []).slice(0, 30).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'None'}

${webMemo}

FINAL COUNTS:
Maximum photos: ${input.requestedPhotoCount}
Maximum videos: ${input.requestedVideoCount}
`;

  const prompt = `Build the final AS-Radar-X daily stock opportunity report from this evidence package.

${JSON.stringify(evidencePayload, null, 2)}

Return only JSON matching the schema.`;

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
      subject: { type: Type.STRING }, setting: { type: Type.STRING }, action: { type: Type.STRING },
      shot_type: { type: Type.STRING }, camera_height: { type: Type.STRING }, lens: { type: Type.STRING },
      aperture: { type: Type.STRING }, shutter: { type: Type.STRING }, lighting: { type: Type.STRING },
      color_palette: { type: Type.STRING }, depth_of_field: { type: Type.STRING }, composition: { type: Type.STRING },
      copy_space: { type: Type.STRING }, aspect_ratio: { type: Type.STRING }, texture_detail: { type: Type.STRING },
      realism_constraints: { type: Type.STRING }, negative_constraints: { type: Type.STRING },
      motion_path: { type: Type.STRING }, frame_rate: { type: Type.STRING }, stabilization: { type: Type.STRING },
      loop_strategy: { type: Type.STRING }
    }
  };

  const photoSchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING }, title: { type: Type.STRING }, concept: { type: Type.STRING }, description: { type: Type.STRING },
      why_selected: { type: Type.STRING }, market_evidence: { type: Type.STRING }, commercial_use: { type: Type.STRING },
      visual_angle: { type: Type.STRING }, supply_gap: { type: Type.STRING }, longevity: { type: Type.STRING }, trend_dependence: { type: Type.STRING },
      prompt: { type: Type.STRING }, tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      production_spec: productionSpecSchema, differentiation_strategy: { type: Type.STRING }, buyer_use_case: { type: Type.STRING }, risk_notes: { type: Type.STRING },
      evidence: evidenceSchema
    },
    required: ['id', 'title', 'concept', 'description', 'why_selected', 'market_evidence', 'commercial_use', 'visual_angle', 'supply_gap', 'longevity', 'trend_dependence', 'prompt', 'tags', 'evidence']
  };

  const videoSchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING }, title: { type: Type.STRING }, concept: { type: Type.STRING }, description: { type: Type.STRING },
      why_selected: { type: Type.STRING }, motion_value: { type: Type.STRING }, commercial_use: { type: Type.STRING }, motion_action: { type: Type.STRING },
      duration: { type: Type.STRING }, loop_potential: { type: Type.STRING }, aspect_ratio: { type: Type.STRING }, supply_gap: { type: Type.STRING }, longevity: { type: Type.STRING },
      prompt: { type: Type.STRING }, tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      production_spec: productionSpecSchema, differentiation_strategy: { type: Type.STRING }, buyer_use_case: { type: Type.STRING }, risk_notes: { type: Type.STRING },
      evidence: evidenceSchema
    },
    required: ['id', 'title', 'concept', 'description', 'why_selected', 'motion_value', 'commercial_use', 'motion_action', 'duration', 'loop_potential', 'aspect_ratio', 'supply_gap', 'longevity', 'prompt', 'tags', 'evidence']
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      evidence_summary: { type: Type.STRING },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
      photos: { type: Type.ARRAY, items: photoSchema },
      videos: { type: Type.ARRAY, items: videoSchema }
    },
    required: ['evidence_summary', 'photos', 'videos']
  };

  let lastError: any = null;
  let responseText = '';
  for (const model of candidateModels()) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.35
          }
        });
        responseText = response.text?.trim() || '';
        if (responseText) break;
      } catch (err: any) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (responseText) break;
  }

  if (!responseText) throw lastError || new Error('Gemini creative analysis returned an empty response.');

  let parsed: GeminiAnalystOutput;
  try {
    parsed = JSON.parse(responseText) as GeminiAnalystOutput;
  } catch (err: any) {
    throw new Error(`Gemini returned invalid JSON: ${err.message}`);
  }

  parsed.photos = Array.isArray(parsed.photos) ? parsed.photos.slice(0, input.requestedPhotoCount) : [];
  parsed.videos = Array.isArray(parsed.videos) ? parsed.videos.slice(0, input.requestedVideoCount) : [];

  const allowedUrls = new Set([
    ...input.rawEvidence.map((e) => e.url),
    ...(input.webResearch?.sources || []).map((s) => s.url)
  ]);
  const allowedSourceIds = new Set((input.webResearch?.sources || []).map((s) => s.id));

  const validateAndFilter = <T extends PhotoOpportunity | VideoOpportunity>(items: T[]): T[] => {
    const result: T[] = [];
    const seenConcepts: string[][] = [];
    for (const item of items) {
      const evidenceUrl = item.evidence?.url ? String(item.evidence.url) : '';
      const refs = Array.isArray(item.evidence?.source_ref_ids) ? item.evidence.source_ref_ids.map(Number) : [];
      if (evidenceUrl && !allowedUrls.has(evidenceUrl)) continue;
      if (!evidenceUrl && !refs.some((id) => allowedSourceIds.has(id))) continue;

      const risk = evaluateRiskAndRejections(`${item.title} ${item.concept} ${item.description} ${item.prompt}`, input.rejectedContentList || []);
      if (risk.rejected) continue;

      const historyCheck = checkHistoryProtection(item.title, item.concept, input.pastOpportunitiesHistory || []);
      if (historyCheck.isRepetitive) continue;

      const tokens = extractTokens(`${item.title} ${item.concept}`);
      if (seenConcepts.some((previous) => calculateJaccardSimilarity(previous, tokens) >= 0.7)) continue;
      seenConcepts.push(tokens);

      item.tags = Array.from(new Set((item.tags || []).map((t) => String(t).trim()).filter(Boolean))).slice(0, 25);
      result.push(item);
    }
    return result;
  };

  parsed.photos = validateAndFilter(parsed.photos);
  parsed.videos = validateAndFilter(parsed.videos);

  return parsed;
}

export function buildReportWarningText(input: {
  requestedPhotoCount: number;
  requestedVideoCount: number;
  photos: PhotoOpportunity[];
  videos: VideoOpportunity[];
  sourceStatuses: Record<string, string>;
}): string[] {
  const warnings: string[] = [];
  if (input.photos.length < input.requestedPhotoCount) {
    warnings.push(`Only ${input.photos.length} evidence-backed photo opportunities passed validation; ${input.requestedPhotoCount} were requested.`);
  }
  if (input.videos.length < input.requestedVideoCount) {
    warnings.push(`Only ${input.videos.length} evidence-backed video opportunities passed validation; ${input.requestedVideoCount} were requested.`);
  }
  for (const [source, status] of Object.entries(input.sourceStatuses)) {
    if (status !== 'AVAILABLE') warnings.push(`${source}: ${status}.`);
  }
  return warnings;
}
