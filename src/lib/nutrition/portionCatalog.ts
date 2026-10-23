import type { Food, Serving } from '../foodDatabase';
import {
  getLogPortionQuickActions,
  inferDefaultLogPortionForFood,
  servingToLogPortion,
} from '../portionUtils';
import type { PortionOption } from './schemas';
import type { UserPortionPref } from './userFoodPortionPrefs';
import { portionOptionFromUserPref } from './userFoodPortionPrefs';
import { lookupDefaultPortion } from './defaultPortionLookup';

const ENERGY_DRINK_RE = /\b(red\s*bull|monster|energy|cola|fanta|sprite|pepsi|mate)\b/i;
const CAN_ML = new Set([250, 330, 355, 473, 500]);

function isEnergyDrinkCan(food: Food, grams: number): boolean {
  if (food.category !== 'drink') return false;
  return ENERGY_DRINK_RE.test(food.name) && CAN_ML.has(grams);
}

function servingToOption(food: Food, serving: Serving, index: number): PortionOption | null {
  const mapped = servingToLogPortion(food, serving);
  if (!mapped) return null;
  let label = serving.name;
  let logUnit = mapped.unit;
  if (isEnergyDrinkCan(food, serving.grams) && !/dose/i.test(label)) {
    label = `1 Dose (${serving.grams} ml)`;
    logUnit = 'dose';
  }
  return {
    id: `srv_${index}_${serving.grams}`,
    label,
    logUnit,
    quantity: mapped.quantity,
    grams: serving.grams,
    source: /packung|flasche|dose/i.test(label) ? 'off_pack' : 'off_serving',
  };
}

function unitLabel(unit: string): string {
  if (unit === 'stk') return 'Stück';
  if (unit === 'scheibe') return 'Scheibe';
  if (unit === 'dose') return 'Dose';
  if (unit === 'glas') return 'Glas';
  if (unit === 'flasche') return 'Flasche';
  return unit;
}

function defaultFromPortionsJson(food: Food): PortionOption | null {
  const v = lookupDefaultPortion(food.name);
  if (!v) return null;
  const isMass = v.unit === 'g';
  const isVolume = v.unit === 'ml';
  const label = isMass
    ? `${v.grams} g`
    : isVolume
      ? `${v.grams} ml`
      : `1 ${unitLabel(v.unit)} (${v.grams} ${v.unit === 'dose' || v.unit === 'glas' || v.unit === 'flasche' ? 'ml' : 'g'})`;
  return {
    id: `gen_def_${food.name.slice(0, 24)}`,
    label,
    logUnit: v.unit,
    quantity: 1,
    grams: v.grams,
    source: 'generic_default',
  };
}

export function buildPortionOptions(food: Food, userPref?: UserPortionPref | null): PortionOption[] {
  const out: PortionOption[] = [];
  const seen = new Set<string>();

  if (userPref) {
    const fromUser = portionOptionFromUserPref(
      userPref,
      food.servings?.find((s) => s.grams > 0)?.grams ?? 100,
    );
    out.push(fromUser);
    seen.add(`${fromUser.logUnit}:${fromUser.grams}`);
  }

  const add = (opt: PortionOption) => {
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
      grams:
        qa.unit === 'g' || qa.unit === 'ml'
          ? qa.quantity
          : Math.max(1, Math.round((food.servings?.find((s) => s.grams > 0)?.grams ?? 100) * qa.quantity)),
      source: 'off_pack',
    });
  }

  const gen = defaultFromPortionsJson(food);
  if (gen) add(gen);

  if (out.length === 0) {
    const def = inferDefaultLogPortionForFood(food);
    add({
      id: 'fallback',
      label: `${def.quantity} ${def.unit}`,
      logUnit: def.unit,
      quantity: def.quantity,
      grams: def.unit === 'g' || def.unit === 'ml' ? def.quantity : 100,
      source: 'generic_default',
      isDefault: true,
    });
  }

  const packFirst = out.find((o) => /dose|flasche|packung/i.test(o.label) || o.logUnit === 'dose');
  if (packFirst) packFirst.isDefault = true;
  else if (out[0]) out[0].isDefault = true;

  return out.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
}

export function pickDefaultPortion(food: Food, userPref?: UserPortionPref | null): PortionOption {
  const opts = buildPortionOptions(food, userPref);
  const userLast = opts.find((o) => o.source === 'user_last');
  if (userLast) return userLast;
  return opts.find((o) => o.isDefault) ?? opts[0];
}

export function toGrams(option: PortionOption): number {
  if (option.logUnit === 'g' || option.logUnit === 'ml') {
    return Math.max(1, Math.round(option.quantity));
  }
  return Math.max(1, Math.round(option.grams * Math.max(0.01, option.quantity)));
}

export function pickPortionForText(food: Food, unit: string, value: number): PortionOption | null {
  const opts = buildPortionOptions(food);
  const u = unit.toLowerCase();
  if (u === 'stk') {
    const piece = opts.find((o) => o.logUnit === 'stk');
    if (piece) return { ...piece, quantity: value };
  }
  if (u === 'dose' || u === 'flasche' || u === 'packung') {
    const match = opts.find((o) => o.logUnit === u);
    if (match) return { ...match, quantity: value };
  }
  if (u === 'g' || u === 'ml') {
    return {
      id: 'explicit_g',
      label: `${value} ${u}`,
      logUnit: u,
      quantity: value,
      grams: value,
      source: 'generic_default',
    };
  }
  return null;
}
