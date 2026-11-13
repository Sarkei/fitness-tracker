import { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { api } from '@/src/lib/api';
import type { AthleteWeekSnapshot, SessionAdherenceRow } from '@/src/lib/coach/coachTypes';
type Props = {
  facts: AthleteWeekSnapshot;
  planId: string;
  weekNumber: number;
  onFactsUpdated?: (snapshot: AthleteWeekSnapshot) => void;
  onRegenerateReport?: () => Promise<void>;
  aiEnabled?: boolean;
};

export default function CoachReportFacts({
  facts,
  planId,
  weekNumber,
  onFactsUpdated,
  onRegenerateReport,
  aiEnabled,
}: Props) {
  const { t } = useI18n();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const workoutRows = facts.adherence.workoutRows ?? [];
  const nutritionRows = facts.adherence.nutritionRows ?? [];
  const extras = workoutRows.filter((r) => r.status === 'extra');
  const uncertain = workoutRows.filter((r) => r.matchUncertain);
  const missed = workoutRows.filter((r) => r.status === 'missed');

  const linkWorkout = async (row: SessionAdherenceRow, workoutId: string) => {
    if (!row.sessionKey) return;
    setSavingKey(row.sessionKey);
    try {
      const res = await api<{
        factsSnapshot?: AthleteWeekSnapshot;
      }>(`/api/coach/plans/${planId}/session-links`, {
        method: 'PATCH',
        body: JSON.stringify({
          links: [{ sessionKey: row.sessionKey, workoutId }],
          weekNumber,
        }),
      });
      if (res.factsSnapshot) onFactsUpdated?.(res.factsSnapshot);
      if (onRegenerateReport && aiEnabled) await onRegenerateReport();
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-6 space-y-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
        {t('coach.report.factsTitle')}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <FactChip label={t('coach.report.planned')} value={String(facts.adherence.plannedUnits)} />
        <FactChip label={t('coach.report.done')} value={String(facts.adherence.completedUnits)} />
        <FactChip label={t('coach.report.rate')} value={`${facts.adherence.completionRate}%`} />
        {facts.training && (
          <FactChip label={t('coach.report.volume')} value={`${facts.training.totalVolumeKg} kg`} />
        )}
      </div>

      {facts.planType === 'workout' && facts.training && (
        <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          {facts.training.avgRpe != null && (
            <span className="rounded-lg bg-[var(--background)] px-2 py-1">
              Ø RPE {facts.training.avgRpe}
            </span>
          )}
          <span className="rounded-lg bg-[var(--background)] px-2 py-1">
            {t('coach.report.sessions')}: {facts.training.sessionsLogged}
          </span>
          {facts.training.topPrs.slice(0, 2).map((pr) => (
            <span key={pr.exercise} className="rounded-lg bg-green-50 px-2 py-1 text-green-700">
              {pr.exercise} ~{pr.e1rmKg} kg
            </span>
          ))}
        </div>
      )}

      {facts.planType === 'workout' && workoutRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('coach.report.sessionsTable')}
          </p>
          <ul className="space-y-1.5">
            {workoutRows
              .filter((r) => r.status !== 'extra')
              .map((r) => (
                <li
                  key={`${r.plannedDay}-${r.title}-${r.status}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[var(--background)] px-3 py-2 text-xs font-bold"
                >
                  <span className="truncate text-[var(--text-primary)]">
                    {r.plannedDay} · {r.title}
                  </span>
                  <SessionStatusBadge row={r} t={t} />
                </li>
              ))}
          </ul>
        </div>
      )}

      {(uncertain.length > 0 || (missed.length > 0 && extras.length > 0)) && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
          <div className="flex gap-2 items-center">
            <AlertCircle size={14} className="text-orange-600 shrink-0" />
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-700">
              {t('coach.report.matchHint')}
            </p>
          </div>
          {[...uncertain, ...missed.filter((m) => extras.length > 0)].map((row) => (
            <div key={row.sessionKey} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs font-bold text-orange-900 shrink-0">
                {row.plannedDay} · {row.title}
              </span>
              <select
                className="flex-1 rounded-lg border border-orange-200 bg-surface px-2 py-1.5 text-xs font-bold"
                defaultValue=""
                disabled={savingKey === row.sessionKey}
                onChange={(e) => {
                  const wid = e.target.value;
                  if (wid) void linkWorkout(row, wid);
                }}
              >
                <option value="">{t('coach.report.pickWorkout')}</option>
                {extras.map((ex) => (
                  <option key={ex.matchedWorkoutId} value={ex.matchedWorkoutId}>
                    {ex.matchedWorkoutName} ({ex.plannedDate})
                  </option>
                ))}
              </select>
              {savingKey === row.sessionKey && <Loader2 size={14} className="animate-spin text-orange-600" />}
            </div>
          ))}
        </div>
      )}

      {facts.planType === 'nutrition' && nutritionRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('coach.report.mealsTable')}
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {nutritionRows.map((r) => (
              <li
                key={`${r.date}-${r.slot}`}
                className="flex justify-between text-xs font-bold rounded-lg px-2 py-1 bg-[var(--background)]"
              >
                <span>
                  {r.day} · {r.slot}
                </span>
                <span
                  className={cn(
                    r.status === 'logged' && 'text-green-600',
                    r.status === 'partial' && 'text-orange-600',
                    r.status === 'missed' && 'text-red-500',
                  )}
                >
                  {r.status === 'logged'
                    ? t('coach.report.logged')
                    : r.status === 'partial'
                      ? t('coach.report.partial')
                      : t('coach.report.missed')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.flags.length > 0 && (
        <p className="text-[9px] font-bold text-[var(--text-muted)]">
          {t('coach.report.flags')}: {facts.flags.join(', ')}
        </p>
      )}

    </div>
  );
}

function FactChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--background)] p-3 text-center">
      <p className="text-lg font-black text-[var(--text-primary)]">{value}</p>
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-0.5">{label}</p>
    </div>
  );
}

function SessionStatusBadge({
  row,
  t,
}: {
  row: SessionAdherenceRow;
  t: (k: string) => string;
}) {
  const color =
    row.status === 'completed'
      ? 'text-green-600'
      : row.status === 'partial'
        ? 'text-orange-600'
        : row.status === 'missed'
          ? 'text-red-500'
          : 'text-[var(--text-muted)]';
  return (
    <span className={cn('shrink-0 flex items-center gap-1', color)}>
      {row.status === 'completed' && <CheckCircle size={12} />}
      {row.status === 'missed' && <AlertCircle size={12} />}
      {row.status === 'completed' || row.status === 'partial'
        ? row.matchedWorkoutName
        : t('coach.report.missed')}
      {row.matchUncertain && ' ?'}
    </span>
  );
}
