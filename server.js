var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/openFoodFacts.ts
function normalizeOffSearchQuery(query) {
  return query.trim().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
}
function brandsLabel(raw) {
  if (Array.isArray(raw)) {
    return raw.map((b) => String(b).trim()).filter(Boolean).join(", ");
  }
  return String(raw ?? "").trim();
}
function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function kcalPer100g(n) {
  const kcal = num(n["energy-kcal_100g"]) ?? num(n.energy_kcal_100g);
  if (kcal != null) return Math.max(0, kcal);
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
  if (kj != null) return Math.max(0, Math.round(kj / 4.184));
  return null;
}
function labelText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
  }
  return String(value).trim();
}
function parseMassMlFromText(text) {
  const t2 = text.trim().toLowerCase();
  const m = t2.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilogramm|g|gramm|ml|milliliter|l|liter|cl|cl\.)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (u === "kg" || u === "kilogramm") return { grams: Math.round(n * 1e3), isMl: false };
  if (u === "l" || u === "liter") return { grams: Math.round(n * 1e3), isMl: true };
  if (u === "cl" || u === "cl.") return { grams: Math.round(n * 10), isMl: true };
  if (u === "ml" || u === "milliliter") return { grams: Math.round(n), isMl: true };
  return { grams: Math.round(n), isMl: false };
}
function mapLevel(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "low" || s === "moderate" || s === "high") return s;
  return void 0;
}
function mapOffNutritionGrades(product) {
  const levelsRaw = product.nutrient_levels;
  const levels = levelsRaw ? {
    fat: mapLevel(levelsRaw.fat),
    saturatedFat: mapLevel(levelsRaw["saturated-fat"]),
    sugars: mapLevel(levelsRaw.sugars),
    salt: mapLevel(levelsRaw.salt)
  } : void 0;
  const ns = String(product.nutriscore_grade ?? "").trim().toLowerCase();
  const nutriScore = ns === "a" || ns === "b" || ns === "c" || ns === "d" || ns === "e" ? ns : void 0;
  const nova = num(product.nova_group);
  const hasLevels = levels && Object.values(levels).some(Boolean);
  if (!nutriScore && !hasLevels && nova == null) return void 0;
  return {
    ...nutriScore ? { nutriScore } : {},
    ...nova != null ? { novaGroup: Math.round(nova) } : {},
    ...hasLevels ? { levels } : {}
  };
}
function buildServingsFromOffProduct(product) {
  const out = [{ name: "100 g", grams: 100 }];
  const seen = /* @__PURE__ */ new Set([100]);
  const add = (name, grams) => {
    const g = Math.max(1, Math.round(grams));
    if (seen.has(g) && /100\s*g/i.test(name)) return;
    if (seen.has(g) && out.some((s) => s.grams === g && s.name === name)) return;
    seen.add(g);
    out.push({ name: name.slice(0, 80), grams: g });
  };
  const sq = num(product.serving_quantity);
  const sqUnit = labelText(product.serving_quantity_unit).toLowerCase();
  if (sq != null && sq > 0) {
    if (sqUnit === "kg") add(`1 Portion (${sq} kg)`, Math.round(sq * 1e3));
    else if (sqUnit === "l" || sqUnit === "liter") add(`1 Portion (${sq} l)`, Math.round(sq * 1e3));
    else if (sqUnit === "ml") add(`1 Portion (${sq} ml)`, Math.round(sq));
    else add(`1 Portion (${sq} g)`, Math.round(sq));
  }
  const qty = labelText(product.quantity || product.product_quantity);
  const pack = qty ? parseMassMlFromText(qty) : null;
  if (pack) {
    const isBulk = pack.grams >= 1500;
    if (pack.isMl) {
      const canSize = pack.grams <= 600;
      if (canSize) {
        add(`1 Dose (${qty})`, pack.grams);
      } else {
        add(`1 Flasche (${qty})`, pack.grams);
      }
      if (!isBulk && pack.grams > 600) {
        add(`1 Glas (${qty})`, Math.min(pack.grams, Math.max(150, Math.round(pack.grams / 4))));
      }
    } else {
      add(`1 Packung (${qty})`, pack.grams);
      if (!isBulk) {
        add(`1 St\xFCck (${qty})`, pack.grams);
      }
    }
  }
  const ss = labelText(product.serving_size);
  if (ss) {
    const serving = parseMassMlFromText(ss);
    if (serving) {
      const label = serving.isMl ? `1 Portion (${ss})` : `1 Portion (${ss})`;
      add(label, serving.grams);
      if (!serving.isMl && serving.grams >= 15 && serving.grams <= 600) {
        add(`1 St\xFCck (${ss})`, serving.grams);
      }
    }
  }
  return out;
}
function buildDisplayName(product, barcode) {
  const base = (product.product_name_de || product.product_name || "").trim() || `Produkt ${barcode}`;
  const brand = brandsLabel(product.brands).split(",")[0]?.trim();
  const qty = labelText(product.quantity);
  const parts = [base];
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  if (qty) parts.push(qty);
  return parts.join(" \xB7 ").slice(0, 200);
}
function mapOpenFoodFactsProduct(product, barcode) {
  const code = String(barcode).replace(/\D/g, "");
  if (!code) return null;
  const n = product.nutriments ?? {};
  const calories = kcalPer100g(n);
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const hasName = Boolean((product.product_name_de || product.product_name || "").trim());
  if (!hasName && calories == null && protein == null && carbs == null && fat == null) return null;
  const offGrades = mapOffNutritionGrades(product);
  return {
    id: `off_${code}`,
    name: buildDisplayName(product, code),
    category: "readymeal",
    nutrients: {
      calories: Math.round(calories ?? 0),
      protein: Math.round((protein ?? 0) * 10) / 10,
      carbs: Math.round((carbs ?? 0) * 10) / 10,
      fat: Math.round((fat ?? 0) * 10) / 10
    },
    servings: buildServingsFromOffProduct(product),
    ...offGrades ? { offGrades } : {},
    catalogSource: "openfoodfacts"
  };
}
function mapOpenFoodFactsSearchHit(hit) {
  const code = String(hit.code ?? "").replace(/\D/g, "");
  if (!code) return null;
  return mapOpenFoodFactsProduct(hit, code);
}
var OFF_USER_AGENT;
var init_openFoodFacts = __esm({
  "src/lib/openFoodFacts.ts"() {
    OFF_USER_AGENT = "VRTX-FitnessTracker/1.0 (nutrition; contact: reuse@openfoodfacts.org)";
  }
});

// src/lib/openFoodFactsFetch.ts
var openFoodFactsFetch_exports = {};
__export(openFoodFactsFetch_exports, {
  OpenFoodFactsFetchError: () => OpenFoodFactsFetchError,
  fetchOffCatalogFoods: () => fetchOffCatalogFoods,
  fetchOpenFoodFactsByBarcode: () => fetchOpenFoodFactsByBarcode,
  isOffSearchUnavailable: () => isOffSearchUnavailable,
  searchOpenFoodFactsProducts: () => searchOpenFoodFactsProducts,
  searchOpenFoodFactsProductsParallel: () => searchOpenFoodFactsProductsParallel,
  searchOpenFoodFactsProductsParallelFoods: () => searchOpenFoodFactsProductsParallelFoods
});
function offHeaders() {
  return { "User-Agent": OFF_USER_AGENT, Accept: "application/json" };
}
function offFetchSignal() {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(OFF_FETCH_TIMEOUT_MS);
  }
  return void 0;
}
function isOffBlockedHtml(text) {
  return text.includes("Page temporarily unavailable") || text.includes("not available to anonymous users") || text.includes("Seite vor\xFCbergehend nicht verf\xFCgbar");
}
async function parseJsonResponse(r) {
  const text = await r.text();
  if (isOffBlockedHtml(text)) {
    throw new OpenFoodFactsFetchError("Open Food Facts rate limit / anonymous block", "rate_limited");
  }
  if (!r.ok) {
    throw new OpenFoodFactsFetchError(`Open Food Facts HTTP ${r.status}`, r.status === 429 ? "rate_limited" : "unavailable");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new OpenFoodFactsFetchError("Invalid JSON from Open Food Facts", "unavailable");
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryableOffError(err) {
  return err instanceof OpenFoodFactsFetchError && (err.code === "rate_limited" || err.code === "network" || err.code === "unavailable");
}
async function withOffRetries(fn) {
  let last;
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
function mapHits(products) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const hit of products) {
    try {
      const food = mapOpenFoodFactsSearchHit(hit);
      if (!food || seen.has(food.id)) continue;
      seen.add(food.id);
      out.push(food);
    } catch (err) {
      console.warn("OFF map hit skipped:", hit.code, err);
    }
  }
  return out;
}
async function searchViaSearchALicious(query, pageSize) {
  const q = normalizeOffSearchQuery(query);
  const params = new URLSearchParams({
    q,
    size: String(Math.min(50, Math.max(1, pageSize)))
  });
  const url = `https://search.openfoodfacts.org/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  const hits = data.hits ?? [];
  return { foods: mapHits(hits), rawHits: hits.length };
}
async function searchViaApiV2(query, pageSize) {
  const params = new URLSearchParams({
    search_terms: normalizeOffSearchQuery(query),
    page_size: String(Math.min(50, Math.max(1, pageSize))),
    fields: "code,product_name,product_name_de,brands,quantity,product_quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments,nutrient_levels,nutriscore_grade,nova_group"
  });
  const url = `https://world.openfoodfacts.org/api/v2/search?${params.toString()}`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  const products = data.products ?? [];
  return { foods: mapHits(products), rawHits: products.length };
}
async function fetchOffCatalogFoods(query, pageSize = 32) {
  const q = query.trim();
  if (q.length < 2) return { foods: [], rawHitCount: 0 };
  let rawHitCount = 0;
  try {
    const primary = await withOffRetries(() => searchViaSearchALicious(q, pageSize));
    rawHitCount = primary.rawHits;
    if (primary.foods.length > 0) return { foods: primary.foods, rawHitCount };
    if (rawHitCount > 0) {
      console.warn("OFF: search-a-licious hits could not be mapped", { q, rawHitCount });
    }
  } catch (primaryErr) {
    if (primaryErr instanceof OpenFoodFactsFetchError && primaryErr.code === "rate_limited") {
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
      fallbackErr instanceof Error ? fallbackErr.message : "Open Food Facts search failed",
      "network"
    );
  }
}
async function fetchOpenFoodFactsByBarcode(code) {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${digits}?fields=code,product_name,product_name_de,brands,quantity,product_quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments,nutrient_levels,nutriscore_grade,nova_group`;
  const r = await fetch(url, { headers: offHeaders(), signal: offFetchSignal() });
  const data = await parseJsonResponse(r);
  if (data.status !== 1 || !data.product) return null;
  return mapOpenFoodFactsProduct(data.product, digits);
}
async function searchOpenFoodFactsProducts(query, pageSize = 16) {
  const { foods } = await fetchOffCatalogFoods(query, pageSize);
  return foods;
}
async function searchOpenFoodFactsProductsParallel(queries, opts) {
  const seenQ = /* @__PURE__ */ new Set();
  const unique = [];
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
  const seenId = /* @__PURE__ */ new Set();
  const out = [];
  let idx = 0;
  let queriesFailed = 0;
  let lastError;
  const addFoods = (foods) => {
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
    Array.from({ length: Math.min(concurrency, capped.length) }, () => worker())
  );
  return {
    foods: out,
    queriesAttempted: capped.length,
    queriesFailed,
    lastError
  };
}
async function searchOpenFoodFactsProductsParallelFoods(queries, opts) {
  const r = await searchOpenFoodFactsProductsParallel(queries, opts);
  return r.foods;
}
function isOffSearchUnavailable(result) {
  if (result.foods.length > 0) return false;
  if (result.queriesAttempted === 0) return false;
  return result.queriesFailed >= result.queriesAttempted;
}
var OpenFoodFactsFetchError, OFF_FETCH_TIMEOUT_MS, OFF_RETRY_ATTEMPTS, OFF_RETRY_DELAY_MS;
var init_openFoodFactsFetch = __esm({
  "src/lib/openFoodFactsFetch.ts"() {
    init_openFoodFacts();
    OpenFoodFactsFetchError = class extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "OpenFoodFactsFetchError";
      }
    };
    OFF_FETCH_TIMEOUT_MS = 12e3;
    OFF_RETRY_ATTEMPTS = 2;
    OFF_RETRY_DELAY_MS = 600;
  }
});

// src/lib/portionHeuristics.ts
function isLikelyWholePieceSmokedOrCookedSausageName(name) {
  const n = name.toLowerCase();
  if (/\b(scheibe|aufschnitt|gekocht\s*schinken|roher\s*schinken|geschnitten)\b/i.test(n)) return false;
  return /\b(debreziner|debrecziner|debreceni|knackwurst|bockwurst|wiener|frankfurter|bratwurst|currywurst|würstchen|wurstchen|merguez|landjäger|bierwurst|schenkenwurst|rauchwurst|extrawurst|serdelki|sremska)\b/i.test(
    n
  );
}
function typicalGramsPerPieceFromProductName(name) {
  const n = name.toLowerCase();
  if (/\bei(er)?\b|\begg\b/i.test(n) && !/eiernudeln|eierschwammerl|eierlikör|eierkuchen/i.test(n))
    return 58;
  if (/\bapfel\b|\bapple\b/i.test(n)) return 130;
  if (/\bbanane\b/i.test(n)) return 120;
  if (/\bbirne\b/i.test(n)) return 150;
  if (/\borange\b|\bclementine\b/i.test(n)) return 140;
  if (/\bdebreziner\b|debrecziner|debreceni|ungarische\s*rauchwurst/i.test(n)) return 55;
  if (/\bwiener\b|frankfurter\b/i.test(n)) return 50;
  if (/\bknackwurst\b/i.test(n)) return 55;
  if (/\bbockwurst\b/i.test(n)) return 90;
  if (/\bmerguez\b/i.test(n)) return 55;
  if (/\bbratwurst\b(?!en\b)/i.test(n)) return 100;
  if (/\bcurrywurst\b(?!sauce)(?!\s*mit)/i.test(n)) return 180;
  if (/\bcervelat\b|lyoner\b|fleischwurst\b|gelbwurst\b|bierschinken\b/i.test(n)) return 20;
  if (isLikelyWholePieceSmokedOrCookedSausageName(name)) return 55;
  if (/\bflügel|\bflugel|\bwing|chicken\s*wing|hähnchenflügel/i.test(n)) return 45;
  if (/\bkroketten\b/i.test(n)) return 35;
  if (/\bnugget/i.test(n)) return 18;
  return null;
}
var init_portionHeuristics = __esm({
  "src/lib/portionHeuristics.ts"() {
  }
});

// src/lib/portionUtils.ts
function isReferenceServingName(name) {
  return /^100\s*(g|ml)$/i.test(String(name ?? "").trim());
}
function isPortionOrPackagingServingName(name) {
  const low = name.trim().toLowerCase();
  return /\b(portion|portionen|menü|menu|paket|packung|pack\b|gebinde|beutel|tüte|tube|teller|ration|komplett|family|familien|pers\.|personen|kg|kilogramm)\b/i.test(
    low
  );
}
function hasMeaningfulStueckServing(food) {
  for (const s of food.servings ?? []) {
    if (!s.grams || s.grams <= 0) continue;
    const n = s.name.trim();
    if (isReferenceServingName(n)) continue;
    if (/stk\.?|stück|stueck|\bpiece\b/i.test(n)) return true;
    if (/scheibe/i.test(n)) return true;
    if (/riegel|waffel|brötchen|semmel|roll\b|bar\b/i.test(n) && !isPortionOrPackagingServingName(n)) {
      return true;
    }
    if (/^\s*1\s+/i.test(n) && !isPortionOrPackagingServingName(n)) return true;
  }
  return false;
}
function parseGroupedPieceCount(name) {
  const t2 = name.trim();
  const m = t2.match(/^(\d+)\s*(?:stk\.?|stück|stueck|scheiben|scheibe\b|eier\b)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function gramsPerPieceFromExplicitServing(s) {
  if (!s.grams || s.grams <= 0) return null;
  const t2 = s.name.trim();
  const isPieceOrSlice = /stk\.?|stück|stueck|\bpiece\b/i.test(t2) || /scheibe/i.test(t2) || /\beier\b/i.test(t2);
  if (!isPieceOrSlice) return null;
  const grouped = parseGroupedPieceCount(t2);
  const divisor = grouped ?? 1;
  return Math.max(1, Math.round(s.grams / divisor));
}
function inferStueckGramsFromFood(food) {
  const servings = food.servings ?? [];
  for (const s of servings) {
    const g = gramsPerPieceFromExplicitServing(s);
    if (g != null) return g;
  }
  const onePrefixed = servings.find((s) => {
    if (!s.grams || s.grams <= 0) return false;
    const n = s.name.trim();
    if (!/^\s*1\s+/i.test(n)) return false;
    if (isPortionOrPackagingServingName(n)) return false;
    if (isReferenceServingName(n)) return false;
    return true;
  });
  if (onePrefixed) return Math.round(onePrefixed.grams);
  const nonReference = servings.find((s) => {
    if (!s.grams || s.grams <= 0) return false;
    if (isReferenceServingName(s.name)) return false;
    const sn = s.name.trim().toLowerCase();
    if (/vorschlag|schätz|schätzung|geschätzt|gesamtportion|korrigier/i.test(sn)) return false;
    if (isPortionOrPackagingServingName(s.name)) return false;
    const grp = parseGroupedPieceCount(s.name);
    if (grp != null && grp > 1) return false;
    return true;
  });
  if (nonReference) return Math.round(nonReference.grams);
  const typical = typicalGramsPerPieceFromProductName(food.name);
  if (typical != null) return typical;
  return DEFAULT_STUECK_GRAMS_FALLBACK;
}
function getPortionQuickSelectPresets(food, max = 8) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const s of food.servings) {
    const g = Math.round(s.grams);
    if (g <= 0 || seen.has(g)) continue;
    seen.add(g);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
function isCondimentLikePourFood(food) {
  const n = food.name.toLowerCase();
  if (/\b(essig|balsamico|apfelessig|weißweinessig|branntweinessig|essenz)\b/i.test(n)) return true;
  if (/\b(öls?|öl\b|pflanzenöl|olivenöl|sesamöl|distelöl|sonnenblumenöl|rapsöl)\b/i.test(n)) return true;
  if (/\b(senf|ketchup|mayo|mayonnaise|worcester|tabasco|sriracha|harissa)\b/i.test(n)) return true;
  if (/\b(soße|soss|dressing|würzsauce|fischsauce|oyster|sojasauce|pesto)\b/i.test(n)) return true;
  if (/\b(kapern|paste|currypaste|wasabi|relish)\b/i.test(n)) return true;
  if (/\b(sirup|honig|ahornsirup|melasse|marmelade|nutella|konfit)\b/i.test(n)) return true;
  return false;
}
function parseLeadingCountFromName(name) {
  const m = name.trim().match(/^(\d+)/);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function inferScheibeGramsFromFood(food) {
  const s = food.servings?.find((x) => /scheibe/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function parseGramsPerUnitFromPackNotation(text) {
  const m = text.match(/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i) ?? text.match(/(?:^|[·\s])(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!m) return null;
  const per = parseFloat(m[2].replace(",", "."));
  return Number.isFinite(per) && per > 0 ? Math.round(per) : null;
}
function inferPortionGramsFromFood(food) {
  const s = food.servings?.find((x) => /\bportion/i.test(x.name) && x.grams > 0);
  if (s) {
    const k = parseLeadingCountFromName(s.name);
    return Math.max(1, Math.round(s.grams / k));
  }
  for (const source of [food.name, ...(food.servings ?? []).map((x) => x.name)]) {
    const per = parseGramsPerUnitFromPackNotation(source);
    if (per != null) return per;
  }
  for (const s2 of food.servings ?? []) {
    if (!s2.grams || s2.grams <= 0) continue;
    const pack = s2.name.match(/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
    if (!pack) continue;
    const count = parseInt(pack[1], 10);
    const perPiece = parseFloat(pack[2].replace(",", "."));
    if (Number.isFinite(perPiece) && perPiece > 0) return Math.round(perPiece);
    if (Number.isFinite(count) && count > 0) return Math.max(1, Math.round(s2.grams / count));
  }
  return null;
}
function inferDoseGramsFromFood(food) {
  const s = food.servings?.find((x) => /dose/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferFlascheGramsFromFood(food) {
  if (food.category !== "drink" || isCondimentLikePourFood(food)) return null;
  const s = food.servings?.find((x) => /flasche/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferGlasMlFromFood(food) {
  if (food.category !== "drink" || isCondimentLikePourFood(food)) return null;
  if (/\bshot\b/i.test(food.name)) return null;
  const s = food.servings?.find((x) => /(glas|gläser|becher)/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}
function inferDefaultLogPortionForFood(food) {
  const fn = food.name.toLowerCase();
  if (/\b(5|10)\s*kg\b|\bgrossgebinde\b|\bbulk\b|\bcatering\b/i.test(fn)) {
    return { unit: "g", quantity: 200 };
  }
  if (isCondimentLikePourFood(food)) {
    return { unit: "ml", quantity: 100 };
  }
  if (food.category === "spice") {
    return { unit: "g", quantity: 100 };
  }
  if (food.category === "sauce") {
    return { unit: "ml", quantity: 100 };
  }
  const doseG = inferDoseGramsFromFood(food);
  const mentionsDose = /\bdose\b/i.test(food.name) || (food.servings ?? []).some((s) => /dose/i.test(s.name));
  if (doseG && mentionsDose && (food.category === "canned" || /\bdose\b/i.test(food.name))) {
    return { unit: "dose", quantity: 1 };
  }
  if (food.category === "drink") {
    if (/\bshot\b/i.test(food.name)) {
      const s = food.servings?.find((x) => x.grams > 0);
      return { unit: "ml", quantity: s ? Math.max(1, Math.round(s.grams)) : 30 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/flasche/.test(sn) && s.grams > 0) return { unit: "flasche", quantity: 1 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/(glas|gläser|becher)/.test(sn) && s.grams > 0) return { unit: "glas", quantity: 1 };
    }
    if (inferFlascheGramsFromFood(food)) return { unit: "flasche", quantity: 1 };
    if (inferGlasMlFromFood(food)) return { unit: "glas", quantity: 1 };
    const mlServing = (food.servings ?? []).find((s) => s.grams > 0);
    return { unit: "ml", quantity: mlServing ? Math.max(1, Math.round(mlServing.grams)) : 100 };
  }
  if (doseG && mentionsDose) {
    return { unit: "dose", quantity: 1 };
  }
  const scheibeG = inferScheibeGramsFromFood(food);
  if (scheibeG && /\b(brot|toast|vollkorn|schwarz|weißbrot|baguette)\b/i.test(food.name)) {
    return { unit: "scheibe", quantity: 1 };
  }
  if (inferPortionGramsFromFood(food)) {
    return { unit: "portion", quantity: 1 };
  }
  if (hasMeaningfulStueckServing(food)) {
    return { unit: "stk", quantity: 1 };
  }
  return { unit: "g", quantity: 100 };
}
function servingToLogPortion(food, serving) {
  if (!serving.grams || serving.grams <= 0) return null;
  const sn = serving.name.trim();
  const low = sn.toLowerCase();
  if (/stk\.?|stück|stueck|\bpiece\b/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "stk", quantity: k, label: sn };
  }
  if (/scheibe/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "scheibe", quantity: k, label: sn };
  }
  if (/dose/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "dose", quantity: k, label: sn };
  }
  if (/(glas|gläser|becher)/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "glas", quantity: k, label: sn };
  }
  if (/flasche/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "flasche", quantity: k, label: sn };
  }
  if (/\bportion/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: "portion", quantity: k, label: sn };
  }
  if (/^100\s*g$/i.test(sn)) {
    return { unit: "g", quantity: 100, label: sn };
  }
  if (/\bml\b/i.test(sn) || food.category === "drink" && !/g\b/i.test(sn)) {
    return { unit: "ml", quantity: Math.max(1, Math.round(serving.grams)), label: sn };
  }
  return { unit: "g", quantity: Math.max(1, Math.round(serving.grams)), label: sn };
}
function getLogPortionQuickActions(food, maxPresets = 8) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const glasMl = inferGlasMlFromFood(food);
  const doseG = inferDoseGramsFromFood(food);
  const flascheMl = inferFlascheGramsFromFood(food);
  const add = (a) => {
    const k = `${a.unit}|${a.quantity}|${Math.round(a.quantity * 1e3)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  for (const s of getPortionQuickSelectPresets(food, maxPresets)) {
    if (shouldSkipServingForDedicatedUnitButtons(s, glasMl, doseG, flascheMl)) {
      continue;
    }
    const p = servingToLogPortion(food, s);
    if (p) add(p);
  }
  if (food.category !== "drink" && hasMeaningfulStueckServing(food)) {
    const stkServing = (food.servings ?? []).find(
      (s) => s.grams > 0 && /stk\.?|stück|stueck|\bpiece\b/i.test(s.name)
    );
    const label = stkServing?.name.trim() || `1 stk (${inferStueckGramsFromFood(food)} g)`;
    add({ unit: "stk", quantity: 1, label });
  }
  const scheibeG = inferScheibeGramsFromFood(food);
  if (scheibeG != null && food.category !== "drink") {
    add({ unit: "scheibe", quantity: 1, label: `1 scheibe (${scheibeG} g)` });
  }
  const portionG = inferPortionGramsFromFood(food);
  if (portionG != null) {
    add({ unit: "portion", quantity: 1, label: `1 portion (${portionG} g)` });
  }
  if (doseG != null) {
    add({ unit: "dose", quantity: 1, label: `1 dose (${doseG} g)` });
  }
  if (glasMl != null) {
    add({ unit: "glas", quantity: 1, label: `1 glas (${glasMl} ml)` });
  }
  if (flascheMl != null) {
    add({ unit: "flasche", quantity: 1, label: `1 flasche (${flascheMl} ml)` });
  }
  return out;
}
function shouldSkipServingForDedicatedUnitButtons(s, glasMl, doseGrams, flascheMl) {
  const g = Math.round(s.grams);
  const n = s.name;
  if (glasMl != null && g === glasMl && /(glas|gläser|becher|tasse|\bglass\b)/i.test(n)) return true;
  if (doseGrams != null && g === doseGrams && /dose|dosen/i.test(n)) return true;
  if (flascheMl != null && g === flascheMl && /flasche|flaschen|\bbottle\b/i.test(n)) return true;
  return false;
}
var DEFAULT_STUECK_GRAMS_FALLBACK;
var init_portionUtils = __esm({
  "src/lib/portionUtils.ts"() {
    init_portionHeuristics();
    DEFAULT_STUECK_GRAMS_FALLBACK = 100;
  }
});

// src/lib/mealAiShared.ts
function normalizeGermanMealInputForRanking(raw) {
  return raw.trim().replace(/\r?\n+/g, " ").replace(/\s+/g, " ");
}
function coerceFoodCategory(raw) {
  const s = (raw || "").trim().toLowerCase();
  return FOOD_CATEGORY_LIST.includes(s) ? s : "readymeal";
}
function mergeCatalogFoodPool(catalogFoods = []) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of catalogFoods) {
    const k = normalizeName(f.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
function expandCompoundTokens(tokens) {
  const out = new Set(tokens);
  for (const t2 of tokens) {
    const suf = ["salat", "suppe", "toast", "salami"];
    for (const s of suf) {
      if (t2.endsWith(s) && t2.length > s.length + 2) {
        const base = t2.slice(0, -s.length);
        if (base.length >= 3) out.add(base);
      }
    }
  }
  return out;
}
function collectInputTokens(input) {
  const matches = input.toLowerCase().match(/[a-zäöüß]+/g);
  const raw = (matches ?? []).filter((t2) => t2.length >= 3 && !STOPWORDS.has(t2));
  return expandCompoundTokens(new Set(raw));
}
function extractPercentHintNumbersFromText(text) {
  const lower2 = text.toLowerCase();
  const out = [];
  for (const m of lower2.matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  const m2 = lower2.match(/\b(\d{1,2})\s*%?\s*fett\b/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  return [...new Set(out)].filter((n) => n >= 0 && n <= 100);
}
function percentNumbersInFoodName(name) {
  const nums = [];
  for (const m of name.toLowerCase().matchAll(/(\d{1,2})\s*%/g)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return [...new Set(nums)];
}
function percentSpecScore(foodNameLower, wanted) {
  if (wanted.length === 0) return 0;
  const inName = percentNumbersInFoodName(foodNameLower);
  let s = 0;
  for (const w of wanted) {
    if (inName.includes(w)) s += 120;
    else if (inName.some((n) => Math.abs(n - w) <= 1 && n !== w)) s += 55;
    else if (inName.length > 0 && !inName.some((n) => Math.abs(n - w) <= 2)) s -= 85;
  }
  return s;
}
function nameMatchesNumericToken(name, token) {
  const raw = token.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return false;
  const escaped = raw.replace(/\./g, "\\.");
  const re = new RegExp(`(?:^|[^0-9])${escaped}(?:\\s*%|[^0-9%]|%|$)`, "i");
  return re.test(name);
}
function extractMealBrandHint(userText) {
  const t2 = userText.trim();
  if (!t2) return null;
  const von = t2.match(/\b(?:von|bei|from)\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß0-9&'. -]{1,48})/i);
  if (!von) return null;
  const brand = von[1].trim().replace(/\s*[,;].*$/, "").trim();
  return brand.length >= 2 ? brand : null;
}
function tokenCoverageRatio(tokens, foodNameLower) {
  if (tokens.size === 0) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (foodNameLower.includes(tok)) hit++;
  }
  return hit / tokens.size;
}
function scoreFoodRelevanceForMealText(food, queryText) {
  const normalized = normalizeGermanMealInputForRanking(queryText);
  const lower2 = normalized.toLowerCase().trim();
  if (!lower2) return 0;
  const tokens = collectInputTokens(normalized);
  const fn = food.name.toLowerCase();
  const fnNorm = normalizeName(food.name);
  let score = 0;
  if (fnNorm === normalizeName(normalized)) score += 140;
  if (lower2.length >= 4 && fn.includes(lower2)) score += 95;
  if (lower2.length >= 4 && lower2.includes(fnNorm) && fnNorm.length >= 4) score += 75;
  const coverage = tokenCoverageRatio(tokens, fn);
  score += Math.round(coverage * 55);
  if (tokens.size >= 2 && coverage < 0.34) score -= 70;
  if (fn.length > 78) score -= 28;
  if (/\|/.test(food.name)) score -= 18;
  if (/\b(5|10)\s*kg\b|\bgrossgebinde\b|\bbulk\b/i.test(fn)) score -= 95;
  if (/\bflügel|\bflugel|\bwing/i.test(lower2) && /\bflügel|\bflugel|\bwing/i.test(fn)) score += 40;
  if (/\bkroketten\b/i.test(lower2) && /\bkroketten\b/i.test(fn)) score += 55;
  score += extractPercentHintNumbersFromText(queryText).length > 0 ? percentSpecScore(food.name, extractPercentHintNumbersFromText(queryText)) : 0;
  score += scoreFoodRelevanceCompoundPenalties(fn, lower2);
  if (/leberk[aä]s|leberkaas|fleischk[aä]se/i.test(lower2)) {
    if (/fleischkäse|leberkaas|leberkäse/i.test(fn)) score += 85;
    if (/leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) score -= 110;
  }
  if (/\bapfel\b/i.test(lower2) && /\bapfel\b/i.test(fn)) score += 90;
  if (/\bapfel\b/i.test(lower2) && /müsli|muesli|cornflakes|crunch/i.test(fn)) score -= 90;
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
function applyContextualMealRankingBonuses(score, food, lower2, tokens) {
  let s = score;
  const fn = food.name.toLowerCase();
  const wantedPerc = extractPercentHintNumbersFromText(lower2);
  const wantsDeli = lower2.includes("wurst") || lower2.includes("debrez") || lower2.includes("knackwurst") || lower2.includes("bockwurst") || lower2.includes("aufschnitt") || lower2.includes("lyoner") || lower2.includes("schinken");
  const deliHints = /wurst|debreziner|debrecziner|knackwurst|bockwurst|schinken|salami|mortadella|lyoner|bierwurst|bratwurst|leberwurst|leberkäs|fleischkäse|mett|speck|prosciutto|pute|hähnchen|hühnchen/i;
  const wurstSaladVegHints = /gurke|zwiebel|paprika|tomate/i;
  const sandwichBread = /\bsemmel\b|brötchen|weckerl|sandwich|belegte?\s*semmel|stulle|brotzeit|weizenbrötchen/i.test(
    lower2
  );
  const wantsBratenAsSandwich = sandwichBread && /\bbraten\b|schweinebraten|schweinsbraten|rostbraten|braten-?semmel/i.test(lower2);
  const wantsSweetMustard = /sü(ß|ss)(er?)?\s*senf|senf.*sü(ß|ss)|bayerisch(er)?\s*senf|wei(ß|ss)wurstsenf|sü(ß|ss?)senf/i.test(
    lower2
  );
  const wantsHotMustard = /\bscharf(er)?\s*senf|senf.*scharf|mittelscharf|dijon|meerrettichsenf/i.test(lower2);
  const wantsPastaDish = /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower2);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower2);
  const wantsBreadDish = /\bsemmel|brötchen|sandwich|toast\b/i.test(lower2);
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
    if (/\bbraten\b|schweinebraten|schweinsbraten|rostbraten/i.test(fn) && !/bratwurst|würstchen|wiener|nuernberger|nürnberger/i.test(fn)) {
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
  if ((wantsDeli || lower2.includes("salat")) && food.category === "vegetable" && wurstSaladVegHints.test(fn)) {
    s += 18;
  }
  const looksLeberkaese = /leberkas|leberkäse|leberkaas|fleischkäse/i.test(lower2) || [...tokens].some((tk) => /leberkas|leberkäse|leberkaas|fleischkäse/i.test(tk));
  if (looksLeberkaese && /leberwurst/i.test(fn) && !/fleischkäse|leberkaas|leberkäse/i.test(fn)) {
    s -= 120;
  }
  return s;
}
function rankFoodsForMealDescription(input, maxCount = 260, pool2 = []) {
  const normalized = normalizeGermanMealInputForRanking(input);
  const lower2 = normalized.toLowerCase().trim();
  const tokens = collectInputTokens(normalized);
  const wantsPastaDish = /\bnudel|nudeln|pasta|spaghetti|penne|fusilli|tagliatelle|maccaroni|makkaroni|lasagne\b/i.test(lower2);
  const wantsPizzaDish = /\bpizza|pizzateig\b/i.test(lower2);
  const scored = pool2.map((food) => {
    let score = scoreFoodRelevanceForMealText(food, normalized);
    score = applyContextualMealRankingBonuses(score, food, lower2, tokens);
    const fn = food.name.toLowerCase();
    if (wantsPastaDish && !wantsPizzaDish) {
      if (/tomaten(sauce|soße|sose)|passata|sugo/i.test(fn)) score += 28;
      if (/sahne|rahm|schmand|creme fraiche|käse|kaese|mozzarella|parmesan|gratink/i.test(fn)) score += 18;
    }
    const words = fn.split(/[\s(),\-\/]+/).filter((w) => w.length >= 3);
    for (const w of words) {
      if (lower2.includes(w)) score += 8;
    }
    return { food, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const maxPick = Math.min(maxCount, 56);
  const top = scored[0]?.score ?? 0;
  let picked = scored.filter((s) => s.score >= Math.max(MEAL_AI_MIN_SEMANTIC_SCORE, top * 0.5)).slice(0, maxPick).map((s) => s.food);
  if (picked.length < 6) {
    picked = scored.filter((s) => s.score >= 14).slice(0, maxPick).map((s) => s.food);
  }
  if (picked.length < 3 && top > 10) {
    picked = scored.filter((s) => s.score > 0).slice(0, maxPick).map((s) => s.food);
  }
  return picked;
}
function scoreFoodRelevanceCompoundPenalties(foodNameLower, queryLower) {
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
function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\(.*\)/g, "").trim();
}
function parenQualifiersLower(name) {
  const out = [];
  for (const m of name.toLowerCase().matchAll(/\(\s*([^)]*?)\s*\)/g)) {
    const q = m[1].trim();
    if (q) out.push(q);
  }
  return out;
}
function parenMatchAllowsDbLink(userRequested, dbFoodName) {
  const uq = parenQualifiersLower(userRequested);
  if (uq.length === 0) return true;
  const fq = parenQualifiersLower(dbFoodName);
  if (fq.length > 0) return uq.join("|") === fq.join("|");
  const wantedPerc = extractPercentHintNumbersFromText(userRequested);
  if (wantedPerc.length > 0 && uq.every((q) => /^\d+([.,]\d+)?\s*%?$/.test(q.replace(/\s/g, "")))) {
    const inName = percentNumbersInFoodName(dbFoodName);
    if (wantedPerc.some((w) => inName.includes(w))) return true;
  }
  return false;
}
function matchFoodExactFromPool(name, pool2) {
  const raw = name.trim().toLowerCase();
  if (!raw) return null;
  for (const food of pool2) {
    if (food.name.trim().toLowerCase() === raw) return food;
  }
  const norm3 = normalizeName(name);
  for (const food of pool2) {
    if (normalizeName(food.name) !== norm3) continue;
    if (!parenMatchAllowsDbLink(name, food.name)) continue;
    return food;
  }
  return null;
}
function stripAiJsonPayload(raw) {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1].trim();
  return s;
}
function extractBalancedJsonObject(s) {
  const start = s.indexOf("{");
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
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}
function extractModelJsonObjectString(content) {
  const cleaned = stripAiJsonPayload(String(content ?? ""));
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
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
function compositeIngredientsJsonToLines(ciRaw) {
  if (ciRaw == null) return [];
  const arr = typeof ciRaw === "string" ? JSON.parse(ciRaw) : ciRaw;
  if (!Array.isArray(arr)) return [];
  const lines = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item;
    const nm = typeof o.name === "string" ? o.name.trim() : "";
    if (!nm) continue;
    const amount = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? "0")) || 0;
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : "g";
    const id0 = typeof o.id === "string" && o.id.trim() ? o.id.trim() : void 0;
    const cal = typeof o.calories === "number" ? o.calories : parseFloat(String(o.calories ?? "0")) || 0;
    const pr = typeof o.protein === "number" ? o.protein : parseFloat(String(o.protein ?? "0")) || 0;
    const cb = typeof o.carbs === "number" ? o.carbs : parseFloat(String(o.carbs ?? "0")) || 0;
    const ft = typeof o.fat === "number" ? o.fat : parseFloat(String(o.fat ?? "0")) || 0;
    const sn = typeof o.servingName === "string" ? o.servingName : void 0;
    const nsrc = o.nutrientSource === "model_estimate" || o.nutrientSource === "database" ? o.nutrientSource : void 0;
    lines.push({
      ...id0 ? { id: id0 } : {},
      name: nm,
      amount,
      unit,
      ...sn ? { servingName: sn } : {},
      calories: Math.round(cal),
      protein: Math.round(pr * 10) / 10,
      carbs: Math.round(cb * 10) / 10,
      fat: Math.round(ft * 10) / 10,
      ...nsrc ? { nutrientSource: nsrc } : {}
    });
  }
  return lines;
}
function parseCustomFoodDraftFromAi(content, fallbackQuery) {
  const q0 = fallbackQuery.trim() || "Neues Lebensmittel";
  const fallbackDisclaimer = "Unverifizierte Sch\xE4tzung: KI-Antwort war nicht sauber strukturierbar. Bitte Werte vor dem Speichern pr\xFCfen.";
  try {
    const jsonStr = extractModelJsonObjectString(content);
    if (!jsonStr) throw new Error("no json");
    const parsed = JSON.parse(jsonStr);
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const categoryRaw = typeof parsed.category === "string" ? parsed.category : "readymeal";
    const nper = parsed.nutrients_per_100g;
    const cal = typeof nper?.calories === "number" ? nper.calories : parseFloat(String(nper?.calories ?? "NaN"));
    const pr = typeof nper?.protein === "number" ? nper.protein : parseFloat(String(nper?.protein ?? "NaN"));
    const cb = typeof nper?.carbs === "number" ? nper.carbs : parseFloat(String(nper?.carbs ?? "NaN"));
    const ft = typeof nper?.fat === "number" ? nper.fat : parseFloat(String(nper?.fat ?? "NaN"));
    const disclaim = typeof parsed.disclaimer === "string" && parsed.disclaimer.trim() ? parsed.disclaimer.trim() : fallbackDisclaimer;
    const servingsRaw = parsed.servings;
    const servingsOut = [];
    if (Array.isArray(servingsRaw)) {
      for (const row of servingsRaw) {
        const o = row;
        const sn = typeof o.name === "string" ? o.name.trim() : "";
        const gm = typeof o.grams === "number" ? o.grams : parseFloat(String(o.grams ?? "NaN"));
        if (!sn || !Number.isFinite(gm)) continue;
        const gRounded = Math.max(1, Math.min(2500, Math.round(gm)));
        servingsOut.push({ name: sn, grams: gRounded });
      }
    }
    let servings = servingsOut.filter((s) => Number.isFinite(s.grams));
    const hasSmall = servings.some((s) => Math.abs(s.grams - 100) <= 2);
    if (!hasSmall) servings = [{ name: "100 g", grams: 100 }, ...servings];
    const def = parsed.default_portion;
    const amt = typeof def?.amount === "number" ? def.amount : parseFloat(String(def?.amount ?? "NaN"));
    const unitRaw = typeof def?.unit === "string" ? def.unit.trim().toLowerCase() : "g";
    const allowed = /* @__PURE__ */ new Set(["g", "ml", "stk", "dose", "glas", "flasche", "tl", "el"]);
    const unit = allowed.has(unitRaw) ? unitRaw : "g";
    let defaultAmount = Number.isFinite(amt) && amt > 0 ? amt : unit === "g" || unit === "ml" ? 100 : 1;
    const gppRaw = parsed.grams_per_piece;
    let gramsPerPiece;
    const gpp = typeof gppRaw === "number" ? gppRaw : gppRaw == null ? NaN : parseFloat(String(gppRaw));
    if (Number.isFinite(gpp) && gpp > 0) gramsPerPiece = Math.round(Math.min(2e3, gpp));
    if (unit === "stk" && gramsPerPiece == null) {
      const h = typicalGramsPerPieceFromProductName(name);
      if (h != null) gramsPerPiece = h;
    }
    if (!name) throw new Error("no name");
    return {
      name,
      category: coerceFoodCategory(categoryRaw),
      nutrientsPer100g: {
        calories: Math.max(0, Math.round(Number.isFinite(cal) ? cal : 0)),
        protein: Math.max(0, Math.round((Number.isFinite(pr) ? pr : 0) * 10) / 10),
        carbs: Math.max(0, Math.round((Number.isFinite(cb) ? cb : 0) * 10) / 10),
        fat: Math.max(0, Math.round((Number.isFinite(ft) ? ft : 0) * 10) / 10)
      },
      servings: servings.length > 0 ? servings : [{ name: "100 g", grams: 100 }],
      defaultAmount,
      defaultUnit: unit,
      ...gramsPerPiece !== void 0 ? { gramsPerPiece } : {},
      disclaimer: disclaim
    };
  } catch {
    return {
      name: q0,
      category: "readymeal",
      nutrientsPer100g: { calories: 240, protein: 7, carbs: 40, fat: 5 },
      servings: [{ name: "100 g", grams: 100 }],
      defaultAmount: 100,
      defaultUnit: "g",
      disclaimer: fallbackDisclaimer
    };
  }
}
var FOOD_CATEGORY_LIST, STOPWORDS, MEAL_AI_MIN_SEMANTIC_SCORE;
var init_mealAiShared = __esm({
  "src/lib/mealAiShared.ts"() {
    init_portionUtils();
    init_portionHeuristics();
    FOOD_CATEGORY_LIST = [
      "protein",
      "carbs",
      "fat",
      "fruit",
      "vegetable",
      "dairy",
      "sauce",
      "snack",
      "drink",
      "canned",
      "frozen",
      "fastfood",
      "readymeal",
      "bakery",
      "sweets",
      "spice",
      "breakfast"
    ];
    STOPWORDS = /* @__PURE__ */ new Set([
      "und",
      "oder",
      "mit",
      "ohne",
      "ein",
      "eine",
      "einen",
      "der",
      "die",
      "das",
      "den",
      "dem",
      "des",
      "ist",
      "war",
      "hab",
      "hat",
      "aus",
      "auf",
      "als",
      "wie",
      "mir",
      "mal",
      "bitte",
      "ca",
      "zum",
      "zur",
      "vom"
    ]);
    MEAL_AI_MIN_SEMANTIC_SCORE = 20;
  }
});

// src/lib/server/appCustomFoods.ts
var appCustomFoods_exports = {};
__export(appCustomFoods_exports, {
  UCF_ID_PREFIX: () => UCF_ID_PREFIX,
  findAppCustomFoodByExactName: () => findAppCustomFoodByExactName,
  getAppCustomFoodById: () => getAppCustomFoodById,
  insertAppCustomFoodFromDraft: () => insertAppCustomFoodFromDraft,
  insertAppCustomFoodFromFood: () => insertAppCustomFoodFromFood,
  rowIdFromUcfFoodId: () => rowIdFromUcfFoodId,
  rowToFood: () => rowToFood,
  searchAppCustomFoods: () => searchAppCustomFoods,
  ucfIdFromRowId: () => ucfIdFromRowId
});
function ucfIdFromRowId(rowId) {
  return `${UCF_ID_PREFIX}${String(rowId).trim()}`;
}
function rowIdFromUcfFoodId(foodId) {
  const id = String(foodId ?? "").trim();
  if (!id.startsWith(UCF_ID_PREFIX)) return null;
  const raw = id.slice(UCF_ID_PREFIX.length).trim();
  return raw.length >= 8 ? raw : null;
}
function parseJsonCol(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return raw;
}
function rowToFood(row) {
  const nutrients = parseJsonCol(row.nutrients, {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
  let servings = parseJsonCol(row.servings, []);
  if (!Array.isArray(servings) || servings.length === 0) {
    servings = [{ name: "100 g", grams: 100 }];
  }
  const compositeRaw = row.composite_ingredients;
  const compositeLines = compositeIngredientsJsonToLines(compositeRaw);
  const food = {
    id: ucfIdFromRowId(String(row.id)),
    name: String(row.name ?? "").trim(),
    category: coerceFoodCategory(String(row.category ?? "readymeal")),
    nutrients: {
      calories: Math.round(Number(nutrients.calories) || 0),
      protein: Math.round((Number(nutrients.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(nutrients.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(nutrients.fat) || 0) * 10) / 10
    },
    servings,
    catalogSource: "app"
  };
  if (compositeLines.length > 0) {
    food.compositeIngredients = compositeLines.map((line) => ({
      id: line.id,
      name: line.name,
      amount: line.amount,
      unit: line.unit,
      servingName: line.servingName,
      calories: line.calories,
      protein: line.protein,
      carbs: line.carbs,
      fat: line.fat,
      nutrientSource: line.nutrientSource
    }));
  }
  return food;
}
async function searchAppCustomFoods(pool2, query, limit = 24) {
  const q = query.trim();
  if (q.length < 2) return [];
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods
     WHERE name ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [`%${q}%`, Math.min(40, Math.max(1, limit))]
  );
  return rows.map((row) => rowToFood(row));
}
async function getAppCustomFoodById(pool2, foodId) {
  const rowId = rowIdFromUcfFoodId(foodId);
  if (!rowId) return null;
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE id = $1::uuid LIMIT 1`,
    [rowId]
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0]);
}
async function findAppCustomFoodByExactName(pool2, name) {
  const n = name.trim();
  if (!n) return null;
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [n]
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0]);
}
async function insertAppCustomFoodFromDraft(pool2, draft, source = "user_confirmed_ai") {
  const name = draft.name.trim().slice(0, 320);
  const existing = await findAppCustomFoodByExactName(pool2, name);
  if (existing) return existing;
  const servings = draft.servings.length > 0 ? draft.servings : [{ name: "100 g", grams: 100 }];
  const { rows } = await pool2.query(
    `INSERT INTO user_custom_foods (user_id, name, category, nutrients, servings, source)
     VALUES (NULL, $1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING id, name, category, nutrients, servings, composite_ingredients, source, created_at`,
    [
      name,
      coerceFoodCategory(draft.category),
      JSON.stringify(draft.nutrientsPer100g),
      JSON.stringify(servings),
      source
    ]
  );
  return rowToFood(rows[0]);
}
async function insertAppCustomFoodFromFood(pool2, food, source = "user_manual") {
  const existing = await findAppCustomFoodByExactName(pool2, food.name);
  if (existing) return existing;
  const draft = {
    name: food.name,
    category: food.category,
    nutrientsPer100g: { ...food.nutrients },
    servings: food.servings?.length ? food.servings : [{ name: "100 g", grams: 100 }],
    defaultAmount: 100,
    defaultUnit: "g"
  };
  return insertAppCustomFoodFromDraft(pool2, draft, source);
}
var UCF_ID_PREFIX;
var init_appCustomFoods = __esm({
  "src/lib/server/appCustomFoods.ts"() {
    init_mealAiShared();
    UCF_ID_PREFIX = "ucf_";
  }
});

// src/lib/nutrition/foodSynonyms.de.ts
function normalizeFoodHint(hint) {
  const t2 = hint.trim().toLowerCase();
  if (!t2) return hint.trim();
  for (const [from, to] of Object.entries(FOOD_SYNONYMS_DE)) {
    if (t2 === from || t2.startsWith(`${from} `) || t2.includes(` ${from}`)) {
      return to;
    }
  }
  return hint.trim();
}
var FOOD_SYNONYMS_DE;
var init_foodSynonyms_de = __esm({
  "src/lib/nutrition/foodSynonyms.de.ts"() {
    FOOD_SYNONYMS_DE = {
      semmel: "br\xF6tchen",
      br\u00F6tchen: "br\xF6tchen",
      brot: "brot",
      toast: "brot",
      leberkas: "fleischk\xE4se",
      leberk\u00E4se: "fleischk\xE4se",
      fleischk\u00E4se: "fleischk\xE4se",
      k\u00E4se: "k\xE4se",
      h\u00E4hnchen: "h\xE4hnchen",
      huhn: "huhn",
      chicken: "chicken",
      haehnchen: "h\xE4hnchen",
      putenbrust: "putenbrust",
      reis: "reis gekocht",
      nudeln: "nudeln gekocht",
      pasta: "nudeln gekocht",
      spaghetti: "nudeln gekocht",
      kartoffeln: "kartoffeln gekocht",
      kartoffel: "kartoffeln gekocht",
      pommes: "pommes frites",
      joghurt: "joghurt natur",
      yoghurt: "joghurt natur",
      quark: "magerquark",
      milch: "milch",
      ei: "ei ganz",
      eier: "ei ganz",
      lachs: "lachs roh",
      thunfisch: "thunfisch dose",
      rind: "rinderhack",
      hack: "rinderhack",
      hackfleisch: "rinderhack",
      salat: "blattsalat",
      tomaten: "tomate",
      gurken: "gurke",
      \u00E4pfel: "apfel",
      bananen: "banane",
      brokkoli: "brokkoli gekocht",
      spinat: "spinat roh",
      \u00F6l: "oliven\xF6l",
      olivenoel: "oliven\xF6l",
      butter: "butter",
      mayo: "mayonnaise",
      senf: "senf",
      ketchup: "ketchup",
      wurst: "bratwurst",
      bratwurst: "bratwurst",
      wiener: "wiener w\xFCrstchen",
      d\u00F6ner: "d\xF6nerfleisch",
      doener: "d\xF6nerfleisch",
      pizza: "pizza margherita",
      cola: "cola",
      kaffee: "kaffee schwarz",
      shake: "proteinshake",
      protein: "proteinshake",
      hafer: "haferflocken",
      m\u00FCsli: "m\xFCsli",
      avocado: "avocado",
      tofu: "tofu",
      linsen: "linsen gekocht",
      kichererbsen: "kichererbsen gekocht",
      couscous: "couscous gekocht",
      quinoa: "quinoa gekocht",
      mozzi: "mozzarella",
      parmesan: "parmesan",
      schinken: "kochschinken",
      salami: "salami",
      n\u00FCsse: "mandeln",
      mandeln: "mandeln",
      erdnussbutter: "erdnussbutter",
      schoki: "vollmilchschokolade",
      schokolade: "vollmilchschokolade",
      honig: "honig",
      zucker: "zucker",
      saft: "orangensaft",
      orangensaft: "orangensaft",
      speck: "speck",
      bacon: "speck",
      falafel: "falafel",
      hummus: "hummus",
      fladenbrot: "fladenbrot",
      pita: "fladenbrot",
      carbonara: "pasta carbonara",
      bolognese: "spaghetti bolognese",
      currywurst: "currywurst",
      schnitzel: "schnitzel",
      spiegelei: "fr\xFChst\xFCcksei",
      r\u00FChrei: "fr\xFChst\xFCcksei",
      club: "club sandwich",
      wings: "chicken wings",
      fl\u00FCgel: "h\xE4hnchenfl\xFCgel"
    };
  }
});

// src/lib/nutrition/pipeline/GenericFallbackTable.ts
function normalizeGenericId(id) {
  return id.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function resolveGenericTableKey(id) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const direct = GENERIC_NUTRITION_TABLE[trimmed];
  if (direct) return trimmed;
  const key = normalizeGenericId(trimmed);
  if (!key) return null;
  const alias = GENERIC_ALIASES[key];
  if (alias) return alias;
  const withGeneric = `${key}_generic`;
  if (GENERIC_NUTRITION_TABLE[withGeneric]) return withGeneric;
  if (key.includes("semmel") || key.includes("broetchen")) return "semmel_generic";
  if (key.includes("leberkaes") || key.includes("fleischkaes")) return "leberkaese_generic";
  if (key.includes("senf") || key.includes("mustard")) return "mustard_generic";
  if (key.includes("tomate")) return "tomato_fresh_generic";
  if (key.includes("zwiebel")) return "onion_raw_generic";
  if (key.includes("haehnchen") || key.includes("huhn") || key.includes("chicken")) {
    return "chicken_breast_grilled_generic";
  }
  if (key.includes("kartoffel")) return "potato_boiled_generic";
  if (key.includes("feta")) return "feta_generic";
  if (key.includes("oliven") && key.includes("ol")) return "olive_oil_generic";
  if (key.includes("olive") && key.includes("oil")) return "olive_oil_generic";
  if (key.includes("raps") && key.includes("ol")) return "canola_oil_generic";
  let best = null;
  let bestLen = 0;
  for (const tableKey of Object.keys(GENERIC_NUTRITION_TABLE)) {
    if (!String(tableKey).endsWith("_generic")) continue;
    const base = String(tableKey).replace(/_generic$/, "");
    const parts = base.split("_").filter((p) => p.length >= 4);
    for (const part of parts) {
      if (key.includes(part) || part.includes(key)) {
        const len = Math.min(key.length, part.length);
        if (len >= 4 && len > bestLen) {
          bestLen = len;
          best = tableKey;
        }
      }
    }
  }
  return best;
}
function getGenericFallback(id) {
  const tableKey = resolveGenericTableKey(id);
  return tableKey ? GENERIC_NUTRITION_TABLE[tableKey] ?? null : null;
}
var GENERIC_NUTRITION_TABLE, GENERIC_ALIASES;
var init_GenericFallbackTable = __esm({
  "src/lib/nutrition/pipeline/GenericFallbackTable.ts"() {
    GENERIC_NUTRITION_TABLE = {
      white_bread_generic: { kcal_100g: 265, protein_100g: 8, carbs_100g: 49, fat_100g: 3.2, fiber_100g: 2.7 },
      semmel_generic: { kcal_100g: 275, protein_100g: 8.5, carbs_100g: 50, fat_100g: 3, fiber_100g: 2.5 },
      leberkaese_generic: { kcal_100g: 326, protein_100g: 13, carbs_100g: 2.5, fat_100g: 29, fiber_100g: 0 },
      mustard_generic: { kcal_100g: 120, protein_100g: 4, carbs_100g: 12, fat_100g: 6, fiber_100g: 2 },
      wholegrain_bread_generic: { kcal_100g: 247, protein_100g: 12.1, carbs_100g: 41, fat_100g: 4.2, fiber_100g: 7 },
      pita_bread_generic: { kcal_100g: 275, protein_100g: 9, carbs_100g: 55, fat_100g: 1.2, fiber_100g: 2.2 },
      wrap_tortilla_generic: { kcal_100g: 310, protein_100g: 8.5, carbs_100g: 50, fat_100g: 8.2, fiber_100g: 3.5 },
      croissant_generic: { kcal_100g: 406, protein_100g: 8.2, carbs_100g: 45.8, fat_100g: 21, fiber_100g: 2.6 },
      oats_dry_generic: { kcal_100g: 389, protein_100g: 16.9, carbs_100g: 66.3, fat_100g: 6.9, fiber_100g: 10.6 },
      muesli_generic: { kcal_100g: 372, protein_100g: 10, carbs_100g: 64, fat_100g: 7, fiber_100g: 8 },
      cornflakes_generic: { kcal_100g: 357, protein_100g: 7.4, carbs_100g: 84, fat_100g: 0.4, fiber_100g: 3 },
      rice_cooked_generic: { kcal_100g: 130, protein_100g: 2.7, carbs_100g: 28.2, fat_100g: 0.3, fiber_100g: 0.4 },
      rice_dry_generic: { kcal_100g: 365, protein_100g: 7.1, carbs_100g: 79, fat_100g: 0.7, fiber_100g: 1.3 },
      pasta_cooked_generic: { kcal_100g: 131, protein_100g: 5, carbs_100g: 25, fat_100g: 1.1, fiber_100g: 1.8 },
      pasta_dry_generic: { kcal_100g: 357, protein_100g: 12.5, carbs_100g: 71.2, fat_100g: 1.5, fiber_100g: 3 },
      quinoa_cooked_generic: { kcal_100g: 120, protein_100g: 4.4, carbs_100g: 21.3, fat_100g: 1.9, fiber_100g: 2.8 },
      couscous_cooked_generic: { kcal_100g: 112, protein_100g: 3.8, carbs_100g: 23.2, fat_100g: 0.2, fiber_100g: 1.4 },
      potato_boiled_generic: { kcal_100g: 87, protein_100g: 1.9, carbs_100g: 20.1, fat_100g: 0.1, fiber_100g: 1.8 },
      potato_fries_generic: { kcal_100g: 312, protein_100g: 3.4, carbs_100g: 41, fat_100g: 15, fiber_100g: 3.8 },
      sweet_potato_generic: { kcal_100g: 86, protein_100g: 1.6, carbs_100g: 20.1, fat_100g: 0.1, fiber_100g: 3 },
      chicken_breast_grilled_generic: { kcal_100g: 165, protein_100g: 31, carbs_100g: 0, fat_100g: 3.6, fiber_100g: 0 },
      chicken_thigh_cooked_generic: { kcal_100g: 209, protein_100g: 26, carbs_100g: 0, fat_100g: 10.9, fiber_100g: 0 },
      turkey_breast_cooked_generic: { kcal_100g: 135, protein_100g: 29, carbs_100g: 0, fat_100g: 1.6, fiber_100g: 0 },
      beef_ground_cooked_generic: { kcal_100g: 254, protein_100g: 26, carbs_100g: 0, fat_100g: 16, fiber_100g: 0 },
      beef_steak_generic: { kcal_100g: 271, protein_100g: 25, carbs_100g: 0, fat_100g: 19, fiber_100g: 0 },
      pork_generic: { kcal_100g: 242, protein_100g: 27, carbs_100g: 0, fat_100g: 14, fiber_100g: 0 },
      schnitzel_breaded_generic: { kcal_100g: 280, protein_100g: 20, carbs_100g: 13, fat_100g: 17, fiber_100g: 1.2 },
      bacon_generic: { kcal_100g: 541, protein_100g: 37, carbs_100g: 1.4, fat_100g: 42, fiber_100g: 0 },
      salmon_generic: { kcal_100g: 208, protein_100g: 20.4, carbs_100g: 0, fat_100g: 13.4, fiber_100g: 0 },
      tuna_canned_generic: { kcal_100g: 116, protein_100g: 25.5, carbs_100g: 0, fat_100g: 0.8, fiber_100g: 0 },
      shrimp_generic: { kcal_100g: 99, protein_100g: 24, carbs_100g: 0.2, fat_100g: 0.3, fiber_100g: 0 },
      egg_whole_generic: { kcal_100g: 155, protein_100g: 12.6, carbs_100g: 1.1, fat_100g: 10.6, fiber_100g: 0 },
      egg_white_generic: { kcal_100g: 52, protein_100g: 10.9, carbs_100g: 0.7, fat_100g: 0.2, fiber_100g: 0 },
      tofu_generic: { kcal_100g: 144, protein_100g: 15.7, carbs_100g: 3.4, fat_100g: 8.7, fiber_100g: 1.2 },
      tempeh_generic: { kcal_100g: 193, protein_100g: 20.3, carbs_100g: 9.4, fat_100g: 10.8, fiber_100g: 1.4 },
      lentils_cooked_generic: { kcal_100g: 116, protein_100g: 9, carbs_100g: 20.1, fat_100g: 0.4, fiber_100g: 7.9 },
      chickpeas_cooked_generic: { kcal_100g: 164, protein_100g: 8.9, carbs_100g: 27.4, fat_100g: 2.6, fiber_100g: 7.6 },
      beans_cooked_generic: { kcal_100g: 127, protein_100g: 8.7, carbs_100g: 22.8, fat_100g: 0.5, fiber_100g: 6.4 },
      whole_milk_generic: { kcal_100g: 61, protein_100g: 3.2, carbs_100g: 4.8, fat_100g: 3.3, fiber_100g: 0 },
      skim_milk_generic: { kcal_100g: 35, protein_100g: 3.4, carbs_100g: 5, fat_100g: 0.2, fiber_100g: 0 },
      oat_milk_generic: { kcal_100g: 46, protein_100g: 1, carbs_100g: 6.7, fat_100g: 1.5, fiber_100g: 0.8 },
      almond_milk_generic: { kcal_100g: 24, protein_100g: 0.6, carbs_100g: 0.3, fat_100g: 2.1, fiber_100g: 0.2 },
      yogurt_plain_generic: { kcal_100g: 59, protein_100g: 10, carbs_100g: 3.6, fat_100g: 0.4, fiber_100g: 0 },
      greek_yogurt_generic: { kcal_100g: 97, protein_100g: 9, carbs_100g: 3.9, fat_100g: 5, fiber_100g: 0 },
      quark_generic: { kcal_100g: 67, protein_100g: 12, carbs_100g: 3.9, fat_100g: 0.2, fiber_100g: 0 },
      cottage_cheese_generic: { kcal_100g: 98, protein_100g: 11.1, carbs_100g: 3.4, fat_100g: 4.3, fiber_100g: 0 },
      cheese_cheddar_generic: { kcal_100g: 402, protein_100g: 25, carbs_100g: 1.3, fat_100g: 33, fiber_100g: 0 },
      parmesan_generic: { kcal_100g: 431, protein_100g: 38, carbs_100g: 4.1, fat_100g: 29, fiber_100g: 0 },
      mozzarella_generic: { kcal_100g: 280, protein_100g: 28, carbs_100g: 3.1, fat_100g: 17, fiber_100g: 0 },
      butter_generic: { kcal_100g: 717, protein_100g: 0.9, carbs_100g: 0.1, fat_100g: 81.1, fiber_100g: 0 },
      olive_oil_generic: { kcal_100g: 884, protein_100g: 0, carbs_100g: 0, fat_100g: 100, fiber_100g: 0 },
      canola_oil_generic: { kcal_100g: 884, protein_100g: 0, carbs_100g: 0, fat_100g: 100, fiber_100g: 0 },
      mayonnaise_generic: { kcal_100g: 680, protein_100g: 1, carbs_100g: 0.6, fat_100g: 75, fiber_100g: 0 },
      tzatziki_generic: { kcal_100g: 95, protein_100g: 4.5, carbs_100g: 4, fat_100g: 6.5, fiber_100g: 0.3 },
      garlic_sauce_generic: { kcal_100g: 280, protein_100g: 1.5, carbs_100g: 8, fat_100g: 26, fiber_100g: 0.2 },
      ketchup_generic: { kcal_100g: 112, protein_100g: 1.3, carbs_100g: 25.8, fat_100g: 0.2, fiber_100g: 0.3 },
      bbq_sauce_generic: { kcal_100g: 172, protein_100g: 1.2, carbs_100g: 39, fat_100g: 0.7, fiber_100g: 1.1 },
      tomato_sauce_generic: { kcal_100g: 45, protein_100g: 1.8, carbs_100g: 7.5, fat_100g: 0.8, fiber_100g: 1.8 },
      pesto_generic: { kcal_100g: 460, protein_100g: 4.7, carbs_100g: 6, fat_100g: 46, fiber_100g: 1.8 },
      peanut_butter_generic: { kcal_100g: 588, protein_100g: 25, carbs_100g: 20, fat_100g: 50, fiber_100g: 6 },
      jam_generic: { kcal_100g: 250, protein_100g: 0.4, carbs_100g: 65, fat_100g: 0.1, fiber_100g: 0.8 },
      honey_generic: { kcal_100g: 304, protein_100g: 0.3, carbs_100g: 82.4, fat_100g: 0, fiber_100g: 0.2 },
      sugar_generic: { kcal_100g: 387, protein_100g: 0, carbs_100g: 100, fat_100g: 0, fiber_100g: 0 },
      banana_generic: { kcal_100g: 89, protein_100g: 1.1, carbs_100g: 22.8, fat_100g: 0.3, fiber_100g: 2.6 },
      apple_generic: { kcal_100g: 52, protein_100g: 0.3, carbs_100g: 13.8, fat_100g: 0.2, fiber_100g: 2.4 },
      orange_generic: { kcal_100g: 47, protein_100g: 0.9, carbs_100g: 11.8, fat_100g: 0.1, fiber_100g: 2.4 },
      berries_generic: { kcal_100g: 50, protein_100g: 0.7, carbs_100g: 12, fat_100g: 0.3, fiber_100g: 4 },
      grapes_generic: { kcal_100g: 69, protein_100g: 0.7, carbs_100g: 18, fat_100g: 0.2, fiber_100g: 0.9 },
      avocado_generic: { kcal_100g: 160, protein_100g: 2, carbs_100g: 8.5, fat_100g: 14.7, fiber_100g: 6.7 },
      lettuce_generic: { kcal_100g: 15, protein_100g: 1.4, carbs_100g: 2.2, fat_100g: 0.2, fiber_100g: 1.3 },
      tomato_fresh_generic: { kcal_100g: 18, protein_100g: 0.9, carbs_100g: 3.9, fat_100g: 0.2, fiber_100g: 1.2 },
      cucumber_generic: { kcal_100g: 15, protein_100g: 0.7, carbs_100g: 3.6, fat_100g: 0.1, fiber_100g: 0.5 },
      onion_raw_generic: { kcal_100g: 40, protein_100g: 1.1, carbs_100g: 9.3, fat_100g: 0.1, fiber_100g: 1.7 },
      cabbage_white_generic: { kcal_100g: 25, protein_100g: 1.3, carbs_100g: 5.8, fat_100g: 0.1, fiber_100g: 2.5 },
      carrot_generic: { kcal_100g: 41, protein_100g: 0.9, carbs_100g: 9.6, fat_100g: 0.2, fiber_100g: 2.8 },
      broccoli_generic: { kcal_100g: 34, protein_100g: 2.8, carbs_100g: 6.6, fat_100g: 0.4, fiber_100g: 2.6 },
      spinach_generic: { kcal_100g: 23, protein_100g: 2.9, carbs_100g: 3.6, fat_100g: 0.4, fiber_100g: 2.2 },
      mushroom_generic: { kcal_100g: 22, protein_100g: 3.1, carbs_100g: 3.3, fat_100g: 0.3, fiber_100g: 1 },
      paprika_generic: { kcal_100g: 31, protein_100g: 1, carbs_100g: 6, fat_100g: 0.3, fiber_100g: 2.1 },
      zucchini_generic: { kcal_100g: 17, protein_100g: 1.2, carbs_100g: 3.1, fat_100g: 0.3, fiber_100g: 1 },
      corn_generic: { kcal_100g: 96, protein_100g: 3.4, carbs_100g: 21, fat_100g: 1.5, fiber_100g: 2.4 },
      peas_generic: { kcal_100g: 81, protein_100g: 5.4, carbs_100g: 14.5, fat_100g: 0.4, fiber_100g: 5.1 },
      almonds_generic: { kcal_100g: 579, protein_100g: 21.2, carbs_100g: 21.6, fat_100g: 49.9, fiber_100g: 12.5 },
      walnuts_generic: { kcal_100g: 654, protein_100g: 15.2, carbs_100g: 13.7, fat_100g: 65.2, fiber_100g: 6.7 },
      cashews_generic: { kcal_100g: 553, protein_100g: 18.2, carbs_100g: 30.2, fat_100g: 43.8, fiber_100g: 3.3 },
      peanuts_generic: { kcal_100g: 567, protein_100g: 25.8, carbs_100g: 16.1, fat_100g: 49.2, fiber_100g: 8.5 },
      chia_seeds_generic: { kcal_100g: 486, protein_100g: 16.5, carbs_100g: 42.1, fat_100g: 30.7, fiber_100g: 34.4 },
      whey_powder_generic: { kcal_100g: 395, protein_100g: 78, carbs_100g: 8, fat_100g: 6, fiber_100g: 0 },
      protein_bar_generic: { kcal_100g: 370, protein_100g: 32, carbs_100g: 35, fat_100g: 12, fiber_100g: 8 },
      protein_shake_ready_generic: { kcal_100g: 60, protein_100g: 8, carbs_100g: 5, fat_100g: 1, fiber_100g: 0 },
      cola_generic: { kcal_100g: 42, protein_100g: 0, carbs_100g: 10.6, fat_100g: 0, fiber_100g: 0 },
      orange_juice_generic: { kcal_100g: 45, protein_100g: 0.7, carbs_100g: 10.4, fat_100g: 0.2, fiber_100g: 0.2 },
      apple_juice_generic: { kcal_100g: 46, protein_100g: 0.1, carbs_100g: 11.3, fat_100g: 0.1, fiber_100g: 0.2 },
      beer_generic: { kcal_100g: 43, protein_100g: 0.5, carbs_100g: 3.6, fat_100g: 0, fiber_100g: 0 },
      wine_generic: { kcal_100g: 85, protein_100g: 0.1, carbs_100g: 2.6, fat_100g: 0, fiber_100g: 0 },
      latte_macchiato_generic: { kcal_100g: 50, protein_100g: 2.5, carbs_100g: 4.8, fat_100g: 2.2, fiber_100g: 0 },
      cappuccino_generic: { kcal_100g: 32, protein_100g: 1.8, carbs_100g: 3.1, fat_100g: 1.3, fiber_100g: 0 },
      burger_generic: { kcal_100g: 250, protein_100g: 12, carbs_100g: 28, fat_100g: 10, fiber_100g: 1.8 },
      cheeseburger_generic: { kcal_100g: 300, protein_100g: 14, carbs_100g: 27, fat_100g: 15, fiber_100g: 1.6 },
      big_mac_style_generic: { kcal_100g: 257, protein_100g: 12, carbs_100g: 20, fat_100g: 14, fiber_100g: 1.3 },
      pizza_margherita_generic: { kcal_100g: 267, protein_100g: 11, carbs_100g: 33, fat_100g: 10, fiber_100g: 2.3 },
      pizza_salami_generic: { kcal_100g: 290, protein_100g: 12.5, carbs_100g: 30, fat_100g: 13.8, fiber_100g: 2.5 },
      doner_kebab_generic: { kcal_100g: 215, protein_100g: 10, carbs_100g: 18, fat_100g: 11, fiber_100g: 1.8 },
      shawarma_generic: { kcal_100g: 220, protein_100g: 12, carbs_100g: 16, fat_100g: 12, fiber_100g: 1.8 },
      currywurst_generic: { kcal_100g: 270, protein_100g: 11, carbs_100g: 9, fat_100g: 20, fiber_100g: 1 },
      lasagna_generic: { kcal_100g: 160, protein_100g: 8, carbs_100g: 12, fat_100g: 8, fiber_100g: 1.5 },
      spaghetti_bolognese_generic: { kcal_100g: 143, protein_100g: 6.6, carbs_100g: 17, fat_100g: 5.2, fiber_100g: 1.7 },
      pad_thai_generic: { kcal_100g: 150, protein_100g: 5.5, carbs_100g: 20, fat_100g: 5, fiber_100g: 1.8 },
      chicken_tikka_masala_generic: { kcal_100g: 180, protein_100g: 11, carbs_100g: 8, fat_100g: 11, fiber_100g: 1.3 },
      sushi_mixed_generic: { kcal_100g: 145, protein_100g: 6, carbs_100g: 24, fat_100g: 2.5, fiber_100g: 1 },
      ramen_generic: { kcal_100g: 115, protein_100g: 4, carbs_100g: 17, fat_100g: 3.2, fiber_100g: 0.9 },
      burrito_generic: { kcal_100g: 185, protein_100g: 8, carbs_100g: 20, fat_100g: 8, fiber_100g: 3 },
      kebab_sauce_generic: { kcal_100g: 220, protein_100g: 2, carbs_100g: 7, fat_100g: 20, fiber_100g: 0.4 },
      cheesecake_generic: { kcal_100g: 321, protein_100g: 5.7, carbs_100g: 25.5, fat_100g: 22.5, fiber_100g: 0.7 },
      chocolate_generic: { kcal_100g: 546, protein_100g: 4.9, carbs_100g: 61, fat_100g: 31, fiber_100g: 7 },
      icecream_generic: { kcal_100g: 207, protein_100g: 3.5, carbs_100g: 24, fat_100g: 11, fiber_100g: 0.7 },
      cookie_generic: { kcal_100g: 502, protein_100g: 5.9, carbs_100g: 64, fat_100g: 24, fiber_100g: 2.4 },
      soup_chicken_generic: { kcal_100g: 45, protein_100g: 2.5, carbs_100g: 4, fat_100g: 2, fiber_100g: 0.4 },
      instant_noodle_soup_generic: { kcal_100g: 70, protein_100g: 2.1, carbs_100g: 9, fat_100g: 2.7, fiber_100g: 0.7 },
      falafel_generic: { kcal_100g: 333, protein_100g: 13.3, carbs_100g: 31.8, fat_100g: 17.8, fiber_100g: 4.9 },
      hummus_generic: { kcal_100g: 237, protein_100g: 8, carbs_100g: 14, fat_100g: 17, fiber_100g: 6 },
      feta_generic: { kcal_100g: 264, protein_100g: 14, carbs_100g: 4.1, fat_100g: 21, fiber_100g: 0 }
    };
    GENERIC_ALIASES = {
      semmel: "semmel_generic",
      broetchen: "semmel_generic",
      br\u00F6tchen: "semmel_generic",
      leberkaese: "leberkaese_generic",
      leberk\u00E4se: "leberkaese_generic",
      fleischkaese: "leberkaese_generic",
      senf: "mustard_generic",
      suesser_senf: "mustard_generic",
      s\u00FCsser_senf: "mustard_generic",
      tomate: "tomato_fresh_generic",
      tomaten: "tomato_fresh_generic",
      zwiebel: "onion_raw_generic",
      zwiebeln: "onion_raw_generic",
      haehnchen: "chicken_breast_grilled_generic",
      hahnchen: "chicken_breast_grilled_generic",
      huehnchen: "chicken_breast_grilled_generic",
      huhn: "chicken_breast_grilled_generic",
      chicken: "chicken_breast_grilled_generic",
      kartoffel: "potato_boiled_generic",
      kartoffeln: "potato_boiled_generic",
      feta: "feta_generic",
      fetas: "feta_generic",
      schafskaese: "feta_generic",
      olivenoel: "olive_oil_generic",
      oliven\u00F6l: "olive_oil_generic",
      olive_oil: "olive_oil_generic",
      rapsoel: "canola_oil_generic",
      raps\u00F6l: "canola_oil_generic"
    };
  }
});

// src/lib/nutrition/genericFoodBaselines.de.json
var genericFoodBaselines_de_default;
var init_genericFoodBaselines_de = __esm({
  "src/lib/nutrition/genericFoodBaselines.de.json"() {
    genericFoodBaselines_de_default = [
      {
        id: "haehnchenbrust",
        name: "H\xE4hnchenbrust, roh",
        category: "protein",
        nutrients: { calories: 120, protein: 22.5, carbs: 0, fat: 2.6 }
      },
      {
        id: "reis_gekocht",
        name: "Reis, gekocht",
        category: "carbs",
        nutrients: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }
      },
      {
        id: "nudeln_gekocht",
        name: "Nudeln, gekocht",
        category: "carbs",
        nutrients: { calories: 158, protein: 5.8, carbs: 30.9, fat: 0.9 }
      },
      {
        id: "apfel",
        name: "Apfel",
        category: "fruit",
        nutrients: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 }
      },
      {
        id: "broetchen",
        name: "Br\xF6tchen",
        category: "bakery",
        nutrients: { calories: 280, protein: 9, carbs: 52, fat: 3.5 }
      },
      {
        id: "fleischkaese",
        name: "Fleischk\xE4se",
        category: "protein",
        nutrients: { calories: 280, protein: 12, carbs: 3, fat: 24 }
      },
      {
        id: "kaese_scheibe",
        name: "K\xE4se, Scheibe",
        category: "dairy",
        nutrients: { calories: 350, protein: 22, carbs: 1, fat: 28 }
      },
      {
        id: "rinderhack",
        name: "Rinderhackfleisch",
        category: "protein",
        nutrients: { calories: 250, protein: 17, carbs: 0, fat: 20 }
      },
      {
        id: "tomate",
        name: "Tomate",
        category: "vegetable",
        nutrients: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }
      },
      {
        id: "gurke",
        name: "Gurke",
        category: "vegetable",
        nutrients: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 }
      },
      {
        id: "salat_blatt",
        name: "Blattsalat",
        category: "vegetable",
        nutrients: { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2 }
      },
      {
        id: "ketchup",
        name: "Ketchup",
        category: "sauce",
        nutrients: { calories: 112, protein: 1.8, carbs: 26, fat: 0.1 }
      },
      {
        id: "mayonnaise",
        name: "Mayonnaise",
        category: "sauce",
        nutrients: { calories: 680, protein: 1, carbs: 0.6, fat: 75 }
      },
      {
        id: "senf",
        name: "Senf",
        category: "sauce",
        nutrients: { calories: 66, protein: 4, carbs: 5, fat: 3.5 }
      },
      {
        id: "wurst_brat",
        name: "Bratwurst",
        category: "protein",
        nutrients: { calories: 290, protein: 12, carbs: 2, fat: 26 }
      },
      {
        id: "hotdog_broetchen",
        name: "Hotdog-Br\xF6tchen",
        category: "bakery",
        nutrients: { calories: 280, protein: 9, carbs: 50, fat: 4 }
      },
      { id: "haehnchenbrust_gekocht", name: "H\xE4hnchenbrust, gekocht", category: "protein", nutrients: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } },
      { id: "lachs_roh", name: "Lachs, roh", category: "protein", nutrients: { calories: 208, protein: 20, carbs: 0, fat: 13 } },
      { id: "thunfisch_dose", name: "Thunfisch in \xD6l (abgetropft)", category: "protein", nutrients: { calories: 198, protein: 29, carbs: 0, fat: 8 } },
      { id: "ei_ganz", name: "Ei, ganz", category: "protein", nutrients: { calories: 155, protein: 13, carbs: 1.1, fat: 11 } },
      { id: "magerquark", name: "Magerquark", category: "dairy", nutrients: { calories: 67, protein: 12, carbs: 4, fat: 0.3 } },
      { id: "joghurt_natur", name: "Joghurt natur", category: "dairy", nutrients: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3 } },
      { id: "milch_voll", name: "Milch 3,5%", category: "dairy", nutrients: { calories: 64, protein: 3.3, carbs: 4.8, fat: 3.5 } },
      { id: "butter", name: "Butter", category: "dairy", nutrients: { calories: 717, protein: 0.9, carbs: 0.1, fat: 81 } },
      { id: "olivenoel", name: "Oliven\xF6l", category: "sauce", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 } },
      { id: "kartoffeln_gekocht", name: "Kartoffeln, gekocht", category: "carbs", nutrients: { calories: 87, protein: 1.9, carbs: 20, fat: 0.1 } },
      { id: "kartoffeln_roh", name: "Kartoffeln, roh", category: "carbs", nutrients: { calories: 77, protein: 2, carbs: 17, fat: 0.1 } },
      { id: "pommes_frites", name: "Pommes frites", category: "carbs", nutrients: { calories: 312, protein: 3.4, carbs: 41, fat: 15 } },
      { id: "brot_vollkorn", name: "Vollkornbrot", category: "bakery", nutrients: { calories: 247, protein: 9, carbs: 41, fat: 3.4 } },
      { id: "brot_weiss", name: "Wei\xDFbrot", category: "bakery", nutrients: { calories: 265, protein: 9, carbs: 49, fat: 3.2 } },
      { id: "haferflocken", name: "Haferflocken", category: "carbs", nutrients: { calories: 379, protein: 13, carbs: 68, fat: 7 } },
      { id: "banane", name: "Banane", category: "fruit", nutrients: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 } },
      { id: "orange", name: "Orange", category: "fruit", nutrients: { calories: 47, protein: 0.9, carbs: 12, fat: 0.1 } },
      { id: "erdbeeren", name: "Erdbeeren", category: "fruit", nutrients: { calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3 } },
      { id: "zwiebel", name: "Zwiebel", category: "vegetable", nutrients: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1 } },
      { id: "paprika", name: "Paprika", category: "vegetable", nutrients: { calories: 31, protein: 1, carbs: 6, fat: 0.3 } },
      { id: "gurke_salat", name: "Gurkensalat", category: "vegetable", nutrients: { calories: 12, protein: 0.5, carbs: 2.2, fat: 0.1 } },
      { id: "brokkoli_gekocht", name: "Brokkoli, gekocht", category: "vegetable", nutrients: { calories: 35, protein: 2.4, carbs: 7, fat: 0.4 } },
      { id: "spinat_roh", name: "Spinat, roh", category: "vegetable", nutrients: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 } },
      { id: "avocado", name: "Avocado", category: "fruit", nutrients: { calories: 160, protein: 2, carbs: 8.5, fat: 15 } },
      { id: "nuesse_mandeln", name: "Mandeln", category: "snack", nutrients: { calories: 579, protein: 21, carbs: 22, fat: 50 } },
      { id: "erdnussbutter", name: "Erdnussbutter", category: "snack", nutrients: { calories: 588, protein: 25, carbs: 20, fat: 50 } },
      { id: "schokolade_milch", name: "Vollmilchschokolade", category: "snack", nutrients: { calories: 535, protein: 7.6, carbs: 59, fat: 30 } },
      { id: "honig", name: "Honig", category: "sauce", nutrients: { calories: 304, protein: 0.3, carbs: 82, fat: 0 } },
      { id: "zucker", name: "Zucker", category: "carbs", nutrients: { calories: 387, protein: 0, carbs: 100, fat: 0 } },
      { id: "linsen_gekocht", name: "Linsen, gekocht", category: "protein", nutrients: { calories: 116, protein: 9, carbs: 20, fat: 0.4 } },
      { id: "kichererbsen_gekocht", name: "Kichererbsen, gekocht", category: "protein", nutrients: { calories: 164, protein: 8.9, carbs: 27, fat: 2.6 } },
      { id: "tofu", name: "Tofu natur", category: "protein", nutrients: { calories: 76, protein: 8, carbs: 1.9, fat: 4.8 } },
      { id: "schinken_gekocht", name: "Kochschinken", category: "protein", nutrients: { calories: 107, protein: 18, carbs: 1.5, fat: 3.5 } },
      { id: "salami", name: "Salami", category: "protein", nutrients: { calories: 336, protein: 22, carbs: 1.5, fat: 27 } },
      { id: "wurst_wiener", name: "Wiener W\xFCrstchen", category: "protein", nutrients: { calories: 290, protein: 11, carbs: 2, fat: 26 } },
      { id: "pizza_margherita", name: "Pizza Margherita (St\xFCck)", category: "readymeal", nutrients: { calories: 250, protein: 10, carbs: 30, fat: 10 } },
      { id: "doener_fleisch", name: "D\xF6nerfleisch (Kalb/H\xE4hnchen)", category: "protein", nutrients: { calories: 215, protein: 18, carbs: 3, fat: 14 } },
      { id: "reis_natur_roh", name: "Reis, roh", category: "carbs", nutrients: { calories: 360, protein: 7, carbs: 79, fat: 0.6 } },
      { id: "nudeln_roh", name: "Nudeln, roh", category: "carbs", nutrients: { calories: 371, protein: 13, carbs: 75, fat: 1.5 } },
      { id: "cola", name: "Cola", category: "drink", nutrients: { calories: 42, protein: 0, carbs: 10.6, fat: 0 } },
      { id: "orangensaft", name: "Orangensaft", category: "drink", nutrients: { calories: 45, protein: 0.7, carbs: 10, fat: 0.2 } },
      { id: "kaffee_schwarz", name: "Kaffee schwarz", category: "drink", nutrients: { calories: 2, protein: 0.1, carbs: 0, fat: 0 } },
      { id: "protein_shake", name: "Proteinshake (Whey, Wasser)", category: "drink", nutrients: { calories: 80, protein: 18, carbs: 2, fat: 0.5 } },
      { id: "oliven", name: "Oliven", category: "vegetable", nutrients: { calories: 115, protein: 0.8, carbs: 6, fat: 11 } },
      { id: "mozzarella", name: "Mozzarella", category: "dairy", nutrients: { calories: 280, protein: 18, carbs: 2.2, fat: 22 } },
      { id: "parmesan", name: "Parmesan", category: "dairy", nutrients: { calories: 431, protein: 38, carbs: 4, fat: 29 } },
      { id: "sahne", name: "Sahne 30%", category: "dairy", nutrients: { calories: 292, protein: 2.5, carbs: 3, fat: 30 } },
      { id: "kokosmilch", name: "Kokosmilch", category: "sauce", nutrients: { calories: 197, protein: 2.3, carbs: 3.3, fat: 21 } },
      { id: "sojasauce", name: "Sojasauce", category: "sauce", nutrients: { calories: 53, protein: 8, carbs: 4.9, fat: 0.1 } },
      { id: "essig", name: "Essig", category: "sauce", nutrients: { calories: 18, protein: 0, carbs: 0.9, fat: 0 } },
      { id: "champignons", name: "Champignons", category: "vegetable", nutrients: { calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3 } },
      { id: "karotte", name: "Karotte", category: "vegetable", nutrients: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2 } },
      { id: "mais", name: "Mais", category: "vegetable", nutrients: { calories: 86, protein: 3.3, carbs: 19, fat: 1.2 } },
      { id: "couscous_gekocht", name: "Couscous, gekocht", category: "carbs", nutrients: { calories: 112, protein: 3.8, carbs: 23, fat: 0.2 } },
      { id: "quinoa_gekocht", name: "Quinoa, gekocht", category: "carbs", nutrients: { calories: 120, protein: 4.4, carbs: 21, fat: 1.9 } },
      { id: "fladenbrot", name: "Fladenbrot", category: "bakery", nutrients: { calories: 275, protein: 9, carbs: 50, fat: 4 } },
      { id: "speck", name: "Speck", category: "protein", nutrients: { calories: 540, protein: 15, carbs: 0, fat: 52 } },
      { id: "zitrone", name: "Zitrone", category: "fruit", nutrients: { calories: 29, protein: 1.1, carbs: 9, fat: 0.3 } },
      { id: "falafel", name: "Falafel", category: "protein", nutrients: { calories: 333, protein: 13, carbs: 32, fat: 18 } },
      { id: "hummus", name: "Hummus", category: "protein", nutrients: { calories: 166, protein: 8, carbs: 14, fat: 10 } },
      { id: "sushi_maki", name: "Sushi Maki", category: "readymeal", nutrients: { calories: 150, protein: 5, carbs: 28, fat: 2 } },
      { id: "haehnchenfluegel", name: "H\xE4hnchenfl\xFCgel", category: "protein", nutrients: { calories: 203, protein: 18, carbs: 0, fat: 14 } },
      { id: "erdnuesse", name: "Erdn\xFCsse", category: "snack", nutrients: { calories: 567, protein: 26, carbs: 16, fat: 49 } }
    ];
  }
});

// src/lib/nutrition/foodDisplayName.ts
function capitalizeFoodDisplayName(name) {
  const t2 = name.trim();
  if (!t2) return t2;
  return t2.charAt(0).toLocaleUpperCase("de-DE") + t2.slice(1);
}
function isNonFoodUtensilName(name) {
  return NON_FOOD_UTENSIL_RE.test(name.trim());
}
var NON_FOOD_UTENSIL_RE;
var init_foodDisplayName = __esm({
  "src/lib/nutrition/foodDisplayName.ts"() {
    NON_FOOD_UTENSIL_RE = /^(ofenblech|backblech|backform|auflaufform|pfanne|bratpfanne|backpapier|alufolie|grillrost|dörrgitter)$/i;
  }
});

// src/lib/nutrition/catalog/genericFoodRegistry.ts
function genericSlugFromTableKey(tableKey) {
  return tableKey.replace(/_generic$/, "");
}
function genericFoodIdFromSlug(slug) {
  return `${GENERIC_FOOD_ID_PREFIX}${genericSlugFromTableKey(slug)}`;
}
function nutrientsFromGeneric(n) {
  return {
    calories: Math.round(n.kcal_100g),
    protein: Math.round(n.protein_100g * 10) / 10,
    carbs: Math.round(n.carbs_100g * 10) / 10,
    fat: Math.round(n.fat_100g * 10) / 10
  };
}
function foodFromTableKey(tableKey, displayName) {
  const slug = genericSlugFromTableKey(tableKey);
  const nutrients = GENERIC_NUTRITION_TABLE[tableKey];
  return {
    id: genericFoodIdFromSlug(slug),
    name: capitalizeFoodDisplayName(displayName?.trim() || slug.replace(/_/g, " ")),
    category: "readymeal",
    nutrients: nutrientsFromGeneric(nutrients),
    servings: [{ name: "100 g", grams: 100 }],
    catalogSource: "app"
  };
}
function foodFromBaseline(row) {
  return {
    id: genericFoodIdFromSlug(row.id),
    name: capitalizeFoodDisplayName(row.name),
    category: row.category,
    nutrients: { ...row.nutrients },
    servings: [{ name: "100 g", grams: 100 }],
    catalogSource: "app"
  };
}
function tokenize2(s) {
  return s.toLowerCase().replace(/[^a-z0-9äöüß\s]/gi, " ").split(/\s+/).filter((t2) => t2.length > 1);
}
function lookupGenericFood(nameOrKey) {
  const trimmed = nameOrKey.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(GENERIC_FOOD_ID_PREFIX)) {
    return STATIC_FOODS.find((f) => f.id === trimmed) ?? null;
  }
  const tableKey = resolveGenericTableKey(trimmed);
  if (tableKey) {
    const slug = genericSlugFromTableKey(tableKey);
    const id = genericFoodIdFromSlug(slug);
    const hit = STATIC_FOODS.find((f) => f.id === id);
    if (hit) return hit;
    const nutrients = getGenericFallback(trimmed);
    if (nutrients) {
      return {
        id,
        name: trimmed,
        category: "readymeal",
        nutrients: nutrientsFromGeneric(nutrients),
        servings: [{ name: "100 g", grams: 100 }],
        catalogSource: "app"
      };
    }
  }
  const norm3 = normalizeFoodHint(trimmed).toLowerCase();
  return STATIC_FOODS.find(
    (f) => normalizeFoodHint(f.name).toLowerCase() === norm3 || f.id === genericFoodIdFromSlug(norm3.replace(/\s+/g, "_"))
  ) ?? null;
}
function searchGenericFoods(query, limit = 12) {
  const q = normalizeFoodHint(query).toLowerCase();
  if (q.length < 1) return [];
  const qTokens = tokenize2(q);
  const scored = STATIC_FOODS.map((f) => {
    const n = f.name.toLowerCase();
    const slug = f.id.slice(GENERIC_FOOD_ID_PREFIX.length).replace(/_/g, " ");
    let score = 0;
    if (n === q || slug === q) score += 4;
    if (n.includes(q) || q.includes(n) || slug.includes(q)) score += 2;
    for (const t2 of qTokens) {
      if (n.includes(t2) || slug.includes(t2)) score += 1;
    }
    return { food: f, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "de")).slice(0, limit);
  return scored.map((x) => x.food);
}
function getGenericFoodById(foodId) {
  const id = String(foodId ?? "").trim();
  if (!id.startsWith(GENERIC_FOOD_ID_PREFIX)) return null;
  return STATIC_FOODS.find((f) => f.id === id) ?? lookupGenericFood(id);
}
function isGenericFoodId(foodId) {
  return String(foodId ?? "").startsWith(GENERIC_FOOD_ID_PREFIX);
}
var GENERIC_FOOD_ID_PREFIX, STATIC_FOODS;
var init_genericFoodRegistry = __esm({
  "src/lib/nutrition/catalog/genericFoodRegistry.ts"() {
    init_GenericFallbackTable();
    init_genericFoodBaselines_de();
    init_foodDisplayName();
    init_foodSynonyms_de();
    GENERIC_FOOD_ID_PREFIX = "generic_";
    STATIC_FOODS = (() => {
      const byId = /* @__PURE__ */ new Map();
      for (const key of Object.keys(GENERIC_NUTRITION_TABLE)) {
        const food = foodFromTableKey(key);
        byId.set(food.id, food);
      }
      for (const row of genericFoodBaselines_de_default) {
        const food = foodFromBaseline(row);
        if (!byId.has(food.id)) byId.set(food.id, food);
      }
      return [...byId.values()];
    })();
  }
});

// src/lib/nutrition/catalog/genericBaselineResolver.ts
var genericBaselineResolver_exports = {};
__export(genericBaselineResolver_exports, {
  GENERIC_PREFIX: () => GENERIC_PREFIX,
  baselineToFood: () => baselineToFood,
  getGenericBaselineById: () => getGenericBaselineById,
  isGenericFoodId: () => isGenericFoodId,
  searchGenericBaselines: () => searchGenericBaselines
});
function baselineToFood(row) {
  return lookupGenericFood(row.name) ?? {
    id: `${GENERIC_PREFIX}${row.id}`,
    name: row.name,
    category: row.category,
    nutrients: { ...row.nutrients },
    servings: [{ name: "100 g", grams: 100 }],
    catalogSource: "app"
  };
}
function searchGenericBaselines(query, limit = 5) {
  return searchGenericFoods(query, limit);
}
function getGenericBaselineById(foodId) {
  return getGenericFoodById(foodId);
}
var GENERIC_PREFIX;
var init_genericBaselineResolver = __esm({
  "src/lib/nutrition/catalog/genericBaselineResolver.ts"() {
    init_genericFoodRegistry();
    GENERIC_PREFIX = "generic_";
  }
});

// envBootstrap.ts
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var projectRoot = path.dirname(fileURLToPath(import.meta.url));
function candidateEnvPaths() {
  const cwd = process.cwd();
  return [
    path.join(projectRoot, ".env"),
    path.join(cwd, ".env"),
    path.join(projectRoot, "data", ".env"),
    path.join(cwd, "data", ".env"),
    path.join(projectRoot, "..", ".env"),
    path.join(cwd, "..", ".env")
  ].filter((p, i, arr) => arr.indexOf(p) === i);
}
function isEnvFile(envPath) {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isFile();
  } catch {
    return false;
  }
}
function isEnvDirectory(envPath) {
  try {
    return fs.existsSync(envPath) && fs.statSync(envPath).isDirectory();
  } catch {
    return false;
  }
}
function listReadableEnvFiles() {
  return candidateEnvPaths().filter(isEnvFile);
}
function resolveWritableEnvFilePath() {
  for (const envPath of candidateEnvPaths()) {
    if (isEnvFile(envPath)) return envPath;
    if (!fs.existsSync(envPath)) return envPath;
    if (isEnvDirectory(envPath)) continue;
  }
  const fallback = path.join(projectRoot, "data", ".env");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}
var ENV_FILE_PATH = resolveWritableEnvFilePath();
function getEnvFileDiagnostic() {
  const mountPath = path.join(projectRoot, ".env");
  const envPathIsDirectory = candidateEnvPaths().some(isEnvDirectory);
  const readablePaths = listReadableEnvFiles();
  let problem = null;
  if (isEnvDirectory(mountPath)) {
    problem = `${mountPath} ist ein Ordner statt einer Datei. Docker legt das an, wenn auf dem Host keine .env-Datei existiert. Auf dem NAS im Projektordner: rm -rf .env && cp .env.example .env \u2014 Keys eintragen \u2014 docker compose up -d.`;
  } else if (!readablePaths.length && !process.env.EXERCISEDB_RAPIDAPI_KEY?.trim()) {
    problem = "Keine lesbare .env-Datei gefunden. Keys in docker-compose.yaml (env_file) oder als echte Datei .env auf dem Host anlegen.";
  }
  return { writePath: ENV_FILE_PATH, readablePaths, envPathIsDirectory, problem };
}
var ENV_KEYS_ALWAYS_FROM_FILE = /* @__PURE__ */ new Set(["AI_ACTIVE_PROVIDER"]);
function getMergedEnvFromFiles() {
  const merged = {};
  for (const envPath of listReadableEnvFiles()) {
    try {
      Object.assign(merged, dotenv.parse(fs.readFileSync(envPath, "utf8")));
    } catch {
    }
  }
  return merged;
}
function getPersistedEnvValue(key) {
  const v = getMergedEnvFromFiles()[key];
  if (v == null) return void 0;
  const t2 = String(v).trim();
  return t2.length > 0 ? t2 : void 0;
}
function applyEnvFileToProcess(envPath) {
  if (!isEnvFile(envPath)) return 0;
  let parsed;
  try {
    parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  } catch {
    return 0;
  }
  let n = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null) continue;
    const v = String(value).trim();
    if (!v) continue;
    const cur = process.env[key];
    if (ENV_KEYS_ALWAYS_FROM_FILE.has(key) || cur === void 0 || cur.trim() === "") {
      if (process.env[key] !== v) n += 1;
      process.env[key] = v;
    }
  }
  return n;
}
function bootstrapAllEnvFiles() {
  const merged = getMergedEnvFromFiles();
  let n = 0;
  for (const [key, value] of Object.entries(merged)) {
    const v = String(value).trim();
    if (!v) continue;
    const cur = process.env[key];
    if (ENV_KEYS_ALWAYS_FROM_FILE.has(key) || cur === void 0 || cur.trim() === "") {
      if (process.env[key] !== v) n += 1;
      process.env[key] = v;
    }
  }
  return n;
}
var diag = getEnvFileDiagnostic();
if (diag.envPathIsDirectory && process.env.NODE_ENV !== "test") {
  console.error(`[env] ${diag.problem}`);
}
var applied = bootstrapAllEnvFiles();
if (process.env.NODE_ENV !== "test") {
  const aiProv = process.env.AI_ACTIVE_PROVIDER?.trim();
  if (applied > 0 || aiProv) {
    const edb = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
    console.info(
      `[env] ${applied} Wert(e) aus ${diag.readablePaths.join(", ") || "\u2014"} geladen` + (edb ? ` \xB7 EXERCISEDB_RAPIDAPI_KEY: ${edb.length} Zeichen` : " \xB7 EXERCISEDB_RAPIDAPI_KEY: fehlt in Datei") + (aiProv ? ` \xB7 AI_ACTIVE_PROVIDER: ${aiProv}` : " \xB7 AI_ACTIVE_PROVIDER: nicht gesetzt (Fallback: Mistral wenn beide Keys da)")
    );
  }
}

// server.ts
import express from "express";

// aiProviders.ts
import { GoogleGenAI } from "@google/genai";

// src/lib/aiModelConfig.ts
var AI_MODEL_AREAS = [
  "coach_workout",
  "coach_nutrition",
  "meal",
  "meal_vision",
  "workout_template"
];
var AI_MODEL_AREA_LABELS = {
  coach_workout: "Coach \u2013 Workout",
  coach_nutrition: "Coach \u2013 Ern\xE4hrung",
  meal: "Ern\xE4hrung \u2013 Textanalyse",
  meal_vision: "Ern\xE4hrung \u2013 Bildanalyse",
  workout_template: "Workout-Vorlagen"
};
var OLLAMA_MODELS = [
  { id: "gemma4:e2b", label: "Gemma 4 E2B (lokal, empfohlen)" },
  { id: "gemma2:2b", label: "Gemma 2 2B (lokal)" },
  { id: "llama3.2:1b", label: "Llama 3.2 1B (lokal)" },
  { id: "llama3.2:3b", label: "Llama 3.2 3B (lokal)" },
  { id: "mistral:7b", label: "Mistral 7B (lokal)" }
];
var MISTRAL_TEXT_MODELS = [
  { id: "mistral-large-latest", label: "Mistral Large (beste Qualit\xE4t, JSON)" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-small-latest", label: "Mistral Small (schnell & g\xFCnstig)" }
];
var MISTRAL_VISION_MODELS = [
  { id: "pixtral-large-latest", label: "Pixtral Large (Bilder, empfohlen)" },
  { id: "pixtral-12b-2409", label: "Pixtral 12B" }
];
var DEEPSEEK_MODELS = [
  { id: "deepseek-chat", label: "DeepSeek Chat (V3.2, schnell, JSON)" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner (Denkmodell, langsamer)" }
];
var GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (empfohlen)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (schneller)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (h\xF6here Qualit\xE4t)" }
];
var AI_MODEL_SELECT_OPTIONS = {
  deepseek: {
    coach_workout: DEEPSEEK_MODELS,
    coach_nutrition: DEEPSEEK_MODELS,
    meal: DEEPSEEK_MODELS,
    // DeepSeek hat kein Vision-Modell: Auswahl nur als Platzhalter, Bildanalyse überspringt den Provider.
    meal_vision: DEEPSEEK_MODELS,
    workout_template: DEEPSEEK_MODELS
  },
  ollama: {
    coach_workout: OLLAMA_MODELS,
    coach_nutrition: OLLAMA_MODELS,
    meal: OLLAMA_MODELS,
    meal_vision: OLLAMA_MODELS,
    workout_template: OLLAMA_MODELS
  },
  mistral: {
    coach_workout: MISTRAL_TEXT_MODELS,
    coach_nutrition: MISTRAL_TEXT_MODELS,
    meal: MISTRAL_TEXT_MODELS,
    meal_vision: MISTRAL_VISION_MODELS,
    workout_template: MISTRAL_TEXT_MODELS
  },
  gemini: {
    coach_workout: GEMINI_MODELS,
    coach_nutrition: GEMINI_MODELS,
    meal: GEMINI_MODELS,
    meal_vision: GEMINI_MODELS,
    workout_template: GEMINI_MODELS
  }
};
function getModelSelectOptions(provider, area, currentValue) {
  const base = AI_MODEL_SELECT_OPTIONS[provider]?.[area] ?? [];
  const cur = currentValue?.trim();
  if (cur && !base.some((o) => o.id === cur)) {
    return [{ id: cur, label: `${cur} (aktuell gespeichert)` }, ...base];
  }
  return base;
}
var AI_MODEL_RECOMMENDATIONS = {
  deepseek: {
    coach_workout: {
      model: "deepseek-chat",
      hint: "Schnell und g\xFCnstig, liefert zuverl\xE4ssig JSON"
    },
    coach_nutrition: {
      model: "deepseek-chat",
      hint: "Wochenpl\xE4ne, Makros, Mahlzeiten-Scheduling"
    },
    meal: {
      model: "deepseek-chat",
      hint: "Zutaten-Parsing aus Text"
    },
    meal_vision: {
      model: "deepseek-chat",
      hint: "Kein Vision-Modell \u2014 Fotos laufen \xFCber Gemini oder Mistral"
    },
    workout_template: {
      model: "deepseek-chat",
      hint: "Strukturierte Workout-Vorlagen (JSON)"
    }
  },
  ollama: {
    coach_workout: {
      model: "gemma4:e2b",
      hint: "Lokales Gemma 4 E2B Modell via Ollama (schnell, privat, kein API-Key)"
    },
    coach_nutrition: {
      model: "gemma4:e2b",
      hint: "Lokales Gemma 4 E2B f\xFCr personalisierte Wochenern\xE4hrung"
    },
    meal: {
      model: "gemma4:e2b",
      hint: "Lokale Textanalyse & Zutaten-Erkennung"
    },
    meal_vision: {
      model: "gemma4:e2b",
      hint: "Multimodal: Lokale Foto-Mahlzeitanalyse mit Gemma 4"
    },
    workout_template: {
      model: "gemma4:e2b",
      hint: "Lokale strukturierte Vorlagenerstellung"
    }
  },
  mistral: {
    coach_workout: {
      model: "mistral-medium-latest",
      hint: "Schneller als Large, weiterhin starkes JSON (Woche 1)"
    },
    coach_nutrition: {
      model: "mistral-large-latest",
      hint: "Wochenpl\xE4ne, Makros, Mahlzeiten-Scheduling"
    },
    meal: {
      model: "mistral-small-latest",
      hint: "Schnell & g\xFCnstig f\xFCr Zutaten-Parsing"
    },
    meal_vision: {
      model: "pixtral-large-latest",
      hint: "Bildanalyse (Fotos von Mahlzeiten)"
    },
    workout_template: {
      model: "mistral-large-latest",
      hint: "Strukturierte Workout-Vorlagen (JSON)"
    }
  },
  gemini: {
    coach_workout: {
      model: "gemini-2.5-flash",
      hint: "Fallback Coach-Workout \u2014 oft am schnellsten"
    },
    coach_nutrition: {
      model: "gemini-2.5-flash",
      hint: "Fallback f\xFCr Coach-Ern\xE4hrung"
    },
    meal: {
      model: "gemini-2.5-flash",
      hint: "Text-Parsing & Recherche"
    },
    meal_vision: {
      model: "gemini-2.5-flash",
      hint: "Multimodal (Bild + Text)"
    },
    workout_template: {
      model: "gemini-2.5-flash",
      hint: "Template-JSON wenn Mistral ausf\xE4llt"
    }
  }
};
var DEFAULTS = {
  deepseek: {
    coach_workout: "deepseek-chat",
    coach_nutrition: "deepseek-chat",
    meal: "deepseek-chat",
    meal_vision: "deepseek-chat",
    workout_template: "deepseek-chat"
  },
  ollama: {
    coach_workout: "gemma4:e2b",
    coach_nutrition: "gemma4:e2b",
    meal: "gemma4:e2b",
    meal_vision: "gemma4:e2b",
    workout_template: "gemma4:e2b"
  },
  mistral: {
    coach_workout: "mistral-medium-latest",
    coach_nutrition: "mistral-large-latest",
    meal: "mistral-small-latest",
    meal_vision: "pixtral-large-latest",
    workout_template: "mistral-large-latest"
  },
  gemini: {
    coach_workout: "gemini-2.5-flash",
    coach_nutrition: "gemini-2.5-flash",
    meal: "gemini-2.5-flash",
    meal_vision: "gemini-2.5-flash",
    workout_template: "gemini-2.5-flash"
  }
};
var GEMINI_DEPRECATED_MODEL_MAP = {
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-001": "gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite-001": "gemini-2.5-flash-lite",
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-pro"
};
function normalizeModel(provider, raw, area) {
  const value = raw.trim();
  if (!value) return value;
  if (provider !== "gemini") return value;
  const mapped = GEMINI_DEPRECATED_MODEL_MAP[value];
  if (mapped) {
    console.warn(`[AI] Migrating deprecated Gemini model ${value} -> ${mapped} for ${area}`);
    return mapped;
  }
  return value;
}
function envKey(provider, area) {
  return `AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`;
}
function legacyCoachModel(provider) {
  return process.env[`AI_${provider.toUpperCase()}_MODEL_COACH`]?.trim() || void 0;
}
function getAiModel(provider, area) {
  const fromEnv = process.env[envKey(provider, area)]?.trim();
  if (fromEnv && fromEnv.length > 0) return normalizeModel(provider, fromEnv, area);
  if (area === "coach_workout" || area === "coach_nutrition") {
    const legacy = legacyCoachModel(provider);
    if (legacy && legacy.length > 0) return normalizeModel(provider, legacy, area);
  }
  const fallback = DEFAULTS[provider][area];
  if (!fallback) {
    console.warn(`[AI] No model default for ${provider}/${area}, using coach_workout default`);
    return DEFAULTS[provider].coach_workout;
  }
  return normalizeModel(provider, fallback, area);
}
function getAllAiModels() {
  return {
    deepseek: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("deepseek", a)])),
    ollama: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("ollama", a)])),
    mistral: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("mistral", a)])),
    gemini: Object.fromEntries(AI_MODEL_AREAS.map((a) => [a, getAiModel("gemini", a)]))
  };
}
function coachAreaForPlanType(planType) {
  return planType === "nutrition" ? "coach_nutrition" : "coach_workout";
}

// aiProviders.ts
var activeProviderOverride = null;
function parseProviderToken(raw) {
  const t2 = raw?.trim().toLowerCase();
  if (t2 === "ollama" || t2 === "deepseek" || t2 === "gemini" || t2 === "mistral") return t2;
  return null;
}
function syncActiveProviderFromEnv() {
  const fromFile = parseProviderToken(getPersistedEnvValue("AI_ACTIVE_PROVIDER"));
  const fromProcess = parseProviderToken(process.env.AI_ACTIVE_PROVIDER);
  const chosen = fromFile ?? fromProcess ?? activeProviderOverride;
  activeProviderOverride = chosen;
  if (chosen) process.env.AI_ACTIVE_PROVIDER = chosen;
  return chosen;
}
syncActiveProviderFromEnv();
function setActiveProviderOverride(provider) {
  activeProviderOverride = provider;
}
function getActiveProviderOverride() {
  return activeProviderOverride;
}
function getOllamaBaseUrl() {
  const url = process.env.OLLAMA_BASE_URL?.trim() || "http://ollama:11434";
  return url.replace(/\/+$/, "");
}
function getLocalLlmModel(area) {
  if (area) {
    const areaModel = getAiModel("ollama", area);
    if (areaModel) return areaModel;
  }
  return process.env.LOCAL_LLM_MODEL?.trim() || "gemma4:e2b";
}
function isOllamaConfigured() {
  return Boolean(
    process.env.OLLAMA_BASE_URL?.trim() || process.env.LOCAL_LLM_MODEL?.trim() || process.env.AI_ACTIVE_PROVIDER === "ollama"
  );
}
var PLACEHOLDER_SUBSTRINGS = [
  "your_mistral_api_key_here",
  "your_gemini_api_key_here",
  "your_deepseek_api_key_here"
];
function getDeepSeekBaseUrl() {
  const url = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  return url.replace(/\/+$/, "");
}
function getDeepSeekModel(area) {
  return getAiModel("deepseek", area);
}
function isDeepSeekConfigured() {
  return isConfiguredApiKey(process.env.DEEPSEEK_API_KEY);
}
function isConfiguredApiKey(key) {
  if (key == null || typeof key !== "string") return false;
  const t2 = key.trim();
  if (t2.length < 16) return false;
  const lower2 = t2.toLowerCase();
  if (PLACEHOLDER_SUBSTRINGS.some((p) => lower2.includes(p))) return false;
  if (/^your[_\s]/i.test(t2) && /key/i.test(t2)) return false;
  return true;
}
function resolveAiCapabilities() {
  const preferred = syncActiveProviderFromEnv();
  const ollamaConfigured = isOllamaConfigured();
  const deepseekConfigured = isDeepSeekConfigured();
  const mistralConfigured = isConfiguredApiKey(process.env.MISTRAL_API_KEY);
  const geminiConfigured = isConfiguredApiKey(process.env.GEMINI_API_KEY);
  const e2eMock = process.env.COACH_E2E_MOCK === "1";
  const enabled = ollamaConfigured || deepseekConfigured || mistralConfigured || geminiConfigured || e2eMock;
  let provider = "none";
  if (preferred === "ollama" && ollamaConfigured) provider = "ollama";
  else if (preferred === "deepseek" && deepseekConfigured) provider = "deepseek";
  else if (preferred === "gemini" && geminiConfigured) provider = "gemini";
  else if (preferred === "mistral" && mistralConfigured) provider = "mistral";
  else if (deepseekConfigured) provider = "deepseek";
  else if (ollamaConfigured) provider = "ollama";
  else if (mistralConfigured) provider = "mistral";
  else if (geminiConfigured) provider = "gemini";
  else provider = "none";
  return { enabled, provider, ollamaConfigured, deepseekConfigured, mistralConfigured, geminiConfigured };
}
function buildProviderOrder(caps) {
  const order = [];
  const preferred = caps.provider;
  if (preferred === "ollama" || preferred === "deepseek" || preferred === "mistral" || preferred === "gemini") {
    order.push(preferred);
  }
  if (caps.deepseekConfigured && !order.includes("deepseek")) order.push("deepseek");
  if (caps.ollamaConfigured && !order.includes("ollama")) order.push("ollama");
  if (caps.mistralConfigured && !order.includes("mistral")) order.push("mistral");
  if (caps.geminiConfigured && !order.includes("gemini")) order.push("gemini");
  return order;
}
async function testOllamaConnection(baseUrl = getOllamaBaseUrl(), model = getLocalLlmModel()) {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, "");
    const resp = await fetch(`${cleanUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(6e3)
    });
    if (!resp.ok) {
      return { ok: false, error: `Ollama HTTP ${resp.status}: ${resp.statusText}` };
    }
    const data = await resp.json();
    const available = (data.models ?? []).map((m) => m.name);
    const targetNormalized = model.includes(":") ? model : `${model}:latest`;
    const hasModel = available.some((m) => {
      const norm3 = m.includes(":") ? m : `${m}:latest`;
      return norm3 === targetNormalized || m === model || m.startsWith(`${model}:`);
    });
    if (!hasModel) {
      return {
        ok: false,
        error: available.length > 0 ? `Ollama ist online, aber Modell '${model}' ist noch nicht heruntergeladen. Verf\xFCgbar: ${available.join(", ")}` : `Ollama ist online, aber es ist noch kein Modell heruntergeladen (Modell '${model}' fehlt noch).`
      };
    }
    return { ok: true, model, modelsAvailable: available };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Ollama nicht erreichbar unter ${baseUrl}: ${msg}` };
  }
}
async function pullOllamaModel(model = getLocalLlmModel(), baseUrl = getOllamaBaseUrl()) {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, "");
    const resp = await fetch(`${cleanUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Pull failed: ${txt}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function mistralChat(messages, jsonObject, temperature, area) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...jsonObject ? { response_format: { type: "json_object" } } : {},
      temperature,
      max_tokens: 8e3
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function mistralVision(messages, temperature, jsonObject, area) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const model = getAiModel("mistral", area);
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...jsonObject ? { response_format: { type: "json_object" } } : {},
      temperature,
      max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral vision error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Mistral vision empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function deepseekChat(messages, jsonObject, temperature, area) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("DEEPSEEK_API_KEY not configured");
  const model = getDeepSeekModel(area);
  const flat = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map((part) => part.type === "text" ? part.text : "").join("\n").trim()
  }));
  const body = {
    model,
    messages: flat,
    temperature,
    max_tokens: 8e3,
    stream: false
  };
  if (jsonObject && !model.includes("reasoner")) {
    body.response_format = { type: "json_object" };
  }
  const resp = await fetch(`${getDeepSeekBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18e4)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`DeepSeek error ${resp.status}: ${txt.slice(0, 400)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`DeepSeek empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function geminiGenerate(prompt, inlineImage, generation, area) {
  const key = process.env.GEMINI_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("GEMINI_API_KEY not configured");
  const ai = new GoogleGenAI({ apiKey: key });
  const parts = [{ text: prompt }];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }
  const configured = getAiModel("gemini", area);
  const fallbackOrder = [configured, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"].map((m) => m.trim()).filter((m, idx, arr) => m.length > 0 && arr.indexOf(m) === idx);
  let lastError = null;
  for (const model of fallbackOrder) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          temperature: generation?.temperature ?? 0.35
        }
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error(`Empty Gemini response (model=${model}, area=${area})`);
      }
      if (model !== configured) {
        console.warn(`[AI] Gemini fallback model active: ${configured} -> ${model} (area=${area})`);
      }
      return text;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const retryWithNext = /not found|unsupported|invalid argument|404/i.test(msg) || msg.includes("models/") || msg.includes("generateContent");
      if (!retryWithNext) throw error;
      console.warn(`[AI] Gemini model failed (${model}, area=${area}) -> trying fallback`, error);
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`Gemini request failed for all fallback models (area=${area})`);
}
async function testMistralApiKey(apiKey) {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ung\xFCltiges API-Key-Format" };
  const model = "mistral-small-latest";
  try {
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 8,
        temperature: 0
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Mistral ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function testGeminiApiKey(apiKey) {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ung\xFCltiges API-Key-Format" };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `Gemini ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function testDeepSeekApiKey(apiKey) {
  if (!isConfiguredApiKey(apiKey)) return { ok: false, error: "Ung\xFCltiges API-Key-Format" };
  const model = "deepseek-chat";
  try {
    const resp = await fetch(`${getDeepSeekBaseUrl()}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(15e3)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `DeepSeek ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function ollamaChat(messages, jsonObject, temperature, area) {
  const baseUrl = getOllamaBaseUrl();
  const model = getLocalLlmModel(area);
  const ollamaMsgs = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      ollamaMsgs.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      let textContent = "";
      const images = [];
      for (const part of m.content) {
        if (part.type === "text") {
          textContent += (textContent ? "\n" : "") + part.text;
        } else if (part.type === "image_url") {
          const match = part.image_url.match(/^data:[^;]+;base64,(.+)$/);
          images.push(match ? match[1] : part.image_url);
        }
      }
      ollamaMsgs.push({
        role: m.role,
        content: textContent,
        ...images.length > 0 ? { images } : {}
      });
    }
  }
  if (jsonObject && ollamaMsgs.length > 0) {
    const last = ollamaMsgs[ollamaMsgs.length - 1];
    if (!last.content.includes("JSON")) {
      last.content += "\n\nRespond with ONLY valid JSON (no markdown formatting, no extra explanations).";
    }
  }
  const numCtx = parseInt(process.env.OLLAMA_NUM_CTX || "8192", 10) || 8192;
  const payload = {
    model,
    messages: ollamaMsgs,
    stream: false,
    options: {
      temperature,
      num_ctx: numCtx
    }
  };
  if (jsonObject) {
    payload.format = "json";
  }
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Ollama error ${resp.status} (${model}): ${txt}`);
  }
  const data = await resp.json();
  const content = data.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error(`Ollama empty response (model=${model}, area=${area})`);
  }
  return content;
}
async function completeCoachJson(messages, area = "coach_workout") {
  return completeCoachJsonForArea(messages, area);
}
async function completeCoachNutritionJson(messages) {
  return completeCoachJsonForArea(messages, "coach_nutrition");
}
async function completeCoachJsonForArea(messages, area) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no AI provider or API keys configured");
  const providerOrder = buildProviderOrder(caps);
  const merged = messages.map((m) => `${m.role.toUpperCase()}:
${m.content}`).join("\n\n---\n\n");
  const geminiPrompt = `${merged}

Respond with ONLY valid JSON (no markdown fences). Use English weekday names in schedule[].day: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.`;
  let lastError;
  for (const provider of providerOrder) {
    try {
      if (provider === "ollama") {
        return await ollamaChat(messages, true, 0.4, area);
      }
      if (provider === "deepseek") {
        return await deepseekChat(messages, true, 0.45, area);
      }
      if (provider === "mistral") {
        return await mistralChat(messages, true, 0.45, area);
      }
      return await geminiGenerate(geminiPrompt, void 0, { temperature: 0.4 }, area);
    } catch (e) {
      lastError = e;
      console.warn(
        `[AI] Coach request failed (${provider}, area=${area}, model=${getAiModel(provider, area)}):`,
        e
      );
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "Coach AI request failed for all configured providers"));
}
async function completeMealAnalysis(prompt, image, options) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no AI provider or API keys configured");
  const temp = options?.temperature ?? 0.35;
  const responseMode = options?.responseMode ?? "text";
  const wantJson = responseMode === "json_object";
  const area = image ? "meal_vision" : "meal";
  const providerOrder = buildProviderOrder(caps);
  const geminiPrompt = wantJson ? `${prompt}

Respond with ONLY valid JSON (no markdown fences).` : prompt;
  let lastError = null;
  for (const provider of providerOrder) {
    try {
      if (provider === "ollama") {
        if (image) {
          const dataUrl = `data:${image.mimeType};base64,${image.data}`;
          const messages = [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: dataUrl }
              ]
            }
          ];
          return await ollamaChat(messages, wantJson, Math.min(0.55, temp + 0.15), area);
        }
        return await ollamaChat([{ role: "user", content: prompt }], wantJson, temp, area);
      }
      if (provider === "deepseek") {
        if (image) throw new Error("DeepSeek unterst\xFCtzt keine Bildanalyse");
        return await deepseekChat([{ role: "user", content: prompt }], wantJson, temp, area);
      }
      if (provider === "mistral") {
        if (image) {
          const dataUrl = `data:${image.mimeType};base64,${image.data}`;
          const messages = [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: dataUrl }
              ]
            }
          ];
          return await mistralVision(messages, Math.min(0.55, temp + 0.15), wantJson, area);
        }
        return await mistralChat([{ role: "user", content: prompt }], wantJson, temp, area);
      }
      return await geminiGenerate(geminiPrompt, image, { temperature: temp }, area);
    } catch (e) {
      lastError = e;
      console.warn(`[AI] Meal analysis failed (${provider}, area=${area}, model=${getAiModel(provider, area)}):`, e);
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Meal analysis failed for all configured providers");
}
async function completeWorkoutTemplateJson(prompt) {
  return completeCoachJsonForArea([{ role: "user", content: prompt }], "workout_template");
}

// src/lib/envFileManager.ts
import fs2 from "fs";
import path2 from "path";
function isEnvFile2(p) {
  try {
    return fs2.existsSync(p) && fs2.statSync(p).isFile();
  } catch {
    return false;
  }
}
function assertNotDirectory(targetPath) {
  if (!fs2.existsSync(targetPath)) return;
  if (fs2.statSync(targetPath).isDirectory()) {
    throw new Error(
      getEnvFileDiagnostic().problem ?? `${targetPath} ist ein Ordner \u2014 auf dem NAS: rm -rf .env && cp .env.example .env`
    );
  }
}
function getEnvFilePath() {
  return ENV_FILE_PATH;
}
function getEnvFileProblem() {
  return getEnvFileDiagnostic().problem;
}
function parsedEnvFile() {
  return getMergedEnvFromFiles();
}
function reloadEnvFromFile() {
  let applied2 = 0;
  for (const envPath of listReadableEnvFiles()) {
    applied2 += applyEnvFileToProcess(envPath);
  }
  return { path: ENV_FILE_PATH, applied: applied2 };
}
function envVarStatusInFile(key) {
  const val = parsedEnvFile()[key];
  if (val === void 0) return "missing";
  if (!String(val).trim()) return "empty";
  return "set";
}
function envVarLengthInFile(key) {
  const val = parsedEnvFile()[key];
  if (val === void 0 || !String(val).trim()) return null;
  return String(val).trim().length;
}
function upsertEnvVar(key, value) {
  const diag2 = getEnvFileDiagnostic();
  const writePath = ENV_FILE_PATH;
  if (diag2.envPathIsDirectory) {
    fs2.mkdirSync(path2.dirname(writePath), { recursive: true });
  } else {
    assertNotDirectory(writePath);
  }
  const line = `${key}=${escapeEnvValue(value)}`;
  let content = "";
  const readable = listReadableEnvFiles();
  if (readable.length) {
    content = fs2.readFileSync(readable[0], "utf8");
  } else if (isEnvFile2(writePath)) {
    content = fs2.readFileSync(writePath, "utf8");
  }
  const examplePath = path2.join(path2.dirname(writePath), ".env.example");
  if (!content.trim() && isEnvFile2(examplePath)) {
    content = fs2.readFileSync(examplePath, "utf8");
  }
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + (content.endsWith("\n") || !content ? "" : "\n") + line + "\n";
  }
  fs2.mkdirSync(path2.dirname(writePath), { recursive: true });
  fs2.writeFileSync(writePath, content, "utf8");
  process.env[key] = value;
  if (key === "AI_ACTIVE_PROVIDER") {
    for (const extraPath of listReadableEnvFiles()) {
      if (extraPath === writePath) continue;
      try {
        let extra = fs2.readFileSync(extraPath, "utf8");
        const extraRe = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
        if (extraRe.test(extra)) extra = extra.replace(extraRe, line);
        else extra = extra.trimEnd() + (extra.endsWith("\n") || !extra ? "" : "\n") + line + "\n";
        fs2.writeFileSync(extraPath, extra, "utf8");
      } catch {
      }
    }
  }
  if (diag2.envPathIsDirectory && process.env.NODE_ENV !== "test") {
    console.warn(
      `[env] ${key} nach ${writePath} geschrieben \u2014 Host-Mount .env ist ein Ordner. Bitte echte .env-Datei auf dem NAS anlegen und Container neu starten.`
    );
  }
}
function escapeEnvValue(value) {
  if (/[\s#"']/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/lib/coachWeekWindow.ts
function toLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalYmd(ymd2) {
  const base = (ymd2 || "").split("T")[0];
  const [y, m, d] = base.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${ymd2}`);
  }
  return new Date(y, m - 1, d);
}
function coachWeekInclusiveEnd(startYmd) {
  const start = parseLocalYmd(startYmd);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return toLocalYmd(end);
}
function addDaysYmd(startYmd, days) {
  const d = parseLocalYmd(startYmd);
  d.setDate(d.getDate() + days);
  return toLocalYmd(d);
}
function calendarWeekMonday(ref = /* @__PURE__ */ new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// src/lib/coachWeekDisplay.ts
var COACH_WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
function indexCoachWeekday(day) {
  return COACH_WEEKDAY_ORDER.indexOf(day);
}
var DAY_SORT_INDEX = Object.fromEntries(
  COACH_WEEKDAY_ORDER.map((d, i) => [d, i])
);
function buildCoachWeekDateMap(startYmd) {
  const out = {};
  if (!startYmd?.trim()) return out;
  try {
    for (let i = 0; i < COACH_WEEKDAY_ORDER.length; i++) {
      out[COACH_WEEKDAY_ORDER[i]] = addDaysYmd(startYmd, i);
    }
  } catch {
  }
  return out;
}

// src/lib/coachSchedulePostprocess.ts
var DAY_ORDER_INDEX = Object.fromEntries(
  COACH_WEEKDAY_ORDER.map((d, i) => [d, i])
);
function restDayTemplate(day) {
  return {
    day,
    isRest: true,
    sessionType: "Recovery",
    title: "Rest day",
    exercises: []
  };
}
var SESSION_SLOT_ORDER = { Morning: 0, Evening: 1 };
function sortSessionsForDay(rows) {
  return [...rows].sort((a, b) => {
    const sa = SESSION_SLOT_ORDER[String(a.sessionSlot || "Morning")] ?? 0;
    const sb = SESSION_SLOT_ORDER[String(b.sessionSlot || "Morning")] ?? 0;
    return sa - sb;
  });
}
function normalizeCoachWorkoutWeekDays(week) {
  const byDay = /* @__PURE__ */ new Map();
  for (const row of week.schedule) {
    const day = String(row.day || "").trim();
    if (!day || !(day in DAY_ORDER_INDEX)) continue;
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  const schedule = [];
  for (const day of COACH_WEEKDAY_ORDER) {
    const rows = byDay.get(day);
    if (!rows?.length) {
      schedule.push(restDayTemplate(day));
      continue;
    }
    const active = rows.filter((r) => r.isRest !== true);
    if (active.length === 0) {
      schedule.push(restDayTemplate(day));
      continue;
    }
    schedule.push(...sortSessionsForDay(active));
  }
  return { ...week, schedule };
}
function applyPartialWeekRestBefore(week, firstActiveDayName) {
  if (!firstActiveDayName?.trim()) return week;
  const startIdx = DAY_ORDER_INDEX[firstActiveDayName];
  if (startIdx == null || startIdx <= 0) return week;
  const schedule = week.schedule.map((row) => {
    const idx = DAY_ORDER_INDEX[String(row.day || "")];
    if (idx == null || idx >= startIdx) return row;
    if (row.isRest === true) return row;
    return {
      ...row,
      day: row.day,
      isRest: true,
      sessionType: "Recovery",
      title: "Rest day",
      exercises: [],
      cardio: void 0
    };
  });
  const ac = [...week.applied_constraints || []];
  ac.push(`repaired:rest_before_${firstActiveDayName}`);
  return {
    ...week,
    schedule,
    applied_constraints: ac.slice(0, 8)
  };
}
function finalizeCoachWorkoutWeek(week, opts) {
  let out = normalizeCoachWorkoutWeekDays(week);
  if (opts?.partialFirstActiveDay) {
    out = applyPartialWeekRestBefore(out, opts.partialFirstActiveDay);
  }
  return out;
}

// src/lib/exerciseDb.ts
var EXERCISEDB_KEY_PREFIX = "edb_";
var EXERCISEDB_MEDIA_BASE = "https://static.exercisedb.dev/media/";
var ExerciseDbFetchError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ExerciseDbFetchError";
  }
};
var EXERCISEDB_ASCEND_V2_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";
var EXERCISEDB_LEGACY_HOST = "exercisedb.p.rapidapi.com";
var ENV_KEY_CANDIDATES = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY"
];
function sanitizeEnvSecret(raw) {
  if (raw == null) return "";
  let k = String(raw).trim();
  if (k.charCodeAt(0) === 65279) k = k.slice(1).trim();
  if (k.startsWith('"') && k.endsWith('"') || k.startsWith("'") && k.endsWith("'")) {
    k = k.slice(1, -1).trim();
  }
  return k;
}
function isPlaceholderKey(value) {
  const v = value.trim().toLowerCase();
  if (v.length < 10) return true;
  const exact = /* @__PURE__ */ new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "replace_me",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "your_rapidapi_key_here",
    "<apikey>",
    "xxx"
  ]);
  if (exact.has(v)) return true;
  if (/^your[_-]/.test(v) && v.length < 36) return true;
  if ((v.endsWith("_here") || v.includes("api_key_here")) && v.length < 36) return true;
  return false;
}
function normalizeApiKey(raw) {
  const k = sanitizeEnvSecret(raw);
  if (!k || isPlaceholderKey(k)) return void 0;
  return k;
}
function resolveExerciseDbKeyFromEnv() {
  for (const name of ENV_KEY_CANDIDATES) {
    const k = normalizeApiKey(process.env[name]);
    if (k) return { key: k, source: name };
  }
  return { key: void 0, source: null };
}
function exerciseDbApiKey() {
  return resolveExerciseDbKeyFromEnv().key;
}
function exerciseDbKeySource() {
  return resolveExerciseDbKeyFromEnv().source;
}
function isExerciseDbConfigured() {
  return Boolean(exerciseDbApiKey());
}
function exerciseDbHost() {
  return process.env.EXERCISEDB_RAPIDAPI_HOST?.trim() || EXERCISEDB_ASCEND_V2_HOST;
}
function isLegacyExerciseDbHost(host = exerciseDbHost()) {
  const h = host.trim().toLowerCase();
  return h === EXERCISEDB_LEGACY_HOST || h === "exercisedb.p.rapidapi.com";
}
function isAscendExerciseDbHost(host = exerciseDbHost()) {
  const h = host.trim().toLowerCase();
  if (isLegacyExerciseDbHost(h)) return false;
  return h.includes("ascendapi") || h.startsWith("edb-with-");
}
function legacyBodyPartToAscendLabel(bodyPart) {
  const key = bodyPart.trim().toLowerCase();
  const map = {
    chest: "Chest",
    back: "Back",
    shoulders: "Shoulders",
    "upper arms": "Upper Arms",
    "lower arms": "Lower Arms",
    "upper legs": "Upper Legs",
    "lower legs": "Lower Legs",
    legs: "Legs",
    waist: "Waist",
    cardio: "Cardio",
    "full body": "Full Body",
    neck: "Neck"
  };
  if (map[key]) return map[key];
  return bodyPart.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function normalizeExerciseDbRaw(raw) {
  const bodyPart = raw.bodyPart || (Array.isArray(raw.bodyParts) && raw.bodyParts[0] ? raw.bodyParts[0] : void 0);
  const target = raw.target || (Array.isArray(raw.targetMuscles) && raw.targetMuscles[0] ? raw.targetMuscles[0] : void 0);
  const equipment = raw.equipment || (Array.isArray(raw.equipments) && raw.equipments.length ? raw.equipments.join(", ") : void 0);
  const exerciseType = raw.exerciseType || (Array.isArray(raw.exerciseTypes) && raw.exerciseTypes[0] ? raw.exerciseTypes[0] : void 0);
  return {
    ...raw,
    id: raw.exerciseId || raw.id,
    bodyPart,
    target,
    equipment,
    exerciseType,
    category: raw.category || exerciseType,
    secondaryMuscles: raw.secondaryMuscles
  };
}
function exerciseDbTestUrl(host) {
  if (isLegacyExerciseDbHost(host)) {
    return `https://${host}/exercises/bodyPart/chest`;
  }
  return `https://${host}/api/v1/exercises/search?search=bench&limit=1`;
}
function authRejectedMessage(host) {
  if (isLegacyExerciseDbHost(host)) {
    return `Key von RapidAPI abgelehnt (401/403). Dein Abo ist vermutlich AscendAPI \u2014 setze in .env: EXERCISEDB_RAPIDAPI_HOST=${EXERCISEDB_ASCEND_V2_HOST}`;
  }
  return "Key von RapidAPI abgelehnt (401/403). Pr\xFCfe im RapidAPI-Playground den exakten Wert von X-RapidAPI-Host und ob du dieses API-Produkt abonniert hast (AscendAPI ExerciseDB V2).";
}
async function testExerciseDbApiKey(apiKey) {
  const k = normalizeApiKey(apiKey);
  if (!k) return { ok: false, error: "Ung\xFCltiger oder leerer Key" };
  const host = exerciseDbHost();
  try {
    const r = await fetch(exerciseDbTestUrl(host), {
      headers: {
        "X-RapidAPI-Key": k,
        "X-RapidAPI-Host": host,
        Accept: "application/json"
      }
    });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: authRejectedMessage(host) };
    }
    const text = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
function toExerciseDbKey(id) {
  const raw = id.replace(/^edb_/, "").trim();
  return `${EXERCISEDB_KEY_PREFIX}${raw}`;
}
function isExerciseDbCatalogKey(key) {
  return key.startsWith(EXERCISEDB_KEY_PREFIX);
}
function resolveMediaUrl(path5) {
  if (!path5 || !String(path5).trim()) return void 0;
  const p = String(path5).trim();
  if (p === "null" || p === "undefined") return void 0;
  if (/^https?:\/\//i.test(p)) return p;
  const clean = p.replace(/^\//, "");
  return `${EXERCISEDB_MEDIA_BASE}${clean}`;
}
function pickBestResolutionUrl(urls, order = ["720p", "1080p", "480p", "360p"]) {
  if (!urls || typeof urls !== "object") return void 0;
  for (const key of order) {
    const hit = resolveMediaUrl(urls[key]);
    if (hit) return hit;
  }
  for (const v of Object.values(urls)) {
    const hit = resolveMediaUrl(v);
    if (hit) return hit;
  }
  return void 0;
}
var BODY_PART_TO_TAGS = {
  chest: ["brust"],
  back: ["r\xFCcken"],
  shoulders: ["schulter"],
  "upper arms": ["arme"],
  "lower arms": ["arme"],
  "upper legs": ["beine"],
  "lower legs": ["beine"],
  legs: ["beine"],
  waist: ["core"],
  cardio: ["cardio_art"],
  "full body": ["ganzk\xF6rper"]
};
function categoryFromRaw(raw) {
  const cat = `${raw.category || ""} ${raw.exerciseType || ""}`.toLowerCase();
  if (cat.includes("cardio") || cat.includes("plyometric") && raw.bodyPart?.toLowerCase() === "cardio") {
    return "cardio";
  }
  if (/\b(run|bike|swim|row|cardio|endurance|aerobic)\b/i.test(`${raw.name} ${raw.target}`)) {
    return "cardio";
  }
  return "strength";
}
function tagsFromRaw(raw) {
  const tags = /* @__PURE__ */ new Set();
  const partNames = [];
  if (Array.isArray(raw.bodyParts)) {
    for (const p of raw.bodyParts) {
      const s = String(p || "").toLowerCase().trim();
      if (s) partNames.push(s);
    }
  }
  const bpSingle = (raw.bodyPart || "").toLowerCase().trim();
  if (bpSingle) partNames.push(bpSingle);
  for (const bp of partNames) {
    for (const t2 of BODY_PART_TO_TAGS[bp] || []) tags.add(t2);
  }
  const target = (raw.target || "").toLowerCase();
  if (/quad|glute|hamstring|calve|leg|hip/.test(target)) tags.add("beine");
  if (/pectoral|chest/.test(target)) tags.add("brust");
  if (/lat|trap|back|rhomb/.test(target)) tags.add("r\xFCcken");
  if (/delt|shoulder/.test(target)) tags.add("schulter");
  if (/bicep|tricep|forearm|arm/.test(target)) tags.add("arme");
  if (/ab|oblique|core|waist/.test(target)) tags.add("core");
  if (categoryFromRaw(raw) === "cardio") tags.add("cardio_art");
  return [...tags];
}
function mapExerciseDbToCatalog(raw) {
  const norm3 = normalizeExerciseDbRaw(raw);
  const id = String(norm3.exerciseId || norm3.id || "").trim();
  const name = String(norm3.name || "").trim();
  if (!id || !name) return null;
  const imageUrl = resolveMediaUrl(norm3.imageUrl) || pickBestResolutionUrl(norm3.imageUrls);
  const videoUrl = resolveMediaUrl(norm3.videoUrl) || pickBestResolutionUrl(norm3.videoUrls);
  const gifUrl = resolveMediaUrl(norm3.gifUrl) || imageUrl;
  return {
    key: toExerciseDbKey(id),
    exerciseId: id,
    name,
    category: categoryFromRaw(norm3),
    tags: tagsFromRaw(norm3),
    gifUrl,
    imageUrl,
    videoUrl,
    bodyPart: norm3.bodyPart,
    targetMuscle: norm3.target,
    equipment: norm3.equipment,
    secondaryMuscles: norm3.secondaryMuscles,
    instructions: norm3.instructions,
    overview: norm3.overview || norm3.description,
    exerciseTips: norm3.exerciseTips,
    variations: norm3.variations,
    difficulty: norm3.difficulty,
    source: "exercisedb"
  };
}
function muscleFilterToBodyParts(muscle) {
  switch (muscle) {
    case "brust":
      return ["chest"];
    case "r\xFCcken":
      return ["back"];
    case "schulter":
      return ["shoulders"];
    case "beine":
      return ["upper legs", "lower legs"];
    case "arme":
      return ["upper arms", "lower arms"];
    case "core":
      return ["waist"];
    case "ganzk\xF6rper":
      return ["full body"];
    case "cardio_art":
      return ["cardio"];
    default:
      return [];
  }
}

// src/lib/exerciseNameLocalizationCache.ts
var germanByExerciseKey = /* @__PURE__ */ new Map();
function rememberCachedGermanExerciseName(exerciseKey, nameDe) {
  const key = exerciseKey.trim();
  const de = nameDe.trim();
  if (key && de) germanByExerciseKey.set(key, de);
}

// src/lib/exerciseResolve.ts
var DE_EXERCISE_ALIASES = {
  bankdr\u00FCcken: "bench press",
  bankdruecken: "bench press",
  bankdruck: "bench press",
  schr\u00E4gbankdr\u00FCcken: "incline bench press",
  schraegbankdruecken: "incline bench press",
  kniebeuge: "barbell squat",
  kniebeugen: "barbell squat",
  frontkniebeuge: "front squat",
  kreuzheben: "barbell deadlift",
  "rum\xE4nisches kreuzheben": "romanian deadlift",
  rum\u00E4nisches: "romanian deadlift",
  klimmzug: "pull up",
  klimmz\u00FCge: "pull up",
  latzug: "lat pulldown",
  rudern: "barbell row",
  langhantelrudern: "barbell row",
  kurzhantelrudern: "dumbbell row",
  schulterdr\u00FCcken: "shoulder press",
  schulterdruecken: "shoulder press",
  "seitliches heben": "lateral raise",
  frontheben: "front raise",
  bizepscurl: "dumbbell biceps curl",
  "bizeps curl": "dumbbell biceps curl",
  hammercurl: "hammer curl",
  trizepsdr\u00FCcken: "triceps pushdown",
  trizepsdruecken: "triceps pushdown",
  dips: "triceps dip",
  liegest\u00FCtz: "push up",
  liegestutze: "push up",
  beinpresse: "leg press",
  beinstrecker: "leg extension",
  beinbeuger: "leg curl",
  wadenheben: "calf raise",
  ausfallschritt: "lunge",
  ausfallschritte: "lunge",
  "hip thrust": "hip thrust",
  plank: "front plank",
  planka: "front plank",
  crunch: "crunch",
  bauchpresse: "crunch",
  butterfly: "chest fly",
  fliegende: "dumbbell fly",
  "face pull": "face pull",
  kabelzug: "cable crossover",
  "hip abduction": "hip abduction",
  "hip adduction": "hip adduction"
};
function normalizeExerciseSearchText(s) {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

// src/lib/exerciseCatalogCache.ts
var cache = /* @__PURE__ */ new Map();
function getCachedCatalogExercise(key) {
  return cache.get(key);
}

// src/lib/exerciseLibrary.ts
function getLibraryExercise(key) {
  return getCachedCatalogExercise(key);
}

// src/lib/coachExerciseDisplay.ts
function germanLabelFromAliasKey(key) {
  return key.split(" ").map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : "").join(" ");
}
var EN_NORM_TO_DE = (() => {
  const m = /* @__PURE__ */ new Map();
  for (const [deKey, enVal] of Object.entries(DE_EXERCISE_ALIASES)) {
    m.set(normalizeExerciseSearchText(enVal), germanLabelFromAliasKey(deKey));
  }
  const extra = {
    "chin up": "Klimmzug",
    "chin ups": "Klimmz\xFCge",
    "chin-ups": "Klimmz\xFCge",
    "pull-ups": "Klimmz\xFCge",
    "pull up": "Klimmzug",
    "pull ups": "Klimmz\xFCge",
    "push up": "Liegest\xFCtz",
    "push ups": "Liegest\xFCtze",
    "diamond press": "Diamant-Liegest\xFCtz",
    "hammer press": "Hammerdr\xFCcken",
    "incline press": "Schr\xE4gbankdr\xFCcken",
    "bench press": "Bankdr\xFCcken",
    "barbell squat": "Kniebeuge",
    "front squat": "Frontkniebeuge",
    "romanian deadlift": "Rum\xE4nisches Kreuzheben",
    "barbell deadlift": "Kreuzheben",
    "lat pulldown": "Latzug",
    "leg press": "Beinpresse",
    "leg curl": "Beinbeuger",
    "leg extension": "Beinstrecker",
    "calf raise": "Wadenheben",
    "lateral raise": "Seitheben",
    "shoulder press": "Schulterdr\xFCcken",
    "triceps pushdown": "Trizepsdr\xFCcken",
    "triceps dip": "Trizeps-Dips",
    "bicep curl": "Bizepscurl",
    "biceps curl": "Bizepscurl",
    "dumbbell curl": "Kurzhantelcurl",
    "barbell row": "Langhantelrudern",
    "dumbbell row": "Kurzhantelrudern",
    "jump squat": "Sprungkniebeuge",
    "suspended row": "Klimmzug am Ring",
    "inverted pullover": "Invertierter Pullover",
    "self assisted inverted pullover": "Unterst\xFCtzter invertierter Pullover",
    "dumbbell incline one arm hammer press": "Schr\xE4gbank Einarm-Hammerdr\xFCcken"
  };
  for (const [en, de] of Object.entries(extra)) {
    m.set(normalizeExerciseSearchText(en), de);
  }
  return m;
})();
function translateExerciseNameToGerman(englishName) {
  const n = normalizeExerciseSearchText(englishName);
  if (!n) return englishName;
  const exact = EN_NORM_TO_DE.get(n);
  if (exact) return exact;
  let best = null;
  for (const [en, de] of EN_NORM_TO_DE) {
    if (en.length < 4) continue;
    if (n.includes(en) || en.includes(n)) {
      if (!best || en.length > best.len) best = { de, len: en.length };
    }
  }
  if (best) return best.de;
  return englishName;
}
function looksGermanExerciseName(name) {
  const n = name.toLowerCase();
  return /[äöüß]/i.test(name) || /\b(klimmzug|liegestütz|kniebeuge|bankdrücken|aufwärmen|mobilisation|schulter|seitheben|beinpresse|latzug|trizeps|bizeps|rudern|kreuzheben)\b/i.test(
    n
  );
}

// src/lib/exerciseNameLocalizationDb.ts
function createPgExerciseNameLocalizationStore(pool2) {
  return {
    async getGermanNamesByKeys(keys) {
      const uniq = [...new Set(keys.map((k) => k.trim()).filter((k) => k && isExerciseDbCatalogKey(k)))];
      if (!uniq.length) return /* @__PURE__ */ new Map();
      const r = await pool2.query(
        `SELECT exercise_key, name_de FROM exercise_name_localizations WHERE exercise_key = ANY($1::text[])`,
        [uniq]
      );
      const out = /* @__PURE__ */ new Map();
      for (const row of r.rows) {
        const key = String(row.exercise_key || "").trim();
        const de = String(row.name_de || "").trim();
        if (key && de) out.set(key, de);
      }
      return out;
    },
    async upsertMany(rows) {
      const valid = rows.filter(
        (r) => r.exerciseKey && isExerciseDbCatalogKey(r.exerciseKey) && r.nameDe.trim() && r.nameEn.trim()
      );
      if (!valid.length) return;
      for (const row of valid) {
        await pool2.query(
          `INSERT INTO exercise_name_localizations (exercise_key, name_en, name_de, source, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (exercise_key) DO UPDATE SET
             name_en = EXCLUDED.name_en,
             name_de = EXCLUDED.name_de,
             source = EXCLUDED.source,
             updated_at = NOW()
           WHERE exercise_name_localizations.name_de IS DISTINCT FROM EXCLUDED.name_de
              OR exercise_name_localizations.name_en IS DISTINCT FROM EXCLUDED.name_en`,
          [row.exerciseKey, row.nameEn.trim(), row.nameDe.trim(), row.source]
        );
      }
    }
  };
}
function collectExerciseDbKeysFromCoachWeek(week) {
  const keys = /* @__PURE__ */ new Set();
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (!ex || typeof ex !== "object") continue;
      const key = typeof ex.exerciseKey === "string" ? ex.exerciseKey.trim() : "";
      if (key && isExerciseDbCatalogKey(key)) keys.add(key);
    }
  }
  return [...keys];
}
function hydrateCoachWorkoutWeekGermanNames(week, dbNames) {
  if (!dbNames.size) return { week, changed: false };
  let changed = false;
  for (const day of week.schedule || []) {
    if (day.isRest || !Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      if (!ex || typeof ex !== "object") continue;
      const row = ex;
      const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
      if (!key) continue;
      const de = dbNames.get(key);
      if (!de || row.name === de) continue;
      row.name = de;
      changed = true;
    }
  }
  return { week, changed };
}
function collectLocalizationRowsFromCoachWeek(week, catalogEnglish, source = "ai") {
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (!ex || typeof ex !== "object") continue;
      const row = ex;
      const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
      const nameDe = String(row.name || "").trim();
      if (!key || !isExerciseDbCatalogKey(key) || !nameDe || seen.has(key)) continue;
      const nameEn = catalogEnglish(key) || nameDe;
      seen.add(key);
      rows.push({ exerciseKey: key, nameEn, nameDe, source });
    }
  }
  return rows;
}

// src/lib/parseCoachJson.ts
function stripMarkdownCodeFences(raw) {
  let t2 = (raw || "").trim();
  if (!t2.startsWith("```")) return t2;
  t2 = t2.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
  t2 = t2.replace(/\s*```\s*$/m, "").trim();
  return t2;
}
function parseJsonLoose(raw) {
  const stripped = stripMarkdownCodeFences(raw);
  return JSON.parse(stripped);
}

// src/lib/coachExerciseLocalization.ts
var germanNameByExerciseKey = /* @__PURE__ */ new Map();
function pickCoachExerciseNameAfterResolve(storedName, catalogName) {
  const stored = String(storedName || "").trim();
  const catalog = String(catalogName || "").trim();
  if (stored && looksGermanExerciseName(stored)) return stored;
  return catalog || stored;
}
function catalogEnglishName(exerciseKey) {
  if (!isExerciseDbCatalogKey(exerciseKey)) return void 0;
  return getLibraryExercise(exerciseKey)?.name?.trim() || void 0;
}
function collectMainRows(week) {
  const rows = [];
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (ex && typeof ex === "object") rows.push(ex);
    }
  }
  return rows;
}
function rememberGermanName(exerciseKey, nameDe) {
  if (!exerciseKey || !nameDe) return;
  germanNameByExerciseKey.set(exerciseKey, nameDe);
  rememberCachedGermanExerciseName(exerciseKey, nameDe);
}
function applyStaticOrCachedName(row, english, exerciseKey, dbNames) {
  if (exerciseKey && dbNames?.has(exerciseKey)) {
    row.name = dbNames.get(exerciseKey);
    rememberGermanName(exerciseKey, row.name);
    return true;
  }
  if (exerciseKey && germanNameByExerciseKey.has(exerciseKey)) {
    row.name = germanNameByExerciseKey.get(exerciseKey);
    return true;
  }
  const staticDe = translateExerciseNameToGerman(english);
  if (staticDe !== english && looksGermanExerciseName(staticDe)) {
    row.name = staticDe;
    if (exerciseKey) rememberGermanName(exerciseKey, staticDe);
    return true;
  }
  return false;
}
async function applyDbGermanNamesToCoachWorkoutWeek(week, store) {
  const keys = collectExerciseDbKeysFromCoachWeek(week);
  if (!keys.length) return week;
  const dbNames = await store.getGermanNamesByKeys(keys);
  for (const [key, de] of dbNames) rememberGermanName(key, de);
  const { week: hydrated, changed } = hydrateCoachWorkoutWeekGermanNames(week, dbNames);
  if (changed) appendLocalizationConstraint(hydrated);
  return hydrated;
}
async function persistWeekLocalizationsToStore(week, store, source) {
  if (!store) return;
  const rows = collectLocalizationRowsFromCoachWeek(week, catalogEnglishName, source).filter(
    (r) => looksGermanExerciseName(r.nameDe)
  );
  if (rows.length) await store.upsertMany(rows);
}
async function applyGermanNamesToCoachWorkoutWeek(week, locale, callAi, store) {
  if (locale !== "de") return week;
  let working = week;
  if (store) {
    working = await applyDbGermanNamesToCoachWorkoutWeek(week, store);
  }
  const dbNames = store ? await store.getGermanNamesByKeys(collectExerciseDbKeysFromCoachWeek(working)) : /* @__PURE__ */ new Map();
  const rows = collectMainRows(working);
  if (!rows.length) return working;
  const pendingById = /* @__PURE__ */ new Map();
  let changedCount = 0;
  for (const row of rows) {
    const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
    const stored = String(row.name || "").trim();
    const english = (key ? catalogEnglishName(key) : void 0) || stored;
    if (!english) continue;
    if (stored && looksGermanExerciseName(stored)) {
      if (key && looksGermanExerciseName(stored)) rememberGermanName(key, stored);
      continue;
    }
    if (applyStaticOrCachedName(row, english, key, dbNames)) {
      changedCount += 1;
      continue;
    }
    const id = key || `n:${normalizeExerciseSearchText(english)}`;
    if (!pendingById.has(id)) pendingById.set(id, { id, english, rows: [] });
    pendingById.get(id).rows.push(row);
  }
  const needsAi = [...pendingById.values()];
  if (!needsAi.length) {
    if (changedCount > 0) appendLocalizationConstraint(working);
    await persistWeekLocalizationsToStore(working, store, "static");
    return working;
  }
  const applyFallback = (p) => {
    const de = translateExerciseNameToGerman(p.english);
    const final = de !== p.english ? de : p.english;
    for (const r of p.rows) r.name = final;
    if (p.id.startsWith("edb_")) rememberGermanName(p.id, final);
    if (final !== p.english) changedCount += 1;
  };
  if (!callAi) {
    for (const p of needsAi) applyFallback(p);
    if (changedCount > 0) appendLocalizationConstraint(working);
    await persistWeekLocalizationsToStore(working, store, "static");
    return working;
  }
  const CHUNK = 20;
  for (let i = 0; i < needsAi.length; i += CHUNK) {
    const chunk = needsAi.slice(i, i + CHUNK);
    const list = chunk.map((p) => ({ id: p.id, nameEn: p.english }));
    const prompt = `Du bist Fitness-Coach und \xFCbersetzt \xDCbungsnamen ins Deutsche.
Gib f\xFCr jede \xDCbung einen kurzen, gut verst\xE4ndlichen deutschen Gym-Namen (nat\xFCrliches Deutsch, keine w\xF6rtliche 1:1-\xDCbersetzung langer Englischstitel).
Regeln:
- Maximal 6 W\xF6rter, keine Klammern, kein Englisch
- Title Case (z. B. "Schr\xE4gbankdr\xFCcken", "Rotierende Liegest\xFCtze im Knienstand")
- Nur JSON ausgeben, kein Markdown

Eingabe:
${JSON.stringify(list)}

Antwortformat:
{"items":[{"id":"<id>","nameDe":"..."}]}`;
    try {
      const raw = await callAi(prompt);
      const parsed = parseJsonLoose(raw);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const byId = /* @__PURE__ */ new Map();
      for (const it of items) {
        const id = String(it?.id || "").trim();
        const nameDe = String(it?.nameDe || "").trim();
        if (id && nameDe && looksGermanExerciseName(nameDe)) byId.set(id, nameDe);
      }
      for (const p of chunk) {
        const de = byId.get(p.id);
        if (de) {
          for (const r of p.rows) r.name = de;
          if (p.id.startsWith("edb_")) rememberGermanName(p.id, de);
          changedCount += 1;
        } else {
          applyFallback(p);
        }
      }
    } catch {
      for (const p of chunk) applyFallback(p);
    }
  }
  if (changedCount > 0) appendLocalizationConstraint(working);
  await persistWeekLocalizationsToStore(working, store, "ai");
  return working;
}
function appendLocalizationConstraint(week) {
  week.applied_constraints = [
    ...Array.isArray(week.applied_constraints) ? week.applied_constraints : [],
    "localized:exercise_names_de"
  ].slice(0, 8);
}

// src/lib/coachSessionDistribution.ts
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var ALLOWED_DAY_SET = new Set(DAY_NAMES);
function normalizeCoachDayName(raw) {
  const t2 = String(raw || "").trim();
  if (!t2) return null;
  const cap = t2.charAt(0).toUpperCase() + t2.slice(1).toLowerCase();
  if (ALLOWED_DAY_SET.has(cap)) return cap;
  const lower2 = t2.toLowerCase();
  const map = {
    sun: "Sunday",
    sunday: "Sunday",
    sonntag: "Sunday",
    mon: "Monday",
    monday: "Monday",
    montag: "Monday",
    tue: "Tuesday",
    tuesday: "Tuesday",
    dienstag: "Tuesday",
    wed: "Wednesday",
    wednesday: "Wednesday",
    mittwoch: "Wednesday",
    thu: "Thursday",
    thursday: "Thursday",
    donnerstag: "Thursday",
    fri: "Friday",
    friday: "Friday",
    freitag: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
    samstag: "Saturday"
  };
  return map[lower2] ?? (ALLOWED_DAY_SET.has(cap) ? cap : null);
}
function pickEvenlySpacedIndices(m, n) {
  if (n <= 0 || m <= 0) return [];
  if (n >= m) return Array.from({ length: m }, (_, i) => i);
  if (n === 1) return [Math.floor((m - 1) / 2)];
  const indices = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < n; i++) {
    const idx = Math.round(i * (m - 1) / (n - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      indices.push(idx);
    }
  }
  for (let j = 0; indices.length < n && j < m; j++) {
    if (!seen.has(j)) {
      seen.add(j);
      indices.push(j);
    }
  }
  return indices.sort((a, b) => a - b);
}
function computeTrainingSlotPlan(availableTrainingDays, targetSessions, allowDoubleSessions) {
  const sorted = COACH_WEEKDAY_ORDER.filter(
    (d) => availableTrainingDays.some((raw) => normalizeCoachDayName(raw) === d)
  );
  const m = sorted.length;
  const n = Math.max(0, Math.floor(targetSessions));
  if (m === 0 || n === 0) return null;
  if (n <= m) {
    const idx = pickEvenlySpacedIndices(m, n);
    return {
      workoutDays: idx.map((i) => sorted[i]),
      doubleSessionDays: [],
      targetSessions: n,
      availableDayCount: m
    };
  }
  if (!allowDoubleSessions) {
    return {
      workoutDays: sorted,
      doubleSessionDays: [],
      targetSessions: n,
      availableDayCount: m
    };
  }
  const extras = n - m;
  const doubleIdx = pickEvenlySpacedIndices(m, extras);
  return {
    workoutDays: sorted,
    doubleSessionDays: doubleIdx.map((i) => sorted[i]),
    targetSessions: n,
    availableDayCount: m
  };
}
function formatTrainingSlotPlanForPrompt(plan) {
  const restOnAvailable = plan.availableDayCount > plan.workoutDays.length ? ` Mark other *available* weekdays as rest (isRest=true).` : "";
  if (plan.doubleSessionDays.length > 0) {
    return `EXACTLY ${plan.targetSessions} sessions/week: one session on each of ${plan.workoutDays.join(", ")}; SECOND session on ${plan.doubleSessionDays.join(", ")} (use sessionSlot Morning/Evening).${restOnAvailable}`;
  }
  return `EXACTLY ${plan.targetSessions} non-rest sessions this week \u2014 ONLY on: ${plan.workoutDays.join(", ")}.` + restOnAvailable + ` All other weekdays (including unused available days) MUST be isRest=true.`;
}

// src/lib/coachCustomScheduleAlign.ts
function normalizeSlot(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "morning" || s === "morgens" || s === "am") return "Morning";
  if (s === "evening" || s === "abends" || s === "pm") return "Evening";
  return null;
}
function filterAssignmentsFromStartDay(assignments, startDay) {
  const start = normalizeCoachDayName(startDay);
  if (!start) return assignments;
  const idx = indexCoachWeekday(start);
  if (idx < 0) return assignments;
  const allowed = new Set(COACH_WEEKDAY_ORDER.slice(idx));
  return assignments.filter((a) => {
    const d = normalizeCoachDayName(a.day);
    return d && allowed.has(d);
  });
}
function stubForAssignment(a) {
  const isCardio = a.sessionTypeHint === "cardio";
  const dur = a.durationMin && a.durationMin > 0 ? a.durationMin : isCardio ? 45 : 60;
  return {
    day: a.day,
    sessionSlot: a.sessionSlot,
    isRest: false,
    sessionType: isCardio ? "Cardio" : "Strength",
    title: isCardio ? "Cardio session" : "Strength session",
    estimatedDuration: dur,
    exercises: isCardio ? [] : [{ name: "Main lift", sets: 3, reps: "8-10" }, { name: "Accessory", sets: 3, reps: "10-12" }, { name: "Core", sets: 2, reps: "12-15" }],
    ...isCardio ? { cardio: { duration: String(dur), details: "Easy aerobic" } } : {}
  };
}
function sessionTypeForHint(row, hint) {
  if (hint === "cardio") {
    const st = String(row.sessionType || "").toLowerCase();
    return st.includes("interval") ? "Intervals" : "Cardio";
  }
  return "Strength";
}
function pickTemplate(schedule, day, hint, used) {
  for (let i = 0; i < schedule.length; i++) {
    if (used.has(i)) continue;
    const row = schedule[i];
    if (row.isRest === true) continue;
    if (normalizeCoachDayName(String(row.day)) !== day) continue;
    used.add(i);
    return row;
  }
  for (let i = 0; i < schedule.length; i++) {
    if (used.has(i)) continue;
    const row = schedule[i];
    if (row.isRest === true) continue;
    const st = String(row.sessionType || "").toLowerCase();
    const matchCardio = hint === "cardio" && (st.includes("cardio") || st.includes("interval"));
    const matchStr = hint === "strength" && (st.includes("strength") || st.includes("technique") || st.includes("cross"));
    if (matchCardio || matchStr) {
      used.add(i);
      return row;
    }
  }
  return null;
}
function alignScheduleToCustomAssignments(week, assignments) {
  if (!assignments.length) return week;
  const used = /* @__PURE__ */ new Set();
  const aligned = [];
  for (const a of assignments) {
    const day = normalizeCoachDayName(a.day) || a.day;
    const slot = a.sessionSlot;
    let idx = -1;
    for (let i = 0; i < week.schedule.length; i++) {
      if (used.has(i)) continue;
      const row = week.schedule[i];
      if (row.isRest === true) continue;
      if (normalizeCoachDayName(String(row.day)) !== day) continue;
      if (normalizeSlot(row.sessionSlot) === slot) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      for (let i = 0; i < week.schedule.length; i++) {
        if (used.has(i)) continue;
        const row = week.schedule[i];
        if (row.isRest === true) continue;
        if (normalizeCoachDayName(String(row.day)) !== day) continue;
        if (normalizeSlot(row.sessionSlot) == null) {
          idx = i;
          break;
        }
      }
    }
    if (idx >= 0) {
      used.add(idx);
      const row = week.schedule[idx];
      aligned.push({
        ...row,
        day,
        sessionSlot: slot,
        isRest: false,
        sessionType: sessionTypeForHint(row, a.sessionTypeHint)
      });
      continue;
    }
    const tpl = pickTemplate(week.schedule, day, a.sessionTypeHint, used);
    const base = tpl || stubForAssignment(a);
    aligned.push({
      ...base,
      day,
      sessionSlot: slot,
      isRest: false,
      sessionType: sessionTypeForHint(base, a.sessionTypeHint),
      exercises: a.sessionTypeHint === "cardio" ? [] : Array.isArray(base.exercises) && base.exercises.length ? base.exercises : [{ name: "Main lift", sets: 3, reps: "8-10" }],
      cardio: a.sessionTypeHint === "cardio" ? base.cardio ?? { duration: "30", details: "Easy aerobic" } : void 0
    });
  }
  const ac = [...week.applied_constraints || []];
  const before = week.schedule.filter((d) => d.isRest !== true).length;
  if (before !== aligned.length) {
    ac.push(`repaired:aligned_custom_assignments=${before}->${aligned.length}`);
  }
  return { ...week, schedule: aligned, applied_constraints: ac.slice(0, 8) };
}

// src/lib/coachSessionVolume.ts
function numOrNull(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}
function parseCoachSessionVolume(ob, trainingStyle) {
  const style = trainingStyle || String(ob.trainingStyle || "strength");
  const legacyDays = numOrNull(ob.trainingDays);
  const legacyDur = numOrNull(ob.sessionDuration);
  const legacyCoachDays = ob.coachDecidesTrainingDays === true || ob.coachAdaptiveVolume === true;
  const legacyCoachDur = ob.coachDecidesSessionDuration === true || ob.coachAdaptiveVolume === true;
  let strengthSessions = numOrNull(ob.strengthSessionsPerWeek);
  let cardioSessions = numOrNull(ob.cardioSessionsPerWeek);
  let strengthDur = numOrNull(ob.strengthSessionDurationMin);
  let cardioDur = numOrNull(ob.cardioSessionDurationMin);
  let coachStrSess = ob.coachDecidesStrengthSessions === true;
  let coachCarSess = ob.coachDecidesCardioSessions === true;
  let coachStrDur = ob.coachDecidesStrengthDuration === true;
  let coachCarDur = ob.coachDecidesCardioDuration === true;
  if (strengthSessions == null && cardioSessions == null && legacyDays != null) {
    if (style === "endurance") {
      cardioSessions = legacyDays;
      strengthSessions = 0;
    } else if (style === "hybrid") {
      strengthSessions = Math.max(1, Math.ceil(legacyDays * 0.6));
      cardioSessions = Math.max(0, legacyDays - strengthSessions);
    } else {
      strengthSessions = legacyDays;
      cardioSessions = 0;
    }
  }
  if (strengthDur == null && legacyDur != null) strengthDur = legacyDur;
  if (cardioDur == null && legacyDur != null) cardioDur = Math.min(legacyDur, 60);
  if (legacyCoachDays && !coachStrSess && !coachCarSess) {
    coachStrSess = true;
    coachCarSess = style === "hybrid" || style === "endurance";
  }
  if (legacyCoachDur && !coachStrDur && !coachCarDur) {
    coachStrDur = true;
    coachCarDur = style === "hybrid" || style === "endurance";
  }
  return {
    strengthSessionsPerWeek: coachStrSess ? null : strengthSessions,
    cardioSessionsPerWeek: coachCarSess ? null : cardioSessions,
    strengthDurationMin: coachStrDur ? null : strengthDur,
    cardioDurationMin: coachCarDur ? null : cardioDur,
    coachDecidesStrengthSessions: coachStrSess,
    coachDecidesCardioSessions: coachCarSess,
    coachDecidesStrengthDuration: coachStrDur,
    coachDecidesCardioDuration: coachCarDur
  };
}
function totalWeeklySessions(vol) {
  if (vol.coachDecidesStrengthSessions || vol.coachDecidesCardioSessions) return null;
  return (vol.strengthSessionsPerWeek ?? 0) + (vol.cardioSessionsPerWeek ?? 0);
}
function strengthExerciseRangeForDuration(min) {
  if (min <= 45) return "4\u20135";
  if (min <= 60) return "5\u20137";
  if (min <= 75) return "6\u20138";
  if (min <= 90) return "7\u20138";
  return "8\u201310";
}
function filterAvailableDaysFromStart(availableTrainingDays, partialWeekStartDay) {
  const sorted = COACH_WEEKDAY_ORDER.filter(
    (d) => availableTrainingDays.some((raw) => normalizeCoachDayName(raw) === d)
  );
  if (!partialWeekStartDay) return sorted;
  const start = normalizeCoachDayName(partialWeekStartDay);
  if (!start) return sorted;
  const idx = indexCoachWeekday(start);
  if (idx < 0) return sorted;
  const allowed = new Set(COACH_WEEKDAY_ORDER.slice(idx));
  return sorted.filter((d) => allowed.has(d));
}
function maxSessionsInDayWindow(dayCount, allowDoubles) {
  if (dayCount <= 0) return 0;
  return allowDoubles ? dayCount * 2 : dayCount;
}
function capVolumeForPartialWeek(strengthN, cardioN, days, allowDoubles) {
  const maxSlots = maxSessionsInDayWindow(days.length, allowDoubles);
  const total = strengthN + cardioN;
  if (total <= maxSlots) return { strength: strengthN, cardio: cardioN };
  let ns = Math.floor(strengthN * maxSlots / total);
  let nc = maxSlots - ns;
  if (strengthN > 0 && cardioN > 0) {
    if (ns === 0) {
      ns = 1;
      nc = maxSlots - 1;
    }
    if (nc === 0) {
      nc = 1;
      ns = maxSlots - 1;
    }
  }
  return { strength: Math.min(ns, strengthN), cardio: Math.min(nc, cardioN) };
}
function interleaveSessionTypes(strengthN, cardioN) {
  const queue = [];
  let s = strengthN;
  let c = cardioN;
  while (s > 0 || c > 0) {
    if (s >= c && s > 0) {
      queue.push("strength");
      s -= 1;
    } else if (c > 0) {
      queue.push("cardio");
      c -= 1;
    } else break;
  }
  return queue;
}
function distributeVolumeAssignments(days, strengthN, cardioN, allowDoubles, vol, ob) {
  const total = strengthN + cardioN;
  if (total <= 0 || !days.length) return [];
  const slotPlan = computeTrainingSlotPlan(days, total, allowDoubles);
  if (!slotPlan) return [];
  const queue = interleaveSessionTypes(strengthN, cardioN);
  const doubleSet = new Set(slotPlan.doubleSessionDays);
  const orderedWorkoutDays = COACH_WEEKDAY_ORDER.filter((d) => slotPlan.workoutDays.includes(d));
  const assignments = [];
  let qi = 0;
  for (const day of orderedWorkoutDays) {
    const slotsOnDay = doubleSet.has(day) ? 2 : 1;
    for (let i = 0; i < slotsOnDay && qi < queue.length; i += 1) {
      const hint = queue[qi];
      qi += 1;
      let durationMin;
      if (hint === "cardio" && !vol.coachDecidesCardioDuration && vol.cardioDurationMin) {
        durationMin = vol.cardioDurationMin;
      } else if (hint === "strength" && !vol.coachDecidesStrengthDuration && vol.strengthDurationMin) {
        durationMin = vol.strengthDurationMin;
      }
      assignments.push({
        day,
        sessionSlot: i === 0 ? "Morning" : "Evening",
        sessionTypeHint: hint,
        durationMin
      });
    }
  }
  return enrichAssignmentsWithDuration(assignments, ob);
}
function buildVolumeAssignmentsFromOnboarding(ob, opts) {
  const vol = parseCoachSessionVolume(ob);
  const allowDoubles = ob.allowDoubleSessions !== false;
  if (ob.scheduleMode === "custom" && ob.customWeekPlan && typeof ob.customWeekPlan === "object") {
    const plan = computeTrainingSlotPlanFromCustom(ob.customWeekPlan);
    if (!plan) return null;
    let assignments = enrichAssignmentsWithDuration(
      plan.assignments,
      ob,
      ob.customWeekPlan
    );
    if (opts?.partialWeekStartDay) {
      assignments = filterAssignmentsFromStartDay(assignments, opts.partialWeekStartDay);
    }
    return assignments.length ? assignments : null;
  }
  if (vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions) return null;
  const availRaw = Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [];
  const days = filterAvailableDaysFromStart(availRaw, opts?.partialWeekStartDay);
  if (!days.length) return null;
  const style = String(ob.trainingStyle || "strength");
  let strengthN = vol.coachDecidesStrengthSessions ? 0 : vol.strengthSessionsPerWeek ?? 0;
  let cardioN = vol.coachDecidesCardioSessions ? 0 : vol.cardioSessionsPerWeek ?? 0;
  if (style === "strength") cardioN = 0;
  if (style === "endurance") strengthN = 0;
  if (opts?.partialWeekStartDay && strengthN + cardioN > 0) {
    const capped = capVolumeForPartialWeek(strengthN, cardioN, days, allowDoubles);
    strengthN = capped.strength;
    cardioN = capped.cardio;
  }
  if (strengthN + cardioN === 0) return null;
  return distributeVolumeAssignments(days, strengthN, cardioN, allowDoubles, vol, ob);
}
function formatSessionVolumeForPrompt(ob, slotPlan, opts) {
  const vol = parseCoachSessionVolume(ob);
  const lines = [];
  const partial = !!opts?.partialWeekStartDay;
  const weekScope = partial ? `THIS partial first week (only from ${opts.partialWeekStartDay} through Sunday \u2014 days before must be Rest)` : "this calendar week";
  const ext = slotPlan;
  const assignStrength = ext?.assignments?.filter((a) => a.sessionTypeHint === "strength").length;
  const assignCardio = ext?.assignments?.filter((a) => a.sessionTypeHint === "cardio").length;
  const strengthTarget = assignStrength != null && assignStrength > 0 ? assignStrength : vol.strengthSessionsPerWeek;
  const cardioTarget = assignCardio != null && assignCardio > 0 ? assignCardio : vol.cardioSessionsPerWeek;
  if (partial && (assignStrength != null || assignCardio != null)) {
    lines.push(
      `**Partial-week note:** Athlete's full-week targets may be higher; for ${weekScope} use ONLY the counts below (do NOT schedule Mon\u2013Tue or other days before the start day).`
    );
  }
  if (vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions) {
    lines.push(
      `**Session count (${weekScope}, COACH-DECIDED):** Choose strength and cardio counts on remaining available weekdays (typical 2\u20136 total).`
    );
  } else {
    if (vol.coachDecidesStrengthSessions) {
      lines.push(`**Strength sessions (${weekScope}):** COACH-DECIDED.`);
    } else if (strengthTarget != null && strengthTarget > 0) {
      lines.push(
        `**Strength sessions (${weekScope}):** EXACTLY ${strengthTarget} non-rest Strength sessions \u2014 NOT Cardio.`
      );
    }
    if (vol.coachDecidesCardioSessions) {
      lines.push(`**Cardio sessions (${weekScope}):** COACH-DECIDED.`);
    } else if (cardioTarget != null && cardioTarget > 0) {
      lines.push(
        `**Cardio sessions (${weekScope}):** EXACTLY ${cardioTarget} non-rest Cardio/Intervals sessions \u2014 NOT Strength.`
      );
    }
  }
  if (vol.coachDecidesStrengthDuration && vol.coachDecidesCardioDuration) {
    lines.push("**Session duration:** COACH-DECIDED per session type.");
  } else {
    if (!vol.coachDecidesStrengthDuration && vol.strengthDurationMin) {
      const n = vol.strengthDurationMin;
      const ex = strengthExerciseRangeForDuration(n);
      lines.push(
        `**Strength duration:** Each Strength session MUST have estimatedDuration=${n} (minutes) and ${ex} main exercises (3\u20134 working sets each, plus warmupExercises/cooldownExercises). NEVER a ${n}min strength session with only 1\u20132 main exercises.`
      );
    }
    if (!vol.coachDecidesCardioDuration && vol.cardioDurationMin) {
      lines.push(
        `**Cardio duration:** Each Cardio/Intervals session MUST have estimatedDuration=${vol.cardioDurationMin} and a complete cardio object (duration/distance + pace/zones).`
      );
    }
  }
  if (ext?.assignments?.length) {
    lines.push(
      `**Do NOT swap types:** Each listed slot is fixed as strength OR cardio \u2014 match sessionType and content to the slot hint.`
    );
    return lines.join("\n");
  }
  const total = strengthTarget != null && cardioTarget != null && !vol.coachDecidesStrengthSessions && !vol.coachDecidesCardioSessions ? (strengthTarget ?? 0) + (cardioTarget ?? 0) : totalWeeklySessions(vol);
  if (total != null && total > 0 && slotPlan) {
    lines.push(`**Total non-rest sessions (${weekScope}):** EXACTLY ${total}.`);
  }
  return lines.join("\n");
}
function enrichAssignmentsWithDuration(assignments, ob, customPlan) {
  const vol = parseCoachSessionVolume(ob);
  return assignments.map((a) => {
    let durationMin = a.durationMin;
    if (durationMin == null && customPlan) {
      const daySlots = customPlan[a.day] || [];
      const match = daySlots.find(
        (s) => (s.sessionSlot || "Morning") === a.sessionSlot && (s.type === "cardio" ? "cardio" : "strength") === a.sessionTypeHint
      );
      if (match?.durationMin != null) durationMin = match.durationMin;
    }
    if (durationMin == null) {
      if (a.sessionTypeHint === "cardio" && !vol.coachDecidesCardioDuration) {
        durationMin = vol.cardioDurationMin ?? void 0;
      } else if (a.sessionTypeHint === "strength" && !vol.coachDecidesStrengthDuration) {
        durationMin = vol.strengthDurationMin ?? void 0;
      }
    }
    return durationMin != null ? { ...a, durationMin } : a;
  });
}
function resolveTrainingSlotPlanWithVolume(ob, partialWeekStartDay) {
  const assignments = buildVolumeAssignmentsFromOnboarding(ob, { partialWeekStartDay });
  if (assignments?.length) {
    const days2 = [...new Set(assignments.map((a) => a.day))];
    const doubleDays = days2.filter((d) => assignments.filter((a) => a.day === d).length >= 2);
    const avail = filterAvailableDaysFromStart(
      Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : days2,
      partialWeekStartDay
    );
    return {
      workoutDays: COACH_WEEKDAY_ORDER.filter((d) => days2.includes(d)),
      doubleSessionDays: doubleDays,
      targetSessions: assignments.length,
      availableDayCount: avail.length || days2.length,
      assignments
    };
  }
  const vol = parseCoachSessionVolume(ob);
  const total = totalWeeklySessions(vol);
  if (total == null || total <= 0) return null;
  const days = filterAvailableDaysFromStart(
    Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
    partialWeekStartDay
  );
  if (!days.length) return null;
  return computeTrainingSlotPlan(days, total, ob.allowDoubleSessions !== false);
}

// src/lib/coachCustomWeekPlan.ts
function computeTrainingSlotPlanFromCustom(plan) {
  const assignments = [];
  const workoutDays = [];
  const doubleSessionDays = [];
  for (const day of COACH_WEEKDAY_ORDER) {
    const raw = plan[day] || [];
    const active = raw.filter((s) => s.type === "strength" || s.type === "cardio");
    if (active.length === 0) continue;
    workoutDays.push(day);
    if (active.length >= 2) doubleSessionDays.push(day);
    active.forEach((slot, i) => {
      const sessionSlot = slot.sessionSlot || (i === 0 ? "Morning" : "Evening");
      assignments.push({
        day,
        sessionSlot,
        sessionTypeHint: slot.type === "cardio" ? "cardio" : "strength",
        durationMin: typeof slot.durationMin === "number" && Number.isFinite(slot.durationMin) ? Math.floor(slot.durationMin) : void 0
      });
    });
  }
  const targetSessions = assignments.length;
  if (targetSessions === 0) return null;
  return {
    scheduleMode: "custom",
    workoutDays,
    doubleSessionDays,
    targetSessions,
    availableDayCount: workoutDays.length,
    assignments
  };
}
function isCoachDecidesTrainingDays(ob) {
  return ob.coachDecidesTrainingDays === true || ob.coachAdaptiveVolume === true;
}
function resolveTrainingSlotPlanFromOnboarding(ob, partialWeekStartDay) {
  return resolveTrainingSlotPlanWithVolume(ob, partialWeekStartDay);
}
function formatExtendedSlotPlanForPrompt(plan) {
  const ext = plan;
  if (ext.assignments?.length) {
    const lines = ext.assignments.map((a) => {
      const dur = a.durationMin != null && a.durationMin > 0 ? `estimatedDuration MUST be ${a.durationMin}` : "estimatedDuration: coach decides";
      const typeRule = a.sessionTypeHint === "cardio" ? `sessionType MUST be Cardio or Intervals; populate cardio object; exercises=[] or short accessory only; ${dur}` : `sessionType MUST be Strength; ${dur}; include ${a.durationMin ? strengthExerciseRangeForDuration(a.durationMin) : "5\u20137"} main exercises (3\u20134 working sets each) \u2014 NOT 1\u20132 exercises for 60min`;
      return `- ${a.day} (${a.sessionSlot}): ${typeRule}`;
    });
    return `EXACTLY ${ext.targetSessions} non-rest sessions \u2014 custom athlete week plan (do NOT move sessions to other days):
` + lines.join("\n") + "\nDays without a listed session MUST be isRest=true. Same weekday may have two rows (Morning + Evening).";
  }
  return formatTrainingSlotPlanForPrompt(plan);
}

// src/lib/coachBenchmarkProfile.ts
function parseDecimal(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
var RUN_KEYS = ["run_5k", "run_10k", "run_half", "run_longest", "run_weekly_km"];
var STRENGTH_BAR_KEYS = ["squat_1rm", "bench_1rm", "deadlift_1rm", "ohp_1rm"];
var STRENGTH_BW_KEYS = ["pullups_max", "pushups_max"];
var STRENGTH_DB_KEYS = ["db_bench", "db_row"];
var STRENGTH_KB_KEYS = ["kb_swing", "tgu"];
function parseHhMmToSeconds(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < 0 || b >= 60) return null;
  if (a <= 4) return a * 60 + b;
  return a * 3600 + b * 60;
}
function deriveRunBestPaceSecPerKm(bm) {
  const candidates = [];
  const t5k = parseHhMmToSeconds(bm.run_5k);
  if (t5k != null) candidates.push(t5k / 5);
  const t10k = parseHhMmToSeconds(bm.run_10k);
  if (t10k != null) candidates.push(t10k / 10);
  const tHalf = parseHhMmToSeconds(bm.run_half);
  if (tHalf != null) candidates.push(tHalf / 21.0975);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}
function hasAnyFilled(bm, keys) {
  return keys.some((k) => String(bm[k] || "").trim().length > 0);
}
function relevantStrengthKeys(equipment) {
  const eq = new Set(equipment);
  const keys = [];
  const hasBar = eq.has("barbell") || eq.has("commercial_gym") || eq.has("full_home_gym") || eq.has("squat_rack");
  const hasDb = eq.has("dumbbells") || eq.has("commercial_gym") || eq.has("full_home_gym");
  const hasKb = eq.has("kettlebells") || eq.has("commercial_gym") || eq.has("full_home_gym");
  const hasBw = eq.has("bodyweight") || eq.has("pull_up_bar") || eq.has("dip_station");
  if (hasBar) keys.push(...STRENGTH_BAR_KEYS);
  if (hasDb) keys.push(...STRENGTH_DB_KEYS);
  if (hasKb) keys.push(...STRENGTH_KB_KEYS);
  if (hasBw) keys.push(...STRENGTH_BW_KEYS);
  if (!keys.length) keys.push(...STRENGTH_BAR_KEYS, ...STRENGTH_BW_KEYS);
  return [...new Set(keys)];
}
function buildCoachBenchmarkProfile(args) {
  const bmRaw = args.benchmarks || {};
  const filled = {};
  for (const [k, v] of Object.entries(bmRaw)) {
    const t2 = String(v || "").trim();
    if (t2) filled[k] = t2;
  }
  const trainingStyle = String(args.trainingStyle || "hybrid");
  const needsRun = trainingStyle === "endurance" || trainingStyle === "hybrid";
  const needsStrength = trainingStyle === "strength" || trainingStyle === "hybrid";
  const equipment = args.equipment || [];
  const hasRunBenchmarks = needsRun ? hasAnyFilled(filled, RUN_KEYS) : false;
  const strengthKeys = relevantStrengthKeys(equipment);
  const hasStrengthBenchmarks = needsStrength ? hasAnyFilled(filled, strengthKeys) : false;
  const weekNumber = args.weekNumber ?? 1;
  const cardioDiscoveryWeek = weekNumber === 1 && needsRun && !hasRunBenchmarks;
  const strengthDiscoveryWeek = weekNumber === 1 && needsStrength && !hasStrengthBenchmarks;
  return {
    filled,
    hasRunBenchmarks,
    hasStrengthBenchmarks,
    runBestPaceSecPerKm: deriveRunBestPaceSecPerKm(filled),
    runLongestKm: parseDecimal(filled.run_longest),
    strengthDiscoveryWeek,
    cardioDiscoveryWeek
  };
}
var BM_LABELS_DE = {
  squat_1rm: "Kniebeuge 1RM",
  bench_1rm: "Bankdr\xFCcken 1RM",
  deadlift_1rm: "Kreuzheben 1RM",
  ohp_1rm: "Schulterdr\xFCcken 1RM",
  pullups_max: "Klimmz\xFCge max",
  pushups_max: "Liegest\xFCtze max",
  db_bench: "KH Bankdr\xFCcken",
  db_row: "KH Rudern",
  kb_swing: "KB Swing",
  tgu: "Turkish Get-Up",
  run_5k: "5 km",
  run_10k: "10 km",
  run_half: "Halbmarathon",
  run_longest: "L\xE4ngster Lauf",
  run_weekly_km: "Wochen-km"
};
var BM_LABELS_EN = {
  squat_1rm: "Back squat 1RM",
  bench_1rm: "Bench press 1RM",
  deadlift_1rm: "Deadlift 1RM",
  ohp_1rm: "Overhead press 1RM",
  pullups_max: "Pull-ups max",
  pushups_max: "Push-ups max",
  db_bench: "DB bench",
  db_row: "DB row",
  kb_swing: "KB swing",
  tgu: "Turkish get-up",
  run_5k: "5 km",
  run_10k: "10 km",
  run_half: "Half marathon",
  run_longest: "Longest run",
  run_weekly_km: "Weekly km"
};
function formatBenchmarksForCoachPrompt(args) {
  const profile = buildCoachBenchmarkProfile({
    benchmarks: args.benchmarks,
    equipment: args.equipment,
    trainingStyle: args.trainingStyle,
    weekNumber: args.weekNumber
  });
  const labels = args.locale === "en" ? BM_LABELS_EN : BM_LABELS_DE;
  const lines = [];
  const level = String(args.fitnessLevel || "intermediate");
  if (Object.keys(profile.filled).length) {
    lines.push("Recorded benchmarks (MUST use for load/pace prescription when present):");
    for (const [k, v] of Object.entries(profile.filled)) {
      lines.push(`- ${labels[k] || k}: ${v}`);
    }
    if (profile.runBestPaceSecPerKm != null) {
      const mm = Math.floor(profile.runBestPaceSecPerKm / 60);
      const ss = Math.round(profile.runBestPaceSecPerKm % 60);
      lines.push(
        `- Derived best pace baseline: ${mm}:${String(ss).padStart(2, "0")}/km (Zone 2 must be clearly slower)`
      );
    }
    lines.push(
      `- Athlete self-reported level: ${level} \u2014 respect this for exercise complexity, but loads must follow benchmarks above (not generic beginner loads).`
    );
  } else {
    lines.push("No benchmarks recorded.");
  }
  if (profile.strengthDiscoveryWeek) {
    lines.push(
      "STRENGTH WEEK-1 DISCOVERY: No strength benchmarks \u2014 use submaximal RPE 6\u20137 sets, estimated loads as % bodyweight or \u201CRPE 7\u20138 guess\u201D, and clear logging instructions. No heavy singles, no aggressive %1RM prescriptions."
    );
  }
  if (profile.cardioDiscoveryWeek) {
    lines.push(
      "CARDIO WEEK-1 DISCOVERY: No run benchmarks \u2014 use conversational easy runs (20\u201340 min), optional short strides only if athlete feels good. NO fixed race paces; athlete records time, distance, and average HR/RPE for next week calibration."
    );
  }
  return lines.join("\n");
}

// src/lib/coachEquipment.ts
var COACH_EQUIPMENT_CATALOG = [
  { id: "bodyweight", category: "calisthenics" },
  { id: "pull_up_bar", category: "calisthenics" },
  { id: "dip_station", category: "calisthenics" },
  { id: "resistance_bands", category: "calisthenics" },
  { id: "suspension_trainer", category: "calisthenics" },
  { id: "parallettes", category: "calisthenics" },
  { id: "gymnastic_rings", category: "calisthenics" },
  { id: "dumbbells", category: "free_weights" },
  { id: "barbell", category: "free_weights" },
  { id: "kettlebells", category: "free_weights" },
  { id: "ez_bar", category: "free_weights" },
  { id: "bench", category: "free_weights" },
  { id: "squat_rack", category: "free_weights" },
  { id: "cable_machine", category: "machines" },
  { id: "smith_machine", category: "machines" },
  { id: "leg_press", category: "machines" },
  { id: "lat_pulldown", category: "machines" },
  { id: "chest_press_machine", category: "machines" },
  { id: "leg_extension", category: "machines" },
  { id: "leg_curl", category: "machines" },
  { id: "hip_abductor", category: "machines" },
  { id: "rowing_machine", category: "cardio" },
  { id: "treadmill", category: "cardio" },
  { id: "exercise_bike", category: "cardio" },
  { id: "elliptical", category: "cardio" },
  { id: "stair_climber", category: "cardio" },
  { id: "full_home_gym", category: "bundles" },
  { id: "commercial_gym", category: "bundles" }
];
var COACH_MACHINE_EQUIPMENT_IDS = COACH_EQUIPMENT_CATALOG.filter(
  (e) => e.category === "machines" || e.category === "cardio"
).map((e) => e.id);
var COACH_DEFAULT_EQUIPMENT = ["bodyweight"];
var FULL_HOME_GYM_IMPLIES = [
  "bodyweight",
  "pull_up_bar",
  "dip_station",
  "resistance_bands",
  "dumbbells",
  "barbell",
  "kettlebells",
  "bench",
  "squat_rack",
  "cable_machine",
  "smith_machine",
  "leg_press",
  "lat_pulldown"
];
var COMMERCIAL_GYM_IMPLIES = COACH_EQUIPMENT_CATALOG.map((e) => e.id);
var LEGACY_EQUIPMENT_ALIASES = {
  bands: "resistance_bands",
  pullup_bar: "pull_up_bar"
};
function normalizeCoachEquipmentSelection(selected) {
  const out = /* @__PURE__ */ new Set();
  for (const raw of selected || []) {
    const id = LEGACY_EQUIPMENT_ALIASES[raw] || raw;
    if (COACH_EQUIPMENT_CATALOG.some((e) => e.id === id)) out.add(id);
  }
  if (!out.size) COACH_DEFAULT_EQUIPMENT.forEach((id) => out.add(id));
  return [...out];
}
function effectiveCoachEquipmentIds(selected) {
  const base = normalizeCoachEquipmentSelection(selected);
  const out = new Set(base);
  if (out.has("commercial_gym")) {
    COMMERCIAL_GYM_IMPLIES.forEach((id) => out.add(id));
  }
  if (out.has("full_home_gym")) {
    FULL_HOME_GYM_IMPLIES.forEach((id) => out.add(id));
  }
  return out;
}
var EQUIPMENT_RULES = [
  {
    id: "pull_up_bar",
    pattern: /pull[-\s]?up|chin[-\s]?up|klimmzug|muscle[-\s]?up/i,
    requiresAny: ["pull_up_bar", "suspension_trainer", "gymnastic_rings", "full_home_gym", "commercial_gym"]
  },
  {
    id: "dip_station",
    pattern: /\bdip\b|dips|barren|parallel bar/i,
    requiresAny: ["dip_station", "parallettes", "full_home_gym", "commercial_gym"]
  },
  {
    id: "barbell",
    pattern: /barbell|langhantel|olympic|back squat|front squat|deadlift(?!.*dumbbell)/i,
    requiresAny: ["barbell", "smith_machine", "full_home_gym", "commercial_gym"]
  },
  {
    id: "dumbbells",
    pattern: /dumbbell|kurzhantel|db\s/i,
    requiresAny: ["dumbbells", "full_home_gym", "commercial_gym"]
  },
  {
    id: "kettlebells",
    pattern: /kettlebell|kettle bell/i,
    requiresAny: ["kettlebells", "full_home_gym", "commercial_gym"]
  },
  {
    id: "cable_machine",
    pattern: /cable|seilzug|crossover|face pull|tricep pushdown|lat pulldown/i,
    requiresAny: ["cable_machine", "lat_pulldown", "full_home_gym", "commercial_gym"]
  },
  {
    id: "leg_press",
    pattern: /leg press|beinpresse|hack squat machine/i,
    requiresAny: ["leg_press", "smith_machine", "commercial_gym", "full_home_gym"]
  },
  {
    id: "smith_machine",
    pattern: /smith machine|multipress/i,
    requiresAny: ["smith_machine", "commercial_gym", "full_home_gym"]
  },
  {
    id: "bench",
    pattern: /bench press|bankdrück|incline press.*bar/i,
    requiresAny: ["bench", "barbell", "dumbbells", "chest_press_machine", "full_home_gym", "commercial_gym"]
  },
  {
    id: "rowing_machine",
    pattern: /rowing machine|ergometer|concept2|rudermaschine/i,
    requiresAny: ["rowing_machine", "commercial_gym", "full_home_gym"]
  },
  {
    id: "treadmill",
    pattern: /treadmill|laufband/i,
    requiresAny: ["treadmill", "commercial_gym"]
  }
];
function exerciseBlockedByEquipment(exerciseName, exerciseKey, available) {
  const hay = `${exerciseName || ""} ${exerciseKey || ""}`;
  for (const rule of EQUIPMENT_RULES) {
    if (!rule.pattern.test(hay)) continue;
    const ok = rule.requiresAny.some((req) => available.has(req));
    if (!ok) return rule.id;
  }
  return null;
}
function formatCoachEquipmentForPrompt(selected) {
  const ids = normalizeCoachEquipmentSelection(selected);
  const effective = effectiveCoachEquipmentIds(ids);
  const labels = [...effective].sort();
  return `${labels.join(", ")} (ONLY prescribe exercises possible with this equipment; never require gear the athlete did not select)`;
}

// src/lib/coachExerciseSubstitute.ts
var SUBSTITUTE_RULES = [
  {
    id: "barbell_squat",
    pattern: /back squat|front squat|barbell squat|langhantel.?kniebeuge/i,
    options: [
      { name: "Goblet Squat", notes: "Ersatz: Langhantel-Kniebeuge \u2192 Kurzhantel" },
      { name: "Bodyweight Squat", notes: "Ersatz: Kniebeuge ohne Langhantel" }
    ]
  },
  {
    id: "deadlift",
    pattern: /deadlift|kreuzheben(?!.*dumbbell|.*kurzhantel)/i,
    options: [
      { name: "Dumbbell Romanian Deadlift", notes: "Ersatz: Kreuzheben \u2192 Kurzhantel" },
      { name: "Hip Hinge Bodyweight", notes: "Ersatz: H\xFCftbeuge ohne Hantel" }
    ]
  },
  {
    id: "bench_press",
    pattern: /bench press|bankdrück/i,
    options: [
      { name: "Dumbbell Bench Press", notes: "Ersatz: Bankdr\xFCcken \u2192 Kurzhantel" },
      { name: "Push-Up", notes: "Ersatz: Bankdr\xFCcken \u2192 Liegest\xFCtz" }
    ]
  },
  {
    id: "barbell_row",
    pattern: /barbell row|langhantel.?rudern|bent.?over row/i,
    options: [
      { name: "Dumbbell Row", notes: "Ersatz: Langhantel-Rudern \u2192 Kurzhantel" },
      { name: "Inverted Row", notes: "Ersatz: Rudern als Bodyweight" }
    ]
  },
  {
    id: "ohp",
    pattern: /overhead press|military press|shoulder press|ohp/i,
    options: [
      { name: "Dumbbell Shoulder Press", notes: "Ersatz: Schulterdr\xFCcken \u2192 Kurzhantel" },
      { name: "Pike Push-Up", notes: "Ersatz: Schulterdr\xFCcken \u2192 Pike Push-Up" }
    ]
  },
  {
    id: "pull_up",
    pattern: /pull[-\s]?up|chin[-\s]?up|klimmzug/i,
    options: [
      { name: "Inverted Row", notes: "Ersatz: Klimmzug \u2192 Rudern unter Tisch/TRX" },
      { name: "Band-Assisted Pull-Up", notes: "Ersatz: Klimmzug mit Band" }
    ]
  },
  {
    id: "dip",
    pattern: /\bdips?\b|barren/i,
    options: [
      { name: "Bench Dip", notes: "Ersatz: Dip an Bank" },
      { name: "Close-Grip Push-Up", notes: "Ersatz: Dip \u2192 enger Liegest\xFCtz" }
    ]
  },
  {
    id: "leg_press",
    pattern: /leg press|beinpresse/i,
    options: [
      { name: "Goblet Squat", notes: "Ersatz: Beinpresse \u2192 Goblet Squat" },
      { name: "Walking Lunge", notes: "Ersatz: Beinpresse \u2192 Ausfallschritte" }
    ]
  },
  {
    id: "cable",
    pattern: /cable|seilzug|face pull|tricep pushdown|lat pulldown/i,
    options: [
      { name: "Band Pull-Apart", notes: "Ersatz: Cable \u2192 Band" },
      { name: "Dumbbell Fly", notes: "Ersatz: Cable-Bewegung \u2192 Kurzhantel" }
    ]
  },
  {
    id: "knee_squat_lunge",
    pattern: /squat|lunge|bulgarian|leg press|jump|box jump/i,
    options: [
      { name: "Glute Bridge", notes: "Knie-schonend: H\xFCftstreckung statt Kniebeuge" },
      { name: "Seated Leg Curl (machine or band)", notes: "Knie-schonend: Isolation hinten" },
      { name: "Step-Up low box", notes: "Knie-schonend: kontrollierter Step-Up" }
    ]
  },
  {
    id: "shoulder_overhead",
    pattern: /overhead|ohp|military press|shoulder press|push press|handstand|kettlebell snatch|kettlebell swing|dip\b/i,
    options: [
      { name: "Lateral Raise", notes: "Schulter-schonend: seitliches Heben" },
      { name: "Face Pull / Band Pull-Apart", notes: "Schulter-schonend: Au\xDFenrotation/Upper back" },
      { name: "Chest-Supported Row", notes: "Schulter-schonend: Rudern gest\xFCtzt" }
    ]
  },
  {
    id: "lower_back_hinge",
    pattern: /deadlift|good morning|back extension|roman.?ian|rdl|bent.?over.?row|superman/i,
    options: [
      { name: "Glute Bridge", notes: "R\xFCcken-schonend: H\xFCftstreckung liegend" },
      { name: "Chest-Supported Row", notes: "R\xFCcken-schonend: Rudern gest\xFCtzt" },
      { name: "Cable Pull-Through", notes: "R\xFCcken-schonend: Hip hinge leicht" }
    ]
  },
  {
    id: "wrist_load",
    pattern: /handstand|planche|wrist.?curl|front.?lever|push.?up|liegestütz|burpee/i,
    options: [
      { name: "Dumbbell Floor Press", notes: "Handgelenk-schonend: neutrale Griffe" },
      { name: "Band Chest Press", notes: "Handgelenk-schonend: Band-Druck" },
      { name: "Machine Chest Press", notes: "Handgelenk-schonend: gef\xFChrte Presse" }
    ]
  },
  {
    id: "ankle_impact",
    pattern: /jump|box jump|calf raise|running|sprint|plyo/i,
    options: [
      { name: "Bike / Assault Bike", notes: "Kn\xF6chel-schonend: Cardio ohne Impact" },
      { name: "Seated Leg Curl", notes: "Kn\xF6chel-schonend: Isolation" },
      { name: "Glute Bridge", notes: "Kn\xF6chel-schonend: H\xFCfte liegend" }
    ]
  },
  {
    id: "hip_deep",
    pattern: /deep.?squat|pistol|hip.?thrust|sumo|butterfly|pigeon/i,
    options: [
      { name: "Glute Bridge", notes: "H\xFCft-schonend: begrenzte Flexion" },
      { name: "Seated Leg Curl", notes: "H\xFCft-schonend: Isolation hinten" },
      { name: "Step-Up low box", notes: "H\xFCft-schonend: kontrollierter Step-Up" }
    ]
  },
  {
    id: "elbow_pull_push",
    pattern: /skull.?crusher|tricep.?extension|curl|chin.?up|pull.?up|klimmzug/i,
    options: [
      { name: "Face Pull / Band Pull-Apart", notes: "Ellenbogen-schonend: Band" },
      { name: "Machine Row", notes: "Ellenbogen-schonend: gef\xFChrtes Rudern" },
      { name: "Dumbbell Floor Press", notes: "Ellenbogen-schonend: begrenzte ROM" }
    ]
  }
];
function getEquipmentSubstituteOptions(name, exerciseKey) {
  const hay = `${name} ${exerciseKey}`;
  for (const rule of SUBSTITUTE_RULES) {
    if (/^(knee|shoulder|lower_back|wrist|ankle|hip|elbow)_/.test(rule.id)) {
      continue;
    }
    if (!rule.pattern.test(hay)) continue;
    return rule.options;
  }
  return [];
}
function findInjurySubstitute(name, exerciseKey, kind) {
  const hay = `${name} ${exerciseKey}`;
  const prefix = `${kind}_`;
  for (const rule of SUBSTITUTE_RULES) {
    if (!rule.id.startsWith(prefix)) continue;
    if (!rule.pattern.test(hay)) continue;
    return rule.options[0] ?? null;
  }
  return null;
}

// src/lib/coachInjuries.ts
var COACH_INJURY_IDS = [
  "knee",
  "shoulder",
  "lower_back",
  "wrist",
  "ankle",
  "hip",
  "elbow"
];
var TOKEN_RE = /\[(knee|shoulder|lower_back|wrist|ankle|hip|elbow)\]/gi;
var KEYWORD_MAP = {
  knee: /\b(knie|knee|patella|acl|menisk)\b/i,
  shoulder: /\b(schulter|shoulder|rotator|impingement)\b/i,
  lower_back: /\b(unterer?\s*rücken|lower\s*back|lumbal|bandscheibe|disc)\b/i,
  wrist: /\b(handgelenk|wrist)\b/i,
  ankle: /\b(knöchel|ankle|sprunggelenk)\b/i,
  hip: /\b(hüfte|hip|impingement\s*hüfte)\b/i,
  elbow: /\b(ellenbogen|elbow|tennisarm|golfarm)\b/i
};
function parseInjuryIds(plain) {
  const s = String(plain || "");
  const found = /* @__PURE__ */ new Set();
  for (const m of s.matchAll(TOKEN_RE)) {
    found.add(m[1].toLowerCase());
  }
  for (const id of COACH_INJURY_IDS) {
    if (KEYWORD_MAP[id].test(s)) found.add(id);
  }
  return COACH_INJURY_IDS.filter((id) => found.has(id));
}
function injuryActive(plain, id) {
  return parseInjuryIds(plain).includes(id);
}
var INJURY_BLOCKED_PATTERNS = {
  knee: /squat|lunge|bulgarian|step.?up|leg.?press|jump|box jump|pistol/i,
  shoulder: /overhead|ohp|military press|shoulder press|push press|handstand|kettlebell snatch|kettlebell swing|dip\b/i,
  lower_back: /deadlift|good morning|back extension|roman.?ian|rdl|bent.?over.?row|superman/i,
  wrist: /handstand|planche|wrist.?curl|front.?lever|push.?up|liegestütz|burpee/i,
  ankle: /jump|box jump|calf raise|running|sprint|plyo/i,
  hip: /deep.?squat|pistol|hip.?thrust|sumo|butterfly|pigeon/i,
  elbow: /skull.?crusher|tricep.?extension|curl|chin.?up|pull.?up|klimmzug/i
};

// src/lib/fitnessInsights.ts
import { format as format2, subDays, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval } from "date-fns";

// src/lib/nutritionTotals.ts
function sumIngredients(ings) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const i of ings) {
    calories += Number(i.calories) || 0;
    protein += Number(i.protein) || 0;
    carbs += Number(i.carbs) || 0;
    fat += Number(i.fat) || 0;
  }
  return { calories, protein, carbs, fat };
}
function effectiveNutritionTotals(e) {
  const headerCalories = Math.round(Number(e.calories) || 0);
  if (e.pipelineVersion === "nutrition-v3" && headerCalories > 0) {
    return {
      calories: headerCalories,
      protein: Math.round((Number(e.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(e.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(e.fat) || 0) * 10) / 10
    };
  }
  const ings = e.ingredients;
  if (Array.isArray(ings) && ings.length > 0) {
    const fromIngs = sumIngredients(ings);
    if (fromIngs.calories > 0) {
      return {
        calories: Math.round(fromIngs.calories),
        protein: Math.round(fromIngs.protein * 10) / 10,
        carbs: Math.round(fromIngs.carbs * 10) / 10,
        fat: Math.round(fromIngs.fat * 10) / 10
      };
    }
  }
  return {
    calories: headerCalories,
    protein: Math.round((Number(e.protein) || 0) * 10) / 10,
    carbs: Math.round((Number(e.carbs) || 0) * 10) / 10,
    fat: Math.round((Number(e.fat) || 0) * 10) / 10
  };
}

// src/lib/weightHistory.ts
import { format } from "date-fns";
function dayKey(date) {
  return date.split("T")[0];
}
function resolveWeightHistoryForProfile(profile) {
  if (!profile) return [];
  const merged = [
    ...profile.weightHistory ?? [],
    ...profile.measurements?.weightHistory ?? []
  ];
  const byDate = /* @__PURE__ */ new Map();
  for (const e of merged) {
    if (!e?.date || !Number.isFinite(e.value) || e.value <= 0) continue;
    byDate.set(dayKey(e.date), e.value);
  }
  if (byDate.size === 0) {
    const w = profile.measurements?.weight;
    if (w != null && Number.isFinite(w) && w > 0) {
      const d = profile.accountCreatedAt ? dayKey(profile.accountCreatedAt) : format(/* @__PURE__ */ new Date(), "yyyy-MM-dd");
      byDate.set(d, w);
    }
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

// src/lib/workoutSessionUtils.ts
function isSetDetailArray(sets) {
  return Array.isArray(sets) && sets.length > 0 && typeof sets[0] === "object" && sets[0] != null && "reps" in sets[0];
}
function isBlockMetaExercise(ex) {
  return !!ex?.blockFormat && ex.blockFormat !== "normal";
}
function isCardioExercise(ex) {
  return ex.exerciseCategory === "cardio";
}
function sanitizeExercisesForSave(exercises) {
  const out = [];
  for (const ex of exercises) {
    if (!isSetDetailArray(ex.sets)) continue;
    const completed = ex.sets.filter((s) => s.completed);
    if (completed.length === 0) continue;
    out.push({ ...ex, sets: completed.map((s) => ({ ...s, completed: true })) });
  }
  return out;
}

// src/lib/workoutSetStats.ts
function strengthSetsForStats(ex) {
  if (isBlockMetaExercise(ex) || isCardioExercise(ex)) return [];
  if (!isSetDetailArray(ex.sets)) return [];
  return ex.sets.filter((s) => s.completed !== false && s.type !== "warmup");
}
function strengthVolumeFromSets(sets) {
  return sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
}
function cardioSummaryFromExercise(ex) {
  if (!isCardioExercise(ex) || !isSetDetailArray(ex.sets)) return null;
  const done = ex.sets.filter((s2) => s2.completed !== false);
  if (done.length === 0) return null;
  const s = done[0];
  return {
    minutes: s.reps || 0,
    distanceKm: s.weight || 0
  };
}

// src/lib/fitnessInsights.ts
function normalizeExerciseName(name) {
  return name.trim().toLowerCase();
}
var KCAL_PER_KG_FAT_EQUIV = 7e3;
function computeWeeklyEnergyBalance(workouts, nutrition, weekStart, dailyTargetKcal) {
  const start = weekStart;
  const days = eachDayOfInterval({ start, end: addDaysSafe(start, 6) });
  const result = days.map((d) => {
    const ds = format2(d, "yyyy-MM-dd");
    const intake = nutrition.filter(
      (n) => (typeof n.date === "string" ? n.date.split("T")[0] : format2(new Date(n.date), "yyyy-MM-dd")) === ds
    ).reduce((s, n) => s + effectiveNutritionTotals(n).calories, 0);
    const burned = workouts.filter(
      (w) => (typeof w.date === "string" ? w.date.split("T")[0] : format2(new Date(w.date), "yyyy-MM-dd")) === ds
    ).reduce((s, w) => s + (w.caloriesBurned || 0), 0);
    return {
      label: format2(d, "EEE"),
      intake,
      burned,
      net: intake - burned,
      balanceVsTarget: intake - burned - dailyTargetKcal
    };
  });
  const totalIntake = result.reduce((s, d) => s + d.intake, 0);
  const totalBurned = result.reduce((s, d) => s + d.burned, 0);
  const targetWeek = dailyTargetKcal * 7;
  const weeklyNetKcal = totalIntake - totalBurned - targetWeek;
  const avgNet = weeklyNetKcal / 7;
  const projectedKgDelta = weeklyNetKcal / KCAL_PER_KG_FAT_EQUIV;
  const intakeLoggedDays = result.filter((d) => d.intake > 0).length;
  const estimateReliable = dailyTargetKcal > 0 && intakeLoggedDays >= 4 && totalIntake >= targetWeek * 0.45;
  return {
    days: result,
    totalIntake,
    totalBurned,
    avgNet,
    projectedKgDelta,
    weeklyNetKcal,
    intakeLoggedDays,
    estimateReliable
  };
}
function addDaysSafe(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function getWorkoutStreak(workouts) {
  if (!workouts.length) return 0;
  const days = /* @__PURE__ */ new Set();
  for (const w of workouts) {
    const ds = typeof w.date === "string" ? w.date.split("T")[0] : format2(new Date(w.date), "yyyy-MM-dd");
    days.add(ds);
  }
  let streak = 0;
  let d = startOfToday();
  while (days.has(format2(d, "yyyy-MM-dd"))) {
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}
function getNutritionStreak(entries) {
  if (!entries.length) return 0;
  const days = /* @__PURE__ */ new Set();
  for (const e of entries) {
    const ds = typeof e.date === "string" ? e.date.split("T")[0] : format2(new Date(e.date), "yyyy-MM-dd");
    days.add(ds);
  }
  let streak = 0;
  let d = startOfToday();
  while (days.has(format2(d, "yyyy-MM-dd"))) {
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}
function startOfToday() {
  const t2 = /* @__PURE__ */ new Date();
  t2.setHours(0, 0, 0, 0);
  return t2;
}

// src/lib/progressiveOverload.ts
function lastWorkingSet(ex) {
  const sets = strengthSetsForStats(ex);
  return sets.length ? sets[sets.length - 1] : null;
}
function findLastExerciseLog(workouts, exerciseName, excludeWorkoutId) {
  const key = normalizeExerciseName(exerciseName);
  const sorted = [...workouts].filter((w) => w.id !== excludeWorkoutId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if (normalizeExerciseName(ex.name) !== key) continue;
      const last = lastWorkingSet(ex);
      if (last) return ex;
    }
  }
  return null;
}
function isDeloadWeek(workouts, refDate = /* @__PURE__ */ new Date()) {
  const weekMs = 7 * 24 * 60 * 60 * 1e3;
  const twoWeekMs = 14 * 24 * 60 * 60 * 1e3;
  const ref = refDate.getTime();
  let rpeSum = 0;
  let rpeCount = 0;
  let sessions7 = 0;
  for (const w of workouts) {
    const t2 = new Date(w.date).getTime();
    if (ref - t2 > twoWeekMs) continue;
    if (ref - t2 <= weekMs) sessions7 += 1;
    for (const ex of w.exercises || []) {
      const sets = strengthSetsForStats(ex);
      for (const s of sets) {
        if (s.rpe != null && s.rpe > 0) {
          rpeSum += s.rpe;
          rpeCount += 1;
        }
      }
    }
  }
  if (sessions7 >= 4 && rpeCount >= 8) {
    const avg = rpeSum / rpeCount;
    if (avg >= 8.5) return true;
  }
  return sessions7 >= 5;
}
function suggestSetForExercise(workouts, exerciseName, setIndex, excludeWorkoutId) {
  const prevEx = findLastExerciseLog(workouts, exerciseName, excludeWorkoutId);
  if (!prevEx || !Array.isArray(prevEx.sets)) return null;
  const working = strengthSetsForStats(prevEx);
  if (!working.length) return null;
  const ref = working[Math.min(setIndex, working.length - 1)];
  const deload = isDeloadWeek(workouts);
  if (deload) {
    return {
      weightKg: Math.round(ref.weight * 0.9 * 2) / 2,
      reps: ref.reps,
      reasonKey: "progressive.overload.deload"
    };
  }
  const avgRpe = working.filter((s) => s.rpe).reduce((a, s) => a + (s.rpe || 0), 0) / Math.max(1, working.filter((s) => s.rpe).length);
  if (avgRpe > 0 && avgRpe <= 7) {
    const bump = ref.reps >= 10 ? 0 : ref.weight < 20 ? 2.5 : 5;
    return {
      weightKg: Math.round((ref.weight + bump) * 2) / 2,
      reps: ref.reps,
      reasonKey: "progressive.overload.up"
    };
  }
  return {
    weightKg: ref.weight,
    reps: ref.reps,
    reasonKey: "progressive.overload.same"
  };
}

// src/lib/coachWeekPostprocess.ts
function parseSetsCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  return Math.max(1, parseInt(m[1], 10));
}
function parseWeightKg(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || /bw|körpergewicht|bodyweight|rpe|%/.test(s)) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*kg/);
  if (m) return Number(m[1].replace(",", "."));
  const plain = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (plain) return Number(plain[1].replace(",", "."));
  return null;
}
function parseOneRmPercent(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{1,3})\s*%\s*(?:1\s*)?rm/i);
  if (!m) return null;
  const pct = Number(m[1]);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : null;
}
function applyCoachVolumeMultiplier(week, volumeMultiplier) {
  const mult = Math.max(0.5, Math.min(1.25, Number(volumeMultiplier) || 1));
  if (Math.abs(mult - 1) < 0.02) return week;
  let touched = 0;
  const schedule = week.schedule.map((day) => {
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    const exercises = day.exercises.map((ex) => {
      const row = { ...ex };
      const sets = parseSetsCount(row.sets);
      if (sets == null) return row;
      const next = Math.max(1, Math.round(sets * mult));
      if (next !== sets) {
        row.sets = next;
        touched += 1;
      }
      return row;
    });
    return { ...day, exercises };
  });
  const ac = [...week.applied_constraints || []];
  if (touched) ac.push(`repaired:volume_multiplier=${mult}x_sets=${touched}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}
function applyCoachWeekLoadProgression(week, workouts, opts) {
  if (!workouts.length) return week;
  const deloadish = (opts?.volumeMultiplier ?? 1) < 0.75;
  let applied2 = 0;
  const schedule = week.schedule.map((day) => {
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    const exercises = day.exercises.map((ex) => {
      const row = { ...ex };
      const name = String(row.name || "").trim();
      if (!name) return row;
      const pct = parseOneRmPercent(row.weight) ?? parseOneRmPercent(row.notes);
      const suggestion = suggestSetForExercise(workouts, name, 0);
      if (!suggestion && pct == null) return row;
      let kg = suggestion?.weightKg ?? null;
      if (pct != null && suggestion) {
        const e1 = suggestion.weightKg * (1 + suggestion.reps / 30);
        kg = Math.round(e1 * pct * 2) / 2;
      } else if (deloadish && kg != null) {
        kg = Math.round(kg * 0.9 * 2) / 2;
      }
      if (kg == null || !(kg > 0)) return row;
      const existing = parseWeightKg(row.weight);
      if (existing == null || pct != null || Math.abs(existing - kg) / Math.max(kg, 1) > 0.35) {
        row.weight = `${kg} kg`;
        if (!row.reps && suggestion?.reps) row.reps = String(suggestion.reps);
        applied2 += 1;
      }
      return row;
    });
    return { ...day, exercises };
  });
  const ac = [...week.applied_constraints || []];
  if (applied2) ac.push(`repaired:load_progression_applied=${applied2}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}
function annotatePriorExerciseContinuity(week, priorKeys) {
  const keys = [...new Set(priorKeys.map((k) => k.trim()).filter(Boolean))].slice(0, 24);
  if (!keys.length) return week;
  const present = /* @__PURE__ */ new Set();
  for (const day of week.schedule) {
    if (!Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      const k = typeof ex.exerciseKey === "string" ? ex.exerciseKey.trim() : "";
      if (k) present.add(k);
    }
  }
  const kept = keys.filter((k) => present.has(k)).length;
  const ac = [...week.applied_constraints || []];
  ac.push(`continuity:prior_keys=${keys.length},kept=${kept}`);
  return { ...week, applied_constraints: ac.slice(0, 8) };
}
function repairEquipmentAndInjuryWithSubstitutes(week, input) {
  const equipment = effectiveCoachEquipmentIds(input.equipmentIds);
  const inj = String(input.injuriesPlain || "");
  const activeInjuries = COACH_INJURY_IDS.filter((id) => injuryActive(inj, id));
  let substituted = 0;
  let stripped = 0;
  const schedule = week.schedule.map((day) => {
    if (day.isRest === true || !Array.isArray(day.exercises) || !day.exercises.length) return day;
    const nextEx = [];
    for (const row of day.exercises) {
      const r = { ...row };
      const key = typeof r.exerciseKey === "string" ? r.exerciseKey : "";
      const name = String(r.name || "");
      const blocked = exerciseBlockedByEquipment(name, key, equipment);
      if (blocked) {
        let replaced = false;
        for (const opt of getEquipmentSubstituteOptions(name, key)) {
          if (!exerciseBlockedByEquipment(opt.name, opt.exerciseKey || "", equipment)) {
            r.name = opt.name;
            if (opt.exerciseKey) r.exerciseKey = opt.exerciseKey;
            else delete r.exerciseKey;
            r.notes = [String(r.notes || "").trim(), opt.notes || ""].filter(Boolean).join(" \xB7 ");
            substituted += 1;
            nextEx.push(r);
            replaced = true;
            break;
          }
        }
        if (replaced) continue;
        stripped += 1;
        continue;
      }
      const hay = `${name} ${key}`;
      for (const injuryId of activeInjuries) {
        if (!INJURY_BLOCKED_PATTERNS[injuryId].test(hay)) continue;
        const sub = findInjurySubstitute(name, key, injuryId);
        if (!sub) continue;
        r.name = sub.name;
        delete r.exerciseKey;
        r.notes = [String(r.notes || "").trim(), sub.notes || ""].filter(Boolean).join(" \xB7 ");
        substituted += 1;
        break;
      }
      nextEx.push(r);
    }
    return { ...day, exercises: nextEx };
  });
  const ac = [...week.applied_constraints || []];
  if (substituted) ac.push(`repaired:substituted_exercises=${substituted}`);
  if (stripped) ac.push(`repaired:stripped_equipment_mismatch=${stripped}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}
function normalizeCardioSportRails(week, sports) {
  const sportSet = new Set(sports.map((s) => s.toLowerCase()));
  const preferBike = [...sportSet].some((s) => /bike|rad|cycling|ftp/.test(s));
  const preferSwim = [...sportSet].some((s) => /swim|schwimmen/.test(s));
  const preferRow = [...sportSet].some((s) => /row|rudern/.test(s));
  if (!preferBike && !preferSwim && !preferRow) return week;
  let touched = 0;
  const schedule = week.schedule.map((day) => {
    const st = String(day.sessionType || "").toLowerCase();
    if (day.isRest || !st.includes("cardio") && !st.includes("interval")) return day;
    const cardio = day.cardio && typeof day.cardio === "object" ? { ...day.cardio } : {};
    const modality = String(cardio.modality || cardio.sport || cardio.type || "run").toLowerCase();
    if (/run|lauf|jog/.test(modality) || !modality || modality === "cardio") {
      if (preferBike) {
        cardio.modality = "bike";
        if (!cardio.prescription) cardio.prescription = "Steady / FTP-based; log power or RPE";
        touched += 1;
      } else if (preferSwim) {
        cardio.modality = "swim";
        if (!cardio.prescription) cardio.prescription = "Pool intervals; log distance/time/RPE";
        touched += 1;
      } else if (preferRow) {
        cardio.modality = "row";
        if (!cardio.prescription) cardio.prescription = "Erg intervals; log split/RPE";
        touched += 1;
      }
    }
    if (!cardio.intervals && typeof cardio.details === "string" && /interval|wiederhol|x\s*\d/i.test(cardio.details)) {
      cardio.intervals = {
        note: String(cardio.details).slice(0, 200),
        structure: "see_notes"
      };
      touched += 1;
    }
    return { ...day, cardio };
  });
  const ac = [...week.applied_constraints || []];
  if (touched) ac.push(`repaired:cardio_sport_rails=${touched}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}
function muscleBucketFromName(name, key) {
  const hay = `${name} ${key}`.toLowerCase();
  if (/squat|lunge|leg press|bein|quad|glute|hamstring|deadlift|kreuzheb|hip thrust|calf|wade/.test(hay)) {
    return "legs";
  }
  if (/row|rudern|pull|klimmzug|lat|chin|face pull|rear delt/.test(hay)) return "pull";
  if (/bench|press|brust|chest|push.?up|liegestütz|overhead|shoulder|schulter|dip|tricep|trizeps/.test(hay)) {
    return "push";
  }
  if (/plank|crunch|sit.?up|core|ab |abs|oblique|bauch|dead bug|pallof/.test(hay)) return "core";
  return "other";
}
function annotateMuscleGroupBalance(week) {
  const counts = {
    push: 0,
    pull: 0,
    legs: 0,
    core: 0,
    other: 0
  };
  let setTypeNormalized = 0;
  let dropOrFailureTagged = 0;
  const schedule = week.schedule.map((day) => {
    const st = String(day.sessionType || "").toLowerCase();
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    if (!st.includes("strength") && !st.includes("technique") && !st.includes("cross")) return day;
    const exercises = day.exercises.map((ex, idx) => {
      const r = { ...ex };
      const name = String(r.name || "");
      const key = typeof r.exerciseKey === "string" ? r.exerciseKey : "";
      const bucket = muscleBucketFromName(name, key);
      counts[bucket] += 1;
      const rawType = r.setType;
      if (rawType != null && String(rawType).trim()) {
        const norm3 = String(rawType).trim().toLowerCase().replace(/[_\s]+/g, "-");
        const mapped = norm3 === "drop-set" || norm3 === "dropset" ? "dropset" : norm3 === "warm-up" || norm3 === "warmup" ? "warmup" : norm3 === "failure" ? "failure" : norm3 === "normal" ? "normal" : null;
        if (mapped && mapped !== rawType) {
          r.setType = mapped;
          setTypeNormalized += 1;
        }
        if (mapped === "dropset" || mapped === "failure") dropOrFailureTagged += 1;
      } else if (idx === day.exercises.length - 1 && day.exercises.length >= 3) {
        r.setType = "dropset";
        dropOrFailureTagged += 1;
        setTypeNormalized += 1;
      } else if (!r.setType) {
        r.setType = "normal";
      }
      return r;
    });
    return { ...day, exercises };
  });
  const ac = [...week.applied_constraints || []];
  if (setTypeNormalized) ac.push(`repaired:setType_normalized=${setTypeNormalized}`);
  if (dropOrFailureTagged) ac.push(`setType:drop_or_failure=${dropOrFailureTagged}`);
  const main = counts.push + counts.pull + counts.legs + counts.core;
  if (main >= 6) {
    const missing = [];
    if (counts.push === 0) missing.push("push");
    if (counts.pull === 0) missing.push("pull");
    if (counts.legs === 0) missing.push("legs");
    if (counts.core === 0) missing.push("core");
    if (missing.length) {
      ac.push(`warn:muscle_balance_missing=${missing.join("+")}`);
    } else {
      ac.push(
        `muscle_balance:push=${counts.push},pull=${counts.pull},legs=${counts.legs},core=${counts.core}`
      );
    }
  }
  return {
    ...week,
    schedule,
    applied_constraints: ac.slice(0, 8)
  };
}

// src/lib/coachConstraints.ts
function isAllowedExerciseKey(key) {
  if (!key) return false;
  return isExerciseDbCatalogKey(key);
}
function normalizeDayName(raw) {
  return normalizeCoachDayName(raw);
}
function parseDecimal2(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parsePaceSecPerKm(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const mmss = s.match(/(\d{1,2}):(\d{2})\s*(?:\/\s*km|km|min\/km)?/);
  if (mmss) {
    const mm = Number(mmss[1]);
    const ss = Number(mmss[2]);
    if (Number.isFinite(mm) && Number.isFinite(ss) && ss >= 0 && ss < 60) return mm * 60 + ss;
  }
  const decimal = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:min\/km|\/km|km)/);
  if (decimal) {
    const v = Number(decimal[1].replace(",", "."));
    if (Number.isFinite(v) && v > 0) return Math.round(v * 60);
  }
  return null;
}
function sessionTypeMatchesHint(row, hint) {
  const st = String(row.sessionType || "").toLowerCase();
  if (hint === "cardio") return st.includes("cardio") || st.includes("interval");
  return st.includes("strength") || st.includes("technique") || st.includes("cross");
}
function baseConstraintFields(ob, opts) {
  const bmRecord = ob.benchmarks && typeof ob.benchmarks === "object" ? ob.benchmarks : {};
  const profile = buildCoachBenchmarkProfile({
    benchmarks: bmRecord,
    equipment: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? ob.equipment : void 0
    ),
    trainingStyle: String(ob.trainingStyle || "hybrid"),
    sports: Array.isArray(ob.sports) ? ob.sports : [],
    weekNumber: opts?.weekNumber ?? 1
  });
  return {
    bodyWeightKg: parseDecimal2(ob.weight_kg ?? ob.weightKg ?? ob.weight) ?? void 0,
    fitnessLevel: String(ob.fitnessLevel || "intermediate"),
    weekNumber: opts?.weekNumber ?? 1,
    equipmentIds: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? ob.equipment : void 0
    ),
    runBestPaceSecPerKm: profile.runBestPaceSecPerKm ?? void 0,
    runLongestKm: profile.runLongestKm ?? void 0,
    hasRunBenchmarks: profile.hasRunBenchmarks,
    hasStrengthBenchmarks: profile.hasStrengthBenchmarks,
    cardioDiscoveryWeek: profile.cardioDiscoveryWeek,
    strengthDiscoveryWeek: profile.strengthDiscoveryWeek
  };
}
function workoutConstraintsFromOnboarding(ob, opts) {
  const base = baseConstraintFields(ob, opts);
  const assignments = buildVolumeAssignmentsFromOnboarding(ob, opts);
  if (assignments?.length) {
    const strengthExpected = assignments.filter((a) => a.sessionTypeHint === "strength").length;
    const cardioExpected = assignments.filter((a) => a.sessionTypeHint === "cardio").length;
    const workoutDays = [...new Set(assignments.map((a) => a.day))];
    const avail2 = filterAvailableDaysFromStart(
      Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : workoutDays,
      opts?.partialWeekStartDay
    );
    return {
      ...base,
      availableTrainingDays: avail2.length ? avail2 : workoutDays,
      allowDoubleSessions: ob.scheduleMode === "custom" ? true : ob.allowDoubleSessions !== false,
      injuriesPlain: String(ob.injuries || ""),
      targetSessionsPerWeek: assignments.length,
      sessionAssignments: assignments,
      expectedStrengthSessions: strengthExpected > 0 ? strengthExpected : void 0,
      expectedCardioSessions: cardioExpected > 0 ? cardioExpected : void 0,
      partialWeekStartDay: opts?.partialWeekStartDay
    };
  }
  const vol = parseCoachSessionVolume(ob);
  const total = totalWeeklySessions(vol);
  const coachDecidesDays = isCoachDecidesTrainingDays(ob);
  const avail = filterAvailableDaysFromStart(
    Array.isArray(ob.availableTrainingDays) ? ob.availableTrainingDays : [],
    opts?.partialWeekStartDay
  );
  return {
    ...base,
    availableTrainingDays: avail,
    allowDoubleSessions: ob.allowDoubleSessions !== false,
    injuriesPlain: String(ob.injuries || ""),
    targetSessionsPerWeek: coachDecidesDays || total == null || total <= 0 ? void 0 : total,
    partialWeekStartDay: opts?.partialWeekStartDay
  };
}
var HEAVY_PERCENT_1RM = /\d+\s*%\s*(?:of\s*)?1\s*rm|@\s*\d+\s*%\s*1\s*rm/i;
function minMainExercisesForDuration(min) {
  const range = strengthExerciseRangeForDuration(min);
  const m = range.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 4;
}
function expectedDurationForRow(d, assignments) {
  const dayName = normalizeDayName(String(d.day || ""));
  const slot = String(d.sessionSlot || "Morning");
  const match = assignments?.find(
    (a) => normalizeDayName(a.day) === dayName && (a.sessionSlot || "Morning") === slot
  );
  if (match?.durationMin != null && match.durationMin > 0) return match.durationMin;
  const est = typeof d.estimatedDuration === "number" ? d.estimatedDuration : null;
  return est != null && est > 0 ? est : null;
}
function slotPlanForInput(input) {
  const target = input.targetSessionsPerWeek;
  if (target == null || target <= 0) return null;
  if (input.sessionAssignments?.length) {
    const days = [...new Set(input.sessionAssignments.map((a) => a.day))];
    const doubleDays = days.filter(
      (d) => input.sessionAssignments.filter((a) => a.day === d).length >= 2
    );
    return {
      workoutDays: days,
      doubleSessionDays: doubleDays,
      targetSessions: input.sessionAssignments.length,
      availableDayCount: input.availableTrainingDays.length || days.length
    };
  }
  return computeTrainingSlotPlan(
    input.availableTrainingDays,
    target,
    input.allowDoubleSessions !== false
  );
}
function restDayRow(dayName, prev) {
  return {
    ...prev,
    day: dayName,
    isRest: true,
    sessionType: "Recovery",
    title: "Rest day",
    exercises: [],
    cardio: void 0
  };
}
function validateWorkoutConstraints(week, input) {
  const violations = [];
  const allowed = /* @__PURE__ */ new Set();
  if (Array.isArray(input.availableTrainingDays) && input.availableTrainingDays.length > 0) {
    for (const d of input.availableTrainingDays) {
      const n = normalizeDayName(d);
      if (n) allowed.add(n);
    }
  }
  const enforceDays = allowed.size > 0;
  const allowDoubles = input.allowDoubleSessions !== false;
  const inj = String(input.injuriesPlain || "");
  const equipment = effectiveCoachEquipmentIds(input.equipmentIds);
  const perDayCounts = /* @__PURE__ */ new Map();
  const startIdx = input.partialWeekStartDay ? indexCoachWeekday(normalizeDayName(input.partialWeekStartDay) || "") : -1;
  for (let i = 0; i < week.schedule.length; i++) {
    const d = week.schedule[i];
    const dayName = normalizeDayName(String(d.day || ""));
    if (!dayName) {
      violations.push({ code: "bad_day", message: `schedule[${i}].day invalid` });
      continue;
    }
    const rest = d.isRest === true;
    if (!rest && startIdx > 0) {
      const dayIdx = indexCoachWeekday(dayName);
      if (dayIdx >= 0 && dayIdx < startIdx) {
        violations.push({
          code: "partial_week_early_session",
          message: `schedule[${i}] session on ${dayName} but partial week starts ${input.partialWeekStartDay}`
        });
      }
    }
    if (!rest) {
      if (enforceDays && !allowed.has(dayName)) {
        violations.push({
          code: "day_not_allowed",
          message: `Non-rest session on ${dayName} but only ${[...allowed].join(", ")} allowed`
        });
      }
      perDayCounts.set(dayName, (perDayCounts.get(dayName) || 0) + 1);
    }
    const ex = Array.isArray(d.exercises) ? d.exercises : [];
    for (let j = 0; j < ex.length; j++) {
      const row = ex[j];
      const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
      if (key && !isAllowedExerciseKey(key)) {
        violations.push({
          code: "unknown_exercise_key",
          message: `schedule[${i}].exercises[${j}] unknown exerciseKey "${key}"`
        });
      }
      const nameBlob = `${row.name || ""} ${key || ""}`;
      for (const injuryId of COACH_INJURY_IDS) {
        if (!injuryActive(inj, injuryId)) continue;
        if (INJURY_BLOCKED_PATTERNS[injuryId].test(String(nameBlob))) {
          violations.push({
            code: `injury_${injuryId}`,
            message: `schedule[${i}] exercise likely conflicts with ${injuryId} limitation: ${nameBlob}`
          });
        }
      }
      const missingEquip = exerciseBlockedByEquipment(
        String(row.name || ""),
        key,
        equipment
      );
      if (missingEquip) {
        violations.push({
          code: "equipment_missing",
          message: `schedule[${i}].exercises[${j}] "${String(row.name || "")}" requires ${missingEquip} but athlete equipment is: ${[...equipment].join(", ")}`
        });
      }
      if (input.strengthDiscoveryWeek) {
        const weightStr = String(row.weight || "");
        if (HEAVY_PERCENT_1RM.test(weightStr)) {
          violations.push({
            code: "strength_discovery_no_1rm_percent",
            message: `schedule[${i}].exercises[${j}] uses %1RM without benchmarks in week-1 discovery`
          });
        }
      }
    }
    if (!rest && String(d.sessionType || "") === "Strength") {
      const expectedDur = expectedDurationForRow(d, input.sessionAssignments);
      if (expectedDur != null && expectedDur >= 45) {
        const minExBase = minMainExercisesForDuration(expectedDur);
        const minEx = input.weekNumber === 1 ? Math.max(2, Math.min(minExBase, 4)) : input.strengthDiscoveryWeek ? Math.max(3, Math.min(minExBase, 4)) : minExBase;
        if (ex.length < minEx) {
          violations.push({
            code: "strength_exercise_count_low",
            message: `schedule[${i}] Strength ${expectedDur}min needs at least ${minEx} main exercises, found ${ex.length}`
          });
        }
        const est = typeof d.estimatedDuration === "number" ? d.estimatedDuration : null;
        if (est != null && Math.abs(est - expectedDur) > 10) {
          violations.push({
            code: "duration_mismatch",
            message: `schedule[${i}] estimatedDuration=${est} but assignment requires ${expectedDur}min`
          });
        }
      }
    }
    if (!rest && (String(d.sessionType || "") === "Cardio" || String(d.sessionType || "") === "Intervals")) {
      const cardio = d.cardio && typeof d.cardio === "object" ? d.cardio : null;
      const zones = String(cardio?.zones || "").toLowerCase();
      const paceRaw = String(cardio?.pace || "");
      const paceSec = parsePaceSecPerKm(paceRaw);
      const distanceRaw = String(cardio?.distance || "").toLowerCase();
      const distMatch = distanceRaw.match(/(\d+(?:[.,]\d+)?)\s*km/);
      const distanceKm = distMatch ? Number(distMatch[1].replace(",", ".")) : null;
      if (zones.includes("zone 2") && paceSec != null && input.runBestPaceSecPerKm != null) {
        const weightPenaltySec = input.bodyWeightKg != null && input.bodyWeightKg > 95 ? Math.round((input.bodyWeightKg - 95) * 2) : 0;
        const minZone2Sec = Math.round(input.runBestPaceSecPerKm + 50 + weightPenaltySec);
        if (paceSec < minZone2Sec) {
          violations.push({
            code: "cardio_pace_too_fast_for_profile",
            message: `schedule[${i}] Zone-2 pace ${paceRaw} is too fast for profile (best pace baseline ${Math.round(
              input.runBestPaceSecPerKm
            )}s/km, required >= ${minZone2Sec}s/km)`
          });
        }
      }
      if (distanceKm != null && input.runLongestKm != null && input.runLongestKm > 0) {
        const maxSuggestedKm = Math.max(3, Math.round(input.runLongestKm * 0.85 * 10) / 10);
        if (distanceKm > maxSuggestedKm) {
          violations.push({
            code: "cardio_distance_too_long_for_profile",
            message: `schedule[${i}] cardio distance ${distanceKm}km exceeds safe cap ${maxSuggestedKm}km from benchmark longest run ${input.runLongestKm}km`
          });
        }
      }
      if (input.cardioDiscoveryWeek) {
        if (paceSec != null) {
          violations.push({
            code: "cardio_discovery_fixed_pace",
            message: `schedule[${i}] week-1 cardio discovery must not use fixed race pace (${paceRaw}); use conversational effort + logging`
          });
        }
        if (distanceKm != null && distanceKm > 6) {
          violations.push({
            code: "cardio_discovery_distance_high",
            message: `schedule[${i}] week-1 discovery run distance ${distanceKm}km too long (cap 6km)`
          });
        }
      }
    }
  }
  if (!allowDoubles) {
    for (const [dn, c] of perDayCounts) {
      if (c > 1) {
        violations.push({
          code: "double_session_forbidden",
          message: `More than one non-rest session on ${dn} but two-a-days disabled`
        });
      }
    }
  }
  const active = week.schedule.filter((d) => d.isRest !== true);
  const target = input.targetSessionsPerWeek;
  if (target != null && target > 0) {
    if (active.length !== target) {
      violations.push({
        code: "session_count_mismatch",
        message: `Expected exactly ${target} non-rest sessions per week, found ${active.length}`
      });
    }
  }
  if (input.expectedStrengthSessions != null && input.expectedStrengthSessions > 0) {
    const strCount = active.filter((d) => sessionTypeMatchesHint(d, "strength")).length;
    if (strCount !== input.expectedStrengthSessions) {
      violations.push({
        code: "strength_count_mismatch",
        message: `Expected exactly ${input.expectedStrengthSessions} Strength sessions, found ${strCount}`
      });
    }
  }
  if (input.expectedCardioSessions != null && input.expectedCardioSessions > 0) {
    const carCount = active.filter((d) => sessionTypeMatchesHint(d, "cardio")).length;
    if (carCount !== input.expectedCardioSessions) {
      violations.push({
        code: "cardio_count_mismatch",
        message: `Expected exactly ${input.expectedCardioSessions} Cardio/Intervals sessions, found ${carCount}`
      });
    }
  }
  if (input.sessionAssignments?.length) {
    for (const a of input.sessionAssignments) {
      const day = normalizeDayName(a.day);
      if (!day) continue;
      const match = active.find(
        (row) => normalizeDayName(String(row.day)) === day && String(row.sessionSlot || "Morning") === a.sessionSlot
      );
      if (!match) {
        violations.push({
          code: "missing_assignment_slot",
          message: `Missing session for ${day} (${a.sessionSlot}) ${a.sessionTypeHint}`
        });
        continue;
      }
      if (!sessionTypeMatchesHint(match, a.sessionTypeHint)) {
        violations.push({
          code: "session_type_mismatch",
          message: `${day} ${a.sessionSlot} must be ${a.sessionTypeHint}, got ${match.sessionType}`
        });
      }
    }
  }
  const slotPlan = slotPlanForInput(input);
  if (slotPlan && slotPlan.doubleSessionDays.length === 0) {
    const workoutSet = new Set(slotPlan.workoutDays);
    for (const d of week.schedule) {
      if (d.isRest === true) continue;
      const dn = normalizeDayName(String(d.day || ""));
      if (dn && !workoutSet.has(dn)) {
        violations.push({
          code: "session_on_non_slot_day",
          message: `Non-rest session on ${dn} but only these workout days allowed: ${slotPlan.workoutDays.join(", ")}`
        });
      }
    }
  }
  return violations.length ? { ok: false, violations } : { ok: true };
}
function repairSessionVolume(week, input, allowed) {
  const plan = slotPlanForInput(input);
  if (!plan) return week;
  const workoutSet = new Set(plan.workoutDays);
  const ac = [...week.applied_constraints || []];
  let fixedExtra = 0;
  let fixedTooMany = 0;
  let schedule = week.schedule.map((raw) => {
    const dayName = normalizeDayName(String(raw.day || ""));
    if (!dayName) return raw;
    let rest = raw.isRest === true;
    if (!rest && allowed.size > 0 && !allowed.has(dayName)) rest = true;
    if (!rest && plan.doubleSessionDays.length === 0 && !workoutSet.has(dayName)) {
      rest = true;
      fixedExtra += 1;
    }
    if (rest) return restDayRow(dayName, raw);
    return { ...raw, day: dayName, isRest: false };
  });
  let nonRest = schedule.filter((d) => d.isRest !== true);
  while (nonRest.length > plan.targetSessions) {
    const dropOffSlot = nonRest.filter((d) => {
      const dn = normalizeDayName(String(d.day || ""));
      return dn && !workoutSet.has(dn);
    });
    const victim = dropOffSlot[0] || [...nonRest].reverse().find((d) => {
      const dn = normalizeDayName(String(d.day || ""));
      return dn && workoutSet.has(dn);
    }) || nonRest[nonRest.length - 1];
    const vn = normalizeDayName(String(victim.day || ""));
    if (!vn) break;
    schedule = schedule.map((row) => {
      if (normalizeDayName(String(row.day || "")) === vn && row.isRest !== true) {
        fixedTooMany += 1;
        return restDayRow(vn, row);
      }
      return row;
    });
    nonRest = schedule.filter((d) => d.isRest !== true);
  }
  if (fixedExtra) ac.push(`repaired:rest_on_unused_available_days=${fixedExtra}`);
  if (fixedTooMany) ac.push(`repaired:trimmed_excess_sessions=${fixedTooMany}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}
function repairWorkoutScheduleConstraints(week, input) {
  const allowed = /* @__PURE__ */ new Set();
  if (Array.isArray(input.availableTrainingDays) && input.availableTrainingDays.length > 0) {
    for (const d of input.availableTrainingDays) {
      const n = normalizeDayName(d);
      if (n) allowed.add(n);
    }
  }
  const enforceDays = allowed.size > 0;
  const allowDoubles = input.allowDoubleSessions !== false;
  const perDayKept = /* @__PURE__ */ new Map();
  const ac = [...week.applied_constraints || []];
  let fixedDays = 0;
  let fixedDoubles = 0;
  const schedule = week.schedule.map((raw) => {
    const d = { ...raw };
    const dayName = normalizeDayName(String(d.day || ""));
    if (!dayName) return d;
    let rest = d.isRest === true;
    if (!rest && enforceDays && !allowed.has(dayName)) {
      rest = true;
      fixedDays += 1;
    }
    if (!rest && !allowDoubles) {
      const n = perDayKept.get(dayName) || 0;
      if (n >= 1) {
        rest = true;
        fixedDoubles += 1;
      } else {
        perDayKept.set(dayName, n + 1);
      }
    } else if (!rest) {
      perDayKept.set(dayName, (perDayKept.get(dayName) || 0) + 1);
    }
    if (rest) {
      return {
        ...d,
        day: dayName,
        isRest: true,
        sessionType: d.sessionType || "Recovery",
        title: d.title || "Rest day",
        exercises: [],
        cardio: void 0
      };
    }
    return { ...d, day: dayName, isRest: false };
  });
  if (fixedDays) ac.push(`repaired:rest_on_disallowed_days=${fixedDays}`);
  if (fixedDoubles) ac.push(`repaired:dropped_extra_same_day_sessions=${fixedDoubles}`);
  let afterVolume = repairSessionVolume(
    { ...week, schedule, applied_constraints: ac.slice(0, 8) },
    input,
    allowed
  );
  if (input.sessionAssignments?.length) {
    afterVolume = alignScheduleToCustomAssignments(afterVolume, input.sessionAssignments);
  }
  return repairEquipmentViolations(afterVolume, input);
}
function repairEquipmentViolations(week, input) {
  return repairEquipmentAndInjuryWithSubstitutes(week, {
    equipmentIds: input.equipmentIds,
    injuriesPlain: input.injuriesPlain
  });
}
function repairUnknownExerciseKeys(week) {
  const next = { ...week, schedule: week.schedule.map((d) => ({ ...d })) };
  let stripped = 0;
  for (const day of next.schedule) {
    if (!Array.isArray(day.exercises)) continue;
    day.exercises = day.exercises.map((row) => {
      const r = { ...row };
      const key = typeof r.exerciseKey === "string" ? r.exerciseKey.trim() : "";
      if (key && !isAllowedExerciseKey(key)) {
        stripped += 1;
        delete r.exerciseKey;
      }
      return r;
    });
  }
  const ac = [...week.applied_constraints || []];
  if (stripped) ac.push(`repaired:stripped_unknown_exerciseKey_count=${stripped}`);
  next.applied_constraints = ac.slice(0, 8);
  return next;
}

// src/lib/sessionDraftRecovery.ts
import { format as format5 } from "date-fns";

// src/lib/coach/coachSessionMeta.ts
function buildPlannedSessionKey(plannedDay, title, sessionSlot) {
  const slot = (sessionSlot || "default").toLowerCase();
  const t2 = title.toLowerCase().replace(/[^a-z0-9äöüß\s]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "session";
  return `${plannedDay}::${slot}::${t2}`;
}
function parseCoachSessionMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  const planId = String(o.planId ?? "");
  const sessionKey = String(o.sessionKey ?? "");
  const plannedDay = String(o.plannedDay ?? "");
  if (!planId || !sessionKey || !plannedDay) return null;
  return {
    planId,
    weekNumber: Math.max(1, Number(o.weekNumber) || 1),
    sessionKey,
    plannedDay,
    sessionSlot: o.sessionSlot != null ? String(o.sessionSlot) : void 0,
    title: o.title != null ? String(o.title) : void 0
  };
}

// src/lib/coachTemplateMappers.ts
import { format as format3 } from "date-fns";
function coachSessionToWorkoutType(sessionType, title) {
  const hay = `${sessionType || ""} ${title || ""}`.toLowerCase();
  const cardio = /\b(run|ride|bike|swim|row|cardio|interval|easy|tempo|z2|zone)\b/i.test(hay);
  const strength = /\b(strength|lift|gym|hypertrophy|squat|press|dead|pull)\b/i.test(hay);
  if (cardio && strength) return "Hybrid";
  if (cardio) return "Cardio";
  return "Strength";
}

// src/lib/workoutAnalytics.ts
function strengthVolumeForExercise(ex) {
  return strengthVolumeFromSets(strengthSetsForStats(ex));
}
function strengthVolumeForWorkout(workout) {
  let v = 0;
  for (const ex of workout.exercises || []) {
    v += strengthVolumeForExercise(ex);
  }
  return v;
}
function estimateE1rmKg(weight, reps) {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
function bestE1rmForExercise(ex) {
  const sets = strengthSetsForStats(ex);
  let best = 0;
  for (const s of sets) {
    const e = estimateE1rmKg(s.weight, s.reps);
    if (e > best) best = e;
  }
  return best;
}
function estimateWorkoutCalories(workout) {
  const duration = workout.duration || 0;
  let kcal = Math.max(0, duration) * 5;
  for (const ex of workout.exercises || []) {
    kcal += strengthVolumeForExercise(ex) * 0.1;
    const c = cardioSummaryFromExercise(ex);
    if (c) kcal += c.minutes * 8;
  }
  return Math.round(kcal);
}

// src/lib/sessionDraft.ts
import { useEffect, useState } from "react";
import { format as format4 } from "date-fns";
var STALE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var RECOVERABLE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function countDraftCompletedSets(draft) {
  let n = 0;
  for (const ex of draft.exercises ?? []) {
    const sets = ex.sets;
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      if (s && typeof s === "object" && "completed" in s && s.completed) {
        n += 1;
      }
    }
  }
  return n;
}
function isSessionDraftAged(draft) {
  const savedMs = new Date(draft.savedAt).getTime();
  return Number.isFinite(savedMs) && Date.now() - savedMs > STALE_DRAFT_MAX_AGE_MS;
}
function draftMatchesCompletedWorkout(draft, workout) {
  if (!workout.completedAt) return false;
  const startedMs = new Date(draft.startedAt ?? draft.savedAt).getTime();
  if (!Number.isFinite(startedMs)) return false;
  const completedMs = new Date(workout.completedAt).getTime();
  if (!Number.isFinite(completedMs) || completedMs < startedMs) return false;
  if (draft.sessionInstanceId && workout.sessionInstanceId && draft.sessionInstanceId === workout.sessionInstanceId) {
    return true;
  }
  const sourceKey = draft.workoutMeta.sourceKey;
  if (sourceKey && workout.sessionSourceKey === sourceKey) return true;
  return false;
}

// src/lib/sessionDraftRecovery.ts
function draftHasMatchingCompletedWorkout(draft, workouts) {
  return workouts.some((w) => draftMatchesCompletedWorkout(draft, w));
}
function isRecoverableDraftAge(draft) {
  const savedMs = new Date(draft.savedAt).getTime();
  return Number.isFinite(savedMs) && Date.now() - savedMs <= RECOVERABLE_DRAFT_MAX_AGE_MS;
}
function draftDayKey(draft) {
  const anchor = draft.workoutMeta.date ?? draft.startedAt ?? draft.savedAt;
  try {
    return format5(new Date(anchor), "yyyy-MM-dd");
  } catch {
    return format5(/* @__PURE__ */ new Date(), "yyyy-MM-dd");
  }
}
function normalizeWorkoutType(raw) {
  const t2 = String(raw || "").trim();
  if (t2 === "Strength" || t2 === "Cardio" || t2 === "Hybrid" || t2 === "Other") return t2;
  return coachSessionToWorkoutType(t2);
}
function coachMetaFromDraft(draft, coachPlanId) {
  const sourceKey = draft.workoutMeta.sourceKey;
  if (!sourceKey?.startsWith("coach:") || !coachPlanId) return void 0;
  const rest = sourceKey.slice("coach:".length);
  const parts = rest.split("::");
  const plannedDay = parts[0] || "";
  const sessionSlot = parts[1] && parts[1] !== "slot" ? parts[1] : void 0;
  const title = draft.workoutMeta.name?.trim() || "Coach Session";
  if (!plannedDay) return void 0;
  return {
    planId: coachPlanId,
    weekNumber: 1,
    sessionKey: buildPlannedSessionKey(plannedDay, title, sessionSlot),
    plannedDay,
    sessionSlot,
    title
  };
}
function assessRecoverableSessionDraft(draft, workouts) {
  if (!draft?.exercises?.length) return null;
  const exercises = sanitizeExercisesForSave(draft.exercises);
  if (exercises.length === 0) return null;
  if (!isRecoverableDraftAge(draft)) return null;
  if (!isSessionDraftAged(draft)) return null;
  if (draftHasMatchingCompletedWorkout(draft, workouts)) return null;
  const completedSetCount = countDraftCompletedSets(draft);
  if (completedSetCount < 1) return null;
  const durationMinutes = Math.max(1, Math.floor((draft.elapsedSeconds || 0) / 60));
  return {
    draft,
    exercises,
    durationMinutes,
    dayKey: draftDayKey(draft),
    label: draft.workoutMeta.name?.trim() || "Workout",
    completedSetCount,
    isCoachSource: Boolean(draft.workoutMeta.sourceKey?.startsWith("coach:"))
  };
}
function buildWorkoutFromRecoverableDraft(recovery, userId, opts) {
  const { draft, exercises, durationMinutes, dayKey: dayKey2, label } = recovery;
  const completedAt = draft.savedAt || (/* @__PURE__ */ new Date()).toISOString();
  let coachSessionMeta = coachMetaFromDraft(draft, opts?.coachPlanId);
  if (coachSessionMeta && opts?.weekNumber != null) {
    coachSessionMeta = { ...coachSessionMeta, weekNumber: opts.weekNumber };
  }
  const partial = {
    name: label,
    type: normalizeWorkoutType(draft.workoutMeta.type),
    date: dayKey2,
    duration: durationMinutes,
    exercises,
    userId,
    completedAt,
    sessionSourceKey: draft.workoutMeta.sourceKey,
    sessionInstanceId: draft.sessionInstanceId,
    caloriesBurned: estimateWorkoutCalories({
      exercises,
      duration: durationMinutes,
      type: normalizeWorkoutType(draft.workoutMeta.type)
    }),
    ...coachSessionMeta ? { coachSessionMeta } : {},
    notes: coachSessionMeta ? `AI Coach \u2013 wiederhergestellt (${format5(new Date(completedAt), "dd.MM.yyyy HH:mm")})` : `Wiederhergestellt (${format5(new Date(completedAt), "dd.MM.yyyy HH:mm")})`
  };
  return partial;
}

// src/lib/exerciseDbAscendFetch.ts
var TTL_MS = 1e3 * 60 * 60 * 12;
var cache2 = /* @__PURE__ */ new Map();
function cacheGet(key) {
  const hit = cache2.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache2.delete(key);
    return null;
  }
  return hit.data;
}
function cacheSet(key, data) {
  cache2.set(key, { at: Date.now(), data });
}
function headers() {
  const key = exerciseDbApiKey();
  if (!key) throw new ExerciseDbFetchError("ExerciseDB API key missing", "not_configured");
  const host = exerciseDbHost();
  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
    Accept: "application/json"
  };
}
function unwrapData(body) {
  if (body && typeof body === "object" && "data" in body) {
    const env = body;
    if (env.success === false) {
      throw new ExerciseDbFetchError("ExerciseDB API returned success=false", "unavailable");
    }
    return env.data;
  }
  return body;
}
async function parseAscendJson(r) {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError("ExerciseDB rate limit", "rate_limited");
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, "unavailable");
  }
  try {
    const parsed = JSON.parse(text);
    return unwrapData(parsed);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError("Invalid JSON from ExerciseDB", "unavailable");
  }
}
async function fetchAscend(pathWithQuery) {
  const host = exerciseDbHost();
  const url = `https://${host}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  const cached = cacheGet(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers() });
  const data = await parseAscendJson(r);
  cacheSet(url, data);
  return data;
}
function mapList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of raw) {
    const ex = mapExerciseDbToCatalog(row);
    if (!ex || seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}
function queryString(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === void 0 || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
async function ascendFetchExerciseById(id) {
  const clean = id.replace(/^edb_/, "").trim();
  if (!clean) return null;
  const raw = await fetchAscend(
    `/api/v1/exercises/${encodeURIComponent(clean)}`
  );
  return mapExerciseDbToCatalog(raw);
}
async function ascendSearchByName(query, limit = 25) {
  const q = query.trim();
  if (q.length < 2) return [];
  const raw = await fetchAscend(
    `/api/v1/exercises/search${queryString({ search: q, limit: Math.min(25, limit) })}`
  );
  return mapList(raw).slice(0, limit);
}
var cachedBodyPartNames = null;
async function resolveAscendBodyPartLabel(bodyPartSlug) {
  const slug = bodyPartSlug.trim().toLowerCase();
  const fallback = legacyBodyPartToAscendLabel(bodyPartSlug);
  try {
    if (!cachedBodyPartNames) {
      const lists = await ascendFetchFilterLists();
      cachedBodyPartNames = lists.bodyParts ?? [];
    }
    const fold = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = fold(slug);
    const hit = cachedBodyPartNames.find((n) => fold(n) === want || fold(n).includes(want) || want.includes(fold(n)));
    if (hit) return hit;
  } catch {
  }
  return fallback;
}
async function ascendFetchByBodyPart(bodyPart, limit = 30) {
  const label = await resolveAscendBodyPartLabel(bodyPart);
  const lim = Math.min(50, Math.max(1, limit));
  const attempts = [
    queryString({ bodyParts: label, limit: lim }),
    queryString({ bodyPart: label, limit: lim })
  ];
  for (const qs of attempts) {
    try {
      const raw = await fetchAscend(`/api/v1/exercises${qs}`);
      const list = mapList(raw);
      if (list.length > 0) return list.slice(0, limit);
    } catch {
    }
  }
  try {
    const raw = await fetchAscend(
      `/api/v1/exercises/search${queryString({ search: bodyPart.replace(/\s+/g, " "), limit: lim })}`
    );
    return mapList(raw).slice(0, limit);
  } catch {
    return [];
  }
}
async function ascendFetchBrowse(limit = 25) {
  const raw = await fetchAscend(
    `/api/v1/exercises${queryString({ limit: Math.min(25, limit) })}`
  );
  return mapList(raw);
}
async function ascendFetchByTarget(target, limit = 30) {
  const t2 = target.trim();
  if (!t2) return [];
  const raw = await fetchAscend(
    `/api/v1/exercises${queryString({
      targetMuscles: t2,
      limit: Math.min(25, limit)
    })}`
  );
  return mapList(raw).slice(0, limit);
}
async function ascendFetchFilterLists() {
  const [bodyPartsRaw, musclesRaw, equipmentsRaw] = await Promise.all([
    fetchAscend("/api/v1/bodyparts"),
    fetchAscend("/api/v1/muscles"),
    fetchAscend("/api/v1/equipments")
  ]);
  return {
    bodyParts: (bodyPartsRaw || []).map((x) => x.name).filter(Boolean),
    targets: (musclesRaw || []).map((x) => x.name).filter(Boolean),
    equipments: (equipmentsRaw || []).map((x) => x.name).filter(Boolean)
  };
}

// src/lib/exerciseSimilar.ts
function norm(s) {
  return (s || "").trim().toLowerCase();
}
function tokenOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((t2) => t2.length > 2));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((t2) => t2.length > 2));
  let n = 0;
  for (const t2 of ta) if (tb.has(t2)) n += 1;
  return n;
}
function rankSimilarExercises(source, candidates, limit = 12) {
  const srcTarget = norm(source.targetMuscle);
  const srcBody = norm(source.bodyPart);
  const srcEquip = norm(source.equipment);
  const srcCat = source.category;
  const srcName = source.name;
  const scored = candidates.filter((c) => c.key !== source.key).map((c) => {
    let score = 0;
    const t2 = norm(c.targetMuscle);
    const bp = norm(c.bodyPart);
    const eq = norm(c.equipment);
    if (srcTarget && t2 === srcTarget) score += 40;
    else if (srcTarget && t2 && (t2.includes(srcTarget) || srcTarget.includes(t2))) score += 22;
    if (srcBody && bp === srcBody) score += 25;
    if (srcEquip && eq === srcEquip) score += 18;
    else if (srcEquip && eq && (eq.includes("body weight") || srcEquip.includes("body weight"))) score += 8;
    if (c.category === srcCat) score += 12;
    const tagOverlap = (source.tags || []).filter((tag) => c.tags?.includes(tag)).length;
    score += tagOverlap * 6;
    score += tokenOverlap(srcName, c.name) * 4;
    for (const v of source.variations || []) {
      if (tokenOverlap(v, c.name) >= 2) score += 10;
    }
    return { ex: c, score };
  }).filter((x) => x.score > 8).sort((a, b) => b.score - a.score);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const { ex } of scored) {
    if (seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
    if (out.length >= limit) break;
  }
  return out;
}

// src/lib/exerciseDbFetch.ts
var MUSCLE_FILTER_FALLBACK_SEARCH = {
  beine: ["squat", "leg press", "lunge", "leg curl", "deadlift", "calf raise"],
  arme: ["bicep curl", "tricep extension", "curl"],
  brust: ["bench press", "push-up", "fly"],
  r\u00FCcken: ["row", "pull-up", "lat pulldown"],
  schulter: ["shoulder press", "lateral raise"],
  core: ["plank", "crunch", "abs"],
  ganzk\u00F6rper: ["burpee", "clean"]
};
var MUSCLE_FILTER_FALLBACK_TARGETS = {
  beine: ["quadriceps", "hamstrings", "glutes", "calves", "adductors"],
  arme: ["biceps", "triceps", "forearms"],
  brust: ["pectorals", "chest"],
  r\u00FCcken: ["lats", "traps", "upper back"],
  schulter: ["delts", "shoulders"],
  core: ["abs", "obliques"]
};
var TTL_MS2 = 1e3 * 60 * 60 * 12;
var cache3 = /* @__PURE__ */ new Map();
function cacheGet2(key) {
  const hit = cache3.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS2) {
    cache3.delete(key);
    return null;
  }
  return hit.data;
}
function cacheSet2(key, data) {
  cache3.set(key, { at: Date.now(), data });
}
function headers2() {
  const key = exerciseDbApiKey();
  if (!key) throw new ExerciseDbFetchError("ExerciseDB API key missing", "not_configured");
  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": exerciseDbHost(),
    Accept: "application/json"
  };
}
async function parseJson(r) {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError("ExerciseDB rate limit", "rate_limited");
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, "unavailable");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExerciseDbFetchError("Invalid JSON from ExerciseDB", "unavailable");
  }
}
async function fetchPath(path5) {
  const url = `https://${exerciseDbHost()}${path5.startsWith("/") ? path5 : `/${path5}`}`;
  const cacheKey2 = url;
  const cached = cacheGet2(cacheKey2);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers2() });
  const data = await parseJson(r);
  cacheSet2(cacheKey2, data);
  return data;
}
function mapList2(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of raw) {
    const ex = mapExerciseDbToCatalog(row);
    if (!ex || seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}
async function fetchExerciseDbById(id) {
  if (!isExerciseDbConfigured()) return null;
  const clean = id.replace(/^edb_/, "").trim();
  if (!clean) return null;
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchExerciseById(clean);
    }
    const raw = await fetchPath(`/exercises/exercise/${encodeURIComponent(clean)}`);
    return mapExerciseDbToCatalog(raw);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function searchExerciseDbByName(query, limit = 25) {
  if (!isExerciseDbConfigured()) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendSearchByName(q, limit);
    }
    const raw = await fetchPath(
      `/exercises/name/${encodeURIComponent(q)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function fetchExerciseDbByBodyPart(bodyPart, limit = 30) {
  if (!isExerciseDbConfigured()) return [];
  const bp = bodyPart.trim().toLowerCase();
  if (!bp) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByBodyPart(bp, limit);
    }
    const raw = await fetchPath(
      `/exercises/bodyPart/${encodeURIComponent(bp)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function fetchExerciseDbByBodyParts(bodyParts, limit = 40) {
  const parts = bodyParts.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!isExerciseDbConfigured() || parts.length === 0) return [];
  const perPart = Math.max(10, Math.ceil(limit / parts.length));
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const batches = await Promise.all(
    parts.map(
      (bp) => fetchExerciseDbByBodyPart(bp, perPart).catch(() => [])
    )
  );
  for (const batch of batches) {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  }
  return out.slice(0, limit);
}
async function fetchExerciseDbByTarget(target, limit = 30) {
  if (!isExerciseDbConfigured()) return [];
  const t2 = target.trim().toLowerCase();
  if (!t2) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByTarget(t2, limit);
    }
    const raw = await fetchPath(
      `/exercises/target/${encodeURIComponent(t2)}`
    );
    return mapList2(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), "network");
  }
}
async function searchExerciseDbCatalog(opts) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const q = (opts.query || "").trim();
  const muscle = opts.muscle ?? "all";
  if (muscle !== "all" && muscle !== "cardio_art" && q.length < 2) {
    const parts2 = muscleFilterToBodyParts(muscle);
    if (parts2.length > 0) {
      return fetchExercisesForMuscleFilter(muscle, limit);
    }
  }
  if (q.length >= 2) {
    let list = await searchExerciseDbByName(q, limit);
    if (muscle !== "all") {
      list = list.filter((e) => {
        if (muscle === "cardio_art") return e.category === "cardio";
        return e.tags?.includes(muscle) ?? false;
      });
    }
    return list.slice(0, limit);
  }
  if (muscle === "cardio_art") {
    return fetchExerciseDbByBodyPart("cardio", limit);
  }
  const parts = muscleFilterToBodyParts(muscle);
  if (parts.length > 0) return fetchExercisesForMuscleFilter(muscle, limit);
  if (isAscendExerciseDbHost() && isExerciseDbConfigured()) {
    return ascendFetchBrowse(limit);
  }
  return [];
}
async function fetchExercisesForMuscleFilter(muscle, limit) {
  const parts = muscleFilterToBodyParts(muscle);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const merge = (batch) => {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  };
  merge(await fetchExerciseDbByBodyParts(parts, limit));
  if (out.length < limit) {
    for (const target of MUSCLE_FILTER_FALLBACK_TARGETS[muscle] ?? []) {
      merge(await fetchExerciseDbByTarget(target, 14).catch(() => []));
      if (out.length >= limit) break;
    }
  }
  if (out.length < limit) {
    for (const term of MUSCLE_FILTER_FALLBACK_SEARCH[muscle] ?? []) {
      const batch = await searchExerciseDbByName(term, 12).catch(() => []);
      for (const ex of batch) {
        if (!seen.has(ex.key) && (ex.tags?.includes(muscle) ?? true)) {
          seen.add(ex.key);
          out.push(ex);
        }
      }
      if (out.length >= limit) break;
    }
  }
  if (out.length === 0 && isAscendExerciseDbHost()) {
    const browse = await ascendFetchBrowse(Math.min(80, limit * 3)).catch(() => []);
    for (const ex of browse) {
      if (ex.tags?.includes(muscle)) merge([ex]);
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}
async function fetchExerciseDbFilterLists() {
  if (!isExerciseDbConfigured()) {
    return { bodyParts: [], targets: [], equipments: [] };
  }
  if (isAscendExerciseDbHost()) {
    return ascendFetchFilterLists();
  }
  const [bodyParts, targets, equipments] = await Promise.all([
    fetchPath("/exercises/bodyPartList"),
    fetchPath("/exercises/targetList"),
    fetchPath("/exercises/equipmentList")
  ]);
  return { bodyParts, targets, equipments };
}
async function findSimilarExercises(exerciseKey, limit = 12) {
  if (!isExerciseDbConfigured()) return [];
  const id = exerciseKey.replace(/^edb_/, "").trim();
  if (!id) return [];
  let source = await fetchExerciseDbById(id);
  if (!source) return [];
  const pool2 = [];
  const seen = /* @__PURE__ */ new Set([source.key]);
  const addList = (list) => {
    for (const ex of list) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        pool2.push(ex);
      }
    }
  };
  if (source.targetMuscle) {
    addList(await fetchExerciseDbByTarget(source.targetMuscle, 35));
  }
  if (source.bodyPart) {
    addList(await fetchExerciseDbByBodyPart(source.bodyPart, 25));
  }
  if (pool2.length < 8 && source.name.length >= 3) {
    const words = source.name.split(/\s+/).filter((w) => w.length > 3);
    const q = words[0] || source.name.slice(0, 8);
    addList(await searchExerciseDbByName(q, 20));
  }
  return rankSimilarExercises(source, pool2, limit);
}
var COACH_CATALOG_CACHE_TTL_MS = 1e3 * 60 * 60 * 12;
var coachCatalogCache = null;
async function fetchCoachCatalogGroup(g, maxPerGroup) {
  try {
    let items = [];
    if (g.target) {
      try {
        items = await fetchExerciseDbByTarget(g.target, maxPerGroup);
      } catch {
        items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
      }
    } else {
      items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
    }
    return items.map((ex) => {
      const meta = [
        g.label,
        ex.targetMuscle ? `target:${ex.targetMuscle}` : "",
        ex.bodyPart ? `body:${ex.bodyPart}` : "",
        ex.equipment ? `equip:${ex.equipment}` : ""
      ].filter(Boolean).join(" ");
      return `${ex.key} | ${ex.name} | ${meta}`;
    });
  } catch {
    return [];
  }
}
async function formatExerciseDbCatalogForCoach(maxPerGroup = 12) {
  if (!isExerciseDbConfigured()) return "";
  const cap = Math.max(6, Math.min(20, Math.round(maxPerGroup)));
  if (coachCatalogCache && coachCatalogCache.maxPerGroup === cap && Date.now() - coachCatalogCache.at < COACH_CATALOG_CACHE_TTL_MS) {
    return coachCatalogCache.text;
  }
  const groups = [
    { label: "push_chest", bodyPart: "chest", target: "pectorals" },
    { label: "pull_back", bodyPart: "back", target: "lats" },
    { label: "legs", bodyPart: "upper legs", target: "quads" },
    { label: "glutes_hams", bodyPart: "upper legs", target: "glutes" },
    { label: "shoulders", bodyPart: "shoulders", target: "deltoids" },
    { label: "arms", bodyPart: "upper arms", target: "biceps" },
    { label: "core", bodyPart: "waist", target: "abs" },
    { label: "cardio", bodyPart: "cardio" }
  ];
  const groupLines = await Promise.all(groups.map((g) => fetchCoachCatalogGroup(g, cap)));
  const lines = [];
  const seen = /* @__PURE__ */ new Set();
  for (const batch of groupLines) {
    for (const line of batch) {
      const key = line.split("|")[0]?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  const text = lines.join("\n");
  coachCatalogCache = { at: Date.now(), maxPerGroup: cap, text };
  return text;
}

// src/lib/coachExercisePrompt.ts
var NO_EXERCISEDB_HINT = "ExerciseDB ist nicht konfiguriert (EXERCISEDB_RAPIDAPI_KEY). Kein lokaler \xDCbungskatalog mehr \u2014 bitte API-Key setzen.";
async function formatExerciseDbForCoachPromptAsync() {
  if (!isExerciseDbConfigured()) {
    return NO_EXERCISEDB_HINT;
  }
  try {
    const remote = await formatExerciseDbCatalogForCoach(12);
    if (remote.trim()) {
      return `${remote}

Format: edb_<id> | name | muscle tags (target/body/equip). Use exerciseKey on every strength exercise. Balance push/pull/legs/core weekly.`;
    }
  } catch (e) {
    console.error("ExerciseDB coach catalog:", e);
  }
  return `${NO_EXERCISEDB_HINT}
(ExerciseDB-Katalogabruf lieferte keine Treffer.)`;
}
function formatExerciseDbForCoachPrompt() {
  return NO_EXERCISEDB_HINT;
}

// src/lib/server/exerciseDbEnv.ts
var ENV_KEY_CANDIDATES2 = [
  "EXERCISEDB_RAPIDAPI_KEY",
  "EXERCISEDB_API_KEY",
  "EXERCISE_DB_RAPIDAPI_KEY",
  "RAPIDAPI_KEY",
  "RAPIDAPI_EXERCISEDB_KEY",
  "VITE_EXERCISEDB_RAPIDAPI_KEY"
];
function normalizeApiKeyFromRaw(raw) {
  const k = sanitizeEnvSecret(raw);
  if (!k || k.length < 10) return void 0;
  const v = k.toLowerCase();
  const placeholders = /* @__PURE__ */ new Set([
    "none",
    "null",
    "undefined",
    "changeme",
    "api_key_here",
    "your_exercisedb_rapidapi_key",
    "xxx"
  ]);
  if (placeholders.has(v)) return void 0;
  if (/^your[_-]/.test(v) && k.length < 36) return void 0;
  return k;
}
function getExerciseDbEnvDiagnostics() {
  const { applied: envReloadApplied } = reloadEnvFromFile();
  const envFileProblem = getEnvFileProblem();
  const key = exerciseDbApiKey();
  const source = exerciseDbKeySource();
  const hints = [];
  if (envFileProblem) hints.unshift(envFileProblem);
  for (const name of ENV_KEY_CANDIDATES2) {
    const inFile = envVarStatusInFile(name);
    const raw = sanitizeEnvSecret(process.env[name]);
    const valid = normalizeApiKeyFromRaw(raw);
    if (valid) {
      const where = inFile === "missing" ? "Server-Umgebung (Docker/Panel, nicht in .env-Datei)" : inFile === "empty" ? "Umgebung + leere Zeile in .env" : "Umgebung und .env-Datei";
      hints.push(`${name}: aktiv, ${raw.length} Zeichen (${where})`);
    } else if (raw.length > 0) {
      hints.push(
        `${name}: Wert vorhanden (${raw.length} Zeichen), wird abgelehnt \u2014 pr\xFCfe Leerzeichen/Zeilenumbruch`
      );
    } else if (inFile === "set") {
      const fileLen = envVarLengthInFile(name);
      hints.push(
        `${name}: in .env (${fileLen ?? "?"} Zeichen), Prozess leer \u2014 \u201EAktualisieren\u201C klicken oder Server neu starten`
      );
    } else if (inFile === "empty") {
      hints.push(`${name}: Zeile in .env, aber leer`);
    } else {
      hints.push(`${name}: nicht gesetzt (weder Umgebung noch .env)`);
    }
  }
  return {
    configured: isExerciseDbConfigured(),
    source,
    host: exerciseDbHost(),
    envFileHints: hints,
    envFilePath: getEnvFilePath(),
    envFileProblem,
    keyLength: key ? key.length : null,
    envReloadApplied
  };
}

// src/lib/coach/coachPlanState.ts
var DEFAULT_COACH_PLAN_STATE = {
  phase: "baseline",
  weekInBlock: 1,
  blockLength: 4,
  volumeMultiplier: 1,
  intensityTargetRpe: 7,
  deloadNextWeek: false,
  nutritionMacroMultiplier: 1
};
function parseCoachPlanState(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COACH_PLAN_STATE };
  const o = raw;
  const phase = String(o.phase ?? "baseline");
  const validPhases = ["baseline", "accumulation", "intensification", "deload", "taper", "maintain"];
  return {
    phase: validPhases.includes(phase) ? phase : "baseline",
    weekInBlock: Math.max(1, Math.min(8, Number(o.weekInBlock) || 1)),
    blockLength: Math.max(3, Math.min(6, Number(o.blockLength) || 4)),
    volumeMultiplier: Math.max(0.5, Math.min(1.25, Number(o.volumeMultiplier) || 1)),
    intensityTargetRpe: Math.max(5, Math.min(9, Number(o.intensityTargetRpe) || 7)),
    deloadNextWeek: o.deloadNextWeek === true,
    nutritionMacroMultiplier: Math.max(0.85, Math.min(1.15, Number(o.nutritionMacroMultiplier) || 1)),
    lastRecommendation: o.lastRecommendation,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : void 0,
    sessionMatchOverrides: o.sessionMatchOverrides && typeof o.sessionMatchOverrides === "object" ? o.sessionMatchOverrides : void 0,
    sessionFeedback: Array.isArray(o.sessionFeedback) ? o.sessionFeedback : void 0
  };
}
async function loadCoachPlanState(pool2, planId) {
  try {
    const res = await pool2.query(`SELECT coach_plan_state FROM coach_plans WHERE id=$1`, [planId]);
    return parseCoachPlanState(res.rows[0]?.coach_plan_state);
  } catch {
    return { ...DEFAULT_COACH_PLAN_STATE };
  }
}
async function saveCoachPlanState(pool2, planId, state) {
  const next = { ...state, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await pool2.query(`UPDATE coach_plans SET coach_plan_state=$2::jsonb, updated_at=NOW() WHERE id=$1`, [
    planId,
    JSON.stringify(next)
  ]);
}

// src/lib/buildUserContextForCoach.ts
function simpleWeightTrend(weightHistory) {
  if (!Array.isArray(weightHistory) || weightHistory.length < 2) return "stable";
  const nums = weightHistory.map((e) => e && typeof e.value === "number" ? e.value : NaN).filter((x) => Number.isFinite(x));
  if (nums.length < 2) return "stable";
  const a = nums[0];
  const b = nums[nums.length - 1];
  const d = b - a;
  if (d > 0.4) return "up";
  if (d < -0.4) return "down";
  return "stable";
}
async function buildUserContextForCoach(params) {
  const { pool: pool2, userId, plan } = params;
  const ob = plan.onboarding_data || {};
  const userRow = await pool2.query(
    `SELECT measurements, weight_history, profile_extras, goals FROM users WHERE id=$1`,
    [userId]
  );
  const row = userRow.rows[0] || {};
  const m = row.measurements || {};
  const wh = row.weight_history;
  const profileExtras = row.profile_extras || {};
  const goals = row.goals || {};
  const rollEnd = /* @__PURE__ */ new Date();
  const rollStart = new Date(rollEnd);
  rollStart.setDate(rollEnd.getDate() - 27);
  const rollA = toLocalYmd(rollStart);
  const rollB = toLocalYmd(rollEnd);
  let evalStart = null;
  let evalEnd = null;
  if (params.scheduleWindow?.startYmd) {
    evalStart = params.scheduleWindow.startYmd;
    evalEnd = coachWeekInclusiveEnd(evalStart);
  }
  const [wCount, nAgg, reports, cardioFb, workoutLoad, recentWorkouts] = await Promise.all([
    pool2.query(`SELECT COUNT(*)::int AS c FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      userId,
      rollA,
      rollB
    ]),
    pool2.query(
      `SELECT COUNT(*)::int AS entries, COALESCE(AVG(calories),0)::float AS avg_cal
       FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
      [userId, rollA, rollB]
    ),
    plan.id ? pool2.query(
      `SELECT week_number, report FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC LIMIT 3`,
      [plan.id]
    ) : Promise.resolve({ rows: [] }),
    pool2.query(
      `SELECT date, type, cardio_session_feedback FROM workouts
       WHERE user_id=$1 AND cardio_session_feedback IS NOT NULL
       ORDER BY date DESC LIMIT 3`,
      [userId]
    ),
    pool2.query(
      `SELECT
          COALESCE(AVG(duration),0)::float AS avg_duration,
          COALESCE(AVG(calories_burned),0)::float AS avg_kcal,
          COALESCE(AVG(session_rpe),0)::float AS avg_session_rpe
       FROM workouts
       WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
      [userId, rollA, rollB]
    ),
    pool2.query(
      `SELECT date, name, type, duration, calories_burned, session_rpe, exercises
       FROM workouts
       WHERE user_id=$1
       ORDER BY date DESC
       LIMIT 20`,
      [userId]
    )
  ]);
  const highlights = (reports.rows || []).map((r) => ({
    week: r.week_number,
    recommendation: r.report?.recommendation,
    rating: r.report?.overallRating,
    completionRate: r.report?.completionRate
  }));
  let coachPlanState = parseCoachPlanState(null);
  if (plan.id) {
    coachPlanState = await loadCoachPlanState(pool2, plan.id);
  }
  const latestReport = (reports.rows || [])[0]?.report;
  const slotPlan = resolveTrainingSlotPlanFromOnboarding(ob, params.partialWeekStartDay);
  const volumeAssignments = buildVolumeAssignmentsFromOnboarding(ob, {
    partialWeekStartDay: params.partialWeekStartDay
  });
  const customAssignments = volumeAssignments?.length ? volumeAssignments : null;
  const vol = parseCoachSessionVolume(ob);
  const assignStrength = customAssignments?.filter((a) => a.sessionTypeHint === "strength").length;
  const assignCardio = customAssignments?.filter((a) => a.sessionTypeHint === "cardio").length;
  const targetSessions = customAssignments?.length && customAssignments.length > 0 ? customAssignments.length : slotPlan?.targetSessions ?? totalWeeklySessions(vol);
  const weekNumber = params.weekNumber ?? plan.current_week ?? 1;
  const benchmarkProfile = buildCoachBenchmarkProfile({
    benchmarks: ob.benchmarks || {},
    equipment: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? ob.equipment : void 0
    ),
    trainingStyle: String(ob.trainingStyle || "hybrid"),
    sports: Array.isArray(ob.sports) ? ob.sports : [],
    weekNumber
  });
  return {
    onboarding: ob,
    profile_snapshot: {
      weight_kg: m.weight ?? null,
      height_cm: m.height ?? null,
      age: m.age ?? null,
      gender: m.gender ?? null,
      activity_level: m.activityLevel ?? null,
      goal_type: goals.type ?? null,
      goals,
      profile_extras: profileExtras
    },
    rolling: {
      window_days: 28,
      workouts_logged_count: wCount.rows[0]?.c ?? 0,
      workout_load: {
        avg_duration_min: workoutLoad.rows[0]?.avg_duration ?? 0,
        avg_kcal: workoutLoad.rows[0]?.avg_kcal ?? 0,
        avg_session_rpe: workoutLoad.rows[0]?.avg_session_rpe ?? 0
      },
      recent_workouts: (recentWorkouts.rows || []).map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
        name: r.name,
        type: r.type,
        duration: r.duration,
        calories_burned: r.calories_burned,
        session_rpe: r.session_rpe,
        exercises: Array.isArray(r.exercises) ? r.exercises : []
      })),
      strength_load_workouts: (recentWorkouts.rows || []).filter((r) => Array.isArray(r.exercises) && r.exercises.length > 0).slice(0, 16).map((r) => ({
        id: String(r.date),
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
        name: r.name || "Workout",
        type: r.type || "Strength",
        duration: Number(r.duration) || 0,
        caloriesBurned: Number(r.calories_burned) || 0,
        exercises: r.exercises
      })),
      nutrition_summary: {
        entries: nAgg.rows[0]?.entries ?? 0,
        avg_calories: nAgg.rows[0]?.avg_cal ?? 0
      },
      weight_trend: simpleWeightTrend(wh),
      last_reports_highlights: highlights
    },
    constraints_input: {
      coach_decides_training_days: vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions,
      coach_decides_session_duration: vol.coachDecidesStrengthDuration && vol.coachDecidesCardioDuration,
      schedule_mode: ob.scheduleMode === "custom" ? "custom" : "auto",
      available_weekdays_en: ob.availableTrainingDays ?? [],
      target_sessions_per_week: targetSessions,
      custom_week_assignments: customAssignments,
      partial_first_week_start_day: params.partialWeekStartDay ?? null,
      allow_double_sessions: ob.allowDoubleSessions !== false,
      volume: {
        strength: {
          sessions_per_week: assignStrength != null && assignStrength > 0 ? assignStrength : vol.strengthSessionsPerWeek,
          full_week_target_sessions: vol.strengthSessionsPerWeek,
          duration_min: vol.strengthDurationMin,
          coach_decides_sessions: vol.coachDecidesStrengthSessions,
          coach_decides_duration: vol.coachDecidesStrengthDuration
        },
        cardio: {
          sessions_per_week: assignCardio != null && assignCardio > 0 ? assignCardio : vol.cardioSessionsPerWeek,
          full_week_target_sessions: vol.cardioSessionsPerWeek,
          duration_min: vol.cardioDurationMin,
          coach_decides_sessions: vol.coachDecidesCardioSessions,
          coach_decides_duration: vol.coachDecidesCardioDuration
        }
      },
      session_duration_cap_min: vol.strengthDurationMin ?? ob.sessionDuration ?? null,
      equipment_ids: normalizeCoachEquipmentSelection(
        Array.isArray(ob.equipment) ? ob.equipment : void 0
      ),
      fitness_level: ob.fitnessLevel ?? null,
      injuries_plain: String(ob.injuries ?? ""),
      benchmarks: benchmarkProfile.filled,
      has_run_benchmarks: benchmarkProfile.hasRunBenchmarks,
      has_strength_benchmarks: benchmarkProfile.hasStrengthBenchmarks,
      week1_cardio_discovery: benchmarkProfile.cardioDiscoveryWeek,
      week1_strength_discovery: benchmarkProfile.strengthDiscoveryWeek
    },
    benchmark_profile: benchmarkProfile,
    schedule_eval_window: evalStart && evalEnd ? { start: evalStart, end: evalEnd } : null,
    coach_plan_state: coachPlanState,
    latest_week_directive: latestReport?.weekDirective ?? null,
    latest_facts_snapshot: latestReport?.factsSnapshot ?? null,
    recent_cardio_feedback: (cardioFb.rows || []).map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
      type: r.type,
      feedback: r.cardio_session_feedback
    }))
  };
}

// src/lib/coach/coachPromptBlocks.ts
function formatWeekDirectiveBlock(directive, lastReport) {
  const fromLast = lastReport?.nextWeekChanges?.length ? `
Last week's requested changes: ${lastReport.nextWeekChanges.join("; ")}` : "";
  return `
WEEK_DIRECTIVE (computed by coaching engine \u2014 follow strictly):
- Recommendation code: ${directive.recommendation}
- Completion rate: ${directive.completionRate}%
- Volume multiplier vs last block: ${directive.volumeMultiplier}x
- Target session RPE: ${directive.intensityTargetRpe}
- Deload week: ${directive.deloadWeek ? "YES" : "no"}
- Taper week: ${directive.taperWeek ? "YES" : "no"}
- Directives: ${directive.coachDirectiveBullets.join(" | ")}
- Progression data: ${directive.progressionNotes.join(" | ") || "n/a"}${fromLast}

Apply volume multiplier to total working sets (not rest days). Keep primary compounds; adjust accessories first.
`;
}
function buildAdaptationBlockFromReport(lastReport, weekNumber) {
  if (!lastReport) return "";
  const wd = lastReport.weekDirective;
  if (wd && typeof wd === "object" && wd.recommendation) {
    return formatWeekDirectiveBlock(wd, lastReport);
  }
  return `
LAST WEEK PERFORMANCE (Week ${weekNumber - 1}):
- Overall rating: ${lastReport.overallRating}/10
- Completion rate: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Strengths: ${Array.isArray(lastReport.performanceHighlights) ? lastReport.performanceHighlights.join("; ") : ""}
- Weaknesses: ${Array.isArray(lastReport.areasToImprove) ? lastReport.areasToImprove.join("; ") : ""}
- Coach recommendation: ${lastReport.recommendation}
- Specific changes requested: ${Array.isArray(lastReport.nextWeekChanges) ? lastReport.nextWeekChanges.join("; ") : ""}
- Strategy: ${lastReport.nextWeekStrategy}
`;
}
function formatReportFactsForNarrative(facts, prevReport) {
  const prev = prevReport ? `
PREVIOUS WEEK REPORT:
- Rating: ${prevReport.overallRating}/10, Completion: ${prevReport.completionRate}%
- Recommendation was: ${prevReport.recommendation}
- Planned changes: ${Array.isArray(prevReport.nextWeekChanges) ? prevReport.nextWeekChanges.join("; ") : "none"}
` : "No previous week report.";
  return `
ATHLETE_WEEK_FACTS (immutable \u2014 do NOT change overallRating, completionRate, or recommendation):
${JSON.stringify(
    {
      overallRating: facts.overallRating,
      completionRate: facts.completionRate,
      recommendation: facts.recommendation,
      snapshot: facts.snapshot,
      directive: facts.directive
    },
    null,
    2
  )}
${prev}

Write narrative fields ONLY. Use exact numbers from facts in prose.
`;
}

// src/lib/coachScheduleZod.ts
import { z } from "zod";
var coachExerciseRowSchema = z.object({
  name: z.string(),
  /** KI setzt oft `null` statt Feld wegzulassen — nullish erlauben. */
  exerciseKey: z.string().nullish(),
  setType: z.string().nullish(),
  sets: z.union([z.number(), z.string()]).nullish(),
  reps: z.union([z.number(), z.string()]).nullish(),
  rest: z.string().nullish(),
  weight: z.string().nullish(),
  notes: z.string().nullish()
}).passthrough();
var cardioSchema = z.object({
  type: z.string().optional(),
  duration: z.string().optional(),
  distance: z.string().optional(),
  pace: z.string().optional(),
  zones: z.string().optional(),
  details: z.string().optional()
}).passthrough();
var scheduleDaySchema = z.object({
  day: z.string(),
  sessionSlot: z.string().optional(),
  isRest: z.boolean().optional(),
  sessionType: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  estimatedDuration: z.number().optional(),
  intensity: z.string().optional(),
  rpe: z.number().optional(),
  warmup: z.string().optional(),
  warmupExercises: z.array(coachExerciseRowSchema).optional(),
  exercises: z.array(coachExerciseRowSchema).optional(),
  /** Strength-Sessions: KI liefert oft `cardio: null` — nullish statt optional. */
  cardio: cardioSchema.nullish(),
  cooldown: z.string().optional(),
  cooldownExercises: z.array(coachExerciseRowSchema).optional(),
  notes: z.string().optional()
}).passthrough();
var coachWorkoutWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  schedule: z.array(scheduleDaySchema)
});
var nutritionIngredientSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    amount: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional()
  }).passthrough()
]);
var nutritionMealSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  prepTime: z.string().optional(),
  servings: z.number().optional(),
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  ingredients: z.array(nutritionIngredientSchema).optional(),
  prepSteps: z.array(z.string()).optional(),
  prep_steps: z.array(z.string()).optional(),
  notes: z.string().optional()
}).passthrough();
var nutritionDaySchema = z.object({
  day: z.string(),
  totalCalories: z.number().optional(),
  meals: z.array(nutritionMealSchema).optional()
}).passthrough();
var coachNutritionWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  dailyTargets: z.object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional()
  }).passthrough().optional(),
  mealPlan: z.array(nutritionDaySchema),
  shoppingListHighlights: z.array(z.string()).optional(),
  supplementRecommendations: z.array(z.string()).optional()
});
var weeklyReportSchema = z.object({
  overallRating: z.number(),
  coachMessage: z.string(),
  summary: z.string(),
  performanceHighlights: z.array(z.string()),
  areasToImprove: z.array(z.string()),
  weekOverWeekComparison: z.string().optional(),
  completionRate: z.number(),
  nextWeekStrategy: z.string(),
  nextWeekChanges: z.array(z.string()),
  recommendation: z.enum(["continue", "reduce_volume", "increase_volume", "deload"]),
  factsSnapshot: z.unknown().optional(),
  weekDirective: z.unknown().optional()
});

// src/lib/aiPrompts/loadPrompt.ts
import { existsSync, readFileSync } from "fs";
import path3 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var __dirname = path3.dirname(fileURLToPath2(import.meta.url));
function resolvePromptsRoot() {
  const envRoot = process.env.PROMPTS_DIR?.trim();
  if (envRoot && existsSync(path3.join(envRoot, "workout"))) {
    return path3.resolve(envRoot);
  }
  const candidates = [
    path3.resolve(process.cwd(), "prompts"),
    path3.resolve(__dirname, "prompts"),
    path3.resolve(__dirname, "../../../prompts")
  ];
  for (const dir of candidates) {
    if (existsSync(path3.join(dir, "workout")) && existsSync(path3.join(dir, "nutrition"))) {
      return dir;
    }
  }
  return candidates[0];
}
var PROMPTS_ROOT = resolvePromptsRoot();
var cache4 = /* @__PURE__ */ new Map();
function cacheKey(category, name) {
  return `${category}/${name.replace(/\.md$/i, "")}`;
}
function readPromptFile(category, name) {
  const key = cacheKey(category, name);
  let raw = cache4.get(key);
  if (raw === void 0) {
    const base = name.replace(/\.md$/i, "");
    const filePath = path3.join(PROMPTS_ROOT, category, `${base}.md`);
    raw = readFileSync(filePath, "utf8");
    cache4.set(key, raw);
  }
  return raw;
}
function applyVars(template, vars) {
  let out = template;
  for (const [varKey, value] of Object.entries(vars)) {
    out = out.split(`{{${varKey}}}`).join(value ?? "");
  }
  return out;
}
function loadPrompt(category, name, vars = {}, phase) {
  let raw = readPromptFile(category, name);
  if (raw.includes("---PHASE_MATCH---")) {
    const parts = raw.split("---PHASE_MATCH---");
    raw = phase === "match" ? parts.slice(1).join("---PHASE_MATCH---") : parts[0];
  }
  return applyVars(raw.trim(), vars);
}

// src/lib/aiPrompts/buildWorkoutPrompts.ts
function buildCoachWorkoutWeekPrompt(vars) {
  return loadPrompt("workout", "coach-workout-week", vars);
}
function buildCoachNutritionWeekPrompt(vars) {
  return loadPrompt("workout", "coach-nutrition-week", vars);
}
function buildCoachWeeklyReportPrompt(vars) {
  return loadPrompt("workout", "coach-weekly-report", vars);
}
function buildCoachWeeklyReportNarrativePrompt(vars) {
  return loadPrompt("workout", "coach-weekly-report-narrative", vars);
}
function buildWorkoutTemplateGeneratePrompt(vars) {
  return loadPrompt("workout", "workout-template-generate", vars);
}
function buildUserWeeklyReportPrompt(vars) {
  return loadPrompt("workout", "user-weekly-report", vars);
}

// src/lib/fatigueScore.ts
import { startOfWeek, subDays as subDays2, isWithinInterval as isWithinInterval2 } from "date-fns";
function computeWeeklyFatigue(workouts, opts) {
  const ref = opts?.refDate ?? /* @__PURE__ */ new Date();
  const weekStart = startOfWeek(ref, { weekStartsOn: 1 });
  const weekEnd = ref;
  const interval = { start: weekStart, end: weekEnd };
  let volumeKg = 0;
  let sessions = 0;
  let rpeSum = 0;
  let rpeN = 0;
  for (const w of workouts) {
    const d = new Date(w.date);
    if (!isWithinInterval2(d, interval)) continue;
    sessions += 1;
    volumeKg += strengthVolumeForWorkout(w);
    for (const ex of w.exercises || []) {
      for (const s of strengthSetsForStats(ex)) {
        if (s.rpe != null && s.rpe > 0) {
          rpeSum += s.rpe;
          rpeN += 1;
        }
      }
    }
  }
  const avgRpe = rpeN > 0 ? Math.round(rpeSum / rpeN * 10) / 10 : null;
  let stepsSum = 0;
  let stepsDays = 0;
  let sleepSum = 0;
  let sleepDays = 0;
  for (let i = 0; i < 7; i++) {
    const ds = subDays2(weekEnd, i).toISOString().split("T")[0];
    const st = opts?.stepsByDate?.[ds];
    if (st != null && st > 0) {
      stepsSum += st;
      stepsDays += 1;
    }
    const sl = opts?.sleepByDate?.[ds]?.totalMinutes;
    if (sl != null && sl > 0) {
      sleepSum += sl;
      sleepDays += 1;
    }
  }
  const stepsAvg = stepsDays > 0 ? Math.round(stepsSum / stepsDays) : null;
  const sleepAvgMin = sleepDays > 0 ? Math.round(sleepSum / sleepDays) : null;
  let score = 0;
  if (avgRpe != null) score += Math.min(40, avgRpe / 10 * 40);
  score += Math.min(35, volumeKg / 15e3 * 35);
  score += Math.min(15, sessions * 3);
  if (sleepAvgMin != null && sleepAvgMin < 360) score += 10;
  if (stepsAvg != null && stepsAvg > 12e3) score += 5;
  score = Math.min(100, Math.round(score));
  let labelKey = "fatigue.low";
  if (score >= 75) labelKey = "fatigue.critical";
  else if (score >= 55) labelKey = "fatigue.high";
  else if (score >= 35) labelKey = "fatigue.moderate";
  return {
    score,
    labelKey,
    avgRpe,
    volumeKg: Math.round(volumeKg),
    sessions,
    stepsAvg,
    sleepAvgMin
  };
}

// src/lib/coach/sessionMatchScorer.ts
function normalizeTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9äöüß\s]/gi, " ").replace(/\s+/g, " ").trim();
}
function titlesSimilar(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t2) => t2.length > 2));
  const tb = new Set(nb.split(" ").filter((t2) => t2.length > 2));
  let hit = 0;
  for (const t2 of ta) if (tb.has(t2)) hit++;
  return hit >= Math.min(2, Math.min(ta.size, tb.size));
}
function exerciseKeysFromWorkout(w) {
  const keys = /* @__PURE__ */ new Set();
  for (const ex of w.exercises ?? []) {
    const k = String(ex.exerciseKey ?? ex.name ?? "").toLowerCase().trim();
    if (k) keys.add(k);
  }
  return keys;
}
function exerciseKeysFromPlanned(day) {
  const keys = /* @__PURE__ */ new Set();
  const exs = day.exercises;
  if (!Array.isArray(exs)) return keys;
  for (const ex of exs) {
    const k = String(ex.exerciseKey ?? ex.name ?? "").toLowerCase().trim();
    if (k) keys.add(k);
  }
  return keys;
}
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const k of a) if (b.has(k)) hit++;
  return hit / Math.max(a.size, b.size);
}
function inferSlotFromWorkout(w) {
  const meta = parseCoachSessionMeta(w.coachSessionMeta);
  if (meta?.sessionSlot) return meta.sessionSlot.toLowerCase();
  const notes = String(w.notes ?? "").toLowerCase();
  if (notes.includes("morning") || notes.includes("morgen")) return "morning";
  if (notes.includes("evening") || notes.includes("abend")) return "evening";
  const hour = w.completedAt ? new Date(w.completedAt).getHours() : null;
  if (hour != null) {
    if (hour < 12) return "morning";
    if (hour >= 17) return "evening";
  }
  return null;
}
var SCORE_THRESHOLD_MATCH = 0.5;
var SCORE_THRESHOLD_UNCERTAIN = 0.75;
function scoreWorkoutForPlannedDay(day, workout, sessionKey, matchOverrides) {
  if (matchOverrides?.[sessionKey] === workout.id) {
    return { workout, score: 1, method: "id", reasons: ["override"] };
  }
  const meta = parseCoachSessionMeta(workout.coachSessionMeta);
  if (meta?.sessionKey === sessionKey) {
    return { workout, score: 1, method: "id", reasons: ["coach_session_meta"] };
  }
  const title = String(day.title ?? day.sessionType ?? "Session");
  const plannedType = String(day.sessionType ?? "Strength").toLowerCase();
  const wType = String(workout.type ?? "").toLowerCase();
  let score = 0;
  const reasons = [];
  if (titlesSimilar(workout.name, title)) {
    score = Math.max(score, 0.62);
    reasons.push("title");
  }
  const plannedSlot = String(day.sessionSlot ?? "").toLowerCase();
  const wSlot = inferSlotFromWorkout(workout);
  if (plannedSlot && wSlot && plannedSlot === wSlot) {
    score += 0.22;
    reasons.push("slot");
  }
  if (plannedType && wType && (plannedType === wType || plannedType.includes(wType) || wType.includes(plannedType))) {
    score += plannedType === wType ? 0.22 : 0.12;
    reasons.push("type");
  }
  const plannedMin = Number(day.estimatedDuration) || 0;
  const actualMin = Number(workout.duration) || 0;
  if (plannedMin > 0 && actualMin > 0) {
    const ratio = actualMin / plannedMin;
    if (ratio >= 0.7 && ratio <= 1.35) {
      score += 0.1;
      reasons.push("duration");
    }
  }
  const exOverlap = overlapRatio(exerciseKeysFromPlanned(day), exerciseKeysFromWorkout(workout));
  if (exOverlap > 0) {
    score += Math.min(0.28, exOverlap * 0.35);
    reasons.push("exercises");
  }
  if (score < SCORE_THRESHOLD_MATCH) return null;
  return { workout, score, method: "scored", reasons };
}
function pickBestWorkoutMatch(day, candidates, sessionKey, matchOverrides) {
  let best = null;
  let secondScore = 0;
  for (const w of candidates) {
    const scored = scoreWorkoutForPlannedDay(day, w, sessionKey, matchOverrides);
    if (!scored) continue;
    if (!best || scored.score > best.score) {
      secondScore = best?.score ?? 0;
      best = scored;
    } else if (scored.score > secondScore) {
      secondScore = scored.score;
    }
  }
  if (!best) return { best: null, uncertain: false };
  const uncertain = best.method === "scored" && best.score < SCORE_THRESHOLD_UNCERTAIN && secondScore > 0 && best.score - secondScore < 0.12;
  return { best, uncertain };
}

// src/lib/coach/plannedSessionMatcher.ts
function matchWorkoutsToPlannedSessions(scheduleDays, startYmd, workouts, options) {
  const dateMap = buildCoachWeekDateMap(startYmd);
  const byDate = /* @__PURE__ */ new Map();
  for (const w of workouts) {
    const d = String(w.date).slice(0, 10);
    const list = byDate.get(d) ?? [];
    list.push(w);
    byDate.set(d, list);
  }
  const usedWorkoutIds = /* @__PURE__ */ new Set();
  const rows = [];
  const overrides = options?.matchOverrides;
  const slots = [];
  for (const day of scheduleDays) {
    if (day.isRest === true) continue;
    const dayName = String(day.day ?? "");
    slots.push({
      day,
      dayName,
      plannedDate: dateMap[dayName] ?? "",
      title: String(day.title ?? day.sessionType ?? "Session"),
      sessionType: String(day.sessionType ?? "Strength"),
      sessionKey: buildPlannedSessionKey(dayName, String(day.title ?? day.sessionType ?? "Session"), day.sessionSlot)
    });
  }
  const slotsByDate = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    const list = slotsByDate.get(slot.plannedDate) ?? [];
    list.push(slot);
    slotsByDate.set(slot.plannedDate, list);
  }
  const assignments = [];
  for (const [plannedDate, daySlots] of slotsByDate) {
    const candidates = (byDate.get(plannedDate) ?? []).filter((w) => !usedWorkoutIds.has(w.id));
    if (daySlots.length <= 1) {
      const slot = daySlots[0];
      if (!slot) continue;
      const { best, uncertain } = pickBestWorkoutMatch(slot.day, candidates, slot.sessionKey, overrides);
      if (best) {
        assignments.push({
          slot,
          workout: best.workout,
          score: best.score,
          uncertain,
          method: best.reasons.includes("override") ? "override" : best.method
        });
      } else {
        rows.push({
          plannedDay: slot.dayName,
          plannedDate: slot.plannedDate,
          title: slot.title,
          sessionType: slot.sessionType,
          sessionKey: slot.sessionKey,
          status: "missed"
        });
      }
      continue;
    }
    const pairs = [];
    for (const slot of daySlots) {
      for (const w of candidates) {
        const scored = scoreWorkoutForPlannedDay(slot.day, w, slot.sessionKey, overrides);
        if (!scored) continue;
        const { best: _b, uncertain } = pickBestWorkoutMatch(slot.day, [w], slot.sessionKey, overrides);
        pairs.push({
          slot,
          workout: w,
          score: scored.score,
          uncertain: uncertain && scored.method === "scored",
          method: scored.reasons.includes("override") ? "override" : scored.method
        });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const assignedSlots = /* @__PURE__ */ new Set();
    const assignedWorkouts = /* @__PURE__ */ new Set();
    for (const p of pairs) {
      if (assignedSlots.has(p.slot.sessionKey) || assignedWorkouts.has(p.workout.id)) continue;
      assignments.push(p);
      assignedSlots.add(p.slot.sessionKey);
      assignedWorkouts.add(p.workout.id);
    }
    for (const slot of daySlots) {
      if (!assignedSlots.has(slot.sessionKey)) {
        rows.push({
          plannedDay: slot.dayName,
          plannedDate: slot.plannedDate,
          title: slot.title,
          sessionType: slot.sessionType,
          sessionKey: slot.sessionKey,
          status: "missed"
        });
      }
    }
  }
  for (const a of assignments) {
    usedWorkoutIds.add(a.workout.id);
    const plannedMin = Number(a.slot.day.estimatedDuration) || 0;
    const actualMin = Number(a.workout.duration) || 0;
    const partial = plannedMin > 0 && actualMin > 0 && actualMin < plannedMin * 0.55;
    rows.push({
      plannedDay: a.slot.dayName,
      plannedDate: a.slot.plannedDate,
      title: a.slot.title,
      sessionType: a.slot.sessionType,
      sessionKey: a.slot.sessionKey,
      status: partial ? "partial" : "completed",
      matchedWorkoutId: a.workout.id,
      matchedWorkoutName: a.workout.name,
      matchedDurationMin: actualMin,
      matchScore: Math.round(a.score * 100) / 100,
      matchMethod: a.method,
      matchUncertain: a.uncertain
    });
  }
  for (const w of workouts) {
    if (usedWorkoutIds.has(w.id)) continue;
    rows.push({
      plannedDay: "",
      plannedDate: String(w.date).slice(0, 10),
      title: w.name,
      sessionType: w.type,
      sessionKey: "",
      status: "extra",
      matchedWorkoutId: w.id,
      matchedWorkoutName: w.name,
      matchedDurationMin: w.duration
    });
  }
  return rows;
}

// src/lib/coachNutritionSchedule.ts
var COACH_NUTRITION_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
var COACH_MEAL_SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"];
function normalizeNutritionMealSchedule(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const day = String(row.day || "").trim();
    if (!COACH_NUTRITION_WEEKDAYS.includes(day)) continue;
    const mealsIn = row.meals;
    if (!Array.isArray(mealsIn)) continue;
    const meals = [];
    for (const m of mealsIn) {
      if (!m || typeof m !== "object") continue;
      const typeRaw = String(m.type || "").toLowerCase();
      const type = COACH_MEAL_SLOT_TYPES.includes(typeRaw) ? typeRaw : null;
      if (!type) continue;
      const servings = Math.max(1, Math.min(12, Math.round(Number(m.servings) || 1)));
      meals.push({ type, servings });
    }
    if (meals.length > 0) out.push({ day, meals });
  }
  return out;
}
function legacyMealScheduleFromMealsPerDay(mealsPerDay) {
  const n = Math.max(2, Math.min(5, Math.round(mealsPerDay) || 3));
  const types = n <= 2 ? ["breakfast", "dinner"] : n === 3 ? ["breakfast", "lunch", "dinner"] : n === 4 ? ["breakfast", "lunch", "dinner", "snack"] : ["breakfast", "lunch", "snack", "dinner", "snack"];
  return COACH_NUTRITION_WEEKDAYS.map((day) => ({
    day,
    meals: types.slice(0, n).map((type) => ({ type, servings: 1 }))
  }));
}
function resolveNutritionMealSchedule(ob) {
  const normalized = normalizeNutritionMealSchedule(ob.mealSchedule);
  if (normalized.length > 0) return normalized;
  const mpd = Number(ob.mealsPerDay);
  if (Number.isFinite(mpd) && mpd >= 2) return legacyMealScheduleFromMealsPerDay(mpd);
  return legacyMealScheduleFromMealsPerDay(3);
}
function formatMealScheduleForCoachPrompt(schedule) {
  if (!schedule.length) return "No meal slots configured.";
  return schedule.map(
    (d) => `- ${d.day}: ${d.meals.map((m) => `${m.type} (${m.servings} ${m.servings === 1 ? "person" : "persons"})`).join(", ")}`
  ).join("\n");
}

// src/lib/coach/nutritionPlanSlots.ts
function normalizeMealType(raw) {
  const t2 = String(raw ?? "").toLowerCase();
  return COACH_MEAL_SLOT_TYPES.includes(t2) ? t2 : null;
}
function extractPlannedNutritionSlots(scheduleEnvelope, onboarding, startYmd) {
  const mealPlan = scheduleEnvelope.mealPlan;
  const dateMap = buildCoachWeekDateMap(startYmd);
  const slots = [];
  if (Array.isArray(mealPlan) && mealPlan.length > 0) {
    for (const dayRow of mealPlan) {
      if (!dayRow || typeof dayRow !== "object") continue;
      const day = String(dayRow.day ?? "").trim();
      const date = dateMap[day] ?? "";
      const meals = dayRow.meals;
      if (!Array.isArray(meals)) continue;
      for (const m of meals) {
        if (!m || typeof m !== "object") continue;
        const slot = normalizeMealType(m.type);
        if (!slot) continue;
        const calories = Number(m.calories);
        slots.push({
          day,
          date,
          slot,
          title: String(m.title ?? "").trim() || void 0,
          targetCalories: Number.isFinite(calories) && calories > 0 ? calories : void 0
        });
      }
    }
    if (slots.length > 0) return slots;
  }
  const fallback = resolveNutritionMealSchedule(onboarding);
  for (const dayPlan of fallback) {
    const date = dateMap[dayPlan.day] ?? "";
    for (const meal of dayPlan.meals) {
      slots.push({ day: dayPlan.day, date, slot: meal.type });
    }
  }
  return slots;
}
function matchNutritionSlotsToLogs(slots, entries) {
  const byDateCat = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const d = String(e.date).slice(0, 10);
    const k = `${d}:${e.category}`;
    const list = byDateCat.get(k) ?? [];
    list.push(e);
    byDateCat.set(k, list);
  }
  return slots.map((slot) => {
    const hits = byDateCat.get(`${slot.date}:${slot.slot}`) ?? [];
    if (hits.length === 0) {
      return { day: slot.day, date: slot.date, slot: slot.slot, status: "missed" };
    }
    const cals = hits.reduce((s, h) => s + h.calories, 0);
    const avgCals = Math.round(cals / hits.length);
    if (slot.targetCalories && slot.targetCalories > 0) {
      const ratio = avgCals / slot.targetCalories;
      if (ratio < 0.75 || ratio > 1.25) {
        return {
          day: slot.day,
          date: slot.date,
          slot: slot.slot,
          status: "partial",
          calories: avgCals,
          targetCalories: slot.targetCalories
        };
      }
    }
    return {
      day: slot.day,
      date: slot.date,
      slot: slot.slot,
      status: "logged",
      calories: avgCals,
      targetCalories: slot.targetCalories
    };
  });
}

// src/lib/coach/athleteWeekSnapshot.ts
function topPrsFromWorkouts(workouts, limit = 5) {
  const prs = [];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const e1 = bestE1rmForExercise(ex);
      if (e1 > 0) prs.push({ exercise: ex.name, e1rmKg: e1 });
    }
  }
  return prs.sort((a, b) => b.e1rmKg - a.e1rmKg).slice(0, limit);
}
function nutritionSlotRows(scheduleEnvelope, onboarding, startYmd, entries) {
  const slots = extractPlannedNutritionSlots(scheduleEnvelope, onboarding, startYmd);
  return matchNutritionSlotsToLogs(slots, entries);
}
function buildAthleteWeekSnapshot(params) {
  const endYmd = coachWeekInclusiveEnd(params.startYmd);
  const flags = [];
  if (params.planType === "workout") {
    const scheduleDays = params.scheduleEnvelope.schedule ?? [];
    const rows = matchWorkoutsToPlannedSessions(scheduleDays, params.startYmd, params.workouts, {
      matchOverrides: params.matchOverrides
    });
    const planned2 = rows.filter((r) => r.status !== "extra").length;
    const completed2 = rows.filter((r) => r.status === "completed" || r.status === "partial").length;
    const completionRate2 = planned2 > 0 ? Math.round(completed2 / planned2 * 100) : params.workouts.length > 0 ? 100 : 0;
    let totalVolumeKg = 0;
    for (const w of params.workouts) totalVolumeKg += strengthVolumeForWorkout(w);
    const volumeWoWDeltaPct = params.prevWeekVolumeKg != null && params.prevWeekVolumeKg > 0 ? Math.round((totalVolumeKg - params.prevWeekVolumeKg) / params.prevWeekVolumeKg * 100) : null;
    const fatigue = computeWeeklyFatigue(params.workouts, {
      refDate: /* @__PURE__ */ new Date(`${endYmd}T23:59:59`),
      stepsByDate: params.profile.dailyActivityLog?.stepsByDate,
      sleepByDate: params.profile.dailyActivityLog?.sleepByDate
    });
    if (completionRate2 < 60) flags.push("low_adherence");
    if (fatigue.labelKey === "fatigue.critical" || fatigue.labelKey === "fatigue.high") {
      flags.push("high_fatigue");
    }
    if (rows.filter((r) => r.status === "missed").length >= 2) flags.push("missed_sessions");
    if (rows.some((r) => r.status === "extra")) flags.push("unplanned_sessions");
    if (rows.some((r) => r.matchUncertain)) flags.push("ambiguous_matches");
    return {
      weekNumber: params.weekNumber,
      windowStart: params.startYmd,
      windowEnd: endYmd,
      planType: "workout",
      adherence: {
        plannedUnits: planned2,
        completedUnits: completed2,
        completionRate: completionRate2,
        workoutRows: rows
      },
      training: {
        totalVolumeKg: Math.round(totalVolumeKg),
        volumeWoWDeltaPct,
        avgRpe: fatigue.avgRpe,
        fatigueScore: fatigue.score,
        fatigueLabelKey: fatigue.labelKey,
        sessionsLogged: params.workouts.length,
        topPrs: topPrsFromWorkouts(params.workouts)
      },
      flags
    };
  }
  const slotRows = nutritionSlotRows(
    params.scheduleEnvelope,
    params.onboarding ?? {},
    params.startYmd,
    params.nutrition
  );
  const planned = slotRows.length;
  const completed = slotRows.filter((r) => r.status === "logged" || r.status === "partial").length;
  const completionRate = planned > 0 ? Math.round(completed / planned * 100) : 0;
  const dailyTargets = params.scheduleEnvelope.dailyTargets;
  const targetCalories = dailyTargets?.calories != null && dailyTargets.calories > 0 ? dailyTargets.calories : params.profile.goals?.dailyCalories ?? null;
  const targetProtein = dailyTargets?.protein != null && dailyTargets.protein > 0 ? dailyTargets.protein : params.profile.goals?.macros?.protein ?? null;
  const avgCalories = params.nutrition.length > 0 ? Math.round(
    params.nutrition.reduce((s, e) => s + e.calories, 0) / Math.max(1, params.nutrition.length)
  ) : 0;
  const avgProtein = params.nutrition.length > 0 ? Math.round(
    params.nutrition.reduce((s, e) => s + (e.protein ?? 0), 0) / Math.max(1, params.nutrition.length)
  ) : 0;
  const daysWithLogs = new Set(params.nutrition.map((e) => String(e.date).slice(0, 10))).size;
  const calorieAdherencePct = targetCalories && avgCalories > 0 ? Math.round(avgCalories / targetCalories * 100) : null;
  if (completionRate < 50) flags.push("low_meal_logging");
  if (calorieAdherencePct != null && (calorieAdherencePct < 85 || calorieAdherencePct > 115)) {
    flags.push("calorie_off_target");
  }
  return {
    weekNumber: params.weekNumber,
    windowStart: params.startYmd,
    windowEnd: endYmd,
    planType: "nutrition",
    adherence: {
      plannedUnits: planned,
      completedUnits: completed,
      completionRate,
      nutritionRows: slotRows
    },
    nutrition: {
      entriesLogged: params.nutrition.length,
      daysWithLogs,
      avgCalories,
      avgProtein,
      targetCalories,
      targetProtein,
      calorieAdherencePct
    },
    flags
  };
}

// src/lib/coach/periodizationEngine.ts
function clampRating(n) {
  return Math.max(1, Math.min(10, Math.round(n)));
}
function deriveOverallRating(snapshot, completionRate) {
  let score = completionRate / 10;
  if (snapshot.training?.fatigueLabelKey === "fatigue.critical") score -= 2;
  else if (snapshot.training?.fatigueLabelKey === "fatigue.high") score -= 1;
  if (snapshot.flags.includes("low_adherence") || snapshot.flags.includes("low_meal_logging")) score -= 1;
  if ((snapshot.training?.topPrs.length ?? 0) > 0 && completionRate >= 70) score += 0.5;
  if (snapshot.nutrition?.calorieAdherencePct != null) {
    const dev = Math.abs(snapshot.nutrition.calorieAdherencePct - 100);
    if (dev > 20) score -= 0.5;
  }
  return clampRating(score);
}
function pickRecommendation(snapshot, state, weeksUntilEvent) {
  const rate2 = snapshot.adherence.completionRate;
  if (weeksUntilEvent != null && weeksUntilEvent <= 2) return "reduce_volume";
  if (state.deloadNextWeek || state.phase === "deload") return "deload";
  if (snapshot.flags.includes("high_fatigue") || snapshot.training?.fatigueLabelKey === "fatigue.critical") {
    return rate2 < 50 ? "deload" : "reduce_volume";
  }
  if (rate2 < 55) return "reduce_volume";
  if (rate2 >= 88 && !snapshot.flags.includes("high_fatigue")) {
    if (state.weekInBlock >= state.blockLength - 1) return "deload";
    return "increase_volume";
  }
  return "continue";
}
function computeWeekDirective(params) {
  const { snapshot, planState } = params;
  const completionRate = snapshot.adherence.completionRate;
  const recommendation = pickRecommendation(snapshot, planState, params.weeksUntilEvent ?? null);
  const taperWeek = (params.weeksUntilEvent ?? 99) <= 2;
  let volumeMultiplier = planState.volumeMultiplier;
  let intensityTargetRpe = planState.intensityTargetRpe;
  const bullets = [];
  const progressionNotes = [];
  if (recommendation === "deload") {
    volumeMultiplier = 0.6;
    intensityTargetRpe = Math.max(5, intensityTargetRpe - 2);
    bullets.push("Deload week: reduce total sets by ~40% and keep technique crisp.");
  } else if (recommendation === "reduce_volume") {
    volumeMultiplier = Math.max(0.75, volumeMultiplier * 0.88);
    intensityTargetRpe = Math.max(6, intensityTargetRpe - 1);
    bullets.push("Reduce weekly volume ~10\u201315% until adherence and recovery improve.");
  } else if (recommendation === "increase_volume") {
    volumeMultiplier = Math.min(1.12, volumeMultiplier * 1.08);
    intensityTargetRpe = Math.min(8, intensityTargetRpe + 0.5);
    bullets.push("Progression week: add ~5\u20138% volume on primary lifts if sessions felt manageable.");
  } else {
    bullets.push("Maintain structure; fix weak adherence days before adding load.");
  }
  if (taperWeek) {
    volumeMultiplier = 0.55;
    intensityTargetRpe = 6;
    bullets.push("Event taper: short, sharp sessions; no new soreness.");
  }
  const hardFeedback = (planState.sessionFeedback ?? []).filter((f) => f.rating === "hard").length;
  if (hardFeedback >= 2 && snapshot.planType === "workout") {
    volumeMultiplier = Math.min(volumeMultiplier, planState.volumeMultiplier * 0.92);
    bullets.push("Multiple sessions felt too hard \u2014 keep load steady before adding volume.");
  }
  if (snapshot.planType === "nutrition" && snapshot.flags.includes("low_meal_logging")) {
    bullets.push("Log each planned meal slot this week so adherence can be measured.");
  }
  if (snapshot.planType === "nutrition" && snapshot.flags.includes("calorie_off_target")) {
    bullets.push("Align daily calories with the generated week targets (\xB115%).");
  }
  if (snapshot.planType === "workout" && snapshot.training) {
    if (snapshot.training.volumeWoWDeltaPct != null) {
      progressionNotes.push(`Volume WoW: ${snapshot.training.volumeWoWDeltaPct > 0 ? "+" : ""}${snapshot.training.volumeWoWDeltaPct}%`);
    }
    if (snapshot.training.avgRpe != null) {
      progressionNotes.push(`Average logged RPE: ${snapshot.training.avgRpe}`);
    }
    for (const pr of snapshot.training.topPrs.slice(0, 3)) {
      progressionNotes.push(`PR estimate: ${pr.exercise} ~${pr.e1rmKg} kg e1RM`);
    }
  }
  if (snapshot.planType === "nutrition" && snapshot.nutrition) {
    if (snapshot.nutrition.calorieAdherencePct != null) {
      progressionNotes.push(`Calorie adherence vs target: ${snapshot.nutrition.calorieAdherencePct}%`);
    }
    progressionNotes.push(`Logged ${snapshot.nutrition.entriesLogged} meals across ${snapshot.nutrition.daysWithLogs} days`);
  }
  return {
    recommendation,
    completionRate,
    volumeMultiplier: Math.round(volumeMultiplier * 100) / 100,
    intensityTargetRpe: Math.round(intensityTargetRpe * 10) / 10,
    deloadWeek: recommendation === "deload",
    taperWeek,
    overallRating: deriveOverallRating(snapshot, completionRate),
    coachDirectiveBullets: bullets,
    progressionNotes
  };
}
function advancePlanStateAfterWeek(state, directive, weekNumber) {
  let phase = state.phase;
  let weekInBlock = state.weekInBlock + 1;
  const blockLength = state.blockLength;
  if (weekNumber === 1) {
    phase = "baseline";
    weekInBlock = 1;
  } else if (directive.deloadWeek) {
    phase = "deload";
    weekInBlock = 1;
  } else if (directive.recommendation === "increase_volume" && phase === "baseline") {
    phase = "accumulation";
  } else if (weekInBlock > blockLength) {
    phase = directive.recommendation === "increase_volume" ? "intensification" : "accumulation";
    weekInBlock = 1;
  }
  let nutritionMacroMultiplier = state.nutritionMacroMultiplier;
  if (directive.recommendation === "reduce_volume" || directive.deloadWeek) {
    nutritionMacroMultiplier = Math.max(0.9, nutritionMacroMultiplier * 0.97);
  } else if (directive.recommendation === "increase_volume") {
    nutritionMacroMultiplier = Math.min(1.08, nutritionMacroMultiplier * 1.02);
  }
  return {
    ...state,
    phase,
    weekInBlock,
    blockLength,
    volumeMultiplier: directive.volumeMultiplier,
    intensityTargetRpe: directive.intensityTargetRpe,
    deloadNextWeek: weekInBlock >= blockLength && directive.recommendation !== "deload",
    nutritionMacroMultiplier,
    lastRecommendation: directive.recommendation
  };
}

// src/lib/coach/coachDbMappers.ts
function mapWorkoutRow(row) {
  const metaRaw = row.coach_session_meta;
  const coachSessionMeta = parseCoachSessionMeta(metaRaw) ?? void 0;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    type: row.type || "Other",
    subtype: row.subtype,
    duration: Number(row.duration) || 0,
    caloriesBurned: Number(row.calories_burned) || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date).slice(0, 10),
    exercises: row.exercises || [],
    notes: String(row.notes ?? ""),
    shared: Boolean(row.shared),
    coachSessionMeta,
    feedback: row.coach_session_feedback != null ? String(row.coach_session_feedback) : void 0
  };
}
function mapNutritionRow(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    meal: String(row.meal ?? ""),
    category: row.category || "snack",
    calories: Number(row.calories) || 0,
    protein: Number(row.protein) || 0,
    carbs: Number(row.carbs) || 0,
    fat: Number(row.fat) || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date).slice(0, 10),
    ingredients: row.ingredients || []
  };
}

// src/lib/coach/weeklyReportBuilder.ts
function computeWeeklyReportFacts(params) {
  const snapshot = buildAthleteWeekSnapshot({
    planType: params.planType,
    weekNumber: params.weekNumber,
    startYmd: params.startYmd,
    scheduleEnvelope: params.scheduleEnvelope,
    workouts: params.workouts,
    nutrition: params.nutrition,
    profile: params.profile,
    onboarding: params.onboarding,
    prevWeekVolumeKg: params.prevWeekVolumeKg,
    matchOverrides: params.planState.sessionMatchOverrides
  });
  const directive = computeWeekDirective({
    snapshot,
    planState: params.planState,
    weeksUntilEvent: params.weeksUntilEvent
  });
  const nextState = advancePlanStateAfterWeek(params.planState, directive, params.weekNumber);
  return {
    overallRating: directive.overallRating,
    completionRate: directive.completionRate,
    recommendation: directive.recommendation,
    snapshot,
    directive,
    planState: nextState
  };
}
function mergeNarrativeWithFacts(facts, narrative) {
  return {
    overallRating: facts.overallRating,
    completionRate: facts.completionRate,
    recommendation: facts.recommendation,
    coachMessage: narrative.coachMessage ?? "",
    summary: narrative.summary ?? "",
    performanceHighlights: narrative.performanceHighlights ?? [],
    areasToImprove: narrative.areasToImprove ?? [],
    weekOverWeekComparison: narrative.weekOverWeekComparison,
    nextWeekStrategy: narrative.nextWeekStrategy ?? "",
    nextWeekChanges: narrative.nextWeekChanges ?? [],
    factsSnapshot: facts.snapshot,
    weekDirective: facts.directive
  };
}
async function loadPrevWeekVolumeKg(pool2, userId, prevStartYmd, prevEndYmd) {
  const res = await pool2.query(
    `SELECT exercises FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
    [userId, prevStartYmd, prevEndYmd]
  );
  let vol = 0;
  for (const row of res.rows) {
    vol += strengthVolumeForWorkout(mapWorkoutRow(row));
  }
  return vol;
}
async function persistPlanStateAfterReport(pool2, planId, state) {
  await saveCoachPlanState(pool2, planId, state);
}

// src/lib/coach/coachWeeklyReportService.ts
var narrativeOnlySchema = weeklyReportSchema.omit({
  overallRating: true,
  completionRate: true,
  recommendation: true
});
async function generateCoachWeeklyReport(params) {
  const weekNumber = params.weekNumber ?? params.plan.current_week;
  const startYmd = params.scheduleRow.start_date != null ? String(
    params.scheduleRow.start_date instanceof Date ? params.scheduleRow.start_date.toISOString().split("T")[0] : params.scheduleRow.start_date
  ).split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const endYmd = coachWeekInclusiveEnd(startYmd);
  const prevStart = addDaysYmd(startYmd, -7);
  const prevEnd = addDaysYmd(startYmd, -1);
  const [workoutsRes, nutritionRes, planState, prevVol] = await Promise.all([
    params.pool.query(`SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd
    ]),
    params.pool.query(`SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd
    ]),
    loadCoachPlanState(params.pool, params.plan.id),
    params.plan.type === "workout" ? loadPrevWeekVolumeKg(params.pool, params.userId, prevStart, prevEnd) : Promise.resolve(0)
  ]);
  const workouts = workoutsRes.rows.map((r) => mapWorkoutRow(r));
  const nutrition = nutritionRes.rows.map((r) => mapNutritionRow(r));
  const weeksUntilEvent = params.plan.event_date ? Math.round(
    (new Date(String(params.plan.event_date)).getTime() - Date.now()) / (7 * 24 * 3600 * 1e3)
  ) : null;
  const facts = computeWeeklyReportFacts({
    planType: params.plan.type === "nutrition" ? "nutrition" : "workout",
    weekNumber,
    startYmd,
    scheduleEnvelope: params.scheduleRow.schedule ?? {},
    workouts,
    nutrition,
    profile: params.profile,
    onboarding: params.onboarding,
    planState,
    weeksUntilEvent,
    prevWeekVolumeKg: prevVol
  });
  await persistPlanStateAfterReport(params.pool, params.plan.id, facts.planState);
  const factsBlock = formatReportFactsForNarrative(facts, params.prevReport);
  let rawLast = "";
  let narrative = null;
  let retries = 0;
  let repair = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    retries = attempt;
    const prompt = buildCoachWeeklyReportNarrativePrompt({
      outputLanguage: params.outputLanguage,
      reportFactsBlock: factsBlock,
      lockedRecommendation: facts.recommendation
    }) + (repair ? `

JSON repair: ${repair}` : "");
    rawLast = await params.callAi([{ role: "user", content: prompt }]);
    try {
      const parsed = parseJsonLoose(rawLast);
      const z8 = narrativeOnlySchema.safeParse(parsed);
      if (!z8.success) {
        repair = z8.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      narrative = z8.data;
      break;
    } catch (e) {
      repair = e instanceof Error ? e.message : String(e);
    }
  }
  if (!narrative) {
    narrative = {
      coachMessage: `Week ${weekNumber}: ${facts.completionRate}% adherence. Recommendation: ${facts.recommendation}.`,
      summary: "Automated fallback narrative \u2014 refine after more logged sessions.",
      performanceHighlights: facts.snapshot.training?.topPrs.length ? facts.snapshot.training.topPrs.map((p) => `${p.exercise}: ~${p.e1rmKg} kg e1RM`) : ["None this week"],
      areasToImprove: facts.snapshot.flags.length ? facts.snapshot.flags : ["Log all sessions consistently"],
      weekOverWeekComparison: params.prevReport ? `Previous completion: ${params.prevReport.completionRate}%` : "No previous data.",
      nextWeekStrategy: facts.directive.coachDirectiveBullets.join(" "),
      nextWeekChanges: facts.directive.coachDirectiveBullets
    };
  }
  const report = mergeNarrativeWithFacts(facts, narrative);
  return { report, rawLast, retries };
}

// src/lib/weeklyReport/buildUserWeekFacts.ts
import { format as format7 } from "date-fns";

// src/lib/weeklyReport/weekWindow.ts
import { addDays, format as format6, startOfWeek as startOfWeek2, subWeeks } from "date-fns";
import { de as dfDe, enUS as dfEnUS } from "date-fns/locale";
function getCompletedWeekRangeAtOffset(weeksAgo = 0, refDate = /* @__PURE__ */ new Date()) {
  const currentWeekStart = startOfWeek2(refDate, { weekStartsOn: 1 });
  const weekStart = subWeeks(currentWeekStart, 1 + weeksAgo);
  const weekEnd = addDays(weekStart, 6);
  const weekStartYmd = format6(weekStart, "yyyy-MM-dd");
  const weekEndYmd = format6(weekEnd, "yyyy-MM-dd");
  return {
    weekStart,
    weekEnd,
    weekStartYmd,
    weekEndYmd,
    weekKey: weekStartYmd
  };
}
function getLastCompletedWeekRange(refDate = /* @__PURE__ */ new Date()) {
  return getCompletedWeekRangeAtOffset(0, refDate);
}
function formatWeekLabel(weekStartYmd, weekEndYmd, locale = "de") {
  const loc = locale === "de" ? dfDe : dfEnUS;
  const start = /* @__PURE__ */ new Date(`${weekStartYmd}T12:00:00`);
  const end = /* @__PURE__ */ new Date(`${weekEndYmd}T12:00:00`);
  return `${format6(start, "d. MMM", { locale: loc })} \u2013 ${format6(end, "d. MMM yyyy", { locale: loc })}`;
}
function canGenerateLastWeekReport(refDate = /* @__PURE__ */ new Date()) {
  const { weekEnd } = getLastCompletedWeekRange(refDate);
  const endOfLastWeek = /* @__PURE__ */ new Date(`${format6(weekEnd, "yyyy-MM-dd")}T23:59:59`);
  return refDate.getTime() > endOfLastWeek.getTime();
}

// src/lib/weeklyReport/buildUserWeekFacts.ts
function ymd(d) {
  if (typeof d === "string") return d.split("T")[0];
  return format7(d, "yyyy-MM-dd");
}
function inRange(dateStr, startYmd, endYmd) {
  return dateStr >= startYmd && dateStr <= endYmd;
}
function detectWeekRecords(allWorkouts, weekStartYmd, weekEndYmd) {
  const during = allWorkouts.filter((w) => inRange(ymd(w.date), weekStartYmd, weekEndYmd));
  const before = allWorkouts.filter((w) => ymd(w.date) < weekStartYmd);
  const names = /* @__PURE__ */ new Set();
  for (const w of [...during, ...before]) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name?.trim() || isCardioExercise(ex)) continue;
      if (strengthSetsForStats(ex).length === 0) continue;
      names.add(ex.name.trim());
    }
  }
  const out = [];
  for (const name of names) {
    let bestDuring = 0;
    let bestBefore = 0;
    for (const w of during) {
      for (const ex of w.exercises ?? []) {
        if (ex.name.trim() !== name) continue;
        bestDuring = Math.max(bestDuring, bestE1rmForExercise(ex));
      }
    }
    for (const w of before) {
      for (const ex of w.exercises ?? []) {
        if (ex.name.trim() !== name) continue;
        bestBefore = Math.max(bestBefore, bestE1rmForExercise(ex));
      }
    }
    if (bestDuring <= 0) continue;
    const isNew = bestDuring > bestBefore + 0.5;
    out.push({
      exercise: name,
      metric: "e1RM",
      value: `${Math.round(bestDuring * 10) / 10} kg`,
      isNewThisWeek: isNew
    });
  }
  return out.sort((a, b) => a.isNewThisWeek === b.isNewThisWeek ? 0 : a.isNewThisWeek ? -1 : 1).slice(0, 12);
}
function buildUserWeekFacts(params) {
  const locale = params.locale ?? (params.profile.uiLocale === "en" ? "en" : "de");
  const { weekStartYmd, weekEndYmd } = params;
  const weekStart = /* @__PURE__ */ new Date(`${weekStartYmd}T12:00:00`);
  const weekWorkouts = params.allWorkouts.filter((w) => inRange(ymd(w.date), weekStartYmd, weekEndYmd));
  const weekNutrition = params.allNutrition.filter((n) => inRange(ymd(n.date), weekStartYmd, weekEndYmd));
  const prevStart = format7(new Date(weekStart.getTime() - 7 * 864e5), "yyyy-MM-dd");
  const prevEnd = format7(new Date(weekStart.getTime() - 864e5), "yyyy-MM-dd");
  const prevWorkouts = params.allWorkouts.filter((w) => inRange(ymd(w.date), prevStart, prevEnd));
  let totalVolumeKg = 0;
  let totalDurationMin = 0;
  let caloriesBurned = 0;
  let cardioMinutes = 0;
  let cardioSessions = 0;
  const volumeByEx = /* @__PURE__ */ new Map();
  for (const w of weekWorkouts) {
    totalDurationMin += w.duration ?? 0;
    caloriesBurned += w.caloriesBurned ?? 0;
    totalVolumeKg += strengthVolumeForWorkout(w);
    for (const ex of w.exercises ?? []) {
      if (isCardioExercise(ex)) {
        const c = cardioSummaryFromExercise(ex);
        if (c.durationMin > 0) {
          cardioMinutes += c.durationMin;
          cardioSessions += 1;
        }
        continue;
      }
      const vol = strengthVolumeForWorkout({ ...w, exercises: [ex] });
      if (vol > 0) {
        const k = ex.name.trim();
        volumeByEx.set(k, (volumeByEx.get(k) ?? 0) + vol);
      }
    }
  }
  let prevWeekVolumeKg = 0;
  for (const w of prevWorkouts) prevWeekVolumeKg += strengthVolumeForWorkout(w);
  const volumeDeltaPct = prevWeekVolumeKg > 0 ? Math.round((totalVolumeKg - prevWeekVolumeKg) / prevWeekVolumeKg * 100) : null;
  const fatigue = computeWeeklyFatigue(weekWorkouts, {
    refDate: /* @__PURE__ */ new Date(`${weekEndYmd}T23:59:59`),
    stepsByDate: params.profile.dailyActivityLog?.stepsByDate,
    sleepByDate: params.profile.dailyActivityLog?.sleepByDate
  });
  const dailyTarget = params.profile.goals?.dailyCalories ?? 2400;
  const energy = computeWeeklyEnergyBalance(weekWorkouts, weekNutrition, weekStart, dailyTarget);
  const nutDays = new Set(weekNutrition.map((n) => ymd(n.date)));
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  for (const n of weekNutrition) {
    const t2 = effectiveNutritionTotals(n);
    totalKcal += t2.calories;
    totalProtein += t2.protein ?? 0;
    totalCarbs += t2.carbs ?? 0;
    totalFat += t2.fat ?? 0;
  }
  const daysLogged = nutDays.size;
  const avgKcal = daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0;
  const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;
  const targetProtein = params.profile.goals?.macros?.protein ?? 0;
  const stepsMap = params.profile.dailyActivityLog?.stepsByDate ?? {};
  const sleepMap = params.profile.dailyActivityLog?.sleepByDate ?? {};
  let stepSum = 0;
  let stepDays = 0;
  let sleepMinSum = 0;
  let sleepDays = 0;
  for (let d = /* @__PURE__ */ new Date(`${weekStartYmd}T12:00:00`); d <= /* @__PURE__ */ new Date(`${weekEndYmd}T12:00:00`); d.setDate(d.getDate() + 1)) {
    const ds = format7(d, "yyyy-MM-dd");
    const st = stepsMap[ds];
    if (st != null && st > 0) {
      stepSum += st;
      stepDays += 1;
    }
    const sl = sleepMap[ds];
    if (sl?.totalMinutes != null && sl.totalMinutes > 0) {
      sleepMinSum += sl.totalMinutes;
      sleepDays += 1;
    }
  }
  const weightHist = resolveWeightHistoryForProfile(params.profile);
  const weekWeights = weightHist.filter((e) => inRange(e.date, weekStartYmd, weekEndYmd));
  const beforeWeights = weightHist.filter((e) => ymd(e.date) < weekStartYmd);
  const currentWeight = weekWeights.length > 0 ? weekWeights[weekWeights.length - 1].weight : beforeWeights.length > 0 ? beforeWeights[beforeWeights.length - 1].weight : params.profile.measurements?.weight ?? null;
  const startWeight = weekWeights.length > 0 ? weekWeights[0].weight : null;
  const weightDeltaWeekKg = currentWeight != null && startWeight != null ? Math.round((currentWeight - startWeight) * 10) / 10 : null;
  const activePlans = (params.coachPlans ?? []).filter((p) => p.status === "active");
  const flags = [];
  if (weekWorkouts.length === 0) flags.push("no_workouts");
  if (daysLogged < 3) flags.push("low_nutrition_logging");
  if (fatigue.labelKey === "fatigue.high" || fatigue.labelKey === "fatigue.critical") flags.push("high_fatigue");
  return {
    weekLabel: formatWeekLabel(weekStartYmd, weekEndYmd, locale),
    weekStart: weekStartYmd,
    weekEnd: weekEndYmd,
    locale,
    profile: {
      displayName: params.profile.displayName ?? null,
      goalType: params.profile.goals?.type ?? null,
      goalWeightKg: params.profile.goals?.targetWeightKg ?? params.profile.goals?.targetWeight ?? null,
      currentWeightKg: currentWeight,
      weightDeltaWeekKg,
      dailyCalories: dailyTarget,
      dailyProtein: targetProtein,
      dailySteps: params.profile.goals?.dailySteps ?? 1e4
    },
    activity: {
      workoutSessions: weekWorkouts.length,
      nutritionLogDays: daysLogged,
      avgSteps: stepDays > 0 ? Math.round(stepSum / stepDays) : 0,
      avgSleepHours: sleepDays > 0 ? Math.round(sleepMinSum / sleepDays / 60 * 10) / 10 : null,
      workoutStreak: getWorkoutStreak(params.allWorkouts),
      nutritionStreak: getNutritionStreak(params.allNutrition)
    },
    training: {
      totalVolumeKg: Math.round(totalVolumeKg),
      prevWeekVolumeKg: Math.round(prevWeekVolumeKg),
      volumeDeltaPct,
      totalDurationMin,
      caloriesBurned: Math.round(caloriesBurned),
      avgRpe: fatigue.avgRpe,
      fatigueScore: fatigue.score,
      fatigueLabelKey: fatigue.labelKey,
      topExercisesByVolume: [...volumeByEx.entries()].map(([name, volumeKg]) => ({ name, volumeKg: Math.round(volumeKg) })).sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 8),
      cardioMinutes: Math.round(cardioMinutes),
      cardioSessions
    },
    nutrition: {
      daysLogged,
      totalKcal,
      avgKcalPerDay: avgKcal,
      avgProteinPerDay: avgProtein,
      avgCarbsPerDay: daysLogged > 0 ? Math.round(totalCarbs / daysLogged) : 0,
      avgFatPerDay: daysLogged > 0 ? Math.round(totalFat / daysLogged) : 0,
      targetKcal: dailyTarget,
      targetProtein,
      calorieAdherencePct: avgKcal > 0 ? Math.round(avgKcal / dailyTarget * 100) : null,
      proteinAdherencePct: targetProtein > 0 && avgProtein > 0 ? Math.round(avgProtein / targetProtein * 100) : null,
      weeklyNetKcal: Math.round(energy.weeklyNetKcal),
      projectedKgPerWeek: Math.round(energy.projectedKgDelta * 100) / 100,
      estimateReliable: energy.estimateReliable
    },
    records: detectWeekRecords(params.allWorkouts, weekStartYmd, weekEndYmd),
    coachPlans: {
      activeCount: activePlans.length,
      disciplines: activePlans.map((p) => p.discipline ?? "").filter(Boolean)
    },
    flags
  };
}
function formatFactsForPrompt(facts) {
  return JSON.stringify(facts, null, 2);
}

// src/lib/weeklyReport/buildFallbackUserWeeklyReport.ts
function t(facts, de, en) {
  return facts.locale === "en" ? en : de;
}
function buildFallbackUserWeeklyReport(facts) {
  const name = facts.profile.displayName?.trim() || t(facts, "Athlet", "Athlete");
  const volDelta = facts.training.volumeDeltaPct != null ? `${facts.training.volumeDeltaPct > 0 ? "+" : ""}${facts.training.volumeDeltaPct}%` : t(facts, "kein Vergleich", "no comparison");
  const records = facts.records.filter((r) => r.isNewThisWeek).length > 0 ? facts.records.filter((r) => r.isNewThisWeek).map((r) => ({
    title: r.exercise,
    detail: `${r.metric}: ${r.value}`,
    isNew: true
  })) : [
    {
      title: t(facts, "Keine neuen Kraft-Rekorde", "No new strength PRs"),
      detail: t(
        facts,
        "Diese Woche war stabil \u2014 n\xE4chste Woche liegt Fokus auf progressiver \xDCberladung.",
        "A stable week \u2014 focus on progressive overload next week."
      ),
      isNew: false
    }
  ];
  return {
    weekLabel: facts.weekLabel,
    weekStart: facts.weekStart,
    weekEnd: facts.weekEnd,
    locale: facts.locale,
    personalReport: {
      headline: t(facts, `${name}, deine Woche in Review`, `${name}, your week in review`),
      intro: t(
        facts,
        `Deine Woche ${facts.weekLabel} auf einen Blick \u2014 ${facts.activity.workoutSessions} Sessions, ${facts.nutrition.daysLogged} Ern\xE4hrungstage geloggt.`,
        `Your week ${facts.weekLabel} at a glance \u2014 ${facts.activity.workoutSessions} sessions, ${facts.nutrition.daysLogged} nutrition days logged.`
      ),
      keyMetrics: [
        {
          label: t(facts, "Trainingseinheiten", "Workouts"),
          value: String(facts.activity.workoutSessions),
          hint: t(facts, `Streak: ${facts.activity.workoutStreak}`, `Streak: ${facts.activity.workoutStreak}`),
          tone: facts.activity.workoutSessions >= 3 ? "positive" : "neutral"
        },
        {
          label: t(facts, "Volumen", "Volume"),
          value: `${facts.training.totalVolumeKg} kg`,
          hint: volDelta,
          tone: "neutral"
        },
        {
          label: t(facts, "\xD8 kcal/Tag", "Avg kcal/day"),
          value: String(facts.nutrition.avgKcalPerDay),
          hint: t(facts, `Ziel ${facts.nutrition.targetKcal}`, `Target ${facts.nutrition.targetKcal}`),
          tone: facts.nutrition.calorieAdherencePct != null && facts.nutrition.calorieAdherencePct >= 85 ? "positive" : "attention"
        },
        {
          label: t(facts, "\xD8 Protein", "Avg protein"),
          value: `${facts.nutrition.avgProteinPerDay} g`,
          hint: t(facts, `Ziel ${facts.nutrition.targetProtein} g`, `Target ${facts.nutrition.targetProtein} g`),
          tone: facts.nutrition.proteinAdherencePct != null && facts.nutrition.proteinAdherencePct >= 85 ? "positive" : "attention"
        },
        {
          label: t(facts, "Schritte \xD8", "Avg steps"),
          value: facts.activity.avgSteps.toLocaleString(),
          hint: t(facts, `Ziel ${facts.profile.dailySteps}`, `Goal ${facts.profile.dailySteps}`),
          tone: facts.activity.avgSteps >= facts.profile.dailySteps * 0.9 ? "positive" : "neutral"
        },
        {
          label: t(facts, "Wochen-Prognose", "Weekly outlook"),
          value: `${facts.nutrition.projectedKgPerWeek} kg`,
          hint: t(facts, `Netto ${facts.nutrition.weeklyNetKcal} kcal`, `Net ${facts.nutrition.weeklyNetKcal} kcal`),
          tone: facts.profile.goalType === "lose" && facts.nutrition.weeklyNetKcal < 0 ? "positive" : "neutral"
        }
      ],
      sections: [
        {
          title: t(facts, "Was gut lief", "What went well"),
          bullets: [
            facts.activity.workoutSessions > 0 ? t(facts, `${facts.activity.workoutSessions} Sessions \u2014 Konstanz z\xE4hlt.`, `${facts.activity.workoutSessions} sessions \u2014 consistency counts.`) : t(facts, "Ruhewoche \u2014 nutze sie bewusst f\xFCr Regeneration.", "Recovery week \u2014 use it deliberately."),
            facts.nutrition.daysLogged >= 5 ? t(facts, `${facts.nutrition.daysLogged} Tage Ern\xE4hrung geloggt \u2014 solides Tracking.`, `${facts.nutrition.daysLogged} nutrition days logged \u2014 solid tracking.`) : t(facts, "Mehr Food-Logs geben dir sch\xE4rfere Steuerung.", "More food logs sharpen your control."),
            facts.records.filter((r) => r.isNewThisWeek).length > 0 ? t(facts, `${facts.records.filter((r) => r.isNewThisWeek).length} neue Kraft-Rekorde diese Woche.`, `${facts.records.filter((r) => r.isNewThisWeek).length} new strength PRs this week.`) : t(facts, "Stabile Kraftwerte \u2014 Basis f\xFCr Progression gelegt.", "Stable strength numbers \u2014 base for progression set.")
          ]
        },
        {
          title: t(facts, "Energie & Alltag", "Energy & lifestyle"),
          bullets: [
            t(
              facts,
              `\xD8 ${facts.activity.avgSteps.toLocaleString()} Schritte/Tag (Ziel ${facts.profile.dailySteps}).`,
              `Avg ${facts.activity.avgSteps.toLocaleString()} steps/day (goal ${facts.profile.dailySteps}).`
            ),
            facts.activity.avgSleepHours != null ? t(facts, `Schlaf ~${facts.activity.avgSleepHours} h/Nacht.`, `Sleep ~${facts.activity.avgSleepHours} h/night.`) : t(facts, "Schlaf tracken f\xFCr bessere Regenerations-Einsch\xE4tzung.", "Track sleep for better recovery insights."),
            t(
              facts,
              `Trainingsverbrauch: ${facts.training.caloriesBurned} kcal \xB7 Fatigue ${facts.training.fatigueScore}/100.`,
              `Training burn: ${facts.training.caloriesBurned} kcal \xB7 fatigue ${facts.training.fatigueScore}/100.`
            )
          ]
        },
        {
          title: t(facts, "Ern\xE4hrung im Blick", "Nutrition focus"),
          bullets: [
            t(
              facts,
              `\xD8 ${facts.nutrition.avgKcalPerDay} kcal/Tag vs. Ziel ${facts.nutrition.targetKcal} kcal.`,
              `Avg ${facts.nutrition.avgKcalPerDay} kcal/day vs. target ${facts.nutrition.targetKcal} kcal.`
            ),
            t(
              facts,
              `Protein \xD8 ${facts.nutrition.avgProteinPerDay} g vs. Ziel ${facts.nutrition.targetProtein} g.`,
              `Protein avg ${facts.nutrition.avgProteinPerDay} g vs. target ${facts.nutrition.targetProtein} g.`
            ),
            facts.nutrition.calorieAdherencePct != null ? t(facts, `Kalorien-Adh\xE4renz: ${facts.nutrition.calorieAdherencePct}%.`, `Calorie adherence: ${facts.nutrition.calorieAdherencePct}%.`) : t(facts, "Mehr Log-Tage verbessern die Prognose.", "More log days improve the forecast."),
            t(
              facts,
              `Wochen-Netto: ${facts.nutrition.weeklyNetKcal} kcal \u2192 ~${facts.nutrition.projectedKgPerWeek} kg/Woche.`,
              `Weekly net: ${facts.nutrition.weeklyNetKcal} kcal \u2192 ~${facts.nutrition.projectedKgPerWeek} kg/week.`
            )
          ]
        },
        {
          title: t(facts, "Training & Belastung", "Training load"),
          bullets: [
            t(
              facts,
              `${facts.training.totalVolumeKg} kg Gesamtvolumen (${volDelta} vs. Vorwoche).`,
              `${facts.training.totalVolumeKg} kg total volume (${volDelta} vs prior week).`
            ),
            facts.training.topExercisesByVolume[0] ? t(
              facts,
              `Top-\xDCbung: ${facts.training.topExercisesByVolume[0].name} (${facts.training.topExercisesByVolume[0].volumeKg} kg).`,
              `Top lift: ${facts.training.topExercisesByVolume[0].name} (${facts.training.topExercisesByVolume[0].volumeKg} kg).`
            ) : t(facts, "Noch kein Kraftvolumen diese Woche.", "No strength volume this week yet."),
            t(
              facts,
              `${facts.training.cardioMinutes} min Cardio in ${facts.training.cardioSessions} Einheiten.`,
              `${facts.training.cardioMinutes} min cardio across ${facts.training.cardioSessions} sessions.`
            ),
            facts.training.fatigueScore > 75 ? t(facts, "Fatigue hoch \u2014 Deload oder leichtere Woche erw\xE4gen.", "Fatigue high \u2014 consider deload or lighter week.") : t(facts, "Belastung im steuerbaren Bereich.", "Load in a manageable range.")
          ]
        },
        {
          title: t(facts, "Ausblick", "Outlook"),
          bullets: [
            t(
              facts,
              `Bei gleichbleibender Adh\xE4renz: ${facts.nutrition.projectedKgPerWeek} kg/Woche Richtung Ziel.`,
              `At current adherence: ${facts.nutrition.projectedKgPerWeek} kg/week toward goal.`
            ),
            t(facts, "3\u20134 Krafteinheiten n\xE4chste Woche anstreben.", "Aim for 3\u20134 strength sessions next week."),
            t(facts, "Protein t\xE4glich im Zielbereich halten.", "Keep protein in target range daily."),
            t(
              facts,
              "Fortschritt ist nicht linear \u2014 Richtung \xFCber mehrere Wochen z\xE4hlt.",
              "Progress is not linear \u2014 direction over several weeks matters."
            )
          ]
        }
      ],
      goalAssessment: {
        heading: t(facts, "Ziel-Check", "Goal check"),
        progressSummary: t(
          facts,
          facts.profile.goalType === "lose" ? `Ziel Abnahme: gesch\xE4tzte Wochenbilanz ${facts.nutrition.weeklyNetKcal} kcal (${facts.nutrition.projectedKgPerWeek} kg \xC4quivalent).${facts.profile.weightDeltaWeekKg != null ? ` Gewicht diese Woche: ${facts.profile.weightDeltaWeekKg > 0 ? "+" : ""}${facts.profile.weightDeltaWeekKg} kg.` : ""}` : facts.profile.goalType === "gain" ? `Ziel Aufbau: Netto-Energie ${facts.nutrition.weeklyNetKcal} kcal \u2014 pr\xFCfe ob Aufnahme und Training dazu passen.` : `Ziel Erhalt/Performance: halte Aufnahme nahe ${facts.nutrition.targetKcal} kcal und Training konsistent.`,
          facts.profile.goalType === "lose" ? `Fat loss goal: weekly balance ${facts.nutrition.weeklyNetKcal} kcal (${facts.nutrition.projectedKgPerWeek} kg equivalent).${facts.profile.weightDeltaWeekKg != null ? ` Weight change this week: ${facts.profile.weightDeltaWeekKg > 0 ? "+" : ""}${facts.profile.weightDeltaWeekKg} kg.` : ""}` : facts.profile.goalType === "gain" ? `Muscle gain goal: net energy ${facts.nutrition.weeklyNetKcal} kcal \u2014 align intake with training.` : `Maintain/performance: stay near ${facts.nutrition.targetKcal} kcal and keep training steady.`
        ),
        onTrack: facts.profile.goalType === "lose" ? facts.nutrition.weeklyNetKcal < 0 : facts.profile.goalType === "gain" ? facts.nutrition.weeklyNetKcal > 0 : Math.abs(facts.nutrition.weeklyNetKcal) < 1500,
        distanceToGoal: facts.profile.goalWeightKg != null && facts.profile.currentWeightKg != null ? t(
          facts,
          `Aktuell ${facts.profile.currentWeightKg} kg, Ziel ${facts.profile.goalWeightKg} kg.`,
          `Currently ${facts.profile.currentWeightKg} kg, target ${facts.profile.goalWeightKg} kg.`
        ) : void 0,
        nextFocus: [
          t(facts, "3\u20134 Krafteinheiten mit klarem Progressionsplan", "3\u20134 strength sessions with clear progression"),
          t(facts, "Protein t\xE4glich im Zielbereich halten", "Hit protein target daily"),
          t(facts, "Schritte & Schlaf stabilisieren", "Stabilize steps & sleep")
        ]
      },
      nutritionTips: [
        t(facts, `Logge mindestens 5\u20136 Tage/Woche (aktuell ${facts.nutrition.daysLogged}).`, `Log at least 5\u20136 days/week (currently ${facts.nutrition.daysLogged}).`),
        t(facts, `Protein auf ~${facts.nutrition.targetProtein} g/Tag ausrichten.`, `Aim for ~${facts.nutrition.targetProtein} g protein/day.`),
        t(facts, "Vorkochen / gleiche Fr\xFChst\xFCcks-Routine spart Entscheidungen.", "Meal prep / same breakfast routine reduces friction.")
      ],
      strengthTips: [
        t(facts, "Top-\xDCbung diese Woche: " + (facts.training.topExercisesByVolume[0]?.name ?? "\u2014"), "Top lift: " + (facts.training.topExercisesByVolume[0]?.name ?? "\u2014")),
        t(facts, "RPE notieren und bei Fatigue >75 Deload erw\xE4gen.", "Track RPE; deload if fatigue >75."),
        t(facts, "2. Wiederholungssatz oft am effektivsten f\xFCr Hypertrophie.", "Second working set often most effective for hypertrophy.")
      ],
      cardioTips: [
        t(facts, `${facts.training.cardioMinutes} min Cardio in ${facts.training.cardioSessions} Einheiten.`, `${facts.training.cardioMinutes} min cardio across ${facts.training.cardioSessions} sessions.`),
        t(facts, `Schritte-Ziel: ${facts.profile.dailySteps}/Tag (\xD8 ${facts.activity.avgSteps}).`, `Step goal: ${facts.profile.dailySteps}/day (avg ${facts.activity.avgSteps}).`),
        t(facts, "Zone-2 nach schweren Beinentagen entlastet Regeneration.", "Zone-2 after heavy leg days aids recovery.")
      ],
      closingNote: t(
        facts,
        "Nimm dir 10 Minuten, den Bericht durchzugehen, und setz dir eine konkrete Priorit\xE4t f\xFCr Montag. Du bist auf dem richtigen Weg, wenn du die Woche ehrlich bewertest und kleine Anpassungen umsetzt.",
        "Take 10 minutes to read this report and set one concrete priority for Monday. You are on track when you assess honestly and apply small adjustments."
      )
    },
    performanceReport: {
      headline: t(facts, "Leistungsbericht", "Performance report"),
      summaryStats: [
        { label: t(facts, "Trainingseinheiten", "Workouts"), value: String(facts.activity.workoutSessions) },
        { label: t(facts, "Volumen", "Volume"), value: `${facts.training.totalVolumeKg} kg`, hint: volDelta },
        { label: t(facts, "\xD8 kcal/Tag", "Avg kcal/day"), value: String(facts.nutrition.avgKcalPerDay) },
        { label: t(facts, "\xD8 Protein", "Avg protein"), value: `${facts.nutrition.avgProteinPerDay} g` },
        { label: t(facts, "Schritte \xD8", "Avg steps"), value: facts.activity.avgSteps.toLocaleString() },
        { label: t(facts, "Fatigue", "Fatigue"), value: `${facts.training.fatigueScore}/100` },
        { label: t(facts, "Wochen-Netto", "Weekly net"), value: `${facts.nutrition.weeklyNetKcal} kcal` },
        { label: t(facts, "Cardio", "Cardio"), value: `${facts.training.cardioMinutes} min` }
      ],
      records,
      highlights: [
        facts.activity.workoutSessions > 0 ? t(facts, `${facts.activity.workoutSessions} abgeschlossene Sessions`, `${facts.activity.workoutSessions} completed sessions`) : t(facts, "Fokus auf Regeneration", "Focus on recovery"),
        ...facts.records.filter((r) => r.isNewThisWeek).slice(0, 4).map((r) => `${r.exercise}: ${r.value} ${r.metric}`)
      ],
      trainingSection: {
        title: t(facts, "Krafttraining", "Strength training"),
        bullets: facts.training.topExercisesByVolume.map(
          (e) => `${e.name}: ${e.volumeKg} kg Volumen`
        )
      },
      nutritionSection: {
        title: t(facts, "Ern\xE4hrung", "Nutrition"),
        bullets: [
          `${facts.nutrition.daysLogged} ${t(facts, "Tage geloggt", "days logged")}`,
          `${facts.nutrition.totalKcal} kcal ${t(facts, "gesamt", "total")}`,
          t(facts, `Adh\xE4renz Kalorien: ${facts.nutrition.calorieAdherencePct ?? "\u2014"}%`, `Calorie adherence: ${facts.nutrition.calorieAdherencePct ?? "\u2014"}%`)
        ]
      },
      cardioSection: {
        title: t(facts, "Cardio & NEAT", "Cardio & NEAT"),
        bullets: [
          `${facts.training.cardioMinutes} min / ${facts.training.cardioSessions} Sessions`,
          `${facts.activity.avgSteps} ${t(facts, "\xD8 Schritte", "avg steps")}`
        ]
      },
      comparisonSection: {
        title: t(facts, "Woche vs. Vorwoche", "Week vs prior week"),
        bullets: [
          t(facts, `Volumen: ${facts.training.totalVolumeKg} kg (Vorwoche ${facts.training.prevWeekVolumeKg} kg)`, `Volume: ${facts.training.totalVolumeKg} kg (prior ${facts.training.prevWeekVolumeKg} kg)`),
          t(facts, `Verbrauch Training: ${facts.training.caloriesBurned} kcal`, `Training burn: ${facts.training.caloriesBurned} kcal`)
        ]
      },
      sections: []
    }
  };
}

// src/lib/weeklyReport/userWeeklyReportSchema.ts
import { z as z2 } from "zod";
var reportKeyMetricSchema = z2.object({
  label: z2.string(),
  value: z2.string(),
  hint: z2.string().optional(),
  tone: z2.enum(["positive", "neutral", "attention"]).optional()
});
var reportSectionSchema = z2.object({
  title: z2.string().min(1),
  paragraphs: z2.array(z2.string()).optional().default([]),
  bullets: z2.array(z2.string()).optional().default([])
});
var userWeeklyReportSchema = z2.object({
  weekLabel: z2.string(),
  weekStart: z2.string(),
  weekEnd: z2.string(),
  locale: z2.enum(["de", "en"]).optional().default("de"),
  personalReport: z2.object({
    headline: z2.string(),
    intro: z2.string(),
    /** Scanbare Kernzahlen für Seite 1 — ohne Fließtext lesen. */
    keyMetrics: z2.array(reportKeyMetricSchema).optional().default([]),
    sections: z2.array(reportSectionSchema).min(3),
    goalAssessment: z2.object({
      heading: z2.string(),
      progressSummary: z2.string(),
      onTrack: z2.boolean(),
      distanceToGoal: z2.string().optional(),
      nextFocus: z2.array(z2.string()).min(1).max(6)
    }),
    nutritionTips: z2.array(z2.string()).min(2).max(6),
    strengthTips: z2.array(z2.string()).min(2).max(6),
    cardioTips: z2.array(z2.string()).min(2).max(6),
    closingNote: z2.string()
  }),
  performanceReport: z2.object({
    headline: z2.string(),
    summaryStats: z2.array(
      z2.object({
        label: z2.string(),
        value: z2.string(),
        hint: z2.string().optional()
      })
    ).min(4).max(12),
    records: z2.array(
      z2.object({
        title: z2.string(),
        detail: z2.string(),
        isNew: z2.boolean().optional()
      })
    ),
    highlights: z2.array(z2.string()).min(1).max(8),
    trainingSection: reportSectionSchema,
    nutritionSection: reportSectionSchema,
    cardioSection: reportSectionSchema.optional(),
    comparisonSection: reportSectionSchema.optional(),
    sections: z2.array(reportSectionSchema).optional().default([])
  })
});

// src/lib/weeklyReport/generateUserWeeklyReport.ts
async function generateUserWeeklyReport(params) {
  const fallback = buildFallbackUserWeeklyReport(params.facts);
  if (!params.callAi) {
    return { report: fallback, source: "fallback" };
  }
  let rawLast = "";
  let repair = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = buildUserWeeklyReportPrompt({
      outputLanguage: params.outputLanguage,
      weekLabel: params.facts.weekLabel,
      weekStart: params.facts.weekStart,
      weekEnd: params.facts.weekEnd,
      factsJson: formatFactsForPrompt(params.facts)
    }) + (repair ? `

JSON repair: ${repair}` : "");
    rawLast = await params.callAi([{ role: "user", content: prompt }]);
    try {
      const parsed = parseJsonLoose(rawLast);
      const z8 = userWeeklyReportSchema.safeParse(parsed);
      if (!z8.success) {
        repair = z8.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      const report = {
        ...z8.data,
        weekLabel: params.facts.weekLabel,
        weekStart: params.facts.weekStart,
        weekEnd: params.facts.weekEnd,
        locale: params.facts.locale
      };
      return { report, source: "ai", rawLast };
    } catch (e) {
      repair = e instanceof Error ? e.message : String(e);
    }
  }
  return { report: fallback, source: "fallback", rawLast };
}

// src/lib/coach/coachWeekFactsService.ts
async function loadWeekFactsSnapshot(params) {
  const schedResult = await params.pool.query(
    "SELECT schedule, start_date FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
    [params.plan.id, params.weekNumber]
  );
  const schedRow = schedResult.rows[0];
  if (!schedRow) return null;
  const startYmd = schedRow.start_date != null ? String(
    schedRow.start_date instanceof Date ? schedRow.start_date.toISOString().split("T")[0] : schedRow.start_date
  ).split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const endYmd = coachWeekInclusiveEnd(startYmd);
  const prevStart = addDaysYmd(startYmd, -7);
  const prevEnd = addDaysYmd(startYmd, -1);
  const planState = await loadCoachPlanState(params.pool, params.plan.id);
  const planType = params.plan.type === "nutrition" ? "nutrition" : "workout";
  const [workoutsRes, nutritionRes, prevVol] = await Promise.all([
    params.pool.query(`SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd
    ]),
    params.pool.query(`SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd
    ]),
    planType === "workout" ? loadPrevWeekVolumeKg(params.pool, params.userId, prevStart, prevEnd) : Promise.resolve(0)
  ]);
  const snapshot = buildAthleteWeekSnapshot({
    planType,
    weekNumber: params.weekNumber,
    startYmd,
    scheduleEnvelope: schedRow.schedule ?? {},
    workouts: workoutsRes.rows.map((r) => mapWorkoutRow(r)),
    nutrition: nutritionRes.rows.map((r) => mapNutritionRow(r)),
    profile: params.profile,
    onboarding: params.onboarding,
    prevWeekVolumeKg: prevVol,
    matchOverrides: planState.sessionMatchOverrides
  });
  return { snapshot, startYmd, endYmd };
}

// src/lib/coach/coachDashboardSummary.ts
function completionRateFromReport(report) {
  if (!report) return null;
  if (typeof report.completionRate === "number" && Number.isFinite(report.completionRate)) {
    return Math.round(report.completionRate);
  }
  const snap = report.factsSnapshot;
  if (snap?.adherence?.completionRate != null) return Math.round(snap.adherence.completionRate);
  return null;
}
function buildCoachDashboardSummary(params) {
  const planType = params.planType === "nutrition" ? "nutrition" : "workout";
  const fromReport = completionRateFromReport(params.report ?? null);
  const fromLive = params.liveSnapshot?.adherence?.completionRate != null ? Math.round(params.liveSnapshot.adherence.completionRate) : null;
  const completionRate = fromLive ?? fromReport;
  const source = fromLive != null ? "live_facts" : "report";
  if (completionRate == null) return null;
  const report = params.report ?? {};
  return {
    planId: params.planId,
    planType,
    weekNumber: params.weekNumber,
    completionRate,
    recommendation: typeof report.recommendation === "string" ? report.recommendation : null,
    overallRating: typeof report.overallRating === "number" ? report.overallRating : null,
    source
  };
}

// src/lib/coach/coachOpsMetrics.ts
var REFINE_ENDPOINT = "POST /api/coach/plans/:id/refine-schedule";
var REPORT_ENDPOINT = "POST /api/coach/plans/:id/weekly-report";
function rate(errors, total) {
  if (total <= 0) return 0;
  return Math.round(errors / total * 1e3) / 1e3;
}
function classifyStatus(errorRate) {
  if (errorRate >= 0.35) return "critical";
  if (errorRate >= 0.15) return "degraded";
  return "ok";
}
async function queryCoachOpsMetrics(pool2, windowHours = 24) {
  const hours = Math.max(1, Math.min(168, windowHours));
  const [aggRes, endpointRes, plansRes] = await Promise.all([
    pool2.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL OR zod_ok = false)::int AS errors,
         COUNT(*) FILTER (WHERE zod_ok = false)::int AS zod_failures,
         COALESCE(AVG(latency_ms), 0)::int AS avg_latency
       FROM coach_ai_runs
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval`,
      [String(hours)]
    ),
    pool2.query(
      `SELECT
         endpoint,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL OR zod_ok = false)::int AS errors,
         COUNT(*) FILTER (WHERE zod_ok = false)::int AS zod_failures,
         COALESCE(AVG(latency_ms), 0)::int AS avg_latency
       FROM coach_ai_runs
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
       GROUP BY endpoint
       ORDER BY total DESC`,
      [String(hours)]
    ),
    pool2.query(`SELECT COUNT(*)::int AS n FROM coach_plans WHERE status = 'active'`)
  ]);
  const agg = aggRes.rows[0] ?? {};
  const totalRuns = Number(agg.total) || 0;
  const errorRuns = Number(agg.errors) || 0;
  const errorRate = rate(errorRuns, totalRuns);
  const byEndpoint = endpointRes.rows.map((row) => {
    const total = Number(row.total) || 0;
    const errors = Number(row.errors) || 0;
    return {
      endpoint: String(row.endpoint),
      total,
      errors,
      errorRate: rate(errors, total),
      zodFailures: Number(row.zod_failures) || 0,
      avgLatencyMs: Number(row.avg_latency) || 0
    };
  });
  const pick = (ep) => byEndpoint.find((r) => r.endpoint === ep) ?? {
    endpoint: ep,
    total: 0,
    errors: 0,
    errorRate: 0,
    zodFailures: 0,
    avgLatencyMs: 0
  };
  const refineRow = pick(REFINE_ENDPOINT);
  const reportRow = pick(REPORT_ENDPOINT);
  return {
    windowHours: hours,
    totalRuns,
    errorRuns,
    errorRate,
    zodFailureRate: rate(Number(agg.zod_failures) || 0, totalRuns),
    avgLatencyMs: Number(agg.avg_latency) || 0,
    byEndpoint,
    refine: {
      total: refineRow.total,
      errors: refineRow.errors,
      errorRate: refineRow.errorRate
    },
    weeklyReport: {
      total: reportRow.total,
      errors: reportRow.errors,
      errorRate: reportRow.errorRate
    },
    activePlans: Number(plansRes.rows[0]?.n) || 0,
    status: classifyStatus(errorRate)
  };
}

// src/lib/coachNutritionPostprocess.ts
var SLOT_CAL_SHARE = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05
};
function macrosToCalories(protein, carbs, fat) {
  const p = Number(protein) || 0;
  const c = Number(carbs) || 0;
  const f = Number(fat) || 0;
  if (p + c + f <= 0) return 0;
  return Math.round(p * 4 + c * 4 + f * 9);
}
function enrichMealCalories(meal, fallbackCalories) {
  let calories = Number(meal.calories) || 0;
  if (calories <= 0) {
    calories = macrosToCalories(
      Number(meal.protein),
      Number(meal.carbs),
      Number(meal.fat)
    );
  }
  if (calories <= 0 && fallbackCalories > 0) calories = fallbackCalories;
  return { ...meal, calories: calories > 0 ? calories : void 0 };
}
function finalizeCoachNutritionWeek(week) {
  const dayTarget = Number(week.dailyTargets?.calories) || 2400;
  const ac = [...week.applied_constraints || []];
  const mealPlan = (week.mealPlan ?? []).map((dayRow) => {
    const day = String(dayRow.day ?? "").trim();
    const meals = Array.isArray(dayRow.meals) ? [...dayRow.meals] : [];
    const dayTotal = Number(dayRow.totalCalories) || dayTarget;
    const enriched = meals.map((m) => {
      const type = String(m.type ?? "lunch").toLowerCase();
      const share = SLOT_CAL_SHARE[type] ?? 0.2;
      const fallback = Math.round(dayTotal * share);
      return enrichMealCalories(m, fallback);
    });
    const sumCals = enriched.reduce((s, m) => s + (Number(m.calories) || 0), 0);
    const stillMissing = enriched.some((m) => !Number(m.calories));
    if (stillMissing && enriched.length > 0) {
      const per = Math.round(dayTotal / enriched.length);
      for (let i = 0; i < enriched.length; i++) {
        if (!Number(enriched[i].calories)) enriched[i] = { ...enriched[i], calories: per };
      }
    }
    return {
      ...dayRow,
      day,
      totalCalories: sumCals > 0 ? sumCals : dayTotal,
      meals: enriched
    };
  });
  const byDay = new Map(mealPlan.map((d) => [String(d.day), d]));
  const fullPlan = COACH_NUTRITION_WEEKDAYS.map(
    (day) => byDay.get(day) ?? { day, meals: [], totalCalories: dayTarget }
  );
  if (!ac.includes("repaired:meal_calories")) ac.push("repaired:meal_calories");
  return {
    ...week,
    mealPlan: fullPlan,
    applied_constraints: ac.slice(0, 8)
  };
}

// src/lib/coachGeneratePipeline.ts
function omitNullFields(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null) out[k] = v;
  }
  return out;
}
function sanitizeCoachScheduleDay(day) {
  if (!day || typeof day !== "object") return day;
  const d = omitNullFields(day);
  const normalizeExerciseRow = (rowIn) => {
    const row = omitNullFields(rowIn);
    if (row.exerciseKey === null || row.exerciseKey === "") delete row.exerciseKey;
    if (typeof row.rest === "number" && Number.isFinite(row.rest)) {
      row.rest = `${Math.max(0, Math.round(row.rest))}s`;
    }
    if (typeof row.reps === "number" && Number.isFinite(row.reps)) {
      row.reps = String(Math.max(0, Math.round(row.reps)));
    }
    if (typeof row.weight === "number" && Number.isFinite(row.weight)) {
      row.weight = `${Math.round(row.weight)} kg`;
    }
    return row;
  };
  if (d.isRest === true) {
    d.exercises = [];
    delete d.cardio;
  }
  if (Array.isArray(d.exercises)) {
    d.exercises = d.exercises.map((ex) => {
      if (!ex || typeof ex !== "object") return ex;
      return normalizeExerciseRow(ex);
    });
  }
  if (Array.isArray(d.warmupExercises)) {
    d.warmupExercises = d.warmupExercises.map((ex) => {
      if (!ex || typeof ex !== "object") return ex;
      return normalizeExerciseRow(ex);
    });
  }
  if (Array.isArray(d.cooldownExercises)) {
    d.cooldownExercises = d.cooldownExercises.map((ex) => {
      if (!ex || typeof ex !== "object") return ex;
      return normalizeExerciseRow(ex);
    });
  }
  if (d.cardio === null) {
    delete d.cardio;
  } else if (d.cardio && typeof d.cardio === "object") {
    d.cardio = omitNullFields(d.cardio);
  }
  return d;
}
function normalizeCoachWorkoutWeekPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  const o = parsed;
  const scheduleRaw = o.schedule;
  const schedule = Array.isArray(scheduleRaw) ? scheduleRaw.map(sanitizeCoachScheduleDay) : [];
  return {
    ...o,
    weekFocus: String(o.weekFocus ?? o.week_focus ?? "Training week").trim() || "Training week",
    coachNotes: String(o.coachNotes ?? o.coach_notes ?? "").trim() || "See schedule.",
    assumptions: Array.isArray(o.assumptions) ? o.assumptions.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [],
    applied_constraints: Array.isArray(o.applied_constraints) ? o.applied_constraints.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [],
    schedule
  };
}
function formatCoachGenerationErrorMessage(err) {
  const parts = [err.message];
  const lastZod = err.detail.zodErrors.filter(Boolean).at(-1);
  const lastCon = err.detail.constraintViolations.filter(Boolean).at(-1);
  if (lastZod) parts.push(lastZod.slice(0, 280));
  if (lastCon) parts.push(lastCon.slice(0, 280));
  return parts.join(" \u2014 ");
}
var CoachGenerationError = class extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
};
async function generateCoachWorkoutWeekWithPipeline(args) {
  const max = args.maxRetries ?? 5;
  let repairHint = "";
  let lastRaw = "";
  const zodErrors = [];
  const constraintViolations = [];
  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: "user", content: prompt }]);
    let parsed;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein g\xFCltiges JSON. ${msg}`;
      continue;
    }
    const normalized = args.normalizeEnvelope(normalizeCoachWorkoutWeekPayload(parsed));
    const z8 = coachWorkoutWeekSchema.safeParse(normalized);
    if (!z8.success) {
      const msg = z8.error.issues.map((er) => `${er.path.join(".")}: ${er.message}`).join("; ");
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    let week = z8.data;
    week = repairUnknownExerciseKeys(week);
    week = repairWorkoutScheduleConstraints(week, args.constraints);
    if (args.constraints.sessionAssignments?.length) {
      week = alignScheduleToCustomAssignments(week, args.constraints.sessionAssignments);
    }
    const v = validateWorkoutConstraints(week, args.constraints);
    if (v.ok === false) {
      const msgs = v.violations.map((vi) => `${vi.code}: ${vi.message}`).join("; ");
      constraintViolations.push(msgs);
      const assignHint = args.constraints.sessionAssignments?.length ? ` REQUIRED: output exactly ${args.constraints.sessionAssignments.length} separate non-rest schedule objects \u2014 one per line: ${args.constraints.sessionAssignments.map((a) => `${a.day} (${a.sessionSlot}) ${a.sessionTypeHint}`).join("; ")}. Duplicate weekdays MUST use distinct sessionSlot (Morning vs Evening).` : "";
      repairHint = `Hard constraints violated \u2014 repair the schedule: ${msgs}${assignHint}`;
      continue;
    }
    if (args.volumeMultiplier != null) {
      week = applyCoachVolumeMultiplier(week, args.volumeMultiplier);
    }
    if (args.recentWorkouts?.length) {
      week = applyCoachWeekLoadProgression(week, args.recentWorkouts, {
        volumeMultiplier: args.volumeMultiplier
      });
    }
    if (args.priorExerciseKeys?.length) {
      week = annotatePriorExerciseContinuity(week, args.priorExerciseKeys);
    }
    if (args.sports?.length) {
      week = normalizeCardioSportRails(week, args.sports);
    }
    week = annotateMuscleGroupBalance(week);
    return { week, rawLast: lastRaw, retries: attempt, zodErrors, constraintViolations };
  }
  throw new CoachGenerationError(
    `Coach workout generation failed after ${max} attempts`,
    { zodErrors, constraintViolations, lastRaw }
  );
}
async function generateCoachNutritionWeekWithPipeline(args) {
  const max = args.maxRetries ?? 3;
  let repairHint = "";
  let lastRaw = "";
  const zodErrors = [];
  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: "user", content: prompt }]);
    let parsed;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein g\xFCltiges JSON. ${msg}`;
      continue;
    }
    const z8 = coachNutritionWeekSchema.safeParse(parsed);
    if (!z8.success) {
      const msg = z8.error.issues.map((er) => `${er.path.join(".")}: ${er.message}`).join("; ");
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    const week = finalizeCoachNutritionWeek(z8.data);
    return { week, rawLast: lastRaw, retries: attempt, zodErrors };
  }
  throw new CoachGenerationError(`Coach nutrition generation failed after ${max} attempts`, {
    zodErrors,
    constraintViolations: [],
    lastRaw
  });
}

// src/lib/coach/workoutTemplateZod.ts
import { z as z3 } from "zod";
var setDetailSchema = z3.object({
  reps: z3.union([z3.number(), z3.string()]).optional(),
  weight: z3.union([z3.number(), z3.string()]).optional(),
  type: z3.string().optional()
});
var templateExerciseSchema = z3.object({
  name: z3.string(),
  exerciseKey: z3.string().nullish(),
  notes: z3.string().optional(),
  sets: z3.array(setDetailSchema).optional()
});
var workoutTemplateAiSchema = z3.object({
  name: z3.string().min(1),
  type: z3.enum(["Strength", "Cardio", "Hybrid"]),
  description: z3.string().optional(),
  exercises: z3.array(templateExerciseSchema).min(1)
});

// src/lib/aiRunLogger.ts
import { createHash } from "node:crypto";

// src/lib/coachPromptVersions.ts
var COACH_PROMPT_VERSION = "coach-v1.0.0";
var MEAL_RECIPE_PROMPT_VERSION = "meal-recipe-v1.0.0";

// src/lib/aiRunLogger.ts
function hashJson(obj) {
  return createHash("sha256").update(JSON.stringify(obj ?? null)).digest("hex").slice(0, 32);
}
async function logCoachAiRun(pool2, row) {
  const caps = resolveAiCapabilities();
  const modelId = caps.provider === "none" ? "none" : getAiModel(caps.provider, "coach_workout");
  try {
    await pool2.query(
      `INSERT INTO coach_ai_runs (
        user_id, plan_id, week_number, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, constraints_ok, retries, latency_ms, final_schedule_hash,
        refinement_round, error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        row.userId,
        row.planId,
        row.weekNumber,
        row.endpoint,
        COACH_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.constraintsOk,
        row.retries,
        row.latencyMs,
        row.finalScheduleHash,
        row.refinementRound ?? 0,
        row.errorMessage ?? null
      ]
    );
  } catch (e) {
    console.warn("[coach_ai_runs] log failed", e);
  }
}
async function logMealAiRun(pool2, row) {
  const caps = resolveAiCapabilities();
  const modelId = caps.provider === "none" ? "none" : getAiModel(caps.provider, "meal");
  try {
    await pool2.query(
      `INSERT INTO meal_ai_runs (
        user_id, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, retries, latency_ms, error_message, refinement_round
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.userId,
        row.endpoint,
        MEAL_RECIPE_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.retries,
        row.latencyMs,
        row.errorMessage ?? null,
        row.refinementRound ?? 0
      ]
    );
  } catch (e) {
    console.warn("[meal_ai_runs] log failed", e);
  }
}

// src/lib/mealRecipeZod.ts
import { z as z4 } from "zod";
var prepStepSchema = z4.object({
  order: z4.number(),
  title: z4.string().optional(),
  body: z4.string()
});
var recipeIngredientSchema = z4.object({
  name: z4.string(),
  amount: z4.number(),
  unit: z4.string(),
  foodId: z4.string().optional(),
  note: z4.string().optional(),
  unresolved: z4.boolean().optional()
});
var mealRecipeAiSchema = z4.object({
  name: z4.string(),
  category: z4.string().optional(),
  yields_portions: z4.number().int().min(1).max(999).optional(),
  ingredients: z4.array(recipeIngredientSchema).min(1),
  prep_steps: z4.array(prepStepSchema).min(1),
  llm_estimate_nutrients: z4.object({
    calories: z4.number().optional(),
    protein: z4.number().optional(),
    carbs: z4.number().optional(),
    fat: z4.number().optional()
  }).optional()
});

// src/lib/mealTemplateComputedNutrition.ts
function findStaticFoodById(_id) {
  return null;
}
function ingredientAmountToGrams(amount, unitRaw) {
  const u = String(unitRaw || "").trim().toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (u === "g" || u === "gram" || u === "gramm") return amount;
  if (u === "kg") return amount * 1e3;
  if (u === "ml" || u === "milliliter") return amount;
  if (u === "l" || u === "liter") return amount * 1e3;
  if (u === "stk" || u === "st\xFCck" || u === "stueck" || u === "piece" || u === "pcs") return null;
  return null;
}
function computeMealTemplateNutritionForRecipe(ingredients, extraFoodResolver) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolvedRows = 0;
  let totalRows = 0;
  for (const ing of ingredients || []) {
    totalRows += 1;
    const grams = ingredientAmountToGrams(Number(ing.amount), ing.unit);
    const food = (ing.foodId && extraFoodResolver ? extraFoodResolver(ing.foodId) : null) ?? findStaticFoodById(ing.foodId);
    if (!food || grams == null) continue;
    resolvedRows += 1;
    const f = 0.01 * grams;
    const c = food.nutrients.calories * f;
    totals.calories += c;
    totals.protein += food.nutrients.protein * f;
    totals.carbs += food.nutrients.carbs * f;
    totals.fat += food.nutrients.fat * f;
  }
  const rowCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;
  const caloriesCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;
  return {
    computed: {
      calories: Math.round(totals.calories * 10) / 10,
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10
    },
    rowCoverage: Math.round(rowCoverage * 1e3) / 1e3,
    caloriesCoverage: Math.round(caloriesCoverage * 1e3) / 1e3
  };
}

// src/lib/nutrition/nutritionRoutes.ts
init_openFoodFactsFetch();
init_appCustomFoods();

// src/lib/catalogSearch.ts
init_openFoodFacts();
init_mealAiShared();

// src/lib/foodSearch.ts
init_mealAiShared();
var QUERY_EXPANSIONS = [
  { test: /leberkas|leberkäse|leberkaas/i, insertTerms: ["fleischk\xE4se", "leberkaas", "leberk\xE4se"] },
  { test: /wei(ß|ss|s)wurst/i, insertTerms: ["wei\xDFwurst", "weisswurst"] },
  { test: /obatzda|obatzter|obazda/i, insertTerms: ["obatzda", "k\xE4seaufstrich"] },
  { test: /brezn|brezel/i, insertTerms: ["brezel"] },
  { test: /radi\b/i, insertTerms: ["rettich"] }
];
var STRONG_TERMS_STOPWORDS = /* @__PURE__ */ new Set([
  "und",
  "oder",
  "mit",
  "ohne",
  "aus",
  "auf",
  "als",
  "wie",
  "von",
  "zum",
  "zur",
  "vom",
  "ein",
  "eine",
  "einen",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "im",
  "in",
  "an",
  "ca",
  "circa",
  "etwas",
  "bitte"
]);
function foldForSearch(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
function asciiFoldDe(s) {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
function collectSearchTerms(raw) {
  const t2 = raw.trim();
  const out = /* @__PURE__ */ new Set();
  if (!t2) return out;
  const lower2 = t2.toLowerCase();
  out.add(lower2);
  out.add(foldForSearch(lower2));
  out.add(asciiFoldDe(lower2));
  const tokens = lower2.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    out.add(tok);
    out.add(asciiFoldDe(tok));
  }
  for (const { test, insertTerms } of QUERY_EXPANSIONS) {
    if (test.test(t2)) {
      for (const x of insertTerms) out.add(x);
    }
  }
  return out;
}
function foodMatchesAnyTerm(food, terms) {
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    const a = foldForSearch(term);
    const b = asciiFoldDe(term);
    if (hay.includes(a) || hay.includes(term.toLowerCase()) || hayBare.includes(b)) return true;
  }
  return false;
}
function dedupeById(foods) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of foods) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}
function collectStrongMatchParts(raw) {
  const t2 = raw.trim().toLowerCase();
  if (!t2) return [];
  const parts = [];
  const words = t2.split(/\s+/).map((w) => w.replace(/[,;.]+$/g, "")).filter(Boolean);
  for (const w of words) {
    if (STRONG_TERMS_STOPWORDS.has(w)) continue;
    if (/^\d+([.,]\d+)?$/.test(w)) {
      parts.push(w.replace(",", "."));
      continue;
    }
    if (/^\d+([.,]\d+)?%$/.test(w)) {
      parts.push(w.replace("%", "").replace(",", "."));
      continue;
    }
    if (w.length >= 2) parts.push(w);
  }
  return [...new Set(parts)];
}
function foodMatchesAllStrongParts(food, parts) {
  if (parts.length === 0) return false;
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) {
      if (!nameMatchesNumericToken(food.name, p)) return false;
      continue;
    }
    const a = foldForSearch(p);
    const b = asciiFoldDe(p);
    if (!hay.includes(a) && !hayBare.includes(b) && !hayBare.includes(a) && !hay.includes(b) && !hay.includes(p.toLowerCase())) {
      return false;
    }
  }
  return true;
}
function searchStaticFoodsTiered(query, pool2 = [], maxStrong = 24, maxSimilar = 40) {
  const q = query.trim();
  if (!q) return { strong: [], similar: pool2.slice(0, Math.min(maxSimilar, 50)) };
  const parts = collectStrongMatchParts(q);
  const strongBase = parts.length > 0 ? pool2.filter((f) => foodMatchesAllStrongParts(f, parts)) : [];
  const strong = dedupeById(rankFoodsForMealDescription(q, 120, strongBase)).slice(0, maxStrong);
  const similarRanked = searchStaticFoods(q, pool2, maxSimilar + strong.length + 8);
  const strongIds = new Set(strong.map((f) => f.id));
  const similar = similarRanked.filter((f) => !strongIds.has(f.id)).slice(0, maxSimilar);
  return { strong, similar };
}
function searchStaticFoods(query, pool2 = [], maxResults = 80) {
  const q = query.trim();
  if (!q) return pool2.slice(0, Math.min(maxResults, 50));
  const terms = collectSearchTerms(q);
  const direct = pool2.filter((f) => {
    const fn = f.name.toLowerCase();
    return fn.includes(q.toLowerCase()) || foodMatchesAnyTerm(f, terms);
  });
  const poolForRank = direct.length > 0 ? direct : pool2.filter((f) => foodMatchesAnyTerm(f, terms));
  const ranked = rankFoodsForMealDescription(q, 400, poolForRank.length > 0 ? poolForRank : pool2);
  return dedupeById(ranked).slice(0, maxResults);
}

// src/lib/catalogSearch.ts
function tierFoodsFromOffPool(query, offFoods, maxStrong = 20, maxSimilar = 32) {
  const q = query.trim();
  if (q.length < 1) {
    return { strong: [], similar: [] };
  }
  const pool2 = mergeCatalogFoodPool(offFoods);
  const tiered = searchStaticFoodsTiered(q, pool2, maxStrong, maxSimilar);
  if (tiered.strong.length > 0 || tiered.similar.length > 0 || pool2.length === 0) {
    return tiered;
  }
  const qFold = normalizeOffSearchQuery(q);
  const ranked = rankFoodsForMealDescription(qFold, maxStrong + maxSimilar, pool2);
  if (ranked.length > 0) {
    return {
      strong: ranked.slice(0, maxStrong),
      similar: ranked.slice(maxStrong, maxStrong + maxSimilar)
    };
  }
  return {
    strong: pool2.slice(0, maxStrong),
    similar: pool2.slice(maxStrong, maxStrong + maxSimilar)
  };
}

// src/lib/nutrition/pipeline/applyUserPreferences.ts
async function applyUserFoodPreferencesToPipeline(pool2, userId, result) {
  if (result.matches.length === 0) return result;
  const keys = result.matches.map((m) => m.component_name.toLowerCase().trim());
  let rows = [];
  try {
    const q = await pool2.query(
      `SELECT ingredient_key, preferred_openfoodfacts_id, preferred_product_name, preferred_grams
       FROM user_food_preferences
       WHERE user_id = $1 AND ingredient_key = ANY($2::text[])`,
      [userId, keys]
    );
    rows = q.rows;
  } catch {
    return result;
  }
  const prefMap = new Map(rows.map((r) => [r.ingredient_key, r]));
  const matches = result.matches.map((match) => {
    const pref = prefMap.get(match.component_name.toLowerCase().trim());
    if (!pref) return match;
    let idx = match.candidates.findIndex(
      (c) => c.openfoodfacts_id === pref.preferred_openfoodfacts_id
    );
    if (idx < 0 && pref.preferred_product_name) {
      const preferredName = pref.preferred_product_name.toLowerCase().trim();
      idx = match.candidates.findIndex((c) => c.product_name.toLowerCase().trim() === preferredName);
      if (idx < 0) {
        idx = match.candidates.findIndex((c) => c.product_name.toLowerCase().includes(preferredName));
      }
    }
    if (idx <= 0) {
      const next = { ...match };
      if (pref.preferred_grams != null && Number.isFinite(Number(pref.preferred_grams))) {
        next.estimated_grams = Number(pref.preferred_grams);
      }
      if (idx === 0) {
        next.requires_user_review = false;
        next.review_reasons = [];
      }
      return next;
    }
    const reordered = [...match.candidates];
    const [picked] = reordered.splice(idx, 1);
    reordered.unshift(picked);
    return {
      ...match,
      candidates: reordered.map((c, i) => ({ ...c, rank: i + 1 })),
      auto_selected_rank: 1,
      estimated_grams: pref.preferred_grams != null && Number.isFinite(Number(pref.preferred_grams)) ? Number(pref.preferred_grams) : match.estimated_grams,
      requires_user_review: false,
      review_reasons: []
    };
  });
  return { ...result, matches };
}

// src/lib/nutrition/pipeline/nutritionFromCandidate.ts
function macrosForCandidate(candidate, grams) {
  const factor = grams / 100;
  return {
    kcal: Math.round(candidate.kcal_100g * factor),
    protein: Math.round(candidate.protein_100g * factor * 10) / 10,
    carbs: Math.round(candidate.carbs_100g * factor * 10) / 10,
    fat: Math.round(candidate.fat_100g * factor * 10) / 10,
    fiber: candidate.fiber_100g != null ? Math.round(candidate.fiber_100g * factor * 10) / 10 : null
  };
}

// src/lib/nutrition/pipeline/NutritionCalculator.ts
function calculateNutrition(match) {
  const selected = match.candidates[0];
  if (!selected) return null;
  const macros = macrosForCandidate(selected, match.estimated_grams);
  return {
    component_id: match.component_id,
    component_name: match.component_name,
    grams: match.estimated_grams,
    data_source: selected.data_source,
    confidence_score: selected.score,
    ...macros
  };
}
function sumNutrition(lines) {
  return lines.reduce(
    (acc, line) => ({
      kcal: acc.kcal + line.kcal,
      protein: Math.round((acc.protein + line.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + line.carbs) * 10) / 10,
      fat: Math.round((acc.fat + line.fat) * 10) / 10,
      fiber: Math.round((acc.fiber + (line.fiber ?? 0)) * 10) / 10
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

// src/lib/nutrition/pipeline/legacyAdapter.ts
function recomputePipelineFromReview(result, reviewed) {
  const reviewMap = new Map(reviewed.map((r) => [r.component_id, r]));
  const matches = result.matches.map((match) => {
    const row = reviewMap.get(match.component_id);
    const grams = row?.grams ?? match.estimated_grams;
    const rank = row?.selectedRank ?? match.auto_selected_rank ?? 1;
    const selected = match.candidates[rank - 1] ?? match.candidates[0];
    if (!selected) return { ...match, estimated_grams: grams };
    const reordered = [...match.candidates];
    const pickIdx = reordered.findIndex(
      (c) => c.rank === rank || c.product_name === selected.product_name
    );
    if (pickIdx > 0) {
      const [picked] = reordered.splice(pickIdx, 1);
      reordered.unshift(picked);
    }
    return {
      ...match,
      estimated_grams: grams,
      candidates: reordered.map((c, i) => ({ ...c, rank: i + 1 })),
      auto_selected_rank: 1
    };
  });
  const matchById = new Map(matches.map((m) => [m.component_id, m]));
  const components = matches.map((m) => calculateNutrition(m)).filter((v) => Boolean(v)).map((c) => {
    const row = reviewMap.get(c.component_id);
    const grams = row?.grams ?? c.grams;
    const match = matchById.get(c.component_id);
    const selected = match?.candidates[0];
    if (!selected) return { ...c, grams };
    const macros = macrosForCandidate(selected, grams);
    return {
      ...c,
      grams,
      data_source: selected.data_source,
      confidence_score: selected.score,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber
    };
  });
  const totals = components.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: Math.round((acc.protein + c.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + c.carbs) * 10) / 10,
      fat: Math.round((acc.fat + c.fat) * 10) / 10,
      fiber: Math.round((acc.fiber + (c.fiber ?? 0)) * 10) / 10
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  return {
    ...result,
    matches,
    components,
    totals: { ...totals, fiber: totals.fiber || void 0 },
    user_review_required: matches.some((m) => m.requires_user_review)
  };
}

// src/lib/nutrition/pipeline/refreshPipeline.ts
function refreshPipelineTotals(result) {
  const components = result.matches.map((m) => calculateNutrition(m)).filter((v) => Boolean(v));
  const totals = sumNutrition(components);
  return { ...result, components, totals };
}

// src/lib/nutrition/catalog/resolveComponent.ts
init_openFoodFactsFetch();
init_appCustomFoods();

// src/lib/nutrition/matchRanker.ts
init_foodSynonyms_de();

// src/lib/nutrition/matchThresholds.ts
var MATCH_AUTO_HIGH = 0.85;
var MATCH_AUTO_MEDIUM = 0.7;
var MATCH_BLOCK_SAVE = 0.7;
var MATCH_EXPERT_AUTO = 0.92;
function matchUncertaintyFromScore(score, expertMode = false) {
  if (score >= MATCH_EXPERT_AUTO) return "high";
  if (expertMode && score >= MATCH_AUTO_MEDIUM) return "high";
  if (score >= MATCH_AUTO_HIGH) return "high";
  if (score >= MATCH_AUTO_MEDIUM) return "medium";
  if (score > 0) return "blocked";
  return "low";
}
function pickThresholdAuto(_expertMode = false) {
  return MATCH_AUTO_HIGH;
}
function requiresCandidatePick(score, hasCandidates) {
  return hasCandidates && score < MATCH_BLOCK_SAVE;
}

// src/lib/nutrition/matchRanker.ts
function tokenize(s) {
  return s.toLowerCase().replace(/[^a-z0-9äöüß\s]/gi, " ").split(/\s+/).filter((t2) => t2.length > 1);
}
function overlapScore(query, food) {
  const qTokens = new Set(tokenize(normalizeFoodHint(query)));
  const fTokens = tokenize(food.name);
  if (qTokens.size === 0 || fTokens.length === 0) return 0;
  let hit = 0;
  for (const t2 of fTokens) {
    if (qTokens.has(t2)) hit++;
    for (const q of qTokens) {
      if (t2.includes(q) || q.includes(t2)) hit += 0.5;
    }
  }
  return Math.min(1, hit / (qTokens.size + 1));
}
function penalizePackagedMismatch(query, food) {
  const q = query.toLowerCase();
  const name = food.name.toLowerCase();
  const genericTerms = ["brust", "filet", "roh", "gekocht", "reis", "apfel", "tomate"];
  const packagedTerms = ["nuggets", "tk", "tiefk\xFChl", "pizza", "snack", "chips", "riegel"];
  const qGeneric = genericTerms.some((t2) => q.includes(t2));
  const fPackaged = packagedTerms.some((t2) => name.includes(t2));
  if (qGeneric && fPackaged) return 0.35;
  return 0;
}
function rankFoodCandidates(query, candidates, limit = 5) {
  const q = normalizeFoodHint(query);
  const ranked = candidates.map((food) => {
    let score = overlapScore(q, food);
    score -= penalizePackagedMismatch(q, food);
    if (food.catalogSource === "app") score += 0.05;
    const nutrientsOk = food.nutrients.calories > 0 || food.nutrients.protein > 0 || food.nutrients.carbs > 0;
    if (!nutrientsOk) score -= 0.2;
    const reason = score >= MATCH_AUTO_HIGH ? "off_name_strong" : score >= 0.55 ? "off_name" : "off_name_weak";
    return { food, score: Math.max(0, Math.min(1, score)), reason };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  return ranked;
}
function pickAutoMatch(ranked, expertMode = false) {
  const top = ranked[0];
  const threshold = pickThresholdAuto(expertMode);
  if (top && top.score >= threshold) return top;
  return null;
}
function pickMediumMatch(ranked) {
  const top = ranked[0];
  if (top && top.score >= 0.7 && top.score < MATCH_AUTO_HIGH) return top;
  return null;
}

// src/lib/nutrition/portionCatalog.ts
init_portionUtils();

// src/lib/nutrition/userFoodPortionPrefs.ts
async function ensureUserFoodPortionPrefsTable(pool2) {
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS user_food_portion_prefs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      food_id VARCHAR(64) NOT NULL,
      portion_id VARCHAR(64) NOT NULL,
      log_unit VARCHAR(32) NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, food_id)
    )
  `);
}
async function getUserPortionPrefsForFoods(pool2, userId, foodIds) {
  const map = /* @__PURE__ */ new Map();
  const ids = [...new Set(foodIds.filter(Boolean))];
  if (ids.length === 0) return map;
  try {
    const res = await pool2.query(
      `SELECT food_id, portion_id, log_unit, quantity
       FROM user_food_portion_prefs
       WHERE user_id = $1 AND food_id = ANY($2::varchar[])`,
      [userId, ids]
    );
    for (const row of res.rows) {
      map.set(row.food_id, {
        foodId: row.food_id,
        portionId: row.portion_id,
        logUnit: row.log_unit,
        quantity: Number(row.quantity) || 1
      });
    }
  } catch {
  }
  return map;
}
async function upsertUserPortionPref(pool2, userId, pref) {
  await pool2.query(
    `INSERT INTO user_food_portion_prefs (user_id, food_id, portion_id, log_unit, quantity, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, food_id) DO UPDATE SET
       portion_id = EXCLUDED.portion_id,
       log_unit = EXCLUDED.log_unit,
       quantity = EXCLUDED.quantity,
       updated_at = NOW()`,
    [userId, pref.foodId, pref.portionId, pref.logUnit, pref.quantity]
  );
}
function portionOptionFromUserPref(pref, foodGramsFallback = 100) {
  const grams = pref.logUnit === "g" || pref.logUnit === "ml" ? pref.quantity : foodGramsFallback * Math.max(0.01, pref.quantity);
  return {
    id: pref.portionId,
    label: `${pref.quantity} ${pref.logUnit}`,
    logUnit: pref.logUnit,
    quantity: pref.quantity,
    grams,
    source: "user_last",
    isDefault: true
  };
}
async function getUserFoodChoiceBoostsForHint(pool2, userId, foodHint) {
  const boosts = /* @__PURE__ */ new Map();
  const hint = foodHint.trim().toLowerCase();
  if (!hint) return boosts;
  try {
    const res = await pool2.query(
      `SELECT c->>'chosenFoodId' AS chosen_food_id, COUNT(*)::text AS cnt
       FROM meal_ai_runs_v2,
            jsonb_array_elements(COALESCE(user_corrections, '[]'::jsonb)) AS c
       WHERE user_id = $1
         AND LOWER(TRIM(c->>'foodHint')) = $2
         AND (c->>'chosenFoodId') IS NOT NULL
       GROUP BY c->>'chosenFoodId'
       HAVING COUNT(*) >= 1`,
      [userId, hint]
    );
    for (const row of res.rows) {
      const cnt = Number(row.cnt) || 0;
      boosts.set(row.chosen_food_id, Math.min(0.15, 0.05 + cnt * 0.03));
    }
  } catch {
  }
  return boosts;
}

// src/lib/nutrition/defaultPortions.de.json
var defaultPortions_de_default = {
  "brotaufstrich m\xFCsliriegel": {
    grams: 40,
    unit: "stk"
  },
  "bratwurst mit br\xF6tchen": {
    grams: 180,
    unit: "stk"
  },
  "porridge haferflocken": {
    grams: 250,
    unit: "g"
  },
  "berliner pfannkuchen": {
    grams: 65,
    unit: "stk"
  },
  "kichererbsen gekocht": {
    grams: 150,
    unit: "g"
  },
  "griechischer joghurt": {
    grams: 150,
    unit: "g"
  },
  "isotonisches getr\xE4nk": {
    grams: 500,
    unit: "ml"
  },
  "basmatireis gekocht": {
    grams: 180,
    unit: "g"
  },
  "tomatenmark portion": {
    grams: 30,
    unit: "g"
  },
  "saure kirschen dose": {
    grams: 150,
    unit: "g"
  },
  "mozzarella scheibe": {
    grams: 25,
    unit: "scheibe"
  },
  h\u00E4hnchenaufschnitt: {
    grams: 20,
    unit: "scheibe"
  },
  "wassermelone st\xFCck": {
    grams: 150,
    unit: "stk"
  },
  "kartoffeln gekocht": {
    grams: 200,
    unit: "g"
  },
  "jasminreis gekocht": {
    grams: 180,
    unit: "g"
  },
  "rinderroulade dose": {
    grams: 400,
    unit: "g"
  },
  "sauerkraut portion": {
    grams: 150,
    unit: "g"
  },
  "mayonnaise portion": {
    grams: 15,
    unit: "g"
  },
  "alkoholfreies bier": {
    grams: 330,
    unit: "ml"
  },
  schweineschnitzel: {
    grams: 150,
    unit: "g"
  },
  "thunfisch in dose": {
    grams: 80,
    unit: "g"
  },
  "spaghetti gekocht": {
    grams: 220,
    unit: "g"
  },
  "kidneybohnen dose": {
    grams: 140,
    unit: "g"
  },
  "passierte tomaten": {
    grams: 200,
    unit: "g"
  },
  "heringsfilet dose": {
    grams: 100,
    unit: "g"
  },
  "pain au chocolat": {
    grams: 70,
    unit: "stk"
  },
  "belgische waffel": {
    grams: 80,
    unit: "stk"
  },
  "american pancake": {
    grams: 70,
    unit: "stk"
  },
  "pizza margherita": {
    grams: 330,
    unit: "stk"
  },
  "schinken gekocht": {
    grams: 20,
    unit: "scheibe"
  },
  rueucherschinken: {
    grams: 20,
    unit: "scheibe"
  },
  "hartgekochtes ei": {
    grams: 55,
    unit: "stk"
  },
  h\u00E4hnchenschenkel: {
    grams: 130,
    unit: "g"
  },
  "hackfleisch rind": {
    grams: 150,
    unit: "g"
  },
  "wiener schnitzel": {
    grams: 150,
    unit: "g"
  },
  schweinekotelett: {
    grams: 150,
    unit: "g"
  },
  "thunfisch frisch": {
    grams: 150,
    unit: "g"
  },
  "couscous gekocht": {
    grams: 180,
    unit: "g"
  },
  "champignons dose": {
    grams: 140,
    unit: "g"
  },
  multivitaminsaft: {
    grams: 200,
    unit: "ml"
  },
  "hei\xDFe schokolade": {
    grams: 250,
    unit: "ml"
  },
  "schokolade tafel": {
    grams: 40,
    unit: "stk"
  },
  "mcdonalds burger": {
    grams: 200,
    unit: "stk"
  },
  "mcdonalds pommes": {
    grams: 110,
    unit: "g"
  },
  "mozzarella kugel": {
    grams: 125,
    unit: "stk"
  },
  b\u00FCffelmozzarella: {
    grams: 125,
    unit: "stk"
  },
  "rustikales brot": {
    grams: 40,
    unit: "scheibe"
  },
  "tortilla weizen": {
    grams: 65,
    unit: "stk"
  },
  r\u00E4ucherschinken: {
    grams: 20,
    unit: "scheibe"
  },
  wurstaufschnitt: {
    grams: 20,
    unit: "scheibe"
  },
  "pute aufschnitt": {
    grams: 20,
    unit: "scheibe"
  },
  "geriebener k\xE4se": {
    grams: 15,
    unit: "g"
  },
  putenbrustfilet: {
    grams: 150,
    unit: "g"
  },
  fleischb\u00E4llchen: {
    grams: 50,
    unit: "stk"
  },
  "hamburger patty": {
    grams: 120,
    unit: "stk"
  },
  "chicken nuggets": {
    grams: 120,
    unit: "g"
  },
  "thunfisch steak": {
    grams: 150,
    unit: "g"
  },
  "sashimi portion": {
    grams: 120,
    unit: "g"
  },
  "fusilli gekocht": {
    grams: 220,
    unit: "g"
  },
  "lasagne portion": {
    grams: 350,
    unit: "g"
  },
  "chili con carne": {
    grams: 350,
    unit: "g"
  },
  "maisk\xF6rner dose": {
    grams: 140,
    unit: "g"
  },
  "ketchup portion": {
    grams: 15,
    unit: "g"
  },
  "latte macchiato": {
    grams: 200,
    unit: "ml"
  },
  fruehlingsrolle: {
    grams: 50,
    unit: "stk"
  },
  "vollkorn toast": {
    grams: 40,
    unit: "scheibe"
  },
  laugenbr\u00F6tchen: {
    grams: 60,
    unit: "stk"
  },
  "salami scheibe": {
    grams: 15,
    unit: "scheibe"
  },
  "roher schinken": {
    grams: 15,
    unit: "scheibe"
  },
  "parma schinken": {
    grams: 15,
    unit: "scheibe"
  },
  "beeren portion": {
    grams: 125,
    unit: "stk"
  },
  melonenscheibe: {
    grams: 150,
    unit: "stk"
  },
  "kartoffeln roh": {
    grams: 150,
    unit: "g"
  },
  kartoffelp\u00FCree: {
    grams: 200,
    unit: "g"
  },
  suesskartoffel: {
    grams: 180,
    unit: "g"
  },
  "erbsen gekocht": {
    grams: 120,
    unit: "g"
  },
  "linsen gekocht": {
    grams: 150,
    unit: "g"
  },
  fruehstuecksei: {
    grams: 55,
    unit: "stk"
  },
  "fettarme milch": {
    grams: 200,
    unit: "ml"
  },
  "cottage cheese": {
    grams: 150,
    unit: "g"
  },
  haehnchenbrust: {
    grams: 150,
    unit: "g"
  },
  "chicken breast": {
    grams: 150,
    unit: "g"
  },
  "pute schnitzel": {
    grams: 150,
    unit: "g"
  },
  schweinebraten: {
    grams: 150,
    unit: "g"
  },
  h\u00E4hnchenfl\u00FCgel: {
    grams: 150,
    unit: "g"
  },
  "thunfisch dose": {
    grams: 80,
    unit: "g"
  },
  fischstaebchen: {
    grams: 120,
    unit: "g"
  },
  "nudeln gekocht": {
    grams: 220,
    unit: "g"
  },
  "bulgur gekocht": {
    grams: 180,
    unit: "g"
  },
  kartoffelsalat: {
    grams: 150,
    unit: "g"
  },
  kartoffelchips: {
    grams: 30,
    unit: "g"
  },
  "pfirsiche dose": {
    grams: 140,
    unit: "g"
  },
  "monster energy": {
    grams: 250,
    unit: "dose"
  },
  fr\u00FChlingsrolle: {
    grams: 50,
    unit: "stk"
  },
  marmeladenbrot: {
    grams: 60,
    unit: "stk"
  },
  "protein riegel": {
    grams: 60,
    unit: "stk"
  },
  "hummus portion": {
    grams: 80,
    unit: "g"
  },
  "protein pulver": {
    grams: 30,
    unit: "g"
  },
  pizzaschnitte: {
    grams: 120,
    unit: "stk"
  },
  "bacon scheibe": {
    grams: 15,
    unit: "scheibe"
  },
  "kartoffel roh": {
    grams: 150,
    unit: "g"
  },
  kartoffelbrei: {
    grams: 200,
    unit: "g"
  },
  knoblauchzehe: {
    grams: 5,
    unit: "stk"
  },
  "ingwer frisch": {
    grams: 15,
    unit: "g"
  },
  "joghurt natur": {
    grams: 150,
    unit: "g"
  },
  "cr\xE8me fra\xEEche": {
    grams: 30,
    unit: "g"
  },
  "creme fraiche": {
    grams: 30,
    unit: "g"
  },
  h\u00E4hnchenbrust: {
    grams: 150,
    unit: "g"
  },
  h\u00E4hnchenkeule: {
    grams: 130,
    unit: "g"
  },
  "h\xE4hnchen ganz": {
    grams: 200,
    unit: "g"
  },
  grillh\u00E4hnchen: {
    grams: 200,
    unit: "g"
  },
  schweinebauch: {
    grams: 150,
    unit: "g"
  },
  doenerfleisch: {
    grams: 120,
    unit: "g"
  },
  "kebab fleisch": {
    grams: 120,
    unit: "g"
  },
  "chicken wings": {
    grams: 150,
    unit: "g"
  },
  speckstreifen: {
    grams: 40,
    unit: "g"
  },
  forellenfilet: {
    grams: 150,
    unit: "g"
  },
  fischst\u00E4bchen: {
    grams: 120,
    unit: "g"
  },
  "pasta gekocht": {
    grams: 220,
    unit: "g"
  },
  "penne gekocht": {
    grams: 220,
    unit: "g"
  },
  "pommes frites": {
    grams: 150,
    unit: "g"
  },
  "suppe portion": {
    grams: 300,
    unit: "g"
  },
  "instant suppe": {
    grams: 250,
    unit: "ml"
  },
  "sardinen dose": {
    grams: 90,
    unit: "g"
  },
  "peperoni glas": {
    grams: 30,
    unit: "g"
  },
  erdnussbutter: {
    grams: 20,
    unit: "g"
  },
  "honig portion": {
    grams: 20,
    unit: "g"
  },
  mineralwasser: {
    grams: 500,
    unit: "ml"
  },
  sprudelwasser: {
    grams: 330,
    unit: "ml"
  },
  "schwarzer tee": {
    grams: 250,
    unit: "ml"
  },
  "protein shake": {
    grams: 300,
    unit: "ml"
  },
  "club sandwich": {
    grams: 200,
    unit: "g"
  },
  "pommes medium": {
    grams: 110,
    unit: "g"
  },
  tiefk\u00FChlpizza: {
    grams: 350,
    unit: "stk"
  },
  fischbr\u00F6tchen: {
    grams: 250,
    unit: "stk"
  },
  toastscheibe: {
    grams: 25,
    unit: "scheibe"
  },
  vollkornbrot: {
    grams: 40,
    unit: "scheibe"
  },
  "brot scheibe": {
    grams: 35,
    unit: "scheibe"
  },
  pumpernickel: {
    grams: 12,
    unit: "stk"
  },
  laugenbrezel: {
    grams: 85,
    unit: "stk"
  },
  laugenstange: {
    grams: 85,
    unit: "stk"
  },
  korbbr\u00F6tchen: {
    grams: 60,
    unit: "stk"
  },
  kaisersemmel: {
    grams: 60,
    unit: "stk"
  },
  palatschinke: {
    grams: 80,
    unit: "stk"
  },
  "pizza salami": {
    grams: 330,
    unit: "stk"
  },
  "scheibe k\xE4se": {
    grams: 30,
    unit: "scheibe"
  },
  kaesescheibe: {
    grams: 30,
    unit: "scheibe"
  },
  fleischkaese: {
    grams: 25,
    unit: "scheibe"
  },
  kochschinken: {
    grams: 20,
    unit: "scheibe"
  },
  "apfel mittel": {
    grams: 170,
    unit: "stk"
  },
  "ananas st\xFCck": {
    grams: 120,
    unit: "stk"
  },
  s\u00FC\u00DFkartoffel: {
    grams: 180,
    unit: "g"
  },
  "gr\xFCne bohnen": {
    grams: 120,
    unit: "g"
  },
  kichererbsen: {
    grams: 150,
    unit: "g"
  },
  "gekochtes ei": {
    grams: 55,
    unit: "stk"
  },
  fr\u00FChst\u00FCcksei: {
    grams: 55,
    unit: "stk"
  },
  "k\xE4se streuer": {
    grams: 15,
    unit: "g"
  },
  grie\u00DFpudding: {
    grams: 150,
    unit: "g"
  },
  schweinehack: {
    grams: 150,
    unit: "g"
  },
  hackb\u00E4llchen: {
    grams: 50,
    unit: "stk"
  },
  "burger patty": {
    grams: 120,
    unit: "stk"
  },
  d\u00F6nerfleisch: {
    grams: 120,
    unit: "g"
  },
  lammkotelett: {
    grams: 150,
    unit: "g"
  },
  miesmuscheln: {
    grams: 150,
    unit: "g"
  },
  "reis gekocht": {
    grams: 180,
    unit: "g"
  },
  haferflocken: {
    grams: 50,
    unit: "g"
  },
  "french fries": {
    grams: 150,
    unit: "g"
  },
  tomatensuppe: {
    grams: 300,
    unit: "g"
  },
  "tomaten dose": {
    grams: 200,
    unit: "g"
  },
  "makrele dose": {
    grams: 90,
    unit: "g"
  },
  "ravioli dose": {
    grams: 400,
    unit: "g"
  },
  "senf portion": {
    grams: 10,
    unit: "g"
  },
  "energy drink": {
    grams: 250,
    unit: "dose"
  },
  proteinshake: {
    grams: 300,
    unit: "ml"
  },
  schokoriegel: {
    grams: 40,
    unit: "stk"
  },
  gummib\u00E4rchen: {
    grams: 50,
    unit: "g"
  },
  "brezel snack": {
    grams: 2,
    unit: "stk"
  },
  nussmischung: {
    grams: 30,
    unit: "g"
  },
  "kuchen st\xFCck": {
    grams: 80,
    unit: "stk"
  },
  cheeseburger: {
    grams: 200,
    unit: "stk"
  },
  "frozen pizza": {
    grams: 350,
    unit: "stk"
  },
  "riegel m\xFCsli": {
    grams: 40,
    unit: "stk"
  },
  "whey portion": {
    grams: 30,
    unit: "g"
  },
  buttertoast: {
    grams: 25,
    unit: "scheibe"
  },
  brotscheibe: {
    grams: 35,
    unit: "scheibe"
  },
  knaeckebrot: {
    grams: 12,
    unit: "stk"
  },
  pfannkuchen: {
    grams: 80,
    unit: "stk"
  },
  "pizza st\xFCck": {
    grams: 120,
    unit: "stk"
  },
  k\u00E4sescheibe: {
    grams: 30,
    unit: "scheibe"
  },
  fleischk\u00E4se: {
    grams: 25,
    unit: "scheibe"
  },
  gurkensalat: {
    grams: 100,
    unit: "g"
  },
  "bohnen gr\xFCn": {
    grams: 120,
    unit: "g"
  },
  gew\u00FCrzgurke: {
    grams: 30,
    unit: "g"
  },
  speisequark: {
    grams: 200,
    unit: "g"
  },
  buttermilch: {
    grams: 200,
    unit: "ml"
  },
  schlagsahne: {
    grams: 30,
    unit: "g"
  },
  rindfleisch: {
    grams: 200,
    unit: "g"
  },
  rindersteak: {
    grams: 200,
    unit: "g"
  },
  nuernberger: {
    grams: 90,
    unit: "g"
  },
  wildschwein: {
    grams: 150,
    unit: "g"
  },
  tintenfisch: {
    grams: 120,
    unit: "g"
  },
  "sushi st\xFCck": {
    grams: 35,
    unit: "stk"
  },
  m\u00FCsliriegel: {
    grams: 40,
    unit: "stk"
  },
  gem\u00FCsesuppe: {
    grams: 300,
    unit: "g"
  },
  h\u00FChnersuppe: {
    grams: 300,
    unit: "g"
  },
  "erbsen dose": {
    grams: 140,
    unit: "g"
  },
  "bohnen dose": {
    grams: 140,
    unit: "g"
  },
  tomatenmark: {
    grams: 30,
    unit: "g"
  },
  "ananas dose": {
    grams: 140,
    unit: "g"
  },
  dosennudeln: {
    grams: 400,
    unit: "g"
  },
  "corned beef": {
    grams: 80,
    unit: "g"
  },
  "oliven glas": {
    grams: 50,
    unit: "g"
  },
  orangensaft: {
    grams: 200,
    unit: "ml"
  },
  kokoswasser: {
    grams: 330,
    unit: "ml"
  },
  "eis portion": {
    grams: 100,
    unit: "g"
  },
  "torte st\xFCck": {
    grams: 80,
    unit: "stk"
  },
  "d\xF6ner kebab": {
    grams: 350,
    unit: "g"
  },
  bauernbrot: {
    grams: 40,
    unit: "scheibe"
  },
  kn\u00E4ckebrot: {
    grams: 12,
    unit: "stk"
  },
  crispbread: {
    grams: 12,
    unit: "stk"
  },
  fladenbrot: {
    grams: 65,
    unit: "stk"
  },
  pizzast\u00FCck: {
    grams: 120,
    unit: "stk"
  },
  emmentaler: {
    grams: 30,
    unit: "scheibe"
  },
  butterk\u00E4se: {
    grams: 30,
    unit: "scheibe"
  },
  schafsk\u00E4se: {
    grams: 30,
    unit: "scheibe"
  },
  parmigiano: {
    grams: 10,
    unit: "scheibe"
  },
  leberkaese: {
    grams: 55,
    unit: "scheibe"
  },
  mortadella: {
    grams: 20,
    unit: "scheibe"
  },
  aufschnitt: {
    grams: 20,
    unit: "scheibe"
  },
  clementine: {
    grams: 150,
    unit: "stk"
  },
  weintraube: {
    grams: 100,
    unit: "stk"
  },
  salatgurke: {
    grams: 150,
    unit: "g"
  },
  blumenkohl: {
    grams: 150,
    unit: "g"
  },
  "spinat roh": {
    grams: 80,
    unit: "g"
  },
  blattsalat: {
    grams: 80,
    unit: "g"
  },
  champignon: {
    grams: 100,
    unit: "g"
  },
  mischpilze: {
    grams: 100,
    unit: "g"
  },
  maiskolben: {
    grams: 150,
    unit: "g"
  },
  krautsalat: {
    grams: 120,
    unit: "g"
  },
  radieschen: {
    grams: 60,
    unit: "g"
  },
  "ei gekocht": {
    grams: 55,
    unit: "stk"
  },
  magerquark: {
    grams: 200,
    unit: "g"
  },
  h\u00FCttenk\u00E4se: {
    grams: 150,
    unit: "g"
  },
  mascarpone: {
    grams: 50,
    unit: "g"
  },
  "pute brust": {
    grams: 150,
    unit: "g"
  },
  putenbrust: {
    grams: 150,
    unit: "g"
  },
  rinderhack: {
    grams: 150,
    unit: "g"
  },
  grillwurst: {
    grams: 100,
    unit: "stk"
  },
  currywurst: {
    grams: 150,
    unit: "g"
  },
  leberwurst: {
    grams: 30,
    unit: "g"
  },
  n\u00FCrnberger: {
    grams: 90,
    unit: "g"
  },
  frikadelle: {
    grams: 80,
    unit: "stk"
  },
  entenbrust: {
    grams: 150,
    unit: "g"
  },
  kalbsleber: {
    grams: 120,
    unit: "g"
  },
  lachsfilet: {
    grams: 150,
    unit: "g"
  },
  cornflakes: {
    grams: 40,
    unit: "g"
  },
  reiswaffel: {
    grams: 8,
    unit: "stk"
  },
  t\u00FCtensuppe: {
    grams: 250,
    unit: "ml"
  },
  sauerkraut: {
    grams: 150,
    unit: "g"
  },
  "light cola": {
    grams: 330,
    unit: "dose"
  },
  weizenbier: {
    grams: 500,
    unit: "ml"
  },
  cappuccino: {
    grams: 200,
    unit: "ml"
  },
  kr\u00E4utertee: {
    grams: 250,
    unit: "ml"
  },
  milchshake: {
    grams: 400,
    unit: "ml"
  },
  gummib\u00E4ren: {
    grams: 50,
    unit: "g"
  },
  "chips t\xFCte": {
    grams: 40,
    unit: "g"
  },
  salzstange: {
    grams: 2,
    unit: "stk"
  },
  butterkeks: {
    grams: 12,
    unit: "stk"
  },
  "tofu natur": {
    grams: 150,
    unit: "g"
  },
  "\xF6l portion": {
    grams: 10,
    unit: "ml"
  },
  weissbrot: {
    grams: 40,
    unit: "scheibe"
  },
  mischbrot: {
    grams: 40,
    unit: "scheibe"
  },
  broetchen: {
    grams: 60,
    unit: "stk"
  },
  croissant: {
    grams: 70,
    unit: "stk"
  },
  leberk\u00E4se: {
    grams: 55,
    unit: "scheibe"
  },
  mandarine: {
    grams: 150,
    unit: "stk"
  },
  nektarine: {
    grams: 150,
    unit: "stk"
  },
  zwetschge: {
    grams: 60,
    unit: "stk"
  },
  feldsalat: {
    grams: 80,
    unit: "g"
  },
  courgette: {
    grams: 150,
    unit: "g"
  },
  aubergine: {
    grams: 200,
    unit: "g"
  },
  knoblauch: {
    grams: 5,
    unit: "stk"
  },
  spiegelei: {
    grams: 110,
    unit: "stk"
  },
  vollmilch: {
    grams: 200,
    unit: "ml"
  },
  margarine: {
    grams: 15,
    unit: "g"
  },
  entrec\u00F4te: {
    grams: 200,
    unit: "g"
  },
  entrecote: {
    grams: 200,
    unit: "g"
  },
  rumpsteak: {
    grams: 200,
    unit: "g"
  },
  schnitzel: {
    grams: 150,
    unit: "g"
  },
  bratwurst: {
    grams: 100,
    unit: "stk"
  },
  bockwurst: {
    grams: 100,
    unit: "stk"
  },
  wei\u00DFwurst: {
    grams: 100,
    unit: "stk"
  },
  mettwurst: {
    grams: 30,
    unit: "g"
  },
  cabanossi: {
    grams: 50,
    unit: "g"
  },
  spareribs: {
    grams: 200,
    unit: "g"
  },
  kroketten: {
    grams: 100,
    unit: "g"
  },
  "mais dose": {
    grams: 140,
    unit: "g"
  },
  marmelade: {
    grams: 20,
    unit: "g"
  },
  konfit\u00FCre: {
    grams: 20,
    unit: "g"
  },
  sojasauce: {
    grams: 15,
    unit: "ml"
  },
  "coca cola": {
    grams: 330,
    unit: "dose"
  },
  "cola zero": {
    grams: 330,
    unit: "dose"
  },
  apfelsaft: {
    grams: 200,
    unit: "ml"
  },
  "saft glas": {
    grams: 200,
    unit: "ml"
  },
  "wein glas": {
    grams: 125,
    unit: "ml"
  },
  "sekt glas": {
    grams: 100,
    unit: "ml"
  },
  eisbecher: {
    grams: 100,
    unit: "g"
  },
  hamburger: {
    grams: 200,
    unit: "stk"
  },
  "sushi box": {
    grams: 400,
    unit: "g"
  },
  "poke bowl": {
    grams: 400,
    unit: "g"
  },
  honigbrot: {
    grams: 60,
    unit: "stk"
  },
  "acai bowl": {
    grams: 350,
    unit: "g"
  },
  guacamole: {
    grams: 50,
    unit: "g"
  },
  graubrot: {
    grams: 40,
    unit: "scheibe"
  },
  wei\u00DFbrot: {
    grams: 40,
    unit: "scheibe"
  },
  baguette: {
    grams: 80,
    unit: "stk"
  },
  ciabatta: {
    grams: 80,
    unit: "stk"
  },
  focaccia: {
    grams: 80,
    unit: "stk"
  },
  br\u00F6tchen: {
    grams: 60,
    unit: "stk"
  },
  schrippe: {
    grams: 60,
    unit: "stk"
  },
  berliner: {
    grams: 70,
    unit: "stk"
  },
  tilsiter: {
    grams: 30,
    unit: "scheibe"
  },
  parmesan: {
    grams: 10,
    unit: "scheibe"
  },
  schinken: {
    grams: 20,
    unit: "scheibe"
  },
  pfirsich: {
    grams: 150,
    unit: "stk"
  },
  erdbeere: {
    grams: 125,
    unit: "stk"
  },
  himbeere: {
    grams: 125,
    unit: "stk"
  },
  peperoni: {
    grams: 150,
    unit: "g"
  },
  zwiebeln: {
    grams: 80,
    unit: "g"
  },
  brokkoli: {
    grams: 150,
    unit: "g"
  },
  broccoli: {
    grams: 150,
    unit: "g"
  },
  zucchini: {
    grams: 150,
    unit: "g"
  },
  wei\u00DFkohl: {
    grams: 120,
    unit: "g"
  },
  kotelett: {
    grams: 150,
    unit: "g"
  },
  teewurst: {
    grams: 30,
    unit: "g"
  },
  "corn dog": {
    grams: 100,
    unit: "stk"
  },
  kabeljau: {
    grams: 150,
    unit: "g"
  },
  seelachs: {
    grams: 150,
    unit: "g"
  },
  garnelen: {
    grams: 120,
    unit: "g"
  },
  muscheln: {
    grams: 150,
    unit: "g"
  },
  calamari: {
    grams: 120,
    unit: "g"
  },
  couscous: {
    grams: 180,
    unit: "g"
  },
  porridge: {
    grams: 50,
    unit: "g"
  },
  limonade: {
    grams: 330,
    unit: "dose"
  },
  smoothie: {
    grams: 300,
    unit: "ml"
  },
  "red bull": {
    grams: 250,
    unit: "dose"
  },
  wei\u00DFwein: {
    grams: 125,
    unit: "ml"
  },
  prosecco: {
    grams: 100,
    unit: "ml"
  },
  espresso: {
    grams: 200,
    unit: "ml"
  },
  powerade: {
    grams: 500,
    unit: "ml"
  },
  gatorade: {
    grams: 500,
    unit: "ml"
  },
  erdn\u00FCsse: {
    grams: 30,
    unit: "g"
  },
  lahmacun: {
    grams: 250,
    unit: "g"
  },
  sandwich: {
    grams: 200,
    unit: "g"
  },
  powerbar: {
    grams: 60,
    unit: "stk"
  },
  oliven\u00F6l: {
    grams: 10,
    unit: "ml"
  },
  weckerl: {
    grams: 60,
    unit: "stk"
  },
  krapfen: {
    grams: 70,
    unit: "stk"
  },
  cupcake: {
    grams: 90,
    unit: "stk"
  },
  pancake: {
    grams: 70,
    unit: "stk"
  },
  cheddar: {
    grams: 25,
    unit: "scheibe"
  },
  serrano: {
    grams: 15,
    unit: "scheibe"
  },
  pflaume: {
    grams: 60,
    unit: "stk"
  },
  avocado: {
    grams: 80,
    unit: "stk"
  },
  zitrone: {
    grams: 60,
    unit: "stk"
  },
  limette: {
    grams: 60,
    unit: "stk"
  },
  tomaten: {
    grams: 120,
    unit: "g"
  },
  paprika: {
    grams: 150,
    unit: "g"
  },
  zwiebel: {
    grams: 80,
    unit: "g"
  },
  karotte: {
    grams: 100,
    unit: "g"
  },
  rotkohl: {
    grams: 120,
    unit: "g"
  },
  spargel: {
    grams: 150,
    unit: "g"
  },
  rettich: {
    grams: 80,
    unit: "g"
  },
  pickles: {
    grams: 30,
    unit: "g"
  },
  omelett: {
    grams: 110,
    unit: "stk"
  },
  joghurt: {
    grams: 150,
    unit: "g"
  },
  schmand: {
    grams: 30,
    unit: "g"
  },
  pudding: {
    grams: 150,
    unit: "g"
  },
  kabanos: {
    grams: 50,
    unit: "g"
  },
  bulette: {
    grams: 80,
    unit: "stk"
  },
  nuggets: {
    grams: 120,
    unit: "g"
  },
  "hot dog": {
    grams: 100,
    unit: "stk"
  },
  forelle: {
    grams: 150,
    unit: "g"
  },
  makrele: {
    grams: 150,
    unit: "g"
  },
  scholle: {
    grams: 150,
    unit: "g"
  },
  shrimps: {
    grams: 120,
    unit: "g"
  },
  lasagne: {
    grams: 350,
    unit: "g"
  },
  eintopf: {
    grams: 350,
    unit: "g"
  },
  gulasch: {
    grams: 350,
    unit: "g"
  },
  nutella: {
    grams: 20,
    unit: "g"
  },
  sprudel: {
    grams: 330,
    unit: "ml"
  },
  "ice tea": {
    grams: 330,
    unit: "dose"
  },
  rotwein: {
    grams: 125,
    unit: "ml"
  },
  popcorn: {
    grams: 40,
    unit: "g"
  },
  walnuss: {
    grams: 30,
    unit: "g"
  },
  mandeln: {
    grams: 30,
    unit: "g"
  },
  brownie: {
    grams: 60,
    unit: "stk"
  },
  dueruem: {
    grams: 400,
    unit: "g"
  },
  burrito: {
    grams: 350,
    unit: "g"
  },
  "big mac": {
    grams: 200,
    unit: "stk"
  },
  falafel: {
    grams: 30,
    unit: "stk"
  },
  brezel: {
    grams: 85,
    unit: "stk"
  },
  semmel: {
    grams: 60,
    unit: "stk"
  },
  muffin: {
    grams: 90,
    unit: "stk"
  },
  waffel: {
    grams: 80,
    unit: "stk"
  },
  edamer: {
    grams: 30,
    unit: "scheibe"
  },
  salami: {
    grams: 15,
    unit: "scheibe"
  },
  lyoner: {
    grams: 20,
    unit: "scheibe"
  },
  banane: {
    grams: 120,
    unit: "stk"
  },
  orange: {
    grams: 150,
    unit: "stk"
  },
  traube: {
    grams: 100,
    unit: "stk"
  },
  tomate: {
    grams: 120,
    unit: "g"
  },
  moehre: {
    grams: 100,
    unit: "g"
  },
  spinat: {
    grams: 80,
    unit: "g"
  },
  rucola: {
    grams: 80,
    unit: "g"
  },
  erbsen: {
    grams: 120,
    unit: "g"
  },
  linsen: {
    grams: 150,
    unit: "g"
  },
  porree: {
    grams: 80,
    unit: "g"
  },
  oliven: {
    grams: 30,
    unit: "g"
  },
  r\u00FChrei: {
    grams: 110,
    unit: "stk"
  },
  omelet: {
    grams: 110,
    unit: "stk"
  },
  butter: {
    grams: 15,
    unit: "g"
  },
  hirsch: {
    grams: 150,
    unit: "g"
  },
  hotdog: {
    grams: 100,
    unit: "stk"
  },
  hering: {
    grams: 100,
    unit: "g"
  },
  matjes: {
    grams: 100,
    unit: "g"
  },
  muesli: {
    grams: 60,
    unit: "g"
  },
  pommes: {
    grams: 150,
    unit: "g"
  },
  roesti: {
    grams: 120,
    unit: "g"
  },
  borsch: {
    grams: 300,
    unit: "g"
  },
  wasser: {
    grams: 500,
    unit: "ml"
  },
  sprite: {
    grams: 330,
    unit: "dose"
  },
  eistee: {
    grams: 330,
    unit: "dose"
  },
  radler: {
    grams: 330,
    unit: "ml"
  },
  kaffee: {
    grams: 200,
    unit: "ml"
  },
  doener: {
    grams: 350,
    unit: "g"
  },
  panini: {
    grams: 220,
    unit: "g"
  },
  burger: {
    grams: 200,
    unit: "stk"
  },
  tempeh: {
    grams: 120,
    unit: "g"
  },
  seitan: {
    grams: 120,
    unit: "g"
  },
  toast: {
    grams: 25,
    unit: "scheibe"
  },
  breze: {
    grams: 85,
    unit: "stk"
  },
  donut: {
    grams: 65,
    unit: "stk"
  },
  crepe: {
    grams: 80,
    unit: "stk"
  },
  bagel: {
    grams: 90,
    unit: "stk"
  },
  gouda: {
    grams: 30,
    unit: "scheibe"
  },
  speck: {
    grams: 15,
    unit: "scheibe"
  },
  apfel: {
    grams: 170,
    unit: "stk"
  },
  birne: {
    grams: 170,
    unit: "stk"
  },
  mango: {
    grams: 200,
    unit: "stk"
  },
  gurke: {
    grams: 150,
    unit: "g"
  },
  m\u00F6hre: {
    grams: 100,
    unit: "g"
  },
  salat: {
    grams: 80,
    unit: "g"
  },
  rauke: {
    grams: 80,
    unit: "g"
  },
  pilze: {
    grams: 100,
    unit: "g"
  },
  lauch: {
    grams: 80,
    unit: "g"
  },
  chili: {
    grams: 10,
    unit: "g"
  },
  quark: {
    grams: 200,
    unit: "g"
  },
  milch: {
    grams: 200,
    unit: "ml"
  },
  sahne: {
    grams: 30,
    unit: "g"
  },
  gyros: {
    grams: 150,
    unit: "g"
  },
  leber: {
    grams: 120,
    unit: "g"
  },
  bacon: {
    grams: 40,
    unit: "g"
  },
  lachs: {
    grams: 150,
    unit: "g"
  },
  m\u00FCsli: {
    grams: 60,
    unit: "g"
  },
  r\u00F6sti: {
    grams: 120,
    unit: "g"
  },
  chips: {
    grams: 30,
    unit: "g"
  },
  ramen: {
    grams: 400,
    unit: "g"
  },
  pepsi: {
    grams: 330,
    unit: "dose"
  },
  fanta: {
    grams: 330,
    unit: "dose"
  },
  kakao: {
    grams: 250,
    unit: "ml"
  },
  d\u00F6ner: {
    grams: 350,
    unit: "g"
  },
  d\u00FCr\u00FCm: {
    grams: 400,
    unit: "g"
  },
  essig: {
    grams: 10,
    unit: "ml"
  },
  wrap: {
    grams: 65,
    unit: "stk"
  },
  pita: {
    grams: 80,
    unit: "stk"
  },
  naan: {
    grams: 80,
    unit: "stk"
  },
  feta: {
    grams: 30,
    unit: "scheibe"
  },
  kiwi: {
    grams: 75,
    unit: "stk"
  },
  mais: {
    grams: 150,
    unit: "g"
  },
  skyr: {
    grams: 150,
    unit: "g"
  },
  lamm: {
    grams: 150,
    unit: "g"
  },
  ente: {
    grams: 150,
    unit: "g"
  },
  gans: {
    grams: 150,
    unit: "g"
  },
  ribs: {
    grams: 200,
    unit: "g"
  },
  maki: {
    grams: 35,
    unit: "stk"
  },
  mayo: {
    grams: 15,
    unit: "g"
  },
  cola: {
    grams: 330,
    unit: "dose"
  },
  bier: {
    grams: 500,
    unit: "ml"
  },
  pils: {
    grams: 500,
    unit: "ml"
  },
  keks: {
    grams: 12,
    unit: "stk"
  },
  taco: {
    grams: 120,
    unit: "stk"
  },
  reh: {
    grams: 150,
    unit: "g"
  },
  pho: {
    grams: 400,
    unit: "g"
  },
  tee: {
    grams: 250,
    unit: "ml"
  }
};

// src/lib/nutrition/defaultPortionLookup.ts
var portionMap = defaultPortions_de_default;
function lookupDefaultPortion(foodName) {
  const key = foodName.trim().toLowerCase();
  if (!key) return null;
  let bestHint = null;
  let best = null;
  for (const [hint, value] of Object.entries(portionMap)) {
    if (!hint || !key.includes(hint)) continue;
    if (!bestHint || hint.length > bestHint.length) {
      bestHint = hint;
      best = value;
    }
  }
  return best;
}

// src/lib/nutrition/portionCatalog.ts
var ENERGY_DRINK_RE = /\b(red\s*bull|monster|energy|cola|fanta|sprite|pepsi|mate)\b/i;
var CAN_ML = /* @__PURE__ */ new Set([250, 330, 355, 473, 500]);
function isEnergyDrinkCan(food, grams) {
  if (food.category !== "drink") return false;
  return ENERGY_DRINK_RE.test(food.name) && CAN_ML.has(grams);
}
function servingToOption(food, serving, index) {
  const mapped = servingToLogPortion(food, serving);
  if (!mapped) return null;
  let label = serving.name;
  let logUnit = mapped.unit;
  if (isEnergyDrinkCan(food, serving.grams) && !/dose/i.test(label)) {
    label = `1 Dose (${serving.grams} ml)`;
    logUnit = "dose";
  }
  return {
    id: `srv_${index}_${serving.grams}`,
    label,
    logUnit,
    quantity: mapped.quantity,
    grams: serving.grams,
    source: /packung|flasche|dose/i.test(label) ? "off_pack" : "off_serving"
  };
}
function unitLabel(unit) {
  if (unit === "stk") return "St\xFCck";
  if (unit === "scheibe") return "Scheibe";
  if (unit === "dose") return "Dose";
  if (unit === "glas") return "Glas";
  if (unit === "flasche") return "Flasche";
  return unit;
}
function defaultFromPortionsJson(food) {
  const v = lookupDefaultPortion(food.name);
  if (!v) return null;
  const isMass = v.unit === "g";
  const isVolume = v.unit === "ml";
  const label = isMass ? `${v.grams} g` : isVolume ? `${v.grams} ml` : `1 ${unitLabel(v.unit)} (${v.grams} ${v.unit === "dose" || v.unit === "glas" || v.unit === "flasche" ? "ml" : "g"})`;
  return {
    id: `gen_def_${food.name.slice(0, 24)}`,
    label,
    logUnit: v.unit,
    quantity: 1,
    grams: v.grams,
    source: "generic_default"
  };
}
function buildPortionOptions(food, userPref) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  if (userPref) {
    const fromUser = portionOptionFromUserPref(
      userPref,
      food.servings?.find((s) => s.grams > 0)?.grams ?? 100
    );
    out.push(fromUser);
    seen.add(`${fromUser.logUnit}:${fromUser.grams}`);
  }
  const add = (opt) => {
    const k = `${opt.logUnit}:${opt.grams}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(opt);
  };
  (food.servings ?? []).forEach((s, i) => {
    const opt = servingToOption(food, s, i);
    if (opt) add(opt);
  });
  for (const qa of getLogPortionQuickActions(food, 8)) {
    add({
      id: `qa_${qa.unit}_${qa.quantity}`,
      label: qa.label,
      logUnit: qa.unit,
      quantity: qa.quantity,
      grams: qa.unit === "g" || qa.unit === "ml" ? qa.quantity : Math.max(1, Math.round((food.servings?.find((s) => s.grams > 0)?.grams ?? 100) * qa.quantity)),
      source: "off_pack"
    });
  }
  const gen = defaultFromPortionsJson(food);
  if (gen) add(gen);
  if (out.length === 0) {
    const def = inferDefaultLogPortionForFood(food);
    add({
      id: "fallback",
      label: `${def.quantity} ${def.unit}`,
      logUnit: def.unit,
      quantity: def.quantity,
      grams: def.unit === "g" || def.unit === "ml" ? def.quantity : 100,
      source: "generic_default",
      isDefault: true
    });
  }
  const packFirst = out.find((o) => /dose|flasche|packung/i.test(o.label) || o.logUnit === "dose");
  if (packFirst) packFirst.isDefault = true;
  else if (out[0]) out[0].isDefault = true;
  return out.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
}
function pickDefaultPortion(food, userPref) {
  const opts = buildPortionOptions(food, userPref);
  const userLast = opts.find((o) => o.source === "user_last");
  if (userLast) return userLast;
  return opts.find((o) => o.isDefault) ?? opts[0];
}
function toGrams(option) {
  if (option.logUnit === "g" || option.logUnit === "ml") {
    return Math.max(1, Math.round(option.quantity));
  }
  return Math.max(1, Math.round(option.grams * Math.max(0.01, option.quantity)));
}
function pickPortionForText(food, unit, value) {
  const opts = buildPortionOptions(food);
  const u = unit.toLowerCase();
  if (u === "stk") {
    const piece = opts.find((o) => o.logUnit === "stk");
    if (piece) return { ...piece, quantity: value };
  }
  if (u === "dose" || u === "flasche" || u === "packung") {
    const match = opts.find((o) => o.logUnit === u);
    if (match) return { ...match, quantity: value };
  }
  if (u === "g" || u === "ml") {
    return {
      id: "explicit_g",
      label: `${value} ${u}`,
      logUnit: u,
      quantity: value,
      grams: value,
      source: "generic_default"
    };
  }
  return null;
}

// src/lib/nutrition/macroCalculator.ts
function macrosForGrams(food, grams) {
  const g = Math.max(0, grams);
  const factor = g / 100;
  const n = food.nutrients;
  return {
    kcal: Math.round(n.calories * factor),
    protein: Math.round(n.protein * factor * 10) / 10,
    carbs: Math.round(n.carbs * factor * 10) / 10,
    fat: Math.round(n.fat * factor * 10) / 10
  };
}

// src/lib/nutrition/catalog/resolveComponent.ts
init_genericBaselineResolver();

// src/lib/nutrition/catalog/appCustomFoodsBarcode.ts
init_appCustomFoods();
async function getAppCustomFoodByBarcode(pool2, barcode) {
  const code = String(barcode).replace(/\D/g, "");
  if (code.length < 8) return null;
  const { rows } = await pool2.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at, barcode
     FROM user_custom_foods
     WHERE barcode = $1
     LIMIT 1`,
    [code]
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0]);
}
async function insertAppCustomFoodWithBarcode(pool2, opts) {
  const code = opts.barcode.replace(/\D/g, "");
  const existing = await getAppCustomFoodByBarcode(pool2, code);
  if (existing) return existing;
  const { rows } = await pool2.query(
    `INSERT INTO user_custom_foods (user_id, name, category, nutrients, servings, source, barcode, label_scan_meta)
     VALUES (NULL, $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7::jsonb)
     RETURNING id, name, category, nutrients, servings, composite_ingredients, source, created_at, barcode`,
    [
      opts.name.trim().slice(0, 320),
      opts.category,
      JSON.stringify(opts.nutrients),
      JSON.stringify(opts.servings.length ? opts.servings : [{ name: "100 g", grams: 100 }]),
      opts.source ?? "barcode_label_scan",
      code,
      opts.labelScanMeta ? JSON.stringify(opts.labelScanMeta) : null
    ]
  );
  return rowToFood(rows[0]);
}

// src/lib/nutrition/matchRerankAi.ts
function extractJsonObject(raw) {
  const t2 = raw.trim();
  const start = t2.indexOf("{");
  const end = t2.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(t2.slice(start, end + 1));
}
async function rerankCandidatesWithAi(query, ranked) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled || ranked.length < 2) return null;
  const top = ranked[0]?.score ?? 0;
  if (top >= 0.85) return null;
  const slice = ranked.slice(0, 8);
  const list = slice.map((r, i) => `${i}: ${r.food.name} [${r.food.id}] (score ${r.score.toFixed(2)})`).join("\n");
  const prompt = `Du hilfst bei der Lebensmittel-Zuordnung f\xFCr Ern\xE4hrungstracking (Deutschland).
Der Nutzer meinte: "${query}"

Kandidaten aus Datenbank:
${list}

W\xE4hle den EINEN Index (0-${slice.length - 1}), der am besten zur Beschreibung passt \u2014 kein verpacktes Snack-Produkt wenn rohe Zutat gemeint ist.
Antworte NUR mit JSON: {"index": number}`;
  try {
    const raw = await completeCoachNutritionJson([{ role: "user", content: prompt }]);
    const parsed = extractJsonObject(raw);
    const idx = Number(parsed.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= slice.length) return null;
    const picked = slice[idx];
    return {
      ...picked,
      score: Math.min(0.92, Math.max(picked.score, top + 0.08)),
      reason: "ai_rerank"
    };
  } catch {
    return null;
  }
}
function applyUserFoodBoost(ranked, boosts) {
  if (boosts.size === 0) return ranked;
  return [...ranked].map((r) => {
    const boost = boosts.get(r.food.id) ?? 0;
    if (boost <= 0) return r;
    return {
      ...r,
      score: Math.min(1, r.score + boost),
      reason: boost > 0.05 ? "user_history" : r.reason
    };
  }).sort((a, B) => B.score - a.score);
}

// src/lib/nutrition/catalog/resolveComponent.ts
init_foodSynonyms_de();
init_portionUtils();
var PIECE_REF_RE = /\b(stk|stück|stueck|semmel|brötchen|broetchen)\b/i;
function applyGramGuardrails(food, component, grams) {
  const explicit = component.quantity?.explicit === true;
  let clamped = Math.max(1, Math.round(grams));
  const hardCap = explicit ? 5e3 : 2e3;
  clamped = Math.min(clamped, hardCap);
  if (isCondimentLikePourFood(food)) {
    clamped = Math.min(clamped, explicit ? 80 : 25);
  }
  return clamped;
}
async function resolveCatalogFoodByIdAny(pool2, foodId) {
  if (foodId.startsWith("off_")) {
    const code = foodId.slice(4).replace(/\D/g, "");
    if (!code) return null;
    const { fetchOpenFoodFactsByBarcode: fetchOpenFoodFactsByBarcode2 } = await Promise.resolve().then(() => (init_openFoodFactsFetch(), openFoodFactsFetch_exports));
    return fetchOpenFoodFactsByBarcode2(code).catch(() => null);
  }
  if (foodId.startsWith("generic_")) return getGenericBaselineById(foodId);
  if (foodId.startsWith("ucf_")) return getAppCustomFoodById(pool2, foodId);
  return null;
}
function lineFromFood(food, component, matchScore, matchReason, source, candidates, userPref, extra) {
  const { expertMode, ...lineExtra } = extra ?? {};
  const opts = buildPortionOptions(food, userPref);
  let portion = pickDefaultPortion(food, userPref);
  const explicitQuantity = component.quantity?.explicit === true ? component.quantity.value * (component.quantity.multiplier ?? 1) : null;
  const pieceOption = opts.find((o) => o.logUnit === "stk");
  const hasPieceReference = component.quantity?.unit === "stk" || PIECE_REF_RE.test(`${component.foodHint ?? ""} ${component.rawText ?? ""}`);
  if (pieceOption && hasPieceReference && explicitQuantity != null) {
    portion = { ...pieceOption, quantity: explicitQuantity };
  }
  if (component.quantity?.explicit) {
    const picked = pickPortionForText(
      food,
      component.quantity.unit,
      component.quantity.value * (component.quantity.multiplier ?? 1)
    );
    if (picked) portion = picked;
    else if (component.quantity.unit === "g" || component.quantity.unit === "ml") {
      portion = {
        id: "explicit",
        label: `${component.quantity.value} ${component.quantity.unit}`,
        logUnit: component.quantity.unit,
        quantity: component.quantity.value,
        grams: component.quantity.value,
        source: "generic_default"
      };
    }
  }
  const grams = applyGramGuardrails(food, component, toGrams(portion));
  const per100g = {
    kcal: food.nutrients.calories,
    protein: food.nutrients.protein,
    carbs: food.nutrients.carbs,
    fat: food.nutrients.fat
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
      flags: per100g.kcal <= 0 ? ["missing_energy"] : []
    },
    nutrientSource: "database",
    candidates,
    ...lineExtra
  };
}
function foodSource(food) {
  if (food.id.startsWith("generic_")) return "generic_baseline";
  if (food.catalogSource === "app") return "app";
  return "openfoodfacts";
}
function toCandidates(ranked) {
  return ranked.map((r) => ({
    foodId: r.food.id,
    displayName: r.food.name,
    matchScore: r.score,
    source: r.food.id.startsWith("generic_") ? "generic_baseline" : r.food.catalogSource === "app" ? "app" : "openfoodfacts"
  }));
}
async function resolveMealComponent(pool2, component, opts) {
  const expertMode = opts?.expertMode === true;
  const hint = component.foodHint || component.rawText;
  const normalizedHint = normalizeFoodHint(hint);
  const { foods: offFoods } = await fetchOffCatalogFoods(hint, 12).catch(() => ({ foods: [] }));
  const appFoods = await searchAppCustomFoods(pool2, hint, 8);
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
  const pickReason = auto?.reason ?? medium?.reason ?? "needs_pick";
  if (pickFood && pickScore >= 0.7) {
    const pref = opts?.portionPrefs?.get(pickFood.id) ?? null;
    return lineFromFood(pickFood, component, pickScore, pickReason, foodSource(pickFood), candidates, pref, {
      expertMode
    });
  }
  if (ranked[0] && ranked[0].score > 0 && ranked[0].score < 0.7) {
    const top = ranked[0].food;
    const pref = opts?.portionPrefs?.get(top.id) ?? null;
    return lineFromFood(top, component, ranked[0].score, "needs_pick", foodSource(top), candidates, pref, {
      requiresCandidatePick: true,
      matchUncertainty: "blocked",
      expertMode
    });
  }
  const fallback = genericFoods[0] ?? appFoods[0];
  if (fallback) {
    const pref = opts?.portionPrefs?.get(fallback.id) ?? null;
    return lineFromFood(
      fallback,
      component,
      ranked[0]?.score ?? 0.35,
      "fallback",
      foodSource(fallback),
      candidates,
      pref,
      {
        requiresCandidatePick: true,
        matchUncertainty: "blocked",
        expertMode
      }
    );
  }
  const stub = {
    id: "generic_unknown",
    name: hint,
    category: "readymeal",
    nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    servings: [{ name: "100 g", grams: 100 }],
    catalogSource: "app"
  };
  return lineFromFood(stub, component, 0, "unresolved", "generic_baseline", candidates, null, {
    requiresCandidatePick: true,
    matchUncertainty: "blocked",
    expertMode
  });
}
async function resolveBarcode(pool2, barcode) {
  const ucf = await getAppCustomFoodByBarcode(pool2, barcode);
  if (ucf) return { food: ucf, source: "app" };
  const { fetchOpenFoodFactsByBarcode: fetchOpenFoodFactsByBarcode2 } = await Promise.resolve().then(() => (init_openFoodFactsFetch(), openFoodFactsFetch_exports));
  const off = await fetchOpenFoodFactsByBarcode2(barcode);
  if (off) return { food: off, source: "openfoodfacts" };
  return null;
}
function resolvedLineToIngredient(line) {
  const m = macrosForGrams(
    {
      id: line.foodId,
      name: line.displayName,
      category: "readymeal",
      nutrients: {
        calories: line.per100g.kcal,
        protein: line.per100g.protein,
        carbs: line.per100g.carbs,
        fat: line.per100g.fat
      },
      servings: []
    },
    line.grams
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
    nutrientSource: "database"
  };
}

// src/lib/nutrition/dishRecipeTemplates.de.json
var dishRecipeTemplates_de_default = {
  cheeseburger: {
    aliases: ["cheeseburger", "cheese burger", "burger mit k\xE4se"],
    label: "Cheeseburger",
    components: [
      { foodHintDe: "Br\xF6tchen", defaultGrams: 60 },
      { foodHintDe: "Rinderhackfleisch", defaultGrams: 120 },
      { foodHintDe: "K\xE4se, Scheibe", defaultGrams: 20 },
      { foodHintDe: "Tomate", defaultGrams: 30 },
      { foodHintDe: "Gurke", defaultGrams: 20 },
      { foodHintDe: "Blattsalat", defaultGrams: 15 },
      { foodHintDe: "Ketchup", defaultGrams: 15 }
    ]
  },
  hotdog: {
    aliases: ["hotdog", "hot dog", "hot-dog"],
    label: "Hotdog",
    components: [
      { foodHintDe: "Hotdog-Br\xF6tchen", defaultGrams: 50 },
      { foodHintDe: "Bratwurst", defaultGrams: 90 },
      { foodHintDe: "Senf", defaultGrams: 10 }
    ]
  },
  hamburger: {
    aliases: ["hamburger", "burger"],
    label: "Hamburger",
    components: [
      { foodHintDe: "Br\xF6tchen", defaultGrams: 60 },
      { foodHintDe: "Rinderhackfleisch", defaultGrams: 120 },
      { foodHintDe: "Tomate", defaultGrams: 30 },
      { foodHintDe: "Blattsalat", defaultGrams: 15 },
      { foodHintDe: "Ketchup", defaultGrams: 15 }
    ]
  },
  leberkaessemmel: {
    aliases: [
      "leberk\xE4ssemmel",
      "leberk\xE4se semmel",
      "leberk\xE4sesemmel",
      "leberk\xE4sesemmeln",
      "leberkaessemmel",
      "leberkaessemmeln",
      "leberkassemmel",
      "leberkassemmeln",
      "leberkas semmel",
      "fleischkassemmel"
    ],
    label: "Leberk\xE4ssemmel",
    components: [
      { foodHintDe: "Leberk\xE4se", defaultGrams: 50 },
      { foodHintDe: "Br\xF6tchen", defaultGrams: 60 }
    ]
  },
  doener: {
    aliases: ["d\xF6ner", "doener", "d\xF6ner kebab", "doener kebab"],
    label: "D\xF6ner",
    components: [
      { foodHintDe: "D\xF6nerfleisch (Kalb/H\xE4hnchen)", defaultGrams: 150 },
      { foodHintDe: "Fladenbrot", defaultGrams: 80 },
      { foodHintDe: "Tomate", defaultGrams: 40 },
      { foodHintDe: "Gurke", defaultGrams: 30 },
      { foodHintDe: "Zwiebel", defaultGrams: 25 },
      { foodHintDe: "Blattsalat", defaultGrams: 20 },
      { foodHintDe: "Joghurt natur", defaultGrams: 30 }
    ]
  },
  spaghetti_bolognese: {
    aliases: ["spaghetti bolognese", "bolognese", "nudeln mit hackfleischso\xDFe"],
    label: "Spaghetti Bolognese",
    components: [
      { foodHintDe: "Nudeln, gekocht", defaultGrams: 220 },
      { foodHintDe: "Rinderhackfleisch", defaultGrams: 120 },
      { foodHintDe: "Tomate", defaultGrams: 150 },
      { foodHintDe: "Zwiebel", defaultGrams: 40 },
      { foodHintDe: "Oliven\xF6l", defaultGrams: 10 }
    ]
  },
  pasta_carbonara: {
    aliases: ["carbonara", "pasta carbonara", "spaghetti carbonara"],
    label: "Pasta Carbonara",
    components: [
      { foodHintDe: "Nudeln, gekocht", defaultGrams: 220 },
      { foodHintDe: "Speck", defaultGrams: 60 },
      { foodHintDe: "Ei, ganz", defaultGrams: 50 },
      { foodHintDe: "Parmesan", defaultGrams: 25 }
    ]
  },
  caesar_salad: {
    aliases: ["caesar salad", "caesar salat", "salat caesar"],
    label: "Caesar Salad",
    components: [
      { foodHintDe: "Blattsalat", defaultGrams: 80 },
      { foodHintDe: "H\xE4hnchenbrust, gekocht", defaultGrams: 100 },
      { foodHintDe: "Parmesan", defaultGrams: 15 },
      { foodHintDe: "Mayonnaise", defaultGrams: 25 },
      { foodHintDe: "Br\xF6tchen", defaultGrams: 30 }
    ]
  },
  griechischer_salat: {
    aliases: ["griechischer salat", "greek salad"],
    label: "Griechischer Salat",
    components: [
      { foodHintDe: "Tomate", defaultGrams: 120 },
      { foodHintDe: "Gurke", defaultGrams: 80 },
      { foodHintDe: "Oliven", defaultGrams: 30 },
      { foodHintDe: "Mozzarella", defaultGrams: 60 },
      { foodHintDe: "Zwiebel", defaultGrams: 30 },
      { foodHintDe: "Oliven\xF6l", defaultGrams: 15 }
    ]
  },
  pizza_margherita_stueck: {
    aliases: ["pizza margherita", "pizza st\xFCck", "st\xFCck pizza"],
    label: "Pizza Margherita (St\xFCck)",
    components: [
      { foodHintDe: "Pizza Margherita (St\xFCck)", defaultGrams: 120 },
      { foodHintDe: "Mozzarella", defaultGrams: 40 },
      { foodHintDe: "Tomate", defaultGrams: 50 }
    ]
  },
  currywurst: {
    aliases: ["currywurst", "curry wurst"],
    label: "Currywurst mit Pommes",
    components: [
      { foodHintDe: "Bratwurst", defaultGrams: 150 },
      { foodHintDe: "Pommes frites", defaultGrams: 200 },
      { foodHintDe: "Ketchup", defaultGrams: 40 }
    ]
  },
  schnitzel_pommes: {
    aliases: ["schnitzel mit pommes", "wiener schnitzel", "schnitzel pommes"],
    label: "Schnitzel mit Pommes",
    components: [
      { foodHintDe: "H\xE4hnchenbrust, gekocht", defaultGrams: 180 },
      { foodHintDe: "Pommes frites", defaultGrams: 200 },
      { foodHintDe: "Zitrone", defaultGrams: 20 }
    ]
  },
  muesli: {
    aliases: ["m\xFCsli", "muesli", "haferflocken mit milch"],
    label: "M\xFCsli mit Milch",
    components: [
      { foodHintDe: "Haferflocken", defaultGrams: 50 },
      { foodHintDe: "Milch 3,5%", defaultGrams: 200 },
      { foodHintDe: "Banane", defaultGrams: 80 }
    ]
  },
  fruehstuecksei: {
    aliases: ["fr\xFChst\xFCcksei", "fruehstuecksei", "spiegelei", "r\xFChrei"],
    label: "Fr\xFChst\xFCcksei",
    components: [
      { foodHintDe: "Ei, ganz", defaultGrams: 110 },
      { foodHintDe: "Butter", defaultGrams: 10 },
      { foodHintDe: "Vollkornbrot", defaultGrams: 40 }
    ]
  },
  avocado_toast: {
    aliases: ["avocado toast", "avocado auf brot"],
    label: "Avocado Toast",
    components: [
      { foodHintDe: "Vollkornbrot", defaultGrams: 60 },
      { foodHintDe: "Avocado", defaultGrams: 80 },
      { foodHintDe: "Ei, ganz", defaultGrams: 50 }
    ]
  },
  club_sandwich: {
    aliases: ["club sandwich", "clubsandwich"],
    label: "Club Sandwich",
    components: [
      { foodHintDe: "Vollkornbrot", defaultGrams: 90 },
      { foodHintDe: "H\xE4hnchenbrust, gekocht", defaultGrams: 80 },
      { foodHintDe: "Kochschinken", defaultGrams: 30 },
      { foodHintDe: "Tomate", defaultGrams: 40 },
      { foodHintDe: "Blattsalat", defaultGrams: 20 },
      { foodHintDe: "Mayonnaise", defaultGrams: 15 }
    ]
  },
  falafel_teller: {
    aliases: ["falafel teller", "falafel mit hummus"],
    label: "Falafel Teller",
    components: [
      { foodHintDe: "Falafel", defaultGrams: 120 },
      { foodHintDe: "Hummus", defaultGrams: 80 },
      { foodHintDe: "Couscous, gekocht", defaultGrams: 150 },
      { foodHintDe: "Blattsalat", defaultGrams: 40 }
    ]
  },
  sushi_set: {
    aliases: ["sushi set", "maki set", "8 st\xFCck sushi"],
    label: "Sushi Set",
    components: [
      { foodHintDe: "Sushi Maki", defaultGrams: 200 },
      { foodHintDe: "Reis, gekocht", defaultGrams: 120 },
      { foodHintDe: "Sojasauce", defaultGrams: 15 }
    ]
  },
  pad_thai: {
    aliases: ["pad thai", "thai nudeln"],
    label: "Pad Thai",
    components: [
      { foodHintDe: "Nudeln, gekocht", defaultGrams: 200 },
      { foodHintDe: "H\xE4hnchenbrust, gekocht", defaultGrams: 100 },
      { foodHintDe: "Ei, ganz", defaultGrams: 50 },
      { foodHintDe: "Erdn\xFCsse", defaultGrams: 15 }
    ]
  },
  chicken_wings: {
    aliases: ["chicken wings", "h\xE4hnchenfl\xFCgel", "hot wings"],
    label: "Chicken Wings",
    components: [
      { foodHintDe: "H\xE4hnchenfl\xFCgel", defaultGrams: 200 },
      { foodHintDe: "Ketchup", defaultGrams: 30 }
    ]
  }
};

// src/lib/nutrition/dishExpander.ts
var TEMPLATES = dishRecipeTemplates_de_default;
function norm2(s) {
  return s.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
function findDishTemplateId(text) {
  const n = norm2(text);
  if (!n) return null;
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    if (tpl.aliases.some((a) => norm2(a) === n || n.includes(norm2(a)))) return id;
  }
  return null;
}
function expandDishFromTemplate(templateId, quantityMultiplier = 1) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return null;
  const mult = Math.max(1, Math.round(quantityMultiplier));
  const components = tpl.components.map((c) => ({
    rawText: c.foodHintDe,
    foodHint: c.foodHintEn ?? c.foodHintDe,
    quantity: {
      explicit: true,
      value: Math.round(c.defaultGrams * mult),
      unit: "g"
    },
    isPackaged: false,
    fromTemplate: true
  }));
  return { label: tpl.label, components };
}
function listTemplateAliases() {
  return Object.entries(TEMPLATES).flatMap(([id, t2]) => [id, ...t2.aliases]);
}
var PACKAGED_BRAND = /\b(big\s*mac|mcdonald|müller|danone|red\s*bull|monster\s*energy|coca\s*cola|pepsi)\b/i;
function inferDishTypeFromText(text) {
  if (PACKAGED_BRAND.test(text)) return "packaged_brand";
  if (findDishTemplateId(text)) return "composite_recipe";
  return "single_ingredient";
}
function parseQuantityMultiplier(text) {
  const m = text.trim().match(/^(\d+)\s*x?\s*/i);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function buildMealItemFromDishPhrase(phrase) {
  const trimmed = phrase.trim();
  if (!trimmed) return null;
  const mult = parseQuantityMultiplier(trimmed);
  const core = trimmed.replace(/^\d+\s*x?\s*/i, "").trim();
  const templateId = findDishTemplateId(core);
  if (templateId) {
    const expanded = expandDishFromTemplate(templateId, mult);
    if (!expanded) return null;
    return {
      label: mult > 1 ? `${mult}\xD7 ${expanded.label}` : expanded.label,
      dishType: "composite_recipe",
      templateId,
      quantityMultiplier: mult,
      components: expanded.components
    };
  }
  const dishType = inferDishTypeFromText(core);
  return {
    label: core,
    dishType,
    quantityMultiplier: mult,
    components: [
      {
        rawText: core,
        foodHint: core,
        quantity: null,
        isPackaged: dishType === "packaged_brand"
      }
    ]
  };
}

// src/lib/nutrition/textMealSegmenter.ts
var SIDE_WITH_MAIN = /\b(kroketten|pommes|reis|salat|nudeln|kartoffeln|gemüse|brot|beilage)\b/i;
var CONDIMENT_SIDE = /\b(senf|suesser?\s+senf|süße?m?\s+senf|ketchup|mayo|mayonnaise|sauce|sosse|soße|dressing|dip)\b/i;
var SPLIT_RE = /\s*(?:,| und | dazu | plus | sowie )\s*/i;
function segmentMealText(text) {
  const raw = text.trim();
  if (!raw) return [];
  const parts = raw.split(SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const mit = part.match(/^(.+?)\s+mit\s+(.+)$/i);
    if (mit && (SIDE_WITH_MAIN.test(mit[2]) || CONDIMENT_SIDE.test(mit[2]))) {
      out.push(mit[1].trim(), mit[2].trim());
    } else {
      out.push(part);
    }
  }
  return out;
}

// src/lib/nutrition/buildMealParsePrompts.ts
function buildMealParseTextPrompt(userText) {
  const segments = segmentMealText(userText);
  const segmentHints = segments.length > 0 ? segments.map((s, i) => `${i + 1}. ${s}`).join("\n") : "\u2014";
  return loadPrompt("nutrition", "meal-parse-text", {
    userText: userText.trim(),
    segmentHints,
    templateAliases: listTemplateAliases().join(", ")
  });
}
function buildMealParsePhotoPrompt(userText) {
  const segments = segmentMealText(userText);
  const segmentHints = segments.length > 0 ? segments.map((s, i) => `${i + 1}. ${s}`).join("\n") : "\u2014";
  return loadPrompt("nutrition", "meal-parse-photo", {
    userText: userText.trim(),
    segmentHints,
    templateAliases: listTemplateAliases().join(", ")
  });
}
function buildNutritionLabelScanPrompt() {
  return loadPrompt("nutrition", "nutrition-label-scan", {});
}

// src/lib/nutrition/schemas.ts
import { z as z5 } from "zod";
var DishTypeSchema = z5.enum(["composite_recipe", "packaged_brand", "single_ingredient"]);
var ExplicitQuantitySchema = z5.object({
  explicit: z5.literal(true),
  value: z5.number().finite().positive(),
  unit: z5.enum(["g", "ml", "stk", "dose", "flasche", "packung", "scheibe"]),
  multiplier: z5.number().finite().positive().optional()
});
var MealComponentSchema = z5.object({
  rawText: z5.string(),
  foodHint: z5.string(),
  quantity: ExplicitQuantitySchema.nullable().optional(),
  isPackaged: z5.boolean().default(false),
  fromTemplate: z5.boolean().optional()
});
var MealItemSchema = z5.object({
  label: z5.string(),
  dishType: DishTypeSchema,
  templateId: z5.string().optional(),
  quantityMultiplier: z5.number().finite().positive().default(1),
  components: z5.array(MealComponentSchema).min(1)
});
var MealIntentSchema = z5.object({
  items: z5.array(MealItemSchema).min(1),
  parseConfidence: z5.number().min(0).max(1).default(0.8)
});
var PortionOptionSchema = z5.object({
  id: z5.string(),
  label: z5.string(),
  logUnit: z5.string(),
  quantity: z5.number(),
  grams: z5.number(),
  source: z5.enum(["off_pack", "off_serving", "dish_template", "generic_default", "user_last"]),
  isDefault: z5.boolean().optional()
});
var ResolvedFoodLineSchema = z5.object({
  foodId: z5.string(),
  source: z5.enum(["openfoodfacts", "generic_baseline", "app"]),
  displayName: z5.string(),
  grams: z5.number(),
  portionOptions: z5.array(PortionOptionSchema),
  selectedPortionId: z5.string(),
  logUnit: z5.string(),
  quantity: z5.number(),
  per100g: z5.object({
    kcal: z5.number(),
    protein: z5.number(),
    carbs: z5.number(),
    fat: z5.number()
  }),
  matchScore: z5.number(),
  matchReason: z5.string(),
  matchUncertainty: z5.enum(["high", "medium", "low", "blocked"]).optional(),
  requiresCandidatePick: z5.boolean().optional(),
  dataQuality: z5.object({
    complete: z5.boolean(),
    flags: z5.array(z5.string())
  }),
  nutrientSource: z5.literal("database"),
  candidates: z5.array(
    z5.object({
      foodId: z5.string(),
      displayName: z5.string(),
      matchScore: z5.number(),
      source: z5.string()
    })
  ).optional()
});
var NutritionLabelScanSchema = z5.object({
  basis: z5.enum(["per_100g", "per_100ml", "per_serving"]),
  serving_size_text: z5.string().nullable().optional(),
  nutrients: z5.object({
    calories: z5.number(),
    protein: z5.number(),
    carbs: z5.number(),
    fat: z5.number()
  }),
  confidence: z5.number().min(0).max(1),
  warnings: z5.array(z5.string()).default([])
});

// src/lib/nutrition/nutritionLabelNormalize.ts
function normalizeLabelToPer100g(scan) {
  const warnings = [...scan.warnings];
  const n = scan.nutrients;
  if (scan.basis === "per_100g" || scan.basis === "per_100ml") {
    return { nutrients: n, warnings };
  }
  if (scan.basis === "per_serving") {
    const servingText = scan.serving_size_text ?? "";
    const m = servingText.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
    if (!m) {
      warnings.push("serving_size_unknown");
      return { nutrients: n, warnings };
    }
    const amount = parseFloat(m[1].replace(",", "."));
    const factor = 100 / amount;
    if (!Number.isFinite(factor) || factor <= 0) {
      return { nutrients: n, warnings };
    }
    return {
      nutrients: {
        calories: Math.round(n.calories * factor),
        protein: Math.round(n.protein * factor * 10) / 10,
        carbs: Math.round(n.carbs * factor * 10) / 10,
        fat: Math.round(n.fat * factor * 10) / 10
      },
      warnings
    };
  }
  return { nutrients: n, warnings };
}

// src/lib/nutrition/nutritionRoutes.ts
init_genericBaselineResolver();

// src/lib/nutrition/plausibilityCheck.ts
function impliedKcalFromMacros(m) {
  return m.protein * 4 + m.carbs * 4 + m.fat * 9;
}
function checkMealPlausibility(totals) {
  const issues = [];
  const { kcal, protein, carbs, fat } = totals;
  if (kcal <= 0 && (protein > 0 || carbs > 0 || fat > 0)) {
    issues.push({
      code: "missing_kcal",
      severity: "warning",
      message: "Kalorien fehlen, obwohl Makros gesetzt sind."
    });
  }
  if (kcal > 0 && kcal < 30) {
    issues.push({
      code: "meal_too_low",
      severity: "warning",
      message: "Sehr wenig Kalorien f\xFCr eine Mahlzeit \u2014 Portion pr\xFCfen."
    });
  }
  if (kcal > 3500) {
    issues.push({
      code: "meal_too_high",
      severity: "warning",
      message: "Ungew\xF6hnlich viele Kalorien \u2014 Mengen pr\xFCfen."
    });
  }
  if (kcal > 50) {
    const implied = impliedKcalFromMacros(totals);
    const ratio = implied > 0 ? kcal / implied : 1;
    if (ratio < 0.65 || ratio > 1.45) {
      issues.push({
        code: "macro_kcal_mismatch",
        severity: "warning",
        message: "Makros passen nicht gut zu den Kalorien \u2014 N\xE4hrwerte pr\xFCfen."
      });
    }
  }
  if (protein > 250 || carbs > 400 || fat > 200) {
    issues.push({
      code: "macro_extreme",
      severity: "warning",
      message: "Ein Makron\xE4hrstoff wirkt unrealistisch hoch."
    });
  }
  return issues;
}

// src/lib/nutrition/parseMealText.ts
function extractJsonObject2(raw) {
  const t2 = raw.trim();
  const start = t2.indexOf("{");
  const end = t2.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(t2.slice(start, end + 1));
}
function buildHeuristicMealIntent(userText) {
  const segments = segmentMealText(userText);
  const items = [];
  for (const seg of segments) {
    const item = buildMealItemFromDishPhrase(seg);
    if (item) items.push(item);
  }
  if (items.length === 0) {
    items.push(
      buildMealItemFromDishPhrase(userText) ?? {
        label: userText.trim(),
        dishType: "single_ingredient",
        quantityMultiplier: 1,
        components: [{ rawText: userText, foodHint: userText.trim(), quantity: null, isPackaged: false }]
      }
    );
  }
  return { items, parseConfidence: 0.65 };
}
async function parseMealTextToIntent(userText) {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { items: [], parseConfidence: 0 };
  }
  try {
    const prompt = buildMealParseTextPrompt(trimmed);
    const raw = await completeMealAnalysis(prompt, void 0, { responseMode: "json_object" });
    const parsed = extractJsonObject2(raw);
    const validated = MealIntentSchema.safeParse(parsed);
    if (validated.success && validated.data.items.length > 0) {
      return validated.data;
    }
  } catch (e) {
    console.warn("parseMealText: AI failed, heuristic fallback", e);
  }
  return buildHeuristicMealIntent(trimmed);
}
async function parseMealPhotoToIntent(userText, imageDataUrl) {
  const trimmed = userText.trim();
  const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    return buildHeuristicMealIntent(trimmed || "Mahlzeit vom Foto");
  }
  const image = { mimeType: m[1], data: m[2] };
  try {
    const prompt = buildMealParsePhotoPrompt(trimmed);
    const raw = await completeMealAnalysis(prompt, image, { responseMode: "json_object" });
    const parsed = extractJsonObject2(raw);
    const validated = MealIntentSchema.safeParse(parsed);
    if (validated.success && validated.data.items.length > 0) {
      return validated.data;
    }
  } catch (e) {
    console.warn("parseMealPhoto: AI failed, heuristic fallback", e);
  }
  return buildHeuristicMealIntent(trimmed || "Mahlzeit vom Foto");
}

// src/lib/nutrition/pipeline/FoodDatabaseService.ts
init_foodDisplayName();
init_genericFoodRegistry();
init_GenericFallbackTable();

// src/lib/aiPrompts/buildMealPrompts.ts
init_mealAiShared();
function normalizeUserText(raw) {
  return raw.trim().replace(/\r?\n+/g, " ");
}
function buildSuggestCustomFoodDraftPrompt(userQuery) {
  return loadPrompt("nutrition", "suggest-custom-food-draft", {
    userQuery: normalizeUserText(userQuery),
    foodCategories: FOOD_CATEGORY_LIST.join(", ")
  });
}
function buildDailyNutritionReviewPrompt(locale, vars) {
  const name = locale === "en" ? "daily-nutrition-review-en" : "daily-nutrition-review-de";
  return loadPrompt("nutrition", name, vars);
}
function buildMealRecipeDraftPrompt(idea, allergies, yieldsPortions) {
  return loadPrompt("nutrition", "meal-recipe-draft", {
    idea: idea.trim(),
    allergies: allergies.trim() || "none",
    yieldsPortions: String(yieldsPortions > 0 ? yieldsPortions : 4)
  });
}
function buildMealRecipeRefinePrompt(userRefinement, currentJson) {
  return loadPrompt("nutrition", "meal-recipe-refine", {
    userRefinement: userRefinement.trim(),
    currentJson
  });
}

// src/lib/nutrition/pipeline/ensurePipelineGenericFood.ts
init_mealAiShared();
init_foodDisplayName();

// src/lib/nutrition/pieceUnitHelpers.ts
function isGramOnlyFood(name) {
  const key = name.trim().toLowerCase();
  return /(senf|sauce|dressing|dip|mayo|mayonnaise|ketchup|öl|ol\b|butter|margarine|joghurt|quark|milch|whey|proteinpulver|pulver|mehl|zucker|honig|sirup|k[aä]se\s*(streuer|gerieben)|reis\b|nudeln|pasta\b|haferflocken|müsli\b|salat\s*blatt|spinat|kraut|remoulade|pesto|tahini|hummus|avocadopüree)/.test(
    key
  );
}
function parsePieceGramsFromServingSize(servingSize) {
  if (!servingSize) return null;
  if (!/(stück|stk|piece|scheibe|slice)/i.test(servingSize)) return null;
  const m = servingSize.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
function parsePieceHintsFromReasoning(text) {
  const t2 = text.trim();
  if (!t2) return { pieceCount: null, gramsPerPiece: null };
  const perPiece = t2.match(
    /(\d+(?:[.,]\d+)?)\s*g\s*(?:pro|je|\/)\s*(?:stück|stk|stueck|scheibe|slice|piece)/i
  );
  if (perPiece) {
    const gramsPerPiece = Number(perPiece[1].replace(",", "."));
    if (Number.isFinite(gramsPerPiece) && gramsPerPiece >= 8 && gramsPerPiece <= 600) {
      return { pieceCount: null, gramsPerPiece: Math.round(gramsPerPiece) };
    }
  }
  const countWithUnit = t2.match(
    /(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(?:stück|stk|stueck|scheiben?|slices?|pieces?)\b/i
  );
  if (countWithUnit) {
    const pieceCount = Number(countWithUnit[1].replace(",", "."));
    if (Number.isFinite(pieceCount) && pieceCount > 0 && pieceCount <= 50) {
      return { pieceCount, gramsPerPiece: null };
    }
  }
  const wordCount = /\b(zwei|2)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|bananen?|äpfel|apfel|eier?|leberk[aä]se|fleischk[aä]se)\b/i.test(
    t2
  ) || /\b(drei|3)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|bananen?|eier?|scheiben?)\b/i.test(t2) || /\b(vier|4)\s+(?:stück|stk|stueck|scheiben?|semmeln?|brötchen|broetchen|eier?)\b/i.test(t2);
  if (wordCount) {
    const m = t2.match(/\b(zwei|drei|vier|2|3|4)\b/i);
    const map = { zwei: 2, drei: 3, vier: 4, "2": 2, "3": 3, "4": 4 };
    const pieceCount = m ? map[m[1].toLowerCase()] ?? null : 2;
    if (pieceCount) return { pieceCount, gramsPerPiece: null };
  }
  const singlePiece = /\b(?:1|ein|eine)\s+(?:stück|stk|stueck|scheibe|banane|apfel|ei\b|semmel|brötchen|broetchen|leberk[aä]se|fleischk[aä]se)\b/i.test(
    t2
  );
  if (singlePiece) return { pieceCount: 1, gramsPerPiece: null };
  return { pieceCount: null, gramsPerPiece: null };
}
function clampPieceGrams(value) {
  if (!Number.isFinite(value) || value < 8 || value > 600) return null;
  return Math.max(8, Math.round(value));
}
function perPieceFromCountAndGrams(pieceCount, totalGrams) {
  if (pieceCount <= 0 || totalGrams <= 0) return null;
  return clampPieceGrams(totalGrams / pieceCount);
}
var DEFAULT_PIECE_GRAMS = 100;
var GRAM_ONLY_PIECE_GRAMS = 15;
function ensurePieceGramsForReview(ctx) {
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
function inferPieceGramsFromFoodName(name) {
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
  if (fromCatalog && (fromCatalog.unit === "stk" || fromCatalog.unit === "scheibe")) {
    return Math.max(1, Math.round(fromCatalog.grams));
  }
  if (/(br[oö]tchen|weckerl|croissant|banane|apfel|ei\b|eier\b|wrap|tortilla|muffin|keks|waffel|bagel|donut|pizza|avocado|tomate|gurke|wurst|würstchen|nugget|schnitzel|kotelett|steak|burger\b|riegel|pfannkuchen|pancake)/.test(
    key
  )) {
    if (/ei\b|eier/.test(key)) return 55;
    if (/banane/.test(key)) return 120;
    if (/apfel/.test(key)) return 170;
    if (/br[oö]tchen|weckerl/.test(key)) return 60;
    if (/pizza/.test(key)) return 120;
    if (/avocado/.test(key)) return 80;
  }
  return null;
}
function resolvePieceGrams(ctx) {
  if (isGramOnlyFood(ctx.foodName)) return null;
  if (ctx.gramsPerPiece != null && ctx.gramsPerPiece > 0) {
    const g = clampPieceGrams(ctx.gramsPerPiece);
    if (g) return g;
  }
  if (ctx.estimatedPieceCount != null && ctx.estimatedPieceCount > 0 && ctx.estimatedGrams != null) {
    const g = perPieceFromCountAndGrams(ctx.estimatedPieceCount, ctx.estimatedGrams);
    if (g) return g;
  }
  const fromReasoning = parsePieceHintsFromReasoning(ctx.gramReasoning ?? "");
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
function pieceQuantityFromGrams(grams, pieceGrams) {
  return Math.max(0.25, Math.round(grams / pieceGrams * 4) / 4);
}
function pieceContextFromAnalysis(foodName, servingSize, estimatedGrams, analysis) {
  return {
    foodName,
    servingSize,
    estimatedGrams,
    gramReasoning: analysis?.gram_reasoning ?? null,
    estimatedPieceCount: analysis?.estimated_piece_count ?? null,
    gramsPerPiece: analysis?.grams_per_piece ?? null
  };
}

// src/lib/nutrition/pipeline/ensurePipelineGenericFood.ts
init_appCustomFoods();
function pieceServingHint(component) {
  const g = Math.round(
    component.grams_per_piece ?? ensurePieceGramsForReview(
      pieceContextFromAnalysis(component.name, null, component.estimated_grams, component)
    )
  );
  return `1 St\xFCck (${g} g)`;
}
function foodToPipelineCandidate(food, component) {
  const serving = pieceServingHint(component);
  const displayName = capitalizeFoodDisplayName(food.name);
  return {
    rank: 1,
    score: 55,
    source_step: "generic",
    openfoodfacts_id: null,
    product_name: displayName,
    brand: null,
    kcal_100g: food.nutrients.calories,
    protein_100g: food.nutrients.protein,
    carbs_100g: food.nutrients.carbs,
    fat_100g: food.nutrients.fat,
    fiber_100g: null,
    serving_size: serving,
    data_completeness: "full",
    data_source: "estimated_fallback",
    _score: 55
  };
}
function applyComponentPortionHints(draft, component) {
  const name = capitalizeFoodDisplayName(draft.name || component.name);
  const next = { ...draft, name };
  const grams = Math.max(1, Math.round(component.estimated_grams));
  const pieceG = Math.max(
    8,
    Math.round(
      component.grams_per_piece ?? ensurePieceGramsForReview(
        pieceContextFromAnalysis(component.name, null, grams, component)
      )
    )
  );
  const pieceCount = component.estimated_piece_count != null && component.estimated_piece_count > 0 ? component.estimated_piece_count : pieceQuantityFromGrams(grams, pieceG);
  const def = lookupDefaultPortion(component.name);
  const pieceLabel = def?.unit === "scheibe" ? "Scheibe" : "St\xFCck";
  return {
    ...next,
    defaultAmount: Math.max(0.25, pieceCount),
    defaultUnit: "stk",
    gramsPerPiece: pieceG,
    servings: [
      { name: `1 ${pieceLabel}`, grams: pieceG },
      ...(draft.servings ?? []).filter((s) => !/stück|scheibe/i.test(s.name))
    ]
  };
}
async function findPersistedGenericFoodCandidate(pool2, component) {
  const name = capitalizeFoodDisplayName(component.name);
  if (!name) return null;
  const existingApp = await findAppCustomFoodByExactName(pool2, name);
  return existingApp ? foodToPipelineCandidate(existingApp, component) : null;
}
async function createGenericWithAiForComponent(pool2, component, completeMealAnalysis2) {
  const name = component.name.trim();
  if (!name) return null;
  try {
    const prompt = buildSuggestCustomFoodDraftPrompt(name);
    const raw = await completeMealAnalysis2(prompt, void 0, {
      temperature: 0.25,
      responseMode: "json_object"
    });
    let draft = parseCustomFoodDraftFromAi(raw, name);
    draft = applyComponentPortionHints(draft, component);
    const food = await insertAppCustomFoodFromDraft(pool2, draft, "nutrition_v3_auto");
    return foodToPipelineCandidate(food, component);
  } catch (err) {
    console.warn("createGenericWithAiForComponent: skip", name, err);
    return null;
  }
}

// src/lib/nutrition/pipeline/SynonymResolver.ts
var SYNONYM_MAP = {
  "h\xE4hnchen gegrillt": ["h\xFChnerbrust gebraten", "chicken grilled", "gefl\xFCgel gebraten"],
  fladenbrot: ["pitabrot", "naan", "turkish bread", "pide"],
  knoblauchsauce: ["tzatziki", "garlic dip", "knoblauch dressing"],
  wei\u00DFkohl: ["spitzkohl", "chinakohl", "cabbage white shredded"],
  "d\xF6ner h\xE4hnchen": ["chicken kebab", "h\xE4hnchenspie\xDF", "shawarma chicken"],
  d\u00F6nerbrot: ["fladenbrot", "pide", "pita bread"],
  haferflocken: ["oats", "oat flakes", "rolled oats"],
  banane: ["banana"],
  vollmilch: ["whole milk", "milk 3.5%"],
  parmesan: ["parmigiano reggiano", "hard cheese parmesan"],
  mandeln: ["almonds"],
  r\u00FChrei: ["scrambled eggs"],
  speck: ["bacon"],
  toast: ["toastbrot", "white bread toast"],
  whey: ["whey protein", "protein powder"],
  cola: ["coca cola", "soft drink cola"],
  schnitzel: ["breaded pork cutlet", "wiener schnitzel"],
  porridge: ["oatmeal"],
  m\u00FCsli: ["muesli"],
  latte: ["latte macchiato", "cafe latte"],
  k\u00E4sekuchen: ["cheesecake"],
  currywurst: ["sausage curry"],
  pommes: ["french fries", "chips"],
  spaghettibolognese: ["spaghetti bolognese"]
};
function resolveSynonyms(baseTerms) {
  const out = /* @__PURE__ */ new Set();
  for (const term of baseTerms) {
    const t2 = term.trim();
    if (!t2) continue;
    out.add(t2);
    const key = t2.toLowerCase().replace(/\s+/g, " ");
    const withoutSlash = key.replace(/[/-]/g, " ");
    const list = [...SYNONYM_MAP[key] ?? [], ...SYNONYM_MAP[withoutSlash] ?? []];
    for (const candidate of list) out.add(candidate);
  }
  return [...out];
}

// src/lib/nutrition/pipeline/OpenFoodFactsClient.ts
init_openFoodFactsFetch();
init_openFoodFacts();
var FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "categories_tags",
  "countries_tags",
  "completeness",
  "last_modified_t"
].join(",");
function foodToOffSearchProduct(food, _searchTerm) {
  const code = food.id.replace(/^off_/, "");
  const serving = food.servings[0];
  const display = food.name;
  const brand = food.brand ? String(food.brand).trim() : void 0;
  let productName = display;
  if (brand && display.toLowerCase().endsWith(brand.toLowerCase())) {
    productName = display.slice(0, display.length - brand.length).replace(/[·|,]\s*$/, "").trim() || display;
  }
  return {
    code: code || void 0,
    product_name: productName,
    product_name_de: productName,
    generic_name: void 0,
    brands: brand,
    nutriments: {
      "energy-kcal_100g": food.nutrients.calories,
      proteins_100g: food.nutrients.protein,
      carbohydrates_100g: food.nutrients.carbs,
      fat_100g: food.nutrients.fat,
      ...food.nutrients.fiber != null ? { fiber_100g: food.nutrients.fiber } : {}
    },
    serving_size: serving ? `${Math.round(serving.grams)} g` : void 0,
    countries_tags: ["en:germany"],
    completeness: 0.85
  };
}
var OpenFoodFactsClient = class {
  constructor() {
    this.searchCache = /* @__PURE__ */ new Map();
  }
  async search(term, pageSize = 15) {
    const key = `${normalizeOffSearchQuery(term)}::${pageSize}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const { foods, rawHitCount } = await fetchOffCatalogFoods(term.trim(), pageSize);
    if (foods.length === 0 && rawHitCount > 0) {
      console.warn("[nutrition-v3] OFF hits could not be mapped", { term, rawHitCount });
    }
    const products = foods.map((f) => foodToOffSearchProduct(f, term));
    this.searchCache.set(key, products);
    return products;
  }
  async category(category, pageSize = 20) {
    const key = `category:${category.toLowerCase().trim()}::${pageSize}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({ fields: FIELDS, page_size: String(pageSize) });
    const url = `https://world.openfoodfacts.org/category/${encodeURIComponent(category)}/1.json?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "VRTX-FitnessTracker/1.0" }
    });
    if (!response.ok) return [];
    const data = await response.json();
    const products = data.products ?? [];
    this.searchCache.set(key, products);
    return products;
  }
};

// src/lib/nutrition/pipeline/ProductScorer.ts
var NAME_STOPWORDS = /* @__PURE__ */ new Set([
  "mit",
  "und",
  "ohne",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "aus",
  "auf",
  "im",
  "in",
  "am",
  "an",
  "zum",
  "zur",
  "vom",
  "von",
  "f\xFCr",
  "pro",
  "the",
  "bio",
  "classic",
  "original",
  "premium",
  "light",
  "zero",
  "style",
  "typ",
  "sorte",
  "marke",
  "g",
  "ml",
  "kg",
  "stk",
  "stueck",
  "pack",
  "beutel",
  "dose",
  "glas",
  "flasche",
  "frisch",
  "fein",
  "gross",
  "grosses",
  "klein",
  "mini",
  "xxl"
]);
var FOOD_ALIASES = {
  semmel: ["semmel", "broetchen", "brotchen", "weizenbroetchen", "weizenbrotchen", "br\xF6tchen", "brotchen"],
  broetchen: ["broetchen", "brotchen", "semmel", "weizenbroetchen", "br\xF6tchen"],
  leberkaese: ["leberkaese", "leberkase"],
  fleischkaese: ["fleischkaese", "fleischkase"],
  senf: ["senf", "mustard", "mostard"],
  suesser_senf: ["senf", "suesser", "susser", "s\xFCsser", "sweet", "mustard", "mostard"],
  s\u00FCsser_senf: ["senf", "suesser", "susser", "s\xFCsser", "sweet", "mustard", "mostard"]
};
function lower(v) {
  return String(v ?? "").trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
function tokenizeName(value) {
  return lower(value).replace(/[()[\]{}]/g, " ").split(/[\s,;/\-·•]+/).map((t2) => t2.trim()).filter((t2) => t2.length >= 2);
}
function normalizeCoreProductName(productName) {
  const raw = String(productName ?? "").trim();
  if (!raw) return "";
  const head = raw.split(/\s[-–—·|]\s/)[0]?.trim() ?? raw;
  return lower(head);
}
function aliasKey(componentName, searchTerm) {
  const merged = lower(`${componentName} ${searchTerm}`).replace(/[^a-z0-9]+/g, "_");
  if (FOOD_ALIASES[merged]) return merged;
  const tokens = tokenizeName(`${componentName} ${searchTerm}`);
  return tokens.join("_");
}
function allowedTokensForComponent(componentName, searchTerm) {
  const comp = lower(componentName);
  const term = lower(searchTerm);
  const keys = /* @__PURE__ */ new Set([comp, term, aliasKey(componentName, searchTerm)]);
  for (const t2 of tokenizeName(componentName)) keys.add(t2);
  for (const t2 of tokenizeName(searchTerm)) keys.add(t2);
  const allowed = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const list = FOOD_ALIASES[key];
    if (list) {
      for (const alias of list) allowed.add(alias);
    }
  }
  if (allowed.size === 0) {
    for (const t2 of tokenizeName(componentName)) {
      if (t2.length >= 3) allowed.add(t2);
    }
    if (term.length >= 3) allowed.add(term);
  }
  return allowed;
}
function isAllowedToken(token, allowed) {
  if (allowed.has(token)) return true;
  for (const a of allowed) {
    if (a.length < 4 || token.length < 4) continue;
    if (token === a) return true;
    if (token.includes(a) || a.includes(token)) {
      const shorter = token.length <= a.length ? token : a;
      const longer = token.length > a.length ? token : a;
      if (longer.endsWith(shorter) || longer.startsWith(shorter)) return true;
      if (longer.includes(shorter) && shorter.length >= 5) return true;
    }
  }
  return false;
}
function passesStrictOffNameMatch(productName, genericName, searchTerm, componentName) {
  const allowed = allowedTokensForComponent(componentName, searchTerm);
  if (allowed.size === 0) return false;
  const cores = [
    normalizeCoreProductName(productName),
    normalizeCoreProductName(genericName)
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
function getNutriment(n, key) {
  const v = n?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function scoreProduct(product, searchTerm, component) {
  const displayName = product.product_name_de || product.product_name;
  if (!passesStrictOffNameMatch(displayName, product.generic_name, searchTerm, component.name)) {
    return -1;
  }
  let score = 0;
  const nutriments = product.nutriments ?? {};
  const kcal = getNutriment(nutriments, "energy-kcal_100g") ?? getNutriment(nutriments, "energy-kcal");
  const protein = getNutriment(nutriments, "proteins_100g");
  const carbs = getNutriment(nutriments, "carbohydrates_100g");
  const fat = getNutriment(nutriments, "fat_100g");
  const fiber = getNutriment(nutriments, "fiber_100g");
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
  if (countries.includes("en:germany") || countries.includes("en:austria") || countries.includes("en:switzerland")) {
    score += 10;
  } else if (countries.some((c) => ["france", "italy", "spain", "uk", "netherlands"].some((e) => c.includes(e)))) {
    score += 5;
  }
  if (component.role !== "packaged_product" && lower(product.brands).length > 0) score -= 3;
  if (product.serving_size) score += 3;
  const modified = product.last_modified_t ?? 0;
  if (modified > 0) {
    const ageMonths = (Date.now() / 1e3 - modified) / (30 * 24 * 3600);
    if (ageMonths < 12) score += 2;
  }
  return score;
}

// src/lib/nutrition/pipeline/FoodDatabaseService.ts
var OFF_STRICT_MODE = process.env.NUTRITION_OFF_STRICT_MODE !== "0";
var OFF_STRICT_NAME = process.env.NUTRITION_OFF_STRICT_NAME !== "0";
var OFF_MIN_SCORE = Number(process.env.NUTRITION_OFF_MIN_SCORE ?? 48);
var ALLOW_GENERIC_WITH_OFF = process.env.NUTRITION_ALLOW_GENERIC_WITH_OFF === "1";
function normalizeSearchTerm(term) {
  return term.toLowerCase().replace(/\d+[.,]?\d*/g, " ").replace(/[()]/g, " ").replace(/\b(mit|und|ohne|ca|circa|stück|stk|gramm|g|eine|ein|der|die|das)\b/g, " ").replace(/\s+/g, " ").trim();
}
function toAsciiVariant(term) {
  return term.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
function toUmlautVariant(term) {
  return term.replace(/ae/g, "\xE4").replace(/oe/g, "\xF6").replace(/ue/g, "\xFC").replace(/ss/g, "\xDF");
}
function maybeSingularize(term) {
  const out = /* @__PURE__ */ new Set([term]);
  if (term.length > 4 && /(en|er|e|n|s)$/.test(term)) {
    out.add(term.replace(/(en|er|e|n|s)$/, ""));
  }
  return [...out].filter((t2) => t2.length > 1);
}
function expandCompoundTerms(term) {
  const normalized = normalizeSearchTerm(term);
  const out = new Set([term.trim(), normalized].filter(Boolean));
  out.add(toAsciiVariant(normalized));
  out.add(toUmlautVariant(normalized));
  for (const singular of maybeSingularize(normalized)) out.add(singular);
  if (/(leberk[aä]se|fleischk[aä]se).*(semmel|br[oö]tchen)|leberk[aä]sesemmel/.test(normalized)) {
    out.add("leberk\xE4se");
    out.add("fleischk\xE4se");
    out.add("br\xF6tchen");
    out.add("semmel");
  }
  if (/br[oö]tchen|semmel/.test(normalized)) {
    out.add("br\xF6tchen");
    out.add("semmel");
  }
  if (/s[üu]ss(er|em)? senf/.test(normalized)) {
    out.add("s\xFC\xDFer senf");
    out.add("senf s\xFC\xDF");
    out.add("sweet mustard");
  }
  return [...out].filter(Boolean);
}
var FoodDatabaseService = class {
  constructor(off = new OpenFoodFactsClient(), hooks) {
    this.off = off;
    this.hooks = hooks;
  }
  async matchComponents(analysis, options) {
    return Promise.all(
      analysis.components.map((component) => this.matchOne(component, options))
    );
  }
  async matchOne(component, options) {
    const candidates = [];
    const executed = /* @__PURE__ */ new Set();
    const passStats = {
      passA: { queries: 0, hits: 0 },
      passB: { queries: 0, hits: 0 },
      passC: { queries: 0, hits: 0 }
    };
    const chainPrefix = options?.chainName ? `${options.chainName} ` : "";
    const primaryTerms = component.search_strategy.primary.flatMap((t2) => expandCompoundTerms(`${chainPrefix}${t2}`.trim())).filter(Boolean);
    const secondaryTerms = component.search_strategy.secondary.flatMap((t2) => expandCompoundTerms(t2));
    const synonymTerms = resolveSynonyms([
      ...component.search_strategy.secondary,
      ...component.search_strategy.generic_fallback,
      ...primaryTerms
    ]).flatMap((t2) => expandCompoundTerms(t2));
    const passMinScore = OFF_STRICT_NAME ? OFF_MIN_SCORE : 14;
    await this.collectFromTerms(component, primaryTerms, "primary", candidates, executed, passStats, "passA", passMinScore);
    if (candidates.length < 2) {
      await this.collectFromTerms(component, secondaryTerms, "secondary", candidates, executed, passStats, "passB", passMinScore);
    }
    if (candidates.length < 2) {
      await this.collectFromTerms(component, synonymTerms, "synonym", candidates, executed, passStats, "passB", passMinScore);
    }
    if (candidates.length < 2 && !OFF_STRICT_NAME) {
      for (const category of component.search_strategy.openfoodfacts_categories) {
        passStats.passC.queries += 1;
        const results = await this.off.category(category, 20).catch(() => []);
        if (results.length > 0) passStats.passC.hits += 1;
        this.pushCandidates(component, results, category, "category", candidates);
      }
      executed.add("category");
    }
    const deduped = this.dedupeCandidates(candidates);
    const offAll = deduped.filter((c) => c.data_source === "openfoodfacts");
    const strictOffAll = offAll.filter((c) => {
      const term = String(c.match_term || component.name).trim() || component.name;
      return passesStrictOffNameMatch(
        c.product_name,
        c.generic_name ?? null,
        term,
        component.name
      );
    });
    const usableStrictOff = strictOffAll.filter((c) => c._score >= OFF_MIN_SCORE).sort((a, b) => b._score - a._score);
    const hasStrictOff = usableStrictOff.length > 0;
    let sortedAll = [];
    if (hasStrictOff) {
      sortedAll = [...usableStrictOff];
      executed.add("step2-off-strict");
      if (ALLOW_GENERIC_WITH_OFF) {
        const genericAlt = await this.resolveGenericCatalogCandidate(component, executed);
        if (genericAlt) sortedAll.push(genericAlt);
      }
    } else {
      executed.add("step2-off-none");
      const genericHit = await this.resolveGenericCatalogCandidate(component, executed);
      if (genericHit) {
        sortedAll.push(genericHit);
      } else {
        const aiHit = await this.hooks?.createGenericWithAi?.(component);
        if (aiHit) {
          sortedAll.push(aiHit);
          executed.add("step4-generic-ai");
        }
      }
    }
    let sorted = sortedAll.sort((a, b) => {
      if (usableStrictOff.length === 0) {
        if (a.data_source === "estimated_fallback" && b.data_source !== "estimated_fallback") return -1;
        if (b.data_source === "estimated_fallback" && a.data_source !== "estimated_fallback") return 1;
      } else if (a.data_source === "openfoodfacts" && b.data_source !== "openfoodfacts") {
        return -1;
      } else if (b.data_source === "openfoodfacts" && a.data_source !== "openfoodfacts") {
        return 1;
      }
      if (b._score !== a._score) return b._score - a._score;
      const idA = a.openfoodfacts_id ?? a.product_name;
      const idB = b.openfoodfacts_id ?? b.product_name;
      return idA.localeCompare(idB, "de");
    });
    const topOff = sorted.find((c) => c.data_source === "openfoodfacts");
    if (topOff && usableStrictOff.length > 0) {
      sorted = [topOff, ...sorted.filter((c) => c !== topOff)];
      executed.add("off-first");
    }
    sorted = sorted.slice(0, 3);
    const top = sorted[0];
    const second = sorted[1];
    const offCandidates = sortedAll.filter((c) => c.data_source === "openfoodfacts");
    const topOffScore = offCandidates.length > 0 ? Math.round(offCandidates[0]._score * 10) / 10 : -1;
    const requiresUserReview = !top || top._score < 50 || (second ? Math.abs(top._score - second._score) < 10 : false) || top.data_source === "estimated_fallback";
    const reviewReasons = [];
    if (!top) reviewReasons.push("no-candidate");
    if (top && top._score < 50) reviewReasons.push("low-top-score");
    if (top && second && Math.abs(top._score - second._score) < 10) reviewReasons.push("ambiguous-top2");
    if (top && top.data_source === "estimated_fallback") reviewReasons.push("estimated-fallback");
    if (top && top.data_source === "estimated_fallback" && offCandidates.length > 0) {
      reviewReasons.push(
        strictOffAll.length === 0 ? "why_generic:no-strict-name-match" : "why_generic:off-score-too-low"
      );
    }
    if (top && top.data_source === "estimated_fallback" && offCandidates.length === 0) {
      reviewReasons.push("why_generic:no-off-candidate");
    }
    const topOffAll = usableStrictOff[0] ?? strictOffAll[0] ?? null;
    if (topOffAll && topOffAll._score < OFF_MIN_SCORE) reviewReasons.push("rejected_off_reason:top_off_below_min");
    if (!topOffAll && offCandidates.length > 0) reviewReasons.push("rejected_off_reason:off_name_not_strict");
    if (!topOffAll && offCandidates.length === 0) reviewReasons.push("rejected_off_reason:no_off_after_passes");
    const ranked = sorted.map((item, index) => ({
      ...item,
      rank: index + 1,
      score: Math.round(item._score)
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
        `winner_source:${top?.data_source ?? "none"}`,
        `off_strict_mode:${OFF_STRICT_MODE ? "1" : "0"}`,
        `off_strict_name:${OFF_STRICT_NAME ? "1" : "0"}`,
        `strict_off_count:${usableStrictOff.length}`,
        `term_used:${normalizeSearchTerm(component.name)}`
      ],
      candidates: ranked,
      auto_selected_rank: ranked.length ? 1 : null,
      requires_user_review: requiresUserReview,
      review_reasons: reviewReasons
    };
  }
  /** Schritt 3: Generic-Katalog (statisch + zuvor KI-persistiert). */
  async resolveGenericCatalogCandidate(component, executed) {
    const persisted = await this.hooks?.findPersistedGenericFood?.(component);
    if (persisted) {
      executed.add("step3-generic-persisted");
      return persisted;
    }
    const catalogFood = lookupGenericFood(component.name);
    if (catalogFood) {
      executed.add("step3-generic-catalog");
      return foodToPipelineCandidate(catalogFood, component);
    }
    const nutrients = getGenericFallback(component.search_strategy.off_database_fallback) ?? getGenericFallback(component.name);
    if (nutrients) {
      executed.add("step3-generic-table");
      return {
        rank: 1,
        score: 52,
        source_step: "generic",
        openfoodfacts_id: null,
        product_name: capitalizeFoodDisplayName(component.name),
        brand: null,
        kcal_100g: nutrients.kcal_100g,
        protein_100g: nutrients.protein_100g,
        carbs_100g: nutrients.carbs_100g,
        fat_100g: nutrients.fat_100g,
        fiber_100g: nutrients.fiber_100g,
        serving_size: null,
        data_completeness: "full",
        data_source: "estimated_fallback",
        _score: 52
      };
    }
    return null;
  }
  async collectFromTerms(component, terms, step, candidates, executed, passStats, pass, minScore = 0) {
    const unique = [...new Set(terms.flatMap((t2) => expandCompoundTerms(t2)).map((t2) => t2.trim()).filter(Boolean))];
    for (const term of unique) {
      passStats[pass].queries += 1;
      const products = await this.off.search(term, 15).catch(() => []);
      if (products.length > 0) passStats[pass].hits += 1;
      this.pushCandidates(component, products, term, step, candidates, minScore);
    }
    if (unique.length > 0) executed.add(step);
  }
  dedupeCandidates(items) {
    const byKey = /* @__PURE__ */ new Map();
    for (const item of items) {
      const key = `${item.openfoodfacts_id ?? "no-id"}::${item.product_name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || item._score > existing._score) {
        byKey.set(key, item);
      }
    }
    return [...byKey.values()];
  }
  getNutriment(n, key) {
    const v = n?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  pushCandidates(component, products, term, step, out, minScore = 0) {
    for (const product of products) {
      const value = scoreProduct(product, term, component);
      if (value < Math.max(-0.1, minScore)) continue;
      const kcalRaw = this.getNutriment(product.nutriments, "energy-kcal_100g") ?? this.getNutriment(product.nutriments, "energy-kcal");
      const proteinRaw = this.getNutriment(product.nutriments, "proteins_100g");
      const carbsRaw = this.getNutriment(product.nutriments, "carbohydrates_100g");
      const fatRaw = this.getNutriment(product.nutriments, "fat_100g");
      const fiberRaw = this.getNutriment(product.nutriments, "fiber_100g");
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
        data_completeness: isPartial ? "partial" : "full",
        data_source: "openfoodfacts",
        _score: value
      });
    }
  }
};

// src/lib/nutrition/ensureCookingOil.ts
init_foodDisplayName();
init_genericFoodRegistry();
init_GenericFallbackTable();
var COOKING_FAT_CONTEXT_RE = /ofenblech|backblech|auf\s+dem\s+blech|vom\s+blech|im\s+ofen|ofen\s*gemüse|ofengemüse|blech\s+mit|backblech\s+mit|sheet\s*pan|gebraten|angebraten|in\s+der\s+pfanne|bratpfanne|frittiert|pfannenkartoffeln|bratkartoffeln|brat[aä]sieren|röst[aä]|grill[aä]|überbacken|überbackenes/i;
var NO_COOKING_OIL_RE = /\b(ohne\s+(öl|fett|butter)|kein\s+(öl|fett)|nur\s+gekocht|nur\s+d[aä]mpf|ged[aä]mpft|im\s+wasser\s+gekocht|roh\b|rohes\s+|kalter\s+salat)\b/i;
var COOKING_FAT_NAME_RE = /\b(olivenöl|olivenoel|rapsöl|rapsoel|sonnenblumenöl|pflanzenöl|speiseöl|butterschmalz|butter|margarine|öl\b)\b/i;
function textImpliesCookingFat(text) {
  const t2 = text.trim();
  if (!t2) return false;
  if (NO_COOKING_OIL_RE.test(t2)) return false;
  return COOKING_FAT_CONTEXT_RE.test(t2);
}
function namesIncludeCookingFat(names) {
  return names.some((n) => COOKING_FAT_NAME_RE.test(n.trim()));
}
function estimateCookingOilGrams(text) {
  const t2 = text.toLowerCase();
  if (/frittiert|frittier|viel\s+öl|sehr\s+fett/i.test(t2)) return 20;
  if (/leicht|wenig\s+öl|sparsam/i.test(t2)) return 6;
  if (/ofenblech|backblech|blech\s+mit|ofengemüse|im\s+ofen/i.test(t2)) return 12;
  if (/pfanne|gebraten|angebraten|bratkartoffeln/i.test(t2)) return 10;
  return 12;
}
function preferredOilName(text) {
  return /\brapsöl|rapsoel\b/i.test(text) ? "Raps\xF6l" : "Oliven\xF6l";
}
function ensureCookingOilInSegments(segments, userText) {
  const combined = `${userText}
${segments.meal_name}
${segments.items.map((i) => i.name).join("\n")}`;
  if (!textImpliesCookingFat(combined)) return segments;
  if (namesIncludeCookingFat(segments.items.map((i) => i.name))) return segments;
  const grams = estimateCookingOilGrams(combined);
  return {
    ...segments,
    items: [
      ...segments.items,
      {
        name: preferredOilName(combined),
        quantity: grams,
        unit: "g",
        note: "automatisch f\xFCr Brat-/Ofen-Zubereitung"
      }
    ]
  };
}
function buildOilComponent(name, grams) {
  const trimmed = capitalizeFoodDisplayName(name);
  const tableKey = resolveGenericTableKey(trimmed);
  return {
    id: "c_oil_auto",
    name: trimmed,
    role: "ingredient",
    estimated_grams: grams,
    estimated_piece_count: null,
    grams_per_piece: 15,
    gram_confidence: "medium",
    gram_reasoning: "Automatisch erg\xE4nzt: Brat-/Ofen-/Pfannen-Zubereitung (gesch\xE4tztes \xD6l)",
    is_cooked: false,
    cooking_method: null,
    search_strategy: {
      primary: [trimmed, "Oliven\xF6l", "olive oil"],
      secondary: [],
      generic_fallback: [trimmed],
      off_database_fallback: tableKey ? genericSlugFromTableKey(tableKey) : "olive_oil_generic",
      openfoodfacts_categories: []
    }
  };
}
function ensureCookingOilInAnalysis(analysis, userText) {
  const names = analysis.components.map((c) => c.name);
  const combined = `${userText}
${analysis.meal_name}
${analysis.notes ?? ""}
${names.join("\n")}`;
  if (!textImpliesCookingFat(combined)) return analysis;
  if (namesIncludeCookingFat(names)) return analysis;
  const grams = estimateCookingOilGrams(combined);
  const oil = buildOilComponent(preferredOilName(combined), grams);
  const components = [...analysis.components, oil].map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const total = components.reduce((s, c) => s + c.estimated_grams, 0);
  return { ...analysis, components, total_estimated_weight_g: total };
}

// src/lib/nutrition/enrichPortionDefaults.ts
function enrichComponent(component) {
  const next = { ...component };
  if (next.grams_per_piece != null && next.grams_per_piece > 0) {
    const perPiece2 = next.grams_per_piece;
    if ((next.estimated_piece_count == null || next.estimated_piece_count <= 0) && next.estimated_grams > 0 && perPiece2 > 0) {
      next.estimated_piece_count = Math.max(0.25, Math.round(next.estimated_grams / perPiece2 * 4) / 4);
    }
    return next;
  }
  const def = lookupDefaultPortion(component.name);
  const pieceG = ensurePieceGramsForReview(
    pieceContextFromAnalysis(component.name, null, component.estimated_grams, component)
  );
  next.grams_per_piece = def && (def.unit === "stk" || def.unit === "scheibe") ? def.grams : pieceG;
  const perPiece = next.grams_per_piece ?? pieceG;
  if (!isGramOnlyFood(component.name) && (next.estimated_piece_count == null || next.estimated_piece_count <= 0) && next.estimated_grams > 0 && perPiece > 0) {
    next.estimated_piece_count = Math.max(0.25, Math.round(next.estimated_grams / perPiece * 4) / 4);
  }
  return next;
}
function enrichAnalysisWithPortionCatalog(analysis) {
  return {
    ...analysis,
    components: analysis.components.map(enrichComponent)
  };
}

// src/lib/nutrition/pipeline/pipelineInputCache.ts
import { createHash as createHash2 } from "node:crypto";
var NUTRITION_PIPELINE_CACHE_VERSION = "v3-strict-compound-2026-07";
function normalizeMealInputForCache(text) {
  return text.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s+und\s+/g, " und ").replace(/\s+mit\s+/g, " mit ");
}
function mealInputCacheHash(text) {
  return createHash2("sha256").update(`${NUTRITION_PIPELINE_CACHE_VERSION}|${normalizeMealInputForCache(text)}`).digest("hex");
}
async function getCachedPipelineResult(pool2, userId, text) {
  const hash = mealInputCacheHash(text);
  try {
    const q = await pool2.query(
      `SELECT pipeline_result FROM nutrition_v3_input_cache
       WHERE user_id = $1 AND input_hash = $2
         AND updated_at > NOW() - INTERVAL '90 days'
       LIMIT 1`,
      [userId, hash]
    );
    const row = q.rows[0]?.pipeline_result;
    if (!row) return null;
    const ctx = row.analysis?.portion_context ?? "";
    if (typeof ctx === "string" && (ctx.includes("deterministic-template") || !ctx.includes("segment-then-off") || !ctx.includes("strict"))) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}
async function setCachedPipelineResult(pool2, userId, text, result) {
  const hash = mealInputCacheHash(text);
  const normalized = normalizeMealInputForCache(text);
  try {
    await pool2.query(
      `INSERT INTO nutrition_v3_input_cache (user_id, input_hash, input_normalized, pipeline_result, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (user_id, input_hash) DO UPDATE SET
         input_normalized = EXCLUDED.input_normalized,
         pipeline_result = EXCLUDED.pipeline_result,
         updated_at = NOW()`,
      [userId, hash, normalized, JSON.stringify(result)]
    );
  } catch {
  }
}

// src/lib/nutrition/pipeline/schemas.ts
import { z as z6 } from "zod";
var PipelineStateSchema = z6.enum([
  "IDLE",
  "ANALYZING",
  "SEARCHING",
  "CALCULATING",
  "AWAITING_REVIEW",
  "SAVING",
  "COMPLETE",
  "ERROR"
]);
var SearchStrategySchema = z6.object({
  primary: z6.array(z6.string()).min(1),
  secondary: z6.array(z6.string()).default([]),
  generic_fallback: z6.array(z6.string()).default([]),
  off_database_fallback: z6.string().min(1),
  openfoodfacts_categories: z6.array(z6.string()).default([]),
  barcode_hint: z6.string().nullable().optional()
});
var MealComponentSchema2 = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  role: z6.string().min(1),
  estimated_grams: z6.number().positive(),
  /** Stückzahl, wenn die KI nach Stück gezählt hat (z. B. 2 Semmeln). */
  estimated_piece_count: z6.number().positive().nullable().optional(),
  /** Gramm pro Stück/Scheibe, wenn sinnvoll (z. B. 60 für eine Semmel). */
  grams_per_piece: z6.number().positive().nullable().optional(),
  gram_confidence: z6.enum(["high", "medium", "low"]),
  gram_reasoning: z6.string().min(1),
  is_cooked: z6.boolean(),
  cooking_method: z6.string().nullable().optional(),
  visual_confidence: z6.enum(["high", "medium", "low"]).optional(),
  search_strategy: SearchStrategySchema
});
var MealAnalysisSchema = z6.object({
  input_type: z6.enum(["text", "image"]),
  input_language: z6.string().default("de"),
  meal_name: z6.string().min(1),
  meal_category: z6.string().min(1),
  cuisine: z6.string().nullable().optional(),
  total_estimated_weight_g: z6.number().positive(),
  portion_context: z6.string().nullable().optional(),
  confidence_overall: z6.enum(["high", "medium", "low"]),
  is_chain_restaurant: z6.boolean().optional(),
  chain_name: z6.string().nullable().optional(),
  components: z6.array(MealComponentSchema2).min(1),
  notes: z6.string().nullable().optional(),
  image_analysis: z6.object({
    visible_items: z6.array(z6.string()).default([]),
    container_estimate: z6.string().nullable().optional(),
    uncertainty_factors: z6.array(z6.string()).default([])
  }).nullable().optional()
});
var ProductCandidateSchema = z6.object({
  rank: z6.number().int().min(1).max(3),
  score: z6.number(),
  source_step: z6.enum(["primary", "secondary", "synonym", "category", "generic"]),
  openfoodfacts_id: z6.string().nullable().optional(),
  product_name: z6.string(),
  brand: z6.string().nullable().optional(),
  /** OFF generic_name (nicht Brand) — für Strict-Match / Debug. */
  generic_name: z6.string().nullable().optional(),
  /** Suchterm, mit dem dieser Kandidat gescored wurde. */
  match_term: z6.string().nullable().optional(),
  kcal_100g: z6.number(),
  protein_100g: z6.number(),
  carbs_100g: z6.number(),
  fat_100g: z6.number(),
  fiber_100g: z6.number().nullable().optional(),
  serving_size: z6.string().nullable().optional(),
  data_completeness: z6.enum(["full", "partial"]),
  data_source: z6.enum(["openfoodfacts", "estimated_fallback", "chain_menu_data"])
});
var ComponentMatchSchema = z6.object({
  component_id: z6.string(),
  component_name: z6.string(),
  estimated_grams: z6.number(),
  confidence: z6.enum(["high", "medium", "low"]),
  search_steps_executed: z6.array(z6.string()).default([]),
  candidates: z6.array(ProductCandidateSchema).max(3),
  auto_selected_rank: z6.number().int().min(1).max(3).nullable(),
  requires_user_review: z6.boolean(),
  review_reasons: z6.array(z6.string()).default([])
});
var ComponentNutritionSchema = z6.object({
  component_id: z6.string(),
  component_name: z6.string(),
  grams: z6.number().positive(),
  data_source: z6.enum(["openfoodfacts", "estimated_fallback", "chain_menu_data"]),
  confidence_score: z6.number().min(0).max(100),
  kcal: z6.number(),
  protein: z6.number(),
  carbs: z6.number(),
  fat: z6.number(),
  fiber: z6.number().nullable().optional()
});
var PipelineResultSchema = z6.object({
  state: PipelineStateSchema,
  analysis: MealAnalysisSchema,
  matches: z6.array(ComponentMatchSchema),
  components: z6.array(ComponentNutritionSchema),
  totals: z6.object({
    kcal: z6.number(),
    protein: z6.number(),
    carbs: z6.number(),
    fat: z6.number(),
    fiber: z6.number().nullable().optional()
  }),
  sanityWarnings: z6.array(z6.string()).default([]),
  user_review_required: z6.boolean(),
  pipeline_version: z6.string(),
  ai_model_used: z6.string().nullable().optional()
});

// src/lib/nutrition/pipeline/atomicMealAnalysis.ts
var COMPOSITE_NAME_RE = /(leberk[aä]se\s*semmel|leberk[aä]sesemmel|leberkassemmel|cheeseburger|cheese\s*burger|hamburger(?!patty)|hot\s*dog|hotdog|döner(?!\s*fleisch)|doener(?!\s*fleisch)|dürüm|dueruem|lahmacun|burrito|wrap\s*meal|panini|club\s*sandwich|leberk[aä]ssemmel)/i;
var MEAL_ASSEMBLY_RE = /(semmel|br[oö]tchen|brot|baguette|toast|croissant|wrap|tortilla|pizza|burger|sandwich)/i;
function isCompositeComponentName(name) {
  const n = name.trim();
  if (!n) return false;
  if (COMPOSITE_NAME_RE.test(n)) return true;
  if (/\b(mit|und)\b/i.test(n) && MEAL_ASSEMBLY_RE.test(n) && n.split(/\s+/).length >= 3) {
    return true;
  }
  return false;
}
function findCompositeComponents(components) {
  return components.filter((c) => isCompositeComponentName(c.name));
}
function sortComponentsStable(components) {
  return [...components].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
function reindexComponents(components) {
  return sortComponentsStable(components).map((c, i) => ({
    ...c,
    id: `c${i + 1}`
  }));
}
var REPAIR_SYSTEM = `You fix meal decompositions for Open Food Facts lookup in Germany.
Output ONLY valid JSON matching the same schema as the original meal analysis.

RULES:
- Replace ANY composite dish name with separate atomic ingredients only (each searchable in OFF on its own).
- NEVER output combined names (no Leberk\xE4ssemmel, Cheeseburger, D\xF6ner as one line).
- For Leberk\xE4se in a Semmel: always separate "Semmel" (bread) and "Leberk\xE4se" (slice meat), plus "Senf" if mentioned in user input.
- Keep realistic gram weights; split the composite item's grams across the atomic parts.
- Use consistent German names: Semmel (not Br\xF6tchen) when user said Semmel; Senf for mustard.
- Same user input must yield the same component list and names every time.
- Include estimated_piece_count and grams_per_piece when counting pieces or slices.
- Do NOT add calories or macros.`;
async function repairToAtomicComponents(analysis, userText, image) {
  const composites = findCompositeComponents(analysis.components);
  const prompt = `${REPAIR_SYSTEM}

USER_INPUT (normalized): ${normalizeMealInputForCache(userText)}

CURRENT_MEAL_NAME: ${analysis.meal_name}

COMPOSITE_COMPONENTS_TO_SPLIT (do not keep these names):
${composites.map((c) => `- ${c.name} (${c.estimated_grams} g): ${c.gram_reasoning}`).join("\n")}

OTHER_COMPONENTS_TO_KEEP (merge into final list, adjust grams if needed):
${analysis.components.filter((c) => !composites.includes(c)).map((c) => `- ${c.name} (${c.estimated_grams} g)`).join("\n")}

Return the FULL corrected meal JSON (all components, not only the split ones).`;
  const raw = await completeMealAnalysis(prompt, image, {
    temperature: 0,
    responseMode: "json_object"
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("atomic-repair-invalid-json");
  const parsed = MealAnalysisSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  return parsed;
}
async function ensureAtomicMealAnalysis(analysis, userText, image) {
  let next = {
    ...analysis,
    components: reindexComponents(analysis.components)
  };
  next = ensureCookingOilInAnalysis(next, userText);
  const composites = findCompositeComponents(next.components);
  if (composites.length === 0) {
    return enrichAnalysisWithPortionCatalog(next);
  }
  try {
    const repaired = await repairToAtomicComponents(next, userText, image);
    const stillComposite = findCompositeComponents(repaired.components);
    if (stillComposite.length > 0) {
      throw new Error(`atomic-repair-still-composite:${stillComposite.map((c) => c.name).join(",")}`);
    }
    const repairedWithOil = ensureCookingOilInAnalysis(
      {
        ...repaired,
        components: reindexComponents(repaired.components),
        portion_context: "atomic-repair-v1"
      },
      userText
    );
    return enrichAnalysisWithPortionCatalog(repairedWithOil);
  } catch {
    return enrichAnalysisWithPortionCatalog(next);
  }
}

// src/lib/nutrition/pipeline/mealSegmentAnalysis.ts
import { z as z7 } from "zod";
init_genericFoodRegistry();
init_foodDisplayName();
init_GenericFallbackTable();
var MealSegmentResultSchema = z7.object({
  meal_name: z7.string().min(1),
  items: z7.array(
    z7.object({
      name: z7.string().min(1),
      quantity: z7.number().positive(),
      unit: z7.enum(["stk", "scheibe", "g", "ml"]),
      note: z7.string().nullable().optional()
    })
  ).min(1)
});
var SEGMENT_PROMPT = `Du segmentierst eine Mahlzeit in einzelne Lebensmittel f\xFCr die Datenbank Open Food Facts (OFF).

Antworte NUR mit validem JSON (kein Markdown).

Regeln:
- Nur einzelne Lebensmittel \u2014 maximal atomar segmentieren (jedes Item = ein Basis-Lebensmittel).
- Keine zusammengesetzten Gerichtnamen (verboten: Leberk\xE4ssemmel, Cheeseburger, D\xF6ner als ein Item).
- Keine Marken, keine Zusatzbeschreibungen im Namen (nur: Leberk\xE4se, Semmel, Senf \u2014 nicht \u201EBackofen-Leberk\xE4se Billa\u201C).
- Bei Leberk\xE4ssemmel: "Leberk\xE4se" (nicht Fleischk\xE4se) \u2014 warme Scheibe ca. 55 g, nicht 25 g Aufschnitt.
- quantity = St\xFCckzahl bei stk/scheibe, bei g/ml = Gramm bzw. Milliliter.
- Gleicher Eingabetext \u2192 gleiche items (stabile Namen: Semmel bleibt Semmel).
- Jeder name beginnt mit einem Gro\xDFbuchstaben (z. B. \u201EPaprika\u201C, nicht \u201Epaprika\u201C).
- Kein K\xFCchenger\xE4t als Lebensmittel (verboten: Ofenblech, Backblech, Pfanne, Backpapier).
- Keine pauschalen 100 g f\xFCr alles \u2014 realistische Portionen (Gem\xFCse am Blech oft 80\u2013200 g pro Sorte oder 1 stk).
- Keine Kalorien, keine Marken erfinden.

FETT / BRATEN / OFEN (wichtig f\xFCr realistische Kalorien):
- Wenn aus dem Text klar hervorgeht, dass gebraten, angebraten, in der Pfanne, auf dem Blech/Ofen mit Fett, frittiert, gebacken mit \xD6l o. \xC4.:
  \u2192 zus\xE4tzlich ein Item "Oliven\xF6l" (oder "Raps\xF6l" nur wenn explizit genannt) als eigene Zeile.
- \xD6l-Menge realistisch sch\xE4tzen (nicht \xFCbertreiben):
  \u2022 leicht angebraten / wenig Gem\xFCse in der Pfanne: ca. 5\u20138 g \xD6l (quantity in g)
  \u2022 normales Anbraten (H\xE4hnchen, Ofengem\xFCse-Blech): ca. 8\u201315 g \xD6l
  \u2022 deutlich fettig / frittiert / viel \xD6l im Text: ca. 15\u201325 g \xD6l
- Ofenblech mit Gem\xFCse + Fleisch/K\xE4se: PFLICHT-Zeile Oliven\xF6l ca. 10\u201315 g (auch wenn \u201EOfenblech\u201C nur im Mahlzeitentitel steht).
- Kein \xD6l bei kochen/wallend/kalte Salate/roh, unless explicitly mentioned.
- Wenn USER_INPUT \u201EOfenblech\u201C enth\xE4lt: IMMER Oliven\xF6l als separates Item (System erg\xE4nzt sonst automatisch).
- \xD6l immer als separates Item, nicht in Gem\xFCse/Fleisch \u201Everstecken\u201C.

Beispiel Eingabe: "2 Leberk\xE4ssemmeln mit s\xFC\xDFem Senf"
  \u2192 items: [
      {"name":"Leberk\xE4se","quantity":2,"unit":"scheibe"},
      {"name":"Semmel","quantity":2,"unit":"stk"},
      {"name":"S\xFC\xDFer Senf","quantity":15,"unit":"g","note":"Beilage"}
    ]

Beispiel: "Ofenblech mit Kartoffeln, Paprika, H\xE4hnchen"
  \u2192 zus\xE4tzlich z. B. {"name":"Oliven\xF6l","quantity":12,"unit":"g","note":"f\xFCr Ofenblech"}

JSON-Schema:
{"meal_name":string,"items":[{"name":string,"quantity":number,"unit":"stk"|"scheibe"|"g"|"ml","note":string|null}]}`;
function extractJson(raw) {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("segment-invalid-json");
  return JSON.parse(text.slice(start, end + 1));
}
function offSearchTermsForItem(name) {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  const terms = /* @__PURE__ */ new Set([trimmed]);
  if (/leberk[aä]se/.test(key) && !/fleischk[aä]se/.test(key)) {
    terms.add("Leberk\xE4se");
    terms.add("Leberkaese");
  }
  if (/fleischk[aä]se/.test(key)) terms.add("Fleischk\xE4se");
  if (/semmel/.test(key)) {
    terms.add("Semmel");
    terms.add("Br\xF6tchen");
  }
  if (/br[oö]tchen/.test(key) && !/semmel/.test(key)) terms.add("Br\xF6tchen");
  if (/senf/.test(key)) {
    terms.add("Senf");
    terms.add("s\xFC\xDFer Senf");
  }
  if (/oliven|raps|sonnenblumen|pflanzen/.test(key) && /öl|ol\b/.test(key)) {
    terms.add("Oliven\xF6l");
    terms.add("olive oil");
  }
  return [...terms];
}
function slugOffFallback(name) {
  const resolved = resolveGenericTableKey(name);
  if (resolved) return genericSlugFromTableKey(resolved);
  return name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
}
function normalizeSegmentItem(item) {
  const name = capitalizeFoodDisplayName(item.name);
  let quantity = item.quantity;
  let unit = item.unit;
  const def = lookupDefaultPortion(name);
  if ((unit === "g" || unit === "ml") && quantity === 100 && def) {
    if (def.unit === "g" || def.unit === "ml") {
      quantity = def.grams;
    } else if (def.unit === "stk" || def.unit === "scheibe") {
      unit = def.unit;
      quantity = Math.max(0.25, quantity > 0 && quantity <= 4 ? quantity : 1);
    }
  }
  if (unit === "g" && def && (def.unit === "g" || def.unit === "ml") && quantity < def.grams * 0.35) {
    quantity = def.grams;
  }
  return { ...item, name, quantity, unit };
}
function gramsForSegmentItem(item) {
  if (item.unit === "g" || item.unit === "ml") {
    const grams = Math.max(1, Math.round(item.quantity));
    const pieceGrams2 = ensurePieceGramsForReview(
      pieceContextFromAnalysis(item.name, null, grams, null)
    );
    return {
      grams,
      pieceCount: Math.max(0.25, Math.round(grams / pieceGrams2 * 4) / 4),
      pieceGrams: pieceGrams2
    };
  }
  const provisionalGrams = item.unit === "stk" ? Math.max(1, Math.round(item.quantity * 60)) : Math.max(1, Math.round(item.quantity * (/leberk[aä]se/i.test(item.name) ? 55 : 25)));
  const pieceGrams = resolvePieceGrams(
    pieceContextFromAnalysis(item.name, null, provisionalGrams, null)
  );
  const per = pieceGrams ?? lookupDefaultPortion(item.name)?.grams ?? (item.unit === "scheibe" ? /leberk[aä]se/i.test(item.name) ? 55 : 25 : 60);
  return {
    grams: Math.max(1, Math.round(per * item.quantity)),
    pieceCount: item.quantity,
    pieceGrams: per
  };
}
function mealAnalysisFromSegments(segments, userText) {
  const components = segments.items.map((item) => normalizeSegmentItem(item)).filter((item) => !isCompositeComponentName(item.name) && !isNonFoodUtensilName(item.name)).map((item, idx) => {
    const { grams, pieceCount, pieceGrams } = gramsForSegmentItem(item);
    const qtyLabel = item.unit === "g" || item.unit === "ml" ? `${item.quantity} ${item.unit}` : `${item.quantity}\xD7 ${item.unit}`;
    return {
      id: `c${idx + 1}`,
      name: item.name.trim(),
      role: "ingredient",
      estimated_grams: grams,
      estimated_piece_count: pieceCount,
      grams_per_piece: pieceGrams,
      gram_confidence: "high",
      gram_reasoning: `Segmentierung: ${qtyLabel}${item.note ? ` (${item.note})` : ""}`,
      is_cooked: true,
      cooking_method: null,
      search_strategy: {
        primary: offSearchTermsForItem(item.name),
        secondary: [],
        generic_fallback: [item.name.trim()],
        off_database_fallback: slugOffFallback(item.name) || "white_bread_generic",
        openfoodfacts_categories: []
      }
    };
  });
  if (components.length === 0) {
    throw new Error("segment-no-atomic-items");
  }
  const total = components.reduce((s, c) => s + c.estimated_grams, 0);
  return {
    input_type: "text",
    input_language: "de",
    meal_name: capitalizeFoodDisplayName(segments.meal_name).slice(0, 200),
    meal_category: "mixed",
    cuisine: "german",
    total_estimated_weight_g: total,
    portion_context: "segment-then-off-v2-strict",
    confidence_overall: "high",
    is_chain_restaurant: false,
    chain_name: null,
    components,
    notes: userText.trim() ? `Eingabe: ${userText.trim().slice(0, 500)}` : null,
    image_analysis: null
  };
}
async function segmentMealWithAi(userText, image) {
  const normalized = normalizeMealInputForCache(userText);
  const prompt = `${SEGMENT_PROMPT}

NORMALIZED_INPUT:
${normalized}

USER_INPUT:
${userText}`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const hint = attempt === 0 ? "" : "\n\nNur g\xFCltiges JSON. Nur einzelne Lebensmittel mit Menge.";
      const raw = await completeMealAnalysis(`${prompt}${hint}`, image, {
        temperature: 0,
        responseMode: "json_object"
      });
      const segments = MealSegmentResultSchema.parse(extractJson(raw));
      const withOil = ensureCookingOilInSegments(segments, userText);
      const analysis = mealAnalysisFromSegments(withOil, userText);
      return enrichAnalysisWithPortionCatalog(analysis);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`segment-failed:${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// src/lib/nutrition/pipeline/MealAnalysisService.ts
var FULL_ANALYSIS_PROMPT = `Decompose food into ATOMIC single foods for Open Food Facts. No composite names. No calories. JSON only.
Each component needs search_strategy. Temperature 0. Same input \u2192 same component names.`;
function parseImageDataUrl(url) {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}
function extractJson2(raw) {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid-json");
  return JSON.parse(text.slice(start, end + 1));
}
var MealAnalysisService = class {
  /**
   * Pipeline Schritt 1: KI segmentiert maximal atomar (+ Öl bei Brat/Ofen wenn plausibel).
   * Schritte 2–4: FoodDatabaseService → OFF streng → Generic → KI-neuer Generic-Eintrag.
   */
  async analyze(payload) {
    const text = String(payload.text ?? "").trim();
    const imageDataUrl = String(payload.imageDataUrl ?? "").trim();
    const image = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;
    if (!text && !image) throw new Error("missing-input");
    const modelUsed = process.env.AI_ACTIVE_PROVIDER ?? null;
    try {
      const analysis = await segmentMealWithAi(text || "Foto-Mahlzeit", image ?? void 0);
      return {
        analysis,
        modelUsed: modelUsed ? `${modelUsed}:segment` : "segment"
      };
    } catch {
    }
    const normalizedHint = text ? `
NORMALIZED:
${normalizeMealInputForCache(text)}` : "";
    const inputPrompt = `${FULL_ANALYSIS_PROMPT}${normalizedHint}

USER_INPUT:
${text || "image-only"}`;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await completeMealAnalysis(inputPrompt, image ?? void 0, {
          temperature: 0,
          responseMode: "json_object"
        });
        const parsed = MealAnalysisSchema.parse(extractJson2(raw));
        const analysis = await ensureAtomicMealAnalysis(parsed, text, image ?? void 0);
        return { analysis, modelUsed };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`analysis-failed:${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
};

// src/lib/nutrition/pipeline/SanityValidator.ts
var MEAL_SANITY_RANGES = {
  snack: { min: 50, max: 400 },
  breakfast: { min: 200, max: 900 },
  lunch: { min: 300, max: 1200 },
  dinner: { min: 300, max: 1200 },
  street_food: { min: 350, max: 1100 },
  drink_cold: { min: 0, max: 600 },
  drink_hot: { min: 0, max: 400 },
  dessert: { min: 100, max: 800 }
};
function validateSanity(analysis, totalKcal, totals) {
  const warnings = [];
  const key = analysis.meal_category;
  const range = MEAL_SANITY_RANGES[key];
  if (range && (totalKcal < range.min || totalKcal > range.max)) {
    warnings.push(
      `Kalorien wirken unplausibel f\xFCr ${analysis.meal_name}: ${totalKcal} kcal (erwartet ${range.min}-${range.max}).`
    );
  }
  if (totals && totalKcal > 80) {
    const macroKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
    const diff = Math.abs(macroKcal - totalKcal);
    if (diff > totalKcal * 0.35) {
      warnings.push(
        `Makro-Summe (${Math.round(macroKcal)} kcal) weicht stark von Gesamt-${totalKcal} kcal ab \u2014 bitte Zutaten pr\xFCfen.`
      );
    }
  }
  return warnings;
}

// src/lib/nutrition/enrichPieceWeights.ts
function extractJson3(raw) {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid-json");
  return JSON.parse(text.slice(start, end + 1));
}
function withDerivedPieceCount(comp, pieceG) {
  const next = { ...comp, grams_per_piece: pieceG };
  if ((next.estimated_piece_count == null || next.estimated_piece_count <= 0) && next.estimated_grams > 0 && pieceG > 0) {
    next.estimated_piece_count = Math.max(0.25, Math.round(next.estimated_grams / pieceG * 4) / 4);
  }
  return next;
}
function ensurePieceWeightsOnAnalysis(analysis, matches) {
  const components = analysis.components.map((comp) => {
    if (comp.grams_per_piece != null && comp.grams_per_piece > 0) {
      return withDerivedPieceCount(comp, Math.round(comp.grams_per_piece));
    }
    const match = matches?.find((m) => m.component_id === comp.id);
    const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
    const fromServing = parsePieceGramsFromServingSize(top?.serving_size);
    const ctx = pieceContextFromAnalysis(comp.name, top?.serving_size ?? null, comp.estimated_grams, comp);
    const pieceG = fromServing ?? ensurePieceGramsForReview(ctx);
    return withDerivedPieceCount(comp, pieceG);
  });
  return { ...analysis, components };
}
function needsOffAiPieceEstimate(match) {
  const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
  if (!top || top.data_source !== "openfoodfacts") return false;
  return !parsePieceGramsFromServingSize(top.serving_size);
}
async function enrichOffPieceWeightsWithAi(analysis, matches) {
  const pending = analysis.components.map((comp) => {
    const match = matches.find((m) => m.component_id === comp.id);
    if (!needsOffAiPieceEstimate(match)) return null;
    const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
    return { comp, productLabel: top?.product_name ?? comp.name };
  }).filter((x) => Boolean(x));
  if (pending.length === 0) return analysis;
  const list = pending.map((p, i) => `${i + 1}. "${p.comp.name}"${p.productLabel !== p.comp.name ? ` (Produkt: ${p.productLabel})` : ""}`).join("\n");
  const prompt = `Sch\xE4tze f\xFCr jedes Lebensmittel das typische Gewicht EINES St\xFCcks in Gramm (8\u2013600).
Nur rohes JSON, kein Markdown.

Lebensmittel:
${list}

Antwortformat:
{"items":[{"name":"<exakt wie oben>","grams_per_piece":<number>}]}`;
  try {
    const raw = await completeMealAnalysis(prompt, void 0, {
      temperature: 0.2,
      responseMode: "json_object"
    });
    const parsed = extractJson3(raw);
    const byName = /* @__PURE__ */ new Map();
    for (const row of parsed.items ?? []) {
      const name = String(row.name ?? "").trim().toLowerCase();
      const g = Number(row.grams_per_piece);
      if (name && Number.isFinite(g) && g >= 8 && g <= 600) {
        byName.set(name, Math.round(g));
      }
    }
    const components = analysis.components.map((comp) => {
      const key = comp.name.trim().toLowerCase();
      const aiG = byName.get(key);
      if (aiG == null) return comp;
      return withDerivedPieceCount(comp, aiG);
    });
    return { ...analysis, components };
  } catch (err) {
    console.warn("enrichOffPieceWeightsWithAi: skip", err);
    return analysis;
  }
}

// src/lib/nutrition/pipeline/syncOffToAnalysis.ts
function syncAnalysisAndMatchesFromOff(analysis, matches) {
  const components = analysis.components.map((comp) => {
    const match = matches.find((m) => m.component_id === comp.id);
    const top = match?.candidates[(match.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
    if (!top || top.data_source !== "openfoodfacts") return comp;
    const fromServing = parsePieceGramsFromServingSize(top.serving_size);
    let next = { ...comp };
    const pieceG = fromServing ?? (next.grams_per_piece && next.grams_per_piece > 0 ? next.grams_per_piece : ensurePieceGramsForReview(
      pieceContextFromAnalysis(comp.name, top.serving_size, comp.estimated_grams, comp)
    ));
    if (pieceG > 0) {
      next.grams_per_piece = pieceG;
    }
    if (next.grams_per_piece && next.estimated_piece_count) {
      next.estimated_grams = Math.max(
        1,
        Math.round(next.estimated_piece_count * next.grams_per_piece)
      );
    }
    return next;
  });
  const nextMatches = matches.map((m) => {
    const comp = components.find((c) => c.id === m.component_id);
    if (!comp) return m;
    return { ...m, estimated_grams: comp.estimated_grams };
  });
  return {
    analysis: {
      ...analysis,
      components,
      total_estimated_weight_g: components.reduce((s, c) => s + c.estimated_grams, 0)
    },
    matches: nextMatches
  };
}

// src/lib/nutrition/pipeline/NutritionAIService.ts
var PIPELINE_VERSION = "nutrition-v3";
var PIPELINE_TIMEOUT_MS = 45e3;
var PIPELINE_RETRY_ATTEMPTS = 2;
var NutritionAIService = class {
  constructor(analyzer = new MealAnalysisService(), database = new FoodDatabaseService()) {
    this.analyzer = analyzer;
    this.database = database;
  }
  async process(payload) {
    const timed = this.runWithTimeout(async () => {
      let { analysis, modelUsed } = await this.runWithRetry(() => this.analyzer.analyze(payload));
      let matches = await this.runWithRetry(
        () => this.database.matchComponents(analysis, {
          chainName: analysis.is_chain_restaurant ? analysis.chain_name : null
        })
      );
      let synced = syncAnalysisAndMatchesFromOff(analysis, matches);
      analysis = synced.analysis;
      matches = synced.matches;
      analysis = await enrichOffPieceWeightsWithAi(analysis, matches);
      analysis = ensurePieceWeightsOnAnalysis(analysis, matches);
      synced = syncAnalysisAndMatchesFromOff(analysis, matches);
      analysis = synced.analysis;
      matches = synced.matches;
      const components = matches.map((m) => calculateNutrition(m)).filter((v) => Boolean(v));
      const totals = sumNutrition(components);
      const sanityWarnings = validateSanity(analysis, totals.kcal, totals);
      const userReviewRequired = matches.some((m) => m.requires_user_review) || components.some((c) => c.data_source === "estimated_fallback");
      return PipelineResultSchema.parse({
        state: "AWAITING_REVIEW",
        analysis,
        matches,
        components,
        totals,
        sanityWarnings,
        user_review_required: userReviewRequired,
        pipeline_version: PIPELINE_VERSION,
        ai_model_used: modelUsed
      });
    });
    return timed;
  }
  async runWithRetry(work) {
    let attempt = 0;
    while (attempt <= PIPELINE_RETRY_ATTEMPTS) {
      try {
        return await work();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const retryable = message.includes("timeout") || message.includes("network") || message.includes("pipeline-timeout") || message.includes("analysis-failed") || message.includes("invalid-json") || message.includes("no-json") || message.includes("off-http-5");
        if (!retryable || attempt >= PIPELINE_RETRY_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        attempt += 1;
      }
    }
    throw new Error("pipeline-retry-exhausted");
  }
  async runWithTimeout(work) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("pipeline-timeout")), PIPELINE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
};

// src/lib/nutrition/pipeline/MealLogRepository.ts
function ingredientPortionFromReview(item, foodName, grams) {
  if (item.displayUnit === "piece" && item.pieceGrams && item.pieceGrams > 0) {
    return {
      name: foodName,
      amount: pieceQuantityFromGrams(grams, item.pieceGrams),
      unit: "stk"
    };
  }
  return {
    name: foodName,
    amount: grams,
    unit: "g"
  };
}
var MealLogRepository = class {
  constructor(pool2) {
    this.pool = pool2;
  }
  async saveReviewedMeal(params) {
    const componentById = new Map(params.result.components.map((c) => [c.component_id, c]));
    const matchById = new Map(params.result.matches.map((m) => [m.component_id, m]));
    const rows = params.reviewedComponents.map((item) => {
      const comp = componentById.get(item.component_id);
      const match = matchById.get(item.component_id);
      if (!comp || !match) return null;
      const selected = match.candidates[(item.selectedRank ?? 1) - 1] ?? match.candidates[0];
      if (!selected) return null;
      const macros = macrosForCandidate(selected, item.grams);
      return {
        componentId: item.component_id,
        food_name: comp.component_name,
        openfoodfacts_id: selected.openfoodfacts_id ?? null,
        product_name: selected.product_name,
        brand: selected.brand ?? null,
        grams: item.grams,
        kcal: macros.kcal,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_g: macros.fat,
        fiber_g: macros.fiber,
        data_source: selected.data_source,
        confidence_score: selected.score,
        user_modified: item.user_modified === true
      };
    }).filter((v) => Boolean(v));
    const totals = rows.reduce(
      (acc, row) => ({
        kcal: acc.kcal + row.kcal,
        protein: Math.round((acc.protein + row.protein_g) * 10) / 10,
        carbs: Math.round((acc.carbs + row.carbs_g) * 10) / 10,
        fat: Math.round((acc.fat + row.fat_g) * 10) / 10,
        fiber: Math.round((acc.fiber + (row.fiber_g ?? 0)) * 10) / 10
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
    const nutritionIns = await this.pool.query(
      `INSERT INTO nutrition (
         user_id, meal, category, calories, protein, carbs, fat, date,
         ingredients, quantity, unit, input_type, original_input, meal_category,
         cuisine, total_fiber, ai_model_used, pipeline_version, user_reviewed
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       ) RETURNING id`,
      [
        params.userId,
        params.result.analysis.meal_name,
        params.category ?? this.mapMealCategory(params.result.analysis.meal_category),
        totals.kcal,
        totals.protein,
        totals.carbs,
        totals.fat,
        params.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(
          rows.map((r) => {
            const reviewed = params.reviewedComponents.find((c) => c.component_id === r.componentId);
            const portion = ingredientPortionFromReview(
              reviewed ?? { component_id: r.componentId, grams: r.grams, displayUnit: "g" },
              r.food_name,
              r.grams
            );
            return {
              id: r.openfoodfacts_id || void 0,
              name: portion.name,
              amount: portion.amount,
              unit: portion.unit,
              calories: r.kcal,
              protein: r.protein_g,
              carbs: r.carbs_g,
              fat: r.fat_g,
              nutrientSource: r.data_source === "openfoodfacts" ? "database" : "model_estimate",
              matchScore: (r.confidence_score ?? 0) / 100,
              matchSource: r.data_source
            };
          })
        ),
        null,
        null,
        params.result.analysis.input_type,
        params.originalInput,
        params.result.analysis.meal_category,
        params.result.analysis.cuisine ?? null,
        totals.fiber,
        params.result.ai_model_used ?? null,
        params.result.pipeline_version,
        true
      ]
    );
    const nutritionId = nutritionIns.rows[0]?.id;
    if (!nutritionId) throw new Error("nutrition-insert-failed");
    for (const row of rows) {
      await this.pool.query(
        `INSERT INTO nutrition_log_components (
          nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
          grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          nutritionId,
          row.componentId,
          row.food_name,
          row.openfoodfacts_id,
          row.product_name,
          row.brand,
          row.grams,
          row.kcal,
          row.protein_g,
          row.carbs_g,
          row.fat_g,
          row.fiber_g,
          row.data_source,
          row.confidence_score,
          row.user_modified
        ]
      );
    }
    return nutritionId;
  }
  async updateReviewedMeal(params) {
    const owned = await this.pool.query(
      `SELECT id FROM nutrition WHERE id = $1 AND user_id = $2`,
      [params.nutritionId, params.userId]
    );
    if (!owned.rows[0]?.id) throw new Error("nutrition-not-found");
    const componentById = new Map(params.result.components.map((c) => [c.component_id, c]));
    const matchById = new Map(params.result.matches.map((m) => [m.component_id, m]));
    const rows = params.reviewedComponents.map((item) => {
      const comp = componentById.get(item.component_id);
      const match = matchById.get(item.component_id);
      if (!comp || !match) return null;
      const selected = match.candidates[(item.selectedRank ?? 1) - 1] ?? match.candidates[0];
      if (!selected) return null;
      const macros = macrosForCandidate(selected, item.grams);
      return {
        componentId: item.component_id,
        food_name: comp.component_name,
        openfoodfacts_id: selected.openfoodfacts_id ?? null,
        product_name: selected.product_name,
        brand: selected.brand ?? null,
        grams: item.grams,
        kcal: macros.kcal,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_g: macros.fat,
        fiber_g: macros.fiber,
        data_source: selected.data_source,
        confidence_score: selected.score,
        user_modified: item.user_modified === true
      };
    }).filter((v) => Boolean(v));
    const totals = rows.reduce(
      (acc, row) => ({
        kcal: acc.kcal + row.kcal,
        protein: Math.round((acc.protein + row.protein_g) * 10) / 10,
        carbs: Math.round((acc.carbs + row.carbs_g) * 10) / 10,
        fat: Math.round((acc.fat + row.fat_g) * 10) / 10,
        fiber: Math.round((acc.fiber + (row.fiber_g ?? 0)) * 10) / 10
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
    const dateVal = params.date?.includes("T") ? params.date.split("T")[0] : params.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    await this.pool.query(
      `UPDATE nutrition SET
         meal=$1, category=$2, calories=$3, protein=$4, carbs=$5, fat=$6, date=$7,
         ingredients=$8::jsonb, original_input=COALESCE($9, original_input), meal_category=$10,
         cuisine=$11, total_fiber=$12, ai_model_used=$13, pipeline_version=$14, user_reviewed=true
       WHERE id=$15 AND user_id=$16`,
      [
        params.result.analysis.meal_name,
        params.category ?? this.mapMealCategory(params.result.analysis.meal_category),
        totals.kcal,
        totals.protein,
        totals.carbs,
        totals.fat,
        dateVal,
        JSON.stringify(
          rows.map((r) => {
            const reviewed = params.reviewedComponents.find((c) => c.component_id === r.componentId);
            const portion = ingredientPortionFromReview(
              reviewed ?? { component_id: r.componentId, grams: r.grams, displayUnit: "g" },
              r.food_name,
              r.grams
            );
            return {
              id: r.openfoodfacts_id || void 0,
              name: portion.name,
              amount: portion.amount,
              unit: portion.unit,
              calories: r.kcal,
              protein: r.protein_g,
              carbs: r.carbs_g,
              fat: r.fat_g,
              nutrientSource: r.data_source === "openfoodfacts" ? "database" : "model_estimate",
              matchScore: (r.confidence_score ?? 0) / 100,
              matchSource: r.data_source
            };
          })
        ),
        params.originalInput ?? null,
        params.result.analysis.meal_category,
        params.result.analysis.cuisine ?? null,
        totals.fiber,
        params.result.ai_model_used ?? null,
        params.result.pipeline_version,
        params.nutritionId,
        params.userId
      ]
    );
    await this.pool.query(`DELETE FROM nutrition_log_components WHERE nutrition_id = $1`, [params.nutritionId]);
    for (const row of rows) {
      await this.pool.query(
        `INSERT INTO nutrition_log_components (
          nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
          grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          params.nutritionId,
          row.componentId,
          row.food_name,
          row.openfoodfacts_id,
          row.product_name,
          row.brand,
          row.grams,
          row.kcal,
          row.protein_g,
          row.carbs_g,
          row.fat_g,
          row.fiber_g,
          row.data_source,
          row.confidence_score,
          row.user_modified
        ]
      );
    }
  }
  async upsertUserFoodPreference(params) {
    await this.pool.query(
      `INSERT INTO user_food_preferences (
        user_id, ingredient_key, preferred_openfoodfacts_id, preferred_product_name, preferred_grams, updated_at
      ) VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (user_id, ingredient_key)
      DO UPDATE SET
        preferred_openfoodfacts_id = EXCLUDED.preferred_openfoodfacts_id,
        preferred_product_name = EXCLUDED.preferred_product_name,
        preferred_grams = EXCLUDED.preferred_grams,
        updated_at = NOW()`,
      [
        params.userId,
        params.ingredientKey.toLowerCase().trim(),
        params.preferredOpenfoodfactsId,
        params.preferredProductName ?? null,
        params.preferredGrams ?? null
      ]
    );
  }
  mapMealCategory(category) {
    if (category === "breakfast" || category === "lunch" || category === "dinner" || category === "snack") {
      return category;
    }
    if (category.startsWith("drink")) return "snack";
    if (category === "street_food") return "lunch";
    if (category === "dessert") return "snack";
    return "lunch";
  }
};

// src/lib/nutrition/pipeline/e2eNutritionMock.ts
function buildE2eNutritionPipelineMock(text) {
  const meal = text.trim().slice(0, 120) || "E2E Testmahlzeit";
  const joghurtGrams = 200;
  const bananeGrams = 120;
  return {
    state: "AWAITING_REVIEW",
    analysis: {
      input_type: "text",
      input_language: "de",
      meal_name: meal,
      meal_category: "snack",
      cuisine: null,
      total_estimated_weight_g: joghurtGrams + bananeGrams,
      portion_context: "e2e-mock",
      confidence_overall: "high",
      is_chain_restaurant: false,
      chain_name: null,
      components: [
        {
          id: "e2e_c1",
          name: "Griechischer Joghurt",
          role: "ingredient",
          estimated_grams: joghurtGrams,
          gram_confidence: "high",
          gram_reasoning: "e2e fixture",
          is_cooked: false,
          search_strategy: {
            primary: ["griechischer joghurt"],
            secondary: [],
            generic_fallback: ["joghurt"],
            off_database_fallback: "yogurt",
            openfoodfacts_categories: []
          }
        },
        {
          id: "e2e_c2",
          name: "Banane",
          role: "ingredient",
          estimated_grams: bananeGrams,
          estimated_piece_count: 1,
          grams_per_piece: 120,
          gram_confidence: "high",
          gram_reasoning: "1 Banane, ca. 120 g",
          is_cooked: false,
          search_strategy: {
            primary: ["banane"],
            secondary: [],
            generic_fallback: ["banana"],
            off_database_fallback: "banana",
            openfoodfacts_categories: []
          }
        }
      ],
      notes: null
    },
    matches: [
      {
        component_id: "e2e_c1",
        component_name: "Griechischer Joghurt",
        estimated_grams: joghurtGrams,
        confidence: "high",
        search_steps_executed: ["e2e_mock"],
        candidates: [
          {
            rank: 1,
            score: 92,
            source_step: "generic",
            openfoodfacts_id: null,
            product_name: "Griechischer Joghurt (E2E)",
            brand: null,
            kcal_100g: 59,
            protein_100g: 10,
            carbs_100g: 3.6,
            fat_100g: 0.4,
            fiber_100g: 0,
            serving_size: "100 g",
            data_completeness: "partial",
            data_source: "estimated_fallback"
          }
        ],
        auto_selected_rank: 1,
        requires_user_review: false,
        review_reasons: []
      },
      {
        component_id: "e2e_c2",
        component_name: "Banane",
        estimated_grams: bananeGrams,
        confidence: "high",
        search_steps_executed: ["e2e_mock"],
        candidates: [
          {
            rank: 1,
            score: 95,
            source_step: "generic",
            openfoodfacts_id: null,
            product_name: "Banane (E2E)",
            brand: null,
            kcal_100g: 89,
            protein_100g: 1.1,
            carbs_100g: 23,
            fat_100g: 0.3,
            fiber_100g: 2.6,
            serving_size: "100 g",
            data_completeness: "partial",
            data_source: "estimated_fallback"
          }
        ],
        auto_selected_rank: 1,
        requires_user_review: false,
        review_reasons: []
      }
    ],
    components: [
      {
        component_id: "e2e_c1",
        component_name: "Griechischer Joghurt",
        grams: joghurtGrams,
        data_source: "estimated_fallback",
        confidence_score: 92,
        kcal: 118,
        protein: 20,
        carbs: 7.2,
        fat: 0.8,
        fiber: 0
      },
      {
        component_id: "e2e_c2",
        component_name: "Banane",
        grams: bananeGrams,
        data_source: "estimated_fallback",
        confidence_score: 95,
        kcal: 107,
        protein: 1.3,
        carbs: 27.6,
        fat: 0.4,
        fiber: 3.1
      }
    ],
    totals: { kcal: 225, protein: 21.3, carbs: 34.8, fat: 1.2, fiber: 3.1 },
    sanityWarnings: [],
    user_review_required: false,
    pipeline_version: "nutrition-v3",
    ai_model_used: "e2e-mock"
  };
}

// src/lib/nutrition/pipeline/pipelineMetrics.ts
var DURATION_BUCKETS = ["le_250ms", "le_500ms", "le_1000ms", "le_3000ms", "gt_3000ms"];
function emptyHistogram() {
  return { le_250ms: 0, le_500ms: 0, le_1000ms: 0, le_3000ms: 0, gt_3000ms: 0 };
}
var histogramByEndpoint = {
  process: emptyHistogram(),
  finalize: emptyHistogram(),
  update: emptyHistogram()
};
var counters = {
  process_ok: 0,
  process_fail: 0,
  finalize_ok: 0,
  finalize_fail: 0,
  update_ok: 0,
  update_fail: 0,
  totalDurationMs: 0,
  totalComponents: 0,
  totalFallbackMatches: 0,
  lastError: null,
  lastEvent: null,
  lastEventAt: null
};
function durationBucketForMs(durationMs) {
  if (durationMs < 250) return "le_250ms";
  if (durationMs < 500) return "le_500ms";
  if (durationMs < 1e3) return "le_1000ms";
  if (durationMs < 3e3) return "le_3000ms";
  return "gt_3000ms";
}
function endpointFromMetricEvent(event) {
  if (event.startsWith("process")) return "process";
  if (event.startsWith("finalize")) return "finalize";
  return "update";
}
function recordNutritionV3Duration(endpoint, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const bucket = durationBucketForMs(durationMs);
  histogramByEndpoint[endpoint][bucket] += 1;
}
function recordNutritionV3Metric(event, payload = {}) {
  counters[event] += 1;
  if (payload.durationMs != null) {
    counters.totalDurationMs += payload.durationMs;
    recordNutritionV3Duration(endpointFromMetricEvent(event), payload.durationMs);
  }
  if (payload.components != null) counters.totalComponents += payload.components;
  if (payload.fallbackCount != null) counters.totalFallbackMatches += payload.fallbackCount;
  counters.lastEvent = event;
  counters.lastEventAt = (/* @__PURE__ */ new Date()).toISOString();
  if (payload.error) counters.lastError = payload.error;
  console.info(
    "[nutrition-v3]",
    JSON.stringify({
      event,
      ts: counters.lastEventAt,
      ...payload
    })
  );
}
function getNutritionV3StatsSnapshot() {
  const success = counters.process_ok + counters.finalize_ok + counters.update_ok;
  const fail = counters.process_fail + counters.finalize_fail + counters.update_fail;
  const total = success + fail;
  return {
    counters: { ...counters },
    histogramByEndpoint: {
      process: { ...histogramByEndpoint.process },
      finalize: { ...histogramByEndpoint.finalize },
      update: { ...histogramByEndpoint.update }
    },
    successRate: total > 0 ? Math.round(success / total * 1e3) / 10 : null,
    avgDurationMs: success > 0 ? Math.round(counters.totalDurationMs / Math.max(1, success)) : null,
    avgComponentsPerMeal: success > 0 ? Math.round(counters.totalComponents / success * 10) / 10 : null,
    fallbackRate: counters.totalComponents > 0 ? Math.round(counters.totalFallbackMatches / counters.totalComponents * 1e3) / 10 : null
  };
}
function fmtMetric(name, value) {
  if (value == null || !Number.isFinite(value)) return `${name} 0`;
  return `${name} ${value}`;
}
function histogramPrometheusLines(prefix, endpoint, buckets) {
  const lines = [
    `# HELP ${prefix}_duration_ms Histogram buckets for nutrition v3 ${endpoint}`,
    `# TYPE ${prefix}_duration_ms histogram`
  ];
  let cumulative = 0;
  for (const bucket of DURATION_BUCKETS) {
    cumulative += buckets[bucket] ?? 0;
    lines.push(`${prefix}_duration_ms_bucket{endpoint="${endpoint}",le="${bucket}"} ${cumulative}`);
  }
  lines.push(`${prefix}_duration_ms_count{endpoint="${endpoint}"} ${cumulative}`);
  return lines;
}
function getNutritionV3MetricsPrometheus(dbHistogram) {
  const stats = getNutritionV3StatsSnapshot();
  const c = stats.counters;
  const lines = [
    "# HELP nutrition_v3_process_ok_total Successful v3 process calls",
    "# TYPE nutrition_v3_process_ok_total counter",
    `nutrition_v3_process_ok_total ${c.process_ok}`,
    "# HELP nutrition_v3_process_fail_total Failed v3 process calls",
    "# TYPE nutrition_v3_process_fail_total counter",
    `nutrition_v3_process_fail_total ${c.process_fail}`,
    "# HELP nutrition_v3_finalize_ok_total Successful v3 finalize calls",
    "# TYPE nutrition_v3_finalize_ok_total counter",
    `nutrition_v3_finalize_ok_total ${c.finalize_ok}`,
    "# HELP nutrition_v3_finalize_fail_total Failed v3 finalize calls",
    "# TYPE nutrition_v3_finalize_fail_total counter",
    `nutrition_v3_finalize_fail_total ${c.finalize_fail}`,
    "# HELP nutrition_v3_update_ok_total Successful v3 update calls",
    "# TYPE nutrition_v3_update_ok_total counter",
    `nutrition_v3_update_ok_total ${c.update_ok}`,
    "# HELP nutrition_v3_update_fail_total Failed v3 update calls",
    "# TYPE nutrition_v3_update_fail_total counter",
    `nutrition_v3_update_fail_total ${c.update_fail}`,
    "# HELP nutrition_v3_avg_duration_ms Average duration across successful calls",
    "# TYPE nutrition_v3_avg_duration_ms gauge",
    fmtMetric("nutrition_v3_avg_duration_ms", stats.avgDurationMs),
    "# HELP nutrition_v3_avg_components_per_meal Average reviewed components per successful call",
    "# TYPE nutrition_v3_avg_components_per_meal gauge",
    fmtMetric("nutrition_v3_avg_components_per_meal", stats.avgComponentsPerMeal),
    "# HELP nutrition_v3_fallback_rate_percent Fallback hit rate in percent",
    "# TYPE nutrition_v3_fallback_rate_percent gauge",
    fmtMetric("nutrition_v3_fallback_rate_percent", stats.fallbackRate),
    "# HELP nutrition_v3_success_rate_percent Success rate in percent",
    "# TYPE nutrition_v3_success_rate_percent gauge",
    fmtMetric("nutrition_v3_success_rate_percent", stats.successRate),
    ...histogramPrometheusLines("nutrition_v3", "process", histogramByEndpoint.process),
    ...histogramPrometheusLines("nutrition_v3", "finalize", histogramByEndpoint.finalize),
    ...histogramPrometheusLines("nutrition_v3", "update", histogramByEndpoint.update)
  ];
  if (dbHistogram?.length) {
    const grouped = /* @__PURE__ */ new Map();
    for (const row of dbHistogram) {
      const ep = row.endpoint || "unknown";
      if (!grouped.has(ep)) grouped.set(ep, {});
      grouped.get(ep)[row.bucket] = (grouped.get(ep)[row.bucket] ?? 0) + row.count;
    }
    lines.push("# HELP nutrition_v3_db_duration_ms Persisted duration histogram (24h)");
    lines.push("# TYPE nutrition_v3_db_duration_ms histogram");
    for (const [endpoint, buckets] of grouped) {
      let cumulative = 0;
      for (const bucket of ["le_250ms", "le_500ms", "le_1000ms", "le_3000ms", "gt_3000ms"]) {
        cumulative += buckets[bucket] ?? 0;
        lines.push(
          `nutrition_v3_db_duration_ms_bucket{endpoint="${endpoint}",le="${bucket}"} ${cumulative}`
        );
      }
      lines.push(`nutrition_v3_db_duration_ms_count{endpoint="${endpoint}"} ${cumulative}`);
    }
  }
  return lines.join("\n");
}

// src/lib/nutrition/pipeline/reprocessDiff.ts
function macroTotalsFromPipeline(result) {
  return {
    kcal: Math.round(result.totals.kcal),
    protein: Math.round(result.totals.protein * 10) / 10,
    carbs: Math.round(result.totals.carbs * 10) / 10,
    fat: Math.round(result.totals.fat * 10) / 10
  };
}
function diffMacroTotals(before, after) {
  return {
    kcal: Math.round(after.kcal - before.kcal),
    protein: Math.round((after.protein - before.protein) * 10) / 10,
    carbs: Math.round((after.carbs - before.carbs) * 10) / 10,
    fat: Math.round((after.fat - before.fat) * 10) / 10
  };
}

// src/lib/nutrition/pipeline/v3RequestValidation.ts
var MAX_TEXT_LEN = 8e3;
var MAX_IMAGE_DATA_URL_LEN = 12e6;
function validateV3ProcessBody(body) {
  const text = String(body.text ?? "").trim();
  const imageDataUrl = String(body.imageDataUrl ?? "").trim();
  if (!text && !imageDataUrl) return { ok: false, error: "missing-input" };
  if (text.length > MAX_TEXT_LEN) return { ok: false, error: "text-too-long" };
  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LEN) return { ok: false, error: "image-too-large" };
  if (imageDataUrl && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageDataUrl)) {
    return { ok: false, error: "invalid-image-format" };
  }
  return { ok: true, text, imageDataUrl };
}

// src/lib/nutrition/pipeline/nutritionMetricsStore.ts
import { createHash as createHash3 } from "node:crypto";
function endpointFromEvent(event) {
  if (event.startsWith("process")) return "process";
  if (event.startsWith("finalize")) return "finalize";
  return "update";
}
function hashUserId(userId) {
  if (userId == null) return null;
  return createHash3("sha256").update(`nutrition-user:${userId}`).digest("hex").slice(0, 16);
}
async function ensureNutritionMetricsTable(pool2) {
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_metrics (
      id BIGSERIAL PRIMARY KEY,
      event VARCHAR(24) NOT NULL,
      endpoint VARCHAR(16),
      input_type VARCHAR(12),
      user_id_hash VARCHAR(32),
      duration_ms NUMERIC,
      components_count INTEGER,
      fallback_count INTEGER,
      error_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool2.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS endpoint VARCHAR(16)`);
  await pool2.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS input_type VARCHAR(12)`);
  await pool2.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS user_id_hash VARCHAR(32)`);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_metrics_created
    ON nutrition_v3_metrics(created_at DESC)
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_metrics_endpoint_created
    ON nutrition_v3_metrics(endpoint, created_at DESC)
  `);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_key VARCHAR(140) NOT NULL UNIQUE,
      severity VARCHAR(12) NOT NULL DEFAULT 'warning',
      status VARCHAR(12) NOT NULL DEFAULT 'open',
      alert_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_incidents_status
    ON nutrition_v3_incidents(status, last_seen_at DESC)
  `);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_ux_events (
      id BIGSERIAL PRIMARY KEY,
      event_name VARCHAR(48) NOT NULL,
      input_type VARCHAR(12),
      source VARCHAR(24),
      success BOOLEAN,
      duration_ms NUMERIC,
      components_count INTEGER,
      corrections_count INTEGER,
      user_id_hash VARCHAR(32),
      trace_id VARCHAR(40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_ux_events_created
    ON nutrition_v3_ux_events(created_at DESC)
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_ux_events_name_created
    ON nutrition_v3_ux_events(event_name, created_at DESC)
  `);
}
async function storeNutritionV3UxEvent(pool2, payload) {
  await pool2.query(
    `INSERT INTO nutrition_v3_ux_events (
      event_name, input_type, source, success, duration_ms, components_count, corrections_count, user_id_hash, trace_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      payload.eventName,
      payload.inputType ?? null,
      payload.source ?? null,
      payload.success ?? null,
      payload.durationMs ?? null,
      payload.componentsCount ?? null,
      payload.correctionsCount ?? null,
      payload.userIdHash ?? null,
      payload.traceId ?? null
    ]
  );
}
async function getNutritionV3UxSummary(pool2, windowHours = 24) {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const rows = await pool2.query(
    `SELECT
       COUNT(*)::bigint AS events,
       AVG(duration_ms) FILTER (WHERE event_name = 'save_attempt' AND duration_ms IS NOT NULL) AS avg_time_to_log_ms,
       COUNT(*) FILTER (WHERE event_name = 'save_attempt')::bigint AS saves_total,
       COUNT(*) FILTER (WHERE event_name = 'save_attempt' AND success = true)::bigint AS saves_success,
       SUM(corrections_count) FILTER (WHERE event_name = 'save_attempt' AND corrections_count IS NOT NULL) AS corrections_total,
       COUNT(*) FILTER (WHERE event_name = 'session_start')::bigint AS sessions_started,
       COUNT(*) FILTER (WHERE event_name = 'session_abandon')::bigint AS sessions_abandoned
     FROM nutrition_v3_ux_events
     WHERE created_at >= NOW() - make_interval(hours => $1)`,
    [safeHours]
  );
  const row = rows.rows[0];
  const savesTotal = Number(row?.saves_total || 0);
  const savesSuccess = Number(row?.saves_success || 0);
  const sessionsStarted = Number(row?.sessions_started || 0);
  const sessionsAbandoned = Number(row?.sessions_abandoned || 0);
  const correctionsTotal = Number(row?.corrections_total || 0);
  return {
    windowHours: safeHours,
    events: Number(row?.events || 0),
    avgTimeToLogMs: row?.avg_time_to_log_ms != null ? Math.round(Number(row.avg_time_to_log_ms)) : null,
    saveSuccessRate: savesTotal > 0 ? Math.round(savesSuccess / savesTotal * 1e3) / 10 : null,
    avgCorrectionsPerSave: savesTotal > 0 ? Math.round(correctionsTotal / savesTotal * 100) / 100 : null,
    abandonmentRate: sessionsStarted > 0 ? Math.round(sessionsAbandoned / sessionsStarted * 1e3) / 10 : null
  };
}
async function storeNutritionMetricEvent(pool2, event, payload = {}) {
  await pool2.query(
    `INSERT INTO nutrition_v3_metrics (
      event, endpoint, input_type, user_id_hash, duration_ms, components_count, fallback_count, error_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      event,
      payload.endpoint ?? endpointFromEvent(event),
      payload.inputType ?? null,
      payload.userIdHash ?? null,
      payload.durationMs ?? null,
      payload.components ?? null,
      payload.fallbackCount ?? null,
      payload.error ?? null
    ]
  );
}
async function getNutritionV3DbStats(pool2, windowHours = 24) {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const row = await pool2.query(
    `SELECT
       COUNT(*)::bigint AS total_events,
       COUNT(*) FILTER (WHERE event LIKE '%_fail')::bigint AS fail_events,
       COUNT(*) FILTER (WHERE event LIKE '%_ok')::bigint AS success_events,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
       AVG(components_count) FILTER (WHERE components_count IS NOT NULL) AS avg_components,
       SUM(fallback_count) FILTER (WHERE fallback_count IS NOT NULL) AS fallback_sum,
       SUM(components_count) FILTER (WHERE components_count IS NOT NULL) AS component_sum
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)`,
    [safeHours]
  );
  const r = row.rows[0];
  const totalEvents = Number(r?.total_events || 0);
  const failEvents = Number(r?.fail_events || 0);
  const successEvents = Number(r?.success_events || 0);
  const successRate = totalEvents > 0 ? Math.round(successEvents / totalEvents * 1e3) / 10 : null;
  const avgDurationMs = r?.avg_duration_ms != null ? Math.round(Number(r.avg_duration_ms)) : null;
  const avgComponents = r?.avg_components != null ? Math.round(Number(r.avg_components) * 10) / 10 : null;
  const fallbackSum = Number(r?.fallback_sum || 0);
  const componentSum = Number(r?.component_sum || 0);
  const fallbackRate = componentSum > 0 ? Math.round(fallbackSum / componentSum * 1e3) / 10 : null;
  return {
    windowHours: safeHours,
    totalEvents,
    failEvents,
    successRate,
    avgDurationMs,
    avgComponents,
    fallbackRate
  };
}
async function getNutritionV3DurationHistogram(pool2, windowHours = 24) {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const rows = await pool2.query(
    `SELECT
       COALESCE(endpoint, 'unknown') AS endpoint,
       CASE
         WHEN duration_ms < 250 THEN 'le_250ms'
         WHEN duration_ms < 500 THEN 'le_500ms'
         WHEN duration_ms < 1000 THEN 'le_1000ms'
         WHEN duration_ms < 3000 THEN 'le_3000ms'
         ELSE 'gt_3000ms'
       END AS bucket,
       COUNT(*)::bigint AS count
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)
       AND duration_ms IS NOT NULL
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    [safeHours]
  );
  return rows.rows.map((r) => ({
    endpoint: r.endpoint,
    bucket: r.bucket,
    count: Number(r.count || 0)
  }));
}
async function pruneNutritionV3Metrics(pool2, retentionDays = 30) {
  const safeDays = Math.max(7, Math.min(365, Number(retentionDays) || 30));
  const res = await pool2.query(
    `DELETE FROM nutrition_v3_metrics
     WHERE created_at < NOW() - make_interval(days => $1)
     RETURNING id`,
    [safeDays]
  );
  return res.rowCount ?? 0;
}
async function getNutritionV3AlertWindows(pool2, params) {
  const windowHours = Math.max(1, Math.min(24 * 14, Number(params?.windowHours) || 24));
  const bucketMinutes = Math.max(5, Math.min(120, Number(params?.bucketMinutes) || 30));
  const minSuccessRate = Number(params?.minSuccessRate) || 95;
  const maxAvgDurationMs = Number(params?.maxAvgDurationMs) || 3e3;
  const maxFallbackRate = Number(params?.maxFallbackRate) || 35;
  const rows = await pool2.query(
    `SELECT
       to_char(
         date_trunc('minute', created_at)
         - make_interval(mins => (extract(minute from created_at)::int % $2)),
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
       ) AS bucket_start,
       COUNT(*)::bigint AS total_events,
       COUNT(*) FILTER (WHERE event LIKE '%_ok')::bigint AS success_events,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
       SUM(fallback_count) FILTER (WHERE fallback_count IS NOT NULL) AS fallback_sum,
       SUM(components_count) FILTER (WHERE components_count IS NOT NULL) AS component_sum
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [windowHours, bucketMinutes]
  );
  return rows.rows.map((r) => {
    const total = Number(r.total_events || 0);
    const success = Number(r.success_events || 0);
    const successRate = total > 0 ? Math.round(success / total * 1e3) / 10 : null;
    const avgDurationMs = r.avg_duration_ms != null ? Math.round(Number(r.avg_duration_ms)) : null;
    const fallbackSum = Number(r.fallback_sum || 0);
    const componentSum = Number(r.component_sum || 0);
    const fallbackRate = componentSum > 0 ? Math.round(fallbackSum / componentSum * 1e3) / 10 : null;
    const alerts = [];
    if ((successRate ?? 100) < minSuccessRate) alerts.push(`success-rate-below-${minSuccessRate}`);
    if ((avgDurationMs ?? 0) > maxAvgDurationMs) alerts.push(`avg-duration-above-${maxAvgDurationMs}ms`);
    if ((fallbackRate ?? 0) > maxFallbackRate) alerts.push(`fallback-rate-above-${maxFallbackRate}`);
    return {
      windowStart: r.bucket_start,
      totalEvents: total,
      successRate,
      avgDurationMs,
      fallbackRate,
      alerts,
      status: alerts.length > 0 ? "degraded" : "ok"
    };
  });
}
function incidentSeverity(alerts) {
  if (alerts.some((a) => a.includes("success-rate"))) return "critical";
  if (alerts.some((a) => a.includes("avg-duration"))) return "warning";
  return "warning";
}
async function syncNutritionV3Incidents(pool2, params) {
  const windows = await getNutritionV3AlertWindows(pool2, params);
  let opened = 0;
  let resolved = 0;
  for (const w of windows.filter((x) => x.status === "degraded")) {
    for (const alertKey of w.alerts) {
      const incidentKey = `${alertKey}:${w.windowStart}`;
      const severity = incidentSeverity([alertKey]);
      const exists = await pool2.query(
        `SELECT id FROM nutrition_v3_incidents WHERE incident_key = $1`,
        [incidentKey]
      );
      await pool2.query(
        `INSERT INTO nutrition_v3_incidents (incident_key, severity, status, alert_keys, started_at, last_seen_at, meta)
         VALUES ($1, $2, 'open', $3::jsonb, $4::timestamptz, NOW(), $5::jsonb)
         ON CONFLICT (incident_key) DO UPDATE SET
           last_seen_at = NOW(),
           status = CASE WHEN nutrition_v3_incidents.status = 'resolved' THEN 'open' ELSE nutrition_v3_incidents.status END,
           resolved_at = CASE WHEN nutrition_v3_incidents.status = 'resolved' THEN NULL ELSE nutrition_v3_incidents.resolved_at END,
           meta = EXCLUDED.meta`,
        [
          incidentKey,
          severity,
          JSON.stringify([alertKey]),
          w.windowStart,
          JSON.stringify({ windowStart: w.windowStart, alerts: w.alerts })
        ]
      );
      if (!exists.rows[0]?.id) opened += 1;
    }
  }
  const openRows = await pool2.query(
    `SELECT incident_key, alert_keys FROM nutrition_v3_incidents WHERE status = 'open'`
  );
  const activeKeys = new Set(
    windows.filter((w) => w.status === "degraded").flatMap((w) => w.alerts.map((a) => `${a}:${w.windowStart}`))
  );
  for (const row of openRows.rows) {
    if (!activeKeys.has(row.incident_key)) {
      await pool2.query(
        `UPDATE nutrition_v3_incidents
         SET status = 'resolved', resolved_at = NOW(), last_seen_at = NOW()
         WHERE incident_key = $1 AND status = 'open'`,
        [row.incident_key]
      );
      resolved += 1;
    }
  }
  return { opened, resolved };
}
async function listNutritionV3Incidents(pool2, params) {
  const status = params?.status ?? "all";
  const limit = Math.max(1, Math.min(200, Number(params?.limit) || 50));
  const where = status === "all" ? "" : "WHERE status = $2";
  const queryParams = status === "all" ? [limit] : [limit, status];
  const rows = await pool2.query(
    `SELECT id, incident_key, severity, status, alert_keys, started_at, resolved_at, last_seen_at
     FROM nutrition_v3_incidents
     ${where}
     ORDER BY last_seen_at DESC
     LIMIT $1`,
    queryParams
  );
  return rows.rows.map((r) => ({
    id: r.id,
    incidentKey: r.incident_key,
    severity: r.severity,
    status: r.status,
    alertKeys: Array.isArray(r.alert_keys) ? r.alert_keys : [],
    startedAt: r.started_at,
    resolvedAt: r.resolved_at,
    lastSeenAt: r.last_seen_at
  }));
}

// src/lib/nutrition/nutritionRoutes.ts
function parseImageDataUrl2(url) {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}
function makeTraceId() {
  return `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function sendApiError(res, status, code, message, details) {
  const traceId = makeTraceId();
  res.status(status).json({
    error: code,
    code,
    message,
    traceId,
    ...details ? { details } : {}
  });
  return traceId;
}
function extractJsonObject3(raw) {
  const t2 = raw.trim();
  const start = t2.indexOf("{");
  const end = t2.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(t2.slice(start, end + 1));
}
function normalizeLegacySource(source) {
  if (source === "openfoodfacts") return "openfoodfacts";
  return "estimated_fallback";
}
function buildPipelineFallbackFromLegacy(args) {
  const components = args.lines.map((line, idx) => ({
    id: `legacy-${idx + 1}`,
    name: line.displayName,
    role: "ingredient",
    estimated_grams: Math.max(1, Math.round(line.grams)),
    gram_confidence: line.requiresCandidatePick ? "medium" : "high",
    gram_reasoning: "legacy-fallback-estimate",
    is_cooked: false,
    cooking_method: null,
    search_strategy: {
      primary: [line.displayName],
      secondary: [],
      generic_fallback: [],
      off_database_fallback: "generic_unknown",
      openfoodfacts_categories: [],
      barcode_hint: null
    }
  }));
  const matches = args.lines.map((line, idx) => {
    const primary = {
      rank: 1,
      score: Math.max(1, Math.min(99, Math.round((line.matchScore || 0.6) * 100))),
      source_step: "primary",
      openfoodfacts_id: line.foodId.startsWith("off_") ? line.foodId.slice(4) : null,
      product_name: line.displayName,
      brand: null,
      kcal_100g: line.per100g.kcal,
      protein_100g: line.per100g.protein,
      carbs_100g: line.per100g.carbs,
      fat_100g: line.per100g.fat,
      fiber_100g: null,
      serving_size: null,
      data_completeness: "full",
      data_source: normalizeLegacySource(line.source)
    };
    const alt = (line.candidates ?? []).slice(0, 2).map((c, i) => ({
      rank: i + 2,
      score: Math.max(1, Math.min(99, Math.round((c.matchScore || 0.5) * 100))),
      source_step: "secondary",
      openfoodfacts_id: c.foodId.startsWith("off_") ? c.foodId.slice(4) : null,
      product_name: c.displayName,
      brand: null,
      kcal_100g: line.per100g.kcal,
      protein_100g: line.per100g.protein,
      carbs_100g: line.per100g.carbs,
      fat_100g: line.per100g.fat,
      fiber_100g: null,
      serving_size: null,
      data_completeness: "partial",
      data_source: normalizeLegacySource(line.source)
    }));
    return {
      component_id: `legacy-${idx + 1}`,
      component_name: line.displayName,
      estimated_grams: Math.max(1, Math.round(line.grams)),
      confidence: line.requiresCandidatePick ? "medium" : "high",
      search_steps_executed: ["legacy-resolve"],
      candidates: [primary, ...alt].slice(0, 3),
      auto_selected_rank: 1,
      requires_user_review: false,
      review_reasons: []
    };
  });
  const nutritionLines = args.lines.map((line, idx) => {
    const factor = Math.max(0.01, line.grams / 100);
    return {
      component_id: `legacy-${idx + 1}`,
      component_name: line.displayName,
      grams: Math.max(1, Math.round(line.grams)),
      data_source: normalizeLegacySource(line.source),
      confidence_score: Math.max(1, Math.min(99, Math.round((line.matchScore || 0.6) * 100))),
      kcal: Math.round(line.per100g.kcal * factor),
      protein: Math.round(line.per100g.protein * factor * 10) / 10,
      carbs: Math.round(line.per100g.carbs * factor * 10) / 10,
      fat: Math.round(line.per100g.fat * factor * 10) / 10,
      fiber: null
    };
  });
  const totals = nutritionLines.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: Math.round((acc.protein + c.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + c.carbs) * 10) / 10,
      fat: Math.round((acc.fat + c.fat) * 10) / 10
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    state: "AWAITING_REVIEW",
    analysis: {
      input_type: args.inputType,
      input_language: "de",
      meal_name: args.intent.items.map((i) => i.label).join(", ") || args.text || "Mahlzeit",
      meal_category: "mixed",
      cuisine: null,
      total_estimated_weight_g: Math.max(1, Math.round(args.lines.reduce((s, l) => s + l.grams, 0))),
      portion_context: "legacy-fallback",
      confidence_overall: "medium",
      is_chain_restaurant: false,
      chain_name: null,
      components,
      notes: null,
      image_analysis: null
    },
    matches,
    components: nutritionLines,
    totals,
    sanityWarnings: args.plausibilityIssues.map((p) => p.message),
    user_review_required: false,
    pipeline_version: "nutrition-v3-legacy-fallback",
    ai_model_used: "legacy-fallback"
  };
}
async function cacheOffProduct(pool2, food) {
  if (!food.id.startsWith("off_")) return;
  const barcode = food.id.slice(4);
  try {
    await pool2.query(
      `INSERT INTO catalog_product_cache (barcode, food_id, payload, fetched_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (barcode) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()`,
      [barcode, food.id, JSON.stringify(food)]
    );
  } catch {
  }
}
async function ensureNutritionSchema(pool2) {
  await pool2.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS barcode VARCHAR(32)`);
  await pool2.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS label_scan_meta JSONB`);
  await pool2.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_custom_foods_barcode_unique ON user_custom_foods (barcode) WHERE barcode IS NOT NULL`
  );
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS catalog_product_cache (
      barcode VARCHAR(32) PRIMARY KEY,
      food_id VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS meal_ai_runs_v2 (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      input_text TEXT,
      meal_intent JSONB,
      resolved_lines JSONB,
      user_corrections JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS input_type VARCHAR(12)`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS original_input TEXT`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS meal_category VARCHAR(40)`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS cuisine VARCHAR(80)`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS total_fiber NUMERIC NOT NULL DEFAULT 0`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS ai_model_used VARCHAR(80)`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS pipeline_version VARCHAR(32)`);
  await pool2.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS user_reviewed BOOLEAN NOT NULL DEFAULT false`);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS nutrition_log_components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nutrition_id UUID NOT NULL REFERENCES nutrition(id) ON DELETE CASCADE,
      component_id VARCHAR(80),
      food_name VARCHAR(320) NOT NULL,
      openfoodfacts_id VARCHAR(64),
      product_name VARCHAR(320) NOT NULL,
      brand VARCHAR(200),
      grams NUMERIC NOT NULL,
      kcal NUMERIC NOT NULL,
      protein_g NUMERIC NOT NULL DEFAULT 0,
      carbs_g NUMERIC NOT NULL DEFAULT 0,
      fat_g NUMERIC NOT NULL DEFAULT 0,
      fiber_g NUMERIC,
      data_source VARCHAR(40) NOT NULL,
      confidence_score NUMERIC NOT NULL DEFAULT 0,
      user_modified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool2.query(`CREATE INDEX IF NOT EXISTS idx_nutrition_log_components_nid ON nutrition_log_components(nutrition_id)`);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS user_food_preferences (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ingredient_key VARCHAR(220) NOT NULL,
      preferred_openfoodfacts_id VARCHAR(64) NOT NULL,
      preferred_product_name VARCHAR(320),
      preferred_grams NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, ingredient_key)
    )
  `);
  await pool2.query(`CREATE INDEX IF NOT EXISTS idx_user_food_preferences_user ON user_food_preferences(user_id)`);
  await pool2.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_input_cache (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input_hash VARCHAR(64) NOT NULL,
      input_normalized TEXT NOT NULL,
      pipeline_result JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, input_hash)
    )
  `);
  await pool2.query(
    `CREATE INDEX IF NOT EXISTS idx_nutrition_v3_input_cache_updated ON nutrition_v3_input_cache(user_id, updated_at DESC)`
  );
  await ensureNutritionMetricsTable(pool2);
  await ensureUserFoodPortionPrefsTable(pool2);
}
function registerNutritionRoutes(app, pool2, requireAuth2) {
  const pipelineDatabase = new FoodDatabaseService(new OpenFoodFactsClient(), {
    findPersistedGenericFood: (component) => findPersistedGenericFoodCandidate(pool2, component),
    createGenericWithAi: (component) => createGenericWithAiForComponent(pool2, component, completeMealAnalysis)
  });
  const pipelineService = new NutritionAIService(new MealAnalysisService(), pipelineDatabase);
  const mealLogRepo = new MealLogRepository(pool2);
  const e2eMockEnabled = () => ["1", "true", "yes"].includes(String(process.env.NUTRITION_E2E_MOCK ?? "").toLowerCase());
  const countFallback = (result) => result.matches.filter((m) => m.candidates[0]?.data_source === "estimated_fallback").length;
  const retentionDays = Math.max(7, Math.min(365, Number(process.env.NUTRITION_V3_METRICS_RETENTION_DAYS) || 30));
  const cleanupEveryMs = Math.max(6e4, Number(process.env.NUTRITION_V3_METRICS_CLEANUP_MS) || 36e5);
  setInterval(() => {
    void pruneNutritionV3Metrics(pool2, retentionDays).catch(() => {
    });
  }, cleanupEveryMs);
  const logMetric = async (event, payload) => {
    recordNutritionV3Metric(event, payload);
    try {
      await storeNutritionMetricEvent(pool2, event, {
        durationMs: payload.durationMs,
        components: payload.components,
        fallbackCount: payload.fallbackCount,
        error: payload.error,
        endpoint: endpointFromEvent(event),
        inputType: payload.inputType ?? null,
        userIdHash: hashUserId(payload.userId)
      });
      void syncNutritionV3Incidents(pool2).catch(() => {
      });
    } catch {
    }
  };
  const rateWindowMs = Math.max(15e3, Number(process.env.NUTRITION_V3_RATE_WINDOW_MS) || 6e4);
  const rateMax = Math.max(5, Number(process.env.NUTRITION_V3_RATE_MAX) || 40);
  const rateBucket = /* @__PURE__ */ new Map();
  const isRateLimited = (key) => {
    const now = Date.now();
    const state = rateBucket.get(key);
    if (!state || now > state.resetAt) {
      rateBucket.set(key, { count: 1, resetAt: now + rateWindowMs });
      return false;
    }
    state.count += 1;
    if (state.count > rateMax) return true;
    rateBucket.set(key, state);
    return false;
  };
  app.get("/api/nutrition/v3/stats", requireAuth2, async (req, res) => {
    const windowHours = Number(req.query.windowHours ?? 24);
    const memory = getNutritionV3StatsSnapshot();
    const persisted = await getNutritionV3DbStats(pool2, windowHours).catch(() => null);
    const ux = await getNutritionV3UxSummary(pool2, windowHours).catch(() => null);
    res.json({
      memory,
      persisted,
      ux
    });
  });
  app.post("/api/nutrition/v3/ux-events", requireAuth2, async (req, res) => {
    const body = req.body;
    const eventName = String(body.eventName ?? "").trim().toLowerCase();
    if (!eventName) {
      sendApiError(res, 400, "invalid-input", "eventName fehlt.");
      return;
    }
    if (!/^[a-z0-9_-]{3,48}$/.test(eventName)) {
      sendApiError(res, 422, "invalid-input", "eventName hat ung\xFCltiges Format.");
      return;
    }
    try {
      await storeNutritionV3UxEvent(pool2, {
        eventName,
        inputType: body.inputType ? String(body.inputType).slice(0, 12) : null,
        source: body.source ? String(body.source).slice(0, 24) : null,
        success: typeof body.success === "boolean" ? body.success : null,
        durationMs: Number.isFinite(body.durationMs) ? Number(body.durationMs) : null,
        componentsCount: Number.isFinite(body.componentsCount) ? Number(body.componentsCount) : null,
        correctionsCount: Number.isFinite(body.correctionsCount) ? Number(body.correctionsCount) : null,
        userIdHash: hashUserId(req.userId ?? null),
        traceId: body.traceId ? String(body.traceId).slice(0, 40) : null
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("nutrition/v3/ux-events:", error);
      sendApiError(res, 500, "pipeline-failed", "UX-Event konnte nicht gespeichert werden.");
    }
  });
  app.get("/api/nutrition/v3/metrics", requireAuth2, async (req, res) => {
    const windowHours = Number(req.query.windowHours ?? 24);
    const dbHistogram = await getNutritionV3DurationHistogram(pool2, windowHours).catch(() => []);
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(getNutritionV3MetricsPrometheus(dbHistogram));
  });
  app.get("/api/nutrition/v3/incidents", requireAuth2, async (req, res) => {
    const q = req.query;
    if (q.sync === "1" || q.sync === "true") {
      await syncNutritionV3Incidents(pool2).catch(() => null);
    }
    const statusRaw = String(q.status ?? "all");
    const status = statusRaw === "open" || statusRaw === "resolved" ? statusRaw : "all";
    const incidents = await listNutritionV3Incidents(pool2, {
      status,
      limit: Number(q.limit ?? 50)
    });
    res.json({ incidents });
  });
  app.get("/api/nutrition/v3/alerts", requireAuth2, async (req, res) => {
    const q = req.query;
    const sync = q.sync === "1" || q.sync === "true";
    if (sync) await syncNutritionV3Incidents(pool2).catch(() => null);
    const windows = await getNutritionV3AlertWindows(pool2, {
      windowHours: Number(q.windowHours ?? 24),
      bucketMinutes: Number(q.bucketMinutes ?? 30),
      minSuccessRate: Number(q.minSuccessRate ?? 95),
      maxAvgDurationMs: Number(q.maxAvgDurationMs ?? 3e3),
      maxFallbackRate: Number(q.maxFallbackRate ?? 35)
    });
    const limit = Math.max(1, Math.min(200, Number(q.limit ?? 50) || 50));
    const degraded = windows.filter((w) => w.status === "degraded").slice(0, limit);
    const openIncidents = await listNutritionV3Incidents(pool2, { status: "open", limit: 20 }).catch(() => []);
    res.json({
      windowHours: Number(q.windowHours ?? 24),
      bucketMinutes: Number(q.bucketMinutes ?? 30),
      degradedCount: degraded.length,
      degradedWindows: degraded,
      openIncidents
    });
  });
  app.post("/api/nutrition/v3/:nutritionId/reprocess", requireAuth2, async (req, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, "unauthorized", "Authentifizierung erforderlich.");
      return;
    }
    const rlKey = `reprocess:${userId}:${req.ip ?? "unknown"}`;
    if (isRateLimited(rlKey)) {
      res.setHeader("Retry-After", String(Math.ceil(rateWindowMs / 1e3)));
      sendApiError(res, 429, "rate-limit", "Zu viele Reprocess-Anfragen. Bitte kurz warten.");
      return;
    }
    const nutritionId = String(req.params.nutritionId ?? "").trim();
    if (!nutritionId) {
      sendApiError(res, 400, "missing-id", "Nutrition-ID fehlt.");
      return;
    }
    const validated = validateV3ProcessBody(req.body);
    if (validated.ok === false) {
      sendApiError(res, 400, "invalid-input", "Ung\xFCltige Reprocess-Eingabe.", { reason: validated.error });
      return;
    }
    try {
      const owned = await pool2.query(
        `SELECT calories, protein, carbs, fat FROM nutrition WHERE id = $1 AND user_id = $2`,
        [nutritionId, userId]
      );
      if (!owned.rows[0]) {
        sendApiError(res, 404, "not-found", "Nutrition-Eintrag nicht gefunden.");
        return;
      }
      const previousTotals = {
        kcal: Math.round(Number(owned.rows[0].calories || 0)),
        protein: Math.round(Number(owned.rows[0].protein || 0) * 10) / 10,
        carbs: Math.round(Number(owned.rows[0].carbs || 0) * 10) / 10,
        fat: Math.round(Number(owned.rows[0].fat || 0) * 10) / 10
      };
      let result = e2eMockEnabled() && validated.text && !validated.imageDataUrl ? buildE2eNutritionPipelineMock(validated.text) : await pipelineService.process({
        text: validated.text,
        imageDataUrl: validated.imageDataUrl
      });
      result = await applyUserFoodPreferencesToPipeline(pool2, userId, result);
      result = refreshPipelineTotals(result);
      const newTotals = macroTotalsFromPipeline(result);
      await logMetric("process_ok", {
        durationMs: Date.now() - startedAt,
        components: result.matches.length,
        fallbackCount: countFallback(result),
        inputType: result.analysis.input_type,
        userId
      });
      res.json({
        result,
        previousTotals,
        newTotals,
        delta: diffMacroTotals(previousTotals, newTotals)
      });
    } catch (error) {
      console.error("nutrition/v3/reprocess:", error);
      await logMetric("process_fail", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
        userId
      });
      sendApiError(res, 500, "reprocess-failed", "Reprocess fehlgeschlagen.");
    }
  });
  app.patch("/api/nutrition/v3/:nutritionId", requireAuth2, async (req, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, "unauthorized", "Authentifizierung erforderlich.");
      return;
    }
    const nutritionId = String(req.params.nutritionId ?? "").trim();
    if (!nutritionId) {
      sendApiError(res, 400, "missing-id", "Nutrition-ID fehlt.");
      return;
    }
    const body = req.body;
    const reviewedComponents = Array.isArray(body.reviewedComponents) ? body.reviewedComponents : [];
    if (reviewedComponents.length === 0) {
      sendApiError(res, 400, "missing-reviewed-components", "Mindestens eine gepr\xFCfte Komponente ist erforderlich.");
      return;
    }
    try {
      const parsedResult = recomputePipelineFromReview(
        PipelineResultSchema.parse(body.result),
        reviewedComponents.map((c) => ({
          component_id: c.component_id,
          grams: c.grams,
          selectedRank: c.selectedRank ?? 1
        }))
      );
      await mealLogRepo.updateReviewedMeal({
        nutritionId,
        userId,
        result: parsedResult,
        reviewedComponents,
        originalInput: String(body.originalInput ?? ""),
        date: body.date,
        category: body.category
      });
      const preferenceUpdates = Array.isArray(body.preferenceUpdates) ? body.preferenceUpdates : [];
      for (const update of preferenceUpdates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null
        });
      }
      await logMetric("update_ok", {
        durationMs: Date.now() - startedAt,
        components: reviewedComponents.length,
        fallbackCount: countFallback(parsedResult),
        inputType: parsedResult.analysis.input_type,
        userId
      });
      res.json({ id: nutritionId, ok: true });
    } catch (error) {
      console.error("nutrition/v3/update:", error);
      await logMetric("update_fail", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
        userId
      });
      const msg = error instanceof Error ? error.message : "";
      if (msg === "nutrition-not-found") {
        sendApiError(res, 404, "not-found", "Nutrition-Eintrag nicht gefunden.");
        return;
      }
      sendApiError(res, 500, "update-failed", "Update fehlgeschlagen.");
    }
  });
  async function buildLegacyProcessFallback(validated, userId) {
    const intent = validated.imageDataUrl ? await parseMealPhotoToIntent(validated.text ?? "", validated.imageDataUrl) : await parseMealTextToIntent(validated.text ?? "");
    const lines = [];
    for (const item of intent.items) {
      for (const comp of item.components) {
        const hint = comp.foodHint || comp.rawText;
        const boosts = userId != null ? await getUserFoodChoiceBoostsForHint(pool2, userId, hint) : /* @__PURE__ */ new Map();
        const line = await resolveMealComponent(pool2, comp, {
          userId,
          choiceBoosts: boosts,
          expertMode: false
        });
        lines.push(line);
      }
    }
    const ingredients = lines.map(resolvedLineToIngredient);
    const totals = ingredients.reduce(
      (acc, ing) => ({
        kcal: acc.kcal + (ing.calories ?? 0),
        protein: acc.protein + (ing.protein ?? 0),
        carbs: acc.carbs + (ing.carbs ?? 0),
        fat: acc.fat + (ing.fat ?? 0)
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const plausibilityIssues = checkMealPlausibility(totals);
    let fallbackResult = PipelineResultSchema.parse(
      buildPipelineFallbackFromLegacy({
        text: validated.text,
        inputType: validated.imageDataUrl ? "image" : "text",
        intent,
        lines,
        plausibilityIssues
      })
    );
    if (userId != null) {
      fallbackResult = await applyUserFoodPreferencesToPipeline(pool2, userId, fallbackResult);
      fallbackResult = refreshPipelineTotals(fallbackResult);
    }
    return fallbackResult;
  }
  app.post("/api/nutrition/v3/process", requireAuth2, async (req, res) => {
    const startedAt = Date.now();
    const userId = req.userId ?? null;
    const rlKey = `process:${userId ?? "anon"}:${req.ip ?? "unknown"}`;
    if (isRateLimited(rlKey)) {
      res.setHeader("Retry-After", String(Math.ceil(rateWindowMs / 1e3)));
      sendApiError(res, 429, "rate-limit", "Zu viele Analyse-Anfragen. Bitte kurz warten.");
      return;
    }
    const validated = validateV3ProcessBody(req.body);
    if (validated.ok === false) {
      sendApiError(res, 400, "invalid-input", "Ung\xFCltige Analyse-Eingabe.", { reason: validated.error });
      return;
    }
    const aiCaps = resolveAiCapabilities();
    const forceLegacyFallback = !aiCaps.enabled && !e2eMockEnabled();
    try {
      if (forceLegacyFallback) {
        const fallbackResult = await buildLegacyProcessFallback(validated, userId);
        await logMetric("process_ok", {
          durationMs: Date.now() - startedAt,
          components: fallbackResult.matches.length,
          fallbackCount: countFallback(fallbackResult),
          inputType: fallbackResult.analysis.input_type,
          userId,
          aiProvider: aiCaps.provider,
          aiConfigured: false,
          fallbackReason: "ai-disabled"
        });
        res.json(fallbackResult);
        return;
      }
      let result = e2eMockEnabled() && validated.text && !validated.imageDataUrl ? buildE2eNutritionPipelineMock(validated.text) : null;
      if (!result && userId != null && validated.text && !validated.imageDataUrl) {
        result = await getCachedPipelineResult(pool2, userId, validated.text);
      }
      if (!result) {
        result = e2eMockEnabled() && validated.text && !validated.imageDataUrl ? buildE2eNutritionPipelineMock(validated.text) : await pipelineService.process({
          text: validated.text,
          imageDataUrl: validated.imageDataUrl
        });
      }
      if (userId != null) {
        result = await applyUserFoodPreferencesToPipeline(pool2, userId, result);
      }
      result = refreshPipelineTotals(result);
      if (userId != null && validated.text?.trim() && !validated.imageDataUrl && !e2eMockEnabled()) {
        await setCachedPipelineResult(pool2, userId, validated.text, result);
      }
      const durationMs = Date.now() - startedAt;
      await logMetric("process_ok", {
        durationMs,
        components: result.matches.length,
        fallbackCount: countFallback(result),
        inputType: result.analysis.input_type,
        userId,
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled
      });
      res.json(result);
    } catch (error) {
      console.error("nutrition/v3/process:", error);
      await logMetric("process_fail", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
        userId,
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled
      });
      try {
        const fallbackResult = await buildLegacyProcessFallback(validated, userId);
        await logMetric("process_ok", {
          durationMs: Date.now() - startedAt,
          components: fallbackResult.matches.length,
          fallbackCount: countFallback(fallbackResult),
          inputType: fallbackResult.analysis.input_type,
          userId,
          aiProvider: aiCaps.provider,
          aiConfigured: aiCaps.enabled,
          fallbackReason: "pipeline-catch"
        });
        res.json(fallbackResult);
        return;
      } catch (fallbackError) {
        console.error("nutrition/v3/process fallback failed:", fallbackError);
      }
      sendApiError(res, 500, "pipeline-failed", "Analyse fehlgeschlagen.", {
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled,
        deepseekConfigured: aiCaps.deepseekConfigured,
        mistralConfigured: aiCaps.mistralConfigured,
        geminiConfigured: aiCaps.geminiConfigured
      });
    }
  });
  app.post("/api/nutrition/v3/finalize", requireAuth2, async (req, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, "unauthorized", "Authentifizierung erforderlich.");
      return;
    }
    const body = req.body;
    const reviewedComponents = Array.isArray(body.reviewedComponents) ? body.reviewedComponents : [];
    if (reviewedComponents.length === 0) {
      sendApiError(res, 400, "missing-reviewed-components", "Mindestens eine gepr\xFCfte Komponente ist erforderlich.");
      return;
    }
    try {
      const parsedResult = recomputePipelineFromReview(
        PipelineResultSchema.parse(body.result),
        reviewedComponents.map((c) => ({
          component_id: c.component_id,
          grams: c.grams,
          selectedRank: c.selectedRank ?? 1
        }))
      );
      const id = await mealLogRepo.saveReviewedMeal({
        userId,
        result: parsedResult,
        reviewedComponents,
        originalInput: String(body.originalInput ?? ""),
        date: body.date,
        category: body.category
      });
      const preferenceUpdates = Array.isArray(body.preferenceUpdates) ? body.preferenceUpdates : [];
      for (const update of preferenceUpdates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null
        });
      }
      const originalInput = String(body.originalInput ?? "").trim();
      if (originalInput) {
        const withPrefs = await applyUserFoodPreferencesToPipeline(pool2, userId, parsedResult);
        await setCachedPipelineResult(pool2, userId, originalInput, refreshPipelineTotals(withPrefs));
      }
      await logMetric("finalize_ok", {
        durationMs: Date.now() - startedAt,
        components: reviewedComponents.length,
        fallbackCount: countFallback(parsedResult),
        inputType: parsedResult.analysis.input_type,
        userId
      });
      res.json({ id, ok: true });
    } catch (error) {
      console.error("nutrition/v3/finalize:", error);
      await logMetric("finalize_fail", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
        userId
      });
      sendApiError(res, 500, "finalize-failed", "Finalize fehlgeschlagen.");
    }
  });
  app.post("/api/nutrition/v3/preferences", requireAuth2, async (req, res) => {
    const userId = req.userId;
    if (userId == null) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body;
    const updates = Array.isArray(body.updates) ? body.updates : [];
    try {
      for (const update of updates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null
        });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("nutrition/v3/preferences:", error);
      res.status(500).json({ error: "preferences-failed" });
    }
  });
  app.post("/api/nutrition/parse", requireAuth2, async (req, res) => {
    const body = req.body;
    const text = String(body.text ?? "").trim();
    const imageDataUrl = String(body.imageDataUrl ?? "").trim();
    if (!text && !imageDataUrl) {
      res.status(400).json({ error: "missing-text" });
      return;
    }
    try {
      const intent = imageDataUrl ? await parseMealPhotoToIntent(text, imageDataUrl) : await parseMealTextToIntent(text);
      res.json({
        intent,
        pipelineVersion: "nutrition-v3-legacy-fallback"
      });
    } catch (err) {
      console.error("nutrition/parse:", err);
      res.status(500).json({ error: "parse-failed" });
    }
  });
  app.post("/api/nutrition/resolve", requireAuth2, async (req, res) => {
    const body = req.body;
    const intent = body.intent;
    const expertMode = body.expertMode === true;
    if (!intent?.items?.length) {
      res.status(400).json({ error: "invalid-intent" });
      return;
    }
    try {
      const userId = req.userId;
      const lines = [];
      const foodIdsForPrefs = [];
      for (const item of intent.items) {
        for (const comp of item.components) {
          const hint = comp.foodHint || comp.rawText;
          const boosts = userId != null ? await getUserFoodChoiceBoostsForHint(pool2, userId, hint) : /* @__PURE__ */ new Map();
          const line = await resolveMealComponent(pool2, comp, {
            userId,
            choiceBoosts: boosts,
            expertMode
          });
          lines.push(line);
          if (line.foodId && line.foodId !== "generic_unknown") foodIdsForPrefs.push(line.foodId);
        }
      }
      if (userId != null && foodIdsForPrefs.length > 0) {
        const prefs = await getUserPortionPrefsForFoods(pool2, userId, foodIdsForPrefs);
        for (let i = 0; i < lines.length; i++) {
          const pref = prefs.get(lines[i].foodId);
          if (!pref) continue;
          const food = await resolveCatalogFoodByIdAny(pool2, lines[i].foodId);
          if (!food) continue;
          const opts = buildPortionOptions(food, pref);
          const sel = opts.find((o) => o.id === pref.portionId) ?? opts.find((o) => o.source === "user_last");
          if (sel) {
            lines[i] = {
              ...lines[i],
              portionOptions: opts,
              selectedPortionId: sel.id,
              logUnit: sel.logUnit,
              quantity: pref.quantity,
              grams: toGrams({ ...sel, quantity: pref.quantity })
            };
          }
        }
      }
      const ingredients = lines.map(resolvedLineToIngredient);
      const totals = ingredients.reduce(
        (acc, ing) => ({
          kcal: acc.kcal + (ing.calories ?? 0),
          protein: acc.protein + (ing.protein ?? 0),
          carbs: acc.carbs + (ing.carbs ?? 0),
          fat: acc.fat + (ing.fat ?? 0)
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      );
      const plausibilityIssues = checkMealPlausibility(totals);
      let runId = null;
      try {
        const ins = await pool2.query(
          `INSERT INTO meal_ai_runs_v2 (user_id, input_text, meal_intent, resolved_lines)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           RETURNING id`,
          [
            req.userId ?? null,
            intent.items.map((i) => i.label).join(", "),
            JSON.stringify(intent),
            JSON.stringify(lines)
          ]
        );
        runId = ins.rows[0]?.id ?? null;
      } catch {
      }
      res.json({ lines, ingredients, plausibilityIssues, runId });
    } catch (err) {
      console.error("nutrition/resolve:", err);
      res.status(500).json({ error: "resolve-failed" });
    }
  });
  app.post("/api/nutrition/portion-prefs", requireAuth2, async (req, res) => {
    const userId = req.userId;
    if (userId == null) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body;
    const prefs = Array.isArray(body.prefs) ? body.prefs : [];
    try {
      for (const p of prefs) {
        if (!p?.foodId || !p.portionId) continue;
        await upsertUserPortionPref(pool2, userId, p);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("portion-prefs:", err);
      res.status(500).json({ error: "save-failed" });
    }
  });
  app.post("/api/nutrition/feedback", requireAuth2, async (req, res) => {
    const userId = req.userId;
    const body = req.body;
    const corrections = body.corrections ?? [];
    if (!corrections.length) {
      res.json({ ok: true });
      return;
    }
    try {
      if (body.runId) {
        await pool2.query(
          `UPDATE meal_ai_runs_v2 SET user_corrections = $1::jsonb WHERE id = $2 AND user_id = $3`,
          [JSON.stringify(corrections), body.runId, userId ?? null]
        );
      } else if (userId != null) {
        await pool2.query(
          `INSERT INTO meal_ai_runs_v2 (user_id, user_corrections) VALUES ($1, $2::jsonb)`,
          [userId, JSON.stringify(corrections)]
        );
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("nutrition/feedback:", err);
      res.status(500).json({ error: "feedback-failed" });
    }
  });
  app.get("/api/foods/search", requireAuth2, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) {
      res.json({ strong: [], similar: [] });
      return;
    }
    try {
      const maxStrong = 20;
      const maxSimilar = 24;
      const pageSize = q.length < 2 ? 20 : 40;
      const [{ foods: offFoods }, appFoods, generic] = await Promise.all([
        fetchOffCatalogFoods(q, pageSize),
        searchAppCustomFoods(pool2, q, 16),
        Promise.resolve(searchGenericBaselines(q, 16))
      ]);
      const merged = [...offFoods, ...appFoods, ...generic];
      const tiered = tierFoodsFromOffPool(q, merged, maxStrong, maxSimilar);
      res.json(tiered);
    } catch (err) {
      console.error("foods/search:", err);
      res.status(502).json({ error: "search-failed" });
    }
  });
  app.get("/api/foods/:foodId", requireAuth2, async (req, res) => {
    const foodId = String(req.params.foodId ?? "").trim();
    let food = null;
    if (foodId.startsWith("generic_")) food = getGenericBaselineById(foodId);
    else if (foodId.startsWith("ucf_")) {
      const { getAppCustomFoodById: getAppCustomFoodById2 } = await Promise.resolve().then(() => (init_appCustomFoods(), appCustomFoods_exports));
      food = await getAppCustomFoodById2(pool2, foodId);
    } else if (foodId.startsWith("off_")) {
      const code = foodId.slice(4).replace(/\D/g, "");
      const { fetchOpenFoodFactsByBarcode: fetchOpenFoodFactsByBarcode2 } = await Promise.resolve().then(() => (init_openFoodFactsFetch(), openFoodFactsFetch_exports));
      food = await fetchOpenFoodFactsByBarcode2(code);
      if (food) await cacheOffProduct(pool2, food);
    }
    if (!food) {
      res.status(404).json({ error: "food-not-found" });
      return;
    }
    let userPref = null;
    const uid = req.userId;
    if (uid != null) {
      const prefs = await getUserPortionPrefsForFoods(pool2, uid, [foodId]);
      userPref = prefs.get(foodId) ?? null;
    }
    res.json({ food, portionOptions: buildPortionOptions(food, userPref) });
  });
  app.post("/api/nutrition/scan-nutrition-label", requireAuth2, async (req, res) => {
    const body = req.body;
    const image = String(body.imageDataUrl ?? "").trim();
    if (!image.startsWith("data:image/")) {
      res.status(400).json({ error: "invalid-image" });
      return;
    }
    try {
      const prompt = buildNutritionLabelScanPrompt();
      const img = parseImageDataUrl2(image);
      if (!img) {
        res.status(400).json({ error: "invalid-image" });
        return;
      }
      const raw = await completeMealAnalysis(prompt, img, { responseMode: "json_object" });
      const parsed = NutritionLabelScanSchema.parse(extractJsonObject3(raw));
      const normalized = normalizeLabelToPer100g(parsed);
      res.json({ scan: parsed, nutrientsPer100g: normalized.nutrients, warnings: normalized.warnings });
    } catch (err) {
      console.error("scan-nutrition-label:", err);
      res.status(500).json({ error: "label-scan-failed" });
    }
  });
  app.post("/api/foods/app-custom/barcode", requireAuth2, async (req, res) => {
    const body = req.body;
    const barcode = String(body.barcode ?? "").replace(/\D/g, "");
    const name = String(body.name ?? "").trim();
    const nutrients = body.nutrientsPer100g;
    if (barcode.length < 8 || !name || !nutrients) {
      res.status(400).json({ error: "invalid-payload" });
      return;
    }
    const packQty = Math.max(1, Number(body.packQuantity) || 100);
    const packUnit = String(body.packUnit ?? "g").toLowerCase();
    const isMl = packUnit === "ml";
    const servingName = isMl ? `1 Dose (${packQty} ml)` : `1 Packung (${packQty} g)`;
    try {
      const food = await insertAppCustomFoodWithBarcode(pool2, {
        name,
        category: body.category ?? "readymeal",
        nutrients,
        servings: [
          { name: "100 g", grams: 100 },
          { name: servingName, grams: packQty }
        ],
        barcode,
        source: "barcode_label_scan",
        labelScanMeta: body.labelScanMeta
      });
      res.json({ food, portionOptions: buildPortionOptions(food) });
    } catch (err) {
      console.error("app-custom/barcode:", err);
      res.status(500).json({ error: "save-failed" });
    }
  });
}
async function resolveBarcodeForApi(pool2, code) {
  return resolveBarcode(pool2, code);
}

// server.ts
import { createHash as createHash4, randomBytes } from "crypto";

// src/lib/server/sendPasswordResetEmail.ts
async function sendPasswordResetEmail(to, resetUrl) {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!host || !from) return false;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10) || 587;
  const secure = process.env.SMTP_SECURE === "1" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : void 0
    });
    const appName = process.env.APP_NAME?.trim() || "VRTX";
    await transporter.sendMail({
      from,
      to,
      subject: `${appName} \u2014 Passwort zur\xFCcksetzen`,
      text: `Setze dein Passwort hier zur\xFCck (g\xFCltig 1 Stunde):

${resetUrl}

Wenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
      html: `<p>Setze dein <strong>${appName}</strong>-Passwort zur\xFCck (g\xFCltig 1 Stunde):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Wenn du das nicht angefordert hast, ignoriere diese E-Mail.</p>`
    });
    return true;
  } catch (err) {
    console.error("sendPasswordResetEmail:", err);
    return false;
  }
}

// server.ts
init_mealAiShared();
init_openFoodFactsFetch();
init_appCustomFoods();
import path4 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// src/lib/userName.ts
function splitNameParts(full) {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function buildDisplayName2(firstName, lastName) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
function validateNameParts(firstName, lastName) {
  return firstName.trim().length >= 2 && lastName.trim().length >= 2;
}
function resolveUserNameFields(row) {
  const storedFirst = (row.first_name ?? "").trim();
  const storedLast = (row.last_name ?? "").trim();
  if (storedFirst || storedLast) {
    const displayName = buildDisplayName2(storedFirst, storedLast) || row.display_name?.trim() || row.name?.trim() || "";
    return {
      firstName: storedFirst,
      lastName: storedLast,
      displayName
    };
  }
  const legacy = (row.display_name ?? row.name ?? "").trim();
  const { firstName, lastName } = splitNameParts(legacy);
  return {
    firstName,
    lastName,
    displayName: buildDisplayName2(firstName, lastName) || legacy
  };
}

// src/lib/dataMigration.ts
var DATA_MIGRATION_VERSION = 2;

// src/lib/server/migrateUserData.ts
init_openFoodFactsFetch();
init_mealAiShared();
function parseProfileExtras(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw || "{}");
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}
function userNeedsDataMigration(extras, targetVersion = DATA_MIGRATION_VERSION) {
  if (extras.migrationRequired === true || extras.migrationV2Required === true) return true;
  const v = extras.dataMigrationVersion;
  return v == null || Number(v) < targetVersion;
}
async function resolveExerciseKey(name, existingKey) {
  const key = String(existingKey || "").trim();
  if (key && isExerciseDbCatalogKey(key)) return key;
  const n = String(name || "").trim();
  if (!n && key) return key;
  if (isExerciseDbConfigured() && n) {
    try {
      const hits = await searchExerciseDbByName(n, 8);
      const exact = hits.find((h) => h.name.toLowerCase() === n.toLowerCase());
      if (exact) return exact.key;
      if (hits[0]) return hits[0].key;
    } catch {
    }
  }
  return existingKey || void 0;
}
async function migrateExerciseArray(exercises) {
  if (!Array.isArray(exercises)) return exercises;
  const out = [];
  for (const row of exercises) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    const ex = row;
    const name = String(ex.name || "");
    const key = await resolveExerciseKey(name, typeof ex.exerciseKey === "string" ? ex.exerciseKey : void 0);
    out.push(key ? { ...ex, exerciseKey: key, name: name || ex.name } : ex);
  }
  return out;
}
async function migrateCoachSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return schedule;
  const s = schedule;
  const days = s.schedule ?? s.days;
  if (!Array.isArray(days)) return schedule;
  const newDays = [];
  for (const day of days) {
    if (!day || typeof day !== "object") {
      newDays.push(day);
      continue;
    }
    const d = day;
    if (Array.isArray(d.exercises)) {
      newDays.push({ ...d, exercises: await migrateExerciseArray(d.exercises) });
    } else {
      newDays.push(d);
    }
  }
  return { ...s, schedule: newDays };
}
async function migrateWeekPlan(weekPlan) {
  if (!Array.isArray(weekPlan)) return weekPlan;
  const out = [];
  for (const day of weekPlan) {
    if (!day || typeof day !== "object") {
      out.push(day);
      continue;
    }
    const d = day;
    out.push({
      ...d,
      exercises: await migrateExerciseArray(d.exercises)
    });
  }
  return out;
}
async function migrateProfileExtras(extras, foodPool) {
  const out = { ...extras };
  if (out.workoutPlan && typeof out.workoutPlan === "object") {
    const wp = out.workoutPlan;
    if (Array.isArray(wp.schedule)) {
      const schedule = [];
      for (const day of wp.schedule) {
        if (!day || typeof day !== "object") {
          schedule.push(day);
          continue;
        }
        const d = day;
        schedule.push({
          ...d,
          exercises: await migrateExerciseArray(d.exercises)
        });
      }
      out.workoutPlan = { ...wp, schedule };
    }
  }
  if (Array.isArray(out.freeWorkoutSchedule)) {
    const days = [];
    for (const day of out.freeWorkoutSchedule) {
      if (!day || typeof day !== "object") {
        days.push(day);
        continue;
      }
      const d = day;
      days.push({
        ...d,
        exercises: await migrateExerciseArray(d.exercises)
      });
    }
    out.freeWorkoutSchedule = days;
  }
  if (out.workoutSessionDraft && typeof out.workoutSessionDraft === "object") {
    const draft = out.workoutSessionDraft;
    if (Array.isArray(draft.exercises)) {
      out.workoutSessionDraft = {
        ...draft,
        exercises: await migrateExerciseArray(draft.exercises)
      };
    }
  }
  return out;
}
async function resolveFoodIdForIngredient(ing, pool2) {
  const name = String(ing.name || "").trim();
  if (!name) return ing;
  const id = ing.id != null ? String(ing.id) : "";
  if (id && !id.startsWith("est_")) {
    const hit = pool2.find((f) => f.id === id);
    if (hit && matchFoodExactFromPool(name, [hit])) return ing;
  }
  const exact = matchFoodExactFromPool(name, pool2);
  if (exact) {
    return { ...ing, id: exact.id, name: exact.name, nutrientSource: "database" };
  }
  try {
    const off = await searchOpenFoodFactsProducts(name, 8);
    const merged = mergeCatalogFoodPool(off);
    const hit2 = matchFoodExactFromPool(name, merged) ?? merged[0];
    if (hit2) return { ...ing, id: hit2.id, name: hit2.name, nutrientSource: "database" };
  } catch {
  }
  return ing;
}
async function migrateIngredients(ingredients, foodPool) {
  if (!Array.isArray(ingredients)) return ingredients;
  const out = [];
  for (const row of ingredients) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    out.push(await resolveFoodIdForIngredient(row, foodPool));
  }
  return out;
}
async function runUserDataMigration(pool2, userId) {
  const errors = [];
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;
  const globalFoods = [];
  try {
    const templates = await pool2.query(
      `SELECT id, exercises, week_plan FROM workout_templates WHERE user_id=$1`,
      [userId]
    );
    for (const row of templates.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      const wp = row.week_plan ? await migrateWeekPlan(row.week_plan) : row.week_plan;
      await pool2.query(`UPDATE workout_templates SET exercises=$2::jsonb, week_plan=$3::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ex),
        wp ? JSON.stringify(wp) : null
      ]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`templates: ${e}`);
  }
  try {
    const workouts = await pool2.query(`SELECT id, exercises FROM workouts WHERE user_id=$1`, [userId]);
    for (const row of workouts.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      await pool2.query(`UPDATE workouts SET exercises=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ex)]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`workouts: ${e}`);
  }
  try {
    const plans = await pool2.query(`SELECT id FROM coach_plans WHERE user_id=$1`, [userId]);
    for (const p of plans.rows) {
      const weeks = await pool2.query(
        `SELECT id, schedule FROM coach_weekly_schedules WHERE plan_id=$1`,
        [p.id]
      );
      for (const w of weeks.rows) {
        const sched = await migrateCoachSchedule(w.schedule);
        await pool2.query(`UPDATE coach_weekly_schedules SET schedule=$2::jsonb WHERE id=$1`, [
          w.id,
          JSON.stringify(sched)
        ]);
        coachWeeksUpdated += 1;
      }
    }
  } catch (e) {
    errors.push(`coach: ${e}`);
  }
  try {
    const meals = await pool2.query(`SELECT id, ingredients FROM meal_templates WHERE user_id=$1`, [userId]);
    for (const row of meals.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool2.query(`UPDATE meal_templates SET ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing)
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`meal_templates: ${e}`);
  }
  try {
    const logs = await pool2.query(`SELECT id, ingredients FROM nutrition WHERE user_id=$1`, [userId]);
    for (const row of logs.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool2.query(`UPDATE nutrition SET ingredients=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ing)]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`nutrition: ${e}`);
  }
  try {
    const ucf = await pool2.query(
      `SELECT id, composite_ingredients FROM user_custom_foods WHERE user_id=$1 AND composite_ingredients IS NOT NULL`,
      [userId]
    );
    for (const row of ucf.rows) {
      const ing = await migrateIngredients(row.composite_ingredients, globalFoods);
      await pool2.query(`UPDATE user_custom_foods SET composite_ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing)
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`user_custom_foods: ${e}`);
  }
  const cur = await pool2.query(`SELECT profile_extras FROM users WHERE id=$1`, [userId]);
  const prev = parseProfileExtras(cur.rows[0]?.profile_extras);
  const migratedExtras = await migrateProfileExtras(prev, globalFoods);
  await pool2.query(`UPDATE users SET profile_extras=$2::jsonb, updated_at=NOW() WHERE id=$1`, [
    userId,
    JSON.stringify({
      ...migratedExtras,
      dataMigrationVersion: DATA_MIGRATION_VERSION,
      migrationRequired: false
    })
  ]);
  return {
    ok: errors.length === 0,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors
  };
}
async function getDataMigrationStatus(pool2) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let pending = 0;
  let upToDate = 0;
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (userNeedsDataMigration(prev)) pending += 1;
    else upToDate += 1;
  }
  const edb = getExerciseDbEnvDiagnostics();
  return {
    targetVersion: DATA_MIGRATION_VERSION,
    pendingUsers: pending,
    upToDateUsers: upToDate,
    totalActiveUsers: r.rows.length,
    exerciseDbConfigured: edb.configured,
    exerciseDbSource: edb.source,
    exerciseDbHost: edb.host,
    exerciseDbEnvHints: edb.envFileHints,
    envFilePath: edb.envFilePath,
    envFileProblem: edb.envFileProblem,
    envReloadApplied: edb.envReloadApplied
  };
}
async function runBatchDataMigrationForAllUsers(pool2, opts) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true ORDER BY id`);
  let usersMigrated = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;
  const errors = [];
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!opts?.force && !userNeedsDataMigration(prev)) {
      usersSkipped += 1;
      opts?.onProgress?.({
        userId: row.id,
        status: "skipped",
        message: "Bereits auf aktueller Version"
      });
      continue;
    }
    try {
      opts?.onProgress?.({
        userId: row.id,
        status: "started",
        message: "Migration gestartet"
      });
      const result = await runUserDataMigration(pool2, row.id);
      usersMigrated += 1;
      exercisesUpdated += result.exercisesUpdated;
      nutritionUpdated += result.nutritionUpdated;
      coachWeeksUpdated += result.coachWeeksUpdated;
      if (!result.ok) {
        usersFailed += 1;
        opts?.onProgress?.({
          userId: row.id,
          status: "failed",
          message: result.errors[0] ?? "Migration mit Fehlern abgeschlossen"
        });
        for (const e of result.errors) errors.push(`User #${row.id}: ${e}`);
      } else {
        opts?.onProgress?.({
          userId: row.id,
          status: "success",
          message: "Migration erfolgreich"
        });
      }
    } catch (e) {
      usersFailed += 1;
      errors.push(`User #${row.id}: ${e}`);
      opts?.onProgress?.({
        userId: row.id,
        status: "failed",
        message: String(e)
      });
    }
  }
  return {
    ok: usersFailed === 0,
    targetVersion: DATA_MIGRATION_VERSION,
    usersMigrated,
    usersSkipped,
    usersFailed,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors: errors.slice(0, 50)
  };
}
async function flagAllUsersForMigration(pool2) {
  const r = await pool2.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let n = 0;
  const authInvalidBefore = Math.floor(Date.now() / 1e3);
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!userNeedsDataMigration(prev)) continue;
    await pool2.query(`UPDATE users SET profile_extras=$2::jsonb WHERE id=$1`, [
      row.id,
      JSON.stringify({
        ...prev,
        migrationRequired: true,
        authInvalidBefore
      })
    ]);
    n += 1;
  }
  return n;
}

// server.ts
function parseCoachOnboarding(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}
function joinCoachList(value, fallback = "none") {
  if (Array.isArray(value)) {
    const s = value.map((x) => String(x)).filter(Boolean).join(", ");
    return s || fallback;
  }
  return fallback;
}
var { Pool } = pg;
var __filename = fileURLToPath3(import.meta.url);
var __dirname2 = path4.dirname(__filename);
var pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "fitness_tracker",
  user: process.env.POSTGRES_USER || "vrtx",
  password: process.env.POSTGRES_PASSWORD || "vrtx_secret"
});
var exerciseNameLocalizationStore = createPgExerciseNameLocalizationStore(pool);
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(100) NOT NULL DEFAULT '',
      email          VARCHAR(200) UNIQUE NOT NULL,
      password_hash  VARCHAR(256),
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name   VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url      TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded      BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership     VARCHAR(20) NOT NULL DEFAULT 'pro'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS goals          JSONB NOT NULL DEFAULT '{"type":"maintain","dailySteps":10000,"dailyCalories":2500}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS measurements   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS workout_plan   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_preferences JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_history JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coaching_active BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`
  ];
  for (const sql of migrations) {
    await pool.query(sql);
  }
  const legacyNames = await pool.query(
    `SELECT id, name, display_name, first_name, last_name FROM users
     WHERE (first_name IS NULL OR TRIM(first_name) = '')
       AND (last_name IS NULL OR TRIM(last_name) = '')
       AND (COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(name), '')) IS NOT NULL)`
  );
  for (const row of legacyNames.rows) {
    const legacy = String(row.display_name || row.name || "").trim();
    if (!legacy) continue;
    const { firstName, lastName } = splitNameParts(legacy);
    await pool.query(
      `UPDATE users SET first_name = $2, last_name = $3, updated_at = NOW() WHERE id = $1`,
      [row.id, firstName, lastName]
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      subtype        VARCHAR(50),
      duration       INTEGER NOT NULL DEFAULT 0,
      calories_burned INTEGER NOT NULL DEFAULT 0,
      date           DATE NOT NULL DEFAULT CURRENT_DATE,
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes          TEXT,
      shared         BOOLEAN NOT NULL DEFAULT FALSE,
      session_rpe    SMALLINT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_rpe SMALLINT`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS coach_session_meta JSONB`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS coach_session_feedback VARCHAR(12)`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS cardio_session_feedback JSONB`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      template_mode  VARCHAR(20) NOT NULL DEFAULT 'workout',
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      week_plan      JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'workout'`);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS week_plan JSONB`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal       VARCHAR(200) NOT NULL,
      category   VARCHAR(30),
      calories   NUMERIC NOT NULL DEFAULT 0,
      protein    NUMERIC NOT NULL DEFAULT 0,
      carbs      NUMERIC NOT NULL DEFAULT 0,
      fat        NUMERIC NOT NULL DEFAULT 0,
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS quantity NUMERIC`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(30),
      ingredients   JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_calories NUMERIC NOT NULL DEFAULT 0,
      total_protein  NUMERIC NOT NULL DEFAULT 0,
      total_carbs    NUMERIC NOT NULL DEFAULT 0,
      total_fat      NUMERIC NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS yields_portions INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_custom_foods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(320) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'readymeal',
      nutrients JSONB NOT NULL,
      servings JSONB NOT NULL DEFAULT '[{"name":"100g","grams":100}]'::jsonb,
      source VARCHAR(40) NOT NULL DEFAULT 'user_confirmed_ai',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_user ON user_custom_foods (user_id)`
  );
  await pool.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS composite_ingredients JSONB`);
  await pool.query(`ALTER TABLE user_custom_foods DROP CONSTRAINT IF EXISTS user_custom_foods_user_id_fkey`);
  await pool.query(`ALTER TABLE user_custom_foods ALTER COLUMN user_id DROP NOT NULL`);
  await pool.query(`
    ALTER TABLE user_custom_foods
    ADD CONSTRAINT user_custom_foods_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`UPDATE user_custom_foods SET user_id = NULL WHERE user_id IS NOT NULL`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_name_lower ON user_custom_foods (LOWER(name))`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      image_url  TEXT,
      likes      INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      type       VARCHAR(20) NOT NULL DEFAULT 'manual',
      workout_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id <> blocked_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_reports (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason      TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body          TEXT NOT NULL,
      read_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages (sender_id, recipient_id, created_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_plans (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type           VARCHAR(20) NOT NULL,           -- 'workout' | 'nutrition'
      status         VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active'|'paused'|'cancelled'|'completed'
      discipline     VARCHAR(60),                    -- workout discipline
      plan_mode      VARCHAR(20) NOT NULL,           -- 'ongoing' | 'event'
      event_name     VARCHAR(200),
      event_date     DATE,
      event_distance VARCHAR(100),
      current_week   INTEGER NOT NULL DEFAULT 1,
      onboarding_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_status VARCHAR(24) NOT NULL DEFAULT 'ready'`
  );
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_error TEXT`);
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_phase VARCHAR(40)`);
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS coach_plan_state JSONB`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_schedules (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      start_date   DATE,
      schedule     JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      report       JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_key     VARCHAR(16) NOT NULL,
      week_start   DATE NOT NULL,
      week_end     DATE NOT NULL,
      report       JSONB NOT NULL,
      facts        JSONB,
      source       VARCHAR(16) NOT NULL DEFAULT 'ai',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, week_key)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_weekly_reports_user ON user_weekly_reports (user_id, generated_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exercise_name_localizations (
      exercise_key VARCHAR(128) PRIMARY KEY,
      name_en      TEXT NOT NULL,
      name_de      TEXT NOT NULL,
      source       VARCHAR(16) NOT NULL DEFAULT 'ai',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID REFERENCES coach_plans(id) ON DELETE SET NULL,
      week_number INTEGER,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      constraints_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      final_schedule_hash VARCHAR(64),
      refinement_round INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_ai_runs_user ON coach_ai_runs (user_id, created_at DESC)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_coach_ai_runs_endpoint_time ON coach_ai_runs (endpoint, created_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      refinement_round INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_meal_ai_runs_user ON meal_ai_runs (user_id, created_at DESC)`);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS prep_steps JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS llm_estimate_nutrients JSONB`);
  await pool.query(
    `ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS nutrients_computed_coverage NUMERIC NOT NULL DEFAULT 0`
  );
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'manual'`);
  await ensureNutritionSchema(pool);
  console.log("\u2705 Database schema ready");
}
async function resolveCatalogFoodById(id) {
  const raw = id?.trim() ?? "";
  if (raw.startsWith("off_")) {
    const code = raw.slice(4).replace(/\D/g, "");
    if (!code) return null;
    try {
      return await fetchOpenFoodFactsByBarcode(code);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("ucf_")) {
    try {
      return await getAppCustomFoodById(pool, raw);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("generic_")) {
    const { getGenericBaselineById: getGenericBaselineById2 } = await Promise.resolve().then(() => (init_genericBaselineResolver(), genericBaselineResolver_exports));
    return getGenericBaselineById2(raw);
  }
  return null;
}
async function buildOffFoodResolverForIngredients(ingredients) {
  const cache5 = /* @__PURE__ */ new Map();
  for (const ing of ingredients) {
    const id = ing.foodId?.trim();
    if (!id || cache5.has(id)) continue;
    if (!id.startsWith("off_") && !id.startsWith("ucf_")) continue;
    const hit = await resolveCatalogFoodById(id);
    if (hit) cache5.set(id, hit);
  }
  return (foodId) => cache5.get(foodId) ?? null;
}
function navigationFocusFrom(raw) {
  if (raw === "workout" || raw === "nutrition" || raw === "hybrid") return raw;
  return "hybrid";
}
function mapUser(row) {
  const pe = typeof row.profile_extras === "string" ? JSON.parse(row.profile_extras || "{}") : row.profile_extras || {};
  const pref = row.theme_preference === "light" || row.theme_preference === "dark" ? row.theme_preference : "dark";
  const names = resolveUserNameFields(row);
  return {
    uid: row.id.toString(),
    firstName: names.firstName,
    lastName: names.lastName,
    displayName: names.displayName,
    email: row.email,
    photoURL: row.photo_url || "",
    bio: row.bio || "",
    onboarded: row.onboarded ?? false,
    accountCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : void 0,
    themePreference: pref,
    goals: row.goals || { type: "maintain", dailySteps: 1e4, dailyCalories: 2500 },
    measurements: row.measurements || null,
    workoutPlan: row.workout_plan || null,
    coachPreferences: row.coach_preferences || null,
    weightHistory: row.weight_history || [],
    coachingActive: row.coaching_active || false,
    freeWorkoutSchedule: pe.freeWorkoutSchedule ?? void 0,
    manualPlanWeekOverrides: pe.manualPlanWeekOverrides && typeof pe.manualPlanWeekOverrides === "object" ? pe.manualPlanWeekOverrides : void 0,
    dailyWaterLog: pe.dailyWaterLog ?? void 0,
    dailyActivityLog: pe.dailyActivityLog ?? void 0,
    checkIns: pe.checkIns ?? void 0,
    favoriteMealTemplateIds: pe.favoriteMealTemplateIds ?? void 0,
    bodyMeasurements: pe.bodyMeasurements ?? void 0,
    navigationFocus: navigationFocusFrom(pe.navigationFocus),
    uiLocale: pe.uiLocale === "de" || pe.uiLocale === "en" ? pe.uiLocale : void 0,
    /** Opt-out über profile_extras — Standard: true (erweiterte Coach-Pipeline / Refine). */
    exerciseRestSeconds: pe.exerciseRestSeconds && typeof pe.exerciseRestSeconds === "object" ? pe.exerciseRestSeconds : void 0,
    dataMigrationVersion: typeof pe.dataMigrationVersion === "number" ? pe.dataMigrationVersion : void 0,
    migrationRequired: pe.migrationRequired === true || pe.migrationV2Required === true
  };
}
async function getUserUiLocale(userId) {
  try {
    const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [userId]);
    if (!r.rows.length) return "de";
    const raw = r.rows[0].profile_extras;
    const pe = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    return pe.uiLocale === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}
function coachOutputLanguageForLocale(locale) {
  return locale === "de" ? "German" : "English";
}
function mapWorkout(row) {
  const metaRaw = row.coach_session_meta;
  const coachSessionMeta = metaRaw && typeof metaRaw === "object" ? metaRaw : typeof metaRaw === "string" ? (() => {
    try {
      return JSON.parse(metaRaw);
    } catch {
      return null;
    }
  })() : null;
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Other",
    subtype: row.subtype,
    duration: row.duration || 0,
    caloriesBurned: row.calories_burned || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    exercises: row.exercises || [],
    notes: row.notes || "",
    shared: row.shared || false,
    sessionRpe: typeof row.session_rpe === "number" && Number.isFinite(row.session_rpe) ? row.session_rpe : void 0,
    coachSessionMeta: coachSessionMeta || void 0,
    feedback: row.coach_session_feedback || void 0,
    cardioSessionFeedback: parseJsonColumn(row.cardio_session_feedback) || void 0
  };
}
function parseJsonColumn(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}
function mapTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Strength",
    templateMode: row.template_mode || "workout",
    exercises: row.exercises || [],
    weekPlan: row.week_plan || null
  };
}
function mapNutrition(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    meal: row.meal,
    category: row.category || "snack",
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    ingredients: row.ingredients || [],
    quantity: row.quantity != null ? Number(row.quantity) : void 0,
    unit: row.unit || void 0,
    inputType: row.input_type || void 0,
    originalInput: row.original_input || void 0,
    mealCategory: row.meal_category || void 0,
    cuisine: row.cuisine || void 0,
    totalFiber: row.total_fiber != null ? Number(row.total_fiber) : void 0,
    aiModelUsed: row.ai_model_used || void 0,
    pipelineVersion: row.pipeline_version || void 0,
    userReviewed: row.user_reviewed === true
  };
}
function mapMealTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    category: row.category || "snack",
    ingredients: row.ingredients || [],
    totalCalories: Number(row.total_calories),
    totalProtein: Number(row.total_protein),
    totalCarbs: Number(row.total_carbs),
    totalFat: Number(row.total_fat),
    yieldsPortions: Math.max(1, parseInt(String(row.yields_portions ?? 1), 10) || 1),
    prepSteps: row.prep_steps || [],
    llmEstimateNutrients: row.llm_estimate_nutrients ?? void 0,
    nutrientsComputedCoverage: row.nutrients_computed_coverage != null ? Number(row.nutrients_computed_coverage) : void 0,
    source: row.source || "manual"
  };
}
function mapPost(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    userName: row.user_name || "",
    userPhoto: row.user_photo || "",
    content: row.content,
    imageUrl: row.image_url,
    likes: (row.likes || []).map(String),
    type: row.type || "manual",
    workoutId: row.workout_id,
    createdAt: row.created_at
  };
}
var JWT_SECRET = process.env.JWT_SECRET || "vrtx-dev-secret-change-me";
var ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin";
function maskSecret(secret) {
  const s = String(secret ?? "").trim();
  if (!s) return null;
  if (s.length <= 8) return `${s.slice(0, 2)}******`;
  return `${s.slice(0, 6)}${"*".repeat(Math.max(6, s.length - 10))}${s.slice(-4)}`;
}
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  void (async () => {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      const row = await pool.query(`SELECT profile_extras, is_active FROM users WHERE id=$1`, [payload.userId]);
      if (!row.rows.length) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (row.rows[0].is_active !== true) {
        res.status(401).json({ error: "account-inactive", code: "REAUTH_REQUIRED" });
        return;
      }
      const extras = typeof row.rows[0].profile_extras === "string" ? JSON.parse(row.rows[0].profile_extras || "{}") : row.rows[0].profile_extras || {};
      const inv = Number(extras.authInvalidBefore);
      if (Number.isFinite(inv) && inv > 0 && typeof payload.iat === "number" && payload.iat < inv) {
        res.status(401).json({ error: "session-expired", code: "REAUTH_REQUIRED" });
        return;
      }
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  })();
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user, ...rest] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user === ADMIN_USER && rest.join(":") === ADMIN_PASS) {
    next();
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
}
var adminMigrationJob = null;
function createAdminMigrationJob(force) {
  return {
    jobId: `mig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    finishedAt: null,
    status: "running",
    totalUsers: 0,
    processedUsers: 0,
    logs: [],
    result: null,
    force
  };
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", async (_req, res) => {
    try {
      const coachWindowHours = Math.max(
        1,
        Math.min(168, parseInt(process.env.COACH_OPS_WINDOW_HOURS || "24", 10) || 24)
      );
      const coach = await queryCoachOpsMetrics(pool, coachWindowHours);
      const ai = resolveAiCapabilities();
      const nutritionV3 = getNutritionV3StatsSnapshot();
      const nutritionAlerts = [];
      if ((nutritionV3.successRate ?? 100) < 95) nutritionAlerts.push("nutrition-v3-success-rate-below-95");
      if ((nutritionV3.avgDurationMs ?? 0) > 3e3) nutritionAlerts.push("nutrition-v3-latency-above-3000ms");
      if ((nutritionV3.fallbackRate ?? 0) > 35) nutritionAlerts.push("nutrition-v3-fallback-rate-above-35");
      let nutritionPersisted = null;
      let openIncidents = [];
      try {
        nutritionPersisted = await getNutritionV3DbStats(pool, 24);
        if ((nutritionPersisted.successRate ?? 100) < 95) {
          nutritionAlerts.push("nutrition-v3-db-success-rate-below-95");
        }
        if ((nutritionPersisted.avgDurationMs ?? 0) > 3e3) {
          nutritionAlerts.push("nutrition-v3-db-latency-above-3000ms");
        }
        if ((nutritionPersisted.fallbackRate ?? 0) > 35) {
          nutritionAlerts.push("nutrition-v3-db-fallback-rate-above-35");
        }
        openIncidents = await listNutritionV3Incidents(pool, { status: "open", limit: 10 });
        if (openIncidents.length > 0) {
          nutritionAlerts.push(`nutrition-v3-open-incidents-${openIncidents.length}`);
        }
      } catch {
      }
      const nutritionDegraded = nutritionAlerts.length > 0;
      const overallDegraded = coach.status === "critical" || nutritionDegraded;
      res.json({
        status: overallDegraded ? "degraded" : "ok",
        coach,
        nutritionV3: {
          ...nutritionV3,
          persisted: nutritionPersisted,
          openIncidents,
          alerts: nutritionAlerts,
          status: nutritionDegraded ? "degraded" : "ok"
        },
        ai: {
          enabled: ai.enabled,
          provider: ai.provider
        }
      });
    } catch (err) {
      console.error("health error:", err);
      res.status(503).json({
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  app.get("/api/admin/coach-ops", requireAdmin, async (req, res) => {
    try {
      const hours = Math.max(
        1,
        Math.min(168, parseInt(String(req.query.hours ?? process.env.COACH_OPS_WINDOW_HOURS ?? "24"), 10) || 24)
      );
      const metrics = await queryCoachOpsMetrics(pool, hours);
      res.json(metrics);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/ai/status", (_req, res) => {
    const caps = resolveAiCapabilities();
    res.json({
      enabled: caps.enabled,
      provider: caps.provider,
      ollamaConfigured: caps.ollamaConfigured,
      deepseekConfigured: caps.deepseekConfigured,
      mistralConfigured: caps.mistralConfigured,
      geminiConfigured: caps.geminiConfigured,
      activeOverride: getActiveProviderOverride(),
      localModel: getLocalLlmModel(),
      e2eMock: process.env.COACH_E2E_MOCK === "1"
    });
  });
  app.get("/api/foods/barcode/:code", requireAuth, async (req, res) => {
    const code = String(req.params.code ?? "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14) {
      res.status(400).json({ error: "invalid-barcode" });
      return;
    }
    try {
      const hit = await resolveBarcodeForApi(pool, code);
      if (hit) {
        res.json({ food: hit.food, source: hit.source });
        return;
      }
      res.status(404).json({ error: "product-not-found", barcode: code });
    } catch (err) {
      console.error("OFF barcode:", err);
      const code2 = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code2 });
    }
  });
  app.get("/api/exercises/status", requireAuth, (_req, res) => {
    const d = getExerciseDbEnvDiagnostics();
    res.json({
      configured: d.configured,
      source: d.source,
      host: d.host
    });
  });
  app.get("/api/exercises/filters", requireAuth, async (_req, res) => {
    try {
      const lists = await fetchExerciseDbFilterLists();
      res.json(lists);
    } catch (err) {
      console.error("ExerciseDB filters:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/exercises/search", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const q = String(req.query.q ?? "").trim();
    const muscle = String(req.query.muscle ?? "all");
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "24"), 10) || 24));
    try {
      const exercises = await searchExerciseDbCatalog({
        query: q,
        muscle,
        limit
      });
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB search:", err);
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "exercisedb-rate-limited" : "exercisedb-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  app.get("/api/exercises/similar", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const key = String(req.query.key ?? req.query.exerciseKey ?? "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "12"), 10) || 12));
    if (!key) {
      res.status(400).json({ error: "missing-key" });
      return;
    }
    try {
      const exercises = await findSimilarExercises(key, limit);
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB similar:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/exercises/media", requireAuth, async (req, res) => {
    const raw = String(req.query.url ?? "").trim();
    if (!raw) {
      res.status(400).json({ error: "missing-url" });
      return;
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).json({ error: "invalid-url" });
      return;
    }
    const hostOk = parsed.hostname === "cdn.exercisedb.dev" || parsed.hostname.endsWith(".cdn.exercisedb.dev") || parsed.hostname === "static.exercisedb.dev" || parsed.hostname.endsWith(".static.exercisedb.dev");
    if (!hostOk || parsed.protocol !== "https:") {
      res.status(400).json({ error: "host-not-allowed" });
      return;
    }
    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: "image/*,video/*,*/*" }
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      console.error("Exercise media proxy:", err);
      res.status(502).json({ error: "media-proxy-failed" });
    }
  });
  app.get("/api/exercises/:id", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured" });
      return;
    }
    const id = String(req.params.id ?? "").replace(/^edb_/, "").trim();
    if (!id) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const exercise = await fetchExerciseDbById(id);
      if (!exercise) {
        res.status(404).json({ error: "exercise-not-found" });
        return;
      }
      res.json({ exercise });
    } catch (err) {
      console.error("ExerciseDB detail:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });
  app.get("/api/foods/openfoodfacts/search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ foods: [] });
      return;
    }
    try {
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.page_size ?? "16"), 10) || 16));
      const { foods } = await fetchOffCatalogFoods(q, pageSize);
      res.json({ foods });
    } catch (err) {
      console.error("OFF search:", err, { query: q });
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  app.get("/api/foods/catalog/:foodId", requireAuth, async (req, res) => {
    const foodId = String(req.params.foodId ?? "").trim();
    if (!foodId) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const food = await resolveCatalogFoodById(foodId);
      if (!food) {
        res.status(404).json({ error: "food-not-found" });
        return;
      }
      res.json({ food });
    } catch (err) {
      console.error("catalog food by id:", err);
      res.status(502).json({ error: "food-fetch-failed" });
    }
  });
  app.post("/api/foods/app-custom", requireAuth, async (req, res) => {
    const body = req.body;
    const draft = body.draft;
    if (!draft?.name?.trim() || !draft.nutrientsPer100g) {
      res.status(400).json({ error: "invalid-draft" });
      return;
    }
    try {
      const food = await insertAppCustomFoodFromDraft(pool, draft, "user_confirmed");
      const barcode = String(body.barcode ?? "").replace(/\D/g, "");
      if (barcode.length >= 8) {
        await pool.query(`UPDATE user_custom_foods SET barcode = $1 WHERE id = $2::uuid`, [
          barcode,
          food.id.replace(/^ucf_/, "")
        ]);
      }
      res.json({ food });
    } catch (err) {
      console.error("app-custom food insert:", err);
      res.status(500).json({ error: "app-custom-save-failed" });
    }
  });
  registerNutritionRoutes(app, pool, requireAuth);
  app.get("/api/foods/catalog-search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ strong: [], similar: [] });
      return;
    }
    try {
      const maxStrong = Math.min(40, Math.max(1, parseInt(String(req.query.max_strong ?? "20"), 10) || 20));
      const maxSimilar = Math.min(48, Math.max(0, parseInt(String(req.query.max_similar ?? "32"), 10) || 32));
      const pageSize = Math.min(52, Math.max(maxStrong + maxSimilar, 24));
      const { searchGenericBaselines: searchGenericBaselines2 } = await Promise.resolve().then(() => (init_genericBaselineResolver(), genericBaselineResolver_exports));
      const [{ foods: offFoods, rawHitCount }, appFoods, genericFoods] = await Promise.all([
        fetchOffCatalogFoods(q, pageSize),
        searchAppCustomFoods(pool, q, 20),
        Promise.resolve(searchGenericBaselines2(q, 12))
      ]);
      const mergedPool = [...offFoods, ...appFoods, ...genericFoods];
      const tiered = tierFoodsFromOffPool(q, mergedPool, maxStrong, maxSimilar);
      res.json({
        ...tiered,
        offMappingDroppedAll: rawHitCount > 0 && offFoods.length === 0 && appFoods.length === 0
      });
    } catch (err) {
      console.error("catalog-search:", err, { query: q });
      const code = err && typeof err === "object" && "code" in err && err.code === "rate_limited" ? "off-rate-limited" : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });
  app.post("/api/ai/suggest-custom-food-draft", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const { query } = req.body;
    const q = (query ?? "").trim();
    if (!q || q.length > 240) {
      res.status(400).json({ error: "Produktname erforderlich (max. 240 Zeichen)." });
      return;
    }
    try {
      const prompt = buildSuggestCustomFoodDraftPrompt(q);
      const raw = await completeMealAnalysis(prompt, void 0, {
        temperature: 0.25,
        responseMode: "json_object"
      });
      const draft = parseCustomFoodDraftFromAi(raw, q);
      res.json({ draft });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "custom food draft failed";
      console.error("suggest-custom-food-draft:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/daily-nutrition-review", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const fin = (x, fb = 0) => {
      const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
      return Number.isFinite(n) ? n : fb;
    };
    const body = req.body;
    const locale = body.locale === "en" ? "en" : "de";
    const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const adjustedCalorieTarget = Math.max(0, Math.round(fin(body.adjustedCalorieTarget, 0)));
    const baseCalorieTarget = Math.max(0, Math.round(fin(body.baseCalorieTarget, 0)));
    const activeBurnToday = Math.max(0, Math.round(fin(body.activeBurnToday, 0)));
    const tm = body.targetMacros;
    const targetMacros = {
      protein: Math.max(0, fin(tm?.protein, 0)),
      carbs: Math.max(0, fin(tm?.carbs, 0)),
      fat: Math.max(0, fin(tm?.fat, 0))
    };
    const cons = body.consumed;
    const consumed = {
      calories: Math.max(0, Math.round(fin(cons?.calories, 0))),
      protein: Math.max(0, fin(cons?.protein, 0)),
      carbs: Math.max(0, fin(cons?.carbs, 0)),
      fat: Math.max(0, fin(cons?.fat, 0))
    };
    const gt = body.goalType;
    const goalType = gt === "lose" || gt === "maintain" || gt === "gain" ? gt : "maintain";
    const mealsRaw = body.meals;
    const meals = [];
    if (Array.isArray(mealsRaw)) {
      for (const row of mealsRaw.slice(0, 48)) {
        const o = row;
        const meal = String(o.meal ?? "").trim().slice(0, 220);
        if (!meal) continue;
        const cat = String(o.category ?? "snack").trim().slice(0, 24);
        meals.push({
          meal,
          category: cat,
          calories: Math.max(0, Math.round(fin(o.calories, 0))),
          protein: Math.round(fin(o.protein, 0) * 10) / 10,
          carbs: Math.round(fin(o.carbs, 0) * 10) / 10,
          fat: Math.round(fin(o.fat, 0) * 10) / 10
        });
      }
    }
    if (meals.length === 0 && consumed.calories <= 0) {
      res.status(400).json({
        error: locale === "de" ? "Keine Eintr\xE4ge f\xFCr diesen Tag." : "No entries for this day."
      });
      return;
    }
    const macroKcal = 4 * consumed.protein + 4 * consumed.carbs + 9 * consumed.fat;
    const pctP = macroKcal > 0 ? 4 * consumed.protein * 100 / macroKcal : 0;
    const pctC = macroKcal > 0 ? 4 * consumed.carbs * 100 / macroKcal : 0;
    const pctF = macroKcal > 0 ? 9 * consumed.fat * 100 / macroKcal : 0;
    const catDe = {
      breakfast: "Fr\xFChst\xFCck",
      lunch: "Mittagessen",
      dinner: "Abendessen",
      snack: "Snack"
    };
    const catEn = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Snack"
    };
    const byCategory = /* @__PURE__ */ new Map();
    for (const m of meals) {
      const key = String(m.category ?? "snack").toLowerCase().slice(0, 24) || "snack";
      const row = byCategory.get(key) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        count: 0
      };
      row.calories += m.calories;
      row.protein += m.protein;
      row.carbs += m.carbs;
      row.fat += m.fat;
      row.count += 1;
      byCategory.set(key, row);
    }
    const catOrder = ["breakfast", "lunch", "dinner", "snack"];
    const restCats = [...byCategory.keys()].filter((c) => !catOrder.includes(c)).sort();
    const orderedCats = [
      ...catOrder.filter((c) => byCategory.has(c)),
      ...restCats
    ];
    const fmtCatLines = (labels) => orderedCats.map((c) => {
      const a = byCategory.get(c);
      const label = labels[c] ?? c;
      const p = Math.round(a.protein * 10) / 10;
      const cb = Math.round(a.carbs * 10) / 10;
      const f = Math.round(a.fat * 10) / 10;
      const n = a.count;
      return locale === "de" ? `- ${label}: ${a.calories} kcal; P ${p} g, KH ${cb} g, Fett ${f} g (${n} ${n === 1 ? "Eintrag" : "Eintr\xE4ge"})` : `- ${label}: ${a.calories} kcal; P ${p} g, C ${cb} g, F ${f} g (${n} ${n === 1 ? "entry" : "entries"})`;
    }).join("\n");
    const mealCategorySummary = fmtCatLines(locale === "de" ? catDe : catEn);
    const goalExplainDe = goalType === "lose" ? "Gewicht reduzieren / Defizit" : goalType === "gain" ? "Gewicht zunehmen / Aufbau" : "Gewicht halten / Erhalt";
    const goalExplainEn = goalType === "lose" ? "weight loss / caloric deficit" : goalType === "gain" ? "muscle gain / surplus" : "maintenance";
    const reviewVars = {
      goalExplain: locale === "de" ? goalExplainDe : goalExplainEn,
      date,
      adjustedCalorieTarget: String(adjustedCalorieTarget),
      baseCalorieTarget: String(baseCalorieTarget),
      activeBurnToday: String(activeBurnToday),
      targetProtein: String(targetMacros.protein),
      targetCarbs: String(targetMacros.carbs),
      targetFat: String(targetMacros.fat),
      consumedCalories: String(consumed.calories),
      consumedProtein: String(Math.round(consumed.protein * 10) / 10),
      consumedCarbs: String(Math.round(consumed.carbs * 10) / 10),
      consumedFat: String(Math.round(consumed.fat * 10) / 10),
      pctProtein: pctP.toFixed(0),
      pctCarbs: pctC.toFixed(0),
      pctFat: pctF.toFixed(0),
      mealCategorySummary: mealCategorySummary || (locale === "de" ? "(noch keine Kategorie-Summen \u2014 nur Gesamtwerte oben)" : "(no per-category totals yet \u2014 use the day totals above)")
    };
    const prompt = buildDailyNutritionReviewPrompt(locale, reviewVars);
    function stripMdNutAiText(t2) {
      return t2.replace(/\r\n/g, "\n").split("\n").map((line) => {
        let s = line.trim();
        if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(s)) return "";
        if (/^general information only/i.test(s)) return "";
        s = s.replace(/\*\*+/g, "");
        s = s.replace(/\*+/g, "");
        s = s.replace(/_+/g, "");
        s = s.replace(/`+/g, "");
        s = s.replace(/^#+\s*/, "");
        return s.trim();
      }).filter((l) => l.length > 0).join("\n");
    }
    function normalizeDailyNutritionReviewText(raw, loc) {
      let s = stripMdNutAiText(String(raw ?? "").trim());
      const linesIn = s.split("\n").map((l) => l.trim());
      const lines = [];
      let skipRest = false;
      for (const line of linesIn) {
        if (!line) continue;
        if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (/^general information only/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (skipRest) continue;
        lines.push(line);
      }
      s = lines.join("\n").trim();
      const marker = loc === "de" ? "Gut:" : "Good:";
      const idx = s.indexOf(marker);
      if (idx > 0) s = s.slice(idx).trim();
      const maxChars = 900;
      if (s.length <= maxChars) return s;
      const cut = s.slice(0, maxChars);
      const lastNl = cut.lastIndexOf("\n");
      if (lastNl > maxChars * 0.35) return cut.slice(0, lastNl).trim();
      return `${cut.replace(/\s+\S*$/, "").trim()}\u2026`;
    }
    try {
      const raw = await completeMealAnalysis(prompt, void 0, {
        temperature: 0.35,
        responseMode: "text"
      });
      const text = normalizeDailyNutritionReviewText(raw, locale);
      if (!text) {
        res.status(500).json({ error: "Leere KI-Antwort." });
        return;
      }
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "daily nutrition review failed";
      console.error("daily-nutrition-review:", err);
      const resourceExhausted = /resource_exhausted|spending cap|quota|429/i.test(msg);
      if (resourceExhausted) {
        res.status(503).json({
          error: locale === "de" ? "KI-Limit erreicht. Bitte sp\xE4ter erneut versuchen oder in Admin auf Mistral umstellen." : "AI quota reached. Please try again later or switch to Mistral in admin."
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/generate-workout-template", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const body = req.body;
    const equipment = Array.isArray(body.equipment) ? body.equipment : [];
    const duration = typeof body.duration === "number" ? body.duration : 60;
    const type = body.type === "Cardio" || body.type === "Hybrid" ? body.type : "Strength";
    const equipmentList = equipment.length > 0 ? equipment.join(", ") : "bodyweight only";
    const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
    const exerciseKeyBlock = exerciseCatalog.trim() ? `

ALLOWED exerciseKey values (prefer exact keys from this catalog; format edb_<id>):
${exerciseCatalog}
` : "";
    const prompt = buildWorkoutTemplateGeneratePrompt({
      workoutType: type,
      equipmentList,
      duration: String(duration),
      specialRequestsBlock: body.specialRequests ? `- Special requests: ${body.specialRequests}` : "",
      exerciseKeyBlock
    });
    try {
      let rawLast = "";
      let parsed = null;
      let repair = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = repair ? `${prompt}

JSON repair: ${repair}` : prompt;
        rawLast = await completeWorkoutTemplateJson(p);
        try {
          const j = parseJsonLoose(rawLast);
          const z8 = workoutTemplateAiSchema.safeParse(j);
          if (!z8.success) {
            repair = z8.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z8.data;
          break;
        } catch (e) {
          repair = e instanceof Error ? e.message : String(e);
        }
      }
      if (!parsed) {
        res.status(500).json({ error: repair || "Could not parse AI workout response" });
        return;
      }
      res.json({
        name: parsed.name,
        type: parsed.type,
        description: parsed.description,
        exercises: parsed.exercises
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Workout generation failed";
      console.error("generate-workout-template:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, firstName, lastName, email, password, age, gender, themePreference } = req.body;
      const themePref = themePreference === "light" || themePreference === "dark" ? themePreference : "dark";
      const first = String(firstName ?? "").trim();
      const last = String(lastName ?? "").trim();
      const displayName = (name?.trim() || `${first} ${last}`.trim()).trim();
      if (!displayName || displayName.length < 3 || !email || !password) {
        res.status(400).json({ error: "All fields required" });
        return;
      }
      if (firstName != null && first.length < 2) {
        res.status(400).json({ error: "Invalid first name" });
        return;
      }
      if (lastName != null && last.length < 2) {
        res.status(400).json({ error: "Invalid last name" });
        return;
      }
      const regFirst = first || splitNameParts(displayName).firstName;
      const regLast = last || splitNameParts(displayName).lastName;
      const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
      if (existing.rows.length) {
        res.status(409).json({ error: "auth/email-already-in-use" });
        return;
      }
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, display_name, first_name, last_name, theme_preference)
         VALUES ($1,$2,$3,$1,$4,$5,$6) RETURNING *`,
        [displayName, email, hash, regFirst, regLast, themePref]
      );
      const user = result.rows[0];
      if (age || gender) {
        const initialMeasurements = { age: age || null, gender: gender || null };
        await pool.query(
          "UPDATE users SET measurements=$2, updated_at=NOW() WHERE id=$1",
          [user.id, JSON.stringify(initialMeasurements)]
        );
        user.measurements = initialMeasurements;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const normalized = String(email ?? "").trim().toLowerCase();
      if (!normalized) {
        res.status(400).json({ error: "email-required" });
        return;
      }
      const result = await pool.query("SELECT id FROM users WHERE email=$1 AND is_active=true", [normalized]);
      let devResetUrl;
      if (result.rows.length) {
        const userId = result.rows[0].id;
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash4("sha256").update(token).digest("hex");
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '1 hour')`,
          [userId, tokenHash]
        );
        const base = String(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
        if (base) {
          const resetUrl = `${base}/reset-password?token=${token}`;
          const emailed = await sendPasswordResetEmail(normalized, resetUrl);
          if (!emailed && process.env.ALLOW_DEV_RESET_LINK === "1") {
            devResetUrl = resetUrl;
          }
        }
      }
      res.json({ ok: true, ...devResetUrl ? { devResetUrl } : {} });
    } catch (err) {
      console.error("forgot-password error:", err);
      res.json({ ok: true });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || typeof password !== "string" || password.length < 8) {
        res.status(400).json({ error: "password-too-weak" });
        return;
      }
      const tokenHash = createHash4("sha256").update(token).digest("hex");
      const row = await pool.query(
        `SELECT user_id FROM password_reset_tokens
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [tokenHash]
      );
      if (!row.rows.length) {
        res.status(400).json({ error: "invalid-or-expired-token" });
        return;
      }
      const userId = row.rows[0].user_id;
      const hash = await bcrypt.hash(password, 12);
      await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [userId, hash]);
      await pool.query(
        "UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL",
        [tokenHash]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("reset-password error:", err);
      res.status(500).json({ error: "reset-failed" });
    }
  });
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        res.status(400).json({ error: "password-too-weak" });
        return;
      }
      const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
      if (!result.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      const ph = result.rows[0].password_hash;
      if (!ph) {
        res.status(400).json({ error: "oauth-account-no-password" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, ph);
      if (!valid) {
        res.status(401).json({ error: "password-wrong" });
        return;
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [req.userId, hash]);
      res.json({ ok: true });
    } catch (err) {
      console.error("change-password error:", err);
      res.status(500).json({ error: "change-failed" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query("SELECT * FROM users WHERE email=$1 AND is_active=true", [email]);
      if (!result.rows.length) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const user = result.rows[0];
      if (!user.password_hash) {
        res.status(401).json({ error: "Use Google sign-in" });
        return;
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });
  app.post("/api/auth/cancel-registration", requireAuth, async (req, res) => {
    try {
      const row = await pool.query("SELECT onboarded FROM users WHERE id=$1", [req.userId]);
      if (!row.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      if (row.rows[0].onboarded === true) {
        res.status(403).json({ error: "onboarding-already-complete" });
        return;
      }
      await pool.query("DELETE FROM users WHERE id=$1", [req.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error("cancel-registration:", err);
      res.status(500).json({ error: "cancel-failed" });
    }
  });
  app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || typeof password !== "string") {
        res.status(400).json({ error: "password-required" });
        return;
      }
      const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
      if (!result.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      const ph = result.rows[0].password_hash;
      if (!ph) {
        res.status(400).json({ error: "oauth-account-no-password" });
        return;
      }
      const valid = await bcrypt.compare(password, ph);
      if (!valid) {
        res.status(401).json({ error: "invalid-password" });
        return;
      }
      await pool.query("DELETE FROM users WHERE id=$1", [req.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error("delete-account:", err);
      res.status(500).json({ error: "delete-failed" });
    }
  });
  app.post("/api/migration/run", requireAuth, async (req, res) => {
    try {
      const result = await runUserDataMigration(pool, req.userId);
      const profileRow = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
      res.json({ ...result, profile: mapUser(profileRow.rows[0]) });
    } catch (err) {
      console.error("migration/run:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-failed" });
    }
  });
  app.get("/api/admin/migration/status", requireAdmin, async (_req, res) => {
    try {
      const status = await getDataMigrationStatus(pool);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-status-failed" });
    }
  });
  app.post("/api/admin/migration/run-all", requireAdmin, async (req, res) => {
    try {
      const force = !!req.body?.force;
      const result = await runBatchDataMigrationForAllUsers(pool, { force });
      res.json({ ok: result.ok, ...result });
    } catch (err) {
      console.error("admin/migration/run-all:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-batch-failed" });
    }
  });
  app.post("/api/admin/migration/run-all-async", requireAdmin, async (req, res) => {
    try {
      if (adminMigrationJob && adminMigrationJob.status === "running") {
        res.status(409).json({
          error: "migration-already-running",
          jobId: adminMigrationJob.jobId
        });
        return;
      }
      const force = !!req.body?.force;
      const countRow = await pool.query(`SELECT COUNT(*)::bigint AS n FROM users WHERE is_active=true`);
      const totalUsers = Number(countRow.rows[0]?.n || 0);
      const job = createAdminMigrationJob(force);
      job.totalUsers = totalUsers;
      adminMigrationJob = job;
      void (async () => {
        try {
          const result = await runBatchDataMigrationForAllUsers(pool, {
            force,
            onProgress: (event) => {
              if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
              adminMigrationJob.logs.push({
                ts: (/* @__PURE__ */ new Date()).toISOString(),
                userId: event.userId,
                status: event.status,
                message: event.message.slice(0, 240)
              });
              if (event.status !== "started") {
                adminMigrationJob.processedUsers += 1;
              }
              if (adminMigrationJob.logs.length > 300) {
                adminMigrationJob.logs = adminMigrationJob.logs.slice(-300);
              }
            }
          });
          if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
          adminMigrationJob.result = result;
          adminMigrationJob.status = result.ok ? "completed" : "failed";
          adminMigrationJob.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
        } catch (err) {
          if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
          adminMigrationJob.status = "failed";
          adminMigrationJob.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
          adminMigrationJob.logs.push({
            ts: (/* @__PURE__ */ new Date()).toISOString(),
            userId: -1,
            status: "failed",
            message: err instanceof Error ? err.message : String(err)
          });
        }
      })();
      res.json({
        ok: true,
        jobId: job.jobId,
        status: job.status,
        totalUsers: job.totalUsers
      });
    } catch (err) {
      console.error("admin/migration/run-all-async:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-batch-async-failed" });
    }
  });
  app.get("/api/admin/migration/job/:jobId", requireAdmin, async (req, res) => {
    const jobId = String(req.params.jobId ?? "");
    if (!adminMigrationJob || adminMigrationJob.jobId !== jobId) {
      res.status(404).json({ error: "migration-job-not-found" });
      return;
    }
    res.json(adminMigrationJob);
  });
  app.post("/api/admin/flag-migration-v2", requireAdmin, async (_req, res) => {
    try {
      const count = await flagAllUsersForMigration(pool);
      res.json({ ok: true, usersFlagged: count });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "flag-failed" });
    }
  });
  app.get("/api/profile", requireAuth, async (req, res) => {
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(mapUser(result.rows[0]));
  });
  app.patch("/api/profile", requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const extrasKeys = [
        "freeWorkoutSchedule",
        "manualPlanWeekOverrides",
        "dailyWaterLog",
        "checkIns",
        "favoriteMealTemplateIds",
        "bodyMeasurements",
        "dailyActivityLog",
        "navigationFocus",
        "uiLocale",
        "exerciseRestSeconds",
        "dataMigrationVersion",
        "migrationRequired"
      ];
      const pePatch = {};
      for (const k of extrasKeys) {
        if (k in req.body) pePatch[k] = req.body[k];
      }
      if (Object.keys(pePatch).length > 0 || "themePreference" in req.body) {
        const cur = await client.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
        const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
        const merged = { ...prev, ...pePatch };
        delete merged.themeVariant;
        await client.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
          req.userId,
          JSON.stringify(merged)
        ]);
      }
      const allowed = {
        displayName: "display_name",
        photoURL: "photo_url",
        bio: "bio",
        onboarded: "onboarded",
        themePreference: "theme_preference",
        goals: "goals",
        measurements: "measurements",
        workoutPlan: "workout_plan",
        coachPreferences: "coach_preferences",
        weightHistory: "weight_history",
        coachingActive: "coaching_active"
      };
      const sets = [];
      const vals = [req.userId];
      for (const [key, col] of Object.entries(allowed)) {
        if (key in req.body) {
          const v = req.body[key];
          vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
          sets.push(`${col}=$${vals.length}`);
        }
      }
      if (sets.length) {
        await client.query(`UPDATE users SET ${sets.join(",")},updated_at=NOW() WHERE id=$1`, vals);
      }
      const body = req.body;
      if ("firstName" in body || "lastName" in body) {
        const cur = await client.query("SELECT first_name, last_name, display_name, name FROM users WHERE id=$1", [
          req.userId
        ]);
        const row = cur.rows[0] ?? {};
        const resolved = resolveUserNameFields(row);
        const nextFirst = "firstName" in body ? String(body.firstName ?? "").trim() : resolved.firstName;
        const nextLast = "lastName" in body ? String(body.lastName ?? "").trim() : resolved.lastName;
        if (!validateNameParts(nextFirst, nextLast)) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid name" });
          return;
        }
        const displayName = buildDisplayName2(nextFirst, nextLast);
        await client.query(
          `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
          [req.userId, nextFirst, nextLast, displayName]
        );
      } else if ("displayName" in body) {
        const displayName = String(body.displayName ?? "").trim();
        if (displayName.length < 3) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid name" });
          return;
        }
        const { firstName, lastName } = splitNameParts(displayName);
        await client.query(
          `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
          [req.userId, firstName, lastName, displayName]
        );
      }
      await client.query("COMMIT");
      const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
      res.json(mapUser(result.rows[0]));
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      res.status(500).json({ error: err instanceof Error ? err.message : "profile-update-failed" });
    } finally {
      client.release();
    }
  });
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT id, display_name, name, photo_url FROM users WHERE id=$1",
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const u = result.rows[0];
    res.json({ uid: u.id.toString(), displayName: u.display_name || u.name, photoURL: u.photo_url || "" });
  });
  app.get("/api/users/:id/social", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    if (Number.isNaN(uid)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [followers, following, rel] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE following_id=$1`, [uid]),
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE follower_id=$1`, [uid]),
      pool.query(`SELECT 1 FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, uid])
    ]);
    res.json({
      followers: followers.rows[0]?.c ?? 0,
      following: following.rows[0]?.c ?? 0,
      youFollow: rel.rows.length > 0
    });
  });
  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    await pool.query(
      `INSERT INTO user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target]
    );
    res.json({ ok: true });
  });
  app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });
  app.post("/api/users/:id/block", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target]
    );
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [target, req.userId]);
    res.json({ ok: true });
  });
  app.delete("/api/users/:id/block", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });
  app.get("/api/users/:id/block", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    const row = await pool.query(
      `SELECT 1 FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`,
      [req.userId, target]
    );
    res.json({ youBlocked: row.rows.length > 0 });
  });
  app.get("/api/users/:id/posts", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 80`,
      [uid]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/posts/liked", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE $1 = ANY(p.likes) ORDER BY p.created_at DESC LIMIT 80`,
      [req.userId]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/messages/inbox", requireAuth, async (req, res) => {
    const result = await pool.query(
      `WITH partners AS (
         SELECT DISTINCT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS oid
         FROM direct_messages WHERE sender_id=$1 OR recipient_id=$1
       )
       SELECT u.id, u.display_name, u.name, u.photo_url,
         (SELECT body FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_body,
         (SELECT created_at FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_at
       FROM partners p JOIN users u ON u.id=p.oid
       ORDER BY last_at DESC NULLS LAST`,
      [req.userId]
    );
    res.json(
      result.rows.map((r) => ({
        userId: r.id.toString(),
        displayName: r.display_name || r.name || "",
        photoURL: r.photo_url || "",
        lastMessage: r.last_body || "",
        lastAt: r.last_at
      }))
    );
  });
  app.get("/api/messages/thread/:userId", requireAuth, async (req, res) => {
    const other = parseInt(req.params.userId, 10);
    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, body, created_at FROM direct_messages
       WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
       ORDER BY created_at ASC LIMIT 300`,
      [req.userId, other]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id.toString(),
        recipientId: r.recipient_id.toString(),
        body: r.body,
        createdAt: r.created_at
      }))
    );
  });
  app.post("/api/messages", requireAuth, async (req, res) => {
    const { recipientId, body } = req.body;
    const rid = parseInt(String(recipientId || ""), 10);
    const text = (body || "").trim().slice(0, 4e3);
    if (!text || Number.isNaN(rid) || rid === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.userId, rid, text]
    );
    res.json({ id: ins.rows[0].id, createdAt: ins.rows[0].created_at });
  });
  app.get("/api/workouts", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapWorkout));
  });
  app.post("/api/workouts", requireAuth, async (req, res) => {
    const {
      name,
      type,
      subtype,
      duration,
      caloriesBurned,
      date,
      exercises,
      notes,
      shared,
      sessionRpe,
      coachSessionMeta,
      coachSessionFeedback,
      cardioSessionFeedback
    } = req.body;
    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared,session_rpe,coach_session_meta,coach_session_feedback,cardio_session_feedback)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb) RETURNING id`,
      [
        req.userId,
        name,
        type,
        subtype,
        duration || 0,
        caloriesBurned || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(exercises || []),
        notes,
        shared || false,
        typeof sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(sessionRpe))) : null,
        coachSessionMeta ? JSON.stringify(coachSessionMeta) : null,
        coachSessionFeedback || null,
        cardioSessionFeedback ? JSON.stringify(cardioSessionFeedback) : null
      ]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workouts/:id", requireAuth, async (req, res) => {
    const { name, duration, caloriesBurned, exercises, notes, shared, sessionRpe } = req.body;
    await pool.query(
      `UPDATE workouts SET name=$2,duration=$3,calories_burned=$4,exercises=$5,notes=$6,shared=$7,session_rpe=$8,updated_at=NOW()
       WHERE id=$1 AND user_id=$9`,
      [
        req.params.id,
        name,
        duration,
        caloriesBurned,
        JSON.stringify(exercises || []),
        notes,
        shared,
        typeof sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(sessionRpe))) : null,
        req.userId
      ]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workouts/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workouts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const extras = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    res.json(extras.workoutSessionDraft ?? null);
  });
  app.put("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const merged = { ...prev, workoutSessionDraft: req.body };
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(merged)
    ]);
    res.json({ ok: true });
  });
  app.delete("/api/workout-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const { workoutSessionDraft: _d, ...rest } = prev;
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(rest)
    ]);
    res.json({ ok: true });
  });
  app.get("/api/workout-session-draft/recoverable", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const extras = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const draft = extras.workoutSessionDraft ?? null;
    const workoutsResult = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    const workouts = workoutsResult.rows.map(mapWorkout);
    const recovery = assessRecoverableSessionDraft(draft, workouts);
    if (!recovery) {
      res.json({ recoverable: false });
      return;
    }
    res.json({
      recoverable: true,
      label: recovery.label,
      dayKey: recovery.dayKey,
      durationMinutes: recovery.durationMinutes,
      completedSetCount: recovery.completedSetCount,
      isCoachSource: recovery.isCoachSource
    });
  });
  app.post("/api/workouts/recover-session-draft", requireAuth, async (req, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
    const draft = prev.workoutSessionDraft ?? null;
    const workoutsResult = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    const workouts = workoutsResult.rows.map(mapWorkout);
    const recovery = assessRecoverableSessionDraft(draft, workouts);
    if (!recovery) {
      res.status(404).json({ error: "not_recoverable" });
      return;
    }
    const coachPlanId = typeof req.body?.coachPlanId === "string" ? req.body.coachPlanId : void 0;
    const weekNumber = typeof req.body?.weekNumber === "number" ? req.body.weekNumber : void 0;
    const payload = buildWorkoutFromRecoverableDraft(recovery, String(req.userId), {
      coachPlanId,
      weekNumber
    });
    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared,session_rpe,coach_session_meta,coach_session_feedback,cardio_session_feedback)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb) RETURNING id`,
      [
        req.userId,
        payload.name,
        payload.type,
        payload.subtype ?? null,
        payload.duration || 0,
        payload.caloriesBurned || 0,
        payload.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(payload.exercises || []),
        payload.notes ?? null,
        false,
        typeof payload.sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(payload.sessionRpe))) : null,
        payload.coachSessionMeta ? JSON.stringify(payload.coachSessionMeta) : null,
        null,
        payload.cardioSessionFeedback ? JSON.stringify(payload.cardioSessionFeedback) : null
      ]
    );
    const { workoutSessionDraft: _d, ...rest } = prev;
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(rest)
    ]);
    res.json({ id: result.rows[0].id, recovered: true });
  });
  app.get("/api/workout-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workout_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapTemplate));
  });
  app.post("/api/workout-templates", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    const result = await pool.query(
      "INSERT INTO workout_templates (user_id,name,type,template_mode,exercises,week_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [req.userId, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workout-templates/:id", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    await pool.query(
      "UPDATE workout_templates SET name=$2,type=$3,template_mode=$4,exercises=$5,week_plan=$6 WHERE id=$1 AND user_id=$7",
      [req.params.id, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workout-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workout_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/nutrition", requireAuth, async (req, res) => {
    const { date } = req.query;
    let query = "SELECT * FROM nutrition WHERE user_id=$1";
    const vals = [req.userId];
    if (date) {
      vals.push(date);
      query += ` AND date=$${vals.length}`;
    } else {
      query += " AND date >= CURRENT_DATE - INTERVAL '30 days'";
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, vals);
    res.json(result.rows.map(mapNutrition));
  });
  app.get("/api/nutrition/:id/components", requireAuth, async (req, res) => {
    const nutritionId = String(req.params.id || "").trim();
    if (!nutritionId) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    const own = await pool.query(
      "SELECT id FROM nutrition WHERE id=$1 AND user_id=$2",
      [nutritionId, req.userId]
    );
    if (own.rowCount === 0) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    const rows = await pool.query(
      `SELECT
         component_id, food_name, openfoodfacts_id, product_name, brand, grams, kcal,
         protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified, created_at
       FROM nutrition_log_components
       WHERE nutrition_id=$1
       ORDER BY created_at ASC`,
      [nutritionId]
    );
    res.json({ components: rows.rows });
  });
  app.post("/api/nutrition", requireAuth, async (req, res) => {
    const {
      meal,
      category,
      calories,
      protein,
      carbs,
      fat,
      date,
      ingredients,
      quantity,
      unit,
      inputType,
      originalInput,
      mealCategory,
      cuisine,
      totalFiber,
      aiModelUsed,
      pipelineVersion,
      userReviewed,
      nutritionLogComponents
    } = req.body;
    const result = await pool.query(
      `INSERT INTO nutrition (
        user_id,meal,category,calories,protein,carbs,fat,date,ingredients,quantity,unit,
        input_type,original_input,meal_category,cuisine,total_fiber,ai_model_used,pipeline_version,user_reviewed
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        req.userId,
        meal,
        category,
        calories || 0,
        protein || 0,
        carbs || 0,
        fat || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(ingredients || []),
        quantity != null && quantity !== "" ? Number(quantity) : null,
        unit || null,
        inputType || null,
        originalInput || null,
        mealCategory || null,
        cuisine || null,
        Number(totalFiber) || 0,
        aiModelUsed || null,
        pipelineVersion || null,
        userReviewed === true
      ]
    );
    const nutritionId = result.rows[0].id;
    if (Array.isArray(nutritionLogComponents) && nutritionLogComponents.length > 0) {
      for (const row of nutritionLogComponents) {
        await pool.query(
          `INSERT INTO nutrition_log_components (
            nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
            grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            nutritionId,
            row.component_id ?? null,
            row.food_name ?? row.product_name ?? meal,
            row.openfoodfacts_id ?? null,
            row.product_name ?? row.food_name ?? meal,
            row.brand ?? null,
            Number(row.grams) || 0,
            Number(row.kcal) || 0,
            Number(row.protein_g) || 0,
            Number(row.carbs_g) || 0,
            Number(row.fat_g) || 0,
            row.fiber_g != null ? Number(row.fiber_g) : null,
            row.data_source ?? "openfoodfacts",
            Number(row.confidence_score) || 0,
            row.user_modified === true
          ]
        );
      }
    }
    res.json({ id: nutritionId });
  });
  app.patch("/api/nutrition/:id", requireAuth, async (req, res) => {
    const { meal, category, calories, protein, carbs, fat, date, ingredients, quantity, unit } = req.body;
    const dateVal = typeof date === "string" ? date.includes("T") ? date.split("T")[0] : date : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const qNum = quantity != null && quantity !== "" ? Number(quantity) : null;
    const result = await pool.query(
      `UPDATE nutrition SET
         meal=$1, category=$2, calories=$3, protein=$4, carbs=$5, fat=$6, date=$7,
         ingredients=$8::jsonb, quantity=$9, unit=$10
       WHERE id=$11 AND user_id=$12`,
      [
        String(meal || ""),
        category || "snack",
        Number(calories) || 0,
        Number(protein) || 0,
        Number(carbs) || 0,
        Number(fat) || 0,
        dateVal,
        JSON.stringify(ingredients ?? []),
        qNum,
        unit ? String(unit) : null,
        req.params.id,
        req.userId
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });
  app.delete("/api/nutrition/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM nutrition WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/meal-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM meal_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapMealTemplate));
  });
  app.post("/api/meal-templates", requireAuth, async (req, res) => {
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage
    } = req.body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions || 1), 10) || 1));
    const prepJson = JSON.stringify(Array.isArray(prepSteps) ? prepSteps : []);
    const llmEst = llmEstimateNutrients && typeof llmEstimateNutrients === "object" ? JSON.stringify(llmEstimateNutrients) : null;
    const cov = nutrientsComputedCoverage != null && nutrientsComputedCoverage !== "" ? Number(nutrientsComputedCoverage) : 0;
    const src = typeof source === "string" && source.trim() ? String(source).slice(0, 40) : "manual";
    await pool.query(
      `INSERT INTO meal_templates (
        user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
        prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
      ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)`,
      [
        req.userId,
        name,
        category,
        JSON.stringify(ingredients || []),
        totalCalories || 0,
        totalProtein || 0,
        totalCarbs || 0,
        totalFat || 0,
        yp,
        prepJson,
        llmEst,
        cov,
        src
      ]
    );
    res.json({ ok: true });
  });
  app.patch("/api/meal-templates/:id", requireAuth, async (req, res) => {
    const body = req.body;
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage
    } = body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions ?? 1), 10) || 1));
    const existing = await pool.query(
      "SELECT prep_steps, llm_estimate_nutrients, nutrients_computed_coverage, source FROM meal_templates WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Template not found" });
    const row0 = existing.rows[0];
    const prepFinal = prepSteps != null ? JSON.stringify(prepSteps) : JSON.stringify(row0.prep_steps || []);
    const llmFinal = llmEstimateNutrients != null && typeof llmEstimateNutrients === "object" ? JSON.stringify(llmEstimateNutrients) : row0.llm_estimate_nutrients != null ? JSON.stringify(row0.llm_estimate_nutrients) : null;
    const covFinal = nutrientsComputedCoverage != null && nutrientsComputedCoverage !== "" ? Number(nutrientsComputedCoverage) : Number(row0.nutrients_computed_coverage ?? 0);
    const srcFinal = typeof source === "string" && source.trim() ? String(source).slice(0, 40) : String(row0.source || "manual");
    await pool.query(
      `UPDATE meal_templates SET
         name=$1, category=$2, ingredients=$3::jsonb,
         total_calories=$4, total_protein=$5, total_carbs=$6, total_fat=$7, yields_portions=$8,
         prep_steps=$9::jsonb, llm_estimate_nutrients=$10::jsonb, nutrients_computed_coverage=$11, source=$12
       WHERE id=$13 AND user_id=$14`,
      [
        name,
        category,
        JSON.stringify(ingredients || []),
        Number(totalCalories) || 0,
        Number(totalProtein) || 0,
        Number(totalCarbs) || 0,
        Number(totalFat) || 0,
        yp,
        prepFinal,
        llmFinal,
        covFinal,
        srcFinal,
        req.params.id,
        req.userId
      ]
    );
    res.json({ ok: true });
  });
  app.post("/api/meal-templates/ai-draft", requireAuth, async (req, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { idea, allergies, yieldsPortions } = req.body;
      const ideaStr = String(idea || "").trim();
      if (!ideaStr) {
        res.status(400).json({ error: "idea required" });
        return;
      }
      const ypHint = yieldsPortions != null ? Number(yieldsPortions) : void 0;
      const ypHintNum = ypHint != null && Number.isFinite(ypHint) && ypHint > 0 ? ypHint : 4;
      const basePrompt = buildMealRecipeDraftPrompt(ideaStr, String(allergies || ""), ypHintNum);
      let repair = "";
      let parsed = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${basePrompt}

VALIDATOR REPAIR:
${repair}` : basePrompt;
        rawLast = await completeMealAnalysis(prompt, void 0, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z8 = mealRecipeAiSchema.safeParse(j);
          if (!z8.success) {
            repair = z8.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z8.data;
          repair = "";
          break;
        } catch (e) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId,
          endpoint: "POST /api/meal-templates/ai-draft",
          inputSummary: { idea: ideaStr },
          rawResponse: rawLast.slice(0, 12e4),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 0
        });
        res.status(500).json({ error: repair || "Meal AI validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? ypHint ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage
        ]
      );
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { idea: ideaStr },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 0
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e) {
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 12e4) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 0
      });
      console.error("meal-templates ai-draft:", e);
      res.status(500).json({ error: e?.message || "AI draft failed" });
    }
  });
  app.post("/api/meal-templates/ai-refine", requireAuth, async (req, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { previousValid, userRefinement } = req.body;
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const base = buildMealRecipeRefinePrompt(
        userRefinement.trim(),
        JSON.stringify(previousValid, null, 2)
      );
      let repair = "";
      let parsed = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${base}
REPAIR: ${repair}` : base;
        rawLast = await completeMealAnalysis(prompt, void 0, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z8 = mealRecipeAiSchema.safeParse(j);
          if (!z8.success) {
            repair = z8.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z8.data;
          repair = "";
          break;
        } catch (e) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId,
          endpoint: "POST /api/meal-templates/ai-refine",
          inputSummary: { userRefinement },
          rawResponse: rawLast.slice(0, 12e4),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 1
        });
        res.status(500).json({ error: repair || "Refine validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage
        ]
      );
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 1
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e) {
      await logMealAiRun(pool, {
        userId: req.userId,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 12e4) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 1
      });
      console.error("meal-templates ai-refine:", e);
      res.status(500).json({ error: e?.message || "AI refine failed" });
    }
  });
  app.delete("/api/meal-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM meal_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  const POST_BLOCK_FILTER = `
    AND p.user_id NOT IN (
      SELECT blocked_id FROM user_blocks WHERE blocker_id = $viewer
      UNION
      SELECT blocker_id FROM user_blocks WHERE blocked_id = $viewer
    )`;
  app.get("/api/posts", requireAuth, async (req, res) => {
    const scope = String(req.query.scope ?? "global");
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const viewer = req.userId;
    let result;
    if (scope === "following") {
      result = await pool.query(
        `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE (p.user_id = $1
            OR p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1))
         ${POST_BLOCK_FILTER.replace(/\$viewer/g, "$1")}
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [viewer, limit]
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
         FROM posts p JOIN users u ON u.id=p.user_id
         WHERE 1=1 ${POST_BLOCK_FILTER.replace(/\$viewer/g, "$1")}
         ORDER BY p.created_at DESC LIMIT $2`,
        [viewer, limit]
      );
    }
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.post("/api/posts/:id/report", requireAuth, async (req, res) => {
    const { reason } = req.body;
    const postId = req.params.id;
    const exists = await pool.query(`SELECT 1 FROM posts WHERE id=$1`, [postId]);
    if (!exists.rows.length) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    await pool.query(
      `INSERT INTO post_reports (post_id, reporter_id, reason) VALUES ($1,$2,$3)`,
      [postId, req.userId, String(reason ?? "").slice(0, 2e3)]
    );
    res.json({ ok: true });
  });
  app.post("/api/posts", requireAuth, async (req, res) => {
    const { content, imageUrl, type, workoutId } = req.body;
    const result = await pool.query(
      "INSERT INTO posts (user_id,content,image_url,type,workout_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [req.userId, content, imageUrl, type || "manual", workoutId]
    );
    res.json({ id: result.rows[0].id });
  });
  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    const result = await pool.query("DELETE FROM posts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!result.rowCount) {
      res.status(404).json({ error: "Beitrag nicht gefunden oder keine Berechtigung" });
      return;
    }
    res.json({ ok: true });
  });
  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_append(likes,$2) WHERE id=$1 AND NOT ($2=ANY(likes))",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_remove(likes,$2) WHERE id=$1",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.get("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT c.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM post_comments c JOIN users u ON u.id=c.user_id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      userId: r.user_id.toString(),
      userName: r.user_name || r.user_name_fallback || "",
      userPhoto: r.user_photo || "",
      content: r.content,
      createdAt: r.created_at
    })));
  });
  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const { content } = req.body;
    await pool.query(
      "INSERT INTO post_comments (post_id,user_id,content) VALUES ($1,$2,$3)",
      [req.params.id, req.userId, content]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req, res) => {
    await pool.query(
      "DELETE FROM post_comments WHERE id=$1 AND user_id=$2",
      [req.params.commentId, req.userId]
    );
    res.json({ ok: true });
  });
  function callCoachAi(messages, area) {
    return completeCoachJson(messages, area);
  }
  function callCoachAiForPlan(plan, messages) {
    return callCoachAi(messages, coachAreaForPlanType(plan.type));
  }
  function coachPayloadHash(obj) {
    try {
      return createHash4("sha256").update(JSON.stringify(obj ?? null)).digest("hex").slice(0, 32);
    } catch {
      return null;
    }
  }
  function normalizeCoachWorkoutDay(d) {
    if (!d || typeof d !== "object") return d;
    if (d.isRest) return d;
    const sessionType = String(d.sessionType || "");
    const title = String(d.title || "");
    const lower2 = `${sessionType} ${title}`.toLowerCase();
    const noLift = !Array.isArray(d.exercises) || d.exercises.length === 0;
    const looksCardio = /cardio|interval|\brun\b|\bride\b|bike|swim|row|aerobic|tempo|endurance|jog|\b5k\b|\b10k\b|track|hiit|time trial|lauf/.test(lower2) || noLift && /assessment|trial|evaluation/.test(lower2);
    let cardio = d.cardio;
    if (looksCardio || cardio && typeof cardio === "object") {
      const base = cardio && typeof cardio === "object" ? { ...cardio } : {};
      if (!base.type || !String(base.type).trim()) {
        if (/swim/.test(lower2)) base.type = "swim";
        else if (/bike|cycl|ride|erg/.test(lower2)) base.type = "bike";
        else if (/row/.test(lower2)) base.type = "row";
        else base.type = "run";
      }
      const hasGrid = !!(base.duration && String(base.duration).trim()) || !!(base.distance && String(base.distance).trim()) || !!(base.pace && String(base.pace).trim()) || !!(base.zones && String(base.zones).trim());
      const detail = typeof base.details === "string" ? base.details.trim() : "";
      if (!hasGrid && !detail) {
        const fromDesc = String(d.description || "").trim();
        const fromNotes = String(d.notes || "").trim();
        const warmup = String(d.warmup || "").trim();
        const cooldown = String(d.cooldown || "").trim();
        let fallback = [fromDesc, fromNotes].filter(Boolean).join("\n\n").trim();
        if (!fallback && warmup && cooldown) {
          fallback = `Ausf\xFChrung: Hauptteil gem\xE4\xDF Session-Titel und Wochenfokus \u2014 Warm-up und Cool-down sind unten bereits detailliert; der **Block zwischen Warm-up und Cool-down** muss mit konkreten Intervallen/Zeiten/(Zonen) beschrieben sein.

Session: ${title || sessionType || "Cardio"}.`.trim();
        }
        if (fallback) base.details = fallback;
        else if (looksCardio) {
          base.details = `Hauptteil (Cardio/Intervals): Konkrete Arbeit zwischen Warm-up und Cool-down \u2014 z. B. Zeitfahren, Intervall-Stufen, Wiederholungen, Erholung, Ziel-Zonen/RPE. Titel: ${title || sessionType || "Cardio"}.`.trim();
        }
      }
      cardio = base;
    }
    return { ...d, cardio };
  }
  function normalizeCoachWorkoutEnvelope(parsed) {
    if (!parsed || typeof parsed !== "object") return parsed;
    const inner = parsed.schedule;
    if (!Array.isArray(inner)) return { ...parsed, schedule: inner };
    return { ...parsed, schedule: inner.map(normalizeCoachWorkoutDay) };
  }
  const coachExerciseKeyCache = /* @__PURE__ */ new Map();
  const COACH_EXERCISE_NAME_ALIASES = {
    kniebeugen: ["back squat", "barbell squat", "squat"],
    kniebeuge: ["back squat", "barbell squat", "squat"],
    ausfallschritte: ["lunge", "walking lunge"],
    rudern: ["row", "seated row"],
    bankdrucken: ["bench press", "barbell bench press", "dumbbell bench press"],
    schulterdrucken: ["shoulder press", "overhead press"],
    kreuzheben: ["deadlift", "romanian deadlift"],
    klimmzuge: ["pull up", "chin up"],
    liegestutze: ["push up"]
  };
  function normalizeCoachExerciseSearchText(v) {
    return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/["'`]/g, "").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  }
  function isCoachMainExercise(row) {
    const setType = String(row.setType || "").toLowerCase();
    if (setType === "warmup" || setType === "cooldown") return false;
    const text = normalizeCoachExerciseSearchText(`${row.name || ""} ${row.notes || ""}`);
    return !/(warm ?up|aufwarm|cool ?down|abwarm|mobility|stretch|activation)/.test(text);
  }
  function coachExerciseSearchCandidates(name) {
    const clean = normalizeCoachExerciseSearchText(name);
    if (!clean) return [];
    const out = [];
    out.push(clean);
    const noSuffix = clean.replace(/\b(mit|with)\b.*$/, "").replace(/\b(barbell|dumbbell|kettlebell)\b/g, "").replace(/\s+/g, " ").trim();
    if (noSuffix && noSuffix !== clean) out.push(noSuffix);
    const alias = COACH_EXERCISE_NAME_ALIASES[noSuffix] || COACH_EXERCISE_NAME_ALIASES[clean];
    if (alias?.length) out.push(...alias);
    return [...new Set(out)].filter(Boolean);
  }
  async function resolveCoachExerciseKey(name) {
    const base = normalizeCoachExerciseSearchText(name);
    if (!base) return null;
    if (coachExerciseKeyCache.has(base)) return coachExerciseKeyCache.get(base) || null;
    const candidates = coachExerciseSearchCandidates(name);
    for (const q of candidates) {
      const hits = await searchExerciseDbCatalog({ query: q, limit: 8 });
      if (!hits.length) continue;
      const best = hits.find((h) => normalizeCoachExerciseSearchText(h.name) === normalizeCoachExerciseSearchText(q)) || hits.find((h) => normalizeCoachExerciseSearchText(h.name).includes(normalizeCoachExerciseSearchText(q))) || hits[0];
      const resolved = best ? { key: best.key, name: best.name } : null;
      if (resolved) {
        coachExerciseKeyCache.set(base, resolved);
        return resolved;
      }
    }
    coachExerciseKeyCache.set(base, null);
    return null;
  }
  async function fallbackCoachMainExercise(day, row) {
    const sessionType = normalizeCoachExerciseSearchText(String(day.sessionType || ""));
    const title = normalizeCoachExerciseSearchText(String(day.title || ""));
    const rowName = normalizeCoachExerciseSearchText(String(row.name || ""));
    const hints = `${sessionType} ${title} ${rowName}`.trim();
    const queries = /(cardio|interval|run|bike|row|endurance)/.test(hints) ? ["treadmill run", "stationary bike", "rowing machine"] : ["back squat", "bench press", "lat pulldown", "dumbbell row", "plank"];
    for (const q of queries) {
      const hits = await searchExerciseDbCatalog({ query: q, limit: 5 });
      if (!hits.length) continue;
      return { key: hits[0].key, name: hits[0].name };
    }
    return null;
  }
  function mergeCoachTextSection(base, details) {
    const parts = [];
    const baseText = String(base || "").trim();
    if (baseText) parts.push(baseText);
    for (const d of details) {
      const t2 = String(d || "").trim();
      if (t2) parts.push(t2);
    }
    return parts.join("\n\n").trim();
  }
  async function ensureCoachMainExercisesUseExerciseDb(week) {
    const next = { ...week, schedule: [] };
    let resolvedCount = 0;
    let fallbackCount = 0;
    let removedWarmupCooldownRows = 0;
    for (const day of week.schedule || []) {
      if (!Array.isArray(day.exercises) || day.isRest) {
        next.schedule.push({ ...day });
        continue;
      }
      const nextDay = { ...day };
      const warmupText = [];
      const cooldownText = [];
      const mainExercises = [];
      for (const rowAny of day.exercises) {
        const row = { ...rowAny };
        const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
        if (!isCoachMainExercise(row)) {
          const setType = String(row.setType || "").toLowerCase();
          const line = `- ${String(row.name || "Drill")} ${String(row.notes || "").trim()}`.trim();
          if (setType === "cooldown" || /cool ?down|abwarm|stretch/.test(normalizeCoachExerciseSearchText(line))) {
            cooldownText.push(line);
          } else {
            warmupText.push(line);
          }
          removedWarmupCooldownRows += 1;
          continue;
        }
        if (!key) {
          const aiName = String(row.name || "");
          const resolved = await resolveCoachExerciseKey(aiName);
          if (resolved) {
            row.exerciseKey = resolved.key;
            row.name = pickCoachExerciseNameAfterResolve(aiName, resolved.name);
            resolvedCount += 1;
          } else {
            const fb = await fallbackCoachMainExercise(day, row);
            if (fb) {
              row.exerciseKey = fb.key;
              row.name = pickCoachExerciseNameAfterResolve(aiName, fb.name);
              fallbackCount += 1;
            }
          }
        }
        if (typeof row.exerciseKey === "string" && row.exerciseKey.trim()) {
          mainExercises.push(row);
        }
      }
      nextDay.exercises = mainExercises;
      if (Array.isArray(nextDay.warmupExercises) && nextDay.warmupExercises.length) {
        nextDay.warmupExercises = nextDay.warmupExercises.map((ex) => ({
          ...ex,
          setType: ex.setType || "warmup"
        }));
      } else if (warmupText.length) {
        nextDay.warmup = mergeCoachTextSection(
          nextDay.warmup,
          [
            "Coach Warm-up Hinweise:",
            ...warmupText,
            "Fokus: kontrolliertes Tempo, saubere Technik, Atmung ruhig halten."
          ]
        );
      }
      if (Array.isArray(nextDay.cooldownExercises) && nextDay.cooldownExercises.length) {
        nextDay.cooldownExercises = nextDay.cooldownExercises.map((ex) => ({
          ...ex,
          setType: ex.setType || "normal"
        }));
      } else if (cooldownText.length) {
        nextDay.cooldown = mergeCoachTextSection(
          nextDay.cooldown,
          [
            "Coach Cool-down Hinweise:",
            ...cooldownText,
            "Fokus: Puls langsam senken, entspannt atmen, Bewegungen ohne Schmerz."
          ]
        );
      }
      next.schedule.push(nextDay);
    }
    if (resolvedCount > 0 || fallbackCount > 0 || removedWarmupCooldownRows > 0) {
      next.applied_constraints = [
        ...Array.isArray(next.applied_constraints) ? next.applied_constraints : [],
        `repaired:exercise_db_key_resolved_count=${resolvedCount}`,
        `repaired:exercise_db_fallback_count=${fallbackCount}`,
        `repaired:warmup_cooldown_text_only_rows=${removedWarmupCooldownRows}`
      ].slice(0, 8);
    }
    return next;
  }
  async function finalizeCoachWeekWithExerciseDb(week, uiLocale) {
    const keyed = await ensureCoachMainExercisesUseExerciseDb(week);
    return applyGermanNamesToCoachWorkoutWeek(
      keyed,
      uiLocale,
      (prompt) => callCoachAi([{ role: "user", content: prompt }], "coach_workout"),
      exerciseNameLocalizationStore
    );
  }
  function coachWeekNeedsGermanLocalization(week) {
    for (const day of week.schedule || []) {
      if (day.isRest || !Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        if (!ex || typeof ex !== "object") continue;
        const row = ex;
        const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
        const name = String(row.name || "").trim();
        if (key && name && !looksGermanExerciseName(name)) return true;
      }
    }
    return false;
  }
  async function hydrateCoachScheduleJsonForLocale(scheduleJson, uiLocale, opts) {
    if (uiLocale !== "de" || !scheduleJson || typeof scheduleJson !== "object") return scheduleJson;
    const week = scheduleJson;
    if (!Array.isArray(week.schedule)) return scheduleJson;
    const before = JSON.stringify(week.schedule);
    let out = await applyDbGermanNamesToCoachWorkoutWeek(week, exerciseNameLocalizationStore);
    if (opts?.allowAiBackfill && coachWeekNeedsGermanLocalization(out)) {
      out = await applyGermanNamesToCoachWorkoutWeek(
        out,
        "de",
        (prompt) => callCoachAi([{ role: "user", content: prompt }], "coach_workout"),
        exerciseNameLocalizationStore
      );
    }
    const after = JSON.stringify(out.schedule);
    if (opts?.planId && opts.weekNumber != null && after !== before) {
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [opts.planId, opts.weekNumber, JSON.stringify(out)]
      );
    }
    return out;
  }
  function buildWorkoutPrompt(plan, weekNumber, lastReport, startDayName, userContext, repairHint, exerciseCatalogText, uiLocale = "de") {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const weeksUntilEvent = plan.event_date ? Math.round((new Date(plan.event_date).getTime() - Date.now()) / (7 * 24 * 3600 * 1e3)) : null;
    const isTaper = weeksUntilEvent !== null && weeksUntilEvent <= 2;
    const adaptationBlock = buildAdaptationBlockFromReport(lastReport, weekNumber);
    const avail = Array.isArray(ob.availableTrainingDays) && ob.availableTrainingDays.length ? ob.availableTrainingDays.join(", ") : "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday (no restriction \u2014 athlete did not specify)";
    const allowDoubles = ob.allowDoubleSessions !== false;
    const slotPlan = resolveTrainingSlotPlanFromOnboarding(ob, startDayName);
    const volumeText = formatSessionVolumeForPrompt(ob, slotPlan, {
      partialWeekStartDay: startDayName
    });
    const slotBlock = slotPlan ? `
- **Session distribution (MANDATORY):** ${formatExtendedSlotPlanForPrompt(slotPlan)}` : "";
    const volumeBlock = `
${volumeText}${slotBlock}`;
    const ctxBlock = userContext != null ? `

USER_CONTEXT_JSON (machine-readable \u2014 honor constraints_input.available_weekdays_en / injuries_plain / rolling stats):
${JSON.stringify(userContext, null, 2)}
` : "";
    const repairBlock = repairHint ? `

VALIDATOR / SCHEMA REPAIR \u2014 address this precisely; output ONLY valid JSON:
${repairHint}
` : "";
    const exerciseDbBlock = `

ALLOWED EXERCISE KEYS (set exercises[].exerciseKey when possible \u2014 ONLY keys from this list, format edb_<id>):
${exerciseCatalogText ?? formatExerciseDbForCoachPrompt()}

STRICT FORMAT RULES:
- Main workout block (schedule[].exercises) MUST contain only ExerciseDB-backed exercises with valid exerciseKey.
- Prefer structured "warmupExercises" / "cooldownExercises" arrays (name, sets, reps, notes; exerciseKey when in catalog).
- Legacy plain-text warmup/cooldown strings are allowed only as short cues \u2014 do not dump mobility circuits as free prose only.
`;
    const equipmentList = Array.isArray(ob.equipment) ? ob.equipment : [];
    const benchmarkBlock = formatBenchmarksForCoachPrompt({
      benchmarks: ob.benchmarks || {},
      equipment: equipmentList,
      trainingStyle: String(ob.trainingStyle || "hybrid"),
      fitnessLevel: String(ob.fitnessLevel || "intermediate"),
      weekNumber,
      locale: uiLocale
    });
    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}
- Fitness Level: ${ob.fitnessLevel || "intermediate"} (honor for exercise selection; loads must follow benchmarks when provided)
- Training style: ${ob.trainingStyle || "strength"}, Vibe: ${ob.workoutVibe || "classic_lifting"}
- Sports: ${joinCoachList(ob.sports, "n/a")}
${volumeBlock}
- **Available training weekdays** (sessions may ONLY fall on these days; all other calendar weekdays MUST be isRest=true): ${avail}
- **Two-a-days:** ${allowDoubles ? 'ALLOWED \u2014 if the athlete needs slightly more weekly load but has few available days, you MAY output TWO separate sessions on the SAME weekday (two objects with the same "day"), e.g. "Morning easy" + "Evening quality". Keep recovery realistic.' : "NOT allowed \u2014 at most ONE non-rest session per weekday."}
- Equipment (STRICT \u2014 never prescribe exercises needing gear not listed): ${formatCoachEquipmentForPrompt(equipmentList)}
- Injuries/limitations: ${ob.injuries || "none"}
- Benchmarks / performance data:
${benchmarkBlock}
- Extra wishes: ${ob.extraWishes || "none"}`;
    const planConfiguration = `- Discipline: ${plan.discipline}
- Mode: ${plan.plan_mode === "event" ? "Event-based" : "Ongoing"}
${plan.plan_mode === "event" ? `- Event: ${plan.event_name} | ${plan.event_distance || ""} | Date: ${plan.event_date} | Weeks remaining: ${weeksUntilEvent}` : ""}
${isTaper ? "\u26A0\uFE0F TAPER WEEK: Reduce volume by 40-50%, maintain intensity. Focus on recovery. Short, sharp sessions only." : ""}`;
    const stateBlock = userContext != null && typeof userContext === "object" && userContext.coach_plan_state ? `
PERIODIZATION STATE: ${JSON.stringify(userContext.coach_plan_state)}` : "";
    const weekBlock = weekNumber === 1 ? `THIS IS WEEK 1 \u2014 BASELINE / DISCOVERY WEEK:
Primary goal: collect safe baseline data to calibrate week 2+, NOT to push maximal performance.
- Strength without benchmarks: RPE 6\u20138, conservative estimated loads (%BW or light DB/KB), clear logging fields \u2014 NO %1RM prescriptions.
- Cardio without run benchmarks: easy conversational runs (20\u201340 min), athlete logs time/distance/RPE \u2014 NO fixed race paces like 5:30/km.
- When benchmarks ARE provided above: use them directly for loads/paces (respect fitness level + bodyweight).
- Keep overall volume ~60\u201370% of a normal week; technique and repeatability over intensity.
- Title discovery sessions clearly (e.g. "Ausdauer-Check", "Kraft-Baseline").
${startDayName ? `TODAY IS ${startDayName.toUpperCase()}. This is a PARTIAL first week. Only schedule sessions from ${startDayName} onwards (do NOT create sessions for days before today in the calendar sense). Days before ${startDayName} in the same Mon\u2013Sun list should be Rest. Still output the usual Mon\u2013Sun ordering in the JSON array (or additional same-day sessions where allowed).` : ""}` : `This is Week ${weekNumber}. Apply progression and the adaptations above.${stateBlock}${userContext != null && typeof userContext === "object" && Array.isArray(userContext.prior_week_exercise_keys) && userContext.prior_week_exercise_keys.length ? `
EXERCISE CONTINUITY (MANDATORY): Reuse these exerciseKeys from last week for primary lifts when equipment/injury still allow: ${userContext.prior_week_exercise_keys.slice(0, 16).join(", ")}. Rotate accessories only.` : ""}`;
    return buildCoachWorkoutWeekPrompt({
      discipline: String(ob.discipline || plan.discipline),
      weekNumber: String(weekNumber),
      athleteProfile,
      adaptationBlock,
      planConfiguration,
      weekBlock,
      userContextBlock: ctxBlock,
      exerciseDbBlock,
      repairBlock,
      outputLanguage: coachOutputLanguageForLocale(uiLocale)
    });
  }
  function buildNutritionPrompt(plan, weekNumber, lastReport, userContext, repairHint) {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const mealSchedule = resolveNutritionMealSchedule(ob);
    const mealScheduleBlock = formatMealScheduleForCoachPrompt(mealSchedule);
    const scheduledDays = new Set(mealSchedule.map((d) => d.day));
    const ctxBlock = userContext != null ? `

USER_CONTEXT_JSON:
${JSON.stringify(userContext, null, 2)}
` : "";
    const repairBlock = repairHint ? `

VALIDATOR / SCHEMA REPAIR \u2014 address precisely; output ONLY valid JSON:
${repairHint}
` : "";
    const adaptationBlock = lastReport ? `${buildAdaptationBlockFromReport(lastReport, weekNumber)}

\u2192 ADJUST dailyTargets and meal portions using nutritionMacroMultiplier from USER_CONTEXT_JSON coach_plan_state if present.` : "";
    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}, Weight: ${ob.weight}kg, Height: ${ob.height}cm
- Goal: ${ob.nutritionGoal}
- Activity level: ${ob.activityLevel}
- Dietary restrictions: ${joinCoachList(ob.restrictions)}
- Allergies: ${ob.allergies || "none"}
- Cooking time: ${ob.cookingTime}
- Food preferences: ${ob.foodPreferences || "varied"}
- Budget: ${ob.budget || "medium"}`;
    const weekIntro = `This is Week ${weekNumber}. ${weekNumber === 1 ? "Establish baseline targets." : "Adjust macros and meal structure based on feedback above."}`;
    return buildCoachNutritionWeekPrompt({
      weekNumber: String(weekNumber),
      athleteProfile,
      mealScheduleBlock,
      adaptationBlock,
      weekIntro,
      userContextBlock: ctxBlock,
      repairBlock,
      scheduledWeekdays: [...scheduledDays].join(", ") || "see schedule above"
    });
  }
  function buildReportPrompt(plan, schedule, completedWorkouts, nutritionEntries, prevReport, uiLocale = "de") {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const workoutSummary = completedWorkouts.length > 0 ? completedWorkouts.map((w) => `- ${w.date}: ${w.name} (${w.duration}min, ${w.calories_burned}kcal)`).join("\n") : "No workouts logged this week.";
    const nutritionSummary = nutritionEntries.length > 0 ? `Total entries: ${nutritionEntries.length}, Avg calories: ${Math.round(nutritionEntries.reduce((s, e) => s + Number(e.calories), 0) / Math.max(1, nutritionEntries.length))}kcal` : "No nutrition logged this week.";
    const prevWeekComparison = prevReport ? `
COMPARISON WITH WEEK ${plan.current_week - 1}:
- Last week's rating: ${prevReport.overallRating}/10
- Last week's completion: ${prevReport.completionRate}%
- Last week's coach message: "${prevReport.coachMessage?.substring(0, 200)}..."
- What was planned to change: ${(prevReport.nextWeekChanges || []).join("; ")}
- Did those changes happen? Evaluate honestly in your report.` : "";
    return buildCoachWeeklyReportPrompt({
      athleteSummary: `${ob.age}y ${ob.gender}, Level: ${ob.fitnessLevel || ob.activityLevel}, Discipline: ${plan.discipline || ob.nutritionGoal}`,
      currentWeek: String(plan.current_week),
      planMode: String(plan.plan_mode),
      prevWeekComparison,
      plannedScheduleJson: JSON.stringify(
        schedule?.schedule?.map((d) => ({
          day: d.day,
          type: d.sessionType || d.meals?.length,
          title: d.title,
          duration: d.estimatedDuration
        })),
        null,
        2
      ),
      workoutSummary,
      nutritionSummary,
      outputLanguage: coachOutputLanguageForLocale(uiLocale)
    });
  }
  app.get("/api/exercise-name-localizations", requireAuth, async (_req, res) => {
    try {
      const r = await pool.query(
        "SELECT exercise_key, name_de FROM exercise_name_localizations ORDER BY updated_at DESC LIMIT 5000"
      );
      const names = {};
      for (const row of r.rows) {
        const key = String(row.exercise_key || "").trim();
        const de = String(row.name_de || "").trim();
        if (key && de) names[key] = de;
      }
      res.json({ names });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load localizations";
      res.status(500).json({ error: msg });
    }
  });
  app.get("/api/coach/plans", requireAuth, async (req, res) => {
    const uiLocale = await getUserUiLocale(req.userId);
    const plans = await pool.query(
      `SELECT p.*,
              (SELECT row_to_json(s) FROM coach_weekly_schedules s WHERE s.plan_id=p.id AND s.week_number=p.current_week LIMIT 1) AS current_schedule,
              (SELECT row_to_json(r) FROM coach_weekly_reports r WHERE r.plan_id=p.id ORDER BY r.week_number DESC LIMIT 1) AS latest_report
       FROM coach_plans p WHERE p.user_id=$1 ORDER BY p.created_at DESC`,
      [req.userId]
    );
    const rows = await Promise.all(
      plans.rows.map(async (p) => {
        if (p.type !== "workout" || !p.current_schedule?.schedule) return p;
        const wn = Number(p.current_schedule.week_number ?? p.current_week ?? 1);
        const hydrated = await hydrateCoachScheduleJsonForLocale(p.current_schedule.schedule, uiLocale, {
          planId: p.id,
          weekNumber: wn,
          allowAiBackfill: p.status === "active"
        });
        return {
          ...p,
          current_schedule: {
            ...p.current_schedule,
            schedule: hydrated
          }
        };
      })
    );
    res.json(rows);
  });
  app.get("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const uiLocale = await getUserUiLocale(req.userId);
    const plan = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!plan.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const schedules = await pool.query("SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 ORDER BY week_number", [req.params.id]);
    const reports = await pool.query("SELECT * FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC", [req.params.id]);
    const hydratedSchedules = plan.rows[0].type === "workout" ? await Promise.all(
      schedules.rows.map(async (s) => ({
        ...s,
        schedule: await hydrateCoachScheduleJsonForLocale(s.schedule, uiLocale, {
          planId: req.params.id,
          weekNumber: Number(s.week_number),
          allowAiBackfill: true
        })
      }))
    ) : schedules.rows;
    res.json({ ...plan.rows[0], schedules: hydratedSchedules, reports: reports.rows });
  });
  const setCoachGenerationPhase = async (planId, phase) => {
    await pool.query(
      "UPDATE coach_plans SET generation_phase=$2, updated_at=NOW() WHERE id=$1",
      [planId, phase]
    );
  };
  app.get("/api/coach/plans/:id/generation", requireAuth, async (req, res) => {
    const plan = await pool.query(
      "SELECT generation_status, generation_error, generation_phase FROM coach_plans WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId]
    );
    if (!plan.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const sched = await pool.query(
      "SELECT 1 FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=1 LIMIT 1",
      [req.params.id]
    );
    let status = String(plan.rows[0].generation_status || "ready");
    let phase = String(plan.rows[0].generation_phase || "queued");
    if (status === "generating" && sched.rows.length > 0) {
      status = "ready";
      phase = "ready";
      await pool.query(
        "UPDATE coach_plans SET generation_status='ready', generation_error=NULL, generation_phase='ready', updated_at=NOW() WHERE id=$1",
        [req.params.id]
      );
    }
    res.json({ status, phase, error: plan.rows[0].generation_error ?? null });
  });
  app.post("/api/coach/plans/:id/cancel-generation", requireAuth, async (req, res) => {
    try {
      const plan = await pool.query(
        "SELECT id, generation_status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!plan.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const genStatus = String(plan.rows[0].generation_status || "");
      if (genStatus !== "generating" && genStatus !== "failed") {
        res.status(400).json({ error: "Plan is not being generated" });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_ai_runs WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  function extractPriorExerciseKeysFromScheduleJson(scheduleJson) {
    const week = scheduleJson;
    if (!week || !Array.isArray(week.schedule)) return [];
    const keys = [];
    for (const day of week.schedule) {
      if (!Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        const k = typeof ex?.exerciseKey === "string" ? ex.exerciseKey.trim() : "";
        if (k) keys.push(k);
      }
    }
    return [...new Set(keys)].slice(0, 24);
  }
  function coachPipelinePostArgs(userCtx, ob, priorExerciseKeys) {
    const rolling = userCtx.rolling || {};
    const recentWorkouts = Array.isArray(rolling.strength_load_workouts) ? rolling.strength_load_workouts : [];
    const directive = userCtx.latest_week_directive;
    const planState = userCtx.coach_plan_state;
    const volumeMultiplier = Number(directive?.volumeMultiplier) || Number(planState?.volumeMultiplier) || 1;
    const sports = Array.isArray(ob.sports) ? ob.sports : [];
    return {
      recentWorkouts,
      volumeMultiplier,
      sports,
      priorExerciseKeys: priorExerciseKeys?.length ? priorExerciseKeys : void 0
    };
  }
  const runCoachFirstWeekGeneration = async (args) => {
    const t0 = Date.now();
    const { plan, type, userId, discipline, startDateStr, isPartialWeek, targetDayName } = args;
    const maxCoachWorkoutRetries = Math.min(
      5,
      Math.max(1, Number(process.env.COACH_WORKOUT_MAX_RETRIES) || 3)
    );
    try {
      await setCoachGenerationPhase(plan.id, "context");
      const tContext = Date.now();
      const uiLocale = await getUserUiLocale(userId);
      const [userCtx, exerciseCatalog] = await Promise.all([
        buildUserContextForCoach({
          pool,
          userId,
          plan: {
            id: plan.id,
            onboarding_data: parseCoachOnboarding(plan.onboarding_data)
          },
          scheduleWindow: { startYmd: startDateStr },
          partialWeekStartDay: isPartialWeek ? targetDayName : void 0
        }),
        type === "nutrition" ? Promise.resolve("") : formatExerciseDbForCoachPromptAsync()
      ]);
      console.log(
        `[coach-gen] plan=${plan.id} context+catalog ms=${Date.now() - tContext} catalogChars=${exerciseCatalog.length}`
      );
      const planOb = { ...plan, onboarding_data: parseCoachOnboarding(plan.onboarding_data) };
      const ob = planOb.onboarding_data;
      const constraints = workoutConstraintsFromOnboarding(ob, {
        partialWeekStartDay: isPartialWeek ? targetDayName : void 0,
        weekNumber: 1
      });
      let schedule;
      let rawLast = "";
      let retries = 0;
      await setCoachGenerationPhase(plan.id, "ai");
      if (type === "nutrition") {
        const gen = await generateCoachNutritionWeekWithPipeline({
          buildPrompt: (hint) => buildNutritionPrompt(planOb, 1, void 0, userCtx, hint),
          callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
        });
        schedule = gen.week;
        rawLast = gen.rawLast;
        retries = gen.retries;
      } else {
        let aiAttempt = 0;
        const gen = await generateCoachWorkoutWeekWithPipeline({
          buildPrompt: (hint) => buildWorkoutPrompt(
            planOb,
            1,
            void 0,
            isPartialWeek ? targetDayName : void 0,
            userCtx,
            hint,
            exerciseCatalog,
            uiLocale
          ),
          callAi: async (msgs) => {
            aiAttempt += 1;
            await setCoachGenerationPhase(
              plan.id,
              aiAttempt > 1 ? `ai:${aiAttempt}` : "ai"
            );
            const aiT = Date.now();
            const raw = await callCoachAi(msgs, "coach_workout");
            console.log(
              `[coach-gen] plan=${plan.id} ai attempt=${aiAttempt}/${maxCoachWorkoutRetries} ms=${Date.now() - aiT} rawChars=${raw.length}`
            );
            return raw;
          },
          constraints,
          normalizeEnvelope: normalizeCoachWorkoutEnvelope,
          maxRetries: maxCoachWorkoutRetries,
          ...coachPipelinePostArgs(userCtx, ob)
        });
        const keyedWeek = await finalizeCoachWeekWithExerciseDb(gen.week, uiLocale);
        schedule = {
          ...finalizeCoachWorkoutWeek(keyedWeek, {
            partialFirstActiveDay: isPartialWeek ? targetDayName : void 0
          }),
          contentLocale: uiLocale
        };
        rawLast = gen.rawLast;
        retries = gen.retries;
      }
      await setCoachGenerationPhase(plan.id, "validation");
      await setCoachGenerationPhase(plan.id, "saving");
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET start_date=$2, schedule=$3",
        [plan.id, startDateStr, JSON.stringify(schedule)]
      );
      await logCoachAiRun(pool, {
        userId,
        planId: plan.id,
        weekNumber: 1,
        endpoint: "POST /api/coach/plans (async)",
        inputSummary: { type, discipline },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null
      });
      await pool.query(
        "UPDATE coach_plans SET generation_status='ready', generation_error=NULL, generation_phase='ready', updated_at=NOW() WHERE id=$1",
        [plan.id]
      );
      console.log(
        `[coach-gen] plan=${plan.id} ready totalMs=${Date.now() - t0} aiRetries=${retries}`
      );
    } catch (e) {
      const latencyMs = Date.now() - t0;
      const cErr = e instanceof CoachGenerationError ? e : null;
      const errMsg = cErr != null ? formatCoachGenerationErrorMessage(cErr) : e instanceof Error ? e.message : String(e);
      await logCoachAiRun(pool, {
        userId,
        planId: plan.id,
        weekNumber: 1,
        endpoint: "POST /api/coach/plans (async)",
        inputSummary: { type, discipline },
        rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
        zodOk: false,
        constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
        retries: 5,
        latencyMs,
        finalScheduleHash: null,
        errorMessage: errMsg
      });
      await pool.query(
        "UPDATE coach_plans SET generation_status='failed', generation_error=$2, generation_phase='failed', updated_at=NOW() WHERE id=$1",
        [plan.id, errMsg.slice(0, 2e3)]
      );
      console.error("coach/plans async generation failed:", e);
    }
  };
  app.post("/api/coach/plans", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { type, discipline, planMode, eventName, eventDate, eventDistance, onboardingData } = req.body;
      const planResult = await pool.query(
        `INSERT INTO coach_plans (user_id,type,discipline,plan_mode,event_name,event_date,event_distance,onboarding_data,generation_status,coach_plan_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9) RETURNING *`,
        [req.userId, type, discipline, planMode, eventName, eventDate || null, eventDistance, JSON.stringify(onboardingData), JSON.stringify(DEFAULT_COACH_PLAN_STATE)]
      );
      const plan = planResult.rows[0];
      const today = /* @__PURE__ */ new Date();
      let targetDate = new Date(today);
      if (onboardingData?.startDate === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (onboardingData?.startDate === "next_monday") {
        const daysUntilMonday = (8 - targetDate.getDay()) % 7;
        targetDate.setDate(targetDate.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      }
      const DAY_NAMES2 = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDayName = DAY_NAMES2[targetDate.getDay()];
      const actualWeekMonday = calendarWeekMonday(targetDate);
      const isPartialWeek = targetDayName !== "Monday";
      const startDateStr = toLocalYmd(actualWeekMonday);
      await pool.query(
        "UPDATE coach_plans SET generation_phase='queued', updated_at=NOW() WHERE id=$1",
        [plan.id]
      );
      void runCoachFirstWeekGeneration({
        userId: req.userId,
        plan,
        type,
        discipline,
        startDateStr,
        isPartialWeek,
        targetDayName
      });
      res.status(202).json({ planId: plan.id, status: "generating", phase: "queued" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create plan";
      console.error("coach/plans POST error:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.patch("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const { status } = req.body;
    await pool.query(
      "UPDATE coach_plans SET status=$2, updated_at=NOW() WHERE id=$1 AND user_id=$3",
      [req.params.id, status, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/coach/plans/:id", requireAuth, async (req, res) => {
    try {
      const check = await pool.query(
        "SELECT status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!check.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (check.rows[0].status !== "cancelled") {
        res.status(400).json({ error: "Only cancelled plans can be deleted. Cancel the plan first." });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/regenerate", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query(
        "SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const onboardingData = parseCoachOnboarding(plan.onboarding_data);
      const type = String(plan.type || "workout");
      const discipline = String(plan.discipline || "strength");
      const requestedStartDate = req.body?.startDate;
      if (requestedStartDate === "today" || requestedStartDate === "tomorrow" || requestedStartDate === "next_monday") {
        onboardingData.startDate = requestedStartDate;
      }
      const today = /* @__PURE__ */ new Date();
      const targetDate = new Date(today);
      if (onboardingData?.startDate === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (onboardingData?.startDate === "next_monday") {
        const daysUntilMonday = (8 - targetDate.getDay()) % 7;
        targetDate.setDate(targetDate.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      }
      const DAY_NAMES2 = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDayName = DAY_NAMES2[targetDate.getDay()];
      const actualWeekMonday = calendarWeekMonday(targetDate);
      const isPartialWeek = targetDayName !== "Monday";
      const startDateStr = toLocalYmd(actualWeekMonday);
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [plan.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [plan.id]);
      await pool.query(
        "UPDATE coach_plans SET current_week=1, generation_status='generating', generation_error=NULL, generation_phase='queued', onboarding_data=$2, updated_at=NOW() WHERE id=$1",
        [plan.id, JSON.stringify(onboardingData)]
      );
      void runCoachFirstWeekGeneration({
        userId: req.userId,
        plan: { ...plan, onboarding_data: onboardingData },
        type,
        discipline,
        startDateStr,
        isPartialWeek,
        targetDayName
      });
      res.status(202).json({ planId: plan.id, status: "generating", phase: "queued" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate plan";
      console.error("coach/plans regenerate error:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/coach/plans/:id/next-week", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const nextWeek = plan.current_week + 1;
      const uiLocale = await getUserUiLocale(req.userId);
      const prevSchedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      const prevRow = prevSchedResult.rows[0];
      const prevStart = prevRow?.start_date != null ? String(
        prevRow.start_date instanceof Date ? prevRow.start_date.toISOString().split("T")[0] : prevRow.start_date
      ).split("T")[0] : null;
      const nextStartYmd = prevStart ? addDaysYmd(prevStart, 7) : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let lastReport = void 0;
      const rep = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      if (rep.rows.length) lastReport = rep.rows[0].report;
      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId,
        plan,
        scheduleWindow: { startYmd: nextStartYmd }
      });
      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data;
      const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: nextWeek });
      let schedule;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, lastReport, userCtx, hint),
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
          const priorSched = await pool.query(
            `SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2`,
            [plan.id, nextWeek - 1]
          );
          const priorKeys = extractPriorExerciseKeysFromScheduleJson(priorSched.rows[0]?.schedule);
          userCtx.prior_week_exercise_keys = priorKeys;
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => buildWorkoutPrompt(plan, nextWeek, lastReport, void 0, userCtx, hint, exerciseCatalog, uiLocale),
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope,
            ...coachPipelinePostArgs(userCtx, ob, priorKeys)
          });
          const keyedWeek = await finalizeCoachWeekWithExerciseDb(gen.week, uiLocale);
          schedule = { ...finalizeCoachWorkoutWeek(keyedWeek), contentLocale: uiLocale };
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: nextWeek,
          endpoint: "POST /api/coach/plans/:id/next-week",
          inputSummary: { nextWeek, nextStartYmd },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e)
        });
        console.error("next-week error:", e);
        res.status(500).json({ error: e.message || "Failed to generate next week" });
        return;
      }
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
        [plan.id, nextWeek, nextStartYmd, JSON.stringify(schedule)]
      );
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [plan.id, nextWeek]);
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: nextWeek,
        endpoint: "POST /api/coach/plans/:id/next-week",
        inputSummary: { nextWeek, nextStartYmd },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null
      });
      res.json({ weekNumber: nextWeek, schedule });
    } catch (err) {
      console.error("next-week error:", err);
      res.status(500).json({ error: err.message || "Failed to generate next week" });
    }
  });
  app.get("/api/coach/plans/:id/week-facts", requireAuth, async (req, res) => {
    try {
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const wk = Math.max(
        1,
        parseInt(String(req.query.weekNumber ?? plan.current_week), 10) || plan.current_week
      );
      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId]
      );
      const u = userRow.rows[0] || {};
      const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog
      };
      const result = await loadWeekFactsSnapshot({
        pool,
        plan,
        weekNumber: wk,
        userId: req.userId,
        profile,
        onboarding: parseCoachOnboarding(plan.onboarding_data)
      });
      if (!result) {
        res.status(404).json({ error: "No schedule for week" });
        return;
      }
      res.json({ weekNumber: wk, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to load week facts" });
    }
  });
  app.post("/api/coach/plans/:id/weekly-report", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const uiLocale = await getUserUiLocale(req.userId);
      const reportWeek = Math.max(
        1,
        parseInt(String(req.body?.weekNumber ?? plan.current_week), 10) || plan.current_week
      );
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, reportWeek]
      );
      const schedule = schedResult.rows[0];
      if (!schedule) {
        res.status(400).json({ error: "No schedule for current week" });
        return;
      }
      const prevReportResult = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, reportWeek - 1]
      );
      const prevReport = prevReportResult.rows[0]?.report ?? null;
      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId]
      );
      const u = userRow.rows[0] || {};
      const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog
      };
      const { report, rawLast, retries } = await generateCoachWeeklyReport({
        pool,
        plan,
        weekNumber: reportWeek,
        scheduleRow: {
          schedule: schedule.schedule,
          start_date: schedule.start_date
        },
        userId: req.userId,
        profile,
        onboarding: parseCoachOnboarding(plan.onboarding_data),
        prevReport,
        uiLocale,
        callAi: (msgs) => callCoachAiForPlan(plan, msgs),
        outputLanguage: coachOutputLanguageForLocale(uiLocale)
      });
      const z8 = weeklyReportSchema.safeParse(report);
      if (!z8.success) {
        res.status(500).json({ error: "Report validation failed" });
        return;
      }
      await pool.query(
        "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
        [plan.id, reportWeek, JSON.stringify(report)]
      );
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: reportWeek,
        endpoint: "POST /api/coach/plans/:id/weekly-report",
        inputSummary: { coachV2: true },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(report),
        errorMessage: null
      });
      res.json(report);
    } catch (err) {
      console.error("weekly-report error:", err);
      res.status(500).json({ error: err.message || "Failed to generate report" });
    }
  });
  const coachE2eMockEnabled = () => process.env.COACH_E2E_MOCK === "1";
  app.post("/api/coach/plans/:id/refine-schedule", requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const { previousValid, userRefinement, weekNumber, refineScope, day } = req.body;
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const wk = Math.max(1, parseInt(String(weekNumber ?? plan.current_week), 10) || plan.current_week);
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, wk]
      );
      const schedRow = schedResult.rows[0];
      const startYmd = schedRow?.start_date != null ? String(
        schedRow.start_date instanceof Date ? schedRow.start_date.toISOString().split("T")[0] : schedRow.start_date
      ).split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      if (coachE2eMockEnabled()) {
        const schedule2 = typeof previousValid === "object" && previousValid != null ? { ...previousValid } : { schedule: [] };
        const note = `[E2E refine] ${userRefinement.trim()}`;
        schedule2.coachNotes = schedule2.coachNotes ? `${String(schedule2.coachNotes)}
${note}` : note;
        await pool.query("UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2", [
          req.params.id,
          wk,
          JSON.stringify(schedule2)
        ]);
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: wk,
          endpoint: "POST /api/coach/plans/:id/refine-schedule",
          inputSummary: { userRefinement, e2eMock: true },
          rawResponse: null,
          zodOk: true,
          constraintsOk: true,
          retries: 0,
          latencyMs: Date.now() - t0,
          finalScheduleHash: coachPayloadHash(schedule2),
          errorMessage: null,
          refinementRound: 1
        });
        res.json({ weekNumber: wk, schedule: schedule2, e2eMock: true });
        return;
      }
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId,
        plan,
        scheduleWindow: { startYmd }
      });
      const uiLocale = await getUserUiLocale(req.userId);
      const baseJson = JSON.stringify(previousValid, null, 2);
      const refinementIntro = `You are editing an ALREADY VALID ${plan.type} week JSON. Make the MINIMAL changes required to satisfy the athlete request. Keep the same top-level schema keys. Output ONLY valid JSON.

OUTPUT LANGUAGE (MANDATORY): ${coachOutputLanguageForLocale(uiLocale)}. Write all user-facing string values in this language. Keep structural enum tokens (day names, sessionType, setType, recommendation codes) in English as in the schema.

ATHLETE REQUEST:
${userRefinement.trim()}
${refineScope === "single_day" && day ? `
SCOPE: Change ONLY the day "${day}" unless the request explicitly needs other days.` : ""}

CURRENT VALID JSON:
${baseJson}

USER_CONTEXT_JSON:
${JSON.stringify(userCtx, null, 2)}
`;
      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data;
      const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: wk });
      let schedule;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}
${hint ? `REPAIR:
${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}
${hint ? `REPAIR:
${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope,
            ...coachPipelinePostArgs(userCtx, ob)
          });
          schedule = await finalizeCoachWeekWithExerciseDb(gen.week, uiLocale);
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId,
          planId: plan.id,
          weekNumber: wk,
          endpoint: "POST /api/coach/plans/:id/refine-schedule",
          inputSummary: { userRefinement },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 12e4) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e),
          refinementRound: 1
        });
        res.status(500).json({ error: e?.message || "Refine failed" });
        return;
      }
      await pool.query("UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2", [
        req.params.id,
        wk,
        JSON.stringify(schedule)
      ]);
      await logCoachAiRun(pool, {
        userId: req.userId,
        planId: plan.id,
        weekNumber: wk,
        endpoint: "POST /api/coach/plans/:id/refine-schedule",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 12e4),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null,
        refinementRound: 1
      });
      res.json({ weekNumber: wk, schedule });
    } catch (err) {
      console.error("refine-schedule error:", err);
      res.status(500).json({ error: err.message || "Failed to refine" });
    }
  });
  app.patch("/api/coach/plans/:id/session-links", requireAuth, async (req, res) => {
    try {
      const { links } = req.body;
      if (!Array.isArray(links) || links.length === 0) {
        res.status(400).json({ error: "links array required" });
        return;
      }
      const planResult = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const state = await loadCoachPlanState(pool, req.params.id);
      const overrides = { ...state.sessionMatchOverrides ?? {} };
      for (const link of links) {
        const sk = String(link.sessionKey ?? "").trim();
        const wid = String(link.workoutId ?? "").trim();
        if (!sk || !wid) continue;
        const owned = await pool.query(
          "SELECT id FROM workouts WHERE id=$1 AND user_id=$2",
          [wid, req.userId]
        );
        if (!owned.rows.length) continue;
        overrides[sk] = wid;
      }
      await saveCoachPlanState(pool, req.params.id, { ...state, sessionMatchOverrides: overrides });
      const planRow = await pool.query("SELECT * FROM coach_plans WHERE id=$1", [req.params.id]);
      const plan = planRow.rows[0];
      const wk = Math.max(1, parseInt(String(req.body?.weekNumber ?? plan?.current_week ?? 1), 10) || 1);
      let snapshot = null;
      if (plan) {
        const userRow = await pool.query(
          "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
          [req.userId]
        );
        const u = userRow.rows[0] || {};
        const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
        const factsResult = await loadWeekFactsSnapshot({
          pool,
          plan,
          weekNumber: wk,
          userId: req.userId,
          profile: { goals: u.goals || { dailyCalories: 2400 }, measurements: u.measurements, dailyActivityLog: pe.dailyActivityLog },
          onboarding: parseCoachOnboarding(plan.onboarding_data)
        });
        snapshot = factsResult?.snapshot ?? null;
      }
      res.json({ ok: true, sessionMatchOverrides: overrides, factsSnapshot: snapshot, weekNumber: wk });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to save session links" });
    }
  });
  app.post("/api/coach/plans/:id/session-feedback", requireAuth, async (req, res) => {
    try {
      const { sessionKey, rating } = req.body;
      const sk = String(sessionKey ?? "").trim();
      const r = String(rating ?? "").toLowerCase();
      if (!sk || !["easy", "ok", "hard"].includes(r)) {
        res.status(400).json({ error: "sessionKey and rating (easy|ok|hard) required" });
        return;
      }
      const planResult = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const state = await loadCoachPlanState(pool, req.params.id);
      const entry = { sessionKey: sk, rating: r, at: (/* @__PURE__ */ new Date()).toISOString() };
      const sessionFeedback = [...(state.sessionFeedback ?? []).slice(-24), entry];
      await saveCoachPlanState(pool, req.params.id, { ...state, sessionFeedback });
      const planRow = await pool.query("SELECT * FROM coach_plans WHERE id=$1", [req.params.id]);
      const plan = planRow.rows[0];
      const wk = plan?.current_week ?? 1;
      let factsSnapshot = null;
      if (plan) {
        const userRow = await pool.query(
          "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
          [req.userId]
        );
        const u = userRow.rows[0] || {};
        const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
        const factsResult = await loadWeekFactsSnapshot({
          pool,
          plan,
          weekNumber: wk,
          userId: req.userId,
          profile: { goals: u.goals || { dailyCalories: 2400 }, measurements: u.measurements, dailyActivityLog: pe.dailyActivityLog },
          onboarding: parseCoachOnboarding(plan.onboarding_data)
        });
        factsSnapshot = factsResult?.snapshot ?? null;
      }
      res.json({ ok: true, factsSnapshot, weekNumber: wk });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to save feedback" });
    }
  });
  app.patch("/api/coach/plans/:id/schedules/:weekNum/swap-exercise", requireAuth, async (req, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId
      ]);
      if (!planCheck.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const weekNum = parseInt(req.params.weekNum, 10);
      const { day, exerciseIndex, exerciseKey, name } = req.body;
      if (!day?.trim() || typeof exerciseIndex !== "number" || exerciseIndex < 0) {
        res.status(400).json({ error: "day and exerciseIndex required" });
        return;
      }
      if (!exerciseKey?.trim() || !name?.trim()) {
        res.status(400).json({ error: "exerciseKey and name required" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, weekNum]
      );
      if (!schedResult.rows.length) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const existing = schedResult.rows[0].schedule;
      const days = Array.isArray(existing?.schedule) ? existing.schedule : [];
      const dayRow = days.find((d) => String(d.day || "") === day);
      if (!dayRow?.exercises?.length || exerciseIndex >= dayRow.exercises.length) {
        res.status(400).json({ error: "Exercise not found" });
        return;
      }
      const ex = dayRow.exercises[exerciseIndex];
      dayRow.exercises[exerciseIndex] = {
        ...ex,
        exerciseKey: exerciseKey.trim(),
        name: name.trim()
      };
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, weekNum, JSON.stringify(existing)]
      );
      res.json({ ok: true, schedule: existing });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to swap exercise";
      res.status(500).json({ error: msg });
    }
  });
  app.patch("/api/coach/plans/:id/schedules/:weekNum/reorder", requireAuth, async (req, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planCheck.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum)]
      );
      if (!schedResult.rows.length) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const { days } = req.body;
      const existing = schedResult.rows[0].schedule;
      const updated = { ...existing, schedule: days };
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum), JSON.stringify(updated)]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/auto-advance", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planId = String(req.params.id ?? "");
      const userId = req.userId;
      const uiLocale = await getUserUiLocale(userId);
      let weeksAdvanced = 0;
      let weeklyReportGenerated = false;
      let lastReport = null;
      let finalNewWeek = 0;
      let stopReason;
      for (let guard = 0; guard < 12; guard++) {
        const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [planId, userId]);
        if (!planResult.rows.length) {
          if (weeksAdvanced === 0) res.status(404).json({ error: "Not found" });
          break;
        }
        const plan = planResult.rows[0];
        finalNewWeek = Number(plan.current_week) || 1;
        if (plan.status !== "active") {
          stopReason = "Plan not active";
          if (weeksAdvanced === 0) {
            res.json({ advanced: false, reason: stopReason });
            return;
          }
          break;
        }
        const schedResult = await pool.query(
          "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
          [planId, plan.current_week]
        );
        if (!schedResult.rows.length) {
          stopReason = "No current schedule";
          if (weeksAdvanced === 0) {
            res.json({ advanced: false, reason: stopReason });
            return;
          }
          break;
        }
        const currentSched = schedResult.rows[0];
        const startYmd = currentSched.start_date != null ? String(
          currentSched.start_date instanceof Date ? currentSched.start_date.toISOString().split("T")[0] : currentSched.start_date
        ).split("T")[0] : toLocalYmd(/* @__PURE__ */ new Date());
        const lastDayYmd = coachWeekInclusiveEnd(startYmd);
        const todayYmd = toLocalYmd(/* @__PURE__ */ new Date());
        if (todayYmd <= lastDayYmd) {
          stopReason = "Current week still active";
          if (weeksAdvanced === 0) {
            const ms = parseLocalYmd(lastDayYmd).getTime() - parseLocalYmd(todayYmd).getTime();
            const daysLeft = Math.max(1, Math.ceil(ms / 864e5) + 1);
            res.json({ advanced: false, reason: stopReason, daysLeft });
            return;
          }
          break;
        }
        let report;
        const existingReport = await pool.query(
          "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
          [planId, plan.current_week]
        );
        if (existingReport.rows.length) {
          report = existingReport.rows[0].report;
        } else {
          const endYmd = coachWeekInclusiveEnd(startYmd);
          const prevReportResult = await pool.query(
            "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
            [planId, plan.current_week - 1]
          );
          const prevReport = prevReportResult.rows[0]?.report ?? null;
          const userRow = await pool.query(
            "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
            [userId]
          );
          const u = userRow.rows[0] || {};
          const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
          const profile = {
            goals: u.goals || { dailyCalories: 2400 },
            measurements: u.measurements,
            dailyActivityLog: pe.dailyActivityLog
          };
          const gen = await generateCoachWeeklyReport({
            pool,
            plan,
            scheduleRow: {
              schedule: currentSched.schedule,
              start_date: currentSched.start_date
            },
            userId,
            profile,
            onboarding: parseCoachOnboarding(plan.onboarding_data),
            prevReport,
            uiLocale,
            callAi: (msgs) => callCoachAiForPlan(plan, msgs),
            outputLanguage: coachOutputLanguageForLocale(uiLocale)
          });
          report = gen.report;
          await pool.query(
            "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
            [planId, plan.current_week, JSON.stringify(report)]
          );
          weeklyReportGenerated = true;
        }
        const nextWeek = plan.current_week + 1;
        const existingNext = await pool.query(
          "SELECT week_number FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
          [planId, nextWeek]
        );
        if (!existingNext.rows.length) {
          const nextStartYmd = addDaysYmd(startYmd, 7);
          const userCtx = await buildUserContextForCoach({
            pool,
            userId,
            plan,
            scheduleWindow: { startYmd: nextStartYmd }
          });
          plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
          const ob = plan.onboarding_data;
          const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: nextWeek });
          let nextSchedule;
          if (plan.type === "nutrition") {
            const gen = await generateCoachNutritionWeekWithPipeline({
              buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, report, userCtx, hint),
              callAi: (msgs) => callCoachAi(msgs, "coach_nutrition")
            });
            nextSchedule = gen.week;
          } else {
            const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
            const priorSched = await pool.query(
              `SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2`,
              [planId, nextWeek - 1]
            );
            const priorKeys = extractPriorExerciseKeysFromScheduleJson(priorSched.rows[0]?.schedule);
            userCtx.prior_week_exercise_keys = priorKeys;
            const gen = await generateCoachWorkoutWeekWithPipeline({
              buildPrompt: (hint) => buildWorkoutPrompt(plan, nextWeek, report, void 0, userCtx, hint, exerciseCatalog, uiLocale),
              callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
              constraints,
              normalizeEnvelope: normalizeCoachWorkoutEnvelope,
              ...coachPipelinePostArgs(userCtx, ob, priorKeys)
            });
            nextSchedule = await finalizeCoachWeekWithExerciseDb(gen.week, uiLocale);
          }
          await pool.query(
            "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET start_date=$3, schedule=$4",
            [planId, nextWeek, nextStartYmd, JSON.stringify(nextSchedule)]
          );
        }
        await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [planId, nextWeek]);
        weeksAdvanced += 1;
        lastReport = report;
        finalNewWeek = nextWeek;
      }
      if (weeksAdvanced === 0) {
        if (!stopReason) stopReason = "Current week still active";
        res.json({ advanced: false, reason: stopReason });
        return;
      }
      res.json({
        advanced: true,
        newWeek: finalNewWeek,
        report: lastReport,
        weeklyReportGenerated,
        weeksAdvanced
      });
    } catch (err) {
      console.error("auto-advance error:", err);
      res.status(500).json({ error: err.message || "Failed to auto-advance" });
    }
  });
  app.get("/api/coach/latest-report", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id, p.current_week
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1 AND p.status='active'
         ORDER BY r.generated_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!result.rows.length) {
        res.json(null);
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/coach/dashboard-summary", requireAuth, async (req, res) => {
    try {
      const planResult = await pool.query(
        `SELECT * FROM coach_plans WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!planResult.rows.length) {
        res.json(null);
        return;
      }
      const plan = planResult.rows[0];
      const weekNumber = plan.current_week;
      const reportResult = await pool.query(
        `SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2`,
        [plan.id, weekNumber]
      );
      const report = reportResult.rows[0]?.report ?? null;
      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId]
      );
      const u = userRow.rows[0] || {};
      const pe = typeof u.profile_extras === "string" ? JSON.parse(u.profile_extras || "{}") : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog
      };
      const factsResult = await loadWeekFactsSnapshot({
        pool,
        plan,
        weekNumber,
        userId: req.userId,
        profile,
        onboarding: parseCoachOnboarding(plan.onboarding_data)
      });
      const summary = buildCoachDashboardSummary({
        planId: plan.id,
        planType: plan.type,
        weekNumber,
        report,
        liveSnapshot: factsResult?.snapshot ?? null
      });
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to load dashboard summary" });
    }
  });
  async function loadUserWeeklyReportRow(userId, weekKey) {
    const r = await pool.query(
      `SELECT * FROM user_weekly_reports WHERE user_id=$1 AND week_key=$2`,
      [userId, weekKey]
    );
    return r.rows[0] ?? null;
  }
  const USER_WEEKLY_REPORT_CATCHUP_WEEKS = 12;
  const USER_WEEKLY_REPORT_MAX_PER_ENSURE = 3;
  async function generateUserWeeklyReportForWeek(userId, weekStartYmd, weekEndYmd, weekKey, profile, allWorkouts, allNutrition, coachPlans, uiLocale) {
    const facts = buildUserWeekFacts({
      weekStartYmd,
      weekEndYmd,
      locale: uiLocale,
      profile,
      allWorkouts,
      allNutrition,
      coachPlans
    });
    const aiEnabled = resolveAiCapabilities().enabled;
    const gen = await generateUserWeeklyReport({
      facts,
      outputLanguage: coachOutputLanguageForLocale(uiLocale),
      callAi: aiEnabled ? (msgs) => callCoachAi(msgs, "coach_workout") : void 0
    });
    const z8 = userWeeklyReportSchema.safeParse(gen.report);
    if (!z8.success) throw new Error("Report validation failed");
    const ins = await pool.query(
      `INSERT INTO user_weekly_reports (user_id, week_key, week_start, week_end, report, facts, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        userId,
        weekKey,
        weekStartYmd,
        weekEndYmd,
        JSON.stringify(z8.data),
        JSON.stringify(facts),
        gen.source
      ]
    );
    return ins.rows[0];
  }
  app.post("/api/user-weekly-reports/ensure", requireAuth, async (req, res) => {
    try {
      if (!canGenerateLastWeekReport()) {
        res.json({ ok: true, generated: false, generatedCount: 0, reason: "current_week_not_finished" });
        return;
      }
      const uiLocale = await getUserUiLocale(req.userId);
      const [userRes, workoutsRes, nutritionRes, plansRes] = await Promise.all([
        pool.query("SELECT * FROM users WHERE id=$1", [req.userId]),
        pool.query("SELECT * FROM workouts WHERE user_id=$1", [req.userId]),
        pool.query("SELECT * FROM nutrition WHERE user_id=$1", [req.userId]),
        pool.query("SELECT id, status, discipline, type FROM coach_plans WHERE user_id=$1", [req.userId])
      ]);
      if (!userRes.rows.length) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const profile = mapUser(userRes.rows[0]);
      const allWorkouts = workoutsRes.rows.map(mapWorkout);
      const allNutrition = nutritionRes.rows.map(mapNutrition);
      const coachPlans = plansRes.rows;
      let generatedCount = 0;
      let latestRow = null;
      for (let weeksAgo = 0; weeksAgo < USER_WEEKLY_REPORT_CATCHUP_WEEKS; weeksAgo++) {
        if (generatedCount >= USER_WEEKLY_REPORT_MAX_PER_ENSURE) break;
        const { weekStartYmd, weekEndYmd, weekKey } = getCompletedWeekRangeAtOffset(weeksAgo);
        const existing = await loadUserWeeklyReportRow(req.userId, weekKey);
        if (existing) {
          if (weeksAgo === 0) latestRow = existing;
          continue;
        }
        const row = await generateUserWeeklyReportForWeek(
          req.userId,
          weekStartYmd,
          weekEndYmd,
          weekKey,
          profile,
          allWorkouts,
          allNutrition,
          coachPlans,
          uiLocale
        );
        generatedCount++;
        if (weeksAgo === 0) latestRow = row;
      }
      if (!latestRow) {
        const { weekKey } = getLastCompletedWeekRange();
        latestRow = await loadUserWeeklyReportRow(req.userId, weekKey);
      }
      res.json({
        ok: true,
        generated: generatedCount > 0,
        generatedCount,
        report: latestRow ?? void 0
      });
    } catch (err) {
      console.error("user-weekly-reports/ensure:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "ensure failed" });
    }
  });
  app.get("/api/user-weekly-reports/latest", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE user_id=$1 ORDER BY week_start DESC LIMIT 1`,
        [req.userId]
      );
      if (!result.rows.length) {
        res.json(null);
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });
  app.get("/api/user-weekly-reports", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE user_id=$1 ORDER BY week_start DESC LIMIT 24`,
        [req.userId]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });
  app.get("/api/user-weekly-reports/:id", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.userId]
      );
      if (!result.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });
  app.get("/api/coach/reports", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1
         ORDER BY r.generated_at DESC`,
        [req.userId]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/admin/ai-config", requireAdmin, (_req, res) => {
    const caps = resolveAiCapabilities();
    const mistralMasked = maskSecret(process.env.MISTRAL_API_KEY);
    const geminiMasked = maskSecret(process.env.GEMINI_API_KEY);
    const deepseekMasked = maskSecret(process.env.DEEPSEEK_API_KEY);
    const models = getAllAiModels();
    res.json({
      active: caps.provider,
      ollamaConfigured: caps.ollamaConfigured,
      geminiConfigured: caps.geminiConfigured,
      mistralConfigured: caps.mistralConfigured,
      deepseekConfigured: caps.deepseekConfigured,
      ollama: {
        baseUrl: getOllamaBaseUrl(),
        model: getLocalLlmModel(),
        configured: caps.ollamaConfigured
      },
      keys: {
        deepseek: { configured: caps.deepseekConfigured, masked: deepseekMasked },
        mistral: { configured: caps.mistralConfigured, masked: mistralMasked },
        gemini: { configured: caps.geminiConfigured, masked: geminiMasked }
      },
      models,
      recommendations: AI_MODEL_RECOMMENDATIONS,
      areas: AI_MODEL_AREAS.map((id) => {
        return {
          id,
          label: AI_MODEL_AREA_LABELS[id],
          recommended: {
            ollama: AI_MODEL_RECOMMENDATIONS.ollama[id],
            deepseek: AI_MODEL_RECOMMENDATIONS.deepseek[id],
            mistral: AI_MODEL_RECOMMENDATIONS.mistral[id],
            gemini: AI_MODEL_RECOMMENDATIONS.gemini[id]
          },
          options: {
            ollama: getModelSelectOptions("ollama", id, models.ollama[id]),
            deepseek: getModelSelectOptions("deepseek", id, models.deepseek[id]),
            mistral: getModelSelectOptions("mistral", id, models.mistral[id]),
            gemini: getModelSelectOptions("gemini", id, models.gemini[id])
          }
        };
      })
    });
  });
  app.get("/api/admin/ollama/test", requireAdmin, async (_req, res) => {
    const result = await testOllamaConnection();
    if (result.ok) res.json(result);
    else res.status(400).json(result);
  });
  app.post("/api/admin/ollama/pull", requireAdmin, async (req, res) => {
    const { model } = req.body;
    const targetModel = model?.trim() || getLocalLlmModel();
    const result = await pullOllamaModel(targetModel);
    if (result.ok) res.json({ ok: true, model: targetModel });
    else res.status(400).json({ ok: false, error: result.error || "Pull fehlgeschlagen" });
  });
  app.post("/api/admin/ai-config", requireAdmin, async (req, res) => {
    const { provider } = req.body;
    if (provider !== "ollama" && provider !== "deepseek" && provider !== "gemini" && provider !== "mistral") {
      res.status(400).json({ ok: false, error: "Ung\xFCltiger Provider (ollama|deepseek|mistral|gemini)" });
      return;
    }
    const capsBefore = resolveAiCapabilities();
    const previousOverride = getActiveProviderOverride();
    const previousActive = previousOverride ?? (capsBefore.provider !== "none" ? capsBefore.provider : null);
    setActiveProviderOverride(provider);
    const test = provider === "ollama" ? await testOllamaConnection() : provider === "deepseek" ? await testDeepSeekApiKey(process.env.DEEPSEEK_API_KEY ?? "") : provider === "mistral" ? await testMistralApiKey(process.env.MISTRAL_API_KEY ?? "") : await testGeminiApiKey(process.env.GEMINI_API_KEY ?? "");
    if (!test.ok) {
      setActiveProviderOverride(previousOverride);
      const capsAfter = resolveAiCapabilities();
      res.status(400).json({
        ok: false,
        error: "error" in test ? test.error : "KI-Test fehlgeschlagen",
        active: capsAfter.provider !== "none" ? capsAfter.provider : previousActive,
        reverted: true
      });
      return;
    }
    try {
      upsertEnvVar("AI_ACTIVE_PROVIDER", provider);
      reloadEnvFromFile();
      syncActiveProviderFromEnv();
    } catch (e) {
      setActiveProviderOverride(previousOverride);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        reverted: true
      });
      return;
    }
    res.json({ ok: true, active: provider, tested: true });
  });
  app.post("/api/admin/ai-keys/test", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!apiKey?.trim() || provider !== "deepseek" && provider !== "mistral" && provider !== "gemini") {
      res.status(400).json({ ok: false, error: "provider (deepseek|mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const result = provider === "deepseek" ? await testDeepSeekApiKey(apiKey) : provider === "mistral" ? await testMistralApiKey(apiKey) : await testGeminiApiKey(apiKey);
    if (result.ok) res.json({ ok: true, provider });
    else res.status(400).json({ ok: false, error: "error" in result ? result.error : "Unbekannter Fehler" });
  });
  app.post("/api/admin/ai-keys", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!apiKey?.trim() || provider !== "deepseek" && provider !== "mistral" && provider !== "gemini") {
      res.status(400).json({ ok: false, error: "provider (deepseek|mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const test = provider === "deepseek" ? await testDeepSeekApiKey(apiKey) : provider === "mistral" ? await testMistralApiKey(apiKey) : await testGeminiApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: "error" in test ? test.error : "Unbekannter Fehler" });
      return;
    }
    const envKey2 = provider === "deepseek" ? "DEEPSEEK_API_KEY" : provider === "mistral" ? "MISTRAL_API_KEY" : "GEMINI_API_KEY";
    try {
      upsertEnvVar(envKey2, apiKey.trim());
      reloadEnvFromFile();
      const caps = resolveAiCapabilities();
      res.json({
        ok: true,
        provider,
        deepseekConfigured: caps.deepseekConfigured,
        geminiConfigured: caps.geminiConfigured,
        mistralConfigured: caps.mistralConfigured
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.get("/api/admin/exercisedb-key/status", requireAdmin, (_req, res) => {
    res.json(getExerciseDbEnvDiagnostics());
  });
  app.post("/api/admin/exercisedb-key/test", requireAdmin, async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const result = await testExerciseDbApiKey(apiKey);
    if (result.ok) res.json({ ok: true });
    else res.status(400).json({ ok: false, error: result.error ?? "Test fehlgeschlagen" });
  });
  app.post("/api/admin/exercisedb-key", requireAdmin, async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const test = await testExerciseDbApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: test.error ?? "Test fehlgeschlagen" });
      return;
    }
    try {
      upsertEnvVar("EXERCISEDB_RAPIDAPI_KEY", apiKey.trim());
      res.json({ ok: true, ...getExerciseDbEnvDiagnostics() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.put("/api/admin/ai-models", requireAdmin, (req, res) => {
    const { models } = req.body;
    if (!models || typeof models !== "object") {
      res.status(400).json({ ok: false, error: "models object required" });
      return;
    }
    try {
      for (const provider of ["ollama", "deepseek", "mistral", "gemini"]) {
        const areaMap = models[provider];
        if (!areaMap) continue;
        for (const area of AI_MODEL_AREAS) {
          const value = areaMap[area]?.trim();
          if (value) upsertEnvVar(`AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`, value);
        }
      }
      res.json({ ok: true, models: getAllAiModels() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) res.json({ ok: true });
    else res.status(401).json({ error: "Invalid credentials" });
  });
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, first_name, last_name, email,
              CASE WHEN password_hash IS NOT NULL THEN TRUE ELSE FALSE END AS has_password,
              is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  });
  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    const resolvedFirst = String(firstName ?? "").trim();
    const resolvedLast = String(lastName ?? "").trim();
    if (!validateNameParts(resolvedFirst, resolvedLast)) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    const displayName = buildDisplayName2(resolvedFirst, resolvedLast);
    if (password?.length) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5,
         password_hash=$6, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email, hash]
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email]
      );
    }
    res.json({ ok: true });
  });
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  });
  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ ok: false, error: "invalid-user-id" });
      return;
    }
    const now = Math.floor(Date.now() / 1e3);
    const row = await pool.query(
      `UPDATE users
       SET is_active=false,
           profile_extras=COALESCE(profile_extras, '{}'::jsonb) || jsonb_build_object('authInvalidBefore', $2),
           updated_at=NOW()
       WHERE id=$1
       RETURNING id, is_active`,
      [userId, now]
    );
    if (!row.rows.length) {
      res.status(404).json({ ok: false, error: "not-found" });
      return;
    }
    res.json({ ok: true, id: row.rows[0].id, isActive: row.rows[0].is_active });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path4.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path4.join(distPath, "index.html")));
  }
  const PORT = parseInt(process.env.PORT || "3000");
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} VRTX server \u2192 http://localhost:${PORT}`);
    console.log(`\u{1F510} Admin panel \u2192 http://localhost:${PORT}/admin`);
  });
}
startServer().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
