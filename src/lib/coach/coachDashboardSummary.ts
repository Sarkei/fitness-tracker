import type { AthleteWeekSnapshot } from './coachTypes';

export type CoachDashboardSummary = {
  planId: string;
  planType: 'workout' | 'nutrition';
  weekNumber: number;
  completionRate: number;
  recommendation: string | null;
  overallRating: number | null;
  source: 'report' | 'live_facts';
};

export function completionRateFromReport(report: Record<string, unknown> | null | undefined): number | null {
  if (!report) return null;
  if (typeof report.completionRate === 'number' && Number.isFinite(report.completionRate)) {
    return Math.round(report.completionRate);
  }
  const snap = report.factsSnapshot as AthleteWeekSnapshot | undefined;
  if (snap?.adherence?.completionRate != null) return Math.round(snap.adherence.completionRate);
  return null;
}

export function buildCoachDashboardSummary(params: {
  planId: string;
  planType: string;
  weekNumber: number;
  report?: Record<string, unknown> | null;
  liveSnapshot?: AthleteWeekSnapshot | null;
}): CoachDashboardSummary | null {
  const planType = params.planType === 'nutrition' ? 'nutrition' : 'workout';
  const fromReport = completionRateFromReport(params.report ?? null);
  const fromLive =
    params.liveSnapshot?.adherence?.completionRate != null
      ? Math.round(params.liveSnapshot.adherence.completionRate)
      : null;

  const completionRate = fromLive ?? fromReport;
  const source: 'report' | 'live_facts' = fromLive != null ? 'live_facts' : 'report';

  if (completionRate == null) return null;

  const report = params.report ?? {};
  return {
    planId: params.planId,
    planType,
    weekNumber: params.weekNumber,
    completionRate,
    recommendation: typeof report.recommendation === 'string' ? report.recommendation : null,
    overallRating: typeof report.overallRating === 'number' ? report.overallRating : null,
    source,
  };
}
