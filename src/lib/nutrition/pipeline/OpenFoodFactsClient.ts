import { fetchOffCatalogFoods } from '../../openFoodFactsFetch';
import type { Food } from '../../foodDatabase';
import { normalizeOffSearchQuery } from '../../openFoodFacts';
import type { OffSearchProduct } from './ProductScorer';

type CategoryResponse = { products?: OffSearchProduct[] };

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
  'categories_tags',
  'countries_tags',
  'completeness',
  'last_modified_t',
].join(',');

function foodToOffSearchProduct(food: Food, _searchTerm: string): OffSearchProduct {
  const code = food.id.replace(/^off_/, '');
  const serving = food.servings[0];
  const display = food.name;
  const brand = food.brand ? String(food.brand).trim() : undefined;
  // Display-Name ohne Brand-Suffix, falls mapOpenFoodFacts* Brand angehängt hat
  let productName = display;
  if (brand && display.toLowerCase().endsWith(brand.toLowerCase())) {
    productName = display.slice(0, display.length - brand.length).replace(/[·|,]\s*$/, '').trim() || display;
  }
  return {
    code: code || undefined,
    product_name: productName,
    product_name_de: productName,
    generic_name: undefined,
    brands: brand,
    nutriments: {
      'energy-kcal_100g': food.nutrients.calories,
      proteins_100g: food.nutrients.protein,
      carbohydrates_100g: food.nutrients.carbs,
      fat_100g: food.nutrients.fat,
      ...(food.nutrients.fiber != null ? { fiber_100g: food.nutrients.fiber } : {}),
    },
    serving_size: serving ? `${Math.round(serving.grams)} g` : undefined,
    countries_tags: ['en:germany'],
    completeness: 0.85,
  };
}

/**
 * V3-OFF-Suche = dieselbe Pipeline wie „Lebensmittel suchen“ (search-a-licious + API v2),
 * inkl. Umlaut-Normalisierung (Leberkäse → Leberkaese).
 */
export class OpenFoodFactsClient {
  private searchCache = new Map<string, OffSearchProduct[]>();

  async search(term: string, pageSize = 15): Promise<OffSearchProduct[]> {
    const key = `${normalizeOffSearchQuery(term)}::${pageSize}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;

    const { foods, rawHitCount } = await fetchOffCatalogFoods(term.trim(), pageSize);
    if (foods.length === 0 && rawHitCount > 0) {
      console.warn('[nutrition-v3] OFF hits could not be mapped', { term, rawHitCount });
    }
    const products = foods.map((f) => foodToOffSearchProduct(f, term));
    this.searchCache.set(key, products);
    return products;
  }

  async category(category: string, pageSize = 20): Promise<OffSearchProduct[]> {
    const key = `category:${category.toLowerCase().trim()}::${pageSize}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({ fields: FIELDS, page_size: String(pageSize) });
    const url = `https://world.openfoodfacts.org/category/${encodeURIComponent(category)}/1.json?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'VRTX-FitnessTracker/1.0' },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as CategoryResponse;
    const products = data.products ?? [];
    this.searchCache.set(key, products);
    return products;
  }
}
