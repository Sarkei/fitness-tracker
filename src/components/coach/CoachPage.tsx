import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Brain, Loader2, ChevronRight, Zap, Dumbbell, Activity, Bike,
  Flame, Target, Waves, Mountain, Calendar, Clock, TrendingUp, Pause,
  XCircle, Play, Star, ChevronDown, ChevronUp, RefreshCw, MapPin,
  CheckCircle, AlertCircle, ArrowUp, ArrowDown, Edit2, Check as CheckIcon, Trash2,
  Layers, Save, Sparkles,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { api } from '@/src/lib/api';
import CoachPlanGenerationModal from './CoachPlanGenerationModal';
import {
  abortCoachPlanCreation,
  createCoachPlanAndWait,
} from '@/src/lib/coachPlanCreation';
import type { CoachPlanGenerationPhase } from '@/src/services/coachPlanService';
import { waitForCoachPlanGeneration } from '@/src/services/coachPlanService';
import CoachSpontaneousTodaySheet from './CoachSpontaneousTodaySheet';
import CoachPendingPlansPanel, { type PendingCoachPlan } from './CoachPendingPlansPanel';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { format, parseISO, isToday, getDay } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import CoachOnboarding from './CoachOnboarding';
import CoachMealDetailModal from './CoachMealDetailModal';
import CoachRefineSheet from './CoachRefineSheet';
import CoachReportFacts from './CoachReportFacts';
import CoachSessionFeedbackBar from './CoachSessionFeedbackBar';
import CoachNamePromptSheet from './CoachNamePromptSheet';
import CoachStaleReportBanner from './CoachStaleReportBanner';
import CoachBulkRationConfirmSheet from './CoachBulkRationConfirmSheet';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog';
import {
  mobileDialogOverlayClass,
  MobileOverlayRoot,
  overlayPortal,
  forceReleaseAllOverlayScrollLocks,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import { buildPlannedSessionKey } from '@/src/lib/coach/coachSessionMeta';
import type { AthleteWeekSnapshot } from '@/src/lib/coach/coachTypes';
import WorkoutSessionPlayer from '@/src/components/workout/WorkoutSessionPlayer';
import { estimateWorkoutCalories } from '@/src/lib/workoutAnalytics';
import { useAuth } from '@/src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { advanceCoachSetupQueue, coachSetupPath } from '@/src/lib/coachSetupQueue';
import { clearSessionDraft } from '@/src/lib/sessionDraft';
import { useCoachPlans, useWorkouts } from '@/src/lib/AppDataContext';
import { displayCoachExerciseName } from '@/src/lib/coachExerciseDisplay';
import { useI18n } from '@/src/lib/i18n';
import { useNutrition } from '@/src/lib/useNutrition';
import type { Exercise, Nutrition, PlannedSession, Workout } from '@/src/types';
import {
  buildCoachWeekWorkoutPlanTemplatePayload,
  buildCoachDayWorkoutTemplatePayload,
  coachSessionToWorkoutType,
  coachDayToDayExercises,
  coachDayToSessionExerciseList,
  coachMealIngredientLines,
  coachMealToMealTemplatePayload,
  coachRowExercises,
  coachRowHasExercises,
  coachDayHasWorkoutContent,
  iterateCoachNutritionWeekMeals,
  resolveCoachScheduleDayList,
} from '@/src/lib/coachTemplateMappers';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import {
  COACH_WEEKDAY_ORDER,
  buildCoachWeekDateMap,
  formatCoachDayDateShort,
  formatCoachWeekRange,
  isCoachWeekActiveToday,
  parseCoachStartYmd,
  coachWeeklySessionCountForDisplay,
  sortCoachDaysMonSun,
  todayLocalYmd,
} from '@/src/lib/coachWeekDisplay';
import { parseLocalYmd } from '@/src/lib/coachWeekWindow';
import {
  coachDateLocale,
  formatCoachDayShort,
  formatCoachDayTitle,
  formatCoachRecommendation,
  formatCoachSessionSlot,
  formatCoachSessionType,
} from '@/src/lib/coachScheduleDisplay';
import { resolveCoachPhaseExerciseRows } from '@/src/lib/coachWarmupCooldown';
import CoachWeekSessionChip from './CoachWeekSessionChip';
import CoachWeekTypeLegend from './CoachWeekTypeLegend';
import CoachSessionDetailContent from './CoachSessionDetailContent';
import {
  coachDayGroupIsRest,
  coachDayGroupTrainingSessions,
  coachSessionExpandKey,
  groupCoachScheduleByWeekday,
} from '@/src/lib/coachScheduleGrouping';

const DAY_INDEX: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
const COACH_START_DATE_OPTIONS = [
  { id: 'today', labelKey: 'coach.onb.startDate.today' },
  { id: 'tomorrow', labelKey: 'coach.onb.startDate.tomorrow' },
  { id: 'next_monday', labelKey: 'coach.onb.startDate.next_monday' },
] as const;
type CoachStartDateOption = (typeof COACH_START_DATE_OPTIONS)[number]['id'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachPlan {
  id: string;
  type: 'workout' | 'nutrition';
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  discipline: string;
  plan_mode: 'ongoing' | 'event';
  event_name?: string;
  event_date?: string;
  event_distance?: string;
  current_week: number;
  onboarding_data: any;
  created_at: string;
  current_schedule?: { schedule: any; week_number: number };
  latest_report?: { report: any; week_number: number };
  schedules?: Array<{ week_number: number; schedule: any; start_date: string }>;
  reports?: Array<{ week_number: number; report: any; generated_at: string }>;
  generation_status?: 'generating' | 'ready' | 'failed';
  generation_error?: string | null;
}

// ─── Discipline helpers ────────────────────────────────────────────────────────

const DISCIPLINE_STYLE: Record<string, { icon: typeof Dumbbell; color: string }> = {
  strength:          { icon: Dumbbell,  color: 'bg-violet-500' },
  marathon_running:  { icon: Activity,  color: 'bg-orange-500' },
  cycling_marathon:  { icon: Bike,      color: 'bg-blue-500'   },
  hyrox:             { icon: Zap,       color: 'bg-yellow-500' },
  crossfit:          { icon: Flame,     color: 'bg-red-500'    },
  calisthenics:      { icon: Target,    color: 'bg-teal-500'   },
  hybrid_athlete:    { icon: Activity,  color: 'bg-emerald-500'},
  triathlon:         { icon: Waves,     color: 'bg-cyan-500'   },
  trail_running:     { icon: Mountain,  color: 'bg-stone-500'  },
  powerlifting:      { icon: Dumbbell,  color: 'bg-pink-500'   },
  half_marathon:     { icon: Activity,  color: 'bg-amber-500'  },
  functional_fitness:{ icon: Target,    color: 'bg-indigo-500' },
  nutrition:         { icon: Target,    color: 'bg-green-500'  },
};

function getDisciplineMeta(plan: CoachPlan, t: (k: string, vars?: Record<string, string | number>) => string) {
  if (plan.type === 'nutrition') {
    const s = DISCIPLINE_STYLE.nutrition;
    return { icon: s.icon, color: s.color, label: t('coach.discipline.nutrition') };
  }
  const s = DISCIPLINE_STYLE[plan.discipline] ?? { icon: Brain, color: 'bg-gray-500' };
  const k = `coach.discipline.${plan.discipline}`;
  const label = t(k);
  return { icon: s.icon, color: s.color, label: label === k ? plan.discipline.replace(/_/g, ' ') : label };
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

function planWeekStartYmd(plan: CoachPlan): string | null {
  const fromSchedules = plan.schedules?.find(s => s.week_number === plan.current_week)?.start_date;
  const fromCurrent = (plan.current_schedule as { start_date?: string } | undefined)?.start_date;
  return parseCoachStartYmd(fromSchedules ?? fromCurrent);
}

function PlanCard({ plan, onClick, compact }: { plan: CoachPlan; onClick: () => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const meta = getDisciplineMeta(plan, t);
  const Icon = meta.icon;
  const report = plan.latest_report?.report;
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;

  const startYmd = planWeekStartYmd(plan);
  const weekRange = startYmd ? formatCoachWeekRange(startYmd, coachDateLocale(locale)) : null;
  const weekActive = startYmd ? isCoachWeekActiveToday(startYmd) : false;

  const scheduleRows = (plan.current_schedule?.schedule?.schedule ?? []) as Array<{
    isRest?: boolean;
    sessionType?: string;
    title?: string;
    day?: string;
    exercises?: unknown[];
  }>;
  const trainingSessions = coachWeeklySessionCountForDisplay(scheduleRows, plan.onboarding_data);

  const daysUntilEvent = plan.event_date
    ? Math.ceil((new Date(plan.event_date).getTime() - Date.now()) / 86400000)
    : null;

  let planStartsLabel: string | null = null;
  if (startYmd && !weekActive) {
    try {
      const start = parseLocalYmd(startYmd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start > today) {
        planStartsLabel = t('coach.plan.startsOn', {
          date: format(start, 'EEEE, d. MMMM yyyy', { locale: dfLocale }),
        });
      }
    } catch {
      /* ignore */
    }
  }

  const footerDate = startYmd
    ? format(parseLocalYmd(startYmd), 'd. MMM yyyy', { locale: dfLocale })
    : format(parseISO(plan.created_at), 'd. MMM yyyy', { locale: dfLocale });

  const chips: { key: string; label: string; tone?: 'brand' | 'warn' | 'muted' }[] = [
    {
      key: 'week',
      label: weekRange
        ? t('coach.plan.weekChip', { n: plan.current_week, range: weekRange })
        : t('coach.wk.week', { n: plan.current_week }),
      tone: 'brand',
    },
  ];
  if (trainingSessions > 0 && plan.type === 'workout') {
    chips.push({
      key: 'sessions',
      label: t('coach.plan.sessionsChip', { n: trainingSessions }),
      tone: 'muted',
    });
  }
  if (report?.overallRating != null) {
    chips.push({
      key: 'report',
      label: t('coach.plan.reportChip', { rating: report.overallRating }),
      tone: 'muted',
    });
  }
  if (daysUntilEvent !== null && daysUntilEvent >= 0) {
    chips.push({
      key: 'event',
      label: t('coach.plan.eventChip', { days: daysUntilEvent }),
      tone: daysUntilEvent <= 14 ? 'warn' : 'muted',
    });
  }

  return (
    <motion.button
      type="button"
      data-testid="coach-plan-card"
      whileHover={{ y: -1 }}
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] transition-all touch-manipulation',
        'hover:border-brand/35 hover:shadow-md hover:shadow-brand/5 active:opacity-95',
        plan.status !== 'active' && 'opacity-75',
        compact ? 'p-4' : 'p-5',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl text-white',
            compact ? 'h-11 w-11' : 'h-12 w-12',
            meta.color,
          )}
        >
          <Icon size={compact ? 20 : 22} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-black uppercase italic tracking-tight text-base text-[var(--text-primary)] truncate">
                {meta.label}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5 truncate">
                {plan.plan_mode === 'event'
                  ? t('coach.plan.event', { name: plan.event_name || '—' })
                  : t('coach.plan.ongoing')}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest',
                plan.status === 'active'
                  ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                  : plan.status === 'paused'
                    ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                    : 'bg-[var(--background)] text-[var(--text-muted)]',
              )}
            >
              {t(`coach.status.${plan.status}` as 'coach.status.active')}
            </span>
          </div>

          {planStartsLabel ? (
            <p className="mt-2 text-[10px] font-bold text-brand leading-snug">{planStartsLabel}</p>
          ) : weekRange ? (
            <p className="mt-2 text-[10px] font-medium text-[var(--text-muted)] leading-snug">{weekRange}</p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <span
                key={chip.key}
                className={cn(
                  'inline-flex items-center rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest',
                  chip.tone === 'brand' && 'bg-brand/12 text-brand',
                  chip.tone === 'warn' && 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
                  chip.tone === 'muted' && 'bg-[var(--background)] text-[var(--text-muted)]',
                )}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        <ChevronRight size={18} className="mt-1 shrink-0 text-[var(--text-muted)]" />
      </div>

      <p className="mt-3 border-t border-[var(--border-muted)] pt-2 text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {t('coach.plan.planStart', { date: footerDate })}
      </p>
    </motion.button>
  );
}

// ─── WeeklyScheduleView ───────────────────────────────────────────────────────

interface ScheduleViewProps {
  schedule: any;
  type: 'workout' | 'nutrition';
  planId: string;
  weekNumber: number;
  weekStartDate?: string;
  isCurrentWeek: boolean;
  onStartSession?: (day: any) => void;
  onReordered?: () => void;
  onPlanRefetch?: () => void;
  onReportStale?: () => void;
  planCurrentWeek?: number;
  onLogMeal?: (data: Partial<Nutrition>) => Promise<void>;
  onRefetchNutrition?: () => Promise<void>;
  defaultEquipment?: string[];
  defaultSessionDuration?: number;
}

function WeeklyScheduleView({
  schedule,
  type,
  planId,
  weekNumber,
  weekStartDate,
  isCurrentWeek,
  onStartSession,
  onReordered,
  onPlanRefetch,
  onReportStale,
  planCurrentWeek,
  onLogMeal,
  onRefetchNutrition,
  initialExpandedDay,
  defaultEquipment = [],
  defaultSessionDuration = 60,
}: ScheduleViewProps & { initialExpandedDay?: string | null }) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const [mealDetail, setMealDetail] = useState<{ meal: Record<string, unknown>; dayLabel: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [localDays, setLocalDays] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateToast, setTemplateToast] = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState<
    | { kind: 'week' }
    | { kind: 'day'; day: Record<string, unknown>; defaultName: string }
    | null
  >(null);
  const [bulkRationOpen, setBulkRationOpen] = useState(false);
  const [bulkRationProgress, setBulkRationProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const bulkRationAbortRef = useRef(false);
  const [savingMealKey, setSavingMealKey] = useState<string | null>(null);
  const [spontaneousOpen, setSpontaneousOpen] = useState(false);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { t, locale } = useI18n();
  const aiCaps = useAiCapabilities();
  const { openExerciseDetail, openExerciseSwap } = useExerciseDetail();
  const { refetch: refetchCoachPlansCache } = useCoachPlans();

  const showTemplateToast = (msg: string) => {
    setTemplateToast(msg);
    window.setTimeout(() => setTemplateToast(''), 5500);
  };

  const bumpWorkoutTemplatesChanged = () => {
    window.dispatchEvent(new CustomEvent('vrtx-workout-templates-changed'));
  };

  const saveWeekTemplateWithName = async (name: string) => {
    setTemplateBusy(true);
    try {
      const payload = buildCoachWeekWorkoutPlanTemplatePayload(schedule as Record<string, unknown>, { name });
      await api('/api/workout-templates', { method: 'POST', body: JSON.stringify(payload) });
      showTemplateToast(t('coach.toast.weekTplOk'));
      bumpWorkoutTemplatesChanged();
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
    }
  };

  const saveDayTemplateWithName = async (day: Record<string, unknown>, name: string) => {
    setTemplateBusy(true);
    try {
      const payload = buildCoachDayWorkoutTemplatePayload(day, { name });
      if (!coachDayHasWorkoutContent(day)) {
        showTemplateToast(t('coach.toast.noEx'));
        return;
      }
      await api('/api/workout-templates', { method: 'POST', body: JSON.stringify(payload) });
      showTemplateToast(t('coach.toast.dayTplOk'));
      bumpWorkoutTemplatesChanged();
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleSaveWeekWorkoutPlanTemplate = () => {
    if (type !== 'workout') return;
    setNamePrompt({ kind: 'week' });
  };

  const handleSaveDayWorkoutTemplate = (day: Record<string, unknown>) => {
    if (type !== 'workout' || day.isRest) return;
    const defaultName = `${typeof day.title === 'string' && day.title.trim() ? day.title : typeof day.sessionType === 'string' ? day.sessionType : 'Coach'} · ${String(day.day ?? '')}`;
    setNamePrompt({ kind: 'day', day, defaultName });
  };

  const coachNutritionWeekMeals = useMemo(() => {
    if (type !== 'nutrition') return [];
    return iterateCoachNutritionWeekMeals(schedule as Record<string, unknown>);
  }, [type, schedule]);

  const persistCoachMealRation = async (
    meal: Record<string, unknown>,
    dayLabel: string,
    rowKey: string,
  ) => {
    setSavingMealKey(rowKey);
    try {
      const payload = coachMealToMealTemplatePayload(meal, { dayLabel });
      await api('/api/meal-templates', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          yieldsPortions: payload.yieldsPortions ?? 1,
        }),
      });
      showTemplateToast(t('coach.toast.rationOk', { name: payload.name }));
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.rationErr')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setSavingMealKey(null);
    }
  };

  const handleSaveAllCoachMealsAsRations = () => {
    if (type !== 'nutrition' || coachNutritionWeekMeals.length === 0) return;
    setBulkRationOpen(true);
  };

  const confirmSaveAllCoachMealsAsRations = async () => {
    if (coachNutritionWeekMeals.length === 0) return;
    bulkRationAbortRef.current = false;
    setTemplateBusy(true);
    const total = coachNutritionWeekMeals.length;
    setBulkRationProgress({ current: 0, total });
    let saved = 0;
    try {
      for (let i = 0; i < coachNutritionWeekMeals.length; i++) {
        if (bulkRationAbortRef.current) break;
        const { meal, dayLabel } = coachNutritionWeekMeals[i];
        const payload = coachMealToMealTemplatePayload(meal, { dayLabel });
        await api('/api/meal-templates', {
          method: 'POST',
          body: JSON.stringify({ ...payload, yieldsPortions: payload.yieldsPortions ?? 1 }),
        });
        saved++;
        setBulkRationProgress({ current: saved, total });
      }
      if (bulkRationAbortRef.current) {
        showTemplateToast(t('coach.bulkRation.aborted', { n: saved, total }));
      } else {
        showTemplateToast(t('coach.toast.rationsOk', { n: saved }));
        setBulkRationOpen(false);
      }
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
      setBulkRationProgress(null);
    }
  };

  const closeBulkRationSheet = () => {
    if (templateBusy) {
      bulkRationAbortRef.current = true;
      return;
    }
    setBulkRationOpen(false);
  };

  const handleSpontaneousToday = async (payload: {
    equipment: string[];
    sessionDuration: number;
    note?: string;
  }) => {
    if (!schedule) return;
    const startYmd = (weekStartDate || schedule?.start_date || '').toString().split('T')[0];
    const datesMap = buildCoachWeekDateMap(startYmd);
    const todayIso = todayLocalYmd();
    const rawList = resolveCoachScheduleDayList(schedule).filter(
      (row: { day?: string }) => row.day && (COACH_WEEKDAY_ORDER as readonly string[]).includes(row.day),
    );
    const todayRow = rawList.find(
      (row: { day?: string; isRest?: boolean }) => datesMap[row.day ?? ''] === todayIso && !row.isRest,
    );
    if (!todayRow?.day) return;
    setTemplateBusy(true);
    try {
      const equipStr = payload.equipment
        .map(e => t(`coach.onb.equip.${e}` as 'coach.onb.equip.bodyweight'))
        .join(', ');
      const userRefinement = [
        locale === 'de' ? 'Spontane Anpassung nur für heute.' : 'Spontaneous adjustment for today only.',
        `${locale === 'de' ? 'Equipment' : 'Equipment'}: ${equipStr}.`,
        `${locale === 'de' ? 'Dauer' : 'Duration'}: ${payload.sessionDuration} min.`,
        payload.note?.trim() || '',
        locale === 'de'
          ? 'Passe NUR den heutigen Trainingstag an; Rest der Woche unverändert.'
          : "Change ONLY today's session; keep the rest of the week unchanged.",
      ]
        .filter(Boolean)
        .join(' ');
      await api(`/api/coach/plans/${planId}/refine-schedule`, {
        method: 'POST',
        body: JSON.stringify({
          previousValid: schedule,
          userRefinement,
          weekNumber,
          refineScope: 'single_day',
          day: todayRow.day,
        }),
      });
      showTemplateToast(`✅ ${t('coach.spontaneous.ok')}`);
      setSpontaneousOpen(false);
      onReportStale?.();
      onPlanRefetch?.();
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleRefineSubmit = async (payload: {
    userRefinement: string;
    refineScope?: string;
    day?: string;
  }) => {
    if (!onPlanRefetch) return;
    setTemplateBusy(true);
    try {
      await api(`/api/coach/plans/${planId}/refine-schedule`, {
        method: 'POST',
        body: JSON.stringify({
          previousValid: schedule,
          userRefinement: payload.userRefinement,
          weekNumber,
          refineScope: payload.refineScope,
          day: payload.day,
        }),
      });
      showTemplateToast(`✅ ${t('coach.refine.ok')}`);
      setRefineOpen(false);
      onReportStale?.();
      onPlanRefetch();
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleSwapExercise = async (
    dayName: string,
    exerciseIndex: number,
    repl: LibraryExercise,
  ) => {
    setTemplateBusy(true);
    try {
      const nameDe = displayCoachExerciseName(
        { name: repl.name, exerciseKey: repl.key },
        locale,
      );
      await api(`/api/coach/plans/${planId}/schedules/${weekNumber}/swap-exercise`, {
        method: 'PATCH',
        body: JSON.stringify({
          day: dayName,
          exerciseIndex,
          exerciseKey: repl.key,
          name: nameDe,
        }),
      });
      await refetchCoachPlansCache();
      showTemplateToast(`✅ ${t('coach.exercise.replaced')}`);
      onPlanRefetch?.();
    } catch (err: unknown) {
      showTemplateToast(`${t('coach.toast.err')}: ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setTemplateBusy(false);
    }
  };

  useEffect(() => {
    const validDays = COACH_WEEKDAY_ORDER as readonly string[];
    const rawDays = resolveCoachScheduleDayList(schedule);
    const filteredDays = rawDays.filter((d: any) => d.day && validDays.includes(d.day));
    setLocalDays(sortCoachDaysMonSun(filteredDays));
    if (initialExpandedDay) {
      if (type === 'workout') {
        const group = groupCoachScheduleByWeekday(filteredDays).find(g => g.day === initialExpandedDay);
        const training = group ? coachDayGroupTrainingSessions(group.sessions) : [];
        const first = training[0] as Record<string, unknown> | undefined;
        if (first) {
          setExpandedSessionKey(coachSessionExpandKey(initialExpandedDay, first, 0));
        }
        setExpandedDay(null);
      } else {
        setExpandedDay(initialExpandedDay);
        setExpandedSessionKey(null);
      }
    } else {
      setExpandedDay(null);
      setExpandedSessionKey(null);
    }
  }, [schedule, initialExpandedDay, type]);

  useEffect(() => {
    if (!expandedDay) return;
    const key = `row-${expandedDay}`;
    window.setTimeout(() => {
      dayRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [expandedDay, weekNumber]);

  if (!schedule) return null;

  const startYmd = (weekStartDate || schedule?.start_date || '').toString().split('T')[0];
  const weekDates = buildCoachWeekDateMap(startYmd);
  const todayIsoDate = todayLocalYmd();
  const weekIsActiveToday = isCoachWeekActiveToday(startYmd);
  const weekRangeLabel = formatCoachWeekRange(startYmd, coachDateLocale(locale));

  const sortCoachDays = (arr: any[]) => sortCoachDaysMonSun(arr);

  const moveDay = (idx: number, dir: -1 | 1) => {
    const next = [...localDays];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    // Swap session content but keep day names fixed
    const tempSession = { ...next[idx] };
    const tempTarget = { ...next[target] };
    next[idx] = { ...tempTarget, day: next[idx].day };
    next[target] = { ...tempSession, day: next[target].day };
    setLocalDays(next);
  };

  const saveReorder = async () => {
    setSaving(true);
    try {
      await api(`/api/coach/plans/${planId}/schedules/${weekNumber}/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ days: localDays }),
      });
      setEditMode(false);
      onReordered?.();
    } finally {
      setSaving(false);
    }
  };

  const rawList = resolveCoachScheduleDayList(schedule).filter(
    (d: any) => d.day && (COACH_WEEKDAY_ORDER as readonly string[]).includes(d.day),
  );
  const days = editMode ? localDays : sortCoachDays(rawList);
  const dayGroups = editMode
    ? days.map((d: { day: string }) => ({ day: d.day, sessions: [d] }))
    : groupCoachScheduleByWeekday(days);

  return (
    <div className="space-y-4">
      {/* Wochenkopf + optionaler Fokus */}
      <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand">
              {t('coach.wk.week', { n: weekNumber })}
              {planCurrentWeek != null && weekNumber !== planCurrentWeek
                ? ` · ${t('coach.plan.currentWeek')} ${planCurrentWeek}`
                : ''}
            </p>
            {weekRangeLabel && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                {weekRangeLabel}
              </p>
            )}
          </div>
          {isCurrentWeek && type === 'workout' && (
            <button
              type="button"
              onClick={() => {
                setEditMode(!editMode);
                if (editMode) setLocalDays(sortCoachDays(resolveCoachScheduleDayList(schedule)));
              }}
              className={cn(
                'flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation',
                editMode ? 'bg-orange-50 text-orange-600' : 'bg-[var(--background)] text-[var(--text-muted)]',
              )}
            >
              <Edit2 size={10} /> {editMode ? t('coach.wk.reorderCancel') : t('coach.wk.reorder')}
            </button>
          )}
        </div>
        {schedule.weekFocus && (
          <p className="font-black uppercase italic tracking-tighter text-lg sm:text-xl text-[var(--text-primary)]">
            {schedule.weekFocus}
          </p>
        )}
        {schedule.coachNotes && (
          <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">{schedule.coachNotes}</p>
        )}
        {type === 'workout' && isCurrentWeek && (
          <p className="text-[10px] font-medium leading-relaxed text-[var(--text-muted)] rounded-xl bg-[var(--background)] px-3 py-2">
            {t('coach.sessionStart.hint')}
          </p>
        )}
        {editMode && (
          <div className="flex flex-col gap-2 rounded-xl bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">{t('coach.wk.swapHint')}</p>
            <button
              type="button"
              onClick={saveReorder}
              disabled={saving}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckIcon size={12} />} {t('coach.wk.save')}
            </button>
          </div>
        )}
      </div>

      {!editMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {onPlanRefetch && (
            <button
              type="button"
              disabled={templateBusy || aiCaps.loading || !aiCaps.enabled}
              data-testid="coach-refine-open"
              onClick={() => setRefineOpen(true)}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)] disabled:opacity-50"
            >
              {templateBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {t('coach.refine.cta')}
            </button>
          )}
          {type === 'workout' && (
            <button
              type="button"
              disabled={templateBusy}
              onClick={handleSaveWeekWorkoutPlanTemplate}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {templateBusy ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
              {t('coach.tpl.wholeWeek')}
            </button>
          )}
          {type === 'nutrition' && coachNutritionWeekMeals.length > 0 && (
            <button
              type="button"
              disabled={templateBusy}
              onClick={handleSaveAllCoachMealsAsRations}
              className="flex min-h-[48px] items-center justify-center gap-2 ui-btn-brand px-4 text-[9px] disabled:opacity-50 sm:col-span-2"
            >
              {templateBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('coach.meals.saveWeek')}
            </button>
          )}
        </div>
      )}

      {type === 'nutrition' && schedule.dailyTargets && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { labelKey: 'coach.targets.cal', value: schedule.dailyTargets.calories, unit: 'kcal' },
            { labelKey: 'coach.targets.prot', value: schedule.dailyTargets.protein, unit: 'g' },
            { labelKey: 'coach.targets.carb', value: schedule.dailyTargets.carbs, unit: 'g' },
            { labelKey: 'coach.targets.fat', value: schedule.dailyTargets.fat, unit: 'g' },
          ].map(m => (
            <div key={m.labelKey} className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-4 text-center">
              <p className="text-xl font-black italic tracking-tighter text-[var(--text-primary)]">{m.value}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t(m.labelKey)}</p>
              <p className="text-[9px] text-[var(--text-muted)]">{m.unit}{t('coach.targets.perDay')}</p>
            </div>
          ))}
        </div>
      )}

      {templateToast && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-xs font-black',
            templateToast.startsWith('✅')
              ? 'border-green-200 bg-green-50 text-green-800'
              : templateToast.startsWith('⚠️')
                ? 'border-orange-200 bg-orange-50 text-orange-900'
                : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          {templateToast}
        </div>
      )}

      {type === 'workout' && !editMode && (
        <CoachWeekTypeLegend
          strengthLabel={t('work.type.strength')}
          cardioLabel={t('work.type.cardio')}
          className="px-1"
        />
      )}

      {dayGroups.map((group, idx: number) => {
        const training = coachDayGroupTrainingSessions(group.sessions);
        const d = (training[0] ?? group.sessions[0]) as Record<string, unknown>;
        const isOpen = type === 'nutrition' && expandedDay === group.day;
        const isRest = coachDayGroupIsRest(group.sessions);
        const multi = type === 'workout' && training.length > 1;
        const showWorkoutChips = type === 'workout' && !isRest && !editMode && training.length > 0;
        const dayYmd = weekDates[group.day];
        const dayDateLabel = dayYmd ? formatCoachDayDateShort(dayYmd, coachDateLocale(locale)) : '';
        const isTodayDay =
          isCurrentWeek && weekIsActiveToday && dayYmd != null && dayYmd === todayIsoDate;
        /** Catch-up: heutige und vergangene Tage der aktiven Woche — keine Zukunft. */
        const canStartDay =
          type === 'workout' &&
          isCurrentWeek &&
          dayYmd != null &&
          dayYmd <= todayIsoDate &&
          !isRest &&
          !editMode;
        const isCatchUpDay = canStartDay && !isTodayDay;
        const rowKey = `${group.day}-${idx}`;

        return (
          <div key={rowKey}
            ref={el => { dayRefs.current[`row-${group.day}`] = el }}
            className={cn("bg-[var(--card-bg)] border rounded-2xl overflow-hidden transition-all w-full min-w-0",
              isTodayDay ? "border-brand shadow-lg shadow-brand/10" : "border-[var(--border-muted)]")}>
            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
              <div className="flex items-start gap-3 flex-shrink-0">
                <div className={cn("w-10 h-10 rounded-xl flex flex-col items-center justify-center text-[10px] font-black flex-shrink-0 leading-none gap-0.5",
                  isTodayDay ? "ui-mark-selected" :
                  isRest ? "bg-gray-100 text-gray-400" :
                  d.intensity === 'high' || d.intensity === 'very_high' ? "bg-red-50 text-red-500" :
                  d.intensity === 'moderate' ? "bg-orange-50 text-orange-500" : "bg-green-50 text-green-500")}>
                  <span>{formatCoachDayShort(group.day, t)}</span>
                  {dayDateLabel ? (
                    <span className={cn('text-[10px] font-bold tracking-normal', isTodayDay ? 'text-white/90' : 'opacity-70')}>
                      {dayDateLabel}
                    </span>
                  ) : null}
                </div>
                {isTodayDay && (
                  <span className="text-[9px] font-black uppercase tracking-widest ui-btn-brand px-2 py-0.5 rounded-full h-fit sm:hidden">
                    {t('coach.day.today')}
                  </span>
                )}
                {isCatchUpDay && (
                  <span className="text-[9px] font-black uppercase tracking-widest border border-brand/40 text-brand px-2 py-0.5 rounded-full h-fit sm:hidden">
                    {t('coach.day.catchUp')}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {showWorkoutChips ? (
                  training.map((sess, si) => {
                    const sessRecord = sess as Record<string, unknown>;
                    const sessKey = coachSessionExpandKey(group.day, sessRecord, si);
                    const isSessOpen = expandedSessionKey === sessKey;
                    return (
                      <CoachWeekSessionChip
                        key={sessKey}
                        session={sessRecord}
                        t={t}
                        expanded={isSessOpen}
                        onExpand={() => setExpandedSessionKey(isSessOpen ? null : sessKey)}
                        isToday={isTodayDay}
                        onStart={
                          canStartDay && onStartSession
                            ? () =>
                                onStartSession({
                                  ...sessRecord,
                                  day: group.day,
                                  plannedDate: dayYmd,
                                })
                            : undefined
                        }
                      >
                        <CoachSessionDetailContent
                          session={sessRecord}
                          locale={locale}
                          t={t}
                          dayName={group.day}
                          templateBusy={templateBusy}
                          onSaveAsTemplate={
                            type === 'workout' && !editMode
                              ? () => handleSaveDayWorkoutTemplate(sessRecord)
                              : undefined
                          }
                          onOpenExercise={payload => openExerciseDetail(payload)}
                          onOpenSwapPicker={payload =>
                            openExerciseSwap({
                              exerciseKey: payload.exerciseKey,
                              name: payload.name,
                              onSwap: payload.onSwap,
                            })
                          }
                          onSwapExercise={(dayName, exerciseIndex, repl) =>
                            void handleSwapExercise(dayName, exerciseIndex, repl)
                          }
                        />
                      </CoachWeekSessionChip>
                    );
                  })
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("font-black uppercase tracking-tight text-sm", isRest ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]")}>
                        {isRest
                          ? formatCoachDayTitle(d as { isRest?: boolean; title?: string; sessionType?: string }, t)
                          : multi
                            ? t('work.day.sessionsN', { n: training.length })
                            : formatCoachDayTitle(d as { isRest?: boolean; title?: string; sessionType?: string }, t)}
                      </p>
                      {isTodayDay && (
                        <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest ui-btn-brand px-2 py-0.5 rounded-full flex-shrink-0">
                          {t('coach.day.today')}
                        </span>
                      )}
                      {isCatchUpDay && (
                        <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest border border-brand/40 text-brand px-2 py-0.5 rounded-full flex-shrink-0">
                          {t('coach.day.catchUp')}
                        </span>
                      )}
                      <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] px-1.5 py-0.5 rounded-md bg-[var(--background)] flex-shrink-0">
                        {t('coach.day.weekBadge', { n: weekNumber })}
                      </span>
                    </div>
                    {type === 'nutrition' && !isRest && typeof d.description === 'string' && d.description.trim() ? (
                      <p className="text-[10px] text-[var(--text-muted)] font-medium line-clamp-2">{d.description}</p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 sm:flex-col sm:items-end">
                {type === 'workout' && !editMode && !isRest && (
                  <button
                    type="button"
                    title={t('coach.tpl.saveDay')}
                    disabled={templateBusy}
                    onClick={e => {
                      e.stopPropagation();
                      void handleSaveDayWorkoutTemplate(d as Record<string, unknown>);
                    }}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-muted)] hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
                  >
                    <Save size={15} />
                  </button>
                )}
                {/* Start Today button */}
                {isTodayDay && !isRest && !editMode && type === 'workout' && (
                  <button
                    type="button"
                    title={t('coach.spontaneous.title')}
                    disabled={templateBusy || !aiCaps.enabled}
                    onClick={e => {
                      e.stopPropagation();
                      setSpontaneousOpen(true);
                    }}
                    className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-2.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <MapPin size={12} />
                    <span className="hidden sm:inline">{t('coach.spontaneous.cta')}</span>
                  </button>
                )}
                {/* Reorder arrows */}
                {editMode && !isRest && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveDay(idx, -1)} disabled={idx === 0}
                      className="p-1.5 rounded-lg hover:bg-[var(--background)] transition-colors text-[var(--text-muted)] disabled:opacity-20">
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => moveDay(idx, 1)} disabled={idx === days.length - 1}
                      className="p-1.5 rounded-lg hover:bg-[var(--background)] transition-colors text-[var(--text-muted)] disabled:opacity-20">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                )}

                {!editMode && !isRest && type === 'nutrition' && (
                  isOpen ? (
                    <button type="button" aria-label={t('profile.cancel')} onClick={() => setExpandedDay(null)}>
                      <ChevronUp size={16} className="text-[var(--text-muted)]" />
                    </button>
                  ) : (
                    <button type="button" aria-label={t('exercise.action.info')} onClick={() => setExpandedDay(group.day)}>
                      <ChevronDown size={16} className="text-[var(--text-muted)]" />
                    </button>
                  )
                )}
              </div>
            </div>

            {isOpen && !isRest && !editMode && type === 'nutrition' && (
              <div className="px-3 sm:px-6 pb-5 space-y-4 border-t border-[var(--border-muted)] overflow-hidden">
                {(Array.isArray(d.meals) ? d.meals : []).map((meal: any, i: number) => {
                  const mealKey = `${String(d.day)}:${i}:${String(meal.type)}:${String(meal.title)}`;
                  const rationBusy = savingMealKey === mealKey;
                  const ingPreview = coachMealIngredientLines(meal as Record<string, unknown>)
                    .map(x => x.name)
                    .filter(Boolean);
                  const cookServings = Math.max(1, Math.round(Number(meal.servings) || 1));
                  return (
                    <div key={mealKey} className="bg-[var(--background)] rounded-xl p-4 sm:p-5 space-y-4">
                      <button
                        type="button"
                        onClick={() =>
                          setMealDetail({ meal: meal as Record<string, unknown>, dayLabel: String(d.day ?? '') })
                        }
                        className="w-full text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-1">
                            {t(`nut.cat.${meal.type}` as 'nut.cat.snack')}
                            {cookServings > 1 ? ` · ${t('coach.meal.cookForShort', { n: cookServings })}` : ''}
                          </p>
                          <p className="font-black uppercase tracking-tight text-sm text-[var(--text-primary)]">{meal.title}</p>
                          {meal.description && <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-medium">{meal.description}</p>}
                          {meal.prepTime && <p className="text-[9px] text-[var(--text-muted)] mt-1 font-bold">⏱ {meal.prepTime}</p>}
                          {ingPreview.length > 0 && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">
                              {ingPreview.slice(0, 4).join(' · ')}
                              {ingPreview.length > 4 ? ` ${t('coach.ration.more', { n: ingPreview.length - 4 })}` : ''}
                            </p>
                          )}
                          <p className="text-[9px] font-black uppercase tracking-widest text-brand mt-2">{t('coach.meal.tapDetail')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-[var(--text-primary)]">{meal.calories} kcal</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-bold">{t('coach.meal.perServingShort')}</p>
                        </div>
                      </div>
                      </button>
                      {type === 'nutrition' && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {onLogMeal && (
                            <button
                              type="button"
                              onClick={() =>
                                setMealDetail({ meal: meal as Record<string, unknown>, dayLabel: String(d.day ?? '') })
                              }
                              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 ui-btn-brand px-4 py-3 text-[9px]"
                            >
                              {t('coach.meal.logCta')}
                            </button>
                          )}
                        <button
                          type="button"
                          disabled={rationBusy || typeof meal.title !== 'string' || meal.title.trim().length === 0}
                          onClick={e => {
                            e.stopPropagation();
                            void persistCoachMealRation(meal as Record<string, unknown>, String(d.day ?? ''), mealKey);
                          }}
                          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 ui-btn-brand px-4 py-3 text-[9px] disabled:opacity-50 touch-manipulation"
                        >
                          {rationBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          {t('coach.ration.save')}
                        </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {typeof d.notes === 'string' && d.notes.trim() ? (
                  <p className="text-xs font-medium italic leading-relaxed text-[var(--text-primary)]/85">{d.notes}</p>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
      <AnimatePresence>
        {mealDetail && onLogMeal && (
          <CoachMealDetailModal
            meal={mealDetail.meal}
            dayLabel={mealDetail.dayLabel}
            onClose={() => setMealDetail(null)}
            onLog={async () => {
              await onRefetchNutrition?.();
              setMealDetail(null);
              showTemplateToast(`✅ ${t('coach.meal.loggedOk')}`);
            }}
            onLogLegacy={onLogMeal}
          />
        )}
      </AnimatePresence>
      <CoachRefineSheet
        open={refineOpen}
        planType={type}
        busy={templateBusy}
        onClose={() => setRefineOpen(false)}
        onSubmit={(p) => void handleRefineSubmit(p)}
      />
      <CoachNamePromptSheet
        open={namePrompt != null}
        title={namePrompt?.kind === 'day' ? t('coach.tpl.saveDay') : t('coach.tpl.wholeWeek')}
        label={namePrompt?.kind === 'day' ? t('coach.prompt.workoutTplName') : t('coach.prompt.planName')}
        defaultValue={
          namePrompt?.kind === 'day'
            ? namePrompt.defaultName
            : t('coach.defaultWeekTpl', { n: weekNumber })
        }
        busy={templateBusy}
        onClose={() => setNamePrompt(null)}
        onConfirm={(name) => {
          const p = namePrompt;
          setNamePrompt(null);
          if (!p) return;
          if (p.kind === 'week') void saveWeekTemplateWithName(name);
          else void saveDayTemplateWithName(p.day, name);
        }}
      />
      <CoachBulkRationConfirmSheet
        open={bulkRationOpen}
        mealCount={coachNutritionWeekMeals.length}
        busy={templateBusy}
        progress={bulkRationProgress}
        onClose={closeBulkRationSheet}
        onConfirm={() => void confirmSaveAllCoachMealsAsRations()}
      />
      <CoachSpontaneousTodaySheet
        open={spontaneousOpen}
        busy={templateBusy}
        defaultDuration={defaultSessionDuration}
        defaultEquipment={defaultEquipment}
        onClose={() => setSpontaneousOpen(false)}
        onSubmit={p => void handleSpontaneousToday(p)}
      />
    </div>
  );
}

// ─── WeeklyReport ─────────────────────────────────────────────────────────────

function WeeklyReportView({
  report,
  weekNumber,
  planId,
  reportStale,
  onFactsRefresh,
  onRegenerateReport,
  regenerating,
  aiEnabled,
}: {
  report: any;
  weekNumber: number;
  planId?: string;
  reportStale?: boolean;
  onFactsRefresh?: () => void;
  onRegenerateReport?: () => Promise<void>;
  regenerating?: boolean;
  aiEnabled?: boolean;
}) {
  const { t } = useI18n();
  const [liveFacts, setLiveFacts] = useState<AthleteWeekSnapshot | undefined>(
    report.factsSnapshot as AthleteWeekSnapshot | undefined,
  );
  const [factsLoading, setFactsLoading] = useState(false);

  useEffect(() => {
    if (report.factsSnapshot) {
      setLiveFacts(report.factsSnapshot as AthleteWeekSnapshot);
      return;
    }
    if (!planId) return;
    let cancelled = false;
    setFactsLoading(true);
    void api<{ snapshot: AthleteWeekSnapshot }>(
      `/api/coach/plans/${planId}/week-facts?weekNumber=${weekNumber}`,
    )
      .then((data) => {
        if (!cancelled) setLiveFacts(data.snapshot);
      })
      .catch(() => {
        if (!cancelled) setLiveFacts(undefined);
      })
      .finally(() => {
        if (!cancelled) setFactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [report.factsSnapshot, planId, weekNumber]);

  const facts = liveFacts;
  const STARS = Math.round(report.overallRating / 2);
  const rec = report.recommendation;
  const recColor = rec === 'increase_volume' ? 'text-green-600 bg-green-50' :
                   rec === 'reduce_volume' || rec === 'deload' ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50';

  return (
    <div className="space-y-6">
      {reportStale && onRegenerateReport && (
        <CoachStaleReportBanner onRegenerate={onRegenerateReport} regenerating={regenerating} />
      )}

      <div className="bg-black text-white rounded-[2rem] p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t('dash.coach.weekAnalysis', { n: weekNumber })}</p>
            <p className="text-3xl font-black italic uppercase tracking-tighter mt-1">{report.summary?.split('.')[0] || t('dash.coach.weeklyAnalysis')}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black italic">{report.overallRating}<span className="text-lg text-gray-400">/10</span></p>
            <div className="flex gap-0.5 justify-end mt-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} className={i < STARS ? "text-yellow-400 fill-yellow-400" : "text-gray-600"} />
              ))}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-300 font-medium leading-relaxed">{report.coachMessage}</p>
      </div>

      {factsLoading && !facts && (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-brand" size={24} />
        </div>
      )}
      {facts && planId && (
        <CoachReportFacts
          facts={facts}
          planId={planId}
          weekNumber={weekNumber}
          onFactsUpdated={setLiveFacts}
          onRegenerateReport={onRegenerateReport}
          aiEnabled={aiEnabled}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {report.performanceHighlights?.length > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-6">
            <div className="flex gap-2 mb-3"><CheckCircle size={16} className="text-green-600" /><p className="text-[10px] font-black uppercase tracking-widest text-green-700">{t('dash.coach.strengths')}</p></div>
            <ul className="space-y-1">{report.performanceHighlights.map((h: string, i: number) => <li key={i} className="text-xs font-bold text-green-800">· {h}</li>)}</ul>
          </div>
        )}
        {report.areasToImprove?.length > 0 && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6">
            <div className="flex gap-2 mb-3"><AlertCircle size={16} className="text-orange-600" /><p className="text-[10px] font-black uppercase tracking-widest text-orange-700">{t('dash.coach.workOn')}</p></div>
            <ul className="space-y-1">{report.areasToImprove.map((a: string, i: number) => <li key={i} className="text-xs font-bold text-orange-800">· {a}</li>)}</ul>
          </div>
        )}
      </div>

      {report.weekOverWeekComparison && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">{t('dash.coach.weekOverWeek')}</p>
          <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed">{report.weekOverWeekComparison}</p>
        </div>
      )}

      {report.nextWeekStrategy && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-brand mb-3">{t('dash.coach.nextWeekPlan')}</p>
          <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed">{report.nextWeekStrategy}</p>
          {report.nextWeekChanges?.length > 0 && (
            <ul className="mt-3 space-y-2">
              {report.nextWeekChanges.map((c: string, i: number) => (
                <li key={i} className="flex gap-2 text-xs text-[var(--text-primary)] font-bold bg-[var(--background)] rounded-xl p-3">
                  <span className="text-brand flex-shrink-0">→</span> {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {report.completionRate !== undefined && (
        <div className="flex gap-3">
          <div className={cn("flex-1 rounded-2xl p-4 text-center text-sm font-black", recColor)}>
            <p className="text-lg font-black">{report.completionRate}%</p>
            <p className="text-[9px] uppercase tracking-widest mt-0.5">{t('coach.report.completion')}</p>
          </div>
          <div className={cn("flex-1 rounded-2xl p-4 text-center text-sm font-black uppercase tracking-widest", recColor)}>
            <p className="text-lg font-black">{formatCoachRecommendation(rec, t)}</p>
            <p className="text-[9px] uppercase tracking-widest mt-0.5">{t('coach.report.nextWeek')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PlanDetailPage ───────────────────────────────────────────────────────────

function PlanDetail({ planId, onBack, initialExpandedDay }: { planId: string; onBack: () => void; initialExpandedDay?: string | null; }) {
  const coachActionBtnBase =
    'flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] transition-all duration-200';
  const coachActionBtnHover =
    'shadow-[0_0_0_0_rgba(16,185,129,0)] hover:border-brand/40 hover:text-[var(--text-primary)] hover:shadow-[0_0_16px_rgba(16,185,129,0.18)]';
  const coachActionBtnDangerHover =
    'shadow-[0_0_0_0_rgba(239,68,68,0)] hover:border-red-300 hover:text-red-600 hover:shadow-[0_0_16px_rgba(239,68,68,0.2)]';

  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<'week' | 'report' | 'advance' | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'reports' | 'history'>('schedule');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [advanceMsg, setAdvanceMsg] = useState('');
  const [sessionDay, setSessionDay] = useState<any | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<{ sessionKey: string } | null>(null);
  const [reportStale, setReportStale] = useState(false);
  const [liveWeekFacts, setLiveWeekFacts] = useState<AthleteWeekSnapshot | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPhase, setRegenPhase] = useState<CoachPlanGenerationPhase | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [showRegenerateStartModal, setShowRegenerateStartModal] = useState(false);
  const [regenerateStartDate, setRegenerateStartDate] = useState<CoachStartDateOption>('today');
  const [confirmDialog, setConfirmDialog] = useState<'cancelPlan' | 'deletePlan' | null>(null);
  const regenAbortRef = useRef<AbortController | null>(null);
  const regenSuccessTimeoutRef = useRef<number | null>(null);
  const { profile, updateProfile, user } = useAuth();
  const { addMeal, refetch: refetchNutrition } = useNutrition();
  const { addWorkout } = useWorkouts();
  const aiCaps = useAiCapabilities();
  const { t, locale } = useI18n();

  const planOnboarding = useMemo(() => {
    const raw = plan?.onboarding_data;
    if (!raw) return { equipment: [] as string[], sessionDuration: 60 };
    const ob =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>);
    return {
      equipment: Array.isArray(ob.equipment) ? (ob.equipment as string[]) : [],
      sessionDuration: typeof ob.sessionDuration === 'number' ? ob.sessionDuration : 60,
    };
  }, [plan?.onboarding_data]);

  const { coachPlans: cachedPlans, refetch: refetchCoachPlansCache } = useCoachPlans();

  const fetchPlan = useCallback(async () => {
    try {
      await refetchCoachPlansCache();
      const data = await api<CoachPlan>(`/api/coach/plans/${planId}`);
      setPlan(data);
      if (!selectedWeek) setSelectedWeek(data.current_week);
    } finally {
      setLoading(false);
    }
  }, [planId, selectedWeek, refetchCoachPlansCache]);

  const handlePlanStatusChange = async (newStatus: 'active' | 'cancelled') => {
    if (!plan) return;

    try {
      // API call to update the plan's status in the backend
      await api(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      
      if (newStatus === 'active') {
        // Re-activating a plan
        const schedule: PlannedSession[] = resolveCoachScheduleDayList(plan.current_schedule?.schedule)
          .filter((d: any) => d.day && Object.keys(DAY_INDEX).includes(d.day))
          .map((d: any) => ({
            day: DAY_INDEX[d.day] === 0 ? 7 : DAY_INDEX[d.day], // Mon=1..Sun=7
            title: d.title || d.day,
            activity: d.sessionType || plan.discipline,
            exercises: coachDayToDayExercises(d as Record<string, unknown>, locale, profile ?? undefined) as Exercise[],
            isRestDay: d.isRest || false,
        }));
        await updateProfile({ workoutPlan: { name: plan.discipline, schedule } });
        setMsg('✅ Plan has been reactivated and set as your primary schedule!');
      } else {
        // Deactivating or pausing a plan - clear it from active profile if it was the one set
        if (profile?.workoutPlan?.name === plan.discipline) {
           await updateProfile({ workoutPlan: null });
        }
        setMsg(newStatus === 'cancelled' ? '☑️ Plan has been cancelled.' : '⏸️ Plan has been paused.');
      }
      
      await fetchPlan(); // Refetch plan data to update UI
      setTimeout(() => setMsg(''), 4000);

    } catch (err: any) {
      setMsg(`❌ Error: ${err.message}`);
    }
  };

  // Auto-advance check on mount (nur wenn KI konfiguriert — sonst 503 vermeiden)
  useEffect(() => {
    if (aiCaps.loading || !aiCaps.enabled) return;
    let cancelled = false;
    const checkAdvance = async () => {
      try {
        const { tryCoachAutoAdvancePlan } = await import('@/src/lib/coach/coachAutoAdvance');
        const result = await tryCoachAutoAdvancePlan(planId);
        if (cancelled) return;
        if (result.advanced) {
          const weeks = result.weeksAdvanced && result.weeksAdvanced > 1 ? ` (${result.weeksAdvanced} Wochen)` : '';
          setAdvanceMsg(
            `✅ Woche ${result.newWeek} aktiv${weeks}${result.weeklyReportGenerated ? ' · Wochenbericht bereit' : ''}!`,
          );
          await fetchPlan();
          setSelectedWeek(result.newWeek ?? null);
        }
      } catch {
        // silent – auto-advance failure shouldn't break the UI
      }
    };
    checkAdvance();
    return () => { cancelled = true; };
  }, [planId, aiCaps.loading, aiCaps.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  /** Gleicher Plan-Cache wie Workouts „This week“ — Änderungen dort sofort hier anzeigen. */
  useEffect(() => {
    const cached = cachedPlans.find(p => p.id === planId);
    const cachedSched = cached?.current_schedule as
      | { schedule?: unknown; week_number?: number; start_date?: string }
      | undefined;
    if (!cachedSched?.schedule || !plan) return;

    const weekNum = cachedSched.week_number ?? plan.current_week;
    const existing = plan.schedules?.find(s => s.week_number === weekNum);
    if (JSON.stringify(existing?.schedule ?? null) === JSON.stringify(cachedSched.schedule)) return;

    setPlan(prev => {
      if (!prev) return prev;
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      const idx = schedules.findIndex(s => s.week_number === weekNum);
      const row = {
        week_number: weekNum,
        schedule: cachedSched.schedule,
        start_date: cachedSched.start_date,
      };
      if (idx >= 0) schedules[idx] = { ...schedules[idx], ...row };
      else schedules.push(row as (typeof schedules)[number]);
      return {
        ...prev,
        current_schedule: cachedSched as CoachPlan['current_schedule'],
        schedules,
      };
    });
  }, [cachedPlans, planId, plan]);

  useEffect(() => () => {
    if (regenSuccessTimeoutRef.current !== null) {
      window.clearTimeout(regenSuccessTimeoutRef.current);
      regenSuccessTimeoutRef.current = null;
    }
  }, []);

  // Detect if a day is purely cardio (no strength exercises)
  const isCardioDay = (day: any): boolean => {
    const hasExercises = coachRowHasExercises(day as Record<string, unknown>);
    const card = day.cardio && typeof day.cardio === 'object' ? day.cardio : null;
    const hasCardio = !!(card?.type || card?.details || card?.duration || card?.distance || card?.pace || card?.zones);
    const type = (day.sessionType || '').toLowerCase();
    const title = (day.title || '').toLowerCase();
    const cardioTypes = ['run', 'ride', 'swim', 'row', 'bike', 'cycling', 'running', 'swimming', 'rowing', 'cardio'];
    if (cardioTypes.some(t => type.includes(t))) return true;
    if (hasCardio && !hasExercises) return true;
    if (cardioTypes.some(t => title.startsWith(t)) && !hasExercises) return true;
    if (!hasExercises && /cardio|interval|tempo|endurance|5k|10k|hiit|time trial/.test(`${type} ${title}`)) return true;
    return false;
  };

  const getCardioType = (day: any): 'running' | 'cycling' | 'swimming' | 'rowing' | 'cardio' => {
    const t = (day.sessionType || day.title || '').toLowerCase();
    if (t.includes('run') || t.includes('jog')) return 'running';
    if (t.includes('cycl') || t.includes('bike') || t.includes('ride')) return 'cycling';
    if (t.includes('swim')) return 'swimming';
    if (t.includes('row')) return 'rowing';
    if (day.cardio?.type) {
      const ct = day.cardio.type.toLowerCase();
      if (ct.includes('run')) return 'running';
      if (ct.includes('cycl') || ct.includes('bike')) return 'cycling';
      if (ct.includes('swim')) return 'swimming';
      if (ct.includes('row')) return 'rowing';
    }
    return 'cardio';
  };

  const handleSessionComplete = async (session: Partial<Workout>) => {
    if (!plan || !user?.uid) return;
    const day = sessionDay;
    if (!day) return;
    const dayName = String(day.day ?? '');
    const title = String(day.title || day.sessionType || 'Coach Session');
    const weekNum = selectedWeek ?? plan.current_week;
    const sessionKey = buildPlannedSessionKey(dayName, title, day.sessionSlot);
    try {
      await addWorkout({
        name: session.name || title,
        type: coachSessionToWorkoutType(
          typeof day.sessionType === 'string' ? day.sessionType : undefined,
          title,
        ),
        date:
          (typeof day.plannedDate === 'string' && day.plannedDate) ||
          new Date().toISOString().split('T')[0],
        duration: session.duration || day.estimatedDuration || 60,
        caloriesBurned: session.caloriesBurned ?? estimateWorkoutCalories(session),
        notes: `AI Coach – Week ${weekNum}`,
        exercises: session.exercises || [],
        userId: user.uid,
        completedAt: new Date().toISOString(),
        ...(session.cardioSessionFeedback
          ? { cardioSessionFeedback: session.cardioSessionFeedback }
          : {}),
        ...(typeof session.sessionRpe === 'number' ? { sessionRpe: session.sessionRpe } : {}),
        coachSessionMeta: {
          planId: plan.id,
          weekNumber: weekNum,
          sessionKey,
          plannedDay: dayName,
          sessionSlot: day.sessionSlot,
          title,
        },
      });
      clearSessionDraft();
      setPendingFeedback({ sessionKey });
      setSessionDay(null);
    } catch (err: unknown) {
      setMsg(
        `${t('coach.toast.err')}: ${err instanceof Error ? err.message : String(err)}`.trim(),
      );
    }
  };

  const convertToSessionExercises = (day: Record<string, unknown>) =>
    coachDayToSessionExerciseList(day, locale, profile ?? undefined);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  if (!plan) return null;

  const meta = getDisciplineMeta(plan, t);
  const Icon = meta.icon;
  const currentSchedule = plan.schedules?.find(s => s.week_number === (selectedWeek ?? plan.current_week));
  const currentReport = plan.reports?.find(r => r.week_number === (selectedWeek ?? plan.current_week));

  const setStatus = async (newStatus: 'active' | 'paused' | 'cancelled') => {
    if (!plan) return;

    try {
      // API call to update the plan's status in the backend
      await api(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      
      if (newStatus === 'active') {
        // Re-activating a plan
        const schedule: PlannedSession[] = resolveCoachScheduleDayList(plan.current_schedule?.schedule)
          .filter((d: any) => d.day && Object.keys(DAY_INDEX).includes(d.day))
          .map((d: any) => ({
            day: DAY_INDEX[d.day] === 0 ? 7 : DAY_INDEX[d.day], // Mon=1..Sun=7
            title: d.title || d.day,
            activity: d.sessionType || plan.discipline,
            exercises: coachDayToDayExercises(d as Record<string, unknown>, locale, profile ?? undefined) as Exercise[],
            isRestDay: d.isRest || false,
        }));
        await updateProfile({ workoutPlan: { name: plan.discipline, schedule } });
        setMsg(t('coach.msg.reactivated'));
      } else {
        // Deactivating or pausing a plan - clear it from active profile if it was the one set
        if (profile?.workoutPlan?.name === plan.discipline) {
           await updateProfile({ workoutPlan: null });
        }
      }
      
      await fetchPlan(); // Refetch plan data to update UI
      setTimeout(() => setMsg(''), 4000);

    } catch (err: any) {
      setMsg(t('coach.msg.err', { msg: err.message }));
    }
  };

  const openRegenerateStartModal = () => {
    let onboardingData: { startDate?: unknown } = {};
    if (typeof plan?.onboarding_data === 'string') {
      try {
        onboardingData = JSON.parse(plan.onboarding_data) as { startDate?: unknown };
      } catch {
        onboardingData = {};
      }
    } else {
      onboardingData = (plan?.onboarding_data ?? {}) as { startDate?: unknown };
    }
    const rawStart = onboardingData.startDate;
    const normalized = rawStart === 'tomorrow' || rawStart === 'next_monday' ? rawStart : 'today';
    setRegenerateStartDate(normalized);
    setShowRegenerateStartModal(true);
  };

  const regeneratePlan = async (startDate: CoachStartDateOption) => {
    if (!plan) return;
    setShowRegenerateStartModal(false);
    regenAbortRef.current?.abort();
    const ac = new AbortController();
    regenAbortRef.current = ac;
    setGenerating('week');
    setRegenOpen(true);
    setRegenPhase('queued');
    setRegenError(null);
    setMsg('');
    let failed = false;
    try {
      await api(`/api/coach/plans/${plan.id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ startDate }),
        signal: ac.signal,
      });
      await waitForCoachPlanGeneration(plan.id, {
        timeoutMs: 12 * 60 * 1000,
        signal: ac.signal,
        onTick: state => {
          if (state.phase) setRegenPhase(state.phase);
          if (state.status === 'ready') setRegenPhase('ready');
        },
      });
      await fetchPlan();
      setSelectedWeek(1);
      setActiveTab('schedule');
      setReportStale(false);
      const successMessage = `✅ ${t('coach.msg.regenerated')}`;
      setMsg(successMessage);
      if (regenSuccessTimeoutRef.current !== null) {
        window.clearTimeout(regenSuccessTimeoutRef.current);
      }
      regenSuccessTimeoutRef.current = window.setTimeout(() => {
        setMsg(prev => (prev === successMessage ? '' : prev));
        regenSuccessTimeoutRef.current = null;
      }, 5000);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMsg(t('coach.gen.cancelled'));
      } else {
        failed = true;
        const raw = err instanceof Error ? err.message : String(err);
        const msg = raw === 'COACH_GEN_TIMEOUT' ? t('coach.gen.timeout') : t('coach.msg.err', { msg: raw });
        setRegenError(msg);
        setMsg(msg);
      }
    } finally {
      regenAbortRef.current = null;
      setGenerating(null);
      if (!failed) setRegenOpen(false);
    }
  };

  const reportWeekNum = selectedWeek ?? plan?.current_week ?? 1;

  const generateReport = async () => {
    if (!plan) return;
    setGenerating('report');
    setMsg('');
    try {
      await api(`/api/coach/plans/${plan.id}/weekly-report`, {
        method: 'POST',
        body: JSON.stringify({ weekNumber: reportWeekNum }),
      });
      setReportStale(false);
      setMsg(t('coach.msg.reportOk'));
      await fetchPlan();
    } catch (err: any) {
      setMsg(t('coach.msg.err', { msg: err.message }));
    } finally {
      setGenerating(null);
    }
  };

  if (sessionDay) {
    return (
      <AnimatePresence>
        <WorkoutSessionPlayer
          workout={{
            name: sessionDay.title || 'Coach Session',
            type: sessionDay.sessionType || 'Strength',
            exercises: convertToSessionExercises(sessionDay),
          }}
          onComplete={handleSessionComplete}
          onCancel={() => setSessionDay(null)}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Back + Header */}
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-black uppercase tracking-widest transition-colors">
        {t('coach.backPlans')}
      </button>

      {pendingFeedback && plan.type === 'workout' && (
        <CoachSessionFeedbackBar
          planId={plan.id}
          sessionKey={pendingFeedback.sessionKey}
          onDone={() => setPendingFeedback(null)}
          onFactsRefreshed={(snap) => {
            setLiveWeekFacts(snap);
            setMsg(t('coach.feedback.factsRefreshed', { pct: snap.adherence.completionRate }));
            setTimeout(() => setMsg(''), 4000);
          }}
        />
      )}

      {liveWeekFacts && plan.type === 'workout' && (
        <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs font-bold text-[var(--text-primary)]">
          {t('coach.feedback.weekPreview', {
            pct: liveWeekFacts.adherence.completionRate,
            n: liveWeekFacts.weekNumber,
          })}
        </div>
      )}

      {/* Auto-advance notification */}
      {advanceMsg && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-bold text-green-800">{advanceMsg}</p>
        </motion.div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-6">
          <div className={cn("w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-white", meta.color)}>
            <Icon size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{meta.label}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">
              {t('coach.plan.weekContext', { n: plan.current_week })} · {plan.plan_mode === 'event' ? plan.event_name : t('coach.plan.ongoing')}
            </p>
          </div>
        </div>
        <span className={cn("text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full",
          plan.status === 'active' ? "bg-green-100 text-green-700" :
          plan.status === 'paused' ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500")}>
          {plan.status}
        </span>
      </div>

      {/* Aktionen — Mobile-first Grid */}
      <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--text-muted)]">{t('coach.actions.title')}</p>
        {plan.status === 'active' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!!generating || aiCaps.loading || !aiCaps.enabled}
                onClick={openRegenerateStartModal}
                className={cn(
                  'col-span-2 sm:col-span-1 disabled:opacity-50',
                  coachActionBtnBase,
                  coachActionBtnHover,
                )}
              >
                {generating === 'week' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t('coach.actions.regeneratePlan')}
              </button>
              <button
                type="button"
                disabled={!!generating || aiCaps.loading || !aiCaps.enabled}
                onClick={generateReport}
                className={cn(
                  'col-span-2 sm:col-span-1 disabled:opacity-50',
                  coachActionBtnBase,
                  coachActionBtnHover,
                )}
              >
                {generating === 'report' ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                {t('coach.actions.report')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('paused')}
                className={cn(coachActionBtnBase, coachActionBtnHover, 'gap-1.5')}
              >
                <Pause size={14} /> {t('coach.actions.pause')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDialog('cancelPlan')}
                className={cn(coachActionBtnBase, coachActionBtnDangerHover, 'gap-1.5')}
              >
                <XCircle size={14} /> {t('coach.actions.stop')}
              </button>
            </div>
          </>
        )}
        {plan.status === 'paused' && (
          <button
            type="button"
            onClick={() => setStatus('active')}
            className={cn('w-full', coachActionBtnBase, coachActionBtnHover)}
          >
            <Play size={14} /> {t('coach.actions.resume')}
          </button>
        )}
        {plan.status === 'cancelled' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStatus('active')}
              className={cn(coachActionBtnBase, coachActionBtnHover)}
            >
              <Play size={14} /> {t('coach.actions.reactivate')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDialog('deletePlan')}
              className={cn(coachActionBtnBase, coachActionBtnDangerHover)}
            >
              <Trash2 size={14} /> {t('coach.actions.delete')}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {msg && (
          <motion.div
            key={msg}
            initial={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, filter: 'blur(8px)' }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className={cn('rounded-xl p-4 text-sm font-bold', msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}
          >
            {msg}
          </motion.div>
        )}
      </AnimatePresence>
      <CoachPlanGenerationModal
        open={regenOpen}
        message={t('coach.gen.regenerating')}
        phase={regenPhase}
        error={regenError}
        onCancel={() => {
          if (regenError) {
            setRegenOpen(false);
            setRegenError(null);
            return;
          }
          regenAbortRef.current?.abort();
          setRegenOpen(false);
        }}
      />
      <MobileOverlayRoot open={showRegenerateStartModal}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={mobileDialogOverlayClass('bg-black/60')}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="w-full max-w-lg rounded-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-5 sm:p-6"
            >
              <div className="mb-5 space-y-1">
                <h3 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)]">
                  {t('coach.regen.startDate.title')}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">{t('coach.onb.startDate.prompt')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {COACH_START_DATE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRegenerateStartDate(opt.id)}
                    className={cn(
                      'min-h-[56px] rounded-2xl border-2 px-4 py-4 text-[11px] font-black uppercase tracking-widest transition-all',
                      regenerateStartDate === opt.id
                        ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                        : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] hover:border-brand/50',
                    )}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowRegenerateStartModal(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {t('coach.wk.reorderCancel')}
                </button>
                <button
                  type="button"
                  disabled={!!generating}
                  onClick={() => {
                    void regeneratePlan(regenerateStartDate);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] shadow-[0_0_0_0_rgba(16,185,129,0)] transition-all duration-200 hover:border-brand/40 hover:text-[var(--text-primary)] hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] disabled:opacity-50"
                >
                  {t('coach.regen.startDate.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
      </MobileOverlayRoot>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--background)] p-1 rounded-2xl">
        {(['schedule', 'reports', 'history'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            data-testid={tab === 'reports' ? 'coach-tab-reports' : tab === 'schedule' ? 'coach-tab-schedule' : 'coach-tab-history'}
            onClick={() => setActiveTab(tab)}
            className={cn("flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
              activeTab === tab ? "bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)]")}>
            {t(`coach.tab.${tab}` as 'coach.tab.schedule')}
          </button>
        ))}
      </div>

      {/* Week selector for schedule/history */}
      {(activeTab === 'schedule' || activeTab === 'history') && plan.schedules && plan.schedules.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {plan.schedules.map(s => (
            <button key={s.week_number} onClick={() => setSelectedWeek(s.week_number)}
              className={cn("flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                selectedWeek === s.week_number ? "border-black bg-black text-white" : "border-[var(--border-muted)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>
              {t('coach.wk.week', { n: s.week_number })}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'schedule' && (
        currentSchedule
          ? <WeeklyScheduleView
              schedule={currentSchedule.schedule}
              type={plan.type}
              planId={plan.id}
              weekNumber={currentSchedule.week_number}
              weekStartDate={
                currentSchedule.start_date
                  ? String(currentSchedule.start_date).split('T')[0]
                  : undefined
              }
              isCurrentWeek={currentSchedule.week_number === plan.current_week}
              onStartSession={(day: any) => setSessionDay(day)}
              onReordered={fetchPlan}
              onPlanRefetch={fetchPlan}
              onReportStale={() => setReportStale(true)}
              planCurrentWeek={plan.current_week}
              onLogMeal={plan.type === 'nutrition' ? addMeal : undefined}
              onRefetchNutrition={plan.type === 'nutrition' ? refetchNutrition : undefined}
              initialExpandedDay={initialExpandedDay}
              defaultEquipment={planOnboarding.equipment}
              defaultSessionDuration={planOnboarding.sessionDuration}
            />
          : <div className="text-center py-16 text-[var(--text-muted)]"><Brain size={48} className="mx-auto mb-4 opacity-20" /><p className="font-black uppercase">{t('coach.empty.noSchedule')}</p></div>
      )}

      {activeTab === 'reports' && (
        currentReport
          ? (
            <WeeklyReportView
              report={currentReport.report}
              weekNumber={currentReport.week_number}
              planId={plan.id}
              reportStale={reportStale && currentReport.week_number === plan.current_week}
              onFactsRefresh={() => void fetchPlan()}
              onRegenerateReport={generateReport}
              regenerating={generating === 'report'}
              aiEnabled={aiCaps.enabled}
            />
          )
          : <div className="text-center py-16 text-[var(--text-muted)]"><TrendingUp size={48} className="mx-auto mb-4 opacity-20" /><p className="font-black uppercase">{t('coach.empty.noReport')}</p><p className="text-sm mt-2">{t('coach.empty.reportHint')}</p></div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {plan.reports && plan.reports.length > 0
            ? plan.reports.map(r => (
                <motion.div key={r.week_number} whileHover={{ y: -1 }} onClick={() => setSelectedWeek(r.week_number)}
                  className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-6 cursor-pointer hover:border-brand/30 transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black uppercase tracking-tight text-[var(--text-primary)]">Week {r.week_number} Report</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-bold mt-0.5">{format(parseISO(r.generated_at), 'd MMM yyyy')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-black text-[var(--text-primary)]">{r.report.overallRating}/10</p>
                      <ChevronRight size={16} className="text-[var(--text-muted)]" />
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-2 font-medium line-clamp-2">{r.report.coachMessage}</p>
                </motion.div>
              ))
            : <div className="text-center py-16 text-[var(--text-muted)]"><p className="font-black uppercase">{t('coach.detail.noReports')}</p></div>
          }
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog === 'cancelPlan'}
        title={t('coach.actions.stop')}
        message={t('coach.confirm.cancelPlan')}
        variant="danger"
        confirmLabel={t('coach.actions.stop')}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          setConfirmDialog(null);
          setStatus('cancelled');
        }}
      />
      <ConfirmDialog
        open={confirmDialog === 'deletePlan'}
        title={t('coach.actions.delete')}
        message={t('coach.confirm.deletePlan')}
        variant="danger"
        confirmLabel={t('coach.actions.delete')}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          setConfirmDialog(null);
          void (async () => {
            try {
              await api(`/api/coach/plans/${plan.id}`, { method: 'DELETE' });
              onBack();
            } catch (err: unknown) {
              setMsg(
                t('coach.msg.err', {
                  msg: err instanceof Error ? err.message : String(err),
                }),
              );
            }
          })();
        }}
      />
    </div>
  );
}

// ─── CoachPage (main) ─────────────────────────────────────────────────────────

interface CoachPageProps {
  planType?: 'workout' | 'nutrition';
  deepLink?: { planId: string, day: string } | null;
  /** Nach App-Onboarding: Coach-Wizard direkt öffnen */
  autoStartOnboarding?: boolean;
}

export default function CoachPage({ planType, deepLink, autoStartOnboarding }: CoachPageProps = {}) {
  const navigate = useNavigate();
  const aiCaps = useAiCapabilities();
  const { t } = useI18n();
  const { coachPlans: cachedPlans, ready: plansCacheReady, refetch: refetchCoachPlansCache } = useCoachPlans();
  const [allPlans, setAllPlans] = useState<CoachPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [initialExpandedDay, setInitialExpandedDay] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [genPhase, setGenPhase] = useState<CoachPlanGenerationPhase | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [cancellingGen, setCancellingGen] = useState(false);
  const genAbortRef = useRef<AbortController | null>(null);

  // Effect to handle deep linking from other pages
  useEffect(() => {
    if (deepLink) {
      setSelectedPlanId(deepLink.planId);
      setInitialExpandedDay(deepLink.day);
    }
  }, [deepLink]);

  const fetchPlans = useCallback(async () => {
    try {
      await refetchCoachPlansCache();
    } finally {
      setLoading(false);
    }
  }, [refetchCoachPlansCache]);

  useEffect(() => {
    if (plansCacheReady) {
      setAllPlans(cachedPlans as unknown as CoachPlan[]);
      setLoading(false);
    }
  }, [cachedPlans, plansCacheReady]);

  useEffect(() => {
    if (!autoStartOnboarding || loading) return;
    if (aiCaps.enabled) setShowOnboarding(true);
  }, [autoStartOnboarding, loading, aiCaps.enabled]);

  const scopedAll = planType ? allPlans.filter(p => p.type === planType) : allPlans;
  const pendingPlans: PendingCoachPlan[] = scopedAll.filter(
    (p): p is CoachPlan & PendingCoachPlan =>
      p.generation_status === 'generating' || p.generation_status === 'failed',
  );
  const plans = scopedAll.filter(
    p => p.generation_status !== 'generating' && p.generation_status !== 'failed',
  );

  const handleCreatePlan = async (onboardingData: any, discipline: string) => {
    setShowOnboarding(false);
    genAbortRef.current?.abort();
    const ac = new AbortController();
    genAbortRef.current = ac;
    setCreating(true);
    setGenError(null);
    setGenPhase('queued');
    setCreateMsg(
      aiCaps.provider === 'ollama'
        ? t('coach.gen.ollama')
        : aiCaps.provider === 'deepseek'
          ? t('coach.gen.deepseek')
          : aiCaps.provider === 'mistral'
            ? t('coach.gen.mistral')
            : t('coach.gen.gemini'),
    );
    let planId: string | null = null;
    try {
      planId = await createCoachPlanAndWait(
        {
          type: onboardingData.type,
          discipline,
          planMode: onboardingData.planMode ?? 'ongoing',
          eventName: onboardingData.eventName,
          eventDate: onboardingData.eventDate,
          eventDistance: onboardingData.eventDistance,
          onboardingData,
        },
        {
          signal: ac.signal,
          onPlanCreated: id => setActivePlanId(id),
          onTick: state => {
            if (state.phase) setGenPhase(state.phase);
            if (state.status === 'ready') setGenPhase('ready');
          },
        },
      );
      setActivePlanId(null);
      await fetchPlans();
      setSelectedPlanId(planId);
      setCreateMsg('');

      const nextKind = advanceCoachSetupQueue(onboardingData.type as 'workout' | 'nutrition');
      if (nextKind) {
        navigate(coachSetupPath(nextKind));
        return;
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setCreateMsg(t('coach.gen.cancelled'));
      } else {
        const raw = err instanceof Error ? err.message : String(err);
        const msg =
          raw === 'COACH_GEN_TIMEOUT'
            ? t('coach.gen.timeout')
            : raw.startsWith('Coach workout generation') || raw.startsWith('Coach nutrition generation')
              ? `❌ ${raw}`
              : t('coach.msg.err', { msg: raw });
        setGenError(msg);
        setCreateMsg(msg);
      }
      if (planId) await abortCoachPlanCreation(planId);
    } finally {
      setCreating(false);
      setCancellingGen(false);
      genAbortRef.current = null;
      forceReleaseAllOverlayScrollLocks();
    }
  };

  const handleCancelPlanGeneration = async () => {
    setCancellingGen(true);
    genAbortRef.current?.abort();
    await abortCoachPlanCreation(activePlanId);
    setActivePlanId(null);
    setCreating(false);
    setGenError(null);
    setCancellingGen(false);
  };

  if (selectedPlanId) {
    return (
      <div className={planType ? '' : 'max-w-2xl mx-auto'}>
        <PlanDetail
          planId={selectedPlanId}
          onBack={() => {
            setSelectedPlanId(null);
            setInitialExpandedDay(null); // Clear expanded day when going back
            fetchPlans();
          }}
          initialExpandedDay={initialExpandedDay}
        />
      </div>
    );
  }

  const activePlans = plans.filter(p => p.status === 'active');
  const otherPlans = plans.filter(p => p.status !== 'active');

  const typeLabel = planType === 'workout' ? t('coach.header.workout') : planType === 'nutrition' ? t('coach.header.nutrition') : t('coach.header.ai');
  const TypeIcon = planType === 'nutrition' ? Target : Dumbbell;

  const embedded = Boolean(planType);

  return (
    <div className={cn(planType ? '' : 'max-w-2xl mx-auto', embedded ? 'space-y-5 pb-6' : 'space-y-8 pb-10')}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            className={cn(
              'font-black italic uppercase tracking-tighter text-[var(--text-primary)]',
              embedded ? 'text-xl' : 'text-2xl',
            )}
          >
            {typeLabel}
          </h2>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
            {aiCaps.loading
              ? t('coach.ai.loading')
              : aiCaps.enabled
                ? aiCaps.provider === 'ollama'
                  ? t('coach.ai.ollama')
                  : aiCaps.provider === 'deepseek'
                    ? t('coach.ai.deepseek')
                    : aiCaps.provider === 'mistral'
                      ? t('coach.ai.mistral')
                      : t('coach.ai.gemini')
                : t('coach.ai.disabled')}
          </p>
        </div>
        <button
          type="button"
          title={
            !aiCaps.loading && !aiCaps.enabled
              ? t('coach.ai.noset')
              : undefined
          }
          disabled={aiCaps.loading || !aiCaps.enabled}
          onClick={() => aiCaps.enabled && setShowOnboarding(true)}
          className={cn(
            'flex items-center justify-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-lg shadow-black/10 shrink-0',
            (!aiCaps.enabled || aiCaps.loading) && 'opacity-40 cursor-not-allowed hover:bg-black',
          )}
        >
          <Plus size={14} /> {t('coach.newPlan')}
        </button>
      </div>

      {!creating && pendingPlans.length > 0 && (
        <CoachPendingPlansPanel
          plans={pendingPlans}
          onRefresh={() => void fetchPlans()}
          onReady={planId => {
            void fetchPlans();
            setSelectedPlanId(planId);
          }}
          onRetry={() => setShowOnboarding(true)}
        />
      )}

      <CoachPlanGenerationModal
        open={creating}
        message={createMsg}
        phase={genPhase}
        error={genError}
        cancelling={cancellingGen}
        onCancel={() => {
          if (genError) {
            setCreating(false);
            setGenError(null);
            return;
          }
          void handleCancelPlanGeneration();
        }}
      />
      {createMsg && !creating && (
        <div className={cn("p-4 rounded-xl text-sm font-bold", createMsg.startsWith('❌') ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
          {createMsg}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-brand" size={28} />
        </div>
      )}

      {/* Empty state */}
      {!loading && plans.length === 0 && pendingPlans.length === 0 && !creating && (
        <div className="text-center py-16 space-y-6">
          <div className="w-20 h-20 bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-[1.5rem] flex items-center justify-center mx-auto">
            <TypeIcon size={32} className="text-[var(--text-muted)]" />
          </div>
          <div>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{t('coach.empty.noActive', { label: typeLabel })}</h3>
            <p className="text-sm text-[var(--text-muted)] mt-2 font-medium max-w-xs mx-auto">
              {planType === 'workout'
                ? t('coach.empty.workout')
                : t('coach.empty.nutrition')}
            </p>
          </div>
          <button
            type="button"
            title={
              !aiCaps.loading && !aiCaps.enabled
                ? t('work.ai.notConfigured')
                : undefined
            }
            disabled={aiCaps.loading || !aiCaps.enabled}
            onClick={() => aiCaps.enabled && setShowOnboarding(true)}
            className={cn(
              'inline-flex items-center gap-2 bg-black text-white px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-lg shadow-black/10',
              (!aiCaps.enabled || aiCaps.loading) && 'opacity-40 cursor-not-allowed hover:bg-black',
            )}
          >
            <Plus size={14} /> {t('coach.empty.create', { label: typeLabel })}
          </button>

          {/* How it works mini */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-[2rem] p-6 space-y-4 text-left mt-8">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">{t('coach.how.title')}</h4>
            {[
              { step: '01', titleKey: 'coach.how.1t', descKey: 'coach.how.1d' },
              { step: '02', titleKey: 'coach.how.2t', descKey: 'coach.how.2d' },
              { step: '03', titleKey: 'coach.how.3t', descKey: 'coach.how.3d' },
              { step: '04', titleKey: 'coach.how.4t', descKey: 'coach.how.4d' },
            ].map(item => (
              <div key={item.step} className="flex gap-4">
                <span className="text-[10px] font-black text-brand flex-shrink-0">{item.step}</span>
                <div>
                  <p className="font-black uppercase tracking-tight text-xs text-[var(--text-primary)]">{t(item.titleKey)}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">{t(item.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active plans */}
      {activePlans.length > 0 && (
        <div className="space-y-2">
          {!embedded && (
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-1">
              {t('coach.section.active')}
            </h2>
          )}
          {activePlans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              compact={embedded}
              onClick={() => setSelectedPlanId(plan.id)}
            />
          ))}
        </div>
      )}

      {/* Paused / cancelled plans */}
      {otherPlans.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] px-1">
            {t('coach.section.other')}
          </h2>
          {otherPlans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              compact={embedded}
              onClick={() => setSelectedPlanId(plan.id)}
            />
          ))}
        </div>
      )}

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <CoachOnboarding
            planType={planType ?? 'workout'}
            onComplete={handleCreatePlan}
            onClose={() => !creating && setShowOnboarding(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
