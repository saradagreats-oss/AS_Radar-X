import { GoogleGenAI } from '@google/genai';

export async function listAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('No Gemini API key available.');
  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list();
  const names = new Set<string>();
  for await (const model of pager) {
    const name = String(model.name || '').replace(/^models\//, '');
    if (!name || !/^gemini-/i.test(name)) continue;
    const supported = (model as any).supportedGenerationMethods as string[] | undefined;
    if (Array.isArray(supported) && !supported.some((method) => method.toLowerCase() === 'generatecontent')) continue;
    names.add(name);
  }
  return [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
