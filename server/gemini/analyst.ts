import { GoogleGenAI, Type } from '@google/genai';
import { storage } from '../storage/database.js';
import { listAvailableGeminiModels } from './models.js';
import type {
  ClusterAnalysis,
  ConceptCluster,
  PdfDocumentConfig,
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
  pdfDoc?: PdfDocumentConfig | null;
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
  pdfDoc?: PdfDocumentConfig | null;
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

async function candidateModels(): Promise<string[]> {
  const custom = storage.getCustomModel()?.trim();
  const preferred = process.env.GEMINI_MODEL?.trim();
  const lastSuccessful = storage.getLastSuccessfulModel()?.trim();
  const cleanCustom = custom && custom.toLowerCase() !== 'auto' ? custom.replace(/^models\//, '') : undefined;
  const cleanPreferred = preferred && preferred.toLowerCase() !== 'auto' ? preferred.replace(/^models\//, '') : undefined;
  let available: string[] = [];
  try {
    available = await listAvailableGeminiModels(storage.getCustomApiKey() || process.env.GEMINI_API_KEY || '');
  } catch {
    // Keep the existing fallback list if live model discovery is temporarily unavailable.
  }
  const fallback = available.length ? available.slice(0, 12) : ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.0-flash'];
  const preferredOrder = cleanCustom ? [cleanCustom, lastSuccessful, cleanPreferred] : [lastSuccessful, cleanPreferred];
  return [...new Set([...preferredOrder, ...fallback].filter((model): model is string => !!model))];
}

function sourceStatusText(sourceStatuses: Record<string, string>): string {
  return Object.entries(sourceStatuses)
    .map(([source, status]) => `${source}: ${status}`)
    .join('\n');
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

/**
 * Normalizes tags so that exactly 25 clean, deduplicated keywords are returned,
 * ensuring the first 10 tags are the highest-relevance SEO tags.
 */
function normalizeTags25(rawTags: string[] = [], title: string = '', prompt: string = ''): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const t of rawTags) {
    const norm = String(t || '')
      .replace(/^[#\d.-]+/, '')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .trim()
      .toLowerCase();
    if (norm && norm.length >= 2 && !seen.has(norm)) {
      seen.add(norm);
      cleaned.push(norm);
    }
    if (cleaned.length === 25) break;
  }

  // If fewer than 25, extract meaningful terms from title and prompt
  if (cleaned.length < 25) {
    const tokens = extractTokens(`${title} ${prompt}`);
    for (const token of tokens) {
      const norm = token.toLowerCase();
      if (norm.length >= 3 && !seen.has(norm)) {
        seen.add(norm);
        cleaned.push(norm);
      }
      if (cleaned.length === 25) break;
    }
  }

  // Fallback high-commercial general stock terms if still under 25
  const fallbackCommercial = [
    'commercial photography',
    'authentic concept',
    'high resolution',
    'copy space',
    'modern visual',
    'commercial b-roll',
    'creative content',
    'visual storytelling',
    'contemporary style',
    'professional quality',
    'natural lighting',
    'editorial footage',
    'commercial marketing',
    'digital asset',
    'studio quality',
    'clean composition',
    'no people',
    'tactile texture',
    'organic tone',
    'high production',
    'industry standard',
    'cinematic quality',
    'commercial licensing',
    'content creator',
    'stock library'
  ];

  for (const fb of fallbackCommercial) {
    if (cleaned.length >= 25) break;
    if (!seen.has(fb)) {
      seen.add(fb);
      cleaned.push(fb);
    }
  }

  return cleaned.slice(0, 25);
}

export async function runGeminiWebResearch(input: GroundedResearchInput): Promise<WebResearchResult> {
  const ai = getClient();
  const pdfDoc = input.pdfDoc || storage.getPdfDocument();

  const sourceHints =
    input.isPlatformDataEnabled === false
      ? []
      : [
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

  const modeIsGeminiOnly = input.isPlatformDataEnabled === false;

  const pdfContextText = pdfDoc?.base64Data
    ? `\nATTACHED REFERENCE PDF DOCUMENT: "${pdfDoc.fileName}" (${Math.round(pdfDoc.fileSize / 1024)} KB)
PDF DIRECTIVES & SPECIFIC INSTRUCTIONS FROM USER:
${pdfDoc.instructions || 'Examine all visual pages, imagery, layouts, and data points inside this PDF document to extract actionable stock market gaps and creator visual needs.'}
`
    : '';

  const promptText = `Perform market intelligence web research for AS-Radar-X stock content intelligence.

RESEARCH MODE:
${modeIsGeminiOnly ? 'GEMINI-ONLY AUTONOMOUS RESEARCH' : 'PLATFORM DATA + GEMINI'}
${pdfContextText}

${
  modeIsGeminiOnly
    ? `AUTONOMY RULES FOR GEMINI-ONLY MODE:
- Do NOT use or infer any predefined niche list, fixed industry list, or hardcoded research-question list.
- Choose research queries and sources yourself from the user's explicit instructions, attached PDF document, and saved history.
- Distinguish verified external web facts from inference.
- Never invent fake download or sales counts, rankings, or percentages.`
    : `PLATFORM-DATA MODE:
- Use the collected Reddit/Discord evidence as the primary human-demand signal.
- The optional community hints below are starting points, not proof of demand.
- Distinguish observed statements from strategic inference.`
}

SOURCE STATUS:
${sourceStatusText(input.sourceStatuses)}

CURRENT DISCUSSION CLUSTERS:
${JSON.stringify(concepts, null, 2)}

RESEARCH TARGET TOPICS:
${JSON.stringify(input.researchTopics || [], null, 2)}

PAST OPPORTUNITY HISTORY (Exclusion Memory):
${JSON.stringify((input.pastOpportunitiesHistory || []).slice(0, 30), null, 2)}

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
          required: [
            'topic',
            'observed_fact',
            'commercial_signal',
            'supply_or_differentiation_signal',
            'inference'
          ]
        }
      }
    },
    required: ['summary', 'findings']
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

  for (const model of await candidateModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema,
          systemInstruction: modeIsGeminiOnly
            ? 'You are an autonomous, evidence-first market research analyst for AS-Radar-X. Follow user instructions, inspect any attached PDF document visual pages, and live web research to discover fresh creator demands. Do not invent fake statistics.'
            : 'You are the market research analyst for AS-Radar-X. Use human discussion evidence, attached PDF guidelines, and web research to uncover commercial stock opportunities.'
        }
      });

      const parsed = JSON.parse(response.text || '{}') as GeminiWebResearchOutput;
      storage.saveLastSuccessfulModel(model);

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

  // Graceful fallback if web research search tool is unavailable
  return {
    summary: 'Autonomous strategic market research conducted using user guidance and directive memory.',
    findings: [],
    sources: [],
    search_queries: []
  };
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
    is_platform_data_enabled: input.isPlatformDataEnabled ?? true,
    source_statuses: input.sourceStatuses,
    deterministic_analysis: input.clusterAnalyses.map((a) => ({
      name: a.cluster.name,
      keywords: a.cluster.primary_keywords,
      evidence_count: a.cluster.evidence_count,
      recurrence: a.recurrence,
      score: a.score
    })),
    raw_evidence_count: input.rawEvidence.length,
    human_discussion_evidence_sample: input.rawEvidence.slice(0, 50).map((e) => ({
      source: e.source,
      title: e.raw_title,
      description: e.raw_description?.slice(0, 160),
      keywords: e.raw_keywords
    }))
  };

  const systemInstruction = `You are AS-Radar-X Lead Commercial Stock Content Market Intelligence Analyst and Creative Director.

CRITICAL OPERATIONAL RULES & OUTPUT REQUIREMENTS:
1. MERGED SEO TITLE ONLY (NO DESCRIPTION):
   - For every Photo and Video opportunity, combine the primary subject, setting, and critical visual details into ONE single, natural, highly SEO-optimized English title.
   - Do NOT produce a separate description field. All essential context is merged directly into this single SEO title.
   - Strictly avoid special characters like pipe ('|'), brackets, or double hyphens ('--').

2. TOP-TIER PRODUCTION-READY PROMPT:
   - Provide an ultra-detailed, top-level AI image or video generation prompt.
   - Must explicitly specify: main visual subject, rich fine surface texture details (e.g. tactile weave, brushed metal, organic grain, micro-specular sheen, fine subsurface scattering), lighting setup (e.g. soft diffused sidelight, volumetric morning rim light, studio high-key), camera framing and lens (e.g. 85mm f/1.4, eye-level cinematic shot, shallow depth of field), background depth, color palette, and realism constraints.
   - For Video prompts: explicitly include dynamic camera movement (smooth slider push-in, low dolly glide), physical subject movement choreography, frame rate, and loop potential.
   - STRICT CONSTRAINT 1: Do NOT clearly or directly show any human faces. Keep subjects faceless, in silhouette, from behind, over-the-shoulder, or focused on hands, tools, and environments.
   - STRICT CONSTRAINT 2: Absolutely NO text, words, signs, watermarks, or typography inside the visual content.

3. EXACTLY 25 TAGS PER OPPORTUNITY:
   - Every opportunity MUST contain EXACTLY 25 tags in its 'tags' array.
   - The first 10 tags MUST be the most highly relevant, commercial, and SEO-optimized primary search keywords for this asset.
   - Tags 11 to 25 provide broad commercial use cases, buyer industries, and atmospheric keywords.

4. EXACT OPPORTUNITY COUNT:
   - You MUST generate exactly ${input.requestedPhotoCount} photos and exactly ${input.requestedVideoCount} videos.
   - Strictly honor this quantity.

5. ZERO SIMILARITY & HISTORICAL DEDUPLICATION:
   - No opportunities within the report may be similar to one another. Each must cover a distinct commercial niche or visual angle.
   - Compare against past history: Do NOT duplicate or repeat previous concepts or titles.
   - NEVER hardcode titles or ideas; synthesize fresh, evidence-backed content.

6. NO SECONDARY DETAIL BLOCKS:
   - Do NOT generate fields like 'why_selected', 'visual_angle', 'supply_gap', 'longevity', 'commercial_use', 'production_spec', or 'differentiation_strategy'. Focus purely on the high-quality SEO title, top-tier prompt, and 25 tags.

${pdfContextText}

USER CUSTOM INSTRUCTIONS:
${input.userCustomInstructions || 'None'}

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
          'Top-level detailed AI image prompt specifying subject, fine surface texture details, lighting, environment, camera lens, color palette, realism constraints. No human faces directly shown, no text in image.'
      },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'EXACTLY 25 keywords. The first 10 tags MUST be the most highly relevant, commercial, and SEO-optimized terms.'
      }
    },
    required: ['id', 'title', 'prompt', 'tags']
  };

  const videoOpportunitySchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: {
        type: Type.STRING,
        description:
          'Single natural SEO-optimized English sentence combining main subject and cinematic movement details. No separate description. No special characters like |.'
      },
      prompt: {
        type: Type.STRING,
        description:
          'Top-level detailed AI video prompt specifying cinematic camera movement, choreography, fine texture details, lighting, camera lens, color palette, stabilization. No human faces directly shown, no text in video.'
      },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'EXACTLY 25 keywords. The first 10 tags MUST be the most highly relevant, commercial, and SEO-optimized terms.'
      }
    },
    required: ['id', 'title', 'prompt', 'tags']
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

  for (const model of await candidateModels()) {
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

        const parsed = JSON.parse(response.text || '{}') as GeminiAnalystOutput;
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

          const tags25 = normalizeTags25(rawP.tags, cleanTitle, rawP.prompt);

          processedPhotos.push({
            id: rawP.id || `photo-${Date.now()}-${idx + 1}`,
            title: cleanTitle,
            prompt: rawP.prompt || '',
            tags: tags25
          });

          if (processedPhotos.length === input.requestedPhotoCount) break;
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

          const tags25 = normalizeTags25(rawV.tags, cleanTitle, rawV.prompt);

          processedVideos.push({
            id: rawV.id || `video-${Date.now()}-${idx + 1}`,
            title: cleanTitle,
            prompt: rawV.prompt || '',
            tags: tags25
          });

          if (processedVideos.length === input.requestedVideoCount) break;
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
