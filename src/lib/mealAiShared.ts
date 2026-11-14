/**
 * Shared meal analysis helpers (food DB matching). Used by the API route bundled into server.js.
 */

import type { Food } from './foodDatabase';
import {
  inferDefaultLogPortionForFood,
  inferDoseGramsFromFood,
  inferFlascheGramsFromFood,
  inferGlasMlFromFood,
  inferPortionGramsFromFood,
  inferScheibeGramsFromFood,
  inferStueckGramsFromFood,
} from './portionUtils';
import {
  normalizeAiParsedFoodPortion,
  typicalGramsPerPieceFromProductName,
  isLikelyWholePieceSmokedOrCookedSausageName,
  estimateTypicalMealGramsForPhrase,
} from './portionHeuristics';
import type { CustomFoodDraft, Ingredient, ProposedDbFood } from '../types';

export const FOOD_CATEGORY_LIST = [
  'protein',
  'carbs',
  'fat',
  'fruit',
  'vegetable',
  'dairy',
  'sauce',
  'snack',
  'drink',
  'canned',
  'frozen',
  'fastfood',
  'readymeal',
  'bakery',
  'sweets',
  'spice',
  'breakfast',
] as const;

/** KI: konkrete Alltags-Portionen als Anker (reduziert unsinnige Mengen). */
const MEAL_AI_PORTION_ANCHOR_GUIDE_DE = `Orientierung pro **einer** Log-Zeile / einer üblichen Einzelportion: kleines Brötchen/Semmel 50–90 g; Scheibe Aufschnitt/Wurst/Käse 25–45 g; eine Bratwurst/„Würstchen“ als Stück typ. 50–120 g (oder **g** statt gebrochener „stk“); Hähnchenflügel / Chicken Wings als Hauptgericht 150–250 g (nicht Scheiben-Größe); Kroketten als Beilage 120–200 g; Apfel 130–200 g, Banane ~120 g; gekochte Pasta/Nudeln als Hauptgericht 180–320 g fertig; Reis gekocht ~150–250 g; Pommes klein ~120–200 g, größere Portion ~220–320 g; Salat-Beilage ohne Dressing oft 80–180 g; Joghurt-Becher 150–200 g; Milch/Kaffee klein 200 ml, groß 300–500 ml, Softdrink-Dose ~330 ml. Soßen, Senf, Ketchup, Dressing am Sandwich meist 5–25 g — nicht 100+ g, außer der Nutzer sagt „extra viel“. Wenn der Nutzer **keine** Menge nennt: wähle die **Mitte** dieser Spannen, nicht reflexhaft immer 100 g, 25 g oder 1 stk. Bei „X mit Y“ (z. B. Wings mit Kroketten): **zwei** ingredients-Zeilen mit je eigener realistischer Portion.`;

/** Vor Ranking/KI: Freitext technisch normalisieren (Zeilenumbrüche, Mehrfachspaces). */
export function normalizeGermanMealInputForRanking(raw: string): string {
  return raw.trim().replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ');
}

/** Kurze, deterministische Mengen-Hinweise an das Modell (müssen nicht alle Muster fangen). */
export function buildMealQuantityHintsForPrompt(userText: string): string {
  const t = userText.replace(/\r?\n/g, ' ').trim();
  if (!t) return '';
  const lines: string[] = [];
  const seen = new Set<string>();
  const re =
    /\b(\d+(?:[.,]\d+)?)\s*(scheiben?|stück(?:e)?|stk\.?|x)\s+([^,;]+?)(?=\s+(?:und|plus|dazu|daneben|,)|\s*$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const n = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    const w = m[2].toLowerCase();
    const rest = m[3].trim().replace(/\s+/g, ' ').slice(0, 90);
    if (!rest) continue;
    const key = `${n}|${w}|${rest.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (/^scheib/.test(w)) {
      const lo = Math.round(n * 25);
      const hi = Math.round(n * 45);
      lines.push(
        `- „${rest}“: ${n} Scheibe(n) → eine ingredients-Zeile, **unit \"g\"**, **amount** typ. ${lo}–${hi} (Mitte ok, nicht stk).`,
      );
    } else {
      lines.push(
        `- „${rest}“: ${n} ${m[2].trim()} → bei ganzer Brühwurst **stk** (ganzzahlig), sonst **g**; keine Grammzahl bei stk.`,
      );
    }
  }
  if (lines.length === 0) return '';
  return `STRUKTURIERTE_HINWEISE (Leitpfähle — Nutzertext hat Vorrang):\n${lines.join('\n')}`;
}

export function coerceFoodCategory(raw: string | undefined): Food['category'] {
  const s = (raw || '').trim().toLowerCase();
  return (FOOD_CATEGORY_LIST as readonly string[]).includes(s) ? (s as Food['category']) : 'readymeal';
}

const RESEARCH_DISCLAIMER_DE =
  'Unverifizierte Modellschätzung; keine externe Nährwert-API in dieser App angebunden.';

/** Open Food Facts-Produkt (Server/Client-Katalog). */
export function isOpenFoodFactsFood(food: Food | { id?: string | null }): boolean {
  const id = food.id != null ? String(food.id).trim() : '';
  return id.startsWith('off_');
}

/** OFF oder App-Lebensmittel-Datenbank (`ucf_*`). */
export function isAppCatalogFood(food: Food | { id?: string | null }): boolean {
  const id = food.id != null ? String(food.id).trim() : '';
  return id.startsWith('off_') || id.startsWith('ucf_');
}

/** Nur Katalog-Zutaten (OFF + App-DB) behalten — keine KI-Schätzungen / synthetische est_*-Zeilen. */
export function filterOffOnlyIngredients(ingredients: Ingredient[], pool: Food[] = []): Ingredient[] {
  return ingredients.filter(ing => {
    const id = ing.id != null ? String(ing.id).trim() : '';
    if (id.startsWith('est_') || id.startsWith('proposal_') || id.startsWith('ucf_preview_')) {
      return false;
    }
    if (ing.nutrientSource === 'model_estimate') return false;
    if (isAppCatalogFood({ id })) return true;
    const food =
      (id ? pool.find(f => f.id === id) : null) ?? matchFoodExactFromPool(ing.name, pool);
    return food != null && isAppCatalogFood(food);
  });
}

/** Dedup-Katalog (typisch Open-Food-Facts-Treffer). Keine Statik-DB, keine Postgres-Kombis. */
export function mergeCatalogFoodPool(catalogFoods: Food[] = []): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of catalogFoods) {
    const k = normalizeName(f.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

export interface ParsedFoodItem {
  name: string;
  amount: number;
  unit: string;
}

/** True if unit should be treated as count/pieces (KI-Zerlegen-Normalisierung). */
function isParsedStkUnit(unit: string): boolean {
  const u = (unit || '').trim().toLowerCase();
  if (!u) return false;
  if (u.includes('stk') || u.includes('stück') || u.includes('stuck')) return true;
  if (u === 'piece' || u === 'pcs' || u === 'pc' || u === 'x') return true;
  return false;
}

/**
 * Nach Zerlegen-Parse: gebrochene „stk“-Mengen auf ganze Zahlen ≥ 1 begrenzen (Modell hält Prompt-Regeln nicht immer ein).
 */
export function normalizeDecomposedStkAmounts(items: ParsedFoodItem[]): ParsedFoodItem[] {
  return items.map(row => {
    if (!isParsedStkUnit(row.unit)) return row;
    const amt = row.amount;
    if (!Number.isFinite(amt)) return { ...row, amount: 1 };
    if (Number.isInteger(amt) && amt >= 1) return row;
    const rounded = Math.max(1, Math.round(amt));
    return { ...row, amount: rounded };
  });
}

/** Deutsche Stopwords für einfache Token-Gewichtung */
const STOPWORDS = new Set([
  'und',
  'oder',
  'mit',
  'ohne',
  'ein',
  'eine',
  'einen',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ist',
  'war',
  'hab',
  'hat',
  'aus',
  'auf',
  'als',
  'wie',
  'mir',
  'mal',
  'bitte',
  'ca',
  'zum',
  'zur',
  'vom',
]);

/** Typische Suffixe abspalten (z. B. „wurstsalat“ → „wurst“) für besseres Matching */
function expandCompoundTokens(tokens: Set<string>): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) {
    const suf = ['salat', 'suppe', 'toast', 'salami'];
    for (const s of suf) {
      if (t.endsWith(s) && t.length > s.length + 2) {
        const base = t.slice(0, -s.length);
        if (base.length >= 3) out.add(base);
      }
    }
  }
  return out;
}

function collectInputTokens(input: string): Set<string> {
  const matches = input.toLowerCase().match(/[a-zäöüß]+/g);
  const raw = (matches ?? []).filter((t: string) => t.length >= 3 && !STOPWORDS.has(t));
  return expandCompoundTokens(new Set(raw));
}

/** Prozentangaben im Lebensmittelnamen (für Ranking / Disambiguierung). */
export function extractPercentHintNumbersFromText(text: string): number[] {
  const lower = text.toLowerCase();
  const out: number[] = [];
  for (const m of lower.matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  const m2 = lower.match(/\b(\d{1,2})\s*%?\s*fett\b/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  return [...new Set(out)].filter(n => n >= 0 && n <= 100);
}

export function percentNumbersInFoodName(name: string): number[] {
  const nums: number[] = [];
  for (const m of name.toLowerCase().matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return [...new Set(nums)];
}

function percentSpecScore(foodNameLower: string, wanted: number[]): number {
  if (wanted.length === 0) return 0;
  const inName = percentNumbersInFoodName(foodNameLower);
  let s = 0;
  for (const w of wanted) {
    if (inName.includes(w)) s += 120;
    else if (inName.some(n => Math.abs(n - w) <= 1 && n !== w)) s += 55;
    else if (inName.length > 0 && !inName.some(n => Math.abs(n - w) <= 2)) s -= 85;
  }
  return s;
}

/**
 * True, wenn `token` (z. B. „7“, „10.5“) als Zahl mit Wort-/Prozentgrenzen im Namen vorkommt
 * (vermeidet „7“ in „17“ o. Ä.).
 */
export function nameMatchesNumericToken(name: string, token: string): boolean {
  const raw = token.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return false;
  const escaped = raw.replace(/\./g, '\\.');
  const re = new RegExp(`(?:^|[^0-9])${escaped}(?:\\s*%|[^0-9%]|%|$)`, 'i');
  return re.test(name);
}

/** Mindest-Relevanz DB-Zeile ↔ Nutzer-/Parse-Text (0–100 Skala). */
export const MEAL_AI_MIN_SEMANTIC_SCORE = 20;

/** Ein Gericht mit Zutaten („Nudeln mit Soße und Käse“) — kein Zerlegen in mehrere Mahlzeiten. */
export function mealTextDescribesSingleComposedDish(userText: string): boolean {
  const lower = userText.trim().toLowerCase();
  if (lower.length < 6) return false;
  if (
    /^(nudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|lasagne|pizza|burger|auflauf|curry|reis|risotto|eintopf|suppe|salat|bowl)\b/i.test(
      lower,
    ) &&
    /\bmit\b/.test(lower)
  ) {
    return true;
  }
  if (/\b(überbacken|uberbacken|gratin|carbonara|bolognese|arrabiata)\b/i.test(lower)) return true;
  return false;
}

/** True wenn Freitext klar mehrere getrennte Speisen meint (Zerlegen-Modus). */
export function mealTextSuggestsDecompose(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 4) return false;
  if (mealTextDescribesSingleComposedDish(t)) return false;
  const lower = t.toLowerCase();
  if (/\bdazu\b|\baußerdem\b|\bplus\b|\bauch noch\b/i.test(lower)) return true;
  if (/\b2x\b|\b3x\b|\bje\s+\d+/i.test(lower)) return true;
  if (/[,;]/.test(lower)) {
    const segs = extractMealTextSegments(t);
    if (segs.length >= 2) return true;
  }
  const segs = extractMealTextSegments(t);
  if (segs.length < 2) return false;
  const independent = segs.filter(s => {
    const x = s.trim().toLowerCase();
    if (x.length < 3) return false;
    if (/^mit\s+/.test(x)) return false;
    if (/^(käse|kaese|soße|sose|sauce|sahne|tomaten|überbacken)/.test(x)) return false;
    return true;
  });
  return independent.length >= 2;
}

/** Marke/Restaurant nur wenn der Nutzer sie explizit nennt (z. B. „… von Rewe“). */
export function extractMealBrandHint(userText: string): string | null {
  const t = userText.trim();
  if (!t) return null;
  const von = t.match(/\b(?:von|bei|from)\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß0-9&'. -]{1,48})/i);
  if (!von) return null;
  const brand = von[1].trim().replace(/\s*[,;].*$/, '').trim();
  return brand.length >= 2 ? brand : null;
}

/**
 * „Hähnchenflügel mit Kroketten“ → zwei Komponenten; „Nudeln mit Soße“ bleibt ein Gericht.
 */
export function trySplitMitSideComponents(userText: string): string[] | null {
  const t = normalizeGermanMealInputForRanking(userText);
  if (t.length < 4 || mealTextDescribesSingleComposedDish(t)) return null;
  const parts = t
    .split(/\s+mit\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (parts.length !== 2) return null;
  const side = parts[1].toLowerCase();
  if (
    /^(soße|sose|sauce|käse|kaese|sahne|tomatensoße|tomaten|überbacken|uberbacken|pesto|honig|senf|butter|öl|ol|zwiebeln|knoblauch|kräuter|kraeuter)\b/.test(
      side,
    )
  ) {
    return null;
  }
  return parts;
}

/** Getrennte Speisen-Teile — „und“ in Rezepten (mit X und Y) nicht splitten. */
export function extractMealTextSegments(userText: string): string[] {
  const t = normalizeGermanMealInputForRanking(userText);
  if (t.length < 2) return [];
  if (mealTextDescribesSingleComposedDish(t)) return [t];
  const mitParts = trySplitMitSideComponents(t);
  if (mitParts && mitParts.length >= 2) return mitParts.slice(0, 8);
  const parts = t
    .split(/\s*[,;+]\s*|\s+(?:und|plus|sowie|dazu)\s+/i)
    .map(s => s.trim().replace(/^[\d.,]+\s*(scheiben?|stück|stk\.?|x)\s+/i, '').trim())
    .filter(s => s.length >= 2);
  if (parts.length >= 2) return parts.slice(0, 8);
  return [t];
}

function labelLooksLikeComboWithMit(label: string): boolean {
  return trySplitMitSideComponents(label) != null;
}

function tokenCoverageRatio(tokens: Set<string>, foodNameLower: string): number {
  if (tokens.size === 0) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (foodNameLower.includes(tok)) hit++;
  }
  return hit / tokens.size;
}

/**
 * Relevanz-Score einer DB-Zeile zu einem Such-/Parse-Text (höher = besser).
 * Wird für Kandidatenfilter und Nachvalidierung genutzt.
 */
export function scoreFoodRelevanceForMealText(food: Food, queryText: string): number {
  const normalized = normalizeGermanMealInputForRanking(queryText);
  const lower = normalized.toLowerCase().trim();
  if (!lower) return 0;
  const tokens = collectInputTokens(normalized);
  const fn = food.name.toLowerCase();
  const fnNorm = normalizeName(food.name);
  let score = 0;

  if (fnNorm === normalizeName(normalized)) score += 140;
  if (lower.length >= 4 && fn.includes(lower)) score += 95;
  if (lower.length >= 4 && lower.includes(fnNorm) && fnNorm.length >= 4) score += 75;

  const coverage = tokenCoverageRatio(tokens, fn);
  score += Math.round(coverage * 55);
  if (tokens.size >= 2 && coverage < 0.34) score -= 70;

  if (fn.length > 78) score -= 28;
  if (/\|/.test(food.name)) score -= 18;
  if (/\b(5|10)\s*kg\b|\bgrossgebinde\b|\bbulk\b/i.test(fn)) score -= 95;
  if (/\bflügel|\bflugel|\bwing/i.test(lower) && /\bflügel|\bflugel|\bwing/i.test(fn)) score += 40;
  if (/\bkroketten\b/i.test(lower) && /\bkroketten\b/i.test(fn)) score += 55;

  score += extractPercentHintNumbersFromText(queryText).length > 0
    ? percentSpecScore(food.name, extractPercentHintNumbersFromText(queryText))
    : 0;

  score += scoreFoodRelevanceCompoundPenalties(fn, lower);

  if (/leberk[aä]s|leberkaas|fleischk[aä]se/i.test(lower)) {
    if (/fleischkäse|leberkaas|leberkäse/i.test(fn)) score += 85;
    if (/leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) score -= 110;
  }
  if (/\bapfel\b/i.test(lower) && /\bapfel\b/i.test(fn)) score += 90;
  if (/\bapfel\b/i.test(lower) && /müsli|muesli|cornflakes|crunch/i.test(fn)) score -= 90;

  const brand = extractMealBrandHint(queryText);
  if (brand) {
    const brandTokens = collectInputTokens(brand);
    let brandHits = 0;
    for (const tok of brandTokens) {
      if (fn.includes(tok)) brandHits++;
    }
    if (brandHits > 0) score += Math.min(80, 22 * brandHits);
  }

  return score;
}

function applyContextualMealRankingBonuses(
  score: number,
  food: Food,
  lower: string,
  tokens: Set<string>,
): number {
  let s = score;
  const fn = food.name.toLowerCase();
  const wantedPerc = extractPercentHintNumbersFromText(lower);
  const wantsDeli =
    lower.includes('wurst') ||
    lower.includes('debrez') ||
    lower.includes('knackwurst') ||
    lower.includes('bockwurst') ||
    lower.includes('aufschnitt') ||
    lower.includes('lyoner') ||
    lower.includes('schinken');
  const deliHints =
    /wurst|debreziner|debrecziner|knackwurst|bockwurst|schinken|salami|mortadella|lyoner|bierwurst|bratwurst|leberwurst|leberkäs|fleischkäse|mett|speck|prosciutto|pute|hähnchen|hühnchen/i;
  const wurstSaladVegHints = /gurke|zwiebel|paprika|tomate/i;
  const sandwichBread = /\bsemmel\b|brötchen|weckerl|sandwich|belegte?\s*semmel|stulle|brotzeit|weizenbrötchen/i.test(
    lower,
  );
  const wantsBratenAsSandwich =
    sandwichBread &&
    /\bbraten\b|schweinebraten|schweinsbraten|rostbraten|braten-?semmel/i.test(lower);
  const wantsSweetMustard =
    /sü(ß|ss)(er?)?\s*senf|senf.*sü(ß|ss)|bayerisch(er)?\s*senf|wei(ß|ss)wurstsenf|sü(ß|ss?)senf/i.test(
      lower,
    );
  const wantsHotMustard =
    /\bscharf(er)?\s*senf|senf.*scharf|mittelscharf|dijon|meerrettichsenf/i.test(lower);
  const wantsPastaDish =
    /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower);
  const wantsBreadDish = /\bsemmel|brötchen|sandwich|toast\b/i.test(lower);

  if (wantsPastaDish && !wantsPizzaDish) {
    if (/pizzateig|pizza\b|pizzarolle/i.test(fn)) s -= 200;
    if (/nudel|pasta|spaghetti|penne|fusilli|tagliatelle|teigwaren/i.test(fn)) s += 45;
  }
  if (wantsPizzaDish && !wantsPastaDish) {
    if (/^nudel|pasta gekocht|spaghetti gekocht/i.test(fn)) s -= 80;
    if (/pizzateig|pizza\b/i.test(fn)) s += 40;
  }
  if (wantsBreadDish && /pizzateig|pasta gekocht|nudeln gekocht/i.test(fn)) s -= 60;

  if (wantedPerc.length > 0) s += percentSpecScore(food.name, wantedPerc);

  for (const tok of tokens) {
    if (fn.includes(tok)) s += 10;
  }

  if (wantsBratenAsSandwich) {
    if (
      /\bbraten\b|schweinebraten|schweinsbraten|rostbraten/i.test(fn) &&
      !/bratwurst|würstchen|wiener|nuernberger|nürnberger/i.test(fn)
    ) {
      s += 95;
    }
    if (/bratwurst|nuernberger|nürnberger|wiener\s*würstchen/i.test(fn)) s -= 110;
  }

  if (wantsSweetMustard && /senf/.test(fn)) {
    if (/sü(ß|ss)|bayerisch/i.test(fn)) s += 70;
    if (/mittelscharf|dijon|sriracha|scharf/i.test(fn)) s -= 55;
  }
  if (wantsHotMustard && /senf/.test(fn)) {
    if (/mittelscharf|dijon/i.test(fn)) s += 55;
    if (/sü(ß|ss)|bayerisch/i.test(fn)) s -= 45;
  }

  if (wantsDeli && deliHints.test(fn)) s += 35;
  if ((wantsDeli || lower.includes('salat')) && food.category === 'vegetable' && wurstSaladVegHints.test(fn)) {
    s += 18;
  }

  const looksLeberkaese =
    /leberkas|leberkäse|leberkaas|fleischkäse/i.test(lower) ||
    [...tokens].some(tk => /leberkas|leberkäse|leberkaas|fleischkäse/i.test(tk));
  if (looksLeberkaese && /leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) {
    s -= 120;
  }

  return s;
}

/**
 * Ordnet Lebensmittel nach Relevanz zur Freitextbeschreibung.
 * Kein Fallback mehr auf die ersten N Pool-Einträge bei schlechtem Score.
 */
export function rankFoodsForMealDescription(input: string, maxCount = 260, pool: Food[] = []): Food[] {
  const normalized = normalizeGermanMealInputForRanking(input);
  const lower = normalized.toLowerCase().trim();
  const tokens = collectInputTokens(normalized);
  const wantsPastaDish =
    /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower);

  const scored = pool.map(food => {
    let score = scoreFoodRelevanceForMealText(food, normalized);
    score = applyContextualMealRankingBonuses(score, food, lower, tokens);
    const fn = food.name.toLowerCase();
    if (wantsPastaDish && !wantsPizzaDish) {
      if (/tomaten(sauce|soße|sose)|passata|sugo/i.test(fn)) score += 28;
      if (/sahne|rahm|schmand|creme fraiche|käse|kaese|mozzarella|parmesan|gratink/i.test(fn)) score += 18;
    }
    const words = fn.split(/[\s(),\-\/]+/).filter(w => w.length >= 3);
    for (const w of words) {
      if (lower.includes(w)) score += 8;
    }
    return { food, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const maxPick = Math.min(maxCount, 56);
  const top = scored[0]?.score ?? 0;
  let picked = scored
    .filter(s => s.score >= Math.max(MEAL_AI_MIN_SEMANTIC_SCORE, top * 0.5))
    .slice(0, maxPick)
    .map(s => s.food);

  if (picked.length < 6) {
    picked = scored.filter(s => s.score >= 14).slice(0, maxPick).map(s => s.food);
  }
  if (picked.length < 3 && top > 10) {
    picked = scored.filter(s => s.score > 0).slice(0, maxPick).map(s => s.food);
  }

  return picked;
}

const DECOMPOSE_STOP = new Set([
  'und', 'mit', 'ohne', 'sowie', 'dazu', 'daneben', 'überbacken', 'uberbacken', 'gegessen', 'mahlzeit',
  'gericht', 'portion', 'stück', 'stk', 'ca', 'circa', 'etwas', 'viel', 'wenig',
]);

/**
 * Mehrere OFF-Suchbegriffe für Gerichtszerlegung (Nudeln ≠ Pizzateig in einer Suche).
 */
export function extractDecomposeSearchQueries(userText: string): string[] {
  const t = normalizeGermanMealInputForRanking(userText);
  const lower = t.toLowerCase();
  const out: string[] = [];
  if (t.length >= 2) out.push(t);

  if (/\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|makkaroni|lasagne\b/i.test(lower)) {
    out.push(
      'gekochte nudeln',
      'pasta gekocht',
      'tomatensoße',
      'tomatensauce',
      'sahne',
      'schlagsahne',
      'käse gerieben',
      'mozzarella',
    );
  } else if (/\bpizza\b/i.test(lower)) {
    out.push('pizzateig', 'tomatensauce pizza', 'mozzarella', 'salami');
  }

  for (const w of lower.split(/\s+/)) {
    const clean = w.replace(/[,;.]+$/g, '');
    if (clean.length >= 4 && !DECOMPOSE_STOP.has(clean)) out.push(clean);
  }

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const q of out) {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    uniq.push(q.trim());
  }
  return uniq.slice(0, 10);
}

/** Kompakte Kandidatenliste — zu lange Listen führen zu falschen exakten Treffern. */
export function formatAllowedFoodLinesForPrompt(
  foods: Food[],
  maxLines = 80,
): { lines: string; truncated: boolean; total: number } {
  const total = foods.length;
  const slice = foods.slice(0, maxLines);
  const body = slice.map(f => `- ${f.name}`).join('\n');
  const lines = total > maxLines
    ? `${body}\n… (${total - maxLines} weitere Kandidaten ausgeblendet — nur sichtbare Zeilen verwenden oder Position weglassen)`
    : body;
  return { lines, truncated: total > maxLines, total };
}

/** Abstrafung falscher OFF-Treffer (z. B. Semmelknödel statt Brötchen). */
function scoreFoodRelevanceCompoundPenalties(foodNameLower: string, queryLower: string): number {
  let p = 0;
  const fn = foodNameLower;
  const q = queryLower;
  if ((/\bsemmel\b|\bbrötchen\b|\bwecken\b|\bbrot\b/.test(q) || /\bleberk[aä]ssemmel\b/.test(q)) && /\bknödel\b|\bklöß|\bkloß/.test(fn) && !/\bknödel\b/.test(q)) {
    p -= 95;
  }
  if (/\bnudel|pasta|spaghetti|penne|auflauf/i.test(q) && /\bknödel\b|\bsemmel\b|\bbrötchen\b/.test(fn) && !/\bknödel|semmel|brötchen\b/.test(q)) {
    p -= 95;
  }
  if (/\bleberk|fleischk[aä]se|leberkaas/i.test(q) && /\bdebrezin|debrecziner\b/.test(fn) && !/\bdebrez/i.test(q)) {
    p -= 70;
  }
  if (/\btomat|sahne|soße|sose|sauce|käse|kaese/i.test(q) && /\bmüsli|cornflakes|schokolade\b/.test(fn)) {
    p -= 60;
  }
  return p;
}

/** OFF-Suchbegriffe aus KI-strukturierten meal_items (nicht aus String-Split des Nutzertexts). */
export function collectOffQueriesFromInterpretedGroups(
  groups: ParsedDecomposedMealItem[],
  userText = '',
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const g of groups) {
    const mode = inferMealItemTrackingMode(g, userText);
    if (g.label.trim().length >= 2) add(g.label);
    if (mode === 'product' || mode === 'auto') {
      for (const q of buildOffSearchQueriesForPhrase(g.label, userText)) add(q);
    }
    for (const row of g.parsed) {
      add(row.name);
      const stripped = row.name.replace(/^\d+(?:[.,]\d+)?\s*(scheiben?|stück|stk\.?|x)\s+/i, '').trim();
      if (stripped.length >= 3) add(stripped);
      for (const tok of collectInputTokens(stripped || row.name)) {
        if (tok.length >= 4) add(tok);
      }
    }
  }
  return out.slice(0, 16);
}

/** Kompakte Zusammenfassung strukturierter meal_items für Phase-2-Match-Prompt. */
export function decomposedGroupsSummaryText(groups: ParsedDecomposedMealItem[]): string {
  const parts: string[] = [];
  for (const g of groups) {
    const label = g.label.trim();
    const rows = g.parsed
      .map(i => {
        const n = i.name.trim();
        if (!n) return '';
        const amt = Number.isFinite(i.amount) && i.amount > 0 ? i.amount : 1;
        const u = (i.unit || 'g').trim();
        return `${n} (${amt} ${u})`;
      })
      .filter(Boolean);
    if (!label && rows.length === 0) continue;
    if (rows.length === 0) parts.push(label || 'Mahlzeit');
    else parts.push(`${label || 'Mahlzeit'}: ${rows.join(', ')}`);
  }
  return parts.join(' | ');
}

/** Varianten für eine einzelne Suchphrase (Marke, ohne Marke, Kern-Tokens). */
export function buildOffSearchQueriesForPhrase(phrase: string, userText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const t = q.trim();
    const k = t.toLowerCase();
    if (t.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  const p = phrase.trim();
  if (p.length < 2) return out;
  add(p);
  const withoutBrand = p.replace(/\s+(?:von|bei|from)\s+.+$/i, '').trim();
  if (withoutBrand.length >= 2 && withoutBrand.toLowerCase() !== p.toLowerCase()) add(withoutBrand);
  const brand = extractMealBrandHint(userText);
  if (brand) {
    const core = withoutBrand.length >= 2 ? withoutBrand : p;
    if (!core.toLowerCase().includes(brand.toLowerCase())) add(`${core} ${brand}`);
  }
  const tokens = [...collectInputTokens(p)].filter(t => t.length >= 3);
  if (tokens.length >= 2) add(tokens.join(' '));
  if (tokens.length >= 3) add(tokens.slice(0, 3).join(' '));
  return out.slice(0, 5);
}

/** OFF-Suchbegriffe: KI-Zerlegung + Rohtext-Segmente + beobachtete Zutaten. */
export function collectOffQueriesForTextMealAnalysis(
  groups: ParsedDecomposedMealItem[],
  userText: string,
): string[] {
  const flat = flattenDecomposedMealItems(groups);
  const fromGroups = collectOffQueriesFromInterpretedGroups(groups, userText);
  const fromObserved = buildTextOffSearchQueries(flat, userText);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const q of [...fromGroups, ...fromObserved]) add(q);
  for (const seg of extractMealTextSegments(userText).slice(0, 8)) {
    add(seg);
    for (const q of buildOffSearchQueriesForPhrase(seg, userText)) add(q);
  }
  for (const row of flat) {
    for (const q of buildOffSearchQueriesForPhrase(row.name, userText)) add(q);
  }
  const norm = normalizeGermanMealInputForRanking(userText);
  if (norm.length >= 2 && norm.length <= 80) add(norm);
  return out.slice(0, 18);
}

/** Zusätzliche OFF-Queries für noch nicht gematchte Zutaten (ohne KI-Runde). */
export function collectOffQueriesForUnmatchedItems(
  unmatched: ParsedFoodItem[],
  userText: string,
  maxItems = 6,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const row of unmatched.slice(0, maxItems)) {
    for (const q of buildOffSearchQueriesForPhrase(row.name, userText)) add(q);
  }
  return out.slice(0, 12);
}

export function extractOffAlternativeQueriesFromAi(
  content: string,
  fallbackUnmatched: ParsedFoodItem[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) throw new Error('no json');
    const parsed = JSON.parse(jsonStr) as { alternatives?: unknown };
    const alts = parsed.alternatives;
    if (Array.isArray(alts)) {
      for (const raw of alts) {
        const o = raw as Record<string, unknown>;
        const queries = o.search_queries;
        if (!Array.isArray(queries)) continue;
        for (const q of queries) {
          if (typeof q === 'string' && q.trim().length >= 2) add(q);
        }
      }
    }
  } catch {
    /* fallback below */
  }
  if (out.length === 0) {
    for (const item of fallbackUnmatched) {
      add(item.name);
      const stripped = item.name.replace(/^\d+(?:[.,]\d+)?\s*(scheiben?|stück|stk\.?|x)\s+/i, '').trim();
      if (stripped.length >= 3) add(stripped);
      for (const tok of collectInputTokens(stripped || item.name)) {
        if (tok.length >= 4) add(tok);
      }
    }
  }
  return out.slice(0, 24);
}

/**
 * Ordnet flache KI/OFF-Zutaten den strukturierten meal_items-Gruppen zu.
 */
export function assignIngredientsToDecomposedMealGroups(
  groups: ParsedDecomposedMealItem[],
  ingredients: Ingredient[],
  pool: Food[],
): { mealItemGroups: { label: string; ingredients: Ingredient[] }[]; unmatched: ParsedFoodItem[] } {
  const usedIng = new Set<string>();
  const ingKey = (ing: Ingredient) =>
    `${ing.id ?? ''}|${normalizeName(ing.name)}|${ing.amount}|${ing.unit}`;
  const mealItemGroups: { label: string; ingredients: Ingredient[] }[] = [];
  const unmatched: ParsedFoodItem[] = [];

  const claimIngredient = (ing: Ingredient): boolean => {
    const k = ingKey(ing);
    if (usedIng.has(k)) return false;
    usedIng.add(k);
    return true;
  };

  for (const g of groups) {
    const label = g.label.trim() || 'Mahlzeit';
    const stripped = stripSelfReferentialDecomposeRows(label, g.parsed, pool);
    const rows = normalizeDecomposedParsedItems(stripped);
    const groupIngs: Ingredient[] = [];

    for (const row of rows) {
      const phrase = row.name.trim();
      if (!phrase) continue;
      let bestIng: Ingredient | null = null;
      let bestScore = MEAL_AI_MIN_SEMANTIC_SCORE - 1;
      for (const ing of ingredients) {
        if (usedIng.has(ingKey(ing))) continue;
        const food =
          (ing.id && !String(ing.id).startsWith('est_') ? pool.find(f => f.id === ing.id) : null) ??
          matchFoodExactFromPool(ing.name, pool);
        if (!food) continue;
        const s = Math.max(
          scoreFoodRelevanceForMealText(food, phrase),
          scoreFoodRelevanceForMealText(food, ing.name) * 0.9,
        );
        if (s > bestScore && parenMatchAllowsDbLink(phrase, food.name)) {
          bestScore = s;
          bestIng = ing;
        }
      }
      if (bestIng && claimIngredient(bestIng)) {
        groupIngs.push(bestIng);
      } else {
        unmatched.push(row);
      }
    }

    const ingSan = stripSelfReferentialResolvedIngredients(label, groupIngs, pool);
    if (ingSan.length > 0) {
      mealItemGroups.push({ label, ingredients: ingSan });
    } else if (rows.length === 0) {
      unmatched.push({ name: label, amount: 1, unit: 'g' });
    }
  }

  for (const ing of ingredients) {
    if (!usedIng.has(ingKey(ing))) {
      const orphanLabel = ing.name.trim() || 'Mahlzeit';
      const existing = mealItemGroups.find(g => decomposeLabelsTitleEquivalent(g.label, orphanLabel));
      if (existing && claimIngredient(ing)) {
        existing.ingredients.push(ing);
      } else if (claimIngredient(ing)) {
        mealItemGroups.push({ label: orphanLabel, ingredients: [ing] });
      }
    }
  }

  return { mealItemGroups, unmatched };
}

/**
 * Pro KI-Zutat: kleine OFF-Ranking-Teilmenge → semantisch bester DB-Treffer (kein Raten aus riesiger Liste).
 */
export function resolveMealGroupsAgainstFoodPool(
  groups: ParsedDecomposedMealItem[],
  fullPool: Food[],
  userText: string,
): { mealItemGroups: { label: string; ingredients: Ingredient[] }[]; unmatched: ParsedFoodItem[] } {
  const mealItemGroups: { label: string; ingredients: Ingredient[] }[] = [];
  const unmatched: ParsedFoodItem[] = [];
  const ctx = userText.trim();

  for (const g of groups) {
    const label = g.label.trim() || 'Mahlzeit';
    const mode = inferMealItemTrackingMode(g, ctx);
    const stripped = stripSelfReferentialDecomposeRows(label, g.parsed, fullPool);
    const rows = normalizeDecomposedParsedItems(stripped);

    if ((mode === 'product' || mode === 'auto') && !labelLooksLikeComboWithMit(label)) {
      const whole = tryResolveMealItemAsWholeProduct(label, rows, fullPool, ctx);
      if (whole) {
        mealItemGroups.push({ label, ingredients: [whole] });
        continue;
      }
      if (mode === 'product' && rows.length <= 1) {
        unmatched.push(
          rows[0] ?? { name: label, amount: 1, unit: looksLikePreparedDishLabel(label) ? 'stk' : 'g' },
        );
        continue;
      }
    }

    const ingredients: Ingredient[] = [];

    for (const row of rows) {
      const phrase = row.name.trim();
      if (!phrase) continue;
      const rankQuery = `${phrase} ${label} ${ctx}`.slice(0, 140);
      const localCandidates = rankFoodsForMealDescription(rankQuery, 32, fullPool);
      const poolSlice = localCandidates.length >= 3 ? localCandidates : fullPool;
      let food = findBestSemanticFoodForPhrase(phrase, poolSlice);
      let score = food ? scoreFoodRelevanceForMealText(food, phrase) : 0;
      if (!food || score < MEAL_AI_MIN_SEMANTIC_SCORE) {
        const alt = findBestSemanticFoodForPhrase(phrase, fullPool);
        const altScore = alt ? scoreFoodRelevanceForMealText(alt, phrase) : 0;
        if (alt && altScore > score) {
          food = alt;
          score = altScore;
        }
      }
      if (food && score >= MEAL_AI_MIN_SEMANTIC_SCORE && parenMatchAllowsDbLink(phrase, food.name)) {
        ingredients.push(ingredientFromParsedItem(row, food));
      } else {
        unmatched.push(row);
      }
    }

    const ingSan = stripSelfReferentialResolvedIngredients(label, ingredients, fullPool);
    if (ingSan.length > 0) {
      mealItemGroups.push({ label, ingredients: ingSan });
    } else if (rows.length === 0) {
      unmatched.push({ name: label, amount: 1, unit: 'g' });
    }
  }

  return { mealItemGroups, unmatched };
}

export function visionObservedSummaryText(items: ParsedFoodItem[]): string {
  return items
    .map(i => {
      const n = i.name.trim();
      if (!n) return '';
      const amt = Number.isFinite(i.amount) && i.amount > 0 ? i.amount : 1;
      const u = (i.unit || 'g').trim();
      return `${n} (${amt} ${u})`;
    })
    .filter(Boolean)
    .join('; ');
}

/** OFF-Suchbegriffe für Foto-Sichtbefund (ohne Zerlege-Template-Inflation). */
export function buildVisionOffSearchQueries(visionItems: ParsedFoodItem[], userText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  if (userText.trim().length >= 2) {
    for (const seg of extractMealTextSegments(userText).slice(0, 6)) add(seg);
  }
  for (const item of visionItems) {
    const n = item.name.trim();
    if (n.length >= 2) add(n);
    for (const q of buildOffSearchQueriesForPhrase(n, userText)) add(q);
  }
  return out.slice(0, 18);
}

/** OFF-Suchbegriffe für Foto-Analyse (Sichtbefund + Varianten). */
export function collectOffQueriesForVisionAnalysis(
  observed: ParsedFoodItem[],
  userText: string,
): string[] {
  const ctx = userText.trim() || observed.map((i) => i.name).join(', ');
  const groups: ParsedDecomposedMealItem[] = observed.map((row) => ({
    label: row.name.trim() || 'Mahlzeit',
    parsed: [row],
    tracking: 'auto',
  }));
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const q of collectOffQueriesForTextMealAnalysis(groups, ctx)) add(q);
  for (const q of buildVisionOffSearchQueries(observed, userText)) add(q);
  return out.slice(0, 20);
}

/** OFF-Suchbegriffe für Text-Phase-1 (pro erkanntem Lebensmittel, keine Pasta/Pizza-Defaults). */
export function buildTextOffSearchQueries(observedItems: ParsedFoodItem[], userText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(q.trim());
  };
  for (const seg of extractMealTextSegments(userText).slice(0, 8)) {
    add(seg);
    for (const q of buildOffSearchQueriesForPhrase(seg, userText)) add(q);
  }
  for (const item of observedItems) {
    const n = item.name.trim();
    if (n.length >= 2) add(n);
    const stripped = n.replace(/^\d+(?:[.,]\d+)?\s*(scheiben?|stück|stk\.?|x)\s+/i, '').trim();
    if (stripped.length >= 3) add(stripped);
    for (const tok of collectInputTokens(stripped || n)) {
      if (tok.length >= 4) add(tok);
    }
  }
  const norm = normalizeGermanMealInputForRanking(userText);
  if (observedItems.length === 0 && norm.length >= 2 && norm.length <= 48) add(norm);
  return out.slice(0, 12);
}

/** Mehrere Suchanfragen → deduplizierte Kandidaten-Reihenfolge. */
export function rankFoodPoolFromMultipleQueries(queries: string[], pool: Food[], maxCount = 260): Food[] {
  const seen = new Set<string>();
  const merged: Food[] = [];
  for (const q of queries) {
    for (const f of rankFoodsForMealDescription(q, maxCount, pool)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        merged.push(f);
      }
      if (merged.length >= maxCount) break;
    }
    if (merged.length >= maxCount) break;
  }
  if (merged.length === 0 && queries.length > 0) {
    return rankFoodsForMealDescription(queries.join(' '), maxCount, pool);
  }
  return merged.slice(0, maxCount);
}

/** Kandidaten für analyze-meal: Text/Foto mit Phase-1-Items + OFF, kein blindes Pool-Slicing. */
export function resolveCandidateFoodsForAnalysis(
  userText: string,
  hasImage: boolean,
  pool: Food[] = [],
  observedItems: ParsedFoodItem[] = [],
): Food[] {
  const t = userText.trim();
  let picked: Food[] = [];
  if (observedItems.length > 0) {
    const queries = hasImage
      ? buildVisionOffSearchQueries(observedItems, t)
      : buildTextOffSearchQueries(observedItems, t);
    if (queries.length > 0) {
      picked = rankFoodPoolFromMultipleQueries(queries, pool, 120).slice(0, 56);
    }
  }
  if (picked.length === 0 && t.length >= 2) {
    if (!mealTextDescribesSingleComposedDish(t)) {
      const segments = extractMealTextSegments(t);
      if (segments.length >= 2) {
        picked = rankFoodPoolFromMultipleQueries(segments, pool, 120).slice(0, 56);
      }
    }
    if (picked.length === 0) {
      picked = rankFoodsForMealDescription(t, 56, pool);
    }
  }
  if (picked.length === 0 && pool.length > 0) {
    picked = rankFoodsForMealDescription(t || 'mahlzeit', 40, pool);
  }
  if (hasImage && picked.length === 0) return rankFoodsForMealDescription('', 40, pool);
  return picked;
}

/** Beste DB-Zeile zu einem Parse-Namen (semantisch, nicht nur Levenshtein). */
export function findBestSemanticFoodForPhrase(phrase: string, pool: Food[]): Food | null {
  const q = phrase.trim();
  if (!q || pool.length === 0) return null;
  const exact = matchFoodExactFromPool(q, pool);
  if (exact) return exact;
  let best: Food | null = null;
  let bestScore = MEAL_AI_MIN_SEMANTIC_SCORE - 1;
  for (const food of pool) {
    const s = scoreFoodRelevanceForMealText(food, q);
    if (s > bestScore && parenMatchAllowsDbLink(q, food.name)) {
      bestScore = s;
      best = food;
    }
  }
  return best;
}

/** Ersetzt KI-Treffer durch semantisch bessere DB-Zeilen (gleiche Menge/Einheit). */
export function remapIngredientsToSemanticBestMatch(
  ingredients: Ingredient[],
  parsedItems: ParsedFoodItem[],
  pool: Food[],
): Ingredient[] {
  return ingredients.map(ing => {
    const parsed =
      parsedItems.find(p => p.name.trim().toLowerCase() === ing.name.trim().toLowerCase()) ??
      parsedItems.find(p => normalizeName(p.name) === normalizeName(ing.name));
    const phrase = parsed?.name?.trim() || ing.name;
    const currentFood =
      (ing.id && !String(ing.id).startsWith('est_') ? pool.find(f => f.id === ing.id) : null) ??
      matchFoodExactFromPool(ing.name, pool);
    const currentScore = currentFood ? scoreFoodRelevanceForMealText(currentFood, phrase) : 0;
    const better = findBestSemanticFoodForPhrase(phrase, pool);
    if (!better || better.id === currentFood?.id) return ing;
    const betterScore = scoreFoodRelevanceForMealText(better, phrase);
    if (betterScore < currentScore + 12) return ing;
    const row = parsed ?? { name: ing.name, amount: ing.amount, unit: ing.unit };
    return ingredientFromParsedItem(row, better);
  });
}

/** Entfernt Zeilen mit zu geringer semantischer Passung zum Nutzer-/Parse-Text. */
export function filterIngredientsBySemanticRelevance(
  ingredients: Ingredient[],
  userText: string,
  observedItems: ParsedFoodItem[],
  pool: Food[],
): { kept: Ingredient[]; dropped: ParsedFoodItem[] } {
  const kept: Ingredient[] = [];
  const dropped: ParsedFoodItem[] = [];
  const ut = userText.trim();

  for (const ing of ingredients) {
    const food =
      (ing.id && !String(ing.id).startsWith('est_') ? pool.find(f => f.id === ing.id) : null) ??
      matchFoodExactFromPool(ing.name, pool);
    if (!food) {
      dropped.push({ name: ing.name, amount: ing.amount, unit: ing.unit });
      continue;
    }
    const obs = observedItems.find(
      o =>
        normalizeName(o.name) === normalizeName(ing.name) ||
        scoreFoodRelevanceForMealText(food, o.name) >= MEAL_AI_MIN_SEMANTIC_SCORE,
    );
    const scoreUser = ut ? scoreFoodRelevanceForMealText(food, ut) : 0;
    const scoreObs = obs ? scoreFoodRelevanceForMealText(food, obs.name) : 0;
    const scoreIng = scoreFoodRelevanceForMealText(food, ing.name);
    const best = Math.max(scoreIng, scoreObs, scoreUser * 0.85);
    if (best >= MEAL_AI_MIN_SEMANTIC_SCORE || scoreObs >= 14 || scoreIng >= 14) {
      kept.push(ing);
    } else {
      dropped.push({ name: ing.name, amount: ing.amount, unit: ing.unit });
    }
  }
  if (kept.length === 0 && ingredients.length > 0) {
    return { kept: ingredients, dropped: [] };
  }
  return { kept, dropped };
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].trim() || 'image/jpeg', data: m[2].replace(/\s/g, '') };
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(.*\)/g, '')
    .trim();
}

/** Alle (...) Qualifier in Lesereihenfolge, lowercased — für Abgleich Nutzerbegriff ↔ DB-Zeile */
function parenQualifiersLower(name: string): string[] {
  const out: string[] = [];
  for (const m of name.toLowerCase().matchAll(/\(\s*([^)]*?)\s*\)/g)) {
    const q = m[1].trim();
    if (q) out.push(q);
  }
  return out;
}

/**
 * Wenn der Nutzer Klammer-Zusätze nennt („Pizzateig (Blech)“), darf das nicht still mit
 * einem generischen DB-Eintrag ohne dieselbe Qualifikation gematcht werden — sonst entfällt
 * der Forschungs-/Vorschlags-Pfad und eigene Lebensmittel lassen sich nicht anlegen.
 */
export function parenMatchAllowsDbLink(userRequested: string, dbFoodName: string): boolean {
  const uq = parenQualifiersLower(userRequested);
  if (uq.length === 0) return true;
  const fq = parenQualifiersLower(dbFoodName);
  if (fq.length > 0) return uq.join('|') === fq.join('|');

  const wantedPerc = extractPercentHintNumbersFromText(userRequested);
  if (
    wantedPerc.length > 0 &&
    uq.every(q => /^\d+([.,]\d+)?\s*%?$/.test(q.replace(/\s/g, '')))
  ) {
    const inName = percentNumbersInFoodName(dbFoodName);
    if (wantedPerc.some(w => inName.includes(w))) return true;
  }
  return false;
}

export function findBestFoodMatch(foodName: string, pool: Food[] = []): Food | null {
  return findBestFoodMatchWithHint(foodName, pool);
}

/**
 * Wie findBestFoodMatch, aber Fett-%-Hinweise aus `foodName` (z. B. „Sahne 7 %“) disambiguieren nahe Treffer.
 */
export function findBestFoodMatchWithHint(foodName: string, pool: Food[] = []): Food | null {
  const normalized = normalizeName(foodName);
  const wantedPerc = extractPercentHintNumbersFromText(foodName);
  const candidates: { food: Food; distance: number }[] = [];
  const threshold = 6;

  for (const food of pool) {
    const foodNormalized = normalizeName(food.name);
    const distance = levenshteinDistance(normalized, foodNormalized);

    if (foodNormalized === normalized && parenMatchAllowsDbLink(foodName, food.name)) {
      return food;
    }

    if (distance <= threshold && parenMatchAllowsDbLink(foodName, food.name)) {
      candidates.push({ food, distance });
    }
  }

  if (candidates.length === 0) {
    let bestMatch: Food | null = null;
    let bestScore = Infinity;
    for (const food of pool) {
      const foodNormalized = normalizeName(food.name);
      const distance = levenshteinDistance(normalized, foodNormalized);
      if (
        (foodNormalized.includes(normalized) ||
          normalized.includes(foodNormalized.split(' ')[0])) &&
        parenMatchAllowsDbLink(foodName, food.name)
      ) {
        if (distance < bestScore) {
          bestScore = distance;
          bestMatch = food;
        }
      }
    }
    return bestMatch;
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const bestD = candidates[0].distance;
  const tied = candidates.filter(c => c.distance <= bestD + 1 && parenMatchAllowsDbLink(foodName, c.food.name)).map(c => c.food);
  if (tied.length === 0) return null;
  if (tied.length === 1) return tied[0];

  if (wantedPerc.length > 0) {
    const scored = tied.map(food => ({
      food,
      s: percentSpecScore(food.name, wantedPerc),
    }));
    scored.sort((a, b) => b.s - a.s);
    if (scored[0].s !== scored[1]?.s) return scored[0].food;
  }

  return tied[0];
}

/** Nur exakter Treffer (nach Trim / normalizeName) — für KI-Auswahl aus erlaubter Teilmenge */
export function matchFoodExactFromPool(name: string, pool: Food[]): Food | null {
  const raw = name.trim().toLowerCase();
  if (!raw) return null;
  for (const food of pool) {
    if (food.name.trim().toLowerCase() === raw) return food;
  }
  const norm = normalizeName(name);
  for (const food of pool) {
    if (normalizeName(food.name) !== norm) continue;
    if (!parenMatchAllowsDbLink(name, food.name)) continue;
    return food;
  }
  return null;
}

export function convertToGrams(amount: number, unit: string): number {
  const unitLower = unit.toLowerCase();

  if (unitLower.includes('g') || unitLower.includes('gram')) return amount;
  if (unitLower.includes('oz')) return amount * 28.35;
  if (unitLower.includes('lb')) return amount * 453.6;
  if (unitLower.includes('ml') || unitLower.includes('l')) return amount;
  if (unitLower.includes('cup') || unitLower.includes('tasse')) return amount * 240;
  if (unitLower.includes('tbsp') || unitLower.includes('el')) return amount * 15;
  if (unitLower.includes('tsp') || unitLower.includes('tl')) return amount * 5;

  return amount;
}

/** Wie eine Mahlzeit-Position in OFF getrackt werden soll. */
export type MealTrackingMode = 'product' | 'components' | 'auto';

/** Eine Nutzer-sichtbare Verzehr-Position mit DB-Zutatenzeilen (KI-Zerlegen). */
export interface ParsedDecomposedMealItem {
  label: string;
  parsed: ParsedFoodItem[];
  /** KI/Heuristik: Fertigprodukt, Zutatenliste oder erst Produkt dann Zerlegung. */
  tracking?: MealTrackingMode;
}

/** Mindest-Score für „ein OFF-Produkt = ganze Position“ (strenger als Einzelzutat). */
export const MEAL_AI_PRODUCT_MATCH_MIN_SCORE = 30;

const PREPARED_DISH_LABEL_HINT =
  /\b(burger|cheeseburger|hamburger|pizza|pizz|wrap|döner|doner|kebab|lasagne|sandwich|panini|bagel|menü|menu|nuggets|schnitzel|currywurst|auflauf|carbonara|bolognese|risotto|sushi|bowl|burrito|taco|quesadilla|fertig|tiefkühl|tiefkuehl|frozen|ready\s*meal|fertiggericht)\b/i;

const SIMPLE_WHOLE_FOOD_HINT =
  /^(apfel|äpfel|banane|birne|orange|mandarine|joghurt|yogurt|milch|wasser|kaffee|tee|ei|eier|tomate|gurke|karotte|möhre|mozzarella|butter|honig|nuss|nüsse|beere|beeren|traube|trauben)(\s|$)/i;

/** Fertiggericht / Restaurant-Gericht (generisch, keine Marken). */
export function looksLikePreparedDishLabel(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (PREPARED_DISH_LABEL_HINT.test(t)) return true;
  if (/\bmit\s+(soße|sauce|käse|kaese|salat|pommes|reis|nudeln)\b/i.test(t)) return false;
  return false;
}

/** Ein einzelnes Grundlebensmittel ohne Zubereitung (Apfel, Joghurt, …). */
export function isLikelySingleWholeFood(name: string): boolean {
  const t = name.trim();
  if (t.length < 3 || t.length > 48) return false;
  if (/\bmit\b|,|\+| und /.test(t)) return false;
  if (looksLikePreparedDishLabel(t)) return false;
  if (SIMPLE_WHOLE_FOOD_HINT.test(t)) return true;
  const tokens = [...collectInputTokens(t)];
  return tokens.length <= 2 && t.length <= 24;
}

export function inferMealItemTrackingMode(
  group: ParsedDecomposedMealItem,
  _userText: string,
): MealTrackingMode {
  if (group.tracking === 'product' || group.tracking === 'components') return group.tracking;
  const label = group.label.trim();
  const rows = group.parsed;
  if (rows.length === 0) return looksLikePreparedDishLabel(label) ? 'auto' : 'product';
  if (rows.length === 1) {
    const rowName = rows[0].name.trim();
    if (isLikelySingleWholeFood(rowName) || isLikelySingleWholeFood(label)) return 'product';
    if (looksLikePreparedDishLabel(label) || looksLikePreparedDishLabel(rowName)) return 'auto';
    return 'auto';
  }
  if (rows.length >= 2) {
    if (looksLikePreparedDishLabel(label) && rows.length >= 2) return 'components';
    return 'components';
  }
  return 'auto';
}

/** Ein OFF-Produkt für die ganze Position (Fertiggericht / Einzelprodukt). */
export function tryResolveMealItemAsWholeProduct(
  label: string,
  parsed: ParsedFoodItem[],
  pool: Food[],
  userText: string,
): Ingredient | null {
  if (pool.length === 0) return null;
  const phrases = new Set<string>();
  const add = (p: string) => {
    const t = p.trim();
    if (t.length >= 2) phrases.add(t);
  };
  add(label);
  if (parsed.length === 1) add(parsed[0].name);
  for (const q of buildOffSearchQueriesForPhrase(label, userText)) add(q);

  const portionRow: ParsedFoodItem =
    parsed.length === 1
      ? parsed[0]
      : { name: label, amount: 1, unit: looksLikePreparedDishLabel(label) ? 'stk' : 'g' };

  let best: { food: Food; score: number } | null = null;
  for (const phrase of phrases) {
    const food = findBestSemanticFoodForPhrase(phrase, pool);
    if (!food || !isOpenFoodFactsFood(food)) continue;
    const score = Math.max(
      scoreFoodRelevanceForMealText(food, label),
      scoreFoodRelevanceForMealText(food, phrase),
    );
    if (score >= MEAL_AI_PRODUCT_MATCH_MIN_SCORE && (!best || score > best.score)) {
      best = { food, score };
    }
  }
  if (!best) return null;
  return ingredientFromParsedItem(portionRow, best.food);
}

/**
 * Faltet Titel für Zerlegen-Selbstreferenz-Vergleiche (Umlaute, keine Interpunktion).
 */
export function decomposeFoldKey(s: string): string {
  return normalizeName(s)
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

function decomposeLabelsTitleEquivalent(label: string, rowName: string): boolean {
  const A = decomposeFoldKey(label);
  const B = decomposeFoldKey(rowName);
  if (A.length < 4 || B.length < 4) return false;
  if (A === B) return true;
  const maxL = Math.max(A.length, B.length);
  if (maxL <= 28 && levenshteinDistance(A, B) <= 1) return true;
  return false;
}

/** Zerlegen-Modus: Kandidatenpool ohne gespeicherte Kombi-Lebensmittel (User-/DB-Composites). */
export function filterFoodPoolExcludingComposites(pool: Food[]): Food[] {
  return pool.filter(f => !(f.compositeIngredients && f.compositeIngredients.length > 0));
}

export function isSelfReferentialDecomposeRow(label: string, row: ParsedFoodItem, pool: Food[]): boolean {
  if (decomposeLabelsTitleEquivalent(label, row.name)) return true;
  const exact = matchFoodExactFromPool(row.name, pool);
  if (exact?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, exact.name)) return true;
  if (exact) return false;
  const fuzzy = findBestFoodMatch(row.name, pool);
  if (fuzzy?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, fuzzy.name)) {
    const fn = decomposeFoldKey(fuzzy.name);
    const rn = decomposeFoldKey(row.name);
    if (fn === rn || levenshteinDistance(fn, rn) <= 2) return true;
  }
  return false;
}

/**
 * Entfernt Zerlegen-Zeilen, die dieselbe Kombination wie `label` repräsentieren (Name/Composite).
 * Leere Ergebnisse bewusst möglich — Aufrufer routed in Forschung/unmatched.
 */
export function stripSelfReferentialDecomposeRows(
  label: string,
  parsed: ParsedFoodItem[],
  pool: Food[],
): ParsedFoodItem[] {
  return parsed.filter(row => !isSelfReferentialDecomposeRow(label, row, pool));
}

function mergeParsedFoodItemsByNameUnit(rows: ParsedFoodItem[]): ParsedFoodItem[] {
  const map = new Map<string, ParsedFoodItem>();
  for (const r of rows) {
    const u = (r.unit || 'g').trim().toLowerCase();
    const k = `${normalizeName(r.name)}|${u}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...r, unit: u });
    else map.set(k, { ...prev, amount: prev.amount + r.amount });
  }
  return [...map.values()];
}

/**
 * Fasst mehrere `meal_items` mit gleichem normalisiertem `label` zusammen; merged `parsed` nach Name+Einheit.
 */
export function dedupeDecomposedMealItemsByLabel(groups: ParsedDecomposedMealItem[]): ParsedDecomposedMealItem[] {
  const map = new Map<string, ParsedDecomposedMealItem>();
  for (const g of groups) {
    const key = decomposeFoldKey(g.label) || normalizeName(g.label).replace(/\s+/g, '') || g.label.trim().toLowerCase();
    if (!key) continue;
    const ex = map.get(key);
    if (!ex) map.set(key, { label: g.label, parsed: [...g.parsed], tracking: g.tracking });
    else {
      ex.parsed.push(...g.parsed);
      if (g.tracking === 'components') ex.tracking = 'components';
      else if (!ex.tracking && g.tracking) ex.tracking = g.tracking;
    }
  }
  return [...map.values()].map(h => ({
    label: h.label,
    parsed: mergeParsedFoodItemsByNameUnit(h.parsed),
    tracking: h.tracking,
  }));
}

/** Nach Resolve: Zutatenzeilen entfernen, die noch die Gesamt-Kombi wie `label` darstellen. */
export function stripSelfReferentialResolvedIngredients(
  label: string,
  ingredients: Ingredient[],
  pool: Food[],
): Ingredient[] {
  return ingredients.filter(ing => {
    if (decomposeLabelsTitleEquivalent(label, ing.name)) return false;
    const id = ing.id != null ? String(ing.id).trim() : '';
    let food: Food | undefined;
    if (id && !id.startsWith('est_')) food = pool.find(x => x.id === id);
    if (!food) {
      const hit = matchFoodExactFromPool(ing.name, pool);
      if (hit) food = hit;
    }
    if (food?.compositeIngredients?.length && decomposeLabelsTitleEquivalent(label, food.name)) return false;
    return true;
  });
}

/**
 * Zerlegen-JSON: \`meal_items[]\` mit label + ingredients; Fallback altes \`ingredients[]\` → eine Gruppe.
 */
export function extractDecomposedMealItemsFromAiContent(
  content: string,
  userQueryFallbackLabel: string,
): ParsedDecomposedMealItem[] {
  const fallbackLabel =
    userQueryFallbackLabel.trim().replace(/\r?\n+/g, ' ').slice(0, 120) || 'Mahlzeit';
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr) as {
      meal_items?: unknown;
      ingredients?: unknown;
    };

    const mealItemsRaw = parsed.meal_items;
    if (Array.isArray(mealItemsRaw) && mealItemsRaw.length > 0) {
      const out: ParsedDecomposedMealItem[] = [];
      for (const rawGroup of mealItemsRaw) {
        if (!rawGroup || typeof rawGroup !== 'object') continue;
        const g = rawGroup as Record<string, unknown>;
        const label =
          typeof g.label === 'string' && g.label.trim()
            ? g.label.trim().slice(0, 200)
            : fallbackLabel;
        const ingArr = g.ingredients;
        if (!Array.isArray(ingArr) || ingArr.length === 0) continue;
        const parsedRows = ingArr
          .map(parseParsedFoodItemRow)
          .filter((x): x is ParsedFoodItem => x !== null);
        if (parsedRows.length === 0) continue;
        const tr = g.tracking;
        let tracking: MealTrackingMode | undefined;
        if (tr === 'product' || tr === 'components' || tr === 'auto') tracking = tr;
        out.push({ label, parsed: parsedRows, ...(tracking ? { tracking } : {}) });
      }
      if (out.length > 0) return out;
    }

    const flat = extractIngredientsFromAiContent(content);
    if (flat.length > 0) return [{ label: fallbackLabel, parsed: flat }];
    return [];
  } catch {
    return [];
  }
}

/** Alle Gruppen-Zeilen in einer flachen Liste (Reihenfolge: Gruppen). */
export function flattenDecomposedMealItems(items: ParsedDecomposedMealItem[]): ParsedFoodItem[] {
  return items.flatMap(m => m.parsed);
}

const SLICE_PRODUCT_HINT =
  /leberk|leberka|fleischk|lyoner|mortadell|salami|schinken|aufschnitt|rohwurst|gelbwurst|bierschinken|extrawurst|käse|kaese|schnittk|emment|gouda|tilsit|brie|camembert|scheiben|wurst|pastete|braten/i;

function isStkLikeUnit(unit: string): boolean {
  const u = (unit || '').toLowerCase().trim().replace(/\./g, '');
  if (!u) return false;
  if (u === 'stk' || u === 'stück' || u === 'stueck' || u === 'stuck') return true;
  if (/\bstk\b/.test(u) || u.includes('stück') || u.includes('stueck')) return true;
  return false;
}

function looksLikeSliceableProductName(name: string): boolean {
  return SLICE_PRODUCT_HINT.test((name || '').trim());
}

/**
 * Nach KI-Zerlegen: gebrochene „Stück“-Mengen absichern — Modell ignoriert Prompt-Regeln manchmal.
 * - stk: auf ganze Zahl ≥ 1 runden, außer Scheiben/Aufschnitt → lieber in g (≈ 120 g pro Stück-Anteil).
 */
export function normalizeDecomposedParsedItems(rows: ParsedFoodItem[]): ParsedFoodItem[] {
  return rows.map(row => {
    let { name, amount, unit } = row;
    if (!Number.isFinite(amount) || amount <= 0) amount = 1;
    if (!isStkLikeUnit(unit)) return { name, amount, unit };

    const whole = Math.round(amount);
    const isInteger = Math.abs(amount - whole) < 1e-6;
    if (isInteger && whole >= 1) return { name, amount: whole, unit: 'stk' };

    if (looksLikeSliceableProductName(name)) {
      const grams = Math.max(25, Math.round(amount * 120));
      return { name, amount: grams, unit: 'g' };
    }
    return { name, amount: Math.max(1, whole || 1), unit: 'stk' };
  });
}

/** Kurze Beschreibung ohne klare Aufzählung, aber Modell liefert viele Zeilen → oft fälschlich zerlegt. */
export function mealAnalysisLikelyOverSplit(userText: string, parsedCount: number): boolean {
  if (parsedCount < 3) return false;
  const t = userText.trim();
  if (t.length < 8 || t.length > 200) return false;

  const strongListCue =
    /[,;•*]|\n|\bzwei\b|\bdrei\b|\b2x\b|\b3x\b|\bplus\b|\bdazu\b|\baußerdem\b|\bnoch\s+ein\b|\bje\s+\d+/i.test(t);
  if (strongListCue) return false;

  if (/\bund\b|\boder\b/i.test(t)) return false;

  const dessertCompound =
    /torte|törtchen|kuchen|schoko|schokolade|schnitte|baklava|brownie|muffin|donut|doughnut|croissant|waffel|waffeln|parfait|tiramisu|mousse|tarte|cheesecake|schichtdessert|praline|pralinen|eclair|éclair|schokoladentörtchen|mohntorte|sachertorte|biskuit/i.test(
      t,
    );
  const savoryOnePlate =
    /carbonara|lasagne|lasagna|curry|ragu|ragù|eintopf|auflauf|gratin|risotto|paella|gyros|kebab|käsespätzle|spätzle|pizza|burger|wrap|bowl/i.test(
      t,
    );
  const hyphenProduct = /-/.test(t) && t.split(/\s+/).length <= 10;

  return dessertCompound || savoryOnePlate || hyphenProduct;
}

function stripAiJsonPayload(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1].trim();
  return s;
}

/** Erstes ausgewogenes `{...}` aus Modelltext — robuster als greedy `.match(/\{[\s\S]*\}/)`. */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function extractModelJsonObjectString(content: string): string | null {
  const cleaned = stripAiJsonPayload(String(content ?? ''));
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    /* fall through */
  }
  const bal = extractBalancedJsonObject(cleaned);
  if (!bal) return null;
  try {
    JSON.parse(bal);
    return bal;
  } catch {
    return bal;
  }
}

function parseParsedFoodItemRow(raw: unknown): ParsedFoodItem | null {
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : '';
  const amount = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount ?? '0')) || 0;
  const unit = typeof o.unit === 'string' ? o.unit : 'g';
  if (!name.trim()) return null;
  return normalizeAiParsedFoodPortion({ name: name.trim(), amount, unit });
}

export function extractIngredientsFromAiContent(content: string): ParsedFoodItem[] {
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr) as { ingredients?: unknown };
    const ing = parsed.ingredients;
    if (!Array.isArray(ing)) return [];
    return ing.map(parseParsedFoodItemRow).filter((x): x is ParsedFoodItem => x !== null);
  } catch {
    return [];
  }
}

/** Phase-1-Foto: beobachtete Lebensmittel (freie Namen). */
export function extractVisionObservedFromAiContent(content: string): ParsedFoodItem[] {
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr) as {
      observed?: unknown;
      items?: unknown;
      ingredients?: unknown;
    };
    const arr = parsed.observed ?? parsed.items ?? parsed.ingredients;
    if (!Array.isArray(arr)) return [];
    return arr.map(parseParsedFoodItemRow).filter((x): x is ParsedFoodItem => x !== null);
  } catch {
    return [];
  }
}

/** Minimal fallback when the model returns prose */
export function parseSimpleDescription(description: string): ParsedFoodItem[] {
  const items: ParsedFoodItem[] = [];
  const chunks = description.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb)?$/i);
    if (m) {
      const amt = parseFloat(m[2].replace(',', '.'));
      items.push({ name: m[1].trim(), amount: amt, unit: m[3] || 'g' });
    } else if (chunk.length > 1 && chunk.length < 120) {
      items.push({ name: chunk, amount: 100, unit: 'g' });
    }
  }
  return items;
}

/** Gramm pro „Stück“ für ein Food (optional `perPiece`, sonst inferiert wie manuelles Loggen). */
export function pieceGramsForMatchedFood(food: Food): number {
  const pp = 'perPiece' in food ? (food as Food & { perPiece?: number }).perPiece : undefined;
  return pp && pp > 0 ? pp : inferStueckGramsFromFood(food);
}

/** Gesamt-Gramm aus Anzeige-Menge/Einheit (tl/el/stk/dose/glas/flasche — wie FoodLogModal). */
export function gramsFromQtyUnitForFood(qty: number, unit: string, food: Food): number {
  const u = (unit || 'g').toLowerCase().replace(/\./g, '');
  const stkG = pieceGramsForMatchedFood(food);
  const doseG = inferDoseGramsFromFood(food);
  const glasMl = inferGlasMlFromFood(food);
  const flascheMl = inferFlascheGramsFromFood(food);
  const scheibeG = inferScheibeGramsFromFood(food);
  const portionG = inferPortionGramsFromFood(food);

  const map: Record<string, number | undefined> = {
    g: 1,
    ml: 1,
    tl: 5,
    el: 15,
    stk: stkG,
    stück: stkG,
    stueck: stkG,
    scheibe: scheibeG ?? stkG,
    slice: scheibeG ?? stkG,
    portion: portionG ?? stkG,
    dose: doseG ?? undefined,
    glas: glasMl ?? undefined,
    flasche: flascheMl ?? undefined,
  };
  const mul = map[u];
  if (mul != null && mul > 0) return Math.max(0, qty * mul);

  const fb =
    Math.max(1, food.servings?.find(s => s.grams > 0)?.grams ?? 100);
  if (u === 'dose') return Math.max(0, qty * fb);
  if (u === 'glas') return Math.max(0, qty * (glasMl ?? fb));
  if (u === 'flasche') return Math.max(0, qty * (flascheMl ?? fb));

  return Math.max(0, convertToGrams(qty, unit));
}

/** Baue eine Datenbank-Zutatenzeile aus Menge + Einheit (Nährwerte konsistent zu 100-g-Basis). */
export function ingredientFromFoodQtyUnit(food: Food, qty: number, unit: string): Ingredient {
  const gramsTotal = gramsFromQtyUnitForFood(qty, unit, food);
  const safeGrams = gramsTotal > 0 ? gramsTotal : Math.max(1, food.servings[0]?.grams || 100);
  const ratio = safeGrams / 100;
  const n = food.nutrients;
  const nearestServing =
    food.servings?.length > 0
      ? food.servings.reduce(
          (best, s) => (Math.abs(s.grams - safeGrams) < Math.abs(best.grams - safeGrams) ? s : best),
          food.servings[0],
        )
      : undefined;

  return {
    id: food.id,
    name: food.name,
    amount: qty,
    unit,
    servingName: nearestServing?.name,
    calories: Math.round(n.calories * ratio),
    protein: Math.round(n.protein * ratio * 10) / 10,
    carbs: Math.round(n.carbs * ratio * 10) / 10,
    fat: Math.round(n.fat * ratio * 10) / 10,
    nutrientSource: 'database',
  };
}

const COMPOSITE_FALLBACK_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  ml: 1,
  tl: 5,
  el: 15,
  stk: 100,
  stück: 100,
  stueck: 100,
  scheibe: 35,
  slice: 35,
  dose: 330,
  glas: 200,
  flasche: 500,
  portion: 100,
};

/** Referenz-Gramm einer Zutatenzeile (Pool-Treffer bevorzugt). */
export function referenceGramsForIngredientLine(line: Ingredient, pool: Food[]): number {
  const id = line.id != null ? String(line.id).trim() : '';
  if (id && !id.startsWith('est_')) {
    const f = pool.find(x => x.id === id);
    if (f) return gramsFromQtyUnitForFood(Number(line.amount) || 0, String(line.unit || 'g'), f);
  }
  const nm = String(line.name || '').trim().toLowerCase();
  if (nm) {
    const f = pool.find(x => x.name.trim().toLowerCase() === nm);
    if (f) return gramsFromQtyUnitForFood(Number(line.amount) || 0, String(line.unit || 'g'), f);
  }
  const u = String(line.unit || 'g').toLowerCase();
  const amt = Math.max(0.001, Number(line.amount) || 1);
  return amt * (COMPOSITE_FALLBACK_UNIT_GRAMS[u] ?? 100);
}

/** Summe der Referenzmassen — Skalierungsbasis für Kombi-Lebensmittel. */
export function compositeReferenceGramsTotal(lines: Ingredient[], pool: Food[]): number {
  let g = 0;
  for (const line of lines) g += referenceGramsForIngredientLine(line, pool);
  return Math.max(1, g);
}

/** Nährwerte je 100 g „Mischung“ aus den Referenz-Zutatenzeilen (Kombi-Speichern). */
export function aggregateNutrientsPer100gFromReferenceIngredients(
  lines: Ingredient[],
  pool: Food[],
): Food['nutrients'] {
  const refG = compositeReferenceGramsTotal(lines, pool);
  let tc = 0;
  let tp = 0;
  let tcb = 0;
  let tf = 0;
  for (const line of lines) {
    tc += Number(line.calories) || 0;
    tp += Number(line.protein) || 0;
    tcb += Number(line.carbs) || 0;
    tf += Number(line.fat) || 0;
  }
  const f = 100 / refG;
  return {
    calories: Math.max(0, Math.round(tc * f)),
    protein: Math.max(0, Math.round(tp * f * 10) / 10),
    carbs: Math.max(0, Math.round(tcb * f * 10) / 10),
    fat: Math.max(0, Math.round(tf * f * 10) / 10),
  };
}

function ingredientDedupeKey(i: Ingredient): string {
  const id = i.id != null ? String(i.id).trim() : '';
  const unitNorm = String(i.unit ?? '').trim().toLowerCase();
  if (id) return `id:${id}|${unitNorm}`;
  return `name:${String(i.name).trim().toLowerCase()}|${unitNorm}`;
}

function mergeTwoIngredients(base: Ingredient, add: Ingredient): Ingredient {
  return {
    ...base,
    amount: (Number(base.amount) || 0) + (Number(add.amount) || 0),
    calories: Math.round((base.calories || 0) + (add.calories || 0)),
    protein: Math.round(((base.protein || 0) + (add.protein || 0)) * 10) / 10,
    carbs: Math.round(((base.carbs || 0) + (add.carbs || 0)) * 10) / 10,
    fat: Math.round(((base.fat || 0) + (add.fat || 0)) * 10) / 10,
    nutrientSource:
      base.nutrientSource === 'model_estimate' || add.nutrientSource === 'model_estimate'
        ? 'model_estimate'
        : base.nutrientSource ?? add.nutrientSource,
  };
}

/** Deduplizierung gleicher DB-Zeilen (gleiches id+unit / name+unit). */
export function collapseDuplicateIngredients(lines: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = [];
  for (const line of lines) {
    const key = ingredientDedupeKey(line);
    const idx = out.findIndex(o => ingredientDedupeKey(o) === key);
    if (idx === -1) out.push({ ...line });
    else out[idx] = mergeTwoIngredients(out[idx], line);
  }
  return out;
}

/** Summiert Zutatenzeilen zu einem Ernährungs-Log-Eintrag. */
export function mergeSessionIngredients(lines: Ingredient[]): {
  meal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Ingredient[];
} {
  const merged = collapseDuplicateIngredients(lines);
  const calories = Math.round(merged.reduce((s, i) => s + (i.calories || 0), 0));
  const protein = Math.round(merged.reduce((s, i) => s + (i.protein || 0), 0) * 10) / 10;
  const carbs = Math.round(merged.reduce((s, i) => s + (i.carbs || 0), 0) * 10) / 10;
  const fat = Math.round(merged.reduce((s, i) => s + (i.fat || 0), 0) * 10) / 10;
  const names = merged.map(l => l.name).filter(Boolean);
  let meal: string;
  if (names.length === 0) meal = '—';
  else if (names.length <= 3) meal = names.join(', ');
  else meal = `${names.slice(0, 2).join(', ')} (+${names.length - 2})`;
  meal = meal.slice(0, 200);
  return { meal, calories, protein, carbs, fat, ingredients: merged };
}

/** Parst gespeichertes `composite_ingredients` (user_custom_foods) zu Zutatenzeilen. */
export function compositeIngredientsJsonToLines(ciRaw: unknown): Ingredient[] {
  if (ciRaw == null) return [];
  const arr = typeof ciRaw === 'string' ? (JSON.parse(ciRaw) as unknown) : (ciRaw as unknown);
  if (!Array.isArray(arr)) return [];
  const lines: Ingredient[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const nm = typeof o.name === 'string' ? o.name.trim() : '';
    if (!nm) continue;
    const amount = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount ?? '0')) || 0;
    const unit = typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim() : 'g';
    const id0 = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : undefined;
    const cal = typeof o.calories === 'number' ? o.calories : parseFloat(String(o.calories ?? '0')) || 0;
    const pr = typeof o.protein === 'number' ? o.protein : parseFloat(String(o.protein ?? '0')) || 0;
    const cb = typeof o.carbs === 'number' ? o.carbs : parseFloat(String(o.carbs ?? '0')) || 0;
    const ft = typeof o.fat === 'number' ? o.fat : parseFloat(String(o.fat ?? '0')) || 0;
    const sn = typeof o.servingName === 'string' ? o.servingName : undefined;
    const nsrc =
      o.nutrientSource === 'model_estimate' || o.nutrientSource === 'database' ? o.nutrientSource : undefined;
    lines.push({
      ...(id0 ? { id: id0 } : {}),
      name: nm,
      amount,
      unit,
      ...(sn ? { servingName: sn } : {}),
      calories: Math.round(cal),
      protein: Math.round(pr * 10) / 10,
      carbs: Math.round(cb * 10) / 10,
      fat: Math.round(ft * 10) / 10,
      ...(nsrc ? { nutrientSource: nsrc } : {}),
    });
  }
  return lines;
}

/**
 * Deterministische Signatur für „dieselbe“ Kombination (Reihenfolge egal nach collapse).
 * Nur für DB-verknüpfte Zeilen sinnvoll (siehe ingredientsEligibleForAutoCombo).
 */
export function ingredientComboSignature(lines: Ingredient[]): string {
  const collapsed = collapseDuplicateIngredients(lines.map(l => ({ ...l })));
  const parts = collapsed.map(l => {
    const id = l.id != null ? String(l.id).trim() : '';
    const key = id && !id.startsWith('est_') ? id : `n:${normalizeName(l.name)}`;
    const u = String(l.unit || 'g').trim().toLowerCase();
    const amt = Math.round((Number(l.amount) || 0) * 1000) / 1000;
    return `${key}|${u}|${amt}`;
  });
  parts.sort();
  return parts.join('~');
}

/** Mind. zwei referenzierbare DB-Zeilen, keine reine Modellschätzung. */
export function ingredientsEligibleForAutoCombo(lines: Ingredient[]): boolean {
  const collapsed = collapseDuplicateIngredients(lines.map(l => ({ ...l })));
  if (collapsed.length < 2) return false;
  for (const l of collapsed) {
    const id = l.id != null ? String(l.id).trim() : '';
    if (!id || id.startsWith('est_')) return false;
    if (l.nutrientSource === 'model_estimate') return false;
  }
  return true;
}

/** Beim Loggen: Kombi-Eintrag → skalierteEinzelzutaten. */
export function expandCompositeFoodToIngredients(
  food: Food,
  qty: number,
  unit: string,
  pool: Food[],
): Ingredient[] {
  const comp = food.compositeIngredients;
  if (!comp?.length) return [];
  const refGrams = compositeReferenceGramsTotal(comp, pool);
  const userGrams = gramsFromQtyUnitForFood(qty, unit, food);
  const factor = refGrams > 0 && userGrams > 0 ? userGrams / refGrams : 1;
  const out: Ingredient[] = [];
  for (const line of comp) {
    const id = line.id != null ? String(line.id).trim() : '';
    let sub: Food | undefined;
    if (id && !id.startsWith('est_')) sub = pool.find(x => x.id === id);
    if (!sub) {
      const nm = String(line.name || '').trim().toLowerCase();
      if (nm) sub = pool.find(x => x.name.trim().toLowerCase() === nm);
    }
    if (sub) {
      const g0 = gramsFromQtyUnitForFood(Number(line.amount) || 0, String(line.unit || 'g'), sub);
      const g1 = Math.max(0.01, g0 * factor);
      out.push(ingredientFromFoodQtyUnit(sub, g1, 'g'));
    } else {
      out.push({
        ...line,
        amount: Math.max(0.01, (Number(line.amount) || 0) * factor),
        calories: Math.round((line.calories || 0) * factor),
        protein: Math.round((line.protein || 0) * factor * 10) / 10,
        carbs: Math.round((line.carbs || 0) * factor * 10) / 10,
        fat: Math.round((line.fat || 0) * factor * 10) / 10,
      });
    }
  }
  return collapseDuplicateIngredients(out);
}

function foodNameHintsCondiment(name: string): boolean {
  return /senf|ketchup|mayo|dressing|so(ß|s)e|sauce|essig|\böl\b|olivenöl|salz|pfeffer|gewürz|kräuter|pesto|remoulade|dip/i.test(
    name.toLowerCase(),
  );
}

/**
 * Obere/untere Gramm-Grenze nach DB-Zeile — begrenzt extrem falsche KI-Mengen beim Nährwert-Mapping.
 */
export function clampTotalGramsForAiMatchedFood(grams: number, food: Food): number {
  if (!Number.isFinite(grams)) return Math.max(1, food.servings[0]?.grams || 100);
  const g0 = Math.max(0, grams);
  const n = food.name.toLowerCase();
  const condiment =
    food.category === 'sauce' ||
    food.category === 'spice' ||
    food.category === 'fat' ||
    foodNameHintsCondiment(n);
  let maxG: number;
  if (condiment) maxG = 180;
  else if (food.category === 'drink') maxG = 1800;
  else if (food.category === 'fruit' || food.category === 'vegetable') maxG = 750;
  else if (food.category === 'protein') maxG = 850;
  else if (food.category === 'bakery' || food.category === 'sweets') maxG = 550;
  else if (food.category === 'snack') maxG = 700;
  else maxG = 1100;

  let minG = 10;
  if (condiment) minG = 2;
  if (food.category === 'drink') minG = 20;

  return Math.min(maxG, Math.max(minG, g0));
}

/** Untere Grenze & typische Abendessen-Portion — verhindert 25 g Flügel / 0,25 stk. */
export function ensureRealisticMealGrams(grams: number, food: Food, phrase: string): number {
  const typical = estimateTypicalMealGramsForPhrase(phrase);
  const ctx = `${food.name} ${phrase}`.toLowerCase();
  let floor = 10;
  if (food.category === 'protein' || /\bflügel|wing|hähnchen|chicken|pute|schnitzel|steak|fisch/i.test(ctx)) {
    floor = Math.min(typical, 120);
  }
  if (/\bkroketten|pommes|frites\b/i.test(ctx)) floor = Math.min(typical, 100);
  if (/\b(5|10)\s*kg\b/i.test(food.name.toLowerCase()) && grams < 100) return typical;
  if (!Number.isFinite(grams) || grams <= 0) return typical;
  if (grams < floor) return typical;
  return grams;
}

/** Standard-Menge nach Einheitswechsel (g/ml → 100, sonst → 1). */
export function defaultQuantityForNutritionUnit(unit: string): number {
  const u = (unit || '').toLowerCase();
  if (u === 'g' || u === 'ml') return 100;
  return 1;
}

export function ingredientFromParsedItem(item: ParsedFoodItem, matchedFood: Food): Ingredient {
  const norm = normalizeAiParsedFoodPortion(item);
  const rawUnit = (norm.unit || 'g').toLowerCase();
  let gramsAmount: number;
  if (/\bstk\b|stück|stueck|piece|pc\b/.test(rawUnit)) {
    gramsAmount = Math.max(0, norm.amount * pieceGramsForMatchedFood(matchedFood));
  } else {
    gramsAmount = convertToGrams(norm.amount, norm.unit || 'g');
  }
  if (!Number.isFinite(gramsAmount) || gramsAmount <= 0) {
    gramsAmount = matchedFood.servings[0]?.grams || 100;
  }
  gramsAmount = ensureRealisticMealGrams(gramsAmount, matchedFood, norm.name);
  gramsAmount = clampTotalGramsForAiMatchedFood(gramsAmount, matchedFood);

  let preferredUnit = inferDefaultLogPortionForFood(matchedFood).unit;
  const perUnit = gramsFromQtyUnitForFood(1, preferredUnit, matchedFood);
  const safePer =
    perUnit > 0 ? perUnit : Math.max(1, matchedFood.servings?.find(s => s.grams > 0)?.grams ?? 100);

  if (preferredUnit === 'stk') {
    const asStk = gramsAmount / safePer;
    if (asStk < 1) {
      preferredUnit = 'g';
      return ingredientFromFoodQtyUnit(matchedFood, Math.round(gramsAmount), 'g');
    }
    const qtyRounded = Math.max(1, Math.round(asStk));
    return ingredientFromFoodQtyUnit(matchedFood, qtyRounded, preferredUnit);
  }

  const qty = Math.max(0.25, gramsAmount / safePer);
  const qtyRounded = Math.round(qty * 1000) / 1000;
  return ingredientFromFoodQtyUnit(matchedFood, qtyRounded, preferredUnit);
}

/**
 * Erst KI-Kandidaten-Pool (exakt), dann gesamte App-Datenbank inkl. Nutzer-Einträge (exakt).
 * Optional Fuzzy (`allowFuzzyDbMatch`): älteres Verhalten — kann „halb passende“ Einträge treffen.
 * Für `/api/ai/analyze-meal` ist Fuzzy standardmäßig aus — ohne exakten Treffer → Forschungs-Pfad / Vorschläge → wachsende Nutzer-DB.
 */
export function resolveParsedAgainstLocalFoodDb(
  items: ParsedFoodItem[],
  candidateFoods: Food[],
  fullPool: Food[],
  options?: { allowFuzzyDbMatch?: boolean },
): { ingredients: Ingredient[]; unmatched: ParsedFoodItem[] } {
  const allowFuzzy = options?.allowFuzzyDbMatch ?? true;
  const ingredients: Ingredient[] = [];
  const unmatched: ParsedFoodItem[] = [];

  for (const item of items) {
    const row = normalizeAiParsedFoodPortion(item);
    let matched: Food | null = matchFoodExactFromPool(row.name, candidateFoods);
    if (!matched) matched = matchFoodExactFromPool(row.name, fullPool);
    if (!matched && allowFuzzy) {
      const offPool = fullPool.filter(f => isOpenFoodFactsFood(f));
      matched =
        findBestSemanticFoodForPhrase(row.name, offPool.length > 0 ? offPool : fullPool) ??
        findBestFoodMatch(row.name, fullPool);
    }
    if (matched) ingredients.push(ingredientFromParsedItem(row, matched));
    else unmatched.push(row);
  }

  return { ingredients, unmatched };
}

function fallbackMacroEstimateForCategory(cat: Food['category']): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  switch (cat) {
    case 'drink':
      return { calories: 55, protein: 2, carbs: 9, fat: 0.5 };
    case 'fruit':
    case 'vegetable':
      return { calories: 65, protein: 1.2, carbs: 14, fat: 0.4 };
    case 'protein':
      return { calories: 175, protein: 24, carbs: 2, fat: 8 };
    case 'sweets':
    case 'bakery':
      return { calories: 340, protein: 5, carbs: 45, fat: 15 };
    case 'fat':
      return { calories: 420, protein: 0.5, carbs: 0, fat: 46 };
    default:
      return { calories: 230, protein: 9, carbs: 24, fat: 10 };
  }
}

export function extractResearchProposalsFromAi(
  content: string,
  fallbackUnmatched: ParsedFoodItem[],
): ProposedDbFood[] {
  const fallbackDisclaimer =
    'Unverifizierte Schätzung: KI-Antwort war nicht als JSON nutzbar. Keine externe Datenquelle.';
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) throw new Error('no json');
    const parsed = JSON.parse(jsonStr) as { items?: unknown; disclaimer?: string };
    const disc =
      typeof parsed.disclaimer === 'string' && parsed.disclaimer.trim()
        ? parsed.disclaimer.trim()
        : RESEARCH_DISCLAIMER_DE;
    const items = parsed.items;
    if (!Array.isArray(items) || items.length === 0) throw new Error('no items');
    const out: ProposedDbFood[] = [];
    let idx = 0;
    for (const raw of items) {
      const o = raw as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) continue;
      const amountRaw = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount ?? '0')) || 0;
      const unitRaw = typeof o.unit === 'string' ? o.unit : 'g';
      const nrm = normalizeAiParsedFoodPortion({
        name,
        amount: amountRaw > 0 ? amountRaw : 100,
        unit: unitRaw,
      });
      const amount = nrm.amount > 0 ? nrm.amount : 100;
      const unit = nrm.unit;
      const categoryRaw = typeof o.category === 'string' ? o.category : undefined;
      const category = coerceFoodCategory(categoryRaw);
      const key = `prop_${normalizeName(name).replace(/[^a-z0-9äöüß]+/gi, '_')}_${idx++}`;
      let calories = Math.round(
        typeof o.calories === 'number' ? o.calories : parseFloat(String(o.calories ?? '0')) || 0,
      );
      let protein = typeof o.protein === 'number' ? o.protein : parseFloat(String(o.protein ?? '0')) || 0;
      let carbs = typeof o.carbs === 'number' ? o.carbs : parseFloat(String(o.carbs ?? '0')) || 0;
      let fat = typeof o.fat === 'number' ? o.fat : parseFloat(String(o.fat ?? '0')) || 0;
      if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) {
        const fb = fallbackMacroEstimateForCategory(category);
        calories = fb.calories;
        protein = fb.protein;
        carbs = fb.carbs;
        fat = fb.fat;
      }
      out.push({
        key,
        name,
        amount: amount > 0 ? amount : 100,
        unit,
        calories: Math.max(0, calories),
        protein: Math.max(0, Math.round(protein * 10) / 10),
        carbs: Math.max(0, Math.round(carbs * 10) / 10),
        fat: Math.max(0, Math.round(fat * 10) / 10),
        category,
        disclaimer: disc,
      });
    }
    return out;
  } catch {
    const fb = fallbackMacroEstimateForCategory('readymeal');
    return fallbackUnmatched.map((item, i) => {
      const nrm = normalizeAiParsedFoodPortion({
        name: item.name,
        amount: item.amount > 0 ? item.amount : 100,
        unit: item.unit || 'g',
      });
      return {
        key: `prop_fb_${normalizeName(item.name).replace(/[^a-z0-9äöüß]+/gi, '_')}_${i}`,
        name: nrm.name,
        amount: nrm.amount > 0 ? nrm.amount : 100,
        unit: nrm.unit,
        calories: fb.calories,
        protein: fb.protein,
        carbs: fb.carbs,
        fat: fb.fat,
        category: 'readymeal',
        disclaimer: fallbackDisclaimer,
      };
    });
  }
}

export function dedupeProposedFoodsAgainstPool(proposed: ProposedDbFood[], fullPool: Food[]): ProposedDbFood[] {
  return proposed.filter(p => {
    if (matchFoodExactFromPool(p.name, fullPool)) return false;
    const fuzzy = findBestFoodMatch(p.name, fullPool);
    if (!fuzzy) return true;
    if (!parenMatchAllowsDbLink(p.name, fuzzy.name)) return true;
    const d = levenshteinDistance(normalizeName(p.name), normalizeName(fuzzy.name));
    return d > 1;
  });
}

function dedupeProposedByNormalizedName(proposed: ProposedDbFood[]): ProposedDbFood[] {
  const seen = new Set<string>();
  const out: ProposedDbFood[] = [];
  for (const p of proposed) {
    const k = normalizeName(p.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export function finalizeProposedDbFoods(raw: ProposedDbFood[], fullPool: Food[]): ProposedDbFood[] {
  return dedupeProposedByNormalizedName(dedupeProposedFoodsAgainstPool(raw, fullPool));
}

export function mapParsedToIngredients(
  items: ParsedFoodItem[],
  options?: { restrictToFoods?: Food[]; strictPoolMatch?: boolean },
): Ingredient[] {
  const validatedIngredients: Ingredient[] = [];
  const pool = options?.restrictToFoods;
  const strict = options?.strictPoolMatch ?? Boolean(pool?.length);

  for (const item of items) {
    const matchedFood =
      strict && pool?.length
        ? matchFoodExactFromPool(item.name, pool)
        : findBestFoodMatch(item.name, pool ?? []);

    if (!matchedFood) {
      console.warn(`mealAi: no DB match for "${item.name}"`);
      continue;
    }
    validatedIngredients.push(ingredientFromParsedItem(item, matchedFood));
  }

  return validatedIngredients;
}

export function nutrientsPer100gFromProposedPortion(p: ProposedDbFood): Food['nutrients'] {
  const grams = convertToGrams(p.amount, p.unit || 'g');
  const factor = grams > 0 ? 100 / grams : 1;
  return {
    calories: Math.max(0, Math.round(p.calories * factor)),
    protein: Math.max(0, Math.round(p.protein * factor * 10) / 10),
    carbs: Math.max(0, Math.round(p.carbs * factor * 10) / 10),
    fat: Math.max(0, Math.round(p.fat * factor * 10) / 10),
  };
}

/** Minimal `Food` für UI (Zutaten-Picker), wenn nur ein KI-Vorschlag ohne DB-Zeile existiert. */
export function syntheticFoodFromProposedDbFood(p: ProposedDbFood): Food {
  const unitLower = (p.unit || 'g').toLowerCase();
  const isStkUnit =
    unitLower.includes('stk') || unitLower.includes('stück') || unitLower.includes('stueck');
  const perPiece =
    typicalGramsPerPieceFromProductName(p.name) ??
    (isLikelyWholePieceSmokedOrCookedSausageName(p.name) ? 55 : null);

  let totalGrams: number;
  if (isStkUnit && p.amount > 0) {
    const pp = perPiece ?? 85;
    totalGrams = Math.max(1, Math.round(p.amount * pp));
  } else {
    totalGrams = Math.max(1, Math.round(convertToGrams(p.amount, p.unit || 'g')));
  }

  const nutrients = nutrientsPer100gFromProposedPortion({
    ...p,
    amount: totalGrams,
    unit: 'g',
  });

  const servings: Food['servings'] = [{ name: '100 g', grams: 100 }];
  if (perPiece != null && perPiece >= 25 && perPiece <= 200) {
    servings.unshift({ name: `1 Stk. (${perPiece} g)`, grams: perPiece });
  }

  return {
    id: `est_${p.key}`,
    name: p.name,
    category: coerceFoodCategory(p.category),
    nutrients,
    servings,
  };
}

/** Ingredient-Zeile für geloggte Mahlzeit aus KI-Vorschlag (nicht in der Food-DB). */
export function ingredientFromProposedDbFood(p: ProposedDbFood): Ingredient {
  return {
    id: `est_${p.key}`,
    name: p.name,
    amount: p.amount,
    unit: p.unit,
    servingName: 'Schätzung',
    calories: p.calories,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    nutrientSource: 'model_estimate',
  };
}

/** Server + Client gleiche Logik zur JSON-Extraktion */
export function parseCustomFoodDraftFromAi(content: string, fallbackQuery: string): CustomFoodDraft {
  const q0 = fallbackQuery.trim() || 'Neues Lebensmittel';
  const fallbackDisclaimer =
    'Unverifizierte Schätzung: KI-Antwort war nicht sauber strukturierbar. Bitte Werte vor dem Speichern prüfen.';
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) throw new Error('no json');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const categoryRaw = typeof parsed.category === 'string' ? parsed.category : 'readymeal';
    const nper = parsed.nutrients_per_100g as Record<string, unknown> | undefined;
    const cal = typeof nper?.calories === 'number' ? nper.calories : parseFloat(String(nper?.calories ?? 'NaN'));
    const pr = typeof nper?.protein === 'number' ? nper.protein : parseFloat(String(nper?.protein ?? 'NaN'));
    const cb = typeof nper?.carbs === 'number' ? nper.carbs : parseFloat(String(nper?.carbs ?? 'NaN'));
    const ft = typeof nper?.fat === 'number' ? nper.fat : parseFloat(String(nper?.fat ?? 'NaN'));
    const disclaim =
      typeof parsed.disclaimer === 'string' && parsed.disclaimer.trim() ? parsed.disclaimer.trim() : fallbackDisclaimer;

    const servingsRaw = parsed.servings;
    const servingsOut: Food['servings'] = [];
    if (Array.isArray(servingsRaw)) {
      for (const row of servingsRaw) {
        const o = row as Record<string, unknown>;
        const sn = typeof o.name === 'string' ? o.name.trim() : '';
        const gm = typeof o.grams === 'number' ? o.grams : parseFloat(String(o.grams ?? 'NaN'));
        if (!sn || !Number.isFinite(gm)) continue;
        const gRounded = Math.max(1, Math.min(2500, Math.round(gm)));
        servingsOut.push({ name: sn, grams: gRounded });
      }
    }

    let servings = servingsOut.filter(s => Number.isFinite(s.grams));
    const hasSmall = servings.some(s => Math.abs(s.grams - 100) <= 2);
    if (!hasSmall) servings = [{ name: '100 g', grams: 100 }, ...servings];

    const def = parsed.default_portion as Record<string, unknown> | undefined;
    const amt = typeof def?.amount === 'number' ? def.amount : parseFloat(String(def?.amount ?? 'NaN'));
    const unitRaw = typeof def?.unit === 'string' ? def.unit.trim().toLowerCase() : 'g';
    const allowed = new Set(['g', 'ml', 'stk', 'dose', 'glas', 'flasche', 'tl', 'el']);
    const unit = allowed.has(unitRaw) ? unitRaw : 'g';
    let defaultAmount = Number.isFinite(amt) && amt > 0 ? amt : unit === 'g' || unit === 'ml' ? 100 : 1;

    const gppRaw = parsed.grams_per_piece;
    let gramsPerPiece: number | undefined;
    const gpp =
      typeof gppRaw === 'number' ? gppRaw : gppRaw == null ? NaN : parseFloat(String(gppRaw));
    if (Number.isFinite(gpp) && gpp > 0) gramsPerPiece = Math.round(Math.min(2000, gpp));

    if (unit === 'stk' && gramsPerPiece == null) {
      const h = typicalGramsPerPieceFromProductName(name);
      if (h != null) gramsPerPiece = h;
    }

    if (!name) throw new Error('no name');

    return {
      name,
      category: coerceFoodCategory(categoryRaw),
      nutrientsPer100g: {
        calories: Math.max(0, Math.round(Number.isFinite(cal) ? cal : 0)),
        protein: Math.max(0, Math.round((Number.isFinite(pr) ? pr : 0) * 10) / 10),
        carbs: Math.max(0, Math.round((Number.isFinite(cb) ? cb : 0) * 10) / 10),
        fat: Math.max(0, Math.round((Number.isFinite(ft) ? ft : 0) * 10) / 10),
      },
      servings: servings.length > 0 ? servings : [{ name: '100 g', grams: 100 }],
      defaultAmount,
      defaultUnit: unit,
      ...(gramsPerPiece !== undefined ? { gramsPerPiece } : {}),
      disclaimer: disclaim,
    };
  } catch {
    return {
      name: q0,
      category: 'readymeal',
      nutrientsPer100g: { calories: 240, protein: 7, carbs: 40, fat: 5 },
      servings: [{ name: '100 g', grams: 100 }],
      defaultAmount: 100,
      defaultUnit: 'g',
      disclaimer: fallbackDisclaimer,
    };
  }
}

export function syntheticFoodFromCustomDraft(draft: CustomFoodDraft, idSuffix: string): Food {
  const servings = draft.servings.length > 0 ? draft.servings : [{ name: '100 g', grams: 100 }];
  const base: Food & { perPiece?: number } = {
    id: `ucf_preview_${idSuffix}`,
    name: draft.name.trim(),
    category: coerceFoodCategory(draft.category),
    nutrients: { ...draft.nutrientsPer100g },
    servings,
  };
  if (draft.gramsPerPiece && draft.gramsPerPiece > 0) base.perPiece = draft.gramsPerPiece;
  return base;
}
