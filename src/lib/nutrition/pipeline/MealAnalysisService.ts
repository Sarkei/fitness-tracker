import { completeMealAnalysis } from '../../../../aiProviders';
import { ensureAtomicMealAnalysis } from './atomicMealAnalysis';
import { segmentMealWithAi } from './mealSegmentAnalysis';
import { normalizeMealInputForCache } from './pipelineInputCache';
import { MealAnalysisSchema, type MealAnalysis } from './schemas';

/** Fallback für Foto / wenn Segmentierung scheitert — volle Analyse. */
const FULL_ANALYSIS_PROMPT = `Decompose food into ATOMIC single foods for Open Food Facts. No composite names. No calories. JSON only.
Each component needs search_strategy. Temperature 0. Same input → same component names.`;

function parseImageDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function extractJson(raw: string): unknown {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid-json');
  return JSON.parse(text.slice(start, end + 1));
}

export class MealAnalysisService {
  /**
   * Pipeline Schritt 1: KI segmentiert maximal atomar (+ Öl bei Brat/Ofen wenn plausibel).
   * Schritte 2–4: FoodDatabaseService → OFF streng → Generic → KI-neuer Generic-Eintrag.
   */
  async analyze(payload: { text?: string; imageDataUrl?: string }): Promise<{ analysis: MealAnalysis; modelUsed: string | null }> {
    const text = String(payload.text ?? '').trim();
    const imageDataUrl = String(payload.imageDataUrl ?? '').trim();
    const image = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;
    if (!text && !image) throw new Error('missing-input');

    const modelUsed = process.env.AI_ACTIVE_PROVIDER ?? null;

    // Text und Foto: zuerst Segmenter (atomar) — Foto mit optionalem Text-Hint.
    try {
      const analysis = await segmentMealWithAi(text || 'Foto-Mahlzeit', image ?? undefined);
      return {
        analysis,
        modelUsed: modelUsed ? `${modelUsed}:segment` : 'segment',
      };
    } catch {
      /* fallback auf Vollanalyse */
    }

    const normalizedHint = text ? `\nNORMALIZED:\n${normalizeMealInputForCache(text)}` : '';
    const inputPrompt = `${FULL_ANALYSIS_PROMPT}${normalizedHint}\n\nUSER_INPUT:\n${text || 'image-only'}`;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await completeMealAnalysis(inputPrompt, image ?? undefined, {
          temperature: 0,
          responseMode: 'json_object',
        });
        const parsed = MealAnalysisSchema.parse(extractJson(raw));
        const analysis = await ensureAtomicMealAnalysis(parsed, text, image ?? undefined);
        return { analysis, modelUsed };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`analysis-failed:${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}
