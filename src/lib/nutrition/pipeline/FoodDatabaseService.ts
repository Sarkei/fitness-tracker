import {
  type ComponentMatch,
  type MealAnalysis,
  type MealComponent,
  type ProductCandidate,
} from './schemas';
import { capitalizeFoodDisplayName } from '../foodDisplayName';
import { lookupGenericFood } from '../catalog/genericFoodRegistry';
import { getGenericFallback } from './GenericFallbackTable';
import { foodToPipelineCandidate } from './ensurePipelineGenericFood';
import { resolveSynonyms } from './SynonymResolver';
import { OpenFoodFactsClient } from './OpenFoodFactsClient';
import { passesStrictOffNameMatch, scoreProduct, type OffSearchProduct } from './ProductScorer';

type MatchOptions = {
  chainName?: string | null;
};

type CandidateWithScore = ProductCandidate & { _score: number };
type PassKey = 'passA' | 'passB' | 'passC';
type PassStats = Record<PassKey, { queries: number; hits: number }>;

const OFF_STRICT_MODE = process.env.NUTRITION_OFF_STRICT_MODE !== '0';
const OFF_STRICT_NAME = process.env.NUTRITION_OFF_STRICT_NAME !== '0';
const OFF_MIN_SCORE = Number(process.env.NUTRITION_OFF_MIN_SCORE ?? 48);
const ALLOW_GENERIC_WITH_OFF = process.env.NUTRITION_ALLOW_GENERIC_WITH_OFF === '1';

export type FoodDatabaseHooks = {
  /** Schritt 3b: zuvor per KI angelegte App-Lebensmittel. */
  findPersistedGenericFood?: (component: MealComponent) => Promise<CandidateWithScore | null>;
  /** Schritt 4: KI erstellt neuen Generic-Eintrag (persistiert). */
  createGenericWithAi?: (component: MealComponent) => Promise<CandidateWithScore | null>;
};

function normalizeSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/\d+[.,]?\d*/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\b(mit|und|ohne|ca|circa|stück|stk|gramm|g|eine|ein|der|die|das)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAsciiVariant(term: string): string {
  return term
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function toUmlautVariant(term: string): string {
  return term
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
}

function maybeSingularize(term: string): string[] {
  const out = new Set<string>([term]);
  if (term.length > 4 && /(en|er|e|n|s)$/.test(term)) {
    out.add(term.replace(/(en|er|e|n|s)$/, ''));
  }
  return [...out].filter((t) => t.length > 1);
}

function expandCompoundTerms(term: string): string[] {
  const normalized = normalizeSearchTerm(term);
  const out = new Set<string>([term.trim(), normalized].filter(Boolean));
  out.add(toAsciiVariant(normalized));
  out.add(toUmlautVariant(normalized));

  for (const singular of maybeSingularize(normalized)) out.add(singular);

  if (/(leberk[aä]se|fleischk[aä]se).*(semmel|br[oö]tchen)|leberk[aä]sesemmel/.test(normalized)) {
    out.add('leberkäse');
    out.add('fleischkäse');
    out.add('brötchen');
    out.add('semmel');
  }
  if (/br[oö]tchen|semmel/.test(normalized)) {
    out.add('brötchen');
    out.add('semmel');
  }
  if (/s[üu]ss(er|em)? senf/.test(normalized)) {
    out.add('süßer senf');
    out.add('senf süß');
    out.add('sweet mustard');
  }
  return [...out].filter(Boolean);
}

export class FoodDatabaseService {
  constructor(
    private readonly off = new OpenFoodFactsClient(),
    private readonly hooks?: FoodDatabaseHooks,
  ) {}

  async matchComponents(analysis: MealAnalysis, options?: MatchOptions): Promise<ComponentMatch[]> {
    return Promise.all(
      analysis.components.map((component) => this.matchOne(component, options)),
    );
  }

  private async matchOne(component: MealComponent, options?: MatchOptions): Promise<ComponentMatch> {
    const candidates: CandidateWithScore[] = [];
    const executed = new Set<string>();
    const passStats: PassStats = {
      passA: { queries: 0, hits: 0 },
      passB: { queries: 0, hits: 0 },
      passC: { queries: 0, hits: 0 },
    };
    const chainPrefix = options?.chainName ? `${options.chainName} ` : '';
    const primaryTerms = component.search_strategy.primary
      .flatMap((t) => expandCompoundTerms(`${chainPrefix}${t}`.trim()))
      .filter(Boolean);
    const secondaryTerms = component.search_strategy.secondary.flatMap((t) => expandCompoundTerms(t));
    const synonymTerms = resolveSynonyms([
      ...component.search_strategy.secondary,
      ...component.search_strategy.generic_fallback,
      ...primaryTerms,
    ]).flatMap((t) => expandCompoundTerms(t));

    const passMinScore = OFF_STRICT_NAME ? OFF_MIN_SCORE : 14;
    await this.collectFromTerms(component, primaryTerms, 'primary', candidates, executed, passStats, 'passA', passMinScore);
    if (candidates.length < 2) {
      await this.collectFromTerms(component, secondaryTerms, 'secondary', candidates, executed, passStats, 'passB', passMinScore);
    }
    if (candidates.length < 2) {
      await this.collectFromTerms(component, synonymTerms, 'synonym', candidates, executed, passStats, 'passB', passMinScore);
    }
    if (candidates.length < 2 && !OFF_STRICT_NAME) {
      for (const category of component.search_strategy.openfoodfacts_categories) {
        passStats.passC.queries += 1;
        const results = await this.off.category(category, 20).catch(() => []);
        if (results.length > 0) passStats.passC.hits += 1;
        this.pushCandidates(component, results, category, 'category', candidates);
      }
      executed.add('category');
    }

    const deduped = this.dedupeCandidates(candidates);
    const offAll = deduped.filter((c) => c.data_source === 'openfoodfacts');
    const strictOffAll = offAll.filter((c) => {
      const term = String(c.match_term || component.name).trim() || component.name;
      return passesStrictOffNameMatch(
        c.product_name,
        c.generic_name ?? null,
        term,
        component.name,
      );
    });
    const usableStrictOff = strictOffAll
      .filter((c) => c._score >= OFF_MIN_SCORE)
      .sort((a, b) => b._score - a._score);
    const hasStrictOff = usableStrictOff.length > 0;

    let sortedAll: CandidateWithScore[] = [];

    // Schritt 2: OFF — nur strenge Treffer zählen als Gewinner
    if (hasStrictOff) {
      sortedAll = [...usableStrictOff];
      executed.add('step2-off-strict');
      if (ALLOW_GENERIC_WITH_OFF) {
        const genericAlt = await this.resolveGenericCatalogCandidate(component, executed);
        if (genericAlt) sortedAll.push(genericAlt);
      }
    } else {
      executed.add('step2-off-none');
      // Schritt 3: Generic-Katalog (+ zuvor KI-persistierte App-Einträge)
      const genericHit = await this.resolveGenericCatalogCandidate(component, executed);
      if (genericHit) {
        sortedAll.push(genericHit);
      } else {
        // Schritt 4: KI neu anlegen
        const aiHit = await this.hooks?.createGenericWithAi?.(component);
        if (aiHit) {
          sortedAll.push(aiHit);
          executed.add('step4-generic-ai');
        }
      }
    }

    let sorted = sortedAll.sort((a, b) => {
      if (usableStrictOff.length === 0) {
        if (a.data_source === 'estimated_fallback' && b.data_source !== 'estimated_fallback') return -1;
        if (b.data_source === 'estimated_fallback' && a.data_source !== 'estimated_fallback') return 1;
      } else if (a.data_source === 'openfoodfacts' && b.data_source !== 'openfoodfacts') {
        return -1;
      } else if (b.data_source === 'openfoodfacts' && a.data_source !== 'openfoodfacts') {
        return 1;
      }
      if (b._score !== a._score) return b._score - a._score;
      const idA = a.openfoodfacts_id ?? a.product_name;
      const idB = b.openfoodfacts_id ?? b.product_name;
      return idA.localeCompare(idB, 'de');
    });
    const topOff = sorted.find((c) => c.data_source === 'openfoodfacts');
    if (topOff && usableStrictOff.length > 0) {
      sorted = [topOff, ...sorted.filter((c) => c !== topOff)];
      executed.add('off-first');
    }
    sorted = sorted.slice(0, 3);
    const top = sorted[0];
    const second = sorted[1];
    const offCandidates = sortedAll.filter((c) => c.data_source === 'openfoodfacts');
    const topOffScore = offCandidates.length > 0 ? Math.round(offCandidates[0]._score * 10) / 10 : -1;
    const requiresUserReview =
      !top ||
      top._score < 50 ||
      (second ? Math.abs(top._score - second._score) < 10 : false) ||
      top.data_source === 'estimated_fallback';

    const reviewReasons: string[] = [];
    if (!top) reviewReasons.push('no-candidate');
    if (top && top._score < 50) reviewReasons.push('low-top-score');
    if (top && second && Math.abs(top._score - second._score) < 10) reviewReasons.push('ambiguous-top2');
    if (top && top.data_source === 'estimated_fallback') reviewReasons.push('estimated-fallback');
    if (top && top.data_source === 'estimated_fallback' && offCandidates.length > 0) {
      reviewReasons.push(
        strictOffAll.length === 0 ? 'why_generic:no-strict-name-match' : 'why_generic:off-score-too-low',
      );
    }
    if (top && top.data_source === 'estimated_fallback' && offCandidates.length === 0) {
      reviewReasons.push('why_generic:no-off-candidate');
    }
    const topOffAll = usableStrictOff[0] ?? strictOffAll[0] ?? null;
    if (topOffAll && topOffAll._score < OFF_MIN_SCORE) reviewReasons.push('rejected_off_reason:top_off_below_min');
    if (!topOffAll && offCandidates.length > 0) reviewReasons.push('rejected_off_reason:off_name_not_strict');
    if (!topOffAll && offCandidates.length === 0) reviewReasons.push('rejected_off_reason:no_off_after_passes');

    const ranked: ProductCandidate[] = sorted.map((item, index) => ({
      ...item,
      rank: (index + 1) as 1 | 2 | 3,
      score: Math.round(item._score),
    }));

    return {
      component_id: component.id,
      component_name: capitalizeFoodDisplayName(component.name),
      estimated_grams: component.estimated_grams,
      confidence: component.gram_confidence,
      search_steps_executed: [
        ...executed,
        `query_count:${passStats.passA.queries + passStats.passB.queries + passStats.passC.queries}`,
        `off_hit_rate_passA:${passStats.passA.hits}/${passStats.passA.queries}`,
        `off_hit_rate_passB:${passStats.passB.hits}/${passStats.passB.queries}`,
        `off_hit_rate_passC:${passStats.passC.hits}/${passStats.passC.queries}`,
        `off_candidates_count:${offCandidates.length}`,
        `top_off_score:${topOffScore}`,
        `winner_source:${top?.data_source ?? 'none'}`,
        `off_strict_mode:${OFF_STRICT_MODE ? '1' : '0'}`,
        `off_strict_name:${OFF_STRICT_NAME ? '1' : '0'}`,
        `strict_off_count:${usableStrictOff.length}`,
        `term_used:${normalizeSearchTerm(component.name)}`,
      ],
      candidates: ranked,
      auto_selected_rank: ranked.length ? 1 : null,
      requires_user_review: requiresUserReview,
      review_reasons: reviewReasons,
    };
  }

  /** Schritt 3: Generic-Katalog (statisch + zuvor KI-persistiert). */
  private async resolveGenericCatalogCandidate(
    component: MealComponent,
    executed: Set<string>,
  ): Promise<CandidateWithScore | null> {
    const persisted = await this.hooks?.findPersistedGenericFood?.(component);
    if (persisted) {
      executed.add('step3-generic-persisted');
      return persisted;
    }

    const catalogFood = lookupGenericFood(component.name);
    if (catalogFood) {
      executed.add('step3-generic-catalog');
      return foodToPipelineCandidate(catalogFood, component);
    }

    const nutrients =
      getGenericFallback(component.search_strategy.off_database_fallback) ??
      getGenericFallback(component.name);
    if (nutrients) {
      executed.add('step3-generic-table');
      return {
        rank: 1,
        score: 52,
        source_step: 'generic',
        openfoodfacts_id: null,
          product_name: capitalizeFoodDisplayName(component.name),
          brand: null,
          kcal_100g: nutrients.kcal_100g,
        protein_100g: nutrients.protein_100g,
        carbs_100g: nutrients.carbs_100g,
        fat_100g: nutrients.fat_100g,
        fiber_100g: nutrients.fiber_100g,
        serving_size: null,
        data_completeness: 'full',
        data_source: 'estimated_fallback',
        _score: 52,
      };
    }

    return null;
  }

  private async collectFromTerms(
    component: MealComponent,
    terms: string[],
    step: 'primary' | 'secondary' | 'synonym',
    candidates: CandidateWithScore[],
    executed: Set<string>,
    passStats: PassStats,
    pass: PassKey,
    minScore = 0,
  ): Promise<void> {
    const unique = [...new Set(terms.flatMap((t) => expandCompoundTerms(t)).map((t) => t.trim()).filter(Boolean))];
    for (const term of unique) {
      passStats[pass].queries += 1;
      const products = await this.off.search(term, 15).catch(() => []);
      if (products.length > 0) passStats[pass].hits += 1;
      this.pushCandidates(component, products, term, step, candidates, minScore);
    }
    if (unique.length > 0) executed.add(step);
  }

  private dedupeCandidates(items: CandidateWithScore[]): CandidateWithScore[] {
    const byKey = new Map<string, CandidateWithScore>();
    for (const item of items) {
      const key = `${item.openfoodfacts_id ?? 'no-id'}::${item.product_name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || item._score > existing._score) {
        byKey.set(key, item);
      }
    }
    return [...byKey.values()];
  }

  private getNutriment(n: Record<string, number | undefined> | undefined, key: string): number | null {
    const v = n?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  private pushCandidates(
    component: MealComponent,
    products: OffSearchProduct[],
    term: string,
    step: 'primary' | 'secondary' | 'synonym' | 'category',
    out: CandidateWithScore[],
    minScore = 0,
  ): void {
    for (const product of products) {
      const value = scoreProduct(product, term, component);
      if (value < Math.max(-0.1, minScore)) continue;
      const kcalRaw = this.getNutriment(product.nutriments, 'energy-kcal_100g') ?? this.getNutriment(product.nutriments, 'energy-kcal');
      const proteinRaw = this.getNutriment(product.nutriments, 'proteins_100g');
      const carbsRaw = this.getNutriment(product.nutriments, 'carbohydrates_100g');
      const fatRaw = this.getNutriment(product.nutriments, 'fat_100g');
      const fiberRaw = this.getNutriment(product.nutriments, 'fiber_100g');
      // OFF-Werte nicht mit Generic-Macros auffüllen (verfälscht Ranking / Review).
      const kcal = Number(kcalRaw ?? 0);
      if (!(kcal > 0)) continue;
      const protein = Number(proteinRaw ?? 0);
      const carbs = Number(carbsRaw ?? 0);
      const fat = Number(fatRaw ?? 0);
      const fiber = fiberRaw != null && Number.isFinite(fiberRaw) ? Number(fiberRaw) : null;
      const isPartial = proteinRaw == null || carbsRaw == null || fatRaw == null;
      out.push({
        rank: 1,
        score: value,
        source_step: step,
        openfoodfacts_id: product.code ?? null,
        product_name: product.product_name_de || product.product_name || product.generic_name || component.name,
        brand: product.brands ?? null,
        generic_name: product.generic_name ?? null,
        match_term: term,
        kcal_100g: kcal,
        protein_100g: protein,
        carbs_100g: carbs,
        fat_100g: fat,
        fiber_100g: fiber,
        serving_size: product.serving_size ?? null,
        data_completeness: isPartial ? 'partial' : 'full',
        data_source: 'openfoodfacts',
        _score: value,
      });
    }
  }
}
