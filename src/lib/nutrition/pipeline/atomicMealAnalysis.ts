import { completeMealAnalysis } from '../../../../aiProviders';
import { ensureCookingOilInAnalysis } from '../ensureCookingOil';
import { enrichAnalysisWithPortionCatalog } from '../enrichPortionDefaults';
import { normalizeMealInputForCache } from './pipelineInputCache';
import { MealAnalysisSchema, type MealAnalysis, type MealComponent } from './schemas';

/** Zusammengesetzte Gerichtnamen — dürfen nicht als eine OFF-Zeile erscheinen. */
const COMPOSITE_NAME_RE =
  /(leberk[aä]se\s*semmel|leberk[aä]sesemmel|leberkassemmel|cheeseburger|cheese\s*burger|hamburger(?!patty)|hot\s*dog|hotdog|döner(?!\s*fleisch)|doener(?!\s*fleisch)|dürüm|dueruem|lahmacun|burrito|wrap\s*meal|panini|club\s*sandwich|leberk[aä]ssemmel)/i;

const MEAL_ASSEMBLY_RE =
  /(semmel|br[oö]tchen|brot|baguette|toast|croissant|wrap|tortilla|pizza|burger|sandwich)/i;

export function isCompositeComponentName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (COMPOSITE_NAME_RE.test(n)) return true;
  if (/\b(mit|und)\b/i.test(n) && MEAL_ASSEMBLY_RE.test(n) && n.split(/\s+/).length >= 3) {
    return true;
  }
  return false;
}

function findCompositeComponents(components: MealComponent[]): MealComponent[] {
  return components.filter((c) => isCompositeComponentName(c.name));
}

function sortComponentsStable(components: MealComponent[]): MealComponent[] {
  return [...components].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function reindexComponents(components: MealComponent[]): MealComponent[] {
  return sortComponentsStable(components).map((c, i) => ({
    ...c,
    id: `c${i + 1}`,
  }));
}

const REPAIR_SYSTEM = `You fix meal decompositions for Open Food Facts lookup in Germany.
Output ONLY valid JSON matching the same schema as the original meal analysis.

RULES:
- Replace ANY composite dish name with separate atomic ingredients only (each searchable in OFF on its own).
- NEVER output combined names (no Leberkässemmel, Cheeseburger, Döner as one line).
- For Leberkäse in a Semmel: always separate "Semmel" (bread) and "Leberkäse" (slice meat), plus "Senf" if mentioned in user input.
- Keep realistic gram weights; split the composite item's grams across the atomic parts.
- Use consistent German names: Semmel (not Brötchen) when user said Semmel; Senf for mustard.
- Same user input must yield the same component list and names every time.
- Include estimated_piece_count and grams_per_piece when counting pieces or slices.
- Do NOT add calories or macros.`;

async function repairToAtomicComponents(
  analysis: MealAnalysis,
  userText: string,
  image?: { mimeType: string; data: string },
): Promise<MealAnalysis> {
  const composites = findCompositeComponents(analysis.components);
  const prompt = `${REPAIR_SYSTEM}

USER_INPUT (normalized): ${normalizeMealInputForCache(userText)}

CURRENT_MEAL_NAME: ${analysis.meal_name}

COMPOSITE_COMPONENTS_TO_SPLIT (do not keep these names):
${composites.map((c) => `- ${c.name} (${c.estimated_grams} g): ${c.gram_reasoning}`).join('\n')}

OTHER_COMPONENTS_TO_KEEP (merge into final list, adjust grams if needed):
${analysis.components
  .filter((c) => !composites.includes(c))
  .map((c) => `- ${c.name} (${c.estimated_grams} g)`)
  .join('\n')}

Return the FULL corrected meal JSON (all components, not only the split ones).`;

  const raw = await completeMealAnalysis(prompt, image, {
    temperature: 0,
    responseMode: 'json_object',
  });
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('atomic-repair-invalid-json');
  const parsed = MealAnalysisSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  return parsed;
}

/**
 * Erzwingt atomare Einzel-Lebensmittel (OFF-tauglich), optional ein Repair-KI-Lauf.
 */
export async function ensureAtomicMealAnalysis(
  analysis: MealAnalysis,
  userText: string,
  image?: { mimeType: string; data: string },
): Promise<MealAnalysis> {
  let next = {
    ...analysis,
    components: reindexComponents(analysis.components),
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
      throw new Error(`atomic-repair-still-composite:${stillComposite.map((c) => c.name).join(',')}`);
    }
    const repairedWithOil = ensureCookingOilInAnalysis(
      {
        ...repaired,
        components: reindexComponents(repaired.components),
        portion_context: 'atomic-repair-v1',
      },
      userText,
    );
    return enrichAnalysisWithPortionCatalog(repairedWithOil);
  } catch {
    return enrichAnalysisWithPortionCatalog(next);
  }
}
