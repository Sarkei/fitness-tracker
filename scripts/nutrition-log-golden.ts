import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { segmentMealText } from '../src/lib/nutrition/textMealSegmenter';
import { buildMealItemFromDishPhrase, findDishTemplateId } from '../src/lib/nutrition/dishExpander';
import { buildHeuristicMealIntent } from '../src/lib/nutrition/heuristicParse';
import { rankFoodCandidates } from '../src/lib/nutrition/matchRanker';
import { searchGenericBaselines } from '../src/lib/nutrition/catalog/genericBaselineResolver';
import { checkMealPlausibility } from '../src/lib/nutrition/plausibilityCheck';
import {
  matchUncertaintyFromScore,
  requiresCandidatePick,
} from '../src/lib/nutrition/matchThresholds';
import type { Food } from '../src/lib/foodDatabase';

const __dir = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(__dir, 'nutrition-log-golden.json'), 'utf8')) as {
  cases: Array<Record<string, unknown>>;
};

const NUGGETS: Food = {
  id: 'off_nug',
  name: 'Chicken Nuggets TK',
  category: 'frozen',
  nutrients: { calories: 250, protein: 12, carbs: 20, fat: 14 },
  servings: [{ name: '100 g', grams: 100 }],
};
const HAEHNCHEN: Food = {
  id: 'generic_haehnchenbrust',
  name: 'Hähnchenbrust, roh',
  category: 'protein',
  nutrients: { calories: 120, protein: 22, carbs: 0, fat: 2.6 },
  servings: [{ name: '100 g', grams: 100 }],
};

let passed = 0;
let failed = 0;

for (const c of golden.cases) {
  const id = String(c.id);
  try {
    switch (c.type) {
      case 'template': {
        const input = String(c.input);
        const tid = findDishTemplateId(input);
        assert.equal(tid, c.templateId, `${id}: templateId`);
        const item = buildMealItemFromDishPhrase(input);
        assert.ok(item, `${id}: meal item`);
        assert.ok((item!.components.length ?? 0) >= Number(c.minComponents), `${id}: components`);
        break;
      }
      case 'segment': {
        const segs = segmentMealText(String(c.input));
        assert.ok(segs.length >= Number(c.minSegments), `${id}: segments ${segs.length}`);
        break;
      }
      case 'heuristic': {
        const intent = buildHeuristicMealIntent(String(c.input));
        if (c.templateId) {
          assert.ok(intent.items.some((i) => i.templateId === c.templateId), `${id}: template in intent`);
        }
        if (c.minItems) {
          assert.ok(intent.items.length >= Number(c.minItems), `${id}: items`);
        }
        if (c.hintIncludes) {
          const hints = intent.items.flatMap((i) => i.components.map((cc) => cc.foodHint.toLowerCase()));
          assert.ok(hints.some((h) => h.includes(String(c.hintIncludes))), `${id}: hint`);
        }
        break;
      }
      case 'rank': {
        const ranked = rankFoodCandidates(String(c.query), [NUGGETS, HAEHNCHEN, ...searchGenericBaselines(String(c.query), 3)]);
        assert.ok(ranked[0], `${id}: ranked`);
        if (c.expectTopIncludes) {
          assert.ok(
            ranked[0]!.food.name.toLowerCase().includes(String(c.expectTopIncludes).toLowerCase()),
            `${id}: top ${ranked[0]!.food.name}`,
          );
        }
        if (c.rejectIncludes) {
          assert.ok(
            !ranked[0]!.food.name.toLowerCase().includes(String(c.rejectIncludes).toLowerCase()),
            `${id}: reject ${c.rejectIncludes}`,
          );
        }
        break;
      }
      case 'generic': {
        const hits = searchGenericBaselines(String(c.query), 5);
        assert.ok(hits.some((f) => f.id === c.expectId), `${id}: expected ${c.expectId} in ${hits.map((f) => f.id).join(',')}`);
        break;
      }
      case 'plausibility': {
        const issues = checkMealPlausibility({
          kcal: Number(c.kcal),
          protein: Number(c.protein),
          carbs: Number(c.carbs),
          fat: Number(c.fat),
        });
        if (c.expectCode) {
          assert.ok(issues.some((i) => i.code === c.expectCode), `${id}: code ${c.expectCode}`);
        } else {
          assert.ok(issues.length <= Number(c.maxIssues ?? 0), `${id}: issues ${issues.map((i) => i.code).join(',')}`);
        }
        break;
      }
      case 'threshold': {
        const score = Number(c.score);
        if (c.requiresPick === true) {
          assert.ok(requiresCandidatePick(score, true), `${id}: requires pick`);
        } else if (c.requiresPick === false) {
          assert.ok(!requiresCandidatePick(score, true), `${id}: no pick`);
        }
        if (c.uncertainty) {
          assert.equal(matchUncertaintyFromScore(score), c.uncertainty, `${id}: uncertainty`);
        }
        break;
      }
      default:
        throw new Error(`unknown type ${c.type}`);
    }
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL [${id}]:`, e instanceof Error ? e.message : e);
  }
}

console.log(`nutrition-log-golden: ${passed} passed, ${failed} failed (${golden.cases.length} cases)`);
if (failed > 0) process.exit(1);
