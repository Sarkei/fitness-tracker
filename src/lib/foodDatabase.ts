/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lebensmittel-Typen. Katalog nur über Open Food Facts (keine eingebettete Statik-DB).
 */

export interface Serving {
  name: string;
  grams: number;
}

/** OFF-Nährstoff-Ampel: low = gut (grün), moderate = mittel (gelb), high = ungünstig (rot). */
export type NutrientLevelGrade = 'low' | 'moderate' | 'high';

export interface OffNutritionGrades {
  nutriScore?: 'a' | 'b' | 'c' | 'd' | 'e';
  novaGroup?: number;
  levels?: {
    fat?: NutrientLevelGrade;
    sugars?: NutrientLevelGrade;
    salt?: NutrientLevelGrade;
    saturatedFat?: NutrientLevelGrade;
  };
}

/** Zutaten-Snapshot für Kombi-Lebensmittel (PostgreSQL); Referenzportion für Skalierung beim Loggen. */
export type CompositeIngredientLine = {
  id?: string;
  name: string;
  amount: number;
  unit: string;
  servingName?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrientSource?: 'database' | 'model_estimate';
};

export interface Food {
  id: string;
  name: string;
  brand?: string | null;
  category:
    | 'protein'
    | 'carbs'
    | 'fat'
    | 'fruit'
    | 'vegetable'
    | 'dairy'
    | 'sauce'
    | 'snack'
    | 'drink'
    | 'canned'
    | 'frozen'
    | 'fastfood'
    | 'readymeal'
    | 'bakery'
    | 'sweets'
    | 'spice'
    | 'breakfast';
  nutrients: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number | null;
  };
  servings: Serving[];
  compositeIngredients?: CompositeIngredientLine[];
  /** Nutri-Score / Nährstoff-Ampel (primär Open Food Facts). */
  offGrades?: OffNutritionGrades;
  /** Datenquelle im Katalog. */
  catalogSource?: 'openfoodfacts' | 'app';
}

/** Deaktiviert — Suche/Matching nur Open Food Facts (`off_*`). */
export const FOOD_DATABASE: Food[] = [];
