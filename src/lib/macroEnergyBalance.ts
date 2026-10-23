/**
 * Kohärenz zwischen kcal und Makros (Atwater: ~4 / 4 / 9 kcal pro g P / KH / F).
 */

const KJ_P = 4;
const KJ_C = 4;
const KJ_F = 9;

export function energyFromMacrosGrams(protein: number, carbs: number, fat: number): number {
  return KJ_P * protein + KJ_C * carbs + KJ_F * fat;
}

function round1(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

export type MacroSet = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Rundet Makros; gleicht kleine kcal-Drift über Fett aus (9 kcal/g). */
export function snapMacrosToCalories(protein: number, carbs: number, fat: number, targetCalories: number): MacroSet {
  const kcal = Math.max(0, Math.round(targetCalories));
  let p = round1(protein);
  let c = round1(carbs);
  let f = round1(fat);
  let e = energyFromMacrosGrams(p, c, f);
  let diff = kcal - e;
  if (Math.abs(diff) >= 0.25) {
    f = round1(Math.max(0, f + diff / KJ_F));
    e = energyFromMacrosGrams(p, c, f);
    diff = kcal - e;
    if (Math.abs(diff) >= 0.25) {
      c = round1(Math.max(0, c + diff / KJ_C));
    }
  }
  return {
    calories: kcal,
    protein: round1(p),
    carbs: round1(c),
    fat: round1(f),
  };
}

/**
 * Nur kcal geändert: Makros proportional skalieren (gleiche Verteilung).
 * Wenn aus den Makros keine Energie ableitbar ist, Standard-Split 30 / 40 / 30 der kcal.
 */
export function scaleMacrosToCalories(
  protein: number,
  carbs: number,
  fat: number,
  targetCalories: number,
): MacroSet {
  const kcal = Math.max(0, Math.round(targetCalories));
  if (kcal === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const e = energyFromMacrosGrams(protein, carbs, fat);
  if (e <= 0.001) {
    const pG = (0.3 * kcal) / KJ_P;
    const cG = (0.4 * kcal) / KJ_C;
    const fG = (0.3 * kcal) / KJ_F;
    return snapMacrosToCalories(pG, cG, fG, kcal);
  }

  const factor = kcal / e;
  return snapMacrosToCalories(protein * factor, carbs * factor, fat * factor, kcal);
}

/** Protein fest; KH + Fett im bisherigen Energieverhältnis auf restliche kcal skalieren. */
export function rebalanceAfterProteinChange(
  newProteinGrams: number,
  protein: number,
  carbs: number,
  fat: number,
  targetCalories: number,
): MacroSet {
  const kcal = Math.max(0, Math.round(targetCalories));
  let p = round1(Math.max(0, newProteinGrams));
  const maxP = kcal / KJ_P;
  if (p > maxP) p = round1(maxP);
  let rem = kcal - KJ_P * p;
  if (rem < 0) rem = 0;

  const eC = KJ_C * carbs;
  const eF = KJ_F * fat;
  let c2: number;
  let f2: number;
  if (eC + eF > 0.001) {
    const factor = rem / (eC + eF);
    c2 = carbs * factor;
    f2 = fat * factor;
  } else {
    c2 = rem / (2 * KJ_C);
    f2 = rem / (2 * KJ_F);
  }
  return snapMacrosToCalories(p, c2, f2, kcal);
}

/** KH fest; Protein + Fett analog. */
export function rebalanceAfterCarbsChange(
  newCarbsGrams: number,
  protein: number,
  carbs: number,
  fat: number,
  targetCalories: number,
): MacroSet {
  const kcal = Math.max(0, Math.round(targetCalories));
  let c = round1(Math.max(0, newCarbsGrams));
  const maxC = kcal / KJ_C;
  if (c > maxC) c = round1(maxC);
  let rem = kcal - KJ_C * c;
  if (rem < 0) rem = 0;

  const eP = KJ_P * protein;
  const eF = KJ_F * fat;
  let p2: number;
  let f2: number;
  if (eP + eF > 0.001) {
    const factor = rem / (eP + eF);
    p2 = protein * factor;
    f2 = fat * factor;
  } else {
    p2 = rem / (2 * KJ_P);
    f2 = rem / (2 * KJ_F);
  }
  return snapMacrosToCalories(p2, c, f2, kcal);
}

/** Fett fest; Protein + KH analog. */
export function rebalanceAfterFatChange(
  newFatGrams: number,
  protein: number,
  carbs: number,
  fat: number,
  targetCalories: number,
): MacroSet {
  const kcal = Math.max(0, Math.round(targetCalories));
  let f = round1(Math.max(0, newFatGrams));
  const maxF = kcal / KJ_F;
  if (f > maxF) f = round1(maxF);
  let rem = kcal - KJ_F * f;
  if (rem < 0) rem = 0;

  const eP = KJ_P * protein;
  const eC = KJ_C * carbs;
  let p2: number;
  let c2: number;
  if (eP + eC > 0.001) {
    const factor = rem / (eP + eC);
    p2 = protein * factor;
    c2 = carbs * factor;
  } else {
    p2 = rem / (2 * KJ_P);
    c2 = rem / (2 * KJ_C);
  }
  return snapMacrosToCalories(p2, c2, f, kcal);
}
