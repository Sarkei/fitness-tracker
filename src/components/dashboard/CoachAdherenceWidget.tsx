import { Brain, ChevronRight } from 'lucide-react';

const coachCardActionButtonClass =
  'w-full min-h-[48px] px-3 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--border-muted)] hover:border-brand transition-all text-[10px] font-black uppercase tracking-widest leading-tight flex flex-col items-center justify-center text-center gap-0.5';
import { Link } from 'react-router-dom';
import { useI18n } from '@/src/lib/i18n';
import { formatCoachRecommendation } from '@/src/lib/coachScheduleDisplay';
import { cn } from '@/src/lib/utils';
import type { CoachDashboardSummary } from '@/src/lib/coach/coachDashboardSummary';

type Props = {
  summary: CoachDashboardSummary | null;
  compact?: boolean;
};

export default function CoachAdherenceWidget({ summary, compact }: Props) {
  const { t } = useI18n();
  const hasSummary = summary != null;
  const recLabel = summary?.recommendation
    ? formatCoachRecommendation(summary.recommendation as any, t)
    : null;

  const weekAnalysisLabel =
    hasSummary && summary.weekNumber != null && summary.weekNumber > 0
      ? t('dash.coach.weekAnalysis', { n: summary.weekNumber })
      : hasSummary
        ? t('dash.coach.weekAnalysisGeneric')
        : t('dash.loading');

  if (compact) {
    return (
      <Link
        to="/coach"
        className="block h-full bg-[var(--card-bg)] p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-[var(--border-muted)] shadow-sm hover:border-brand transition-all"
      >
        <div className="flex min-h-[112px] flex-col items-start gap-3">
          <div className="h-10 w-10 rounded-xl border border-brand/40 bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
            <Brain size={16} />
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {t('dash.coach.adherenceTitle')}
          </p>
          <p className="text-3xl md:text-[2rem] font-black italic tracking-tighter uppercase leading-none">
            {hasSummary ? summary.completionRate : '—'}
            <span className="text-[10px] md:text-xs ml-1.5 font-black text-[var(--text-muted)] not-italic">%</span>
          </p>
          <p className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">
            {weekAnalysisLabel}
          </p>
        </div>
        <div className="mt-auto pt-5">
          <div className={coachCardActionButtonClass}>
            <span>{t('dash.coach.openCoachLine1')}</span>
            <span>{t('dash.coach.openCoachLine2')}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/coach"
      className="block bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-6 shadow-sm hover:border-brand transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
            <Brain size={18} className="text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('dash.coach.adherenceTitle')}
            </p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">
              {weekAnalysisLabel}
              {hasSummary && summary.source === 'live_facts' ? ` · ${t('dash.coach.live')}` : ''}
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0 mt-1" />
      </div>
      <div className="mt-4 flex items-end gap-4">
        <p className="text-4xl font-black italic text-[var(--text-primary)]">
          {hasSummary ? summary.completionRate : '—'}
          <span className="text-lg text-[var(--text-muted)]">%</span>
        </p>
        {hasSummary && summary.overallRating != null && (
          <p className="text-sm font-black text-[var(--text-muted)] pb-1">
            {summary.overallRating}/10
          </p>
        )}
        {hasSummary && recLabel && (
          <span
            className={cn(
              'ml-auto text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2 py-1 rounded-lg',
            )}
          >
            {recLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
