import type { Pool } from 'pg';
import type { Food } from '../../foodDatabase';
import { fetchOffCatalogFoods } from '../../openFoodFactsFetch';
import { searchAppCustomFoods, getAppCustomFoodById } from '../../server/appCustomFoods';
import type { MealComponent } from '../schemas';
import type { ResolvedFoodLine, PortionOption } from '../schemas';
import { rankFoodCandidates, pickAutoMatch, pickMediumMatch } from '../matchRanker';
import { buildPortionOptions, pickDefaultPortion, pickPortionForText, toGrams } from '../portionCatalog';
import { macrosForGrams } from '../macroCalculator';
import { searchGenericBaselines, getGenericBaselineById } from './genericBaselineResolver';
import { getAppCustomFoodByBarcode } from './appCustomFoodsBarcode';
import {
  matchUncertaintyFromScore,
  requiresCandidatePick,
} from '../matchThresholds';
import { rerankCandidatesWithAi, applyUserFoodBoost } from '../matchRerankAi';
import {
  getUserPortionPrefsForFoods,
  type UserPortionPref,
} from '../userFoodPortionPrefs';
import { normalizeFoodHint } from '../foodSynonyms.de';
import { isCondimentLikePourFood } from '../../portionUtils';

const PIECE_REF_RE = /\b(stk|stück|stueck|semmel|brötchen|broetchen)\b/i;

function applyGramGuardrails(food: Food, component: MealComponent, grams: number): number {
  const explicit = component.quantity?.explicit === true;
  let clamped = Math.max(1, Math.round(grams));
  const hardCap = explicit ? 5000 : 2000;
  clamped = Math.min(clamped, hardCap);
  if (isCondimentLikePourFood(food)) {
    // Ungewürzte Defaults für Senf/Ketchup/etc. sollten nicht als 100g+ eskalieren.
    clamped = Math.min(clamped, explicit ? 80 : 25);
  }
  return clamped;
}

export async function resolveCatalogFoodByIdAny(
  pool: Pool,
  foodId: string,
): Promise<Food | null> {
  if (foodId.startsWith('off_')) {
    const code = foodId.slice(4).replace(/\D/g, '');
    if (!code) return null;
    const { fetchOpenFoodFactsByBarcode } = await import('../../openFoodFactsFetch');
    return fetchOpenFoodFactsByBarcode(code).catch(() => null);
  }
  if (foodId.startsWith('generic_')) return getGenericBaselineById(foodId);
  if (foodId.startsWith('ucf_')) return getAppCustomFoodById(pool, foodId);
  return null;
}

function lineFromFood(
  food: Food,
  component: MealComponent,
  matchScore: number,
  matchReason: string,
  source: ResolvedFoodLine['source'],
  candidates?: ResolvedFoodLine['candidates'],
  userPref?: UserPortionPref | null,
  extra?: Partial<ResolvedFoodLine> & { expertMode?: boolean },
): ResolvedFoodLine {
  const { expertMode, ...lineExtra } = extra ?? {};
  const opts = buildPortionOptions(food, userPref);
  let portion: PortionOption = pickDefaultPortion(food, userPref);
  const explicitQuantity = component.quantity?.explicit === true
    ? component.quantity.value * (component.quantity.multiplier ?? 1)
    : null;

  const pieceOption = opts.find((o) => o.logUnit === 'stk');
  const hasPieceReference =
    component.quantity?.unit === 'stk' ||
    PIECE_REF_RE.test(`${component.foodHint ?? ''} ${component.rawText ?? ''}`);
  if (pieceOption && hasPieceReference && explicitQuantity != null) {
    portion = { ...pieceOption, quantity: explicitQuantity };
  }

  if (component.quantity?.explicit) {
    const picked = pickPortionForText(
      food,
      component.quantity.unit,
      component.quantity.value * (component.quantity.multiplier ?? 1),
    );
    if (picked) portion = picked;
    else if (component.quantity.unit === 'g' || component.quantity.unit === 'ml') {
      portion = {
        id: 'explicit',
        label: `${component.quantity.value} ${component.quantity.unit}`,
        logUnit: component.quantity.unit,
        quantity: component.quantity.value,
        grams: component.quantity.value,
        source: 'generic_default',
      };
    }
  }
  const grams = applyGramGuardrails(food, component, toGrams(portion));
  const per100g = {
    kcal: food.nutrients.calories,
    protein: food.nutrients.protein,
    carbs: food.nutrients.carbs,
    fat: food.nutrients.fat,
  };
  const uncertainty = matchUncertaintyFromScore(matchScore, expertMode === true);
  return {
    foodId: food.id,
    source,
    displayName: food.name,
    grams,
    portionOptions: opts,
    selectedPortionId: portion.id,
    logUnit: portion.logUnit,
    quantity: portion.quantity,
    per100g,
    matchScore,
    matchReason,
    matchUncertainty: uncertainty,
    requiresCandidatePick: requiresCandidatePick(matchScore, (candidates?.length ?? 0) > 0),
    dataQuality: {
      complete: per100g.kcal > 0,
      flags: per100g.kcal <= 0 ? ['missing_energy'] : [],
    },
    nutrientSource: 'database',
    candidates,
    ...lineExtra,
  };
}

function foodSource(food: Food): ResolvedFoodLine['source'] {
  if (food.id.startsWith('generic_')) return 'generic_baseline';
  if (food.catalogSource === 'app') return 'app';
  return 'openfoodfacts';
}

function toCandidates(ranked: ReturnType<typeof rankFoodCandidates>): ResolvedFoodLine['candidates'] {
  return ranked.map((r) => ({
    foodId: r.food.id,
    displayName: r.food.name,
    matchScore: r.score,
    source: r.food.id.startsWith('generic_')
      ? 'generic_baseline'
      : r.food.catalogSource === 'app'
        ? 'app'
        : 'openfoodfacts',
  }));
}

export async function resolveMealComponent(
  pool: Pool,
  component: MealComponent,
  opts?: {
    userId?: number;
    portionPrefs?: Map<string, UserPortionPref>;
    choiceBoosts?: Map<string, number>;
    expertMode?: boolean;
  },
): Promise<ResolvedFoodLine> {
  const expertMode = opts?.expertMode === true;
  const hint = component.foodHint || component.rawText;
  const normalizedHint = normalizeFoodHint(hint);

  const { foods: offFoods } = await fetchOffCatalogFoods(hint, 12).catch(() => ({ foods: [] as Food[] }));
  const appFoods = await searchAppCustomFoods(pool, hint, 8);
  const genericFoods = searchGenericBaselines(hint, 8);
  const poolAll = [...offFoods, ...appFoods, ...genericFoods];

  let ranked = rankFoodCandidates(hint, poolAll, 8);
  if (opts?.choiceBoosts && opts.choiceBoosts.size > 0) {
    ranked = applyUserFoodBoost(ranked, opts.choiceBoosts);
  }

  const topScore = ranked[0]?.score ?? 0;
  if (topScore < 0.85 && ranked.length >= 2) {
    const aiPick = await rerankCandidatesWithAi(normalizedHint, ranked);
    if (aiPick) {
      ranked = [aiPick, ...ranked.filter((r) => r.food.id !== aiPick.food.id)];
    }
  }

  const candidates = toCandidates(ranked);
  const auto = pickAutoMatch(ranked, expertMode);
  const medium = !expertMode ? pickMediumMatch(ranked) : null;

  const pickFood = auto?.food ?? medium?.food;
  const pickScore = auto?.score ?? medium?.score ?? 0;
  const pickReason = auto?.reason ?? medium?.reason ?? 'needs_pick';

  if (pickFood && pickScore >= 0.7) {
    const pref = opts?.portionPrefs?.get(pickFood.id) ?? null;
    return lineFromFood(pickFood, component, pickScore, pickReason, foodSource(pickFood), candidates, pref, {
      expertMode,
    });
  }

  if (ranked[0] && ranked[0].score > 0 && ranked[0].score < 0.7) {
    const top = ranked[0].food;
    const pref = opts?.portionPrefs?.get(top.id) ?? null;
    return lineFromFood(top, component, ranked[0].score, 'needs_pick', foodSource(top), candidates, pref, {
      requiresCandidatePick: true,
      matchUncertainty: 'blocked',
      expertMode,
    });
  }

  const fallback = genericFoods[0] ?? appFoods[0];
  if (fallback) {
    const pref = opts?.portionPrefs?.get(fallback.id) ?? null;
    return lineFromFood(
      fallback,
      component,
      ranked[0]?.score ?? 0.35,
      'fallback',
      foodSource(fallback),
      candidates,
      pref,
      {
        requiresCandidatePick: true,
        matchUncertainty: 'blocked',
        expertMode,
      },
    );
  }

  const stub: Food = {
    id: 'generic_unknown',
    name: hint,
    category: 'readymeal',
    nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    servings: [{ name: '100 g', grams: 100 }],
    catalogSource: 'app',
  };
  return lineFromFood(stub, component, 0, 'unresolved', 'generic_baseline', candidates, null, {
    requiresCandidatePick: true,
    matchUncertainty: 'blocked',
    expertMode,
  });
}

export async function resolveBarcode(
  pool: Pool,
  barcode: string,
): Promise<{ food: Food; source: string } | null> {
  const ucf = await getAppCustomFoodByBarcode(pool, barcode);
  if (ucf) return { food: ucf, source: 'app' };
  const { fetchOpenFoodFactsByBarcode } = await import('../../openFoodFactsFetch');
  const off = await fetchOpenFoodFactsByBarcode(barcode);
  if (off) return { food: off, source: 'openfoodfacts' };
  return null;
}

export function resolvedLineToIngredient(line: ResolvedFoodLine) {
  const m = macrosForGrams(
    {
      id: line.foodId,
      name: line.displayName,
      category: 'readymeal',
      nutrients: {
        calories: line.per100g.kcal,
        protein: line.per100g.protein,
        carbs: line.per100g.carbs,
        fat: line.per100g.fat,
      },
      servings: [],
    },
    line.grams,
  );
  return {
    name: line.displayName,
    amount: line.quantity,
    unit: line.logUnit,
    calories: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    foodId: line.foodId,
    id: line.foodId,
    matchScore: line.matchScore,
    matchSource: line.source,
    nutrientSource: 'database' as const,
  };
}
