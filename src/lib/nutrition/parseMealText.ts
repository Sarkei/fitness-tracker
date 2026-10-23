import { completeMealAnalysis } from '../../../aiProviders';
import { buildMealParsePhotoPrompt, buildMealParseTextPrompt } from './buildMealParsePrompts';
import { MealIntentSchema, type MealIntent } from './schemas';
import { segmentMealText } from './textMealSegmenter';
import { buildMealItemFromDishPhrase } from './dishExpander';
import type { MealItem } from './schemas';

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  return JSON.parse(t.slice(start, end + 1));
}

/** Deterministischer Fallback ohne KI — für Tests und Offline-Parse. */
export function buildHeuristicMealIntent(userText: string): MealIntent {
  const segments = segmentMealText(userText);
  const items: MealItem[] = [];
  for (const seg of segments) {
    const item = buildMealItemFromDishPhrase(seg);
    if (item) items.push(item);
  }
  if (items.length === 0) {
    items.push(
      buildMealItemFromDishPhrase(userText) ?? {
        label: userText.trim(),
        dishType: 'single_ingredient',
        quantityMultiplier: 1,
        components: [{ rawText: userText, foodHint: userText.trim(), quantity: null, isPackaged: false }],
      },
    );
  }
  return { items, parseConfidence: 0.65 };
}

export async function parseMealTextToIntent(userText: string): Promise<MealIntent> {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { items: [], parseConfidence: 0 };
  }

  try {
    const prompt = buildMealParseTextPrompt(trimmed);
    const raw = await completeMealAnalysis(prompt, undefined, { responseMode: 'json_object' });
    const parsed = extractJsonObject(raw);
    const validated = MealIntentSchema.safeParse(parsed);
    if (validated.success && validated.data.items.length > 0) {
      return validated.data;
    }
  } catch (e) {
    console.warn('parseMealText: AI failed, heuristic fallback', e);
  }

  return buildHeuristicMealIntent(trimmed);
}

export async function parseMealPhotoToIntent(
  userText: string,
  imageDataUrl: string,
): Promise<MealIntent> {
  const trimmed = userText.trim();
  const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    return buildHeuristicMealIntent(trimmed || 'Mahlzeit vom Foto');
  }
  const image = { mimeType: m[1], data: m[2] };
  try {
    const prompt = buildMealParsePhotoPrompt(trimmed);
    const raw = await completeMealAnalysis(prompt, image, { responseMode: 'json_object' });
    const parsed = extractJsonObject(raw);
    const validated = MealIntentSchema.safeParse(parsed);
    if (validated.success && validated.data.items.length > 0) {
      return validated.data;
    }
  } catch (e) {
    console.warn('parseMealPhoto: AI failed, heuristic fallback', e);
  }
  return buildHeuristicMealIntent(trimmed || 'Mahlzeit vom Foto');
}
