/**
 * Anzeige-Labels für Log-Einheiten — bevorzugt OFF-Serving-Namen (Packung, Flasche, …).
 */

import type { Food } from './foodDatabase';
import type { LogUnitValue } from './portionUtils';
import {
  hasMeaningfulStueckServing,
  inferDoseGramsFromFood,
  inferFlascheGramsFromFood,
  inferGlasMlFromFood,
  inferPortionGramsFromFood,
  inferScheibeGramsFromFood,
  inferStueckGramsFromFood,
} from './portionUtils';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function servingForUnit(food: Food, unit: LogUnitValue): { name: string; grams: number } | null {
  const servings = food.servings ?? [];
  const pick = (re: RegExp) => servings.find((s) => s.grams > 0 && re.test(s.name));
  switch (unit) {
    case 'stk':
      return (
        pick(/stk\.?|stück|stueck|\bpiece\b/i) ??
        pick(/riegel|waffel|brötchen|semmel|roll\b|bar\b/i) ??
        pick(/^\s*1\s+(?!packung|pack\b|gebinde)/i) ??
        null
      );
    case 'portion':
      return (
        pick(/\bportion/i) ??
        pick(/packung|pack\b|gebinde|beutel|tüte|tube|menü|menu/i) ??
        null
      );
    case 'dose':
      return pick(/dose/i) ?? null;
    case 'glas':
      return pick(/glas|gläser|becher/i) ?? null;
    case 'flasche':
      return pick(/flasche/i) ?? null;
    case 'scheibe':
      return pick(/scheibe/i) ?? null;
    default:
      return null;
  }
}

/** Dropdown-Label für eine Log-Einheit (mit OFF-Packungsname wenn vorhanden). */
export function logUnitOptionLabel(food: Food, unit: LogUnitValue, t: TFn): string {
  const serving = servingForUnit(food, unit);
  if (serving?.name.trim()) {
    return serving.name.trim();
  }

  const pieceG = inferStueckGramsFromFood(food);
  const scheibeG = inferScheibeGramsFromFood(food);
  const portionG = inferPortionGramsFromFood(food);
  const doseG = inferDoseGramsFromFood(food);
  const glasMl = inferGlasMlFromFood(food);
  const flascheMl = inferFlascheGramsFromFood(food);

  switch (unit) {
    case 'g':
      return t('nut.portion.opt.g');
    case 'ml':
      return t('nut.portion.opt.ml');
    case 'tl':
      return t('nut.portion.opt.tl');
    case 'el':
      return t('nut.portion.opt.el');
    case 'stk':
      if (!hasMeaningfulStueckServing(food)) {
        return t('nut.portion.opt.g');
      }
      return t('nut.portion.opt.stk', { g: pieceG });
    case 'scheibe':
      return t('nut.portion.opt.scheibe', { g: scheibeG ?? pieceG });
    case 'portion':
      return t('nut.portion.opt.portion', { g: portionG ?? pieceG });
    case 'dose':
      return doseG != null ? t('nut.portion.opt.dose', { g: doseG }) : t('nut.portion.opt.dose', { g: 0 });
    case 'glas':
      return glasMl != null ? t('nut.portion.opt.glas', { ml: glasMl }) : t('nut.portion.opt.glas', { ml: 0 });
    case 'flasche':
      return flascheMl != null
        ? t('nut.portion.opt.flasche', { ml: flascheMl })
        : t('nut.portion.opt.flasche', { ml: 0 });
    default:
      return unit;
  }
}
