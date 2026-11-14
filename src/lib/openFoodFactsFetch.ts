/**
 * Server-seitige Open-Food-Facts-Abfragen (auch für KI-Kandidaten).
 * Kein API-Key nötig — aber OFF blockiert veraltete/anonyme Endpunkte teilweise.
 */

import {
  mapOpenFoodFactsProduct,
  mapOpenFoodFactsSearchHit,
  normalizeOffSearchQuery,
  OFF_USER_AGENT,
  type OffProductPayload,
} from './openFoodFacts';

import type { Food } from './foodDatabase';

export class OpenFoodFactsFetchError extends Error {
  constructor(
    message: string,
    readonly code: 'rate_limited' | 'unavailable' | 'network',
  ) {
    super(message);
    this.name = 'OpenFoodFactsFetchError';
  }
}

const OFF_FETCH_TIMEOUT_MS = 12_000;
const OFF_RETRY_ATTEMPTS = 2;
const OFF_RETRY_DELAY_MS = 600;

function offHeaders(): HeadersInit {
  return { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' };
}

function offFetchSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(OFF_FETCH_TIMEOUT_MS);
  }
  return undefined;
}

function isOffBlockedHtml(text: string): boolean {
  return (
    text.includes('Page temporarily unavailable') ||
    text.includes('not available to anonymous users') ||
    text.includes('Seite vorübergehend nicht verfügbar')
  );
}

async function parseJsonResponse<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (isOffBlockedHtml(text)) {
    throw new OpenFoodFactsFetchError('Open Food Facts rate limit / anonymous block', 'rate_limited');
  }
  if (!r.ok) {
    throw new OpenFoodFactsFetchError(`Open Food Facts HTTP ${r.status}`, r.status === 429 ? 'rate_limited' : 'unavailable');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OpenFoodFactsFetchError('Invalid JSON from Open Food Facts', 'unavailable');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOffError(err: unknown): boolean {
  return (
    err instanceof OpenFoodFactsFetchError &&
    (err.code === 'rate_limited' || err.code === 'network' || err.code === 'unavailable')
  );
}

async function withOffRetries<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= OFF_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt >= OFF_RETRY_ATTEMPTS || !isRetryableOffError(err)) throw err;
      await sleep(OFF_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw last;
}

function mapHits(products: OffProductPayload[]): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const hit of products) {
    try {
      const food = mapOpenFoodFactsSearchHit(hit);
      if (!food || seen.has(food.id)) continue;
      seen.add(food.id);
      out.push(food);
    } catch (err) {
      console.warn('OFF map hit skipped:', hit.code, err);
    }
  }
  return out;
}

/** Primär: search-a-licious (empfohlene OFF-Suche, funktioniert für anonyme Apps). */
async function searchViaSearchALicious(
  query: string,
  pageSize: number,
): Promise<{ foods: Food[]; rawHits: number }> {
  const q = normalizeOffSearchQuery(query);
  const params = new URLSearchParams({
    q,
    size: String(Math.min(50, Math.max(1, pageSize))),
  });
  const url = `https://search.openfoodfacts.org/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse<{ hits?: OffProductPayload[] }>(r);
  const hits = data.hits ?? [];
  return { foods: mapHits(hits), rawHits: hits.length };
}

/** Fallback: API v2 search (Rate-Limit, kann für anonyme IPs blockieren). */
async function searchViaApiV2(
  query: string,
  pageSize: number,
): Promise<{ foods: Food[]; rawHits: number }> {
  const params = new URLSearchParams({
    search_terms: normalizeOffSearchQuery(query),
    page_size: String(Math.min(50, Math.max(1, pageSize))),
    fields:
      'code,product_name,product_name_de,brands,quantity,product_quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments,nutrient_levels,nutriscore_grade,nova_group',
  });
  const url = `https://world.openfoodfacts.org/api/v2/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse<{ products?: OffProductPayload[] }>(r);
  const products = data.products ?? [];
  return { foods: mapHits(products), rawHits: products.length };
}

export type OffCatalogFetchResult = {
  foods: Food[];
  rawHitCount: number;
};

/** OFF-Suche inkl. Roh-Trefferzahl (für Diagnose wenn Mapping alles verwirft). */
export async function fetchOffCatalogFoods(query: string, pageSize = 32): Promise<OffCatalogFetchResult> {
  const q = query.trim();
  if (q.length < 2) return { foods: [], rawHitCount: 0 };

  let rawHitCount = 0;
  try {
    const primary = await withOffRetries(() => searchViaSearchALicious(q, pageSize));
    rawHitCount = primary.rawHits;
    if (primary.foods.length > 0) return { foods: primary.foods, rawHitCount };
    if (rawHitCount > 0) {
      console.warn('OFF: search-a-licious hits could not be mapped', { q, rawHitCount });
    }
  } catch (primaryErr) {
    if (primaryErr instanceof OpenFoodFactsFetchError && primaryErr.code === 'rate_limited') {
      throw primaryErr;
    }
  }

  try {
    const fallback = await withOffRetries(() => searchViaApiV2(q, pageSize));
    rawHitCount = Math.max(rawHitCount, fallback.rawHits);
    return { foods: fallback.foods, rawHitCount };
  } catch (fallbackErr) {
    if (fallbackErr instanceof OpenFoodFactsFetchError) throw fallbackErr;
    throw new OpenFoodFactsFetchError(
      fallbackErr instanceof Error ? fallbackErr.message : 'Open Food Facts search failed',
      'network',
    );
  }
}

export async function fetchOpenFoodFactsByBarcode(code: string): Promise<Food | null> {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${digits}?fields=code,product_name,product_name_de,brands,quantity,product_quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments,nutrient_levels,nutriscore_grade,nova_group`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse<{ status?: number; product?: OffProductPayload }>(r);
  if (data.status !== 1 || !data.product) return null;
  return mapOpenFoodFactsProduct(data.product, digits);
}

export async function searchOpenFoodFactsProducts(query: string, pageSize = 16): Promise<Food[]> {
  const { foods } = await fetchOffCatalogFoods(query, pageSize);
  return foods;
}

export type OffParallelSearchOptions = {
  maxQueries?: number;
  concurrency?: number;
  pageSize?: number;
  onQueryDone?: (done: number, total: number, query: string) => void;
};

export type OffParallelSearchResult = {
  foods: Food[];
  queriesAttempted: number;
  queriesFailed: number;
  lastError?: OpenFoodFactsFetchError;
};

/** Mehrere OFF-Suchen parallel (dedupliziert, mit Limit). */
export async function searchOpenFoodFactsProductsParallel(
  queries: string[],
  opts?: OffParallelSearchOptions,
): Promise<OffParallelSearchResult> {
  const seenQ = new Set<string>();
  const unique: string[] = [];
  for (const raw of queries) {
    const q = raw.trim();
    const k = q.toLowerCase();
    if (q.length < 2 || seenQ.has(k)) continue;
    seenQ.add(k);
    unique.push(q);
  }
  const maxQueries = opts?.maxQueries ?? 18;
  const capped = unique.slice(0, maxQueries);
  const concurrency = Math.max(1, Math.min(6, opts?.concurrency ?? 3));
  const pageSize = opts?.pageSize ?? 14;
  const seenId = new Set<string>();
  const out: Food[] = [];
  let idx = 0;
  let queriesFailed = 0;
  let lastError: OpenFoodFactsFetchError | undefined;

  const addFoods = (foods: Food[]) => {
    for (const f of foods) {
      if (!seenId.has(f.id)) {
        seenId.add(f.id);
        out.push(f);
      }
    }
  };

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= capped.length) break;
      const q = capped[i];
      try {
        addFoods(await searchOpenFoodFactsProducts(q, pageSize));
      } catch (err) {
        queriesFailed += 1;
        if (err instanceof OpenFoodFactsFetchError) lastError = err;
      }
      opts?.onQueryDone?.(i + 1, capped.length, q);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, capped.length) }, () => worker()),
  );
  return {
    foods: out,
    queriesAttempted: capped.length,
    queriesFailed,
    lastError,
  };
}

/** @deprecated Nutze {@link OffParallelSearchResult.foods}; Kurzform für einfache Aufrufer. */
export async function searchOpenFoodFactsProductsParallelFoods(
  queries: string[],
  opts?: OffParallelSearchOptions,
): Promise<Food[]> {
  const r = await searchOpenFoodFactsProductsParallel(queries, opts);
  return r.foods;
}

export function isOffSearchUnavailable(result: OffParallelSearchResult): boolean {
  if (result.foods.length > 0) return false;
  if (result.queriesAttempted === 0) return false;
  return result.queriesFailed >= result.queriesAttempted;
}
