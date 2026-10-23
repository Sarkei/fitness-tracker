/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import CoachAdherenceWidget from '@/src/components/dashboard/CoachAdherenceWidget';
import type { CoachDashboardSummary } from '@/src/lib/coach/coachDashboardSummary';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts';
import { motion } from 'motion/react';
import { useAuth } from '@/src/lib/AuthContext';
import { useWorkouts } from '@/src/lib/useWorkouts';
import { useNutrition } from '@/src/lib/useNutrition';
import { useAppBootstrap } from '@/src/lib/AppDataContext';
import PageBootstrap from '@/src/components/ui/PageBootstrap';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import EmptyState from '@/src/components/ui/EmptyState';
import {
  Activity,
  Apple,
  BarChart2,
  Clock,
  Dumbbell,
  FileText,
  Flame,
  Layers2,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Minus,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, subDays, eachDayOfInterval, startOfWeek } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import {
  computeExercisePRTable,
  computeVolumeByExercise,
  computeWeeklyEnergyBalance,
  KCAL_PER_KG_FAT_EQUIV,
} from '@/src/lib/fitnessInsights';
import {
  computeCardioAggregates,
  computeTopE1rmTable,
  computeVolumeByMuscle,
  dayTrainingVolume,
} from '@/src/lib/workoutAnalytics';
import { computeWeeklyFatigue } from '@/src/lib/fatigueScore';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';
import { resolveWeightHistoryForProfile } from '@/src/lib/weightHistory';

function dayKey(date: string | Date): string {
  return typeof date === 'string' ? date.split('T')[0] : format(new Date(date), 'yyyy-MM-dd');
}

const TT = {
  borderRadius: 12,
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border-muted)',
  fontSize: 11,
  fontWeight: 700,
} as const;

type NutritionStatsTooltipProps = {
  active?: boolean;
  payload?: readonly { payload?: Record<string, unknown> }[];
  t: (key: string) => string;
  dfLocale: typeof dfDe;
};

function NutritionStatsTooltip({ active, payload, t, dfLocale }: NutritionStatsTooltipProps) {
  if (!active || !payload?.length) return null;
  type Row = { key?: string; calories?: number; target?: number };
  type SeriesPt = { payload?: Record<string, unknown>; dataKey?: string | number; value?: number | string };
  const list = payload as unknown as SeriesPt[];
  /** Gemeinsame Datenzeile – Nährwerte immer aus diesem Objekt (nicht `value` einzelner Serien, vermeidet Verwechslung mit Ziel-Linie). */
  const row = list.find(p => p.payload != null)?.payload as Row | undefined;
  if (!row?.key) return null;
  const dateLabel = format(new Date(`${row.key}T12:00:00`), 'PP', { locale: dfLocale });
  const kcal = Math.round(Number(row.calories ?? 0));
  const targetK = Math.round(Number(row.target ?? 0));
  return (
    <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 py-2.5 shadow-lg max-w-[220px]">
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1.5">{dateLabel}</p>
      <p className="text-xs font-bold text-[var(--text-primary)]">
        {t('stats.chart.kcal')}: <span className="tabular-nums">{kcal}</span> kcal
      </p>
      <p className="text-xs font-bold text-amber-600 mt-0.5">
        {t('stats.chart.target')}: <span className="tabular-nums">{targetK}</span> kcal
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border-muted)] p-4 sm:p-5 flex gap-4 items-start">
      <div className={cn('p-3 rounded-xl shrink-0', accent)}>
        <Icon size={20} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
        <p className="text-xl sm:text-2xl font-black italic tracking-tighter text-[var(--text-primary)] mt-1">{value}</p>
        {hint ? <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium leading-snug">{hint}</p> : null}
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
  icon: Icon,
  iconClass,
  className,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  icon?: typeof Activity;
  iconClass?: string;
  className?: string;
  rightSlot?: ReactNode;
}) {
  const titleBlock = (
    <>
      <h3 className="text-lg sm:text-xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{title}</h3>
      {subtitle ? (
        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] mt-0.5 sm:mt-1">{subtitle}</p>
      ) : null}
    </>
  );

  if (Icon && iconClass) {
    return (
      <div className={cn('flex items-start justify-between gap-3', className ?? 'mb-4')}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn('p-3 rounded-xl shrink-0', iconClass)}>
            <Icon size={22} strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">{titleBlock}</div>
        </div>
        {rightSlot}
      </div>
    );
  }

  return (
    <div className={cn('mb-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{titleBlock}</div>
        {rightSlot}
      </div>
    </div>
  );
}

type GoalType = 'lose' | 'maintain' | 'gain';

function StatsGroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] whitespace-nowrap">{label}</span>
      <div className="h-px flex-1 bg-[var(--border-muted)]" />
    </div>
  );
}

/** Grün = Richtung passt zum Profilziel, Rot = eher contra Ziel (marke „brand“ durch konkrete Töne ersetzt). */
const TREND_OK = 'text-emerald-600 dark:text-emerald-400';
const TREND_BAD = 'text-red-500 dark:text-red-400';

/** Maintain: Ø kcal/Tag vs. Ziel (avgNet) – innerhalb ± dieses Werts = „auf Kurs“. */
const MAINTAIN_AVG_NET_KCAL_BAND = 250;

/** Maintain: kg/Woche-Schätzung, rechnerisch konsistent zu {@link MAINTAIN_AVG_NET_KCAL_BAND}. */
const maintainProjectedKgOkBand = (MAINTAIN_AVG_NET_KCAL_BAND * 7) / KCAL_PER_KG_FAT_EQUIV;

/** Abweichung Ø/Tag vs. Ziel (intake − burn − Tagesziel): Farbe abhängig vom Profilziel. */
function energyKcalTrendClass(goal: GoalType | undefined, avgNet: number): string {
  const g = goal ?? 'maintain';
  if (g === 'lose') return avgNet <= 0 ? TREND_OK : TREND_BAD;
  if (g === 'gain') return avgNet >= 0 ? TREND_OK : TREND_BAD;
  return Math.abs(avgNet) <= MAINTAIN_AVG_NET_KCAL_BAND ? TREND_OK : TREND_BAD;
}

/** Geschätzte kg/Wochenänderung – Farbe abhängig vom Profilziel; Maintain mit Band zu ±250 kcal/Tag. */
function energyKgTrendClass(goal: GoalType | undefined, projectedKgPerWeek: number): string {
  const g = goal ?? 'maintain';
  if (g === 'lose') return projectedKgPerWeek <= 0 ? TREND_OK : TREND_BAD;
  if (g === 'gain') return projectedKgPerWeek >= 0 ? TREND_OK : TREND_BAD;
  return Math.abs(projectedKgPerWeek) <= maintainProjectedKgOkBand ? TREND_OK : TREND_BAD;
}

export default function StatisticsPage() {
  const { profile } = useAuth();
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const { workouts } = useWorkouts();
  const { nutritionEntries } = useNutrition();
  const navigate = useNavigate();
  const { loading: bootstrapLoading, error: bootstrapError, retry: retryBootstrap } = useAppBootstrap();
  const [range, setRange] = useState<'7' | '14' | '30'>('14');
  const [coachSummary, setCoachSummary] = useState<CoachDashboardSummary | null>(null);

  useEffect(() => {
    void api<CoachDashboardSummary | null>('/api/coach/dashboard-summary')
      .then(setCoachSummary)
      .catch(() => setCoachSummary(null));
  }, []);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const dailyTargetKcal = profile?.goals?.dailyCalories || 2400;
  const goalType = (['lose', 'maintain', 'gain'].includes(String(profile?.goals?.type))
    ? profile?.goals?.type
    : 'maintain') as GoalType;

  const daySpan = range === '7' ? 7 : range === '14' ? 14 : 30;
  const rangeEnd = new Date();
  const rangeStart = subDays(rangeEnd, daySpan - 1);
  const dayKeys = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(d => format(d, 'yyyy-MM-dd')),
    [rangeStart, rangeEnd]
  );

  const rangeWorkouts = useMemo(
    () => workouts.filter(w => dayKeys.includes(dayKey(w.date))),
    [workouts, dayKeys],
  );

  const trainingSeries = useMemo(() => {
    return dayKeys.map(ds => {
      const dayWorkouts = workouts.filter(w => dayKey(w.date) === ds);
      const sessions = dayWorkouts.length;
      const volume = dayTrainingVolume(workouts, ds);
      const burned = dayWorkouts.reduce((s, w) => s + (w.caloriesBurned || 0), 0);
      return {
        key: ds,
        label: format(new Date(ds + 'T12:00:00'), 'EEE', { locale: dfLocale }),
        sessions,
        volume,
        burned,
      };
    });
  }, [dayKeys, workouts, dfLocale]);

  const nutritionByDay = useMemo(() => {
    const map = new Map<string, { kcal: number; p: number; c: number; f: number }>();
    for (const ds of dayKeys) map.set(ds, { kcal: 0, p: 0, c: 0, f: 0 });
    for (const e of nutritionEntries) {
      const ds = dayKey(e.date);
      const cur = map.get(ds);
      if (!cur) continue;
      const tot = effectiveNutritionTotals(e);
      cur.kcal += tot.calories;
      cur.p += tot.protein;
      cur.c += tot.carbs;
      cur.f += tot.fat;
    }
    return dayKeys.map(ds => {
      const x = map.get(ds)!;
      return {
        key: ds,
        label: format(new Date(ds + 'T12:00:00'), 'EEE', { locale: dfLocale }),
        calories: Math.round(x.kcal),
        protein: Math.round(x.p),
        carbs: Math.round(x.c),
        fat: Math.round(x.f),
        target: dailyTargetKcal,
      };
    });
  }, [dayKeys, nutritionEntries, dailyTargetKcal, dfLocale]);

  const weightHistory = useMemo(() => resolveWeightHistoryForProfile(profile), [profile]);
  const weightSeries = useMemo(() => {
    const sorted = [...weightHistory].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return sorted.slice(-24).map(w => ({
      date: format(new Date(w.date), 'd. MMM', { locale: dfLocale }),
      value: w.value,
    }));
  }, [weightHistory, dfLocale]);

  const weightDelta = useMemo(() => {
    const sorted = [...weightHistory].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (sorted.length < 2) return null;
    const first = sorted[0].value;
    const last = sorted[sorted.length - 1].value;
    return Math.round((last - first) * 10) / 10;
  }, [weightHistory]);

  const muscleBars = useMemo(() => {
    const rows = computeVolumeByMuscle(rangeWorkouts);
    const max = Math.max(...rows.map(r => r.volume), 1);
    const idMap: Record<string, string> = {
      brust: 'chest',
      rücken: 'back',
      beine: 'legs',
      arme: 'arms',
      core: 'core',
      schulter: 'shoulders',
    };
    return rows.map(r => ({
      id: idMap[r.muscleId] || r.muscleId,
      name: t(r.labelKey),
      pct: Math.round((r.volume / max) * 100),
      count: r.volume,
    }));
  }, [rangeWorkouts, t]);

  const weeklyFatigue = useMemo(() => computeWeeklyFatigue(workouts), [workouts]);
  const cardioAgg = useMemo(() => computeCardioAggregates(rangeWorkouts), [rangeWorkouts]);
  const e1rmTable = useMemo(() => computeTopE1rmTable(rangeWorkouts, 8), [rangeWorkouts]);
  const recentSessions = useMemo(
    () =>
      [...rangeWorkouts]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [rangeWorkouts],
  );

  const sessionsInRange = useMemo(() => trainingSeries.reduce((s, d) => s + d.sessions, 0), [trainingSeries]);
  const volumeInRange = useMemo(() => trainingSeries.reduce((s, d) => s + d.volume, 0), [trainingSeries]);
  const nutritionDaysLogged = useMemo(() => nutritionByDay.filter(d => d.calories > 0).length, [nutritionByDay]);
  const avgKcalInRange = useMemo(() => {
    const sum = nutritionByDay.reduce((s, d) => s + d.calories, 0);
    return Math.round(sum / Math.max(1, nutritionDaysLogged));
  }, [nutritionByDay, nutritionDaysLogged]);
  const hasNutritionInRange = nutritionDaysLogged > 0;
  const hasTrainingInRange = sessionsInRange > 0;

  const activeTrainDays = useMemo(() => {
    const set = new Set(workouts.map(w => dayKey(w.date)));
    return [...set].filter(d => dayKeys.includes(d)).length;
  }, [workouts, dayKeys]);

  const consistencyPct = Math.min(100, Math.round((activeTrainDays / Math.max(1, daySpan)) * 100));

  const prTable = useMemo(() => computeExercisePRTable(workouts).slice(0, 8), [workouts]);
  const topVolume = useMemo(() => computeVolumeByExercise(rangeWorkouts).slice(0, 5), [rangeWorkouts]);

  const energyWeek = useMemo(
    () => computeWeeklyEnergyBalance(workouts, nutritionEntries, weekStart, dailyTargetKcal),
    [workouts, nutritionEntries, weekStart, dailyTargetKcal]
  );

  const energyReliable = energyWeek.estimateReliable;
  const kcalTrendClass = energyKcalTrendClass(goalType, energyWeek.avgNet);
  const kgTrendClass = energyKgTrendClass(goalType, energyWeek.projectedKgDelta);

  const TrendIcon =
    weightDelta == null ? Minus : weightDelta > 0.05 ? TrendingUp : weightDelta < -0.05 ? TrendingDown : Minus;
  const trendColor =
    weightDelta == null
      ? 'text-[var(--text-muted)]'
      : weightDelta > 0.05
        ? 'text-orange-500'
        : weightDelta < -0.05
          ? 'text-brand'
          : 'text-[var(--text-muted)]';

  const hasTraining = workouts.length > 0;
  const hasNutrition = nutritionEntries.length > 0;

  if (bootstrapLoading) {
    return <PageBootstrap label={t('stats.loading')} />;
  }

  if (bootstrapError) {
    return (
      <ErrorBanner
        message={t('common.error.bootstrap')}
        onRetry={() => void retryBootstrap()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-12 pb-4 lg:pb-16 max-w-6xl mx-auto">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--text-muted)]">{t('stats.subtitle.label')}</p>
          <h1 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter text-[var(--text-primary)] mt-1">
            {t('stats.title')}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2 max-w-xl font-medium leading-relaxed">{t('stats.subtitle.text')}</p>
        </div>
        <div className="flex rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-1 shrink-0 w-full sm:w-auto">
          {(
            [
              ['7', 'stats.range.7'],
              ['14', 'stats.range.14'],
              ['30', 'stats.range.30'],
            ] as const
          ).map(([k, labKey]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={cn(
                'flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all min-h-[44px]',
                range === k ? 'ui-btn-brand shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              {t(labKey)}
            </button>
          ))}
        </div>
      </header>

      {coachSummary && <CoachAdherenceWidget summary={coachSummary} />}

      <Link
        to="/profile"
        state={{ tab: 'reports' }}
        className="flex items-start gap-4 rounded-2xl border border-brand/25 bg-brand/5 p-5 hover:border-brand/40 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
          <FileText size={20} className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-brand">{t('dash.userReport.title')}</p>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-1 leading-relaxed">{t('stats.userReport.cta')}</p>
          <span className="inline-block mt-2 text-[9px] font-black uppercase tracking-widest text-brand">
            {t('stats.userReport.open')} →
          </span>
        </div>
      </Link>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label={t('stats.kpi.sessions')}
          value={String(sessionsInRange)}
          hint={t('stats.kpi.sessionsHint', {
            days: activeTrainDays,
            avg: (sessionsInRange / Math.max(1, daySpan)).toFixed(1),
          })}
          icon={Dumbbell}
          accent="bg-rose-500/15 text-rose-600"
        />
        <Kpi
          label={t('stats.kpi.volume')}
          value={volumeInRange > 999 ? `${(volumeInRange / 1000).toFixed(1)}k` : String(volumeInRange)}
          hint={t('stats.kpi.volumeHint')}
          icon={Activity}
          accent="bg-blue-500/15 text-blue-600"
        />
        <Kpi
          label={t('stats.kpi.avgKcal')}
          value={`${avgKcalInRange} kcal`}
          hint={t('stats.kpi.avgKcalHint', {
            goal: dailyTargetKcal,
            days: nutritionDaysLogged,
          })}
          icon={Apple}
          accent="bg-teal-500/15 text-teal-600"
        />
        <Kpi
          label={t('stats.kpi.presence')}
          value={`${consistencyPct}%`}
          hint={t('stats.kpi.presenceHint')}
          icon={Target}
          accent="bg-violet-500/15 text-violet-600"
        />
      </section>

      {hasTraining && (
        <motion.section
          initial={false}
          className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8"
        >
          <SectionTitle
            title={t('stats.fatigue.title')}
            subtitle={t('stats.fatigue.sub')}
            icon={Zap}
            iconClass={cn(
              weeklyFatigue.score >= 75
                ? 'bg-red-500/15 text-red-600'
                : weeklyFatigue.score >= 55
                  ? 'bg-orange-500/15 text-orange-600'
                  : 'bg-emerald-500/15 text-emerald-600',
            )}
          />
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'text-4xl font-black italic tabular-nums',
                  weeklyFatigue.score >= 75
                    ? 'text-red-500'
                    : weeklyFatigue.score >= 55
                      ? 'text-orange-500'
                      : 'text-emerald-600',
                )}
              >
                {weeklyFatigue.score}
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
                  {t(weeklyFatigue.labelKey)}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">{t('stats.fatigue.scoreHint')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('stats.fatigue.avgRpe')}</p>
                <p className="text-lg font-black tabular-nums mt-1">{weeklyFatigue.avgRpe ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('stats.fatigue.volume')}</p>
                <p className="text-lg font-black tabular-nums mt-1">{weeklyFatigue.volumeKg} kg</p>
              </div>
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('stats.fatigue.sessions')}</p>
                <p className="text-lg font-black tabular-nums mt-1">{weeklyFatigue.sessions}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('stats.fatigue.sleep')}</p>
                <p className="text-lg font-black tabular-nums mt-1">
                  {weeklyFatigue.sleepAvgMin != null ? `${Math.round(weeklyFatigue.sleepAvgMin / 60)}h` : '—'}
                </p>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      <div className="space-y-3">
        <StatsGroupDivider label={t('stats.group.nutrition')} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <motion.section
            initial={false}
            className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8"
          >
            <SectionTitle
              title={t('stats.section.nutrition')}
              subtitle={t('stats.section.nutritionSub')}
              icon={Apple}
              iconClass="bg-teal-500/15 text-teal-600"
            />
            {!hasNutritionInRange ? (
              <EmptyState
                icon={Apple}
                title={
                  nutritionEntries.length > 0
                    ? t('stats.empty.nutritionRange')
                    : t('stats.empty.nutrition')
                }
                action={{ label: t('stats.empty.nutritionCta'), onClick: () => navigate('/nutrition') }}
              />
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={nutritionByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} />
                    <Tooltip content={props => <NutritionStatsTooltip {...props} t={t} dfLocale={dfLocale} />} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 800, paddingTop: 12 }} />
                    <Bar dataKey="calories" name={t('stats.chart.kcal')} fill="#14b8a6" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Line type="monotone" dataKey="target" name={t('stats.chart.target')} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.section>

          <motion.section
            initial={false}
            className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8"
          >
            <SectionTitle
              title={t('stats.energy.title')}
              subtitle={t('stats.energy.sub')}
              icon={Flame}
              iconClass="bg-rose-500/15 text-rose-600"
            />
            {!hasNutritionInRange ? (
              <EmptyState
                icon={Flame}
                title={t('stats.empty.energy')}
                action={{ label: t('stats.empty.nutritionCta'), onClick: () => navigate('/nutrition') }}
              />
            ) : (
            <>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={energyWeek.days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} />
                  <Tooltip
                    contentStyle={TT}
                    formatter={(value: number | string) => {
                      const n = Math.round(Number(value));
                      const s = `${n > 0 ? '+' : ''}${n} kcal`;
                      return [s, t('stats.energy.balanceLine')];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 800 }} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" strokeOpacity={0.45} />
                  <Line
                    type="monotone"
                    dataKey="balanceVsTarget"
                    name={t('stats.energy.balanceLine')}
                    stroke="#14b8a6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#14b8a6', stroke: 'var(--card-bg)', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-4 flex gap-3 items-start">
                <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-600 shrink-0">
                  <Scale size={20} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">{t('stats.energy.trend')}</p>
                  <p className={cn('text-sm font-black tabular-nums', kgTrendClass)}>
                    {t('stats.energy.trendVal', {
                      n: `${energyWeek.projectedKgDelta >= 0 ? '+' : ''}${energyWeek.projectedKgDelta.toFixed(2)}`,
                    })}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-4 flex gap-3 items-start">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 shrink-0">
                  <Zap size={20} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">{t('stats.energy.avgNet')}</p>
                  <p className={cn('text-sm font-black tabular-nums', kcalTrendClass)}>
                    {t('stats.energy.avgNetVal', { n: Math.round(energyWeek.avgNet) })}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-3 leading-relaxed">
              {t('stats.energy.footnote')}
              {!energyReliable ? ` ${t('stats.energy.unreliableTrend')}` : ''}
            </p>
            </>
            )}
          </motion.section>
        </div>
      </div>

      <div className="space-y-6 lg:space-y-8 mt-8 sm:mt-10">
        <StatsGroupDivider label={t('stats.group.training')} />
        <motion.section
          initial={false}
          className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8"
        >
          <SectionTitle
            title={t('stats.section.train')}
            subtitle={t('stats.section.trainSub')}
            icon={Dumbbell}
            iconClass="bg-indigo-500/15 text-indigo-600"
          />
          {!hasTrainingInRange ? (
            <EmptyState
              icon={Dumbbell}
              title={
                workouts.length > 0 ? t('stats.empty.workoutsRange') : t('stats.empty.workouts')
              }
              action={{ label: t('stats.empty.workoutsCta'), onClick: () => navigate('/workouts') }}
            />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trainingSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={36} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} />
                  <Tooltip contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 800, paddingTop: 12 }} />
                  <Bar yAxisId="left" dataKey="sessions" name={t('stats.chart.sessions')} fill="var(--brand, #14b8a6)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" type="monotone" dataKey="volume" name={t('stats.chart.volume')} stroke="#6366f1" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.section>

        {cardioAgg.sessions > 0 && (
          <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8">
            <SectionTitle
              title={t('stats.cardio.title')}
              subtitle={t('stats.cardio.sub')}
              icon={Activity}
              iconClass="bg-orange-500/15 text-orange-600"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Kpi
                label={t('stats.cardio.sessions')}
                value={String(cardioAgg.sessions)}
                icon={Activity}
                accent="bg-orange-500/15 text-orange-600"
              />
              <Kpi
                label={t('stats.cardio.minutes')}
                value={String(cardioAgg.totalMinutes)}
                icon={Clock}
                accent="bg-sky-500/15 text-sky-600"
              />
              <Kpi
                label={t('stats.cardio.km')}
                value={`${cardioAgg.totalKm}`}
                icon={Target}
                accent="bg-teal-500/15 text-teal-600"
              />
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8">
          <SectionTitle
            title={t('stats.section.weight')}
            subtitle={t('stats.section.weightSub')}
            icon={Scale}
            iconClass="bg-cyan-500/15 text-cyan-600"
            rightSlot={
              weightDelta != null ? (
                <div className={cn('flex items-center gap-1 text-sm font-black shrink-0', trendColor)}>
                  <TrendIcon size={18} />
                  <span>
                    {weightDelta > 0 ? '+' : ''}
                    {weightDelta} kg
                  </span>
                </div>
              ) : null
            }
          />
          {weightSeries.length === 0 ? (
            <EmptyState
              icon={Scale}
              title={t('stats.empty.weight')}
              action={{ label: t('stats.empty.weightCta'), onClick: () => navigate('/profile') }}
              className="border-0 bg-transparent p-6"
            />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightSeries}>
                  <defs>
                    <linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand, #14b8a6)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--brand, #14b8a6)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={36} />
                  <Tooltip contentStyle={TT} />
                  <Area type="monotone" dataKey="value" stroke="var(--brand, #14b8a6)" fill="url(#wgrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8">
          <SectionTitle
            title={t('stats.section.muscle')}
            subtitle={t('stats.section.muscleSub')}
            icon={Layers2}
            iconClass="bg-violet-500/15 text-violet-600"
          />
          {!hasTrainingInRange ? (
            <EmptyState
              icon={Layers2}
              title={
                workouts.length > 0 ? t('stats.empty.workoutsRange') : t('stats.empty.workouts')
              }
              action={{ label: t('stats.empty.workoutsCta'), onClick: () => navigate('/workouts') }}
            />
          ) : (
            <ul className="space-y-3">
              {muscleBars.map(m => (
                <li key={m.id}>
                  <div className="flex justify-between text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">
                    <span className="text-[var(--text-primary)]">{m.name}</span>
                    <span>{m.count > 999 ? `${(m.count / 1000).toFixed(1)}k` : m.count} kg×Wdh.</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden border border-[var(--border-muted)]">
                    <motion.div
                      className="h-full bg-brand rounded-full"
                      initial={false}
                      animate={{ width: `${m.pct}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8 flex flex-col">
          <SectionTitle
            title={t('stats.section.topVol')}
            subtitle={t('stats.section.topVolSub')}
            icon={BarChart2}
            iconClass="bg-amber-500/15 text-amber-600"
          />
          {!hasTrainingInRange || topVolume.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              title={
                workouts.length > 0 ? t('stats.empty.workoutsRange') : t('stats.empty.workouts')
              }
              action={{ label: t('stats.empty.workoutsCta'), onClick: () => navigate('/workouts') }}
            />
          ) : (
            <ol className="space-y-3 flex-1">
              {topVolume.map((row, i) => (
                <li key={row.name} className="flex justify-between gap-2 text-xs font-bold">
                  <span className="text-[var(--text-muted)] w-5 shrink-0">{i + 1}.</span>
                  <span className="flex-1 truncate text-[var(--text-primary)]">{row.name}</span>
                  <span className="text-brand shrink-0">{row.volume.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      </div>

      {e1rmTable.length > 0 && (
        <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8 mt-8 sm:mt-10">
          <SectionTitle
            title={t('stats.e1rm.title')}
            subtitle={t('stats.e1rm.sub')}
            icon={Zap}
            iconClass="bg-indigo-500/15 text-indigo-600"
            className="mb-6"
          />
          <ol className="space-y-2">
            {e1rmTable.map((row, i) => (
              <li key={row.exercise} className="flex justify-between gap-2 text-xs font-bold border-t border-[var(--border-muted)] pt-2 first:border-0 first:pt-0">
                <span className="text-[var(--text-muted)] w-5">{i + 1}.</span>
                <span className="flex-1 truncate text-[var(--text-primary)]">{row.exercise}</span>
                <span className="text-indigo-600 shrink-0 tabular-nums">{row.e1rmKg} kg e1RM</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recentSessions.length > 0 && (
        <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8 mt-8 sm:mt-10">
          <SectionTitle
            title={t('stats.history.title')}
            subtitle={t('stats.history.sub')}
            icon={Clock}
            iconClass="bg-neutral-500/15 text-neutral-600"
            className="mb-6"
          />
          <ul className="space-y-2">
            {recentSessions.map(w => (
              <li key={w.id} className="flex justify-between gap-2 text-xs font-bold py-2 border-t border-[var(--border-muted)] first:border-0">
                <span className="text-[var(--text-primary)] truncate">{w.name}</span>
                <span className="text-[var(--text-muted)] shrink-0 tabular-nums">
                  {format(new Date(w.date), 'd. MMM', { locale: dfLocale })} · {w.duration} min
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-[var(--card-bg)] rounded-[2rem] border border-[var(--border-muted)] p-5 sm:p-8 mt-8 sm:mt-10">
        <SectionTitle
          title={t('stats.pr.title')}
          subtitle={t('stats.pr.sub')}
          icon={Trophy}
          iconClass="bg-amber-500/15 text-amber-600"
          className="mb-6"
        />
        {prTable.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t('stats.pr.empty')}
            action={{ label: t('stats.empty.workoutsCta'), onClick: () => navigate('/workouts') }}
            className="border-0 bg-transparent p-6"
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-muted)]">
            <table className="w-full text-left text-xs min-w-[340px]">
              <thead>
                <tr className="bg-[var(--background)] text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="py-3 px-3">{t('stats.pr.col.exercise')}</th>
                  <th className="py-3 px-3">{t('stats.pr.col.maxkg')}</th>
                  <th className="py-3 px-3">{t('stats.pr.col.bestset')}</th>
                  <th className="py-3 px-3">{t('stats.pr.col.logs')}</th>
                </tr>
              </thead>
              <tbody>
                {prTable.map(row => (
                  <tr key={row.exercise} className="border-t border-[var(--border-muted)] font-bold text-[var(--text-primary)]">
                    <td className="py-2.5 px-3 max-w-[160px] truncate">{row.exercise}</td>
                    <td className="py-2.5 px-3">{row.maxWeight}</td>
                    <td className="py-2.5 px-3">{row.bestVolumeSet}</td>
                    <td className="py-2.5 px-3 text-[var(--text-muted)]">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
