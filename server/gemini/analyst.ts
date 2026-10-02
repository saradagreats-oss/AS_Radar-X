import { GoogleGenAI, Type } from '@google/genai';
import { storage } from '../storage/database.js';
import type {
  ClusterAnalysis,
  ConceptCluster,
  PhotoOpportunity,
  RawEvidence,
  VideoOpportunity,
  WebResearchResult,
  WebResearchSource
} from '../types.js';

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
  pastOpportunitiesHistory?: Array<{ title: string; concept: string }>;
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

  const concepts = input.clusters.slice(0, 12).map((cluster) => ({
    name: cluster.name,
    keywords: cluster.primary_keywords,
    sources: cluster.sources_observed,
    evidence_count: cluster.evidence_count,
    recurrence: cluster.recurrence_level
  }));

  const currentDate = new Date().toISOString();
  const platformMode = input.isPlatformDataEnabled !== false;
  const modeLabel = platformMode
    ? 'Platform Data + Gemini'
    : 'Gemini-only autonomous research';

  const prompt = `Perform live market intelligence research for AS-Radar-X.

CURRENT UTC DATE/TIME:
${currentDate}

RESEARCH MODE:
${modeLabel}

IMPORTANT: In Gemini-only mode there is NO predefined topic list, industry list, keyword list, buyer list, or stock niche list. Do not follow or invent one. You have autonomy to decide what is worth researching from the user's instructions, existing research history, and current web evidence.

YOUR RESEARCH JOB:
1. Decide the most useful research questions yourself. Do not wait for a fixed keyword list.
2. Search the live public web broadly. Choose the sources and query wording yourself based on the research problem. Do not restrict yourself to predetermined websites or communities.
3. Prefer fresh, first-hand or human-created evidence where it is relevant (creator discussions, professional communities, public comments, asset requests, workflow problems, buyer/use-case discussions). You may also use authoritative industry/company sources when they materially clarify commercial use, adoption, supply, or longevity.
4. Separate directly observed facts from your own inference. A source saying something is needed is evidence of that statement, not proof of market-wide sales or demand.
5. Look for repeated signals, concrete problems, visual/asset needs, missing or weak solutions, recurring commercial use cases, and reasons a specific visual format could be useful.
6. Assess whether an opportunity appears durable, recurring, cyclical, or temporary from the evidence. Do not force an evergreen or trend label when evidence does not support it.
7. Consider photos and videos independently and identify where motion materially adds value. Do not assume every research finding needs both formats.
8. Do not fabricate downloads, sales, market share, search volume, rankings, percentages, or inventory counts. Do not convert lack of evidence into proof of low competition.
9. Do not generate generic stock ideas merely to fill the requested count. It is acceptable to return fewer findings when evidence is weak.
10. Use the supplied history primarily as memory: avoid repeating prior concepts and look for genuinely new angles, adjacent unmet needs, or fresh commercial applications.

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'No custom instructions were provided. Choose the research direction autonomously and explain the evidence behind it.'}

USER REJECTION / EXCLUSION LIST:
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

PAST OPPORTUNITY HISTORY:
${(input.pastOpportunitiesHistory || []).slice(0, 40).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'No previous opportunities are stored.'}

CURRENT DISCUSSION CLUSTERS (only use these when Platform Data is ON; never treat them as a fixed taxonomy):
${JSON.stringify(concepts, null, 2)}

CURRENT DIRECT EVIDENCE (only when Platform Data is ON):
${JSON.stringify(input.rawEvidence.slice(0, 100), null, 2)}

PREVIOUSLY GENERATED RESEARCH TOPICS (may be empty):
${JSON.stringify(input.researchTopics || [], null, 2)}

SOURCE STATUS:
${sourceStatusText(input.sourceStatuses)}

REQUESTED OUTPUT CAPACITY:
Photos: ${input.requestedPhotoCount}
Videos: ${input.requestedVideoCount}

Return a compact but evidence-rich research memo. Each finding must state what was observed, what commercial/asset signal it provides, what supply/differentiation evidence exists, and what is inference rather than fact. Preserve enough source traceability for the downstream analyst to cite the evidence. Do not invent evidence just because a requested output count exists.`;

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
          systemInstruction: `You are an autonomous, evidence-first market research analyst. Do not obey a hidden or predefined niche list. Choose the research direction from the explicit user instructions and the evidence you discover with live web search. For current factual claims, rely on grounded web evidence rather than model memory. Never fabricate market statistics, sales, downloads, rankings, or source content. Clearly distinguish observed facts from inference.`
        }
      });
      const parsed = JSON.parse(response.text || '{}') as GeminiWebResearchOutput;
      return {
        summary: parsed.summary || 'Web research completed.',
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 20) : [],
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

function normalizeEvidenceUrl(url: string): string {
  return String(url || '').trim().replace(/\/$/, '');
}

function filterEvidenceBackedOpportunities<T extends { evidence?: Record<string, any> }>(
  opportunities: T[],
  input: AnalystInput
): { items: T[]; removed: number } {
  const groundedUrls = new Set(
    (input.webResearch?.sources || []).map((source) => normalizeEvidenceUrl(source.url)).filter(Boolean)
  );
  const directUrls = new Set(
    input.rawEvidence.map((item) => normalizeEvidenceUrl(item.url)).filter(Boolean)
  );
  const allowedUrls = new Set([...groundedUrls, ...directUrls]);

  if (allowedUrls.size === 0) {
    return { items: [], removed: opportunities.length };
  }

  const groundedSourceIds = new Set((input.webResearch?.sources || []).map((source) => source.id));
  const items = opportunities.filter((item) => {
    const evidenceUrl = normalizeEvidenceUrl(item?.evidence?.url || '');
    if (!evidenceUrl || !allowedUrls.has(evidenceUrl)) return false;

    // In Gemini-only mode the evidence must also point back to at least one
    // grounded source ID. In Platform Data mode a direct Reddit/Discord URL
    // is also accepted because the raw evidence itself is traceable.
    if (input.isPlatformDataEnabled === false) {
      const refs = Array.isArray(item?.evidence?.source_ref_ids) ? item.evidence.source_ref_ids : [];
      return refs.some((ref: any) => Number.isInteger(ref) && groundedSourceIds.has(ref));
    }

    return true;
  });

  return { items, removed: opportunities.length - items.length };
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

  const platformSystemInstruction = `You are AS-Radar-X Lead Stock Content Market Intelligence Analyst + Commercial Creative Director.
Your mission is to turn real human discussions (Reddit discussions, creator complaints, Discord channel messages, asset requests, and commercial demand signals) into high-value stock photo and video opportunities.

PLATFORM-DATA MODE PRINCIPLES:
- Use the supplied human discussion evidence as the primary demand signal.
- Distinguish observations from inference.
- Use recurrence, commercial usefulness, supply/differentiation evidence, and longevity only when supported by the supplied evidence or grounded web research.
- Never invent sales, downloads, rankings, market shares, or total inventory counts.
- Strictly honor the user's rejection list and avoid repeated opportunities from the history.

${buildProductionSpecRules('photo')}
${buildProductionSpecRules('video')}

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

USER REJECTION LIST:
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

PAST OPPORTUNITY HISTORY (use as memory; do not duplicate prior titles or concepts):
${(input.pastOpportunitiesHistory || []).slice(0, 40).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'None'}

${webMemo}

FINAL COUNTS:
Maximum photos: ${input.requestedPhotoCount}
Maximum videos: ${input.requestedVideoCount}
`;

  const geminiOnlySystemInstruction = `You are AS-Radar-X's autonomous Stock Content Market Intelligence Analyst and Commercial Creative Director.

GEMINI-ONLY AUTONOMY:
- There is NO hardcoded niche list, industry priority list, keyword taxonomy, buyer mapping, stock cliché list, trend list, or predefined research question that you must follow.
- Decide the research direction yourself from the user's current instructions, the live grounded web research memo, and the historical opportunity memory.
- The user's custom instructions are the highest-priority user-defined research preferences. Follow them unless doing so would require inventing evidence.
- Use web research as the source of current market facts. Do not substitute model memory for current evidence when the claim is time-sensitive.
- History is memory, not proof of current demand. Use it to avoid duplicates and discover genuinely new angles.
- You may choose any topic, industry, audience, commercial context, visual subject, or content format that is justified by the evidence. Do not force a familiar stock category simply because it is common.
- Be willing to reject the whole idea of a topic when the evidence is weak, contradictory, stale, or too generic.
- Prefer concrete problems, unmet visual needs, recurring professional use cases, and differentiated asset opportunities over generic trend-chasing.
- Distinguish every observed fact from your own inference. Never present an inference as a sourced fact.
- Never invent sales, downloads, rankings, search volumes, market shares, demand percentages, supply counts, or claims about what 'will sell'.
- If the evidence does not justify enough opportunities, return fewer opportunities and explain why. Do not fill the requested count with generic guesses.
- Strictly honor the user's rejection list and avoid close repeats from prior history.
- Use your own judgment to avoid overused, cliché, or low-value stock concepts without relying on a fixed keyword blacklist.

${buildProductionSpecRules('photo')}
${buildProductionSpecRules('video')}

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'No custom instructions were provided. Use your own evidence-driven judgment to choose the most promising research directions.'}

USER REJECTION LIST:
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

PAST OPPORTUNITY HISTORY (do not repeat these; search for new angles):
${(input.pastOpportunitiesHistory || []).slice(0, 40).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'None'}

${webMemo}

FINAL COUNTS:
Maximum photos: ${input.requestedPhotoCount}
Maximum videos: ${input.requestedVideoCount}
`;

  const systemInstruction = input.isPlatformDataEnabled === false
    ? geminiOnlySystemInstruction
    : platformSystemInstruction;

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
    required: ['source', 'url', 'observation', 'inference', 'source_ref_ids']
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
        const photoValidation = filterEvidenceBackedOpportunities(
          (parsed.photos || []).slice(0, input.requestedPhotoCount),
          input
        );
        const videoValidation = filterEvidenceBackedOpportunities(
          (parsed.videos || []).slice(0, input.requestedVideoCount),
          input
        );

        const validationWarnings = [...(parsed.warnings || [])];
        const removedForEvidence = photoValidation.removed + videoValidation.removed;
        if (removedForEvidence > 0) {
          validationWarnings.push(
            `Removed ${removedForEvidence} candidate(s) because their evidence URL did not match a collected or grounded research source.`
          );
        }

        return {
          evidence_summary: parsed.evidence_summary || 'Analysis completed.',
          warnings: validationWarnings,
          photos: photoValidation.items,
          videos: videoValidation.items
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
  isPlatformDataEnabled?: boolean;
}): string[] {
  const warnings: string[] = [];
  const modeText = input.isPlatformDataEnabled === false
    ? 'because the available grounded evidence did not justify additional unique candidates'
    : 'because the available human discussion evidence did not justify additional unique candidates';

  if (input.photos.length < input.requestedPhotoCount) {
    warnings.push(
      `Returned ${input.photos.length} photo opportunities (requested ${input.requestedPhotoCount}) ${modeText}.`
    );
  }
  if (input.videos.length < input.requestedVideoCount) {
    warnings.push(
      `Returned ${input.videos.length} video opportunities (requested ${input.requestedVideoCount}) ${modeText}.`
    );
  }
  return warnings;
}
