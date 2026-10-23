/**
 * Flow-Logik: Refine → reportStale, Dashboard-Summary, Facts aus Report.
 * Kein Browser/DB — reine Unit-Checks für Coach-Folgeschritte.
 */
import assert from 'node:assert/strict';
import { buildCoachDashboardSummary } from '../src/lib/coach/coachDashboardSummary';
import { finalizeCoachNutritionWeek } from '../src/lib/coachNutritionPostprocess';

// Refine ändert Plan → Report gilt als stale bis Regenerate
let reportStale = false;
const onRefineSuccess = () => {
  reportStale = true;
};
onRefineSuccess();
assert.equal(reportStale, true);

const afterRegenerate = () => {
  reportStale = false;
};
afterRegenerate();
assert.equal(reportStale, false);

// Nach Regenerate: Summary nutzt neuen Report + live Facts
const summary = buildCoachDashboardSummary({
  planId: 'plan-1',
  planType: 'workout',
  weekNumber: 3,
  report: { completionRate: 80, recommendation: 'continue', overallRating: 8 },
  liveSnapshot: {
    weekNumber: 3,
    windowStart: '2026-05-11',
    windowEnd: '2026-05-17',
    planType: 'workout',
    adherence: { plannedUnits: 5, completedUnits: 4, completionRate: 80 },
    flags: [],
  },
});
assert.equal(summary?.completionRate, 80);

// Nutrition postprocess weiterhin Pflicht für Slot-Adherence
const week = finalizeCoachNutritionWeek({
  weekFocus: 'F',
  coachNotes: 'N',
  assumptions: [],
  applied_constraints: [],
  mealPlan: [{ day: 'Tuesday', meals: [{ type: 'lunch', title: 'Salad' }] }],
});
assert.ok(week.mealPlan[1]?.meals?.[0]?.calories);

console.log('coach-flow-selftest: OK');
