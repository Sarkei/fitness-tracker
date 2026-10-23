import type { PipelineResult } from './schemas';

export type MacroTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function macroTotalsFromPipeline(result: PipelineResult): MacroTotals {
  return {
    kcal: Math.round(result.totals.kcal),
    protein: Math.round(result.totals.protein * 10) / 10,
    carbs: Math.round(result.totals.carbs * 10) / 10,
    fat: Math.round(result.totals.fat * 10) / 10,
  };
}

export function diffMacroTotals(before: MacroTotals, after: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(after.kcal - before.kcal),
    protein: Math.round((after.protein - before.protein) * 10) / 10,
    carbs: Math.round((after.carbs - before.carbs) * 10) / 10,
    fat: Math.round((after.fat - before.fat) * 10) / 10,
  };
}

export function formatDeltaLabel(value: number, unit: string): string {
  const rounded = Math.round(value);
  if (rounded === 0) return `±0 ${unit}`;
  return rounded > 0 ? `+${rounded} ${unit}` : `${rounded} ${unit}`;
}
