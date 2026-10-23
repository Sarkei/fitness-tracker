/**
 * Schritt 4 der V3-Pipeline: KI legt fehlenden Generic-Eintrag an (App-DB, wiederverwendbar).
 * Schritte 1–3: Segmentierung → OFF streng → Generic-Katalog (in FoodDatabaseService).
 */

import type { Pool } from 'pg';
import type { Food } from '../../foodDatabase';
import { buildSuggestCustomFoodDraftPrompt } from '../../aiPrompts/buildMealPrompts';
import { parseCustomFoodDraftFromAi } from '../../mealAiShared';
import { capitalizeFoodDisplayName } from '../foodDisplayName';
import { lookupDefaultPortion } from '../defaultPortionLookup';
import {
  ensurePieceGramsForReview,
  pieceContextFromAnalysis,
  pieceQuantityFromGrams,
} from '../pieceUnitHelpers';
import { findAppCustomFoodByExactName, insertAppCustomFoodFromDraft } from '../../server/appCustomFoods';
import type { CustomFoodDraft } from '../../../types';
import type { MealComponent, ProductCandidate } from './schemas';
import type { MealAnalyzeAiComplete } from '../../server/persistMealUnmatchedFoods';

export type ScoredCandidate = ProductCandidate & { _score: number };

function pieceServingHint(component: MealComponent): string {
  const g = Math.round(
    component.grams_per_piece ??
      ensurePieceGramsForReview(
        pieceContextFromAnalysis(component.name, null, component.estimated_grams, component),
      ),
  );
  return `1 Stück (${g} g)`;
}

export function foodToPipelineCandidate(food: Food, component: MealComponent): ScoredCandidate {
  const serving = pieceServingHint(component);
  const displayName = capitalizeFoodDisplayName(food.name);
  return {
    rank: 1,
    score: 55,
    source_step: 'generic',
    openfoodfacts_id: null,
    product_name: displayName,
    brand: null,
    kcal_100g: food.nutrients.calories,
    protein_100g: food.nutrients.protein,
    carbs_100g: food.nutrients.carbs,
    fat_100g: food.nutrients.fat,
    fiber_100g: null,
    serving_size: serving,
    data_completeness: 'full',
    data_source: 'estimated_fallback',
    _score: 55,
  };
}

function applyComponentPortionHints(draft: CustomFoodDraft, component: MealComponent): CustomFoodDraft {
  const name = capitalizeFoodDisplayName(draft.name || component.name);
  const next: CustomFoodDraft = { ...draft, name };
  const grams = Math.max(1, Math.round(component.estimated_grams));
  const pieceG = Math.max(
    8,
    Math.round(
      component.grams_per_piece ??
        ensurePieceGramsForReview(
          pieceContextFromAnalysis(component.name, null, grams, component),
        ),
    ),
  );
  const pieceCount =
    component.estimated_piece_count != null && component.estimated_piece_count > 0
      ? component.estimated_piece_count
      : pieceQuantityFromGrams(grams, pieceG);
  const def = lookupDefaultPortion(component.name);
  const pieceLabel = def?.unit === 'scheibe' ? 'Scheibe' : 'Stück';

  return {
    ...next,
    defaultAmount: Math.max(0.25, pieceCount),
    defaultUnit: 'stk',
    gramsPerPiece: pieceG,
    servings: [
      { name: `1 ${pieceLabel}`, grams: pieceG },
      ...(draft.servings ?? []).filter((s) => !/stück|scheibe/i.test(s.name)),
    ],
  };
}

/** Bereits per KI angelegte App-Lebensmittel (Schritt 3 — Generic-Suche). */
export async function findPersistedGenericFoodCandidate(
  pool: Pool,
  component: MealComponent,
): Promise<ScoredCandidate | null> {
  const name = capitalizeFoodDisplayName(component.name);
  if (!name) return null;
  const existingApp = await findAppCustomFoodByExactName(pool, name);
  return existingApp ? foodToPipelineCandidate(existingApp, component) : null;
}

/** Schritt 4: KI-Schätzung + Persistenz in App-DB. */
export async function createGenericWithAiForComponent(
  pool: Pool,
  component: MealComponent,
  completeMealAnalysis: MealAnalyzeAiComplete,
): Promise<ScoredCandidate | null> {
  const name = component.name.trim();
  if (!name) return null;

  try {
    const prompt = buildSuggestCustomFoodDraftPrompt(name);
    const raw = await completeMealAnalysis(prompt, undefined, {
      temperature: 0.25,
      responseMode: 'json_object',
    });
    let draft = parseCustomFoodDraftFromAi(raw, name);
    draft = applyComponentPortionHints(draft, component);
    const food = await insertAppCustomFoodFromDraft(pool, draft, 'nutrition_v3_auto');
    return foodToPipelineCandidate(food, component);
  } catch (err) {
    console.warn('createGenericWithAiForComponent: skip', name, err);
    return null;
  }
}

/** @deprecated Nutze findPersisted + createGenericWithAi getrennt. */
export async function ensureGenericCandidateForComponent(
  pool: Pool,
  component: MealComponent,
  completeMealAnalysis: MealAnalyzeAiComplete,
): Promise<ScoredCandidate | null> {
  const persisted = await findPersistedGenericFoodCandidate(pool, component);
  if (persisted) return persisted;
  return createGenericWithAiForComponent(pool, component, completeMealAnalysis);
}
