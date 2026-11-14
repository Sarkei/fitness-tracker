import assert from 'node:assert/strict';
import { FoodDatabaseService } from '../src/lib/nutrition/pipeline/FoodDatabaseService';
import { passesStrictOffNameMatch } from '../src/lib/nutrition/pipeline/ProductScorer';
import type { MealAnalysis } from '../src/lib/nutrition/pipeline/schemas';
import type { OffSearchProduct } from '../src/lib/nutrition/pipeline/ProductScorer';

class MockOffClient {
  constructor(
    private readonly searchMap: Record<string, OffSearchProduct[]>,
    private readonly categoryMap: Record<string, OffSearchProduct[]>,
  ) {}

  async search(term: string): Promise<OffSearchProduct[]> {
    return this.searchMap[term] ?? [];
  }

  async category(category: string): Promise<OffSearchProduct[]> {
    return this.categoryMap[category] ?? [];
  }
}

function product(overrides: Partial<OffSearchProduct> = {}): OffSearchProduct {
  return {
    code: '123',
    product_name: 'Default Product',
    generic_name: 'Default',
    brands: '',
    nutriments: {
      'energy-kcal_100g': 250,
      proteins_100g: 10,
      carbohydrates_100g: 20,
      fat_100g: 11,
      fiber_100g: 2,
    },
    serving_size: '100 g',
    countries_tags: ['en:germany'],
    categories_tags: ['en:breads'],
    completeness: 0.9,
    last_modified_t: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function baseAnalysis(): MealAnalysis {
  return {
    input_type: 'text',
    input_language: 'de',
    meal_name: 'Test',
    meal_category: 'lunch',
    cuisine: null,
    total_estimated_weight_g: 200,
    portion_context: null,
    confidence_overall: 'medium',
    is_chain_restaurant: false,
    chain_name: null,
    notes: null,
    image_analysis: null,
    components: [
      {
        id: 'c1',
        name: 'Fladenbrot',
        role: 'base',
        estimated_grams: 100,
        gram_confidence: 'medium',
        gram_reasoning: 'test',
        is_cooked: true,
        cooking_method: 'baked',
        search_strategy: {
          primary: ['Fladenbrot'],
          secondary: ['Pitabrot'],
          generic_fallback: ['Weißbrot'],
          off_database_fallback: 'white_bread_generic',
          openfoodfacts_categories: ['breads'],
          barcode_hint: null,
        },
      },
    ],
  };
}

async function run() {
  assert.equal(
    passesStrictOffNameMatch('Hühnerschnitzel Semmel - Billa', null, 'Semmel', 'Semmel'),
    false,
  );
  assert.equal(passesStrictOffNameMatch('Semmel', null, 'Semmel', 'Semmel'), true);
  assert.equal(passesStrictOffNameMatch('Weizensemmel', null, 'Semmel', 'Semmel'), true);
  assert.equal(
    passesStrictOffNameMatch('Backofen-Leberkäse Käse - Aibler', null, 'Leberkäse', 'Leberkäse'),
    false,
  );
  assert.equal(passesStrictOffNameMatch('Leberkäse', null, 'Leberkäse', 'Leberkäse'), true);
  assert.equal(
    passesStrictOffNameMatch('Senf - Thomy', null, 'Süßer Senf', 'Süßer Senf'),
    true,
  );

  {
    const service = new FoodDatabaseService(
      new MockOffClient({ Fladenbrot: [product({ product_name: 'Fladenbrot', code: '111' })] }, {}) as any,
    );
    const matches = await service.matchComponents(baseAnalysis());
    assert.equal(matches.length, 1);
    assert.equal(matches[0].candidates[0].openfoodfacts_id, '111');
    assert.ok(matches[0].search_steps_executed.includes('primary'));
  }

  {
    const service = new FoodDatabaseService(
      new MockOffClient(
        {
          Fladenbrot: [product({ product_name: 'Hühnerschnitzel Semmel', code: 'bad' })],
          Semmel: [],
        },
        {},
      ) as any,
    );
    const analysis = baseAnalysis();
    analysis.components[0].name = 'Semmel';
    analysis.components[0].search_strategy.primary = ['Semmel'];
    const matches = await service.matchComponents(analysis);
    assert.equal(matches[0].candidates[0].data_source, 'estimated_fallback');
    assert.ok(matches[0].review_reasons.some((r) => r.includes('strict') || r.includes('generic')));
  }

  {
    const service = new FoodDatabaseService(
      new MockOffClient(
        {
          Fladenbrot: [],
          Pitabrot: [product({ product_name: 'Pitabrot', code: '222' })],
        },
        {},
      ) as any,
    );
    const matches = await service.matchComponents(baseAnalysis());
    // Secondary-Term „Pitabrot“ darf als Fladenbrot-Ersatz zählen
    assert.equal(matches[0].candidates[0].openfoodfacts_id, '222');
    assert.equal(matches[0].candidates[0].data_source, 'openfoodfacts');
  }

  {
    const service = new FoodDatabaseService(
      new MockOffClient(
        {
          Semmel: [product({ product_name: 'Weizensemmel', brands: 'REWE', code: '333' })],
        },
        {},
      ) as any,
    );
    const analysis = baseAnalysis();
    analysis.components[0].name = 'Semmel';
    analysis.components[0].search_strategy.primary = ['Semmel'];
    const matches = await service.matchComponents(analysis);
    assert.equal(matches[0].candidates[0].openfoodfacts_id, '333');
    assert.equal(matches[0].candidates[0].data_source, 'openfoodfacts');
  }

  {
    const service = new FoodDatabaseService(
      new MockOffClient({ Fladenbrot: [], Pitabrot: [], Weißbrot: [] }, { breads: [] }) as any,
    );
    const matches = await service.matchComponents(baseAnalysis());
    assert.equal(matches[0].candidates[0].data_source, 'estimated_fallback');
    assert.equal(matches[0].requires_user_review, true);
    assert.ok(matches[0].review_reasons.includes('estimated-fallback'));
  }

  {
    const service = new FoodDatabaseService(
      new MockOffClient(
        {
          "McDonald's Fladenbrot": [product({ product_name: "McDonald's Fladenbrot", code: '444' })],
        },
        {},
      ) as any,
    );
    const analysis = baseAnalysis();
    analysis.is_chain_restaurant = true;
    analysis.chain_name = "McDonald's";
    const matches = await service.matchComponents(analysis, { chainName: analysis.chain_name });
    assert.equal(matches[0].candidates[0].openfoodfacts_id, '444');
  }

  console.log('nutrition-v3-off-integration-selftest: OK');
}

void run();
