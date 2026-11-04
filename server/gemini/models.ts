import { GoogleGenAI } from '@google/genai';

/**
 * The research pipeline uses both the Interactions API Computer Use tool and
 * generateContent for the final structured analyst report. Keep this list to
 * models documented for Computer Use that are also usable by the analyst pass.
 */
export const COMPUTER_USE_MODEL_IDS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview'
] as const;

const computerUseModelSet = new Set<string>(COMPUTER_USE_MODEL_IDS);

export function normalizeGeminiModelId(model: string): string {
  return String(model || '').trim().replace(/^models\//i, '');
}

export function isComputerUseModelSupported(model: string): boolean {
  return computerUseModelSet.has(normalizeGeminiModelId(model).toLowerCase());
}

/**
 * A concrete selection is strict: never silently replace it with another model.
 * Auto prefers the stable 3.7/3.6 options before 3.8, then tries other
 * documented Computer Use models. An API-discovered list narrows Auto to
 * models currently exposed to the configured key.
 */
export function getComputerUseModelCandidates(
  selection: string,
  lastSuccessfulModel = '',
  availableModels: string[] = []
): string[] {
  const requested = normalizeGeminiModelId(selection);
  if (requested && requested.toLowerCase() !== 'auto') {
    return isComputerUseModelSupported(requested) ? [requested] : [];
  }

  const preferredOrder = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    normalizeGeminiModelId(lastSuccessfulModel),
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3-flash-preview'
  ];

  const candidates = [...new Set(preferredOrder.filter((model) => isComputerUseModelSupported(model)))];
  if (!availableModels.length) return candidates;

  const available = new Set(availableModels.map(normalizeGeminiModelId));
  const discoveredCandidates = candidates.filter((model) => available.has(model));
  return discoveredCandidates.length ? discoveredCandidates : candidates;
}

export async function listAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('No Gemini API key available.');
  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list();
  const names = new Set<string>();
  for await (const model of pager) {
    const name = normalizeGeminiModelId(String(model.name || ''));
    if (!name || !/^gemini-/i.test(name)) continue;
    const supported = (model as any).supportedGenerationMethods as string[] | undefined;
    if (Array.isArray(supported) && !supported.some((method) => method.toLowerCase() === 'generatecontent')) continue;
    names.add(name);
  }
  return [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export async function listAvailableComputerUseModels(apiKey: string): Promise<string[]> {
  const available = new Set(await listAvailableGeminiModels(apiKey));
  return COMPUTER_USE_MODEL_IDS.filter((model) => available.has(model));
}
