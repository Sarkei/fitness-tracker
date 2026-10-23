import { FoodDatabaseService } from './FoodDatabaseService';
import { MealAnalysisService } from './MealAnalysisService';
import { calculateNutrition, sumNutrition } from './NutritionCalculator';
import { validateSanity } from './SanityValidator';
import { ensurePieceWeightsOnAnalysis, enrichOffPieceWeightsWithAi } from '../enrichPieceWeights';
import { syncAnalysisAndMatchesFromOff } from './syncOffToAnalysis';
import { PipelineResultSchema, type PipelineResult } from './schemas';

const PIPELINE_VERSION = 'nutrition-v3';
const PIPELINE_TIMEOUT_MS = 45_000;
const PIPELINE_RETRY_ATTEMPTS = 2;

/**
 * V3-Reihenfolge:
 * 1. KI-Segmentierung (atomar, ggf. Brat-/Ofen-Öl)
 * 2. OFF strenge Suche
 * 3. Generic-Katalog (statisch + zuvor KI-persistiert)
 * 4. KI legt neuen Generic-Eintrag an (App-DB, wiederverwendbar)
 */
export class NutritionAIService {
  constructor(
    private readonly analyzer = new MealAnalysisService(),
    private readonly database: FoodDatabaseService = new FoodDatabaseService(),
  ) {}

  async process(payload: { text?: string; imageDataUrl?: string }): Promise<PipelineResult> {
    const timed = this.runWithTimeout(async () => {
      let { analysis, modelUsed } = await this.runWithRetry(() => this.analyzer.analyze(payload));
      let matches = await this.runWithRetry(() =>
        this.database.matchComponents(analysis, {
          chainName: analysis.is_chain_restaurant ? analysis.chain_name : null,
        }),
      );
      let synced = syncAnalysisAndMatchesFromOff(analysis, matches);
      analysis = synced.analysis;
      matches = synced.matches;
      analysis = await enrichOffPieceWeightsWithAi(analysis, matches);
      analysis = ensurePieceWeightsOnAnalysis(analysis, matches);
      synced = syncAnalysisAndMatchesFromOff(analysis, matches);
      analysis = synced.analysis;
      matches = synced.matches;
      const components = matches
        .map((m) => calculateNutrition(m))
        .filter((v): v is NonNullable<typeof v> => Boolean(v));
      const totals = sumNutrition(components);
      const sanityWarnings = validateSanity(analysis, totals.kcal, totals);
      const userReviewRequired =
        matches.some((m) => m.requires_user_review) ||
        components.some((c) => c.data_source === 'estimated_fallback');

      return PipelineResultSchema.parse({
        state: 'AWAITING_REVIEW',
        analysis,
        matches,
        components,
        totals,
        sanityWarnings,
        user_review_required: userReviewRequired,
        pipeline_version: PIPELINE_VERSION,
        ai_model_used: modelUsed,
      });
    });
    return timed;
  }

  private async runWithRetry<T>(work: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (attempt <= PIPELINE_RETRY_ATTEMPTS) {
      try {
        return await work();
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const retryable =
          message.includes('timeout') ||
          message.includes('network') ||
          message.includes('pipeline-timeout') ||
          message.includes('analysis-failed') ||
          message.includes('invalid-json') ||
          message.includes('no-json') ||
          message.includes('off-http-5');
        if (!retryable || attempt >= PIPELINE_RETRY_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        attempt += 1;
      }
    }
    throw new Error('pipeline-retry-exhausted');
  }

  private async runWithTimeout<T>(work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('pipeline-timeout')), PIPELINE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
