import templates from './dishRecipeTemplates.de.json';
import type { MealComponent, MealItem } from './schemas';
import type { DishType } from './schemas';

type TemplateComponent = { foodHintDe: string; foodHintEn?: string; defaultGrams: number };
type DishTemplate = {
  aliases: string[];
  label: string;
  components: TemplateComponent[];
};

const TEMPLATES = templates as Record<string, DishTemplate>;

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

export function findDishTemplateId(text: string): string | null {
  const n = norm(text);
  if (!n) return null;
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    if (tpl.aliases.some((a) => norm(a) === n || n.includes(norm(a)))) return id;
  }
  return null;
}

export function expandDishFromTemplate(
  templateId: string,
  quantityMultiplier = 1,
): { label: string; components: MealComponent[] } | null {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return null;
  const mult = Math.max(1, Math.round(quantityMultiplier));
  const components: MealComponent[] = tpl.components.map((c) => ({
    rawText: c.foodHintDe,
    foodHint: c.foodHintEn ?? c.foodHintDe,
    quantity: {
      explicit: true as const,
      value: Math.round(c.defaultGrams * mult),
      unit: 'g' as const,
    },
    isPackaged: false,
    fromTemplate: true,
  }));
  return { label: tpl.label, components };
}

export function listTemplateAliases(): string[] {
  return Object.entries(TEMPLATES).flatMap(([id, t]) => [id, ...t.aliases]);
}

const PACKAGED_BRAND = /\b(big\s*mac|mcdonald|müller|danone|red\s*bull|monster\s*energy|coca\s*cola|pepsi)\b/i;

export function inferDishTypeFromText(text: string): DishType {
  if (PACKAGED_BRAND.test(text)) return 'packaged_brand';
  if (findDishTemplateId(text)) return 'composite_recipe';
  return 'single_ingredient';
}

export function parseQuantityMultiplier(text: string): number {
  const m = text.trim().match(/^(\d+)\s*x?\s*/i);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function buildMealItemFromDishPhrase(phrase: string): MealItem | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;
  const mult = parseQuantityMultiplier(trimmed);
  const core = trimmed.replace(/^\d+\s*x?\s*/i, '').trim();
  const templateId = findDishTemplateId(core);
  if (templateId) {
    const expanded = expandDishFromTemplate(templateId, mult);
    if (!expanded) return null;
    return {
      label: mult > 1 ? `${mult}× ${expanded.label}` : expanded.label,
      dishType: 'composite_recipe',
      templateId,
      quantityMultiplier: mult,
      components: expanded.components,
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
        isPackaged: dishType === 'packaged_brand',
      },
    ],
  };
}
