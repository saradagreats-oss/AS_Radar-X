import { GoogleGenAI, Type } from '@google/genai';
import { storage } from '../storage/database.js';
import { getComputerUseModelCandidates, listAvailableGeminiModels } from './models.js';
import type {
  ClusterAnalysis,
  ConceptCluster,
  PdfDocumentConfig,
  PhotoOpportunity,
  RawEvidence,
  ResearchReport,
  VideoOpportunity,
  WebResearchResult,
  SourceEvidenceRecord
} from '../types.js';
import { calculateOpportunityScore } from '../analysis/evidenceScore.js';
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
  pdfDoc?: PdfDocumentConfig | null;
  tagCount?: number;
  titleInstructions?: string;
  researchMemo?: string;
  evidenceSources?: SourceEvidenceRecord[];
  portfolioSummary?: Record<string, any> | null;
  model?: string;
  allowModelFallback?: boolean;
}

interface GeminiModelOutput {
  evidence_summary: string;
  warnings?: string[];
  photos: Array<Record<string, any>>;
  videos: Array<Record<string, any>>;
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

async function candidateModels(selectedModel?: string, allowModelFallback = false): Promise<string[]> {
  const selected = String(selectedModel || storage.getCustomModel() || '').trim().replace(/^models\//, '');
  const isAuto = !selected || selected.toLowerCase() === 'auto';

  if (!isAuto && !allowModelFallback) return [selected];

  let available: string[] = [];
  try {
    available = await listAvailableGeminiModels(storage.getCustomApiKey() || process.env.GEMINI_API_KEY || '');
  } catch {
    // Auto remains usable with the stable Computer Use-compatible fallback order.
  }

  const fallback = getComputerUseModelCandidates('auto', storage.getLastSuccessfulModel(), available);
  if (!isAuto && allowModelFallback) {
    return [...new Set([selected, ...fallback])];
  }
  return fallback;

}

/** Keep only relevant, distinct tags; never pad with unrelated generic stock terms. */
function normalizeTags(rawTags: string[] = [], title = '', prompt = '', requestedCount = 25): string[] {
  const limit = Math.max(1, Math.min(50, Math.floor(requestedCount) || 25));
  const cleaned: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const norm = String(value || '')
      .replace(/^[#\d.-]+/, '')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (norm && norm.length >= 2 && !seen.has(norm) && cleaned.length < limit) {
      seen.add(norm);
      cleaned.push(norm);
    }
  };
  for (const tag of rawTags) add(tag);
  if (cleaned.length < limit) {
    for (const token of extractTokens(title)) add(token);
  }
  return cleaned.slice(0, limit);
}

export async function runGeminiStrategicAnalyst(input: AnalystInput): Promise<GeminiAnalystOutput> {
  const ai = getClient();
  const pdfDoc = input.pdfDoc || storage.getPdfDocument();

  const pdfContextText = pdfDoc?.base64Data
    ? `\nATTACHED REFERENCE PDF DOCUMENT: "${pdfDoc.fileName}" (${Math.round(pdfDoc.fileSize / 1024)} KB)
PDF ANALYSIS DIRECTIVES & SPECIFIC INSTRUCTIONS:
${pdfDoc.instructions || 'Carefully inspect all pages, visual photographs, graphic assets, layouts, and contextual text inside this PDF document. Synthesize stock photo and video opportunities directly aligned with the visual essence and commercial needs indicated in this PDF.'}
`
    : '';

  const evidencePayload = {
    research_memo: input.researchMemo || '',
    evidence_sources: input.evidenceSources || input.webResearch?.sources || [],
    portfolio_snapshot: input.portfolioSummary || null,
    requested_tag_count: Math.max(1, Math.min(50, Number(input.tagCount) || 25)),
    title_instructions: input.titleInstructions || '',
    source_statuses: input.sourceStatuses,
    deterministic_analysis: input.clusterAnalyses.map((a) => ({
      name: a.cluster.name,
      keywords: a.cluster.primary_keywords,
      evidence_count: a.cluster.evidence_count,
      recurrence: a.recurrence,
      score: a.score
    })),
    raw_observation_count: input.rawEvidence.length,
    normalized_observation_sample: input.rawEvidence.slice(0, 50).map((e) => ({
      source: e.source,
      title: e.raw_title,
      description: e.raw_description?.slice(0, 160),
      keywords: e.raw_keywords
    }))
  };

  const systemInstruction = `You are AS-Radar-X Lead Commercial Stock Content Market Intelligence Analyst and Creative Director.

CRITICAL OPERATIONAL RULES & OUTPUT REQUIREMENTS:
1. MERGED SEO TITLE ONLY (NO DESCRIPTION):
   - For every Photo and Video opportunity, combine the main subject and the details that help a buyer recognize the asset into ONE natural, searchable English title.
   - Do NOT produce a separate description field. All essential context is merged directly into this single SEO title.
   - Keep the title clear and readable. Do not keyword-stuff or repeat near-synonyms.

2. TOP-TIER PRODUCTION-READY PROMPT:
   - Write a production prompt that is executable and specific to the actual buyer use case and observed visual gap.
   - Choose a suitable visual medium, composition, environment, camera approach and lighting for that subject. Do not force macro photography, cinematic lighting, shallow depth of field, or a fixed camera style when they do not fit.
   - For Video prompts: explain the purposeful action and natural motion, and include camera movement, duration and loop potential only where they add real value.
   - STRICT CONSTRAINT 1: Do NOT clearly or directly show any human faces. Keep subjects faceless, in silhouette, from behind, over-the-shoulder, or focused on hands, tools, and environments.
   - STRICT CONSTRAINT 2: Absolutely NO text, words, signs, watermarks, or typography inside the visual content.

3. USER-SELECTED TAG COUNT:
   - Return up to ${input.tagCount || 25} accurate, distinct and relevant tags.
   - The first 10 (or all if fewer) must be the strongest, most specific search terms.
   - Never pad with generic phrases, unrelated industries or repeated synonyms.

4. EVIDENCE-BASED OPPORTUNITY COUNT:
   - Requested quantities are maximums. Return fewer when evidence is insufficient or candidates are repetitive.
   - Never invent a candidate merely to meet the count.

5. ZERO SIMILARITY & HISTORICAL DEDUPLICATION:
   - No opportunities within the report may be similar to one another. Each must cover a distinct commercial niche or visual angle.
   - Compare against past history: Do NOT duplicate or repeat previous concepts or titles.
   - NEVER hardcode titles or ideas; synthesize fresh, evidence-backed content.

6. REQUIRED TRANSPARENCY FIELDS:
   - Include the concept, why it matters, buyer use case, visual gap, longevity, risk flags and evidence references requested by the JSON schema.
   - Every score component must cite one or more valid evidence IDs from the supplied source list. Use 0 when the evidence is absent.

${pdfContextText}

TITLE STYLE INSTRUCTIONS:
${input.titleInstructions?.trim() || 'No title style override. Infer natural title length, word order, vocabulary and punctuation from relevant stock marketplace listing titles observed during this run. Keep titles readable, specific and searchable; never keyword-stuff.'}

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

RESEARCH MEMO AND OBSERVED SOURCE RECORDS:
${(input.researchMemo || '').slice(0, 30000)}
${JSON.stringify(input.evidenceSources || input.webResearch?.sources || [], null, 2)}

LIVE PORTFOLIO SNAPSHOT:
${JSON.stringify(input.portfolioSummary || null, null, 2)}

USER REJECTION LIST (Strict Anti-Cliché / Exclusions):
${(input.rejectedContentList || []).map((r) => `- ${r}`).join('\n') || 'None'}

PAST OPPORTUNITY HISTORY (Exclusion Memory — Avoid Similar Angles):
${(input.pastOpportunitiesHistory || []).slice(0, 35).map((p) => `- ${p.title} | ${p.concept}`).join('\n') || 'None'}
`;

  const promptText = `Synthesize the final AS-Radar-X opportunity report strictly adhering to the schema and instructions.

REQUESTED COUNTS:
- Photos: ${input.requestedPhotoCount}
- Videos: ${input.requestedVideoCount}

EVIDENCE & RESEARCH PAYLOAD:
${JSON.stringify(evidencePayload, null, 2)}

Return strictly valid JSON matching the schema.`;

  const scoreComponentSchema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.NUMBER, description: 'Evidence-based assessment from 0 to 100, not a sales probability.' },
      reason: { type: Type.STRING, description: 'Short rationale tied to exact source evidence IDs; state evidence limitations.' },
      evidence_ids: { type: Type.ARRAY, items: { type: Type.NUMBER } }
    },
    required: ['score', 'reason', 'evidence_ids']
  };
  const scoreComponentsSchema = {
    type: Type.OBJECT,
    properties: {
      recurring_demand: scoreComponentSchema,
      commercial_use: scoreComponentSchema,
      marketplace_evidence: scoreComponentSchema,
      supply_gap: scoreComponentSchema,
      longevity: scoreComponentSchema,
      production_feasibility: scoreComponentSchema
    },
    required: ['recurring_demand','commercial_use','marketplace_evidence','supply_gap','longevity','production_feasibility']
  };
  const evidenceSchema = {
    type: Type.OBJECT,
    properties: {
      observed_facts: { type: Type.ARRAY, items: { type: Type.STRING } },
      inferences: { type: Type.ARRAY, items: { type: Type.STRING } },
      source_ids: { type: Type.ARRAY, items: { type: Type.NUMBER } }
    },
    required: ['observed_facts','inferences','source_ids']
  };
  const photoOpportunitySchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: {
        type: Type.STRING,
        description:
          'Single natural SEO-optimized English sentence combining main subject and crucial visual details. No separate description. No special characters like |.'
      },
      prompt: {
        type: Type.STRING,
        description:
          'Production-ready AI image prompt adapted to the buyer use case, visual angle, medium, composition, setting and realism requirements. Specify technical detail only where relevant. No human faces directly shown, no text in image.'
      },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to the requested count of relevant stock-search tags, strongest first; do not pad.' },
      concept: { type: Type.STRING },
      why_selected: { type: Type.STRING },
      commercial_use: { type: Type.STRING },
      buyer_use_case: { type: Type.STRING },
      visual_angle: { type: Type.STRING },
      supply_gap: { type: Type.STRING },
      longevity: { type: Type.STRING },
      risk_notes: { type: Type.STRING },
      evidence: evidenceSchema,
      score_components: scoreComponentsSchema
    },
    required: ['id','title','prompt','tags','concept','why_selected','commercial_use','buyer_use_case','visual_angle','supply_gap','longevity','evidence','score_components']
  };

  const videoOpportunitySchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: {
        type: Type.STRING,
        description:
          'Single natural SEO-optimized English sentence describing the stock footage subject and useful motion. No separate description. No special characters like |.'
      },
      prompt: {
        type: Type.STRING,
        description:
          "Production-ready AI video prompt adapted to the buyer's actual motion need. Describe purposeful subject movement; add camera movement, duration, loop and technical details only when useful. No human faces directly shown, no text in video." 
      },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to the requested count of relevant stock-search tags, strongest first; do not pad.' },
      concept: { type: Type.STRING },
      why_selected: { type: Type.STRING },
      commercial_use: { type: Type.STRING },
      buyer_use_case: { type: Type.STRING },
      motion_value: { type: Type.STRING },
      motion_action: { type: Type.STRING },
      loop_potential: { type: Type.STRING },
      supply_gap: { type: Type.STRING },
      longevity: { type: Type.STRING },
      risk_notes: { type: Type.STRING },
      evidence: evidenceSchema,
      score_components: scoreComponentsSchema
    },
    required: ['id','title','prompt','tags','concept','why_selected','commercial_use','buyer_use_case','motion_value','supply_gap','longevity','evidence','score_components']
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      evidence_summary: { type: Type.STRING },
      warnings: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      photos: {
        type: Type.ARRAY,
        items: photoOpportunitySchema
      },
      videos: {
        type: Type.ARRAY,
        items: videoOpportunitySchema
      }
    },
    required: ['evidence_summary', 'photos', 'videos']
  };

  const contents: any[] = [];
  if (pdfDoc?.base64Data) {
    contents.push({
      inlineData: {
        mimeType: pdfDoc.mimeType || 'application/pdf',
        data: pdfDoc.base64Data
      }
    });
  }
  contents.push({ text: promptText });

  let lastError: any = null;

  for (const model of await candidateModels(input.model, input.allowModelFallback)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            systemInstruction,
            temperature: 0.35
          }
        });

        const parsed = JSON.parse(response.text || '{}') as GeminiModelOutput;
        storage.saveLastSuccessfulModel(model);

        // Process and validate Photos
        const processedPhotos: PhotoOpportunity[] = [];
        const seenPhotoTitles = new Set<string>();

        for (let idx = 0; idx < (parsed.photos || []).length; idx++) {
          const rawP = parsed.photos[idx];
          const cleanTitle = (rawP.title || `Curated Stock Photo Asset ${idx + 1}`)
            .replace(/^(title|subject):\s*/i, '')
            .replace(/[|]/g, ' - ')
            .trim();

          const titleKey = cleanTitle.toLowerCase();
          if (seenPhotoTitles.has(titleKey)) continue;
          seenPhotoTitles.add(titleKey);

          // Check rejection list
          if (evaluateRiskAndRejections(cleanTitle, input.rejectedContentList || []).rejected) {
            continue;
          }

          // Check past history similarity
          if (
            checkHistoryProtection(
              cleanTitle,
              rawP.prompt || '',
              input.pastOpportunitiesHistory || []
            ).isRepetitive
          ) {
            continue;
          }

          const tags = normalizeTags(rawP.tags, cleanTitle, rawP.prompt, input.tagCount || 25);
          const validIds = new Set((input.evidenceSources || input.webResearch?.sources || []).map((source) => Number(source.id)));
          const score = calculateOpportunityScore(rawP.score_components, validIds);
          const sourceIds = Array.isArray(rawP.evidence?.source_ids) ? rawP.evidence.source_ids.map((id: any) => Number(id)).filter((id: number) => validIds.has(id)) : [];
          if (!sourceIds.length) continue;
          processedPhotos.push({
            id: rawP.id || `photo-${Date.now()}-${idx + 1}`,
            title: cleanTitle,
            prompt: rawP.prompt || '',
            tags,
            concept: rawP.concept || '',
            why_selected: rawP.why_selected || '',
            market_evidence: (rawP.evidence?.observed_facts || []).join(' | '),
            commercial_use: rawP.commercial_use || '',
            buyer_use_case: rawP.buyer_use_case || '',
            visual_angle: rawP.visual_angle || '',
            supply_gap: rawP.supply_gap || '',
            longevity: rawP.longevity || '',
            risk_notes: rawP.risk_notes || '',
            evidence: { ...(rawP.evidence || {}), source_ids: sourceIds, source_refs: sourceIds.map((id: number) => (input.evidenceSources || input.webResearch?.sources || []).find((source) => Number(source.id) === id)).filter(Boolean) },
            score
          });

          if (processedPhotos.length >= input.requestedPhotoCount) break;
        }

        // Process and validate Videos
        const processedVideos: VideoOpportunity[] = [];
        const seenVideoTitles = new Set<string>();

        for (let idx = 0; idx < (parsed.videos || []).length; idx++) {
          const rawV = parsed.videos[idx];
          const cleanTitle = (rawV.title || `Cinematic Stock Video Asset ${idx + 1}`)
            .replace(/^(title|subject):\s*/i, '')
            .replace(/[|]/g, ' - ')
            .trim();

          const titleKey = cleanTitle.toLowerCase();
          if (seenVideoTitles.has(titleKey)) continue;
          seenVideoTitles.add(titleKey);

          // Check rejection list
          if (evaluateRiskAndRejections(cleanTitle, input.rejectedContentList || []).rejected) {
            continue;
          }

          // Check past history similarity
          if (
            checkHistoryProtection(
              cleanTitle,
              rawV.prompt || '',
              input.pastOpportunitiesHistory || []
            ).isRepetitive
          ) {
            continue;
          }

          const tags = normalizeTags(rawV.tags, cleanTitle, rawV.prompt, input.tagCount || 25);
          const validIds = new Set((input.evidenceSources || input.webResearch?.sources || []).map((source) => Number(source.id)));
          const score = calculateOpportunityScore(rawV.score_components, validIds);
          const sourceIds = Array.isArray(rawV.evidence?.source_ids) ? rawV.evidence.source_ids.map((id: any) => Number(id)).filter((id: number) => validIds.has(id)) : [];
          if (!sourceIds.length) continue;
          processedVideos.push({
            id: rawV.id || `video-${Date.now()}-${idx + 1}`,
            title: cleanTitle,
            prompt: rawV.prompt || '',
            tags,
            concept: rawV.concept || '',
            why_selected: rawV.why_selected || '',
            commercial_use: rawV.commercial_use || '',
            buyer_use_case: rawV.buyer_use_case || '',
            motion_value: rawV.motion_value || '',
            motion_action: rawV.motion_action || '',
            loop_potential: rawV.loop_potential || '',
            supply_gap: rawV.supply_gap || '',
            longevity: rawV.longevity || '',
            risk_notes: rawV.risk_notes || '',
            evidence: { ...(rawV.evidence || {}), source_ids: sourceIds, source_refs: sourceIds.map((id: number) => (input.evidenceSources || input.webResearch?.sources || []).find((source) => Number(source.id) === id)).filter(Boolean) },
            score
          });

          if (processedVideos.length >= input.requestedVideoCount) break;
        }

        return {
          evidence_summary:
            parsed.evidence_summary ||
            `Generated ${processedPhotos.length} photo and ${processedVideos.length} video opportunities backed by strategic market research and historical anti-cliché intelligence.`,
          warnings: parsed.warnings || [],
          photos: processedPhotos.slice(0, input.requestedPhotoCount),
          videos: processedVideos.slice(0, input.requestedVideoCount)
        };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if ((msg.includes('503') || msg.includes('high demand') || msg.includes('429')) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
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
      `Returned ${input.photos.length} photo opportunities (requested ${input.requestedPhotoCount}) to adhere strictly to non-repetition and human discussion evidence standards.`
    );
  }

  if (input.videos.length < input.requestedVideoCount) {
    warnings.push(
      `Returned ${input.videos.length} video opportunities (requested ${input.requestedVideoCount}) to adhere strictly to non-repetition and human discussion evidence standards.`
    );
  }

  return warnings;
}
