import { getGenericFallback, resolveGenericTableKey } from '../src/lib/nutrition/pipeline/GenericFallbackTable';
import { genericFoodIdFromSlug, genericSlugFromTableKey, lookupGenericFood } from '../src/lib/nutrition/catalog/genericFoodRegistry';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const cases: Array<{ input: string; tableKey: string; slug: string }> = [
  { input: 'Paprika', tableKey: 'paprika_generic', slug: 'paprika' },
  { input: 'Tomate', tableKey: 'tomato_fresh_generic', slug: 'tomato_fresh' },
  { input: 'Zwiebeln', tableKey: 'onion_raw_generic', slug: 'onion_raw' },
  { input: 'Hähnchen', tableKey: 'chicken_breast_grilled_generic', slug: 'chicken_breast_grilled' },
  { input: 'Kartoffeln', tableKey: 'potato_boiled_generic', slug: 'potato_boiled' },
  { input: 'Feta', tableKey: 'feta_generic', slug: 'feta' },
];

for (const c of cases) {
  const key = resolveGenericTableKey(c.input);
  assert(key === c.tableKey, `${c.input}: expected ${c.tableKey}, got ${key}`);
  assert(genericSlugFromTableKey(key!) === c.slug, `${c.input}: slug`);
  const food = lookupGenericFood(c.input);
  assert(food?.id === genericFoodIdFromSlug(c.slug), `${c.input}: food id`);
  const nutrients = getGenericFallback(c.input);
  assert(nutrients != null && nutrients.kcal_100g > 0, `${c.input}: missing nutrients`);
}

console.log('nutrition-generic-fallback-selftest: OK');
