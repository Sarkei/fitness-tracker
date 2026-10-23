/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, Flame, Droplets, Moon, Footprints, Brain, Clock, ChevronRight, Star, X, Trophy, Apple, TrendingUp, RotateCcw, Dumbbell, Loader2, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/src/lib/utils';
import { format, subDays } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { useAuth } from '@/src/lib/AuthContext';
import { useWorkouts, useNutrition, useCoachPlans, useAppBootstrap } from '@/src/lib/AppDataContext';
import PageBootstrap from '@/src/components/ui/PageBootstrap';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import { formatUserError } from '@/src/lib/formatUserError';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';
import { useMemo, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/src/lib/api';
import NutritionLogSheet from '../nutrition/NutritionLogSheet';
import { MealCategory, SleepLogEntry } from '@/src/types';
import { getMealTypeForCurrentTime } from '@/src/lib/mealTime';
import { tryCoachAutoAdvanceForActivePlans } from '@/src/lib/coach/coachAutoAdvance';
import UserWeeklyReportDocument from '@/src/components/reports/UserWeeklyReportDocument';
import type { UserWeeklyReportPayload } from '@/src/lib/weeklyReport/userWeeklyReportSchema';
import { useUserWeeklyReportBanner } from '@/src/lib/hooks/useUserWeeklyReportBanner';
import {
  mobileSheetOverlayClass,
  MobileOverlayRoot,
  forceReleaseAllOverlayScrollLocks,
  resetMobileChromeAfterOverlay,
} from '@/src/lib/mobileViewport';
import { getWorkoutStreak, getNutritionStreak } from '@/src/lib/fitnessInsights';
import { computeWeeklyDigest } from '@/src/lib/weeklyDigest';
import { getLastCompletedWorkout } from '@/src/lib/repeatLastWorkout';
import { ManualStepsModal, ManualSleepModal } from './ActivityLogModals';
import { useI18n } from '@/src/lib/i18n';
import {
  coachScheduleRowsForCalendarDate,
  isCoachWeekActiveToday,
  parseCoachStartYmd,
} from '@/src/lib/coachWeekDisplay';
import { applyManualPlanWeekOverrides, manualPlanWeekStartYmd } from '@/src/lib/manualPlanWeekOverrides';
import CoachAdherenceWidget from './CoachAdherenceWidget';
import ResumeWorkoutBanner from './ResumeWorkoutBanner';
import EmptyState from '@/src/components/ui/EmptyState';
import type { CoachDashboardSummary } from '@/src/lib/coach/coachDashboardSummary';

/** Einheitlicher grüner Rahmen beim Hover für alle Dashboard-Kacheln */
const dashCardHover =
  'border border-[var(--border-muted)] hover:border-brand transition-all';
const topCardActionButton =
  'w-full min-h-[48px] px-3 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--border-muted)] hover:border-brand transition-all text-[10px] font-black uppercase tracking-widest leading-tight flex items-center justify-center gap-2 text-center';

const StatCard = ({
  title,
  value,
  target,
  unit,
  color,
  icon: Icon,
  footer,
  footerClassName,
  className,
  goalLabel,
}: {
  title: string;
  value: string | number;
  target?: number;
  unit: string;
  color: string;
  icon: LucideIcon;
  footer?: ReactNode;
  footerClassName?: string;
  className?: string;
  goalLabel?: string;
}) => (
  <div
    className={cn(
      'bg-[var(--card-bg)] p-5 md:p-6 rounded-[2rem] lg:rounded-[2.5rem] shadow-sm group flex flex-col h-full min-h-0',
      dashCardHover,
      className,
    )}
  >
    <div className="flex min-h-[112px] flex-col items-start gap-3">
      <div className={cn('h-10 w-10 rounded-xl text-white flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={16} />
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{title}</p>
      <h4 className="text-3xl md:text-[2rem] font-black italic tracking-tighter uppercase leading-none">
        {value}
        <span className="text-[10px] md:text-xs ml-1.5 font-black text-[var(--text-muted)] not-italic">{unit}</span>
      </h4>
      {target != null && (
        <p className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">
          {goalLabel ?? 'Goal'} <span className="text-[var(--text-primary)]">{target} {unit}</span>
        </p>
      )}
    </div>
    {footer ? <div className={cn('mt-auto pt-5', footerClassName)}>{footer}</div> : null}
  </div>
);

export default function Dashboard() {
  const location = useLocation();
  const { profile, updateProfile } = useAuth();
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const { workouts } = useWorkouts();
  const { nutritionEntries, addMeal, refetch: refetchNutrition } = useNutrition();
  const navigate = useNavigate();

  const [foodLog, setFoodLog] = useState<{ active: boolean; category: MealCategory | null }>({
    active: false,
    category: null,
  });
  const today = new Date();
  const todayString = format(today, 'yyyy-MM-dd');

  // ── Coach weekly report notification ──────────────────────────────────────
  const [coachReport, setCoachReport] = useState<any>(null);
  const [showUserWeeklyReport, setShowUserWeeklyReport] = useState(false);
  const {
    row: userWeeklyReport,
    dismissed: userReportDismissed,
    dismiss: dismissUserWeeklyReport,
  } = useUserWeeklyReportBanner(true);

  const closeUserWeeklyReport = () => {
    setShowUserWeeklyReport(false);
    forceReleaseAllOverlayScrollLocks();
    resetMobileChromeAfterOverlay();
  };
  const [coachSummary, setCoachSummary] = useState<CoachDashboardSummary | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportDismissed, setReportDismissed] = useState(false);

  const [stepsModalOpen, setStepsModalOpen] = useState(false);
  const [sleepModalOpen, setSleepModalOpen] = useState(false);

  const { coachPlans } = useCoachPlans();
  const { loading: bootstrapLoading, error: bootstrapError, retry: retryBootstrap } = useAppBootstrap();
  const [coachFetchError, setCoachFetchError] = useState(false);
  const [activitySaveError, setActivitySaveError] = useState('');

  const openFoodLog = () => {
    setFoodLog({ active: true, category: getMealTypeForCurrentTime() });
  };

  const closeFoodLog = () => {
    setFoodLog({ active: false, category: null });
  };

  useEffect(() => {
    const st = location.state as { quickAction?: string } | null;
    if (st?.quickAction === 'steps') setStepsModalOpen(true);
    if (st?.quickAction === 'sleep') setSleepModalOpen(true);
    if (st?.quickAction) window.history.replaceState({}, document.title);
  }, [location.state]);

  const loadCoachExtras = useCallback(async () => {
    setCoachFetchError(false);
    try {
      await tryCoachAutoAdvanceForActivePlans(coachPlans);
      const [reportRes, summaryRes] = await Promise.allSettled([
        api<any>('/api/coach/latest-report'),
        api<CoachDashboardSummary | null>('/api/coach/dashboard-summary'),
      ]);
      if (reportRes.status === 'fulfilled' && reportRes.value) {
        const data = reportRes.value;
        const dismissKey = `coach_report_dismissed_${data.plan_id}_${data.week_number}`;
        setReportDismissed(localStorage.getItem(dismissKey) === '1');
        const generatedAt = new Date(data.generated_at);
        const daysSince = (Date.now() - generatedAt.getTime()) / 86400000;
        if (daysSince <= 21) setCoachReport(data);
        else setCoachReport(null);
      } else {
        setCoachReport(null);
      }
      if (summaryRes.status === 'fulfilled') setCoachSummary(summaryRes.value);
      else setCoachSummary(null);
      if (reportRes.status === 'rejected' || summaryRes.status === 'rejected') {
        setCoachFetchError(true);
      }
    } catch {
      setCoachFetchError(true);
      setCoachSummary(null);
    }
  }, [coachPlans]);

  useEffect(() => {
    void loadCoachExtras();
  }, [coachPlans, loadCoachExtras]);

  const dismissReport = () => {
    if (coachReport?.plan_id != null && coachReport?.week_number != null) {
      const key = `coach_report_dismissed_${coachReport.plan_id}_${coachReport.week_number}`;
      localStorage.setItem(key, '1');
    }
    setReportDismissed(true);
  };

  const closeCoachReport = () => {
    setShowReport(false);
    dismissReport();
    forceReleaseAllOverlayScrollLocks();
    resetMobileChromeAfterOverlay();
  };

  const todayEntries = nutritionEntries.filter(entry => {
    const entryDate = typeof entry.date === 'string' ? entry.date.split('T')[0] : format(new Date(entry.date), 'yyyy-MM-dd');
    return entryDate === todayString;
  });
  const consumedCalories = todayEntries.reduce((sum, e) => sum + effectiveNutritionTotals(e).calories, 0);
  const baseCalorieTarget = profile?.goals?.dailyCalories || 2400;
  const activeBurnToday = useMemo(() => {
    return workouts.reduce((sum, w) => {
      const d = typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd');
      if (d !== todayString) return sum;
      return sum + (w.caloriesBurned || 0);
    }, 0);
  }, [workouts, todayString]);
  const adjustedCalorieTarget = Math.max(0, Math.round(baseCalorieTarget + activeBurnToday));
  const calProgress = Math.min(100, (consumedCalories / Math.max(1, adjustedCalorieTarget)) * 100);

  const stepsToday = profile?.dailyActivityLog?.stepsByDate?.[todayString] ?? 0;
  const stepsGoal = profile?.goals?.dailySteps ?? 10000;
  const stepsProgress = Math.min(100, (stepsToday / Math.max(1, stepsGoal)) * 100);

  const sleepGoalMinutes = 8 * 60;
  const sleepToday = profile?.dailyActivityLog?.sleepByDate?.[todayString];
  const sleepMinutes = sleepToday?.totalMinutes ?? 0;
  const sleepProgress = Math.min(100, (sleepMinutes / sleepGoalMinutes) * 100);
  const sleepHoursDisplay = sleepMinutes > 0 ? Math.round((sleepMinutes / 60) * 10) / 10 : 0;

  const persistSteps = async (date: string, steps: number) => {
    if (!profile) return;
    setActivitySaveError('');
    try {
      const log = profile.dailyActivityLog || {};
      await updateProfile({
        dailyActivityLog: {
          ...log,
          stepsByDate: { ...(log.stepsByDate || {}), [date]: steps },
        },
      });
    } catch (err: unknown) {
      setActivitySaveError(formatUserError(err, t, 'dash.saveFailed'));
    }
  };

  const persistSleep = async (date: string, entry: SleepLogEntry) => {
    if (!profile) return;
    setActivitySaveError('');
    try {
      const log = profile.dailyActivityLog || {};
      await updateProfile({
        dailyActivityLog: {
          ...log,
          sleepByDate: { ...(log.sleepByDate || {}), [date]: entry },
        },
      });
    } catch (err: unknown) {
      setActivitySaveError(formatUserError(err, t, 'dash.saveFailed'));
    }
  };

  // Unifies logic to find today's workout from either AI Coach or manual plan
  const todayWorkout = useMemo(() => {
    const today = new Date();
    const todayDayName = format(today, 'EEEE'); // e.g., "Monday"

    const normalizeRest = (d: any) => {
      if (!d) return d;
      const isRest =
        d.isRestDay === true ||
        d.isRest === true ||
        String(d.sessionType || '').toLowerCase() === 'rest' ||
        String(d.type || '').toLowerCase() === 'rest' ||
        /\brest\b|recovery|ruhetag|ruhe|freier tag/i.test(String(d.title || ''));
      return { ...d, isRestDay: !!isRest };
    };

    // 1. Check for active AI Coach plan first
    const activeCoachPlan = coachPlans.find(p => p.type === 'workout' && p.status === 'active');
    if (activeCoachPlan?.current_schedule?.schedule?.schedule) {
      const startYmd = parseCoachStartYmd(activeCoachPlan.current_schedule?.start_date);
      if (startYmd && isCoachWeekActiveToday(startYmd, today)) {
        const rows = coachScheduleRowsForCalendarDate(
          startYmd,
          today,
          activeCoachPlan.current_schedule.schedule.schedule,
        );
        const raw = rows[0];
        return normalizeRest(raw) ?? null;
      }
      return null;
    }

    // 2. Fallback to manual plan from profile (inkl. temporärer Wochen-Tausche)
    if (profile?.workoutPlan?.schedule) {
      const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1; // Adjust for Monday start
      const dayNumber = dayIndex + 1;
      const raw = profile.workoutPlan.schedule.find(s => s.day === dayNumber);
      if (!raw) return null;
      const weekStartYmd = manualPlanWeekStartYmd(null, today);
      const withOverrides = applyManualPlanWeekOverrides(
        raw,
        dayNumber,
        weekStartYmd,
        profile.manualPlanWeekOverrides,
      );
      return normalizeRest(withOverrides) ?? null;
    }

    return null;
  }, [profile?.workoutPlan, coachPlans, today]);

  const recentActivity = workouts.slice(0, 3);

  const workoutStreak = useMemo(() => getWorkoutStreak(workouts), [workouts]);
  const nutritionStreak = useMemo(() => getNutritionStreak(nutritionEntries), [nutritionEntries]);
  const lastCompletedWorkout = useMemo(() => getLastCompletedWorkout(workouts), [workouts]);
  const weeklyDigest = useMemo(
    () => (profile ? computeWeeklyDigest(workouts, nutritionEntries, profile) : null),
    [workouts, nutritionEntries, profile],
  );

  const waterTargetMl = profile?.goals?.dailyWaterMl ?? 2500;
  const waterTodayMl = profile?.dailyWaterLog?.[todayString] ?? 0;
  const waterProgress = Math.min(100, (waterTodayMl / Math.max(1, waterTargetMl)) * 100);

  const logWater = async (deltaMl: number) => {
    if (!profile) return;
    setActivitySaveError('');
    try {
      const next = { ...(profile.dailyWaterLog || {}), [todayString]: Math.max(0, waterTodayMl + deltaMl) };
      await updateProfile({ dailyWaterLog: next });
    } catch (err: unknown) {
      setActivitySaveError(formatUserError(err, t, 'dash.saveFailed'));
    }
  };

  const [chartView, setChartView] = useState<'calories' | 'protein' | 'macros' | 'workouts' | 'balance'>('workouts');

  const chartData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dayStr = format(d, 'yyyy-MM-dd');
      const dayEntries = nutritionEntries.filter(e =>
        (typeof e.date === 'string' ? e.date.split('T')[0] : format(new Date(e.date), 'yyyy-MM-dd')) === dayStr
      );
      const dayWorkouts = workouts.filter(w =>
        format(new Date(w.date), 'yyyy-MM-dd') === dayStr
      );
      const totals = dayEntries.reduce(
        (s, e) => {
          const tot = effectiveNutritionTotals(e);
          return {
            calories: s.calories + tot.calories,
            protein: s.protein + tot.protein,
            carbs: s.carbs + tot.carbs,
            fat: s.fat + tot.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );
      const calories = totals.calories;
      const protein = Math.round(totals.protein);
      const carbs = Math.round(totals.carbs);
      const fat = Math.round(totals.fat);
      const workoutCount = dayWorkouts.length;
      const targetCalories = profile?.goals?.dailyCalories || 2400;
      return {
        name: format(d, 'EEE', { locale: dfLocale }),
        calories,
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
        workouts: workoutCount,
        balance: calories - targetCalories,   // positive = surplus, negative = deficit
        target: targetCalories,
      };
    });
  }, [nutritionEntries, workouts, profile?.goals?.dailyCalories, dfLocale]);

  const intelligenceCard = useMemo(
    () => (
      <div className={cn('bg-black text-white p-6 sm:p-8 lg:p-10 rounded-[2rem] lg:rounded-[2.5rem] shadow-2xl shadow-black/20 flex flex-col h-full min-h-0 relative overflow-hidden', dashCardHover)}>
        <div className="absolute top-0 right-0 p-6 md:p-8 opacity-10 pointer-events-none">
          <Brain size={120} />
        </div>
        <div className="flex justify-between items-start gap-3 relative z-10 mb-6 md:mb-8 shrink-0">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">{t('dash.intelligence')}</h3>
        </div>
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          {todayWorkout ? (
            <div className="space-y-4 md:space-y-6 flex flex-col flex-1 min-h-0">
              <div>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">{t('dash.intel.targetProtocol')}</p>
                <h4 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter">
                  {todayWorkout.isRestDay ? t('dash.rest') : todayWorkout.title}
                </h4>
              </div>
              {!todayWorkout.isRestDay && (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-brand shrink-0" />
                    <span className="text-xs font-bold uppercase">
                      {t('dash.intel.capacity', { m: profile?.coachPreferences?.sessionDuration || 60 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-brand shrink-0" />
                    <span className="text-xs font-bold uppercase">
                      {t('dash.intel.zones', { n: todayWorkout.exercises?.length ?? 0 })}
                    </span>
                  </div>
                </div>
              )}
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/workouts')}
                  className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-brand hover:text-white transition-colors"
                >
                  {t('dash.goCombat')} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 gap-6 py-2">
              <p className="text-gray-500 font-medium italic text-sm flex-1">{t('dash.noPlan')}</p>
              <button
                type="button"
                onClick={() => navigate('/workouts')}
                className="w-full ui-btn-brand py-4 rounded-2xl text-[10px] flex items-center justify-center gap-2 mt-auto"
              >
                {t('dash.initCoach')} <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    ),
    [todayWorkout, profile?.coachPreferences?.sessionDuration, navigate, t],
  );

  const recentCard = useMemo(
    () => (
      <div className={cn('bg-[var(--card-bg)] p-6 md:p-8 rounded-[2rem] lg:rounded-[2.5rem] shadow-sm flex flex-col h-full min-h-0', dashCardHover)}>
        <div className="flex justify-between items-center gap-3 mb-6 md:mb-8 shrink-0">
          <h3 className="font-black italic uppercase text-sm tracking-tighter">{t('dash.recent')}</h3>
          <Link
            to="/workouts"
            className="text-[var(--text-muted)] hover:text-brand text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-all shrink-0"
          >
            {t('dash.viewHistory')} <ChevronRight size={14} />
          </Link>
        </div>
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title={t('dash.recent.empty')}
              action={{
                label: t('dash.recent.emptyCta'),
                onClick: () => navigate('/workouts'),
              }}
              className="flex-1 border-0 shadow-none p-6"
            />
          ) : (
            recentActivity.map((activity, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigate('/workouts')}
                className="flex items-center justify-between group w-full text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:border-brand/40 group-hover:bg-brand/10 group-hover:text-brand transition-all shrink-0">
                    <Activity size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-tight truncate">{activity.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                      {format(new Date(activity.date), 'PP', { locale: dfLocale })} • {activity.duration}{' '}
                      {t('dash.min')}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-black italic shrink-0 ml-2">
                  {activity.caloriesBurned}{' '}
                  <span className="text-[10px] not-italic text-[var(--text-muted)] uppercase font-black">
                    {t('dash.unit.kcal')}
                  </span>
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    ),
    [recentActivity, navigate, t, dfLocale],
  );

  const weeklyReportCard = useMemo(() => {
    if (!weeklyDigest) return null;
    return (
      <div className={cn('bg-[var(--card-bg)] p-6 md:p-8 rounded-[2rem] lg:rounded-[2.5rem] shadow-sm w-full', dashCardHover)}>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">{t('dash.weekly.title')}</p>
            <h3 className="text-lg font-black italic uppercase tracking-tighter mt-1">{t(weeklyDigest.fatigueLabelKey)}</h3>
          </div>
          {lastCompletedWorkout && (
            <button
              type="button"
              onClick={() => navigate('/workouts', { state: { repeatLast: true } })}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-brand/40 bg-brand/5 text-brand text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-brand/10 transition-all"
            >
              <RotateCcw size={14} />
              {t('dash.weekly.repeat')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('dash.weekly.sessions'), value: weeklyDigest.weekSessions, icon: Dumbbell },
            { label: t('dash.weekly.volume'), value: `${weeklyDigest.weekVolumeKg} kg`, icon: TrendingUp },
            { label: t('dash.weekly.fatigue'), value: weeklyDigest.fatigueScore, icon: Brain },
            {
              label: t('dash.weekly.netKcal'),
              value: `${weeklyDigest.avgNetKcalPerDay > 0 ? '+' : ''}${Math.round(weeklyDigest.avgNetKcalPerDay)}`,
              icon: Flame,
            },
          ].map(row => (
            <div key={row.label} className="rounded-2xl bg-[var(--background)] border border-[var(--border-muted)] p-4">
              <row.icon size={16} className="text-brand mb-2" />
              <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{row.label}</p>
              <p className="text-xl font-black italic mt-1">{row.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[9px] font-bold text-[var(--text-muted)] mt-4 uppercase tracking-widest">
          {t('dash.weekly.projection')}: {weeklyDigest.projectedKgPerWeek >= 0 ? '+' : ''}
          {weeklyDigest.projectedKgPerWeek.toFixed(2)} kg
        </p>
      </div>
    );
  }, [weeklyDigest, lastCompletedWorkout, navigate, t]);

  const streakCard = useMemo(
    () => (
      <div className={cn('bg-[var(--card-bg)] p-6 md:p-8 rounded-[2rem] lg:rounded-[2.5rem] shadow-sm flex flex-col h-full min-h-0 justify-between', dashCardHover)}>
        <div className="flex justify-between items-start mb-4 md:mb-6 gap-3">
          <div className="p-3 md:p-4 rounded-xl lg:rounded-2xl text-white bg-amber-500 flex-shrink-0">
            <Star size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="text-right min-w-0 flex-1">
            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">{t('dash.streaks.title')}</p>
            <p className="text-xs text-[var(--text-muted)] font-medium leading-snug hidden lg:block">{t('dash.streaks.hint')}</p>
            <Link
              to="/stats"
              className="hidden lg:inline-flex mt-2 ml-auto items-center gap-1 text-brand text-[10px] font-black uppercase tracking-widest hover:gap-2 transition-all"
            >
              {t('dash.streaks.more')} <ChevronRight size={14} />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1 content-center">
          <div className="rounded-2xl bg-[var(--background)] border border-[var(--border-muted)] p-4 flex flex-col items-center gap-2 text-center">
            <Trophy size={22} className="text-amber-500 shrink-0" />
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.streaks.train')}</p>
            <p className="text-2xl font-black italic leading-none">
              {workoutStreak}
              <span className="text-xs not-italic text-[var(--text-muted)]">d</span>
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--background)] border border-[var(--border-muted)] p-4 flex flex-col items-center gap-2 text-center">
            <Apple size={22} className="text-brand shrink-0" />
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.streaks.food')}</p>
            <p className="text-2xl font-black italic leading-none">
              {nutritionStreak}
              <span className="text-xs not-italic text-[var(--text-muted)]">d</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/stats')}
          className="lg:hidden w-full mt-6 min-h-[44px] rounded-xl text-[9px] font-black uppercase tracking-widest bg-[var(--background)] border border-[var(--border-muted)] hover:border-brand transition-all flex items-center justify-center gap-1"
        >
          {t('dash.streaks.more')} <ChevronRight size={14} />
        </button>
      </div>
    ),
    [workoutStreak, nutritionStreak, navigate, t],
  );

  if (bootstrapLoading) {
    return <PageBootstrap label={t('dash.loading')} />;
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
    <div className="flex flex-col gap-8">
      <ResumeWorkoutBanner />

      {coachFetchError && (
        <ErrorBanner
          message={t('dash.coach.loadFailed')}
          onRetry={() => void loadCoachExtras()}
          retryLabel={t('common.retry')}
        />
      )}
      {activitySaveError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm font-bold text-red-700 dark:text-red-300" role="alert">
          {activitySaveError}
        </div>
      )}

      {/* ── Universal Weekly Report ── */}
      <AnimatePresence>
        {userWeeklyReport && !userReportDismissed && !showUserWeeklyReport && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={cn(
              'bg-[var(--card-bg)] text-[var(--text-primary)] rounded-[2rem] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5 border border-[var(--border-muted)]',
              dashCardHover,
            )}
          >
            <div className="w-12 h-12 bg-brand/15 border border-brand/25 rounded-2xl flex items-center justify-center flex-shrink-0">
              <FileText size={22} className="text-brand" />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('dash.userReport.ready')}
              </p>
              <p className="font-black uppercase italic tracking-tighter text-lg mt-0.5">
                {(userWeeklyReport.report as UserWeeklyReportPayload).weekLabel}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-1 font-medium line-clamp-2">
                {(userWeeklyReport.report as UserWeeklyReportPayload).personalReport.intro}
              </p>
              <div className="flex flex-col gap-2.5 mt-4 sm:mt-3">
                <button
                  type="button"
                  onClick={() => setShowUserWeeklyReport(true)}
                  className="flex w-full items-center justify-center gap-2 min-h-[48px] ui-btn-brand px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest touch-manipulation active:scale-[0.98] transition-transform"
                >
                  <ChevronRight size={14} strokeWidth={2.5} /> {t('dash.userReport.open')}
                </button>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
                  <Link
                    to="/profile"
                    className="flex items-center justify-center min-h-[44px] px-3 py-2.5 rounded-xl border-2 border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-brand/40 active:scale-[0.98] transition-all touch-manipulation text-center"
                  >
                    {t('dash.userReport.all')}
                  </Link>
                  <button
                    type="button"
                    onClick={dismissUserWeeklyReport}
                    className="flex items-center justify-center min-h-[44px] px-3 py-2.5 rounded-xl border-2 border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand/30 hover:text-brand active:scale-[0.98] transition-all touch-manipulation"
                  >
                    {t('dash.userReport.later')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileOverlayRoot open={Boolean(showUserWeeklyReport && userWeeklyReport)}>
        {userWeeklyReport ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={mobileSheetOverlayClass()}
          >
            <div
              className="absolute inset-0 bg-black/70"
              onClick={closeUserWeeklyReport}
            />
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="relative z-10 w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden rounded-t-[1.75rem] sm:rounded-t-2xl bg-[var(--background)] border border-[var(--border-muted)] shadow-2xl"
            >
              <div className="flex shrink-0 justify-between items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-[var(--border-muted)] bg-[var(--background)]">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    {t('dash.userReport.ready')}
                  </p>
                  <h3 className="text-lg font-black uppercase tracking-tighter truncate">
                    {t('dash.userReport.title')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeUserWeeklyReport}
                  aria-label={t('common.dismiss')}
                  className="flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-[var(--border-muted)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:border-brand/40 hover:text-brand active:scale-95 transition-all touch-manipulation"
                >
                  <X size={20} strokeWidth={2.25} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <UserWeeklyReportDocument report={userWeeklyReport.report as UserWeeklyReportPayload} />
              </div>
              <div className="shrink-0 border-t border-[var(--border-muted)] bg-[var(--background)] px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
                <button
                  type="button"
                  onClick={closeUserWeeklyReport}
                  className="flex w-full min-h-[48px] items-center justify-center rounded-2xl border-2 border-[var(--border-muted)] bg-[var(--card-bg)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] active:scale-[0.98] transition-transform touch-manipulation"
                >
                  {t('common.dismiss')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </MobileOverlayRoot>

      {/* ── Coach Report Notification ── */}
      <AnimatePresence>
        {coachReport && !reportDismissed && !showReport && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className={cn('bg-[var(--card-bg)] text-[var(--text-primary)] rounded-[2rem] p-6 flex items-start gap-5', dashCardHover)}>
            <div className="w-12 h-12 bg-brand/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Brain size={22} className="text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('dash.coach.reportReady')}</p>
              <p className="font-black uppercase italic tracking-tighter text-lg mt-0.5">
                {t('dash.coach.weekAnalysis', { n: coachReport.week_number })}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-1 font-medium line-clamp-2">
                {coachReport.report?.coachMessage?.substring(0, 120)}...
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setShowReport(true)}
                  className="flex items-center gap-1.5 ui-btn-brand px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity">
                  <ChevronRight size={12} /> {t('dash.coach.readFull')}
                </button>
                <button onClick={dismissReport} className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-brand transition-colors">
                  {t('dash.coach.dismiss')}
                </button>
              </div>
            </div>
            <button onClick={dismissReport} className="text-[var(--text-muted)] hover:text-brand transition-colors flex-shrink-0">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full Report Modal ── */}
      <MobileOverlayRoot open={Boolean(showReport && coachReport)}>
        {coachReport ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={mobileSheetOverlayClass()}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeCoachReport} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="relative w-full max-w-lg max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl z-10 flex flex-col overflow-hidden border border-[var(--border-muted)]">
              <div className="p-5 pb-4 md:p-7 md:pb-4 border-b border-[var(--border-muted)] flex-shrink-0 pt-[max(1.25rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      {t('dash.coach.report')} · {t('dash.coach.weekAnalysis', { n: coachReport.week_number })}
                    </p>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter text-[var(--text-primary)] mt-0.5">{t('dash.coach.weeklyReport')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeCoachReport}
                    className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] transition-colors text-[var(--text-muted)]"
                    aria-label={t('profile.cancel')}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-5 md:p-7 space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* Rating */}
                <div className="bg-black text-white rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-4xl font-black italic">{coachReport.report?.overallRating}<span className="text-lg text-gray-400">/10</span></p>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_: any, i: number) => (
                        <Star key={i} size={14} className={i < Math.round((coachReport.report?.overallRating || 0) / 2) ? "text-yellow-400 fill-yellow-400" : "text-gray-600"} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 font-medium leading-relaxed">{coachReport.report?.coachMessage}</p>
                </div>
                {/* Summary */}
                {coachReport.report?.summary && (
                  <div className="bg-[var(--background)] rounded-2xl p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">{t('dash.coach.overallAssessment')}</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed">{coachReport.report.summary}</p>
                  </div>
                )}
                {/* Week over week */}
                {coachReport.report?.weekOverWeekComparison && (
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-700 mb-2">{t('dash.coach.weekOverWeek')}</p>
                    <p className="text-sm font-bold text-blue-900 leading-relaxed">{coachReport.report.weekOverWeekComparison}</p>
                  </div>
                )}
                {/* Highlights + Issues */}
                <div className="grid grid-cols-1 gap-3">
                  {coachReport.report?.performanceHighlights?.length > 0 && (
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-green-700 mb-2">{t('dash.coach.strengths')}</p>
                      <ul className="space-y-1">{coachReport.report.performanceHighlights.map((h: string, i: number) => <li key={i} className="text-xs font-bold text-green-800">· {h}</li>)}</ul>
                    </div>
                  )}
                  {coachReport.report?.areasToImprove?.length > 0 && (
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-orange-700 mb-2">{t('dash.coach.workOn')}</p>
                      <ul className="space-y-1">{coachReport.report.areasToImprove.map((a: string, i: number) => <li key={i} className="text-xs font-bold text-orange-800">· {a}</li>)}</ul>
                    </div>
                  )}
                </div>
                {/* Next week */}
                {coachReport.report?.nextWeekStrategy && (
                  <div className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-2">{t('dash.coach.nextWeekPlan')}</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed mb-3">{coachReport.report.nextWeekStrategy}</p>
                    {coachReport.report?.nextWeekChanges?.length > 0 && (
                      <ul className="space-y-2">
                        {coachReport.report.nextWeekChanges.map((c: string, i: number) => (
                          <li key={i} className="flex gap-2 text-xs text-[var(--text-primary)] font-bold bg-[var(--background)] rounded-xl p-3">
                            <span className="text-brand flex-shrink-0">→</span> {c}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {/* Go to coach button */}
                <Link to="/coach" className="block">
                  <button
                    type="button"
                    className="w-full min-h-[52px] py-4 ui-btn-brand rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-brand/20 touch-manipulation"
                  >
                    {t('dash.coach.openCoach')}
                  </button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </MobileOverlayRoot>

      <header className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:items-center sm:gap-6 order-1 shrink-0">
        <div className="min-w-0 w-full sm:w-auto">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black italic uppercase tracking-tighter break-words">
            {t('dash.welcome')}, <span className="text-brand">{profile?.displayName?.split(' ')[0] || t('profile.elite')}</span>!
          </h2>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-2">
            {format(today, 'PPPP', { locale: dfLocale })}
          </p>
          <div className="mt-3 flex gap-2 lg:hidden w-full">
            <button
              type="button"
              onClick={openFoodLog}
              className="flex-1 min-h-[48px] px-3 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest touch-manipulation"
            >
              {t('dash.cta.logFood')}
            </button>
            <Link
              to="/workouts"
              className="flex-1 min-h-[48px] px-3 rounded-xl border-2 border-[var(--border-muted)] bg-[var(--card-bg)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center touch-manipulation hover:border-brand"
            >
              {t('dash.cta.startWorkout')}
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:space-x-3 w-full sm:w-auto">
          <div className="flex gap-2 flex-1 sm:flex-none min-w-0">
            <div className="flex-1 sm:flex-none min-h-[44px] px-3 py-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-muted)] flex items-center justify-center gap-2">
              <Trophy size={16} className="text-amber-500 shrink-0" />
              <div className="text-center min-w-0">
                <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.streak.train')}</p>
                <p className="text-sm font-black italic">{workoutStreak}d</p>
              </div>
            </div>
            <div className="flex-1 sm:flex-none min-h-[44px] px-3 py-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-muted)] flex items-center justify-center gap-2">
              <Apple size={16} className="text-brand shrink-0" />
              <div className="text-center min-w-0">
                <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.streak.food')}</p>
                <p className="text-sm font-black italic">{nutritionStreak}d</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile/Tablet: kompakte Coach-Kachel (volle Variante war zu hoch über dem Fold) */}
      <div className="lg:hidden order-2 shrink-0">
        <CoachAdherenceWidget summary={coachSummary} compact />
      </div>

      {/* Stat cards — Desktop inkl. Coach-Widget als erste Kachel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 lg:items-stretch lg:grid-cols-5 order-3">
              <div className="hidden lg:block min-h-0">
                <CoachAdherenceWidget summary={coachSummary} compact />
              </div>
              <StatCard
                title={t('dash.consumption')}
                value={Math.round(consumedCalories)}
                target={adjustedCalorieTarget}
                unit="kcal"
                color="bg-brand"
                icon={Flame}
                goalLabel={t('dash.statGoal')}
                footer={
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={openFoodLog}
                      data-testid="dashboard-open-quick-log"
                      className={topCardActionButton}
                    >
                      {t('dash.logFood')}
                    </button>
                  </div>
                }
              />
              <StatCard
                title={t('dash.steps')}
                value={stepsToday}
                target={stepsGoal}
                unit="steps"
                color="bg-orange-400"
                icon={Footprints}
                goalLabel={t('dash.statGoal')}
                footer={
                  <button
                    type="button"
                    onClick={() => setStepsModalOpen(true)}
                    className={topCardActionButton}
                  >
                    {t('dash.steps.manual')}
                  </button>
                }
              />
              <StatCard
                title={t('dash.hydration')}
                value={(waterTodayMl / 1000).toFixed(2)}
                target={Number((waterTargetMl / 1000).toFixed(1))}
                unit={t('dash.unit.liter')}
                color="bg-blue-400"
                icon={Droplets}
                goalLabel={t('dash.statGoal')}
                footer={
                  <div className="grid grid-cols-2 gap-2">
                    {[{ ml: 250, l: '+0.25' }, { ml: 330, l: '+0.33' }].map(btn => (
                      <button
                        key={btn.ml}
                        type="button"
                        onClick={() => logWater(btn.ml)}
                        className="min-h-[48px] px-2.5 py-2 rounded-xl bg-[var(--background)] border border-[var(--border-muted)] hover:border-brand active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest leading-tight flex items-center justify-center text-center"
                      >
                        {btn.l} L
                      </button>
                    ))}
                  </div>
                }
              />
              <StatCard
                title={t('dash.recovery')}
                value={sleepHoursDisplay}
                target={8}
                unit={t('dash.unit.hrs')}
                color="bg-indigo-400"
                icon={Moon}
                goalLabel={t('dash.statGoal')}
                footer={
                  <button
                    type="button"
                    onClick={() => setSleepModalOpen(true)}
                    className={topCardActionButton}
                  >
                    {t('dash.sleep.log')}
                  </button>
                }
              />
      </div>

      {weeklyReportCard ? <div className="order-4 shrink-0 w-full">{weeklyReportCard}</div> : null}

      {/* Desktop (lg+): Intelligence + Recent + Streaks in einer Zeile */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-4 md:gap-8 lg:items-stretch order-4">
        <div className="min-h-0">{intelligenceCard}</div>
        <div className="min-h-0">{recentCard}</div>
        <div className="min-h-0">{streakCard}</div>
      </div>

      {/* Mobile/Tablet: Recent + Streaks, Intelligence unter dem Fold */}
      <div className="lg:hidden flex flex-col gap-4 order-4 shrink-0">
        {recentCard}
        {streakCard}
        {intelligenceCard}
      </div>

      <div className="col-span-full w-full order-5 shrink-0">
           <motion.div whileHover={{ y: -2 }} className={cn('bg-[var(--card-bg)] rounded-[2rem] lg:rounded-[2.5rem] p-4 sm:p-6 md:p-8 shadow-sm w-full', dashCardHover)}>
             <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
               <h3 className="font-black italic uppercase text-lg tracking-tighter">{t('dash.analytics.title')}</h3>
               <Link to="/stats" className="text-brand text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all shrink-0">
                 {t('dash.analytics.full')} <ChevronRight size={14} />
               </Link>
             </div>
             {/* Chart type switcher */}
             <div className="flex gap-1.5 flex-wrap mb-6">
               {(
                 [
                   { key: 'workouts', labelKey: 'dash.chart.workouts' },
                   { key: 'balance', labelKey: 'dash.chart.balance' },
                   { key: 'calories', labelKey: 'dash.chart.calories' },
                   { key: 'macros', labelKey: 'dash.chart.macros' },
                 ] as const
               ).map(c => (
                 <button
                   key={c.key}
                   type="button"
                   onClick={() => setChartView(c.key)}
                   className={cn(
                     "min-h-[40px] px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation",
                     chartView === c.key
                       ? "ui-mark-selected"
                       : "bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand"
                   )}
                 >
                   {t(c.labelKey)}
                 </button>
               ))}
             </div>
             <div className="h-[260px] min-h-[260px] w-full min-w-0">
               <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
                {chartView === 'workouts' ? (
                   <BarChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} width={30} allowDecimals={false} />
                     <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-muted)', fontSize: '11px', fontWeight: '900' }} formatter={(v: any) => [`${v}`, t('dash.chart.sessions')]} />
                     <Bar dataKey="workouts" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                   </BarChart>
                 ) : chartView === 'balance' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} width={55} tickFormatter={v => `${v}`} />
                    <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-muted)', fontSize: '11px', fontWeight: '900' }} formatter={(v: any) => [`${v > 0 ? '+' : ''}${v} ${t('dash.unit.kcal')}`, t('dash.chart.surplusDeficit')]} />
                    <Line type="monotone" dataKey="balance" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 5 }} />
                  </LineChart>
                ) : chartView === 'calories' ? (
                   <AreaChart data={chartData}>
                     <defs>
                       <linearGradient id="colorBrand" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.15}/>
                         <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} width={55} tickFormatter={v => `${v}`} />
                     <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-muted)', fontSize: '11px', fontWeight: '900' }} formatter={(v: any) => [`${v} ${t('dash.unit.kcal')}`, t('dash.chart.calories')]} />
                     <Area type="monotone" dataKey="calories" stroke="#14b8a6" strokeWidth={3} fillOpacity={1} fill="url(#colorBrand)" />
                   </AreaChart>
                 ) : chartView === 'macros' ? (
                   <BarChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }} width={40} />
                     <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-muted)', fontSize: '11px', fontWeight: '900' }} formatter={(v: any, name: any) => [`${v}g`, name]} />
                     <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }} />
                     <Bar dataKey="protein" stackId="a" fill="#6366f1" radius={[0,0,0,0]} name={t('dash.chart.protein')} />
                     <Bar dataKey="carbs"   stackId="a" fill="#14b8a6" radius={[0,0,0,0]} name={t('dash.chart.carbs')} />
                     <Bar dataKey="fat"     stackId="a" fill="#f59e0b" radius={[6,6,0,0]} name={t('dash.chart.fat')} />
                   </BarChart>
                 ) : null}
               </ResponsiveContainer>
             </div>
           </motion.div>
      </div>
      <ManualStepsModal
        open={stepsModalOpen}
        onClose={() => setStepsModalOpen(false)}
        defaultDate={todayString}
        initialSteps={stepsToday}
        onSave={persistSteps}
      />
      <ManualSleepModal
        open={sleepModalOpen}
        onClose={() => setSleepModalOpen(false)}
        defaultDate={todayString}
        initial={sleepToday}
        onSave={persistSleep}
      />
      {foodLog.active && foodLog.category ? (
          <NutritionLogSheet
            key={`dash-food-log-${foodLog.category}`}
            defaultCategory={foodLog.category}
            selectedDate={todayString}
            nutritionEntries={nutritionEntries}
            onClose={closeFoodLog}
            onAfterSave={async () => {
              await refetchNutrition();
              closeFoodLog();
            }}
            onLog={async data => {
              await addMeal({
                ...data,
                category: foodLog.category!,
                date: data.date || todayString,
              });
              closeFoodLog();
            }}
          />
        ) : null}
    </div>
  );
}
