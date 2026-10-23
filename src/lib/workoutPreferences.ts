export type WeightUnit = 'kg' | 'lb';

const UNIT_KEY = 'vrtx_weight_unit';

export function getWeightUnit(): WeightUnit {
  try {
    const u = localStorage.getItem(UNIT_KEY);
    if (u === 'lb') return 'lb';
  } catch {
    /* ignore */
  }
  return 'kg';
}

export function setWeightUnit(unit: WeightUnit) {
  localStorage.setItem(UNIT_KEY, unit);
}

export function displayWeight(kg: number, unit: WeightUnit = getWeightUnit()): number {
  if (unit === 'lb') return Math.round(kg * 2.20462 * 10) / 10;
  return kg;
}

export function inputToKg(value: number, unit: WeightUnit = getWeightUnit()): number {
  if (unit === 'lb') return Math.round((value / 2.20462) * 10) / 10;
  return value;
}

export function plateCalcBarPlusPlates(targetKg: number, barKg = 20, plates: number[] = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  let remaining = Math.max(0, (targetKg - barKg) / 2);
  const perSide: number[] = [];
  for (const p of plates) {
    while (remaining >= p - 0.01) {
      perSide.push(p);
      remaining -= p;
    }
  }
  return { barKg, perSide, total: barKg + perSide.reduce((a, b) => a + b, 0) * 2 };
}
