import { lookupDefaultPortion } from './defaultPortionLookup';

export type PieceContext = {
  foodName: string;
  servingSize?: string | null;
  estimatedGrams?: number;
  gramReasoning?: string | null;
  estimatedPieceCount?: number | null;
  gramsPerPiece?: number | null;
};

/** Lebensmittel, die fast immer nur in Gramm/ml sinnvoll sind. */
export function isGramOnlyFood(name: string): boolean {
  const key = name.trim().toLowerCase();
  return /(senf|sauce|dressing|dip|mayo|mayonnaise|ketchup|öl|ol\b|butter|margarine|joghurt|quark|milch|whey|proteinpulver|pulver|mehl|zucker|honig|sirup|k[aä]se\s*(streuer|gerieben)|reis\b|nudeln|pasta\b|haferflocken|müsli\b|salat\s*blatt|spinat|kraut|remoulade|pesto|tahini|hummus|avocadopüree)/.test(
    key,
  );
}

/** Aufschnitt / Scheibenware – Stück = Scheibe in der UI. */
export function isSliceCountedFood(name: string): boolean {
  const key = name.trim().toLowerCase();
  return /(leberk[aä]se|fleischk[aä]se|schinken|salami|aufschnitt|mortadella|lyoner|wurstscheibe|kochschinken|pute|schwarzw[aä]lder|tiroler|emmentaler|gouda|cheddar|edamer|k[aä]se(?!\s*(soße|sauce|spread|creme|dip)))/.test(
    key,
  );
}

/** OFF serving_size only counts as piece weight when it clearly describes a piece/slice. */
export function parsePieceGramsFromServingSize(servingSize?: string | null): number | null {
  if (!servingSize) return null;
  if (!/(stück|stk|piece|scheibe|slice)/i.test(servingSize)) return null;
  const m = servingSize.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export type ParsedPieceHints = {
  pieceCount: number | null;
  gramsPerPiece: number | null;
};

/** Liest Stückzahl / g pro Stück aus KI-gram_reasoning. */
export function parsePieceHintsFromReasoning(text: string): ParsedPieceHints {
  const t = text.trim();
  if (!t) return { pieceCount: null, gramsPerPiece: null };

  const perPiece = t.match(
    /(\d+(?:[.,]\d+)?)\s*g\s*(?:pro|je|\/)\s*(?:stück|stk|stueck|scheibe|slice|piece)/i,
  );
  if (perPiece) {
    const gramsPerPiece = Number(perPiece[1].replace(',', '.'));
    if (Number.isFinite(gramsPerPiece) && gramsPerPiece >= 8 && gramsPerPiece <= 600) {
      return { pieceCount: null, gramsPerPiece: Math.round(gramsPerPiece) };
    }
  }

  const countWithUnit = t.match(
    /(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(?:stück|stk|stueck|scheiben?|slices?|pieces?)\b/i,
  );
  if (countWithUnit) {
    const pieceCount = Number(countWithUnit[1].replace(',', '.'));
    if (Number.isFinite(pieceCount) && pieceCount > 0 && pieceCount <= 50) {
      return { pieceCount, gramsPerPiece: null };
    }
  }

  const wordCount =
    /\b(zwei|2)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|bananen?|äpfel|apfel|eier?|leberk[aä]se|fleischk[aä]se)\b/i.test(
      t,
    ) ||
    /\b(drei|3)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|bananen?|eier?|scheiben?)\b/i.test(t) ||
    /\b(vier|4)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|eier?)\b/i.test(t);
  if (wordCount) {
    const m = t.match(/\b(zwei|drei|vier|2|3|4)\b/i);
    const map: Record<string, number> = { zwei: 2, drei: 3, vier: 4, '2': 2, '3': 3, '4': 4 };
    const pieceCount = m ? map[m[1].toLowerCase()] ?? null : 2;
    if (pieceCount) return { pieceCount, gramsPerPiece: null };
  }

  const singlePiece = /\b(?:1|ein|eine)\s+(?:stück|stk|stueck|scheibe|banane|apfel|ei\b|semmel|brötchen|broetchen|leberk[aä]se|fleischk[aä]se)\b/i.test(
    t,
  );
  if (singlePiece) return { pieceCount: 1, gramsPerPiece: null };

  return { pieceCount: null, gramsPerPiece: null };
}

function clampPieceGrams(value: number): number | null {
  if (!Number.isFinite(value) || value < 8 || value > 600) return null;
  return Math.max(8, Math.round(value));
}

function perPieceFromCountAndGrams(pieceCount: number, totalGrams: number): number | null {
  if (pieceCount <= 0 || totalGrams <= 0) return null;
  return clampPieceGrams(totalGrams / pieceCount);
}

const DEFAULT_PIECE_GRAMS = 100;
const GRAM_ONLY_PIECE_GRAMS = 15;

/** Immer ein Stückgewicht für Review / Toggle — auch wenn OFF/Generic nichts liefert. */
export function ensurePieceGramsForReview(ctx: PieceContext): number {
  const resolved = resolvePieceGrams(ctx);
  if (resolved) return resolved;

  const fromCatalog = lookupDefaultPortion(ctx.foodName);
  if (fromCatalog?.grams && fromCatalog.grams >= 8 && fromCatalog.grams <= 600) {
    return Math.round(fromCatalog.grams);
  }

  if (ctx.estimatedGrams != null && ctx.estimatedGrams >= 8 && ctx.estimatedGrams <= 600) {
    return Math.round(ctx.estimatedGrams);
  }

  if (isGramOnlyFood(ctx.foodName)) return GRAM_ONLY_PIECE_GRAMS;
  return DEFAULT_PIECE_GRAMS;
}

export function inferPieceGramsFromFoodName(name: string): number | null {
  if (isGramOnlyFood(name)) return null;
  const key = name.trim().toLowerCase();
  if (/zwiebel/.test(key)) return 80;
  if (/knoblauch/.test(key)) return 5;
  if (/paprika|peperoni|chili\b/.test(key)) return 150;
  if (/tomate/.test(key)) return 120;
  if (/gurke/.test(key)) return 200;
  if (/kartoffel/.test(key)) return 150;
  if (/karotte|möhre|moehre/.test(key)) return 80;
  if (/zucchini|aubergine/.test(key)) return 250;
  if (/brokkoli|blumenkohl/.test(key)) return 250;
  if (/hähnchen|haehnchen|huhn|pute/.test(key) && /brust|filet|schnitzel/.test(key)) return 150;
  if (/semmel/.test(key)) return 60;
  if (/brezel|breze/.test(key)) return 85;
  if (/fleischk[aä]se/.test(key)) return 25;
  if (/leberk[aä]se/.test(key)) return 55;
  if (/schinken|kochschinken|pute/.test(key)) return 20;
  if (/salami|lyoner|mortadella|aufschnitt/.test(key)) return 20;
  const fromCatalog = lookupDefaultPortion(name);
  if (fromCatalog && (fromCatalog.unit === 'stk' || fromCatalog.unit === 'scheibe')) {
    return Math.max(1, Math.round(fromCatalog.grams));
  }
  if (
    /(br[oö]tchen|weckerl|croissant|banane|apfel|ei\b|eier\b|wrap|tortilla|muffin|keks|waffel|bagel|donut|pizza|avocado|tomate|gurke|wurst|würstchen|nugget|schnitzel|kotelett|steak|burger\b|riegel|pfannkuchen|pancake)/.test(
      key,
    )
  ) {
    if (/ei\b|eier/.test(key)) return 55;
    if (/banane/.test(key)) return 120;
    if (/apfel/.test(key)) return 170;
    if (/br[oö]tchen|weckerl/.test(key)) return 60;
    if (/pizza/.test(key)) return 120;
    if (/avocado/.test(key)) return 80;
  }
  return null;
}

/** Stückgewicht: KI → Reasoning → OFF → Standardportionen. */
export function resolvePieceGrams(ctx: PieceContext): number | null {
  if (isGramOnlyFood(ctx.foodName)) return null;

  if (ctx.gramsPerPiece != null && ctx.gramsPerPiece > 0) {
    const g = clampPieceGrams(ctx.gramsPerPiece);
    if (g) return g;
  }

  if (ctx.estimatedPieceCount != null && ctx.estimatedPieceCount > 0 && ctx.estimatedGrams != null) {
    const g = perPieceFromCountAndGrams(ctx.estimatedPieceCount, ctx.estimatedGrams);
    if (g) return g;
  }

  const fromReasoning = parsePieceHintsFromReasoning(ctx.gramReasoning ?? '');
  if (fromReasoning.gramsPerPiece) {
    const g = clampPieceGrams(fromReasoning.gramsPerPiece);
    if (g) return g;
  }
  if (fromReasoning.pieceCount && ctx.estimatedGrams != null) {
    const g = perPieceFromCountAndGrams(fromReasoning.pieceCount, ctx.estimatedGrams);
    if (g) return g;
  }

  const fromServing = parsePieceGramsFromServingSize(ctx.servingSize);
  if (fromServing) return fromServing;

  return inferPieceGramsFromFoodName(ctx.foodName);
}

/** @deprecated Nutze resolvePieceGrams mit vollem Kontext. */
export function resolvePieceGramsForFood(foodName: string, servingSize?: string | null): number | null {
  return resolvePieceGrams({ foodName, servingSize });
}

/** True when grams are already close to a 0.25-piece grid for this piece weight. */
export function gramsAlignWithPieceQuantity(grams: number, pieceGrams: number): boolean {
  if (!Number.isFinite(grams) || grams <= 0 || pieceGrams <= 0) return false;
  const qty = grams / pieceGrams;
  const snapped = Math.max(0.25, Math.round(qty * 4) / 4);
  return Math.abs(qty - snapped) <= 0.12;
}

/** Bevorzugt Stück — Stückgewicht ist immer verfügbar (ensurePieceGramsForReview). */
export function defaultDisplayUnitForGrams(_ctx: PieceContext): 'g' | 'piece' {
  return 'piece';
}

export function pieceQuantityFromGrams(grams: number, pieceGrams: number): number {
  return Math.max(0.25, Math.round((grams / pieceGrams) * 4) / 4);
}

export function gramsFromPieceQuantity(quantity: number, pieceGrams: number): number {
  const q = Math.max(0.25, Math.round(quantity * 4) / 4);
  return Math.max(1, Math.round(q * pieceGrams));
}

export function pieceContextFromAnalysis(
  foodName: string,
  servingSize: string | null | undefined,
  estimatedGrams: number,
  analysis?: {
    gram_reasoning?: string;
    estimated_piece_count?: number | null;
    grams_per_piece?: number | null;
  } | null,
): PieceContext {
  return {
    foodName,
    servingSize,
    estimatedGrams,
    gramReasoning: analysis?.gram_reasoning ?? null,
    estimatedPieceCount: analysis?.estimated_piece_count ?? null,
    gramsPerPiece: analysis?.grams_per_piece ?? null,
  };
}
