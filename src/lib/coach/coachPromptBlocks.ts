import type { AthleteWeekSnapshot, WeekDirective, WeeklyReportFacts } from './coachTypes';

export function formatWeekDirectiveBlock(directive: WeekDirective, lastReport?: {
  nextWeekChanges?: string[];
  recommendation?: string;
}): string {
  const fromLast = lastReport?.nextWeekChanges?.length
    ? `\nLast week's requested changes: ${lastReport.nextWeekChanges.join('; ')}`
    : '';
  return `
WEEK_DIRECTIVE (computed by coaching engine — follow strictly):
- Recommendation code: ${directive.recommendation}
- Completion rate: ${directive.completionRate}%
- Volume multiplier vs last block: ${directive.volumeMultiplier}x
- Target session RPE: ${directive.intensityTargetRpe}
- Deload week: ${directive.deloadWeek ? 'YES' : 'no'}
- Taper week: ${directive.taperWeek ? 'YES' : 'no'}
- Directives: ${directive.coachDirectiveBullets.join(' | ')}
- Progression data: ${directive.progressionNotes.join(' | ') || 'n/a'}${fromLast}

Apply volume multiplier to total working sets (not rest days). Keep primary compounds; adjust accessories first.
`;
}

export function formatSnapshotForPrompt(snapshot: AthleteWeekSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function buildAdaptationBlockFromReport(lastReport: Record<string, unknown> | undefined, weekNumber: number): string {
  if (!lastReport) return '';
  const wd = lastReport.weekDirective as WeekDirective | undefined;
  if (wd && typeof wd === 'object' && wd.recommendation) {
    return formatWeekDirectiveBlock(wd, lastReport as { nextWeekChanges?: string[] });
  }
  return `
LAST WEEK PERFORMANCE (Week ${weekNumber - 1}):
- Overall rating: ${lastReport.overallRating}/10
- Completion rate: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Strengths: ${Array.isArray(lastReport.performanceHighlights) ? lastReport.performanceHighlights.join('; ') : ''}
- Weaknesses: ${Array.isArray(lastReport.areasToImprove) ? lastReport.areasToImprove.join('; ') : ''}
- Coach recommendation: ${lastReport.recommendation}
- Specific changes requested: ${Array.isArray(lastReport.nextWeekChanges) ? lastReport.nextWeekChanges.join('; ') : ''}
- Strategy: ${lastReport.nextWeekStrategy}
`;
}

export function formatReportFactsForNarrative(
  facts: WeeklyReportFacts,
  prevReport?: Record<string, unknown> | null,
): string {
  const prev = prevReport
    ? `
PREVIOUS WEEK REPORT:
- Rating: ${prevReport.overallRating}/10, Completion: ${prevReport.completionRate}%
- Recommendation was: ${prevReport.recommendation}
- Planned changes: ${Array.isArray(prevReport.nextWeekChanges) ? prevReport.nextWeekChanges.join('; ') : 'none'}
`
    : 'No previous week report.';

  return `
ATHLETE_WEEK_FACTS (immutable — do NOT change overallRating, completionRate, or recommendation):
${JSON.stringify(
    {
      overallRating: facts.overallRating,
      completionRate: facts.completionRate,
      recommendation: facts.recommendation,
      snapshot: facts.snapshot,
      directive: facts.directive,
    },
    null,
    2,
  )}
${prev}

Write narrative fields ONLY. Use exact numbers from facts in prose.
`;
}
