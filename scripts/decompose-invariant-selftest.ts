/**
 * Kleine Assertions für Zerlegen-Selbstreferenz-Filter (kein Jest/Vitest im Projekt).
 * Ausführen: npx tsx scripts/decompose-invariant-selftest.ts
 */
import type { Food } from "../src/lib/foodDatabase.ts";
import type { Ingredient } from "../src/types.ts";
import {
  dedupeDecomposedMealItemsByLabel,
  decomposeFoldKey,
  filterFoodPoolExcludingComposites,
  isSelfReferentialDecomposeRow,
  stripSelfReferentialDecomposeRows,
  stripSelfReferentialResolvedIngredients,
} from "../src/lib/mealAiShared.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const baseNutrients = { calories: 100, protein: 10, carbs: 10, fat: 5 };
const baseServing = [{ name: "100g", grams: 100 }];

const mkFood = (partial: Partial<Food> & Pick<Food, "id" | "name">): Food => ({
  category: "readymeal",
  nutrients: { ...baseNutrients },
  servings: baseServing,
  ...partial,
});

const compositeLeberkasSemmel: Food = mkFood({
  id: "u-combo-lks",
  name: "Leberkässemmel",
  compositeIngredients: [
    { name: "Fleischkäse", amount: 80, unit: "g", calories: 0, protein: 0, carbs: 0, fat: 0 },
    { name: "Semmel", amount: 1, unit: "stk", calories: 0, protein: 0, carbs: 0, fat: 0 },
  ],
});

const atomicFleischkaese: Food = mkFood({
  id: "static-fk",
  name: "Fleischkäse (Leberkaas)",
});

const pool: Food[] = [compositeLeberkasSemmel, atomicFleischkaese];

// --- decomposeFoldKey
assert(decomposeFoldKey("Leberkässemmel") === "leberkassemmel", "foldKey Umlaute");
assert(decomposeFoldKey("Leberkassemmel") === "leberkassemmel", "foldKey ohne Umlaut");

// --- Titel-Äquivalenz / Composite
assert(
  isSelfReferentialDecomposeRow("Leberkässemmel", { name: "Leberkässemmel", amount: 1, unit: "stk" }, pool),
  "exakter Listenname wie label → self-ref",
);
assert(
  isSelfReferentialDecomposeRow("Leberkässemmel", { name: "Leberkassemmel", amount: 1, unit: "stk" }, pool),
  "Tippfehler (ein Zeichen) → self-ref",
);
assert(
  !isSelfReferentialDecomposeRow(
    "Leberkässemmel",
    { name: "Fleischkäse (Leberkaas)", amount: 80, unit: "g" },
    pool,
  ),
  "Atom Fleischkäse unter Leberkässemmel → nicht self-ref",
);

const stripped = stripSelfReferentialDecomposeRows(
  "Leberkässemmel",
  [
    { name: "Leberkässemmel", amount: 1, unit: "stk" },
    { name: "Fleischkäse (Leberkaas)", amount: 80, unit: "g" },
  ],
  pool,
);
assert(stripped.length === 1 && stripped[0].name.includes("Fleischkäse"), "strip entfernt nur Kombi-Zeile");

// --- Dedupe Gruppen
const deduped = dedupeDecomposedMealItemsByLabel([
  { label: "Pommes ", parsed: [{ name: "Ketchup", amount: 10, unit: "g" }] },
  { label: "Pommes", parsed: [{ name: "Ketchup", amount: 5, unit: "g" }] },
]);
assert(deduped.length === 1 && deduped[0].label.trim() === "Pommes", "zwei gleiche labels → eine Gruppe");
assert(
  deduped[0].parsed.length === 1 && deduped[0].parsed[0].amount === 15,
  "gleiche Zutat+Einheit → Mengen addieren",
);

// --- filterFoodPoolExcludingComposites
const filtered = filterFoodPoolExcludingComposites(pool);
assert(filtered.length === 1 && filtered[0].id === "static-fk", "Composite aus Pool");

// --- stripSelfReferentialResolvedIngredients
const fakeIng: Ingredient[] = [
  {
    id: "u-combo-lks",
    name: "Leberkässemmel",
    amount: 1,
    unit: "stk",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
  {
    id: "static-fk",
    name: "Fleischkäse (Leberkaas)",
    amount: 1,
    unit: "stk",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
];
const ingSan = stripSelfReferentialResolvedIngredients("Leberkässemmel", fakeIng, pool);
assert(ingSan.length === 1 && ingSan[0].name.includes("Fleischkäse"), "Resolve-Stripp Composite-ID");

// eslint-disable-next-line no-console
console.log("decompose-invariant-selftest: OK");
