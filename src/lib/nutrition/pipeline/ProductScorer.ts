import type { MealComponent } from './schemas';

export type OffSearchProduct = {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: Record<string, number | undefined>;
  serving_size?: string;
  categories_tags?: string[];
  countries_tags?: string[];
  completeness?: number;
  last_modified_t?: number;
};

const NAME_STOPWORDS = new Set([
  'mit',
  'und',
  'ohne',
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'aus',
  'auf',
  'im',
  'in',
  'am',
  'an',
  'zum',
  'zur',
  'vom',
  'von',
  'für',
  'pro',
  'the',
  'bio',
  'classic',
  'original',
  'premium',
  'light',
  'zero',
  'style',
  'typ',
  'sorte',
  'marke',
  'g',
  'ml',
  'kg',
  'stk',
  'stueck',
  'pack',
  'beutel',
  'dose',
  'glas',
  'flasche',
  'frisch',
  'fein',
  'gross',
  'grosses',
  'klein',
  'mini',
  'xxl',
]);

/** Erlaubte Kernbegriffe pro Zutat (nur diese Wörter dürfen im OFF-Produktnamen vorkommen). */
const FOOD_ALIASES: Record<string, string[]> = {
  semmel: ['semmel', 'broetchen', 'brotchen', 'weizenbroetchen', 'weizenbrotchen', 'brötchen', 'brotchen'],
  broetchen: ['broetchen', 'brotchen', 'semmel', 'weizenbroetchen', 'brötchen'],
  leberkaese: ['leberkaese', 'leberkase'],
  fleischkaese: ['fleischkaese', 'fleischkase'],
  senf: ['senf', 'mustard', 'mostard'],
  suesser_senf: ['senf', 'suesser', 'susser', 'süsser', 'sweet', 'mustard', 'mostard'],
  süsser_senf: ['senf', 'suesser', 'susser', 'süsser', 'sweet', 'mustard', 'mostard'],
};

function lower(v: string | undefined | null): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function tokenizeName(value: string): string[] {
  return lower(value)
    .replace(/[()[\]{}]/g, ' ')
    .split(/[\s,;/\-·•]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function normalizeCoreProductName(productName: string | undefined | null): string {
  const raw = String(productName ?? '').trim();
  if (!raw) return '';
  const head = raw.split(/\s[-–—·|]\s/)[0]?.trim() ?? raw;
  return lower(head);
}

function aliasKey(componentName: string, searchTerm: string): string {
  const merged = lower(`${componentName} ${searchTerm}`).replace(/[^a-z0-9]+/g, '_');
  if (FOOD_ALIASES[merged]) return merged;
  const tokens = tokenizeName(`${componentName} ${searchTerm}`);
  return tokens.join('_');
}

function allowedTokensForComponent(componentName: string, searchTerm: string): Set<string> {
  const comp = lower(componentName);
  const term = lower(searchTerm);
  const keys = new Set<string>([comp, term, aliasKey(componentName, searchTerm)]);
  for (const t of tokenizeName(componentName)) keys.add(t);
  for (const t of tokenizeName(searchTerm)) keys.add(t);

  const allowed = new Set<string>();
  for (const key of keys) {
    const list = FOOD_ALIASES[key];
    if (list) {
      for (const alias of list) allowed.add(alias);
    }
  }
  if (allowed.size === 0) {
    for (const t of tokenizeName(componentName)) {
      if (t.length >= 3) allowed.add(t);
    }
    if (term.length >= 3) allowed.add(term);
  }
  return allowed;
}

function isAllowedToken(token: string, allowed: Set<string>): boolean {
  if (allowed.has(token)) return true;
  for (const a of allowed) {
    if (a.length < 4 || token.length < 4) continue;
    if (token === a) return true;
    // DE-Komposita: Weizensemmel ↔ Semmel, Vollkornbrötchen ↔ Brötchen
    if (token.includes(a) || a.includes(token)) {
      const shorter = token.length <= a.length ? token : a;
      const longer = token.length > a.length ? token : a;
      if (longer.endsWith(shorter) || longer.startsWith(shorter)) return true;
      if (longer.includes(shorter) && shorter.length >= 5) return true;
    }
  }
  return false;
}

/**
 * Sehr streng: OFF nur wenn der Produktkern exakt zur Zutat passt — keine Fremdwörter
 * (z. B. „Hühnerschnitzel Semmel“, „Backofen-Leberkäse“).
 */
export function passesStrictOffNameMatch(
  productName: string | undefined | null,
  genericName: string | undefined | null,
  searchTerm: string,
  componentName: string,
): boolean {
  const allowed = allowedTokensForComponent(componentName, searchTerm);
  if (allowed.size === 0) return false;

  const cores = [
    normalizeCoreProductName(productName),
    normalizeCoreProductName(genericName),
  ].filter(Boolean);

  const compNorm = lower(componentName);
  const termNorm = lower(searchTerm);

  for (const core of cores) {
    if (!core) continue;
    if (core === compNorm || core === termNorm) return true;
    if ([...allowed].some((a) => core === a)) return true;

    const tokens = tokenizeName(core);
    if (tokens.length === 0) continue;

    let hasAllowedFood = false;
    for (const token of tokens) {
      if (NAME_STOPWORDS.has(token)) continue;
      if (/^\d/.test(token)) continue;
      if (isAllowedToken(token, allowed)) {
        hasAllowedFood = true;
        continue;
      }
      return false;
    }
    if (hasAllowedFood) return true;
  }

  return false;
}

function getNutriment(n: Record<string, number | undefined> | undefined, key: string): number | null {
  const v = n?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function scoreProduct(
  product: OffSearchProduct,
  searchTerm: string,
  component: MealComponent,
): number {
  const displayName = product.product_name_de || product.product_name;
  if (!passesStrictOffNameMatch(displayName, product.generic_name, searchTerm, component.name)) {
    return -1;
  }

  let score = 0;
  const nutriments = product.nutriments ?? {};
  const kcal = getNutriment(nutriments, 'energy-kcal_100g') ?? getNutriment(nutriments, 'energy-kcal');
  const protein = getNutriment(nutriments, 'proteins_100g');
  const carbs = getNutriment(nutriments, 'carbohydrates_100g');
  const fat = getNutriment(nutriments, 'fat_100g');
  const fiber = getNutriment(nutriments, 'fiber_100g');

  const hasKcal = (kcal ?? -1) > 0;
  const hasProtein = protein != null && protein >= 0;
  const hasCarbs = carbs != null && carbs >= 0;
  const hasFat = fat != null && fat >= 0;
  if (!hasKcal) return -1;

  score += 18;
  if (hasProtein) score += 4;
  if (hasCarbs) score += 4;
  if (hasFat) score += 4;
  if (fiber != null && fiber >= 0) score += 3;
  if ((product.completeness ?? 0) > 0.8) score += 10;

  const productNameLower = lower(displayName);
  const termLower = lower(searchTerm);
  const componentLower = lower(component.name);
  if (productNameLower === termLower || productNameLower === componentLower) score += 35;
  else if (productNameLower.startsWith(`${termLower} `) || productNameLower.startsWith(`${componentLower} `)) {
    score += 28;
  } else if (productNameLower.includes(termLower) || productNameLower.includes(componentLower)) score += 18;
  else score += 4;

  const countries = product.countries_tags ?? [];
  if (countries.includes('en:germany') || countries.includes('en:austria') || countries.includes('en:switzerland')) {
    score += 10;
  } else if (countries.some((c) => ['france', 'italy', 'spain', 'uk', 'netherlands'].some((e) => c.includes(e)))) {
    score += 5;
  }

  if (component.role !== 'packaged_product' && lower(product.brands).length > 0) score -= 3;
  if (product.serving_size) score += 3;

  const modified = product.last_modified_t ?? 0;
  if (modified > 0) {
    const ageMonths = (Date.now() / 1000 - modified) / (30 * 24 * 3600);
    if (ageMonths < 12) score += 2;
  }

  return score;
}
