import type { Pool } from 'pg';
import type { UserProfile } from '@/src/types';
import { parseJsonLoose } from '../parseCoachJson';
import { weeklyReportSchema } from '../coachScheduleZod';
import { buildCoachWeeklyReportNarrativePrompt } from '../aiPrompts/buildWorkoutPrompts';
import { addDaysYmd, coachWeekInclusiveEnd } from '../coachWeekWindow';
import { formatReportFactsForNarrative } from './coachPromptBlocks';
import {
  computeWeeklyReportFacts,
  loadPrevWeekVolumeKg,
  mergeNarrativeWithFacts,
  persistPlanStateAfterReport,
} from './weeklyReportBuilder';
import { loadCoachPlanState } from './coachPlanState';
import { mapNutritionRow, mapWorkoutRow } from './coachDbMappers';
import type { WeeklyReportWithFacts } from './coachTypes';

const narrativeOnlySchema = weeklyReportSchema.omit({
  overallRating: true,
  completionRate: true,
  recommendation: true,
});

export async function generateCoachWeeklyReport(params: {
  pool: Pool;
  plan: Record<string, unknown> & { id: string; type: string; current_week: number; event_date?: string };
  scheduleRow: { schedule: Record<string, unknown>; start_date?: string | Date };
  weekNumber?: number;
  userId: number;
  profile: UserProfile;
  onboarding: Record<string, unknown>;
  prevReport?: Record<string, unknown> | null;
  uiLocale: 'de' | 'en';
  callAi: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  outputLanguage: string;
}): Promise<{ report: WeeklyReportWithFacts; rawLast: string; retries: number }> {
  const weekNumber = params.weekNumber ?? params.plan.current_week;
  const startYmd =
    params.scheduleRow.start_date != null
      ? String(
          params.scheduleRow.start_date instanceof Date
            ? params.scheduleRow.start_date.toISOString().split('T')[0]
            : params.scheduleRow.start_date,
        ).split('T')[0]
      : new Date().toISOString().split('T')[0];
  const endYmd = coachWeekInclusiveEnd(startYmd);
  const prevStart = addDaysYmd(startYmd, -7);
  const prevEnd = addDaysYmd(startYmd, -1);

  const [workoutsRes, nutritionRes, planState, prevVol] = await Promise.all([
    params.pool.query(`SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd,
    ]),
    params.pool.query(`SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd,
    ]),
    loadCoachPlanState(params.pool, params.plan.id),
    params.plan.type === 'workout'
      ? loadPrevWeekVolumeKg(params.pool, params.userId, prevStart, prevEnd)
      : Promise.resolve(0),
  ]);

  const workouts = workoutsRes.rows.map((r) => mapWorkoutRow(r));
  const nutrition = nutritionRes.rows.map((r) => mapNutritionRow(r));

  const weeksUntilEvent = params.plan.event_date
    ? Math.round(
        (new Date(String(params.plan.event_date)).getTime() - Date.now()) / (7 * 24 * 3600 * 1000),
      )
    : null;

  const facts = computeWeeklyReportFacts({
    planType: params.plan.type === 'nutrition' ? 'nutrition' : 'workout',
    weekNumber,
    startYmd,
    scheduleEnvelope: params.scheduleRow.schedule ?? {},
    workouts,
    nutrition,
    profile: params.profile,
    onboarding: params.onboarding,
    planState,
    weeksUntilEvent,
    prevWeekVolumeKg: prevVol,
  });

  await persistPlanStateAfterReport(params.pool, params.plan.id, facts.planState);

  const factsBlock = formatReportFactsForNarrative(facts, params.prevReport);
  let rawLast = '';
  let narrative: Record<string, unknown> | null = null;
  let retries = 0;
  let repair = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    retries = attempt;
    const prompt =
      buildCoachWeeklyReportNarrativePrompt({
        outputLanguage: params.outputLanguage,
        reportFactsBlock: factsBlock,
        lockedRecommendation: facts.recommendation,
      }) + (repair ? `\n\nJSON repair: ${repair}` : '');

    rawLast = await params.callAi([{ role: 'user', content: prompt }]);
    try {
      const parsed = parseJsonLoose(rawLast) as Record<string, unknown>;
      const z = narrativeOnlySchema.safeParse(parsed);
      if (!z.success) {
        repair = z.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        continue;
      }
      narrative = z.data as Record<string, unknown>;
      break;
    } catch (e) {
      repair = e instanceof Error ? e.message : String(e);
    }
  }

  if (!narrative) {
    narrative = {
      coachMessage: `Week ${weekNumber}: ${facts.completionRate}% adherence. Recommendation: ${facts.recommendation}.`,
      summary: 'Automated fallback narrative — refine after more logged sessions.',
      performanceHighlights: facts.snapshot.training?.topPrs.length
        ? facts.snapshot.training.topPrs.map((p) => `${p.exercise}: ~${p.e1rmKg} kg e1RM`)
        : ['None this week'],
      areasToImprove: facts.snapshot.flags.length ? facts.snapshot.flags : ['Log all sessions consistently'],
      weekOverWeekComparison: params.prevReport
        ? `Previous completion: ${params.prevReport.completionRate}%`
        : 'No previous data.',
      nextWeekStrategy: facts.directive.coachDirectiveBullets.join(' '),
      nextWeekChanges: facts.directive.coachDirectiveBullets,
    };
  }

  const report = mergeNarrativeWithFacts(facts, narrative);
  return { report, rawLast, retries };
}
