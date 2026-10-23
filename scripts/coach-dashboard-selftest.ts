import assert from 'node:assert/strict';
import {
  buildCoachDashboardSummary,
  completionRateFromReport,
} from '../src/lib/coach/coachDashboardSummary';
import type { AthleteWeekSnapshot } from '../src/lib/coach/coachTypes';

assert.equal(completionRateFromReport({ completionRate: 72 }), 72);
assert.equal(
  completionRateFromReport({
    factsSnapshot: {
      adherence: { completionRate: 66 },
    } as AthleteWeekSnapshot,
  }),
  66,
);

const live: AthleteWeekSnapshot = {
  weekNumber: 2,
  windowStart: '2026-05-04',
  windowEnd: '2026-05-10',
  planType: 'workout',
  adherence: { plannedUnits: 4, completedUnits: 3, completionRate: 75 },
  flags: [],
};

const summary = buildCoachDashboardSummary({
  planId: 'p1',
  planType: 'workout',
  weekNumber: 2,
  report: { completionRate: 50, recommendation: 'continue', overallRating: 7 },
  liveSnapshot: live,
});

assert.ok(summary);
assert.equal(summary?.completionRate, 75);
assert.equal(summary?.source, 'live_facts');

console.log('coach-dashboard-selftest: OK');
