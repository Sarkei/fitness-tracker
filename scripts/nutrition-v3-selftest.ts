import assert from 'node:assert/strict';
import { calculateNutrition, sumNutrition } from '../src/lib/nutrition/pipeline/NutritionCalculator';
import { validateSanity } from '../src/lib/nutrition/pipeline/SanityValidator';
import type { ComponentMatch, MealAnalysis } from '../src/lib/nutrition/pipeline/schemas';
import { getGenericFallback } from '../src/lib/nutrition/pipeline/GenericFallbackTable';

type Case = {
  id: string;
  meal: string;
  category: string;
  expectedMin: number;
  expectedMax: number;
  components: Array<{ name: string; grams: number; fallback: string }>;
};

const CASES: Case[] = [
  { id: '1-oats', meal: '100g Haferflocken', category: 'breakfast', expectedMin: 350, expectedMax: 450, components: [{ name: 'Haferflocken', grams: 100, fallback: 'oats_dry_generic' }] },
  { id: '2-doener', meal: 'ein Döner Kebab', category: 'street_food', expectedMin: 500, expectedMax: 1100, components: [
    { name: 'Dönerbrot', grams: 160, fallback: 'white_bread_generic' },
    { name: 'Hähnchen', grams: 130, fallback: 'chicken_breast_grilled_generic' },
    { name: 'Salat', grams: 35, fallback: 'lettuce_generic' },
    { name: 'Tomate', grams: 50, fallback: 'tomato_fresh_generic' },
    { name: 'Zwiebel', grams: 20, fallback: 'onion_raw_generic' },
    { name: 'Sauce', grams: 40, fallback: 'tzatziki_generic' },
  ] },
  { id: '3-bigmac-menu', meal: 'Big Mac Menü mit Pommes und Cola', category: 'street_food', expectedMin: 800, expectedMax: 1600, components: [
    { name: 'Big Mac', grams: 220, fallback: 'big_mac_style_generic' },
    { name: 'Pommes', grams: 150, fallback: 'potato_fries_generic' },
    { name: 'Cola', grams: 400, fallback: 'cola_generic' },
  ] },
  { id: '4-ruehrei', meal: 'Rührei mit 3 Eiern, Speck und Buttertoast', category: 'breakfast', expectedMin: 500, expectedMax: 1200, components: [
    { name: 'Ei', grams: 180, fallback: 'egg_whole_generic' },
    { name: 'Speck', grams: 50, fallback: 'bacon_generic' },
    { name: 'Toast', grams: 80, fallback: 'white_bread_generic' },
    { name: 'Butter', grams: 10, fallback: 'butter_generic' },
  ] },
  { id: '5-proteinshake', meal: 'Proteinshake: 30g Whey, 300ml Vollmilch, 1 Banane', category: 'drink_cold', expectedMin: 300, expectedMax: 600, components: [
    { name: 'Whey', grams: 30, fallback: 'whey_powder_generic' },
    { name: 'Vollmilch', grams: 300, fallback: 'whole_milk_generic' },
    { name: 'Banane', grams: 120, fallback: 'banana_generic' },
  ] },
  { id: '6-vague-schnitzel', meal: 'Ich hab mittags irgendwas gegessen, Schnitzel oder so', category: 'lunch', expectedMin: 350, expectedMax: 1200, components: [
    { name: 'Schnitzel', grams: 220, fallback: 'schnitzel_breaded_generic' },
    { name: 'Beilage', grams: 150, fallback: 'potato_boiled_generic' },
  ] },
  { id: '7-salad-photo', meal: 'photo mixed salad bowl', category: 'lunch', expectedMin: 150, expectedMax: 700, components: [
    { name: 'Salat', grams: 120, fallback: 'lettuce_generic' },
    { name: 'Tomate', grams: 80, fallback: 'tomato_fresh_generic' },
    { name: 'Gurke', grams: 80, fallback: 'cucumber_generic' },
    { name: 'Olivenöl', grams: 15, fallback: 'olive_oil_generic' },
  ] },
  { id: '8-fruchtzwerg', meal: 'Müller Fruchtzwerg Erdbeer', category: 'snack', expectedMin: 25, expectedMax: 250, components: [
    { name: 'Fruchtzwerg', grams: 50, fallback: 'yogurt_plain_generic' },
  ] },
];

function buildAnalysis(c: Case): MealAnalysis {
  return {
    input_type: c.id === '7-salad-photo' ? 'image' : 'text',
    input_language: 'de',
    meal_name: c.meal,
    meal_category: c.category,
    cuisine: null,
    total_estimated_weight_g: c.components.reduce((s, x) => s + x.grams, 0),
    portion_context: 'selftest',
    confidence_overall: 'medium',
    is_chain_restaurant: c.id === '3-bigmac-menu',
    chain_name: c.id === '3-bigmac-menu' ? "McDonald's" : null,
    components: c.components.map((x, i) => ({
      id: `c${i + 1}`,
      name: x.name,
      role: 'component',
      estimated_grams: x.grams,
      gram_confidence: 'medium',
      gram_reasoning: 'selftest',
      is_cooked: false,
      cooking_method: null,
      search_strategy: {
        primary: [x.name],
        secondary: [],
        generic_fallback: [x.name],
        off_database_fallback: x.fallback,
        openfoodfacts_categories: [],
        barcode_hint: null,
      },
    })),
    notes: null,
    image_analysis: c.id === '7-salad-photo' ? { visible_items: ['salad bowl'], container_estimate: 'medium bowl', uncertainty_factors: ['angle'] } : null,
  };
}

function buildMatch(analysis: MealAnalysis): ComponentMatch[] {
  return analysis.components.map((component) => {
    const fb = getGenericFallback(component.search_strategy.off_database_fallback);
    assert.ok(fb, `fallback exists for ${component.name}`);
    return {
      component_id: component.id,
      component_name: component.name,
      estimated_grams: component.estimated_grams,
      confidence: component.gram_confidence,
      search_steps_executed: ['generic'],
      candidates: [
        {
          rank: 1,
          score: 35,
          source_step: 'generic',
          openfoodfacts_id: null,
          product_name: component.name,
          brand: null,
          kcal_100g: fb!.kcal_100g,
          protein_100g: fb!.protein_100g,
          carbs_100g: fb!.carbs_100g,
          fat_100g: fb!.fat_100g,
          fiber_100g: fb!.fiber_100g,
          serving_size: null,
          data_completeness: 'full',
          data_source: 'estimated_fallback',
        },
      ],
      auto_selected_rank: 1,
      requires_user_review: true,
      review_reasons: ['estimated-fallback'],
    };
  });
}

for (const c of CASES) {
  const analysis = buildAnalysis(c);
  const matches = buildMatch(analysis);
  const components = matches.map((m) => calculateNutrition(m)).filter(Boolean);
  const totals = sumNutrition(components as any);
  assert.ok(totals.kcal >= c.expectedMin, `${c.id} kcal too low: ${totals.kcal}`);
  assert.ok(totals.kcal <= c.expectedMax, `${c.id} kcal too high: ${totals.kcal}`);
  const warnings = validateSanity(analysis, totals.kcal);
  if (c.id === '2-doener') {
    assert.equal(warnings.length, 0, `${c.id} should stay in range`);
  }
}

console.log(`nutrition-v3-selftest: OK (${CASES.length} cases)`);
