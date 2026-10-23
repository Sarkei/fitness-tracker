import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight, ArrowLeft, Dumbbell, Activity, Bike, Zap, Target,
  Waves, X, Check, Calendar, Footprints, Flame, Blend, Trophy,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import {
  COACH_MEAL_SLOT_TYPES,
  COACH_NUTRITION_WEEKDAYS,
  emptyMealSlotsByDay,
  type MealSlotsByDay,
  type NutritionDayMealPlan,
  type NutritionMealSlotConfig,
} from '@/src/lib/coachNutritionSchedule';
import type { MealCategory } from '@/src/types';
import { normalizeHhMmInput } from '@/src/lib/durationHhMmInput';
import { normalizeDecimalInput, normalizeIntegerInput } from '@/src/lib/numericInput';
import {
  emptyCustomWeekPlan,
  countCustomWeekSessions,
  syncOnboardingFromCustomPlan,
  normalizeCustomDaySlots,
  type CoachSessionSlot,
  type CustomWeekPlan,
  type WeekdaySessionType,
} from '@/src/lib/coachCustomWeekPlan';
import {
  CARDIO_DURATIONS,
  STRENGTH_DURATIONS,
  SESSION_COUNTS,
  customSlotDurationRequired,
  parseCoachSessionVolume,
  scheduleVolumeConfigValid,
  syncLegacyVolumeFields,
} from '@/src/lib/coachSessionVolume';
import CoachEquipmentMultiselect from './CoachEquipmentMultiselect';
import { COACH_DEFAULT_EQUIPMENT } from '@/src/lib/coachEquipment';
import {
  COACH_INJURY_IDS,
  formatInjuriesPlain,
  injuryLabelKey,
  injuryNotesFromPlain,
  parseInjuryIds,
  toggleInjuryId,
  type CoachInjuryId,
} from '@/src/lib/coachInjuries';
import { uiBtnPrimary, uiChoice } from '@/src/lib/uiChoices';
import {
  mobileSheetOverlayClass,
  mobileSheetPanelClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkoutOnboardingData {
  type: 'workout';
  primaryGoal: string;
  trainingStyle: 'strength' | 'endurance' | 'hybrid';
  equipment: string[];
  workoutVibe: string;
  sports: string[];
  planMode: 'ongoing' | 'event';
  eventName?: string;
  eventDate?: string;
  eventDistance?: string;
  trainingDays: number;
  sessionDuration: number;
  strengthSessionsPerWeek?: number;
  cardioSessionsPerWeek?: number;
  strengthSessionDurationMin?: number;
  cardioSessionDurationMin?: number;
  coachDecidesStrengthSessions?: boolean;
  coachDecidesCardioSessions?: boolean;
  coachDecidesStrengthDuration?: boolean;
  coachDecidesCardioDuration?: boolean;
  /** Coach wählt Trainingstage/Woche flexibel */
  coachDecidesTrainingDays?: boolean;
  /** Coach wählt Session-Dauer flexibel */
  coachDecidesSessionDuration?: boolean;
  /** @deprecated Legacy — gilt als beide Flags true */
  coachAdaptiveVolume?: boolean;
  fitnessLevel: string;
  /** Englische Wochentagsnamen (Monday…Sunday) — verfügbar für geplante Einheiten */
  availableTrainingDays?: string[];
  /** Mehr als eine Einheit am selben Wochentag erlauben */
  allowDoubleSessions?: boolean;
  /** auto = KI verteilt Einheiten; custom = Athlet legt Wochentage + Kraft/Cardio fest */
  scheduleMode?: 'auto' | 'custom';
  customWeekPlan?: CustomWeekPlan;
  // benchmarks
  benchmarks?: Record<string, string>;
  injuries?: string;
  extraWishes?: string;
  startDate?: string;
}

export interface NutritionOnboardingData {
  type: 'nutrition';
  nutritionGoal: string;
  age: number;
  gender: string;
  weight: number;
  height: number;
  activityLevel: string;
  restrictions: string[];
  allergies?: string;
  /** @deprecated Legacy — nur wenn mealSchedule fehlt */
  mealsPerDay?: number;
  /** Wochentage + Mahlzeiten-Slots inkl. Personenanzahl pro Slot */
  mealSchedule: NutritionDayMealPlan[];
  defaultMealServings?: number;
  cookingTime: string;
  foodPreferences?: string;
  budget: string;
  startDate?: string;
}

export type OnboardingData = WorkoutOnboardingData | NutritionOnboardingData;

interface Props {
  planType: 'workout' | 'nutrition';
  onComplete: (data: OnboardingData, discipline: string) => void;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveDiscipline(d: Partial<WorkoutOnboardingData>): string {
  const { trainingStyle, workoutVibe, sports, planMode, eventName } = d;
  const evLow = (eventName || '').toLowerCase();
  if (evLow.includes('hyrox')) return 'hyrox';
  if (evLow.includes('triathlon') || evLow.includes('ironman')) return 'triathlon';
  if (evLow.includes('marathon') && (evLow.includes('rad') || evLow.includes('cycl') || evLow.includes('bike'))) return 'cycling_marathon';
  if (evLow.includes('marathon') || evLow.includes('half')) return evLow.includes('half') ? 'half_marathon' : 'marathon_running';
  if (trainingStyle === 'strength') {
    if (workoutVibe === 'functional') return 'crossfit';
    return 'strength';
  }
  if (trainingStyle === 'endurance') {
    const sp = sports || [];
    if (sp.includes('swimming') && sp.includes('cycling') && sp.includes('running')) return 'triathlon';
    if (sp.includes('cycling')) return 'cycling_marathon';
    if (sp.includes('swimming')) return 'swimming';
    return 'marathon_running';
  }
  if (trainingStyle === 'hybrid') {
    if (workoutVibe === 'functional') return 'crossfit';
    return 'hybrid_athlete';
  }
  return 'functional_fitness';
}

const COACH_EN_WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

const SPORT_OPTIONS = [
  { id: 'running', icon: Footprints },
  { id: 'cycling', icon: Bike },
  { id: 'swimming', icon: Waves },
  { id: 'rowing', icon: Activity },
] as const;

const DIET_RESTRICTION_IDS = [
  'vegetarian', 'vegan', 'gluten_free', 'lactose_free',
  'halal', 'kosher', 'nut_allergy', 'shellfish_allergy', 'soy_free',
] as const;

// ─── BenchmarksStep ───────────────────────────────────────────────────────────

function BField({ labelKey, unitKey, placeholder, bmKey, benchmarks, onChange, t, numeric = 'integer' }: {
  labelKey: string; unitKey?: string; placeholder?: string; bmKey: string;
  benchmarks: Record<string, string>; onChange: (k: string, v: string) => void;
  t: (k: string) => string;
  numeric?: 'integer' | 'decimal';
}) {
  const normalize =
    numeric === 'decimal' ? normalizeDecimalInput : normalizeIntegerInput;
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">
        {t(labelKey)}{unitKey && <span className="ml-1 font-medium normal-case text-[var(--text-muted)]/80">({t(unitKey)})</span>}
      </p>
      <input
        type="text"
        inputMode={numeric === 'decimal' ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={benchmarks[bmKey] || ''}
        onChange={e => onChange(bmKey, normalize(e.target.value))}
        placeholder={placeholder || '—'}
        className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2.5 text-sm font-bold tabular-nums text-[var(--text-primary)] placeholder:font-medium placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </div>
  );
}

/** Cardio-Streckenzeit: HH:MM, max. 4 Ziffern, Doppelpunkt nach Stunden automatisch. */
function BTimeHhMmField({ labelKey, placeholder, bmKey, benchmarks, onChange, t }: {
  labelKey: string; placeholder?: string; bmKey: string;
  benchmarks: Record<string, string>; onChange: (k: string, v: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">
        {t(labelKey)}
        <span className="ml-1 font-medium normal-case text-[var(--text-muted)]/80">({t('coach.onb.unit.hhmm')})</span>
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={benchmarks[bmKey] || ''}
        onChange={e => onChange(bmKey, normalizeHhMmInput(e.target.value))}
        placeholder={placeholder || '00:00'}
        className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2.5 text-sm font-bold tabular-nums text-[var(--text-primary)] placeholder:font-medium placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </div>
  );
}

function BenchmarksStep({ trainingStyle, equipment, sports, benchmarks, onChange }: {
  trainingStyle: string; equipment: string[]; sports: string[];
  benchmarks: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  const { t } = useI18n();
  const hasBarbell = equipment.includes('barbell') || equipment.includes('commercial_gym') || equipment.includes('full_home_gym');
  const hasDumbbells = equipment.includes('dumbbells');
  const hasKettlebells = equipment.includes('kettlebells');
  const hasBodyweight = equipment.includes('bodyweight') || equipment.includes('pull_up_bar');
  const hasRunning = sports.includes('running') || trainingStyle === 'endurance';
  const hasCycling = sports.includes('cycling');
  const hasSwimming = sports.includes('swimming');
  const hasRowing = sports.includes('rowing');
  const needsStrength = trainingStyle === 'strength' || trainingStyle === 'hybrid';
  const needsEndurance = trainingStyle === 'endurance' || trainingStyle === 'hybrid';

  return (
    <div className="space-y-6">
      <p className="text-sm font-medium text-[var(--text-muted)]">{t('coach.onb.bm.intro')}</p>

      {needsStrength && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={14} className="text-violet-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">{t('coach.onb.bm.strengthTitle')}</p>
          </div>
          {hasBarbell && (
            <div className="grid grid-cols-2 gap-3">
              <BField labelKey="coach.onb.bm.squat_1rm" unitKey="coach.onb.unit.kg" placeholder="100" bmKey="squat_1rm" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.bench_1rm" unitKey="coach.onb.unit.kg" placeholder="80" bmKey="bench_1rm" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.deadlift_1rm" unitKey="coach.onb.unit.kg" placeholder="120" bmKey="deadlift_1rm" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.ohp_1rm" unitKey="coach.onb.unit.kg" placeholder="60" bmKey="ohp_1rm" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}
          {(hasBodyweight || hasBarbell) && (
            <div className="grid grid-cols-2 gap-3">
              <BField labelKey="coach.onb.bm.pullups_max" unitKey="coach.onb.unit.reps" placeholder="10" bmKey="pullups_max" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.pushups_max" unitKey="coach.onb.unit.reps" placeholder="30" bmKey="pushups_max" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}
          {hasDumbbells && !hasBarbell && (
            <div className="grid grid-cols-2 gap-3">
              <BField labelKey="coach.onb.bm.db_bench" unitKey="coach.onb.unit.kg" placeholder="30" bmKey="db_bench" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.db_row" unitKey="coach.onb.unit.kg" placeholder="25" bmKey="db_row" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}
          {hasKettlebells && !hasBarbell && (
            <div className="grid grid-cols-2 gap-3">
              <BField labelKey="coach.onb.bm.kb_swing" unitKey="coach.onb.unit.kg" placeholder="24" bmKey="kb_swing" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.tgu" unitKey="coach.onb.unit.kg" placeholder="20" bmKey="tgu" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}
        </div>
      )}

      {needsEndurance && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={14} className="text-blue-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">{t('coach.onb.bm.enduranceTitle')}</p>
          </div>

          {hasRunning && (
            <div className="grid grid-cols-2 gap-3">
              <BTimeHhMmField labelKey="coach.onb.bm.run_5k" placeholder="00:25" bmKey="run_5k" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BTimeHhMmField labelKey="coach.onb.bm.run_10k" placeholder="00:55" bmKey="run_10k" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BTimeHhMmField labelKey="coach.onb.bm.run_half" placeholder="02:10" bmKey="run_half" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.run_longest" unitKey="coach.onb.unit.km" placeholder="15" bmKey="run_longest" benchmarks={benchmarks} onChange={onChange} t={t} numeric="decimal" />
              <BField labelKey="coach.onb.bm.run_weekly_km" unitKey="coach.onb.unit.km" placeholder="30" bmKey="run_weekly_km" benchmarks={benchmarks} onChange={onChange} t={t} numeric="decimal" />
            </div>
          )}

          {hasCycling && (
            <div className="grid grid-cols-2 gap-3">
              <BField labelKey="coach.onb.bm.ftp" unitKey="coach.onb.unit.watt" placeholder="200" bmKey="ftp" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.bike_longest" unitKey="coach.onb.unit.km" placeholder="80" bmKey="bike_longest" benchmarks={benchmarks} onChange={onChange} t={t} numeric="decimal" />
              <BField labelKey="coach.onb.bm.bike_avg_speed" unitKey="coach.onb.unit.kmh" placeholder="28" bmKey="bike_avg_speed" benchmarks={benchmarks} onChange={onChange} t={t} numeric="decimal" />
            </div>
          )}

          {hasSwimming && (
            <div className="grid grid-cols-2 gap-3">
              <BTimeHhMmField labelKey="coach.onb.bm.swim_100m" placeholder="00:02" bmKey="swim_100m" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BTimeHhMmField labelKey="coach.onb.bm.swim_400m" placeholder="00:08" bmKey="swim_400m" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BField labelKey="coach.onb.bm.swim_longest" unitKey="coach.onb.unit.m" placeholder="1500" bmKey="swim_longest" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}

          {hasRowing && (
            <div className="grid grid-cols-2 gap-3">
              <BTimeHhMmField labelKey="coach.onb.bm.row_500m" placeholder="00:02" bmKey="row_500m" benchmarks={benchmarks} onChange={onChange} t={t} />
              <BTimeHhMmField labelKey="coach.onb.bm.row_2000m" placeholder="00:08" bmKey="row_2000m" benchmarks={benchmarks} onChange={onChange} t={t} />
            </div>
          )}
        </div>
      )}

      {!needsStrength && !needsEndurance && (
        <div className="py-8 text-center text-[var(--text-muted)]">
          <p className="text-sm font-bold">{t('coach.onb.bm.needPrev')}</p>
        </div>
      )}
    </div>
  );
}

type ProceedBlock = { key: string; vars?: Record<string, string | number> };

function buildCoachOnboardingCustomPreset(d: FormState): CustomWeekPlan {
  const plan = emptyCustomWeekPlan();
  const style = d.trainingStyle || 'hybrid';
  const strDur = d.coachDecidesStrengthDuration ? undefined : d.strengthSessionDurationMin ?? 60;
  const carDur = d.coachDecidesCardioDuration ? undefined : d.cardioSessionDurationMin ?? 45;

  if (style === 'strength') {
    for (const day of ['Monday', 'Wednesday', 'Friday'] as const) {
      plan[day] = [{ type: 'strength', sessionSlot: 'Morning', durationMin: strDur }];
    }
    return plan;
  }
  if (style === 'endurance') {
    for (const day of ['Monday', 'Wednesday', 'Friday', 'Saturday'] as const) {
      plan[day] = [{ type: 'cardio', sessionSlot: 'Morning', durationMin: carDur }];
    }
    return plan;
  }
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
    plan[day] = [
      { type: 'strength', sessionSlot: 'Morning', durationMin: strDur },
      { type: 'cardio', sessionSlot: 'Evening', durationMin: carDur },
    ];
  }
  return plan;
}

function getProceedBlock(
  planType: 'workout' | 'nutrition',
  stepId: string,
  d: FormState,
): ProceedBlock | null {
  if (planType === 'workout') {
    if (stepId === 'w_goal' && !d.primaryGoal) return { key: 'coach.onb.block.goal' };
    if (stepId === 'w_training_style' && !d.trainingStyle) return { key: 'coach.onb.block.trainingStyle' };
    if (stepId === 'w_strength_setup') {
      if (!d.workoutVibe) return { key: 'coach.onb.block.vibe' };
      if ((d.equipment?.length ?? 0) < 1) return { key: 'coach.onb.block.equipment' };
    }
    if (stepId === 'w_endurance_sports' && (d.sports?.length ?? 0) < 1) {
      return { key: 'coach.onb.block.sports' };
    }
    if (stepId === 'w_start_date' && !d.startDate) return { key: 'coach.onb.block.startDate' };
    if (stepId === 'w_plan_type') {
      if (d.planMode === 'ongoing') return null;
      if (!d.eventName || !d.eventDate) return { key: 'coach.onb.block.event' };
    }
    if (stepId === 'w_schedule') {
      const style = d.trainingStyle || 'strength';
      if (!d.trainingStyle) return { key: 'coach.onb.block.trainingStyle' };
      if (!d.fitnessLevel) return { key: 'coach.onb.block.fitnessLevel' };
      if (d.scheduleMode === 'custom') {
        if (countCustomWeekSessions(d.customWeekPlan || {}) < 1) {
          return { key: 'coach.onb.block.customPlanEmpty' };
        }
        const plan = d.customWeekPlan || {};
        for (const day of COACH_EN_WEEKDAYS) {
          for (const slot of plan[day] || []) {
            if (slot.type === 'strength' && style === 'endurance') continue;
            if (slot.type === 'cardio' && style === 'strength') continue;
            if (slot.type !== 'strength' && slot.type !== 'cardio') continue;
            if (customSlotDurationRequired(slot.type, d as Record<string, unknown>) && !slot.durationMin) {
              return { key: 'coach.onb.block.customSlotDuration' };
            }
          }
        }
        if (!scheduleVolumeConfigValid(d as Record<string, unknown>, style)) {
          return { key: 'coach.onb.block.volume' };
        }
        return null;
      }
      const avail = (d.availableTrainingDays || []).length;
      if (avail < 2) return { key: 'coach.onb.block.weekdays' };
      if (!scheduleVolumeConfigValid(d as Record<string, unknown>, style)) {
        return { key: 'coach.onb.block.volume' };
      }
      if (!(d.coachDecidesStrengthSessions || d.coachAdaptiveVolume) && style !== 'endurance') {
        const doubles = d.allowDoubleSessions !== false;
        const td = (d.strengthSessionsPerWeek ?? 0) + (d.cardioSessionsPerWeek ?? 0);
        if (td > avail && !doubles) {
          return { key: 'coach.onb.block.tooManySessions', vars: { sessions: td, days: avail } };
        }
      }
      return null;
    }
    return null;
  }
  if (stepId === 'n_goal' && !d.nutritionGoal) return { key: 'coach.onb.block.nutritionGoal' };
  if (stepId === 'n_body' && !(d.weight && d.height && d.activityLevel)) {
    return { key: 'coach.onb.block.body' };
  }
  if (stepId === 'n_schedule') {
    const days = d.mealScheduleDays || [];
    if (days.length < 1) return { key: 'coach.onb.block.mealDays' };
    if (!d.cookingTime || !d.budget) return { key: 'coach.onb.block.mealPrefs' };
    const slots = days.reduce((n, day) => n + ((d.mealSlotsByDay?.[day] || []).length), 0);
    if (slots < 1) return { key: 'coach.onb.block.mealSlots' };
  }
  if (stepId === 'n_start_date' && !d.startDate) return { key: 'coach.onb.block.startDate' };
  return null;
}

function applyDefaultDurationToCustomPlan(
  plan: CustomWeekPlan | undefined,
  kind: 'strength' | 'cardio',
  min: number,
): CustomWeekPlan {
  const next = { ...(plan || emptyCustomWeekPlan()) };
  for (const day of COACH_EN_WEEKDAYS) {
    next[day] = (next[day] || []).map(s => {
      if (s.type !== kind) return s;
      return { ...s, durationMin: min };
    });
  }
  return next;
}

function SessionVolumeSection({
  kind,
  sessions,
  duration,
  showSessionsPerWeek,
  coachDecidesSessions,
  coachDecidesDuration,
  onSessionsChange,
  onDurationChange,
  onCoachDecidesSessions,
  onCoachDecidesDuration,
  t,
}: {
  kind: 'strength' | 'cardio';
  sessions?: number;
  duration?: number;
  /** false = nur Dauer (eigener Wochenplan); true = Häufigkeit + Dauer (automatisch) */
  showSessionsPerWeek: boolean;
  coachDecidesSessions: boolean;
  coachDecidesDuration: boolean;
  onSessionsChange: (n: number) => void;
  onDurationChange: (n: number) => void;
  onCoachDecidesSessions: () => void;
  onCoachDecidesDuration: () => void;
  t: (k: string) => string;
}) {
  const countOptions = SESSION_COUNTS.filter(n => (kind === 'strength' ? n >= 1 : n >= 0));
  const durOptions = kind === 'strength' ? STRENGTH_DURATIONS : CARDIO_DURATIONS;
  const titleKey = kind === 'strength' ? 'coach.onb.volume.strengthTitle' : 'coach.onb.volume.cardioTitle';

  return (
    <div
      className={cn(
        'rounded-2xl border-2 bg-[var(--background)] p-4 space-y-4',
        kind === 'strength' ? 'border-violet-500/40' : 'border-cyan-500/40',
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">{t(titleKey)}</p>

      {showSessionsPerWeek && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('coach.onb.volume.sessionsPerWeek')}
            </p>
            <button
              type="button"
              onClick={onCoachDecidesSessions}
              className={cn(
                'shrink-0 min-h-[36px] px-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all',
                coachDecidesSessions
                  ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand/50',
              )}
            >
              {t('coach.onb.schedule.coachDecidesDays')}
            </button>
          </div>
          {!coachDecidesSessions && (
            <div className="flex gap-2 flex-wrap">
              {countOptions.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSessionsChange(n)}
                  className={cn(
                    'min-w-[2.5rem] flex-1 py-2.5 rounded-xl font-black text-sm border-2 transition-all',
                    sessions === n ? 'border-brand bg-brand/15 text-brand' : 'border-[var(--border-muted)] hover:border-brand/50',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('coach.onb.volume.duration')}
          </p>
          <button
            type="button"
            onClick={onCoachDecidesDuration}
            className={cn(
              'shrink-0 min-h-[36px] px-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all',
              coachDecidesDuration
                ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand/50',
            )}
          >
            {t('coach.onb.schedule.coachDecidesDuration')}
          </button>
        </div>
        {!coachDecidesDuration && (
          <div className="flex gap-2 flex-wrap">
            {durOptions.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onDurationChange(n)}
                className={cn(
                  'min-w-[3rem] flex-1 py-2.5 rounded-xl font-black text-sm border-2 transition-all',
                  duration === n ? 'border-brand bg-brand/15 text-brand' : 'border-[var(--border-muted)] hover:border-brand/50',
                )}
              >
                {n}m
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type FormState = {
  type?: string;
  primaryGoal?: string;
  trainingStyle?: string;
  equipment?: string[];
  workoutVibe?: string;
  sports?: string[];
  planMode?: string;
  eventName?: string;
  eventDate?: string;
  eventDistance?: string;
  trainingDays?: number;
  sessionDuration?: number;
  strengthSessionsPerWeek?: number;
  cardioSessionsPerWeek?: number;
  strengthSessionDurationMin?: number;
  cardioSessionDurationMin?: number;
  coachDecidesStrengthSessions?: boolean;
  coachDecidesCardioSessions?: boolean;
  coachDecidesStrengthDuration?: boolean;
  coachDecidesCardioDuration?: boolean;
  coachDecidesTrainingDays?: boolean;
  coachDecidesSessionDuration?: boolean;
  coachAdaptiveVolume?: boolean;
  fitnessLevel?: string;
  availableTrainingDays?: string[];
  allowDoubleSessions?: boolean;
  scheduleMode?: 'auto' | 'custom';
  customWeekPlan?: CustomWeekPlan;
  benchmarks?: Record<string, string>;
  injuries?: string;
  extraWishes?: string;
  nutritionGoal?: string;
  weight?: number;
  height?: number;
  activityLevel?: string;
  restrictions?: string[];
  allergies?: string;
  mealsPerDay?: number;
  mealScheduleDays?: string[];
  mealSlotsByDay?: MealSlotsByDay;
  defaultMealServings?: number;
  cookingTime?: string;
  foodPreferences?: string;
  budget?: string;
  startDate?: string;
};

export default function CoachOnboarding({ planType, onComplete, onClose }: Props) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const profileAge = profile?.measurements?.age;
  const profileGender = profile?.measurements?.gender;

  const [step, setStep] = useState(0);

  const profileGoalToNutrition = (goalType?: string): string | undefined => {
    if (goalType === 'lose') return 'weight_loss';
    if (goalType === 'gain') return 'muscle_gain';
    if (goalType === 'maintain') return 'maintenance';
    return undefined;
  };

  const [d, setD] = useState<FormState>({
    type: planType,
    trainingDays: 4,
    sessionDuration: 60,
    strengthSessionsPerWeek: 3,
    cardioSessionsPerWeek: 2,
    strengthSessionDurationMin: 60,
    cardioSessionDurationMin: 45,
    equipment: [...COACH_DEFAULT_EQUIPMENT], sports: [], restrictions: [],
    budget: 'medium',
    defaultMealServings: 2,
    mealScheduleDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    mealSlotsByDay: (() => {
      const slots = emptyMealSlotsByDay();
      const def = 2;
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        slots[day] = [
          { type: 'breakfast', servings: def },
          { type: 'lunch', servings: def },
          { type: 'dinner', servings: def },
        ];
      }
      return slots;
    })(),
    benchmarks: {},
    availableTrainingDays: [...COACH_EN_WEEKDAYS],
    allowDoubleSessions: true,
    scheduleMode: 'auto',
    customWeekPlan: emptyCustomWeekPlan(),
    startDate: 'today',
  });

  const prefillFromProfileDone = useRef(false);
  const upd = (fields: Partial<FormState>) => setD(prev => ({ ...prev, ...fields }));

  useEffect(() => {
    if (!profile || prefillFromProfileDone.current) return;
    prefillFromProfileDone.current = true;
    const m = profile.measurements;
    if (planType !== 'nutrition' || !m) return;
    const patches: Partial<FormState> = {};
    if (m.weight) patches.weight = m.weight;
    if (m.height) patches.height = m.height;
    if (m.activityLevel) patches.activityLevel = m.activityLevel;
    const ng = profileGoalToNutrition(profile.goals?.type);
    if (ng) patches.nutritionGoal = ng;
    if (Object.keys(patches).length) upd(patches);
  }, [profile, planType]);
  const toggleArr = (key: 'equipment' | 'sports' | 'restrictions', val: string) => {
    const arr: string[] = (d[key] as string[]) || [];
    upd({ [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] });
  };
  const updBenchmark = (key: string, val: string) => {
    upd({ benchmarks: { ...(d.benchmarks || {}), [key]: val } });
  };

  // ── Dynamic step list ────────────────────────────────────────────────────
  const STEP_IDS: string[] = useMemo(() => {
    if (planType === 'nutrition') {
      return ['n_goal', 'n_body', 'n_diet', 'n_schedule', 'n_start_date', 'review'];
    }
    const steps: string[] = ['w_goal', 'w_training_style'];
    const needsStrength = d.trainingStyle === 'strength' || d.trainingStyle === 'hybrid';
    const needsEndurance = d.trainingStyle === 'endurance' || d.trainingStyle === 'hybrid';
    if (needsStrength) steps.push('w_strength_setup');
    if (needsEndurance) steps.push('w_endurance_sports');
    steps.push('w_plan_type', 'w_schedule', 'w_benchmarks', 'w_optional', 'w_start_date', 'review');
    return steps;
  }, [planType, d.trainingStyle]);

  const totalSteps = STEP_IDS.length;
  const progress = ((step + 1) / totalSteps) * 100;
  useEffect(() => {
    setStep(s => (totalSteps > 0 ? Math.min(s, totalSteps - 1) : 0));
  }, [totalSteps]);
  const stepId = STEP_IDS[Math.min(step, Math.max(0, totalSteps - 1))] || STEP_IDS[0];
  const proceedBlock = getProceedBlock(planType, stepId, d);
  const canAdvance = proceedBlock === null;

  const toggleNutritionDay = (dn: string) => {
    const cur = new Set(d.mealScheduleDays || []);
    const slots = { ...(d.mealSlotsByDay || emptyMealSlotsByDay()) };
    const def = Math.max(1, d.defaultMealServings ?? 2);
    if (cur.has(dn)) {
      cur.delete(dn);
      delete slots[dn];
    } else {
      cur.add(dn);
      if (!slots[dn]?.length) {
        slots[dn] = [
          { type: 'breakfast', servings: def },
          { type: 'lunch', servings: def },
          { type: 'dinner', servings: def },
        ];
      }
    }
    const mealScheduleDays = COACH_NUTRITION_WEEKDAYS.filter(x => cur.has(x));
    upd({ mealScheduleDays, mealSlotsByDay: slots });
  };

  const toggleMealSlot = (day: string, type: MealCategory) => {
    const list = [...(d.mealSlotsByDay?.[day] || [])];
    const idx = list.findIndex(s => s.type === type);
    if (idx >= 0) list.splice(idx, 1);
    else list.push({ type, servings: Math.max(1, d.defaultMealServings ?? 2) });
    list.sort(
      (a, b) => COACH_MEAL_SLOT_TYPES.indexOf(a.type) - COACH_MEAL_SLOT_TYPES.indexOf(b.type),
    );
    upd({ mealSlotsByDay: { ...(d.mealSlotsByDay || emptyMealSlotsByDay()), [day]: list } });
  };

  const setMealSlotServings = (day: string, type: MealCategory, servings: number) => {
    const n = Math.max(1, Math.min(12, Math.round(servings) || 1));
    const list = (d.mealSlotsByDay?.[day] || []).map(s =>
      s.type === type ? { ...s, servings: n } : s,
    );
    upd({ mealSlotsByDay: { ...(d.mealSlotsByDay || emptyMealSlotsByDay()), [day]: list } });
  };

  const mealSlotEnabled = (day: string, type: MealCategory) =>
    (d.mealSlotsByDay?.[day] || []).some(s => s.type === type);

  const mealSlotServings = (day: string, type: MealCategory) =>
    (d.mealSlotsByDay?.[day] || []).find(s => s.type === type)?.servings ?? d.defaultMealServings ?? 2;

  const finish = () => {
    const discipline = planType === 'workout' ? deriveDiscipline(d as Partial<WorkoutOnboardingData>) : 'nutrition';
    const mealSchedule: NutritionDayMealPlan[] =
      planType === 'nutrition'
        ? (d.mealScheduleDays || [])
            .map(day => ({
              day,
              meals: [...(d.mealSlotsByDay?.[day] || [])] as NutritionMealSlotConfig[],
            }))
            .filter(row => row.meals.length > 0)
        : [];
    const base = {
      ...d,
      type: planType,
      age: profileAge,
      gender: profileGender,
      ...(planType === 'nutrition' ? { mealSchedule } : {}),
    };
    const enriched =
      planType === 'workout'
        ? syncLegacyVolumeFields(base as Record<string, unknown>, parseCoachSessionVolume(base as Record<string, unknown>, d.trainingStyle))
        : base;
    onComplete(enriched as OnboardingData, discipline);
  };

  const profileBits = [
    profileAge != null ? `${t('auth.age')}: ${profileAge}` : '',
    profileGender ? String(profileGender) : '',
  ].filter(Boolean).join(' · ');

  useMobileOverlaySheet(true);

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        role="presentation"
        aria-hidden
      />

      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        className={cn(
          mobileSheetPanelClass(),
          'flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:rounded-[2rem] touch-manipulation',
        )}>

        {/* Header */}
        <div className="p-5 pb-0 md:p-7 md:pb-0 flex-shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {planType === 'workout' ? t('coach.onb.brand.workout') : t('coach.onb.brand.nutrition')}
                {' · '}
                {t('coach.onb.progress', { current: step + 1, total: totalSteps })}
              </p>
              <h2 className="mt-0.5 text-xl font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{t(`coach.onb.step.${stepId}`)}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--background)] min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={t('coach.onb.cancel')}><X size={18} /></button>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[var(--border-muted)]">
            <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
          <p className="mt-3 text-[10px] font-medium leading-relaxed text-[var(--text-muted)]">
            {t('coach.onboarding.ptDisclaimer')}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] scroll-pb-6 p-5 pt-5 md:p-7 md:pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">

              {/* ── WORKOUT STEPS ── */}

              {planType === 'workout' && stepId === 'w_goal' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-muted)] font-medium">{t('coach.onb.wGoal.prompt')}</p>
                  {[
                    { id: 'build_muscle', icon: Dumbbell, labelKey: 'coach.onb.wGoal.build_muscle.label', descKey: 'coach.onb.wGoal.build_muscle.desc' },
                    { id: 'improve_fitness', icon: Activity, labelKey: 'coach.onb.wGoal.improve_fitness.label', descKey: 'coach.onb.wGoal.improve_fitness.desc' },
                    { id: 'lose_weight', icon: Flame, labelKey: 'coach.onb.wGoal.lose_weight.label', descKey: 'coach.onb.wGoal.lose_weight.desc' },
                    { id: 'event_prep', icon: Calendar, labelKey: 'coach.onb.wGoal.event_prep.label', descKey: 'coach.onb.wGoal.event_prep.desc' },
                    { id: 'hybrid_all', icon: Blend, labelKey: 'coach.onb.wGoal.hybrid_all.label', descKey: 'coach.onb.wGoal.hybrid_all.desc' },
                  ].map(g => {
                    const sel = d.primaryGoal === g.id;
                    return (
                      <button key={g.id} onClick={() => upd({ primaryGoal: g.id })}
                        className={cn('w-full flex items-center gap-4 p-5 rounded-2xl text-left',
                          uiChoice(sel))}>
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', sel ? 'bg-brand/20 text-brand' : 'bg-[var(--background)] text-[var(--text-muted)]')}>
                          <g.icon size={18} />
                        </div>
                        <div>
                          <p className={cn('font-black uppercase tracking-tight text-sm text-[var(--text-primary)]')}>{t(g.labelKey)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">{t(g.descKey)}</p>
                        </div>
                        {sel && <Check size={16} className="ml-auto flex-shrink-0 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {planType === 'workout' && stepId === 'w_training_style' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-muted)] font-medium">{t('coach.onb.style.prompt')}</p>
                  {[
                    { id: 'strength', icon: Dumbbell, labelKey: 'coach.onb.style.strength.label', subKey: 'coach.onb.style.strength.sub', color: 'bg-violet-500' },
                    { id: 'endurance', icon: Activity, labelKey: 'coach.onb.style.endurance.label', subKey: 'coach.onb.style.endurance.sub', color: 'bg-blue-500' },
                    { id: 'hybrid', icon: Zap, labelKey: 'coach.onb.style.hybrid.label', subKey: 'coach.onb.style.hybrid.sub', color: 'bg-teal-500' },
                  ].map(s => {
                    const sel = d.trainingStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          const style = s.id as 'strength' | 'endurance' | 'hybrid';
                          if (style === 'strength') {
                            upd({
                              trainingStyle: style,
                              strengthSessionsPerWeek: d.strengthSessionsPerWeek ?? 3,
                              cardioSessionsPerWeek: 0,
                              coachDecidesCardioSessions: false,
                            });
                          } else if (style === 'endurance') {
                            upd({
                              trainingStyle: style,
                              cardioSessionsPerWeek: d.cardioSessionsPerWeek ?? 3,
                              strengthSessionsPerWeek: 0,
                              coachDecidesStrengthSessions: false,
                            });
                          } else {
                            upd({
                              trainingStyle: style,
                              strengthSessionsPerWeek: d.strengthSessionsPerWeek ?? 3,
                              cardioSessionsPerWeek: d.cardioSessionsPerWeek ?? 2,
                            });
                          }
                        }}
                        className={cn('w-full flex items-center gap-5 p-6 rounded-2xl text-left',
                          uiChoice(sel))}>
                        <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0', s.color)}>
                          <s.icon size={22} />
                        </div>
                        <div>
                          <p className="font-black uppercase italic tracking-tighter text-lg text-[var(--text-primary)]">{t(s.labelKey)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5 max-w-xs">{t(s.subKey)}</p>
                        </div>
                        {sel && <Check size={18} className="ml-auto flex-shrink-0 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {planType === 'workout' && stepId === 'w_strength_setup' && (
                <div className="space-y-6 pb-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">{t('coach.onb.vibePrompt')}</p>
                    <div className="space-y-2">
                      {[
                        { id: 'classic_lifting', labelKey: 'coach.onb.vibe.classic_lifting.label', descKey: 'coach.onb.vibe.classic_lifting.desc' },
                        { id: 'hiit_circuits', labelKey: 'coach.onb.vibe.hiit_circuits.label', descKey: 'coach.onb.vibe.hiit_circuits.desc' },
                        { id: 'functional', labelKey: 'coach.onb.vibe.functional.label', descKey: 'coach.onb.vibe.functional.desc' },
                      ].map(v => {
                        const sel = d.workoutVibe === v.id;
                        return (
                          <button key={v.id} onClick={() => upd({ workoutVibe: v.id })}
                            className={cn('w-full p-5 rounded-2xl text-left',
                              uiChoice(sel))}>
                            <p className={cn('font-black uppercase tracking-tight text-sm text-[var(--text-primary)]')}>{t(v.labelKey)}</p>
                            <p className="text-[10px] text-[var(--text-muted)] font-medium mt-1">{t(v.descKey)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)] mb-1">{t('coach.onb.equipPrompt')}</p>
                    <p className="text-[10px] font-bold text-brand mb-4">{t('coach.onb.equip.required')}</p>
                    <CoachEquipmentMultiselect
                      initialOpen
                      value={d.equipment || [...COACH_DEFAULT_EQUIPMENT]}
                      onChange={next => upd({ equipment: next })}
                      t={t}
                    />
                  </div>
                </div>
              )}

              {planType === 'workout' && stepId === 'w_endurance_sports' && (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-[var(--text-muted)] font-medium mb-4">{t('coach.onb.sports.prompt')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {SPORT_OPTIONS.map(s => {
                        const sel = (d.sports || []).includes(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleArr('sports', s.id)}
                            className={cn('min-h-[124px] p-6 rounded-2xl flex flex-col items-center justify-center gap-3',
                              uiChoice(sel))}>
                            <s.icon size={28} />
                            <p className="font-black uppercase tracking-widest text-[10px]">{t(`coach.onb.sport.${s.id}` as 'coach.onb.sport.running')}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {(d.sports?.length ?? 0) >= 2 && (
                    <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4">
                      <p className="text-xs font-bold text-brand">
                        {(d.sports?.length ?? 0) >= 3 ? t('coach.onb.hint.tri') : t('coach.onb.hint.multi')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {planType === 'workout' && stepId === 'w_plan_type' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'ongoing', icon: Activity, labelKey: 'coach.onb.plan.ongoing.label', descKey: 'coach.onb.plan.ongoing.desc' },
                      { id: 'event', icon: Calendar, labelKey: 'coach.onb.plan.event.label', descKey: 'coach.onb.plan.event.desc' },
                    ].map(m => {
                      const sel = d.planMode === m.id;
                      return (
                        <button key={m.id} onClick={() => upd({ planMode: m.id as any })}
                          className={cn('p-5 rounded-2xl text-left', uiChoice(!!sel))}>
                          <m.icon size={22} className={cn('mb-3', sel ? 'text-brand' : 'text-[var(--text-muted)]')} />
                          <p className="font-black uppercase tracking-tight text-sm text-[var(--text-primary)]">{t(m.labelKey)}</p>
                          <p className="mt-1 text-[10px] font-medium text-[var(--text-muted)]">{t(m.descKey)}</p>
                        </button>
                      );
                    })}
                  </div>

                  {d.planMode === 'event' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('coach.onb.event.details')}</p>
                      <input type="text" placeholder={t('coach.onb.event.namePh')} value={d.eventName || ''}
                        onChange={e => upd({ eventName: e.target.value })}
                        className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="date" value={d.eventDate || ''} onChange={e => upd({ eventDate: e.target.value })}
                          className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                        <input type="text" placeholder={t('coach.onb.event.distancePh')} value={d.eventDistance || ''} onChange={e => upd({ eventDistance: e.target.value })}
                          className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {planType === 'workout' && stepId === 'w_schedule' && (
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                      {t('coach.onb.schedule.mode')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => upd({ scheduleMode: 'auto' })}
                        className={cn(
                          'py-3 px-2 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all',
                          (d.scheduleMode || 'auto') === 'auto'
                            ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                            : 'border-[var(--border-muted)] hover:border-brand/50',
                        )}
                      >
                        {t('coach.onb.schedule.modeAuto')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const existing = d.customWeekPlan || emptyCustomWeekPlan();
                          const plan =
                            countCustomWeekSessions(existing) > 0
                              ? existing
                              : buildCoachOnboardingCustomPreset(d);
                          upd(syncOnboardingFromCustomPlan(plan));
                        }}
                        className={cn(
                          'py-3 px-2 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all',
                          d.scheduleMode === 'custom'
                            ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                            : 'border-[var(--border-muted)] hover:border-brand/50',
                        )}
                      >
                        {t('coach.onb.schedule.modeCustom')}
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium mt-2">
                      {d.scheduleMode === 'custom'
                        ? t('coach.onb.schedule.modeCustomHint')
                        : t('coach.onb.schedule.modeAutoHint')}
                    </p>
                  </div>

                  {!d.trainingStyle ? (
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
                      {t('coach.onb.schedule.pickStyleFirst')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">
                        {d.scheduleMode === 'custom'
                          ? t('coach.onb.schedule.volumeIntroCustom')
                          : t('coach.onb.schedule.volumeIntroAuto')}
                      </p>
                      {(d.trainingStyle === 'strength' || d.trainingStyle === 'hybrid') && (
                        <SessionVolumeSection
                          kind="strength"
                          showSessionsPerWeek={d.scheduleMode !== 'custom'}
                          sessions={d.strengthSessionsPerWeek}
                          duration={d.strengthSessionDurationMin}
                          coachDecidesSessions={!!(d.coachDecidesStrengthSessions || d.coachAdaptiveVolume)}
                          coachDecidesDuration={!!(d.coachDecidesStrengthDuration || d.coachAdaptiveVolume)}
                          onSessionsChange={n =>
                            upd({
                              strengthSessionsPerWeek: n,
                              coachDecidesStrengthSessions: false,
                              coachAdaptiveVolume: false,
                            })
                          }
                          onDurationChange={n =>
                            upd({
                              strengthSessionDurationMin: n,
                              coachDecidesStrengthDuration: false,
                              coachAdaptiveVolume: false,
                              customWeekPlan: applyDefaultDurationToCustomPlan(d.customWeekPlan, 'strength', n),
                            })
                          }
                          onCoachDecidesSessions={() =>
                            upd({
                              coachDecidesStrengthSessions: !(d.coachDecidesStrengthSessions || d.coachAdaptiveVolume),
                              coachAdaptiveVolume: false,
                            })
                          }
                          onCoachDecidesDuration={() =>
                            upd({
                              coachDecidesStrengthDuration: !(d.coachDecidesStrengthDuration || d.coachAdaptiveVolume),
                              coachAdaptiveVolume: false,
                            })
                          }
                          t={t}
                        />
                      )}
                      {(d.trainingStyle === 'endurance' || d.trainingStyle === 'hybrid') && (
                        <SessionVolumeSection
                          kind="cardio"
                          showSessionsPerWeek={d.scheduleMode !== 'custom'}
                          sessions={d.cardioSessionsPerWeek}
                          duration={d.cardioSessionDurationMin}
                          coachDecidesSessions={!!(d.coachDecidesCardioSessions || d.coachAdaptiveVolume)}
                          coachDecidesDuration={!!(d.coachDecidesCardioDuration || d.coachAdaptiveVolume)}
                          onSessionsChange={n =>
                            upd({
                              cardioSessionsPerWeek: n,
                              coachDecidesCardioSessions: false,
                              coachAdaptiveVolume: false,
                            })
                          }
                          onDurationChange={n =>
                            upd({
                              cardioSessionDurationMin: n,
                              coachDecidesCardioDuration: false,
                              coachAdaptiveVolume: false,
                              customWeekPlan: applyDefaultDurationToCustomPlan(d.customWeekPlan, 'cardio', n),
                            })
                          }
                          onCoachDecidesSessions={() =>
                            upd({
                              coachDecidesCardioSessions: !(d.coachDecidesCardioSessions || d.coachAdaptiveVolume),
                              coachAdaptiveVolume: false,
                            })
                          }
                          onCoachDecidesDuration={() =>
                            upd({
                              coachDecidesCardioDuration: !(d.coachDecidesCardioDuration || d.coachAdaptiveVolume),
                              coachAdaptiveVolume: false,
                            })
                          }
                          t={t}
                        />
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.schedule.level')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'beginner', labelKey: 'coach.onb.level.beginner.label', descKey: 'coach.onb.level.beginner.desc' },
                          { id: 'intermediate', labelKey: 'coach.onb.level.intermediate.label', descKey: 'coach.onb.level.intermediate.desc' },
                          { id: 'advanced', labelKey: 'coach.onb.level.advanced.label', descKey: 'coach.onb.level.advanced.desc' },
                          { id: 'elite', labelKey: 'coach.onb.level.elite.label', descKey: 'coach.onb.level.elite.desc' },
                        ] as const
                      ).map(lv => (
                        <button key={lv.id} onClick={() => upd({ fitnessLevel: lv.id })}
                          className={cn('p-4 rounded-xl text-left', uiChoice(d.fitnessLevel === lv.id))}>
                          <p className="text-xs font-black uppercase tracking-tight text-[var(--text-primary)]">{t(lv.labelKey)}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">{t(lv.descKey)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  {(profileAge || profileGender) && profileBits && (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                      <Check size={14} className="text-green-500 flex-shrink-0" />
                      <p className="text-[10px] text-[var(--text-muted)] font-bold">{t('coach.onb.profileData', { text: profileBits })}</p>
                    </div>
                  )}

                  {d.scheduleMode !== 'custom' && (
                  <>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.schedule.weekdays')}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium mb-3">{t('coach.onb.schedule.weekdaysHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      {COACH_EN_WEEKDAYS.map(dn => {
                        const sel = (d.availableTrainingDays || []).includes(dn);
                        return (
                          <button
                            key={dn}
                            type="button"
                            onClick={() => {
                              const cur = new Set(d.availableTrainingDays || []);
                              if (sel) cur.delete(dn);
                              else cur.add(dn);
                              upd({ availableTrainingDays: COACH_EN_WEEKDAYS.filter(x => cur.has(x)) });
                            }}
                            className={cn(
                              'min-h-[44px] min-w-[44px] rounded-xl border-2 px-3 text-[10px] font-black uppercase tracking-widest transition-all',
                              sel
                                ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                                : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand/40',
                            )}
                          >
                            {t(`coach.onb.wd.${dn}` as 'coach.onb.wd.Monday')}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-4">
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand"
                      checked={d.allowDoubleSessions !== false}
                      onChange={e => upd({ allowDoubleSessions: e.target.checked })}
                    />
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight text-[var(--text-primary)]">{t('coach.onb.schedule.doubles')}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-medium mt-1">{t('coach.onb.schedule.doublesHint')}</p>
                    </div>
                  </label>
                  </>
                  )}

                  {d.scheduleMode === 'custom' && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        {t('coach.onb.schedule.customTitle')}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-medium">
                        {t('coach.onb.schedule.customHint', { n: countCustomWeekSessions(d.customWeekPlan || {}) })}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-medium">
                        {t('coach.onb.schedule.customDurationHint')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          upd(syncOnboardingFromCustomPlan(buildCoachOnboardingCustomPreset(d)));
                        }}
                        className="w-full min-h-[44px] rounded-xl border border-brand/40 bg-brand/5 text-[9px] font-black uppercase tracking-widest text-brand hover:bg-brand/10"
                      >
                        {t('coach.onb.schedule.presetWeekdays')}
                      </button>
                      <div className="space-y-2 max-h-[min(42vh,320px)] overflow-y-auto pr-1">
                        {COACH_EN_WEEKDAYS.map(day => {
                          const slots = d.customWeekPlan?.[day] ?? [{ type: 'rest' as WeekdaySessionType }];
                          const setDaySlots = (next: typeof slots) => {
                            const plan = { ...(d.customWeekPlan || emptyCustomWeekPlan()), [day]: normalizeCustomDaySlots(next) };
                            upd(syncOnboardingFromCustomPlan(plan));
                          };
                          return (
                            <div
                              key={day}
                              className="rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-3 space-y-2"
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                                {t(`coach.onb.wd.${day}` as 'coach.onb.wd.Monday')}
                              </p>
                              {slots.map((slot, slotIdx) => (
                                <div key={slotIdx} className="flex flex-wrap gap-2 items-center">
                                  {slot.type !== 'rest' ? (
                                    <select
                                      value={slot.sessionSlot || (slotIdx === 0 ? 'Morning' : 'Evening')}
                                      onChange={e => {
                                        const newSlot = e.target.value as CoachSessionSlot;
                                        const next = slots.map((s, i) => ({ ...s }));
                                        next[slotIdx] = { ...next[slotIdx], sessionSlot: newSlot };
                                        const otherIdx = slotIdx === 0 ? 1 : 0;
                                        if (
                                          next[otherIdx]?.type !== 'rest' &&
                                          next[otherIdx]?.sessionSlot === newSlot
                                        ) {
                                          next[otherIdx] = {
                                            ...next[otherIdx],
                                            sessionSlot: newSlot === 'Morning' ? 'Evening' : 'Morning',
                                          };
                                        }
                                        setDaySlots(next);
                                      }}
                                      className="min-h-[44px] w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]"
                                      aria-label={t('coach.onb.schedule.timeSlot')}
                                    >
                                      <option value="Morning">{t('coach.onb.schedule.morning')}</option>
                                      <option value="Evening">{t('coach.onb.schedule.evening')}</option>
                                    </select>
                                  ) : (
                                    <span className="text-[9px] font-black text-[var(--text-muted)] w-[7.5rem] shrink-0 uppercase">
                                      —
                                    </span>
                                  )}
                                  <select
                                    value={slot.type}
                                    onChange={e => {
                                      const next = [...slots];
                                      const defaultSlot: CoachSessionSlot =
                                        slot.sessionSlot || (slotIdx === 0 ? 'Morning' : 'Evening');
                                      const newType = e.target.value as WeekdaySessionType;
                                      next[slotIdx] = {
                                        type: newType,
                                        sessionSlot: defaultSlot,
                                        durationMin:
                                          newType === 'strength' && !d.coachDecidesStrengthDuration
                                            ? slot.durationMin ?? d.strengthSessionDurationMin ?? 60
                                            : newType === 'cardio' && !d.coachDecidesCardioDuration
                                              ? slot.durationMin ?? d.cardioSessionDurationMin ?? 45
                                              : undefined,
                                      };
                                      if (e.target.value === 'rest' && slotIdx === 0) {
                                        setDaySlots([{ type: 'rest' }]);
                                        return;
                                      }
                                      setDaySlots(next);
                                    }}
                                    className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 text-xs font-bold text-[var(--text-primary)]"
                                  >
                                    <option value="rest">{t('coach.onb.schedule.slotRest')}</option>
                                    <option value="strength">{t('coach.onb.schedule.slotStrength')}</option>
                                    <option value="cardio">{t('coach.onb.schedule.slotCardio')}</option>
                                  </select>
                                  {slot.type === 'strength' &&
                                    customSlotDurationRequired('strength', d as Record<string, unknown>) && (
                                      <select
                                        value={slot.durationMin ?? d.strengthSessionDurationMin ?? 60}
                                        onChange={e => {
                                          const next = slots.map((s, i) =>
                                            i === slotIdx
                                              ? { ...s, durationMin: parseInt(e.target.value, 10) }
                                              : s,
                                          );
                                          setDaySlots(next);
                                        }}
                                        className="min-h-[44px] w-[4.5rem] shrink-0 rounded-xl border border-violet-500/40 bg-violet-500/10 px-2 text-[10px] font-black text-[var(--text-primary)]"
                                        aria-label={t('coach.onb.volume.duration')}
                                      >
                                        {(STRENGTH_DURATIONS as readonly number[]).map(n => (
                                          <option key={n} value={n}>
                                            {n}m
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  {slot.type === 'cardio' &&
                                    customSlotDurationRequired('cardio', d as Record<string, unknown>) && (
                                      <select
                                        value={slot.durationMin ?? d.cardioSessionDurationMin ?? 45}
                                        onChange={e => {
                                          const next = slots.map((s, i) =>
                                            i === slotIdx
                                              ? { ...s, durationMin: parseInt(e.target.value, 10) }
                                              : s,
                                          );
                                          setDaySlots(next);
                                        }}
                                        className="min-h-[44px] w-[4.5rem] shrink-0 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-2 text-[10px] font-black text-[var(--text-primary)]"
                                        aria-label={t('coach.onb.volume.duration')}
                                      >
                                        {(CARDIO_DURATIONS as readonly number[]).map(n => (
                                          <option key={n} value={n}>
                                            {n}m
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  {slotIdx === 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setDaySlots(slots.slice(0, 1))}
                                      className="text-[9px] font-black uppercase text-[var(--text-muted)] hover:text-red-400 px-1"
                                    >
                                      {t('coach.onb.schedule.removeSlot')}
                                    </button>
                                  )}
                                </div>
                              ))}
                              {slots.length === 2 &&
                                slots.every(s => s.type === 'strength' || s.type === 'cardio') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const a = slots[0];
                                      const b = slots[1];
                                      setDaySlots([
                                        {
                                          ...a,
                                          sessionSlot: (b.sessionSlot || 'Evening') as CoachSessionSlot,
                                        },
                                        {
                                          ...b,
                                          sessionSlot: (a.sessionSlot || 'Morning') as CoachSessionSlot,
                                        },
                                      ]);
                                    }}
                                    className="text-[9px] font-black uppercase tracking-widest text-brand hover:underline"
                                  >
                                    {t('coach.onb.schedule.swapSlots')}
                                  </button>
                                )}
                              {slots.length < 2 &&
                                slots[0]?.type !== 'rest' &&
                                slots[0]?.type !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const firstSlot = (slots[0].sessionSlot || 'Morning') as CoachSessionSlot;
                                      setDaySlots([
                                        { ...slots[0], sessionSlot: firstSlot },
                                        {
                                          type: 'cardio',
                                          sessionSlot: firstSlot === 'Morning' ? 'Evening' : 'Morning',
                                          durationMin: d.coachDecidesCardioDuration
                                            ? undefined
                                            : d.cardioSessionDurationMin ?? 45,
                                        },
                                      ]);
                                    }}
                                    className="text-[9px] font-black uppercase tracking-widest text-brand hover:underline"
                                  >
                                    + {t('coach.onb.schedule.addSecond')}
                                  </button>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {planType === 'workout' && stepId === 'w_benchmarks' && (
                <BenchmarksStep
                  trainingStyle={d.trainingStyle || ''}
                  equipment={d.equipment || []}
                  sports={d.sports || []}
                  benchmarks={d.benchmarks || {}}
                  onChange={updBenchmark}
                />
              )}

              {planType === 'workout' && stepId === 'w_optional' && (
                <div className="space-y-5">
                  <p className="text-sm text-[var(--text-muted)] font-medium">{t('coach.onb.optional.lead')}</p>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                      {t('coach.onb.optional.injuries')}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {COACH_INJURY_IDS.map(id => {
                        const selected = parseInjuryIds(d.injuries || '').includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              const nextIds = toggleInjuryId(parseInjuryIds(d.injuries || ''), id);
                              const notes = injuryNotesFromPlain(d.injuries || '');
                              upd({ injuries: formatInjuriesPlain(nextIds, notes) || undefined });
                            }}
                            className={cn(
                              'min-h-[40px] px-3 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                              uiChoice(selected),
                            )}
                          >
                            {t(injuryLabelKey(id))}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={injuryNotesFromPlain(d.injuries || '')}
                      onChange={e => {
                        const ids = parseInjuryIds(d.injuries || '') as CoachInjuryId[];
                        upd({ injuries: formatInjuriesPlain(ids, e.target.value) || undefined });
                      }}
                      placeholder={t('coach.onb.optional.injuriesPh')}
                      className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.optional.extra')}</p>
                    <input type="text" value={d.extraWishes || ''} onChange={e => upd({ extraWishes: e.target.value })}
                      placeholder={t('coach.onb.optional.extraPh')}
                      className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                </div>
              )}

              {/* ── NUTRITION STEPS ── */}

              {planType === 'nutrition' && stepId === 'n_goal' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-muted)] font-medium">{t('coach.onb.nGoal.prompt')}</p>
                  {([
                    { id: 'weight_loss', labelKey: 'coach.onb.nGoal.weight_loss.label', descKey: 'coach.onb.nGoal.weight_loss.desc' },
                    { id: 'muscle_gain', labelKey: 'coach.onb.nGoal.muscle_gain.label', descKey: 'coach.onb.nGoal.muscle_gain.desc' },
                    { id: 'performance', labelKey: 'coach.onb.nGoal.performance.label', descKey: 'coach.onb.nGoal.performance.desc' },
                    { id: 'maintenance', labelKey: 'coach.onb.nGoal.maintenance.label', descKey: 'coach.onb.nGoal.maintenance.desc' },
                    { id: 'recomposition', labelKey: 'coach.onb.nGoal.recomposition.label', descKey: 'coach.onb.nGoal.recomposition.desc' },
                  ] as const).map(g => {
                    const sel = d.nutritionGoal === g.id;
                    return (
                      <button key={g.id} onClick={() => upd({ nutritionGoal: g.id })}
                        className={cn('w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all',
                          uiChoice(sel))}>
                        <div>
                          <p className={cn('font-black uppercase tracking-tight text-sm text-[var(--text-primary)]')}>{t(g.labelKey)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">{t(g.descKey)}</p>
                        </div>
                        {sel && <Check size={16} className="text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {planType === 'nutrition' && stepId === 'n_body' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: 'weight', labelKey: 'coach.onb.nBody.weight', placeholder: '80', type: 'number' },
                      { key: 'height', labelKey: 'coach.onb.nBody.height', placeholder: '180', type: 'number' },
                    ] as const).map(f => (
                      <div key={f.key}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t(f.labelKey)}</p>
                        <input type={f.type} value={(d as any)[f.key] || ''} onChange={e => upd({ [f.key]: parseFloat(e.target.value) } as any)} placeholder={f.placeholder}
                          className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.nBody.activity')}</p>
                    <select value={d.activityLevel || ''} onChange={e => upd({ activityLevel: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand">
                      <option value="">{t('coach.onb.nBody.select')}</option>
                      <option value="sedentary">{t('coach.onb.nBody.act.sedentary')}</option>
                      <option value="light">{t('coach.onb.nBody.act.light')}</option>
                      <option value="moderate">{t('coach.onb.nBody.act.moderate')}</option>
                      <option value="active">{t('coach.onb.nBody.act.active')}</option>
                      <option value="athlete">{t('coach.onb.nBody.act.athlete')}</option>
                    </select>
                  </div>
                  {(profileAge || profileGender) && profileBits && (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                      <Check size={14} className="text-green-500 flex-shrink-0" />
                      <p className="text-[10px] text-[var(--text-muted)] font-bold">{t('coach.onb.profileFrom', { text: profileBits })}</p>
                    </div>
                  )}
                </div>
              )}

              {planType === 'nutrition' && stepId === 'n_diet' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
                      {t('coach.onb.diet.restrictions')} <span className="normal-case font-medium text-[var(--text-muted)]/90">{t('coach.onb.diet.restrictionsSub')}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DIET_RESTRICTION_IDS.map(rid => {
                        const sel = (d.restrictions || []).includes(rid);
                        return (
                          <button key={rid} type="button" onClick={() => toggleArr('restrictions', rid)}
                            className={cn('px-4 py-2 rounded-full border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                              sel ? 'border-brand bg-brand/15 text-[var(--text-primary)]' : 'border-[var(--border-muted)] hover:border-brand/50 text-[var(--text-muted)]')}>
                            {t(`coach.onb.diet.${rid}` as 'coach.onb.diet.vegan')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.diet.allergiesOther')}</p>
                    <input type="text" value={d.allergies || ''} onChange={e => upd({ allergies: e.target.value })} placeholder={t('coach.onb.diet.allergiesPh')}
                      className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                </div>
              )}

              {planType === 'nutrition' && stepId === 'n_schedule' && (
                <div className="space-y-6">
                                    <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.schedule.defaultServings')}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium mb-3">{t('coach.onb.schedule.defaultServingsHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => upd({ defaultMealServings: n })}
                          className={cn(
                            'min-h-[44px] min-w-[44px] rounded-xl border-2 font-black text-sm transition-all',
                            (d.defaultMealServings ?? 2) === n
                              ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                              : 'border-[var(--border-muted)] hover:border-brand/50',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.schedule.nutritionWeekdays')}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium mb-3">{t('coach.onb.schedule.nutritionWeekdaysHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      {COACH_NUTRITION_WEEKDAYS.map(dn => {
                        const sel = (d.mealScheduleDays || []).includes(dn);
                        return (
                          <button
                            key={dn}
                            type="button"
                            onClick={() => toggleNutritionDay(dn)}
                            className={cn(
                              'min-h-[44px] min-w-[44px] rounded-xl border-2 px-3 text-[10px] font-black uppercase tracking-widest transition-all',
                              sel
                                ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                                : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand/40',
                            )}
                          >
                            {t(`coach.onb.wd.${dn}` as 'coach.onb.wd.Monday')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {(d.mealScheduleDays || []).length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('coach.onb.schedule.mealSlots')}</p>
                      {(d.mealScheduleDays || []).map(day => (
                        <div
                          key={day}
                          className="rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-4 space-y-3"
                        >
                          <p className="text-xs font-black uppercase tracking-tight text-[var(--text-primary)]">{t(`coach.onb.wd.${day}` as 'coach.onb.wd.Monday')}</p>
                          {COACH_MEAL_SLOT_TYPES.map(slotType => {
                            const on = mealSlotEnabled(day, slotType);
                            const servings = mealSlotServings(day, slotType);
                            return (
                              <div
                                key={`${day}-${slotType}`}
                                className={cn(
                                  'flex flex-wrap items-center gap-2 rounded-xl border p-3 transition-all',
                                  on ? 'border-brand/40 bg-brand/5' : 'border-[var(--border-muted)]',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleMealSlot(day, slotType)}
                                  className={cn(
                                    'rounded-lg border-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
                                    on
                                      ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                                      : 'border-[var(--border-muted)] text-[var(--text-muted)]',
                                  )}
                                >
                                  {t(`nut.cat.${slotType}` as 'nut.cat.snack')}
                                </button>
                                {on && (
                                  <div className="ml-auto flex items-center gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('coach.onb.schedule.persons')}</span>
                                    <button type="button" onClick={() => setMealSlotServings(day, slotType, servings - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-muted)] bg-[var(--card-bg)] font-black">−</button>
                                    <span className="min-w-[2rem] text-center text-sm font-black">{servings}</span>
                                    <button type="button" onClick={() => setMealSlotServings(day, slotType, servings + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-muted)] bg-[var(--card-bg)] font-black">+</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">{t('coach.onb.meals.cook')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'minimal', labelKey: 'coach.onb.cook.minimal' },
                        { id: 'moderate', labelKey: 'coach.onb.cook.moderate' },
                        { id: 'flexible', labelKey: 'coach.onb.cook.flexible' },
                        { id: 'extensive', labelKey: 'coach.onb.cook.extensive' },
                      ] as const).map(c => (
                        <button key={c.id} type="button" onClick={() => upd({ cookingTime: c.id })}
                          className={cn('p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                            d.cookingTime === c.id ? 'border-brand bg-brand/15 text-[var(--text-primary)]' : 'border-[var(--border-muted)] hover:border-brand/50 text-[var(--text-muted)]')}>
                          {t(c.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.meals.cuisine')}</p>
                      <input type="text" value={d.foodPreferences || ''} onChange={e => upd({ foodPreferences: e.target.value })} placeholder={t('coach.onb.meals.cuisinePh')}
                        className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('coach.onb.meals.budget')}</p>
                      <select value={d.budget || ''} onChange={e => upd({ budget: e.target.value })}
                        className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand">
                        <option value="low">{t('coach.onb.budget.low')}</option>
                        <option value="medium">{t('coach.onb.budget.medium')}</option>
                        <option value="high">{t('coach.onb.budget.high')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {(stepId === 'w_start_date' || stepId === 'n_start_date') && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-[var(--text-muted)]">{t('coach.onb.startDate.prompt')}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { id: 'today', labelKey: 'coach.onb.startDate.today' },
                      { id: 'tomorrow', labelKey: 'coach.onb.startDate.tomorrow' },
                      { id: 'next_monday', labelKey: 'coach.onb.startDate.next_monday' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => upd({ startDate: opt.id })}
                        className={cn(
                          'min-h-[56px] rounded-2xl border-2 px-4 py-4 text-[11px] font-black uppercase tracking-widest transition-all',
                          d.startDate === opt.id
                            ? 'border-brand bg-brand/15 text-[var(--text-primary)]'
                            : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] hover:border-brand/50',
                        )}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── REVIEW ── */}
              {stepId === 'review' && (
                <div className="space-y-5">
                  <p className="text-sm text-[var(--text-muted)] font-medium">{t('coach.onb.review.lead')}</p>
                  <div className="space-y-2">
                    {planType === 'workout' && [
                      { l: t('coach.onb.review.lbl.goal'), v: d.primaryGoal ? t(`coach.onb.wGoal.${d.primaryGoal}.label` as 'coach.onb.wGoal.build_muscle.label') : '' },
                      { l: t('coach.onb.review.lbl.style'), v: d.trainingStyle ? t(`coach.onb.style.${d.trainingStyle}.label` as 'coach.onb.style.strength.label') : '' },
                      d.workoutVibe ? { l: t('coach.onb.review.lbl.vibe'), v: t(`coach.onb.vibe.${d.workoutVibe}.label` as 'coach.onb.vibe.functional.label') } : null,
                      (d.equipment?.length ?? 0) > 0
                        ? {
                            l: t('coach.onb.review.lbl.equipment'),
                            v: (d.equipment || []).map(e => t(`coach.onb.equip.${e}` as 'coach.onb.equip.bodyweight')).join(', '),
                          }
                        : null,
                      d.sports?.length ? { l: t('coach.onb.review.lbl.sports'), v: (d.sports || []).map(s => t(`coach.onb.sport.${s}` as 'coach.onb.sport.running')).join(', ') } : null,
                      {
                        l: t('coach.onb.review.lbl.start'),
                        v: t(
                          d.startDate === 'tomorrow'
                            ? 'coach.onb.startDate.tomorrow'
                            : d.startDate === 'next_monday'
                              ? 'coach.onb.startDate.next_monday'
                              : 'coach.onb.startDate.today',
                        ),
                      },
                      {
                        l: t('coach.onb.review.lbl.plan'),
                        v: d.planMode === 'event'
                          ? t('coach.onb.review.plan.event', { name: d.eventName || t('coach.onb.review.missing') })
                          : t('coach.onb.review.plan.ongoing'),
                      },
                      {
                        l: t('coach.onb.review.lbl.scheduleMode'),
                        v:
                          d.scheduleMode === 'custom'
                            ? t('coach.onb.review.scheduleMode.custom')
                            : t('coach.onb.review.scheduleMode.auto'),
                      },
                      (d.trainingStyle === 'strength' || d.trainingStyle === 'hybrid')
                        ? {
                            l: t('coach.onb.review.lbl.strengthVolume'),
                            v:
                              d.coachDecidesStrengthSessions || d.coachAdaptiveVolume
                                ? t('coach.onb.review.coachDecides')
                                : t('coach.onb.review.volumeLine', {
                                    n: d.strengthSessionsPerWeek ?? 0,
                                    m: d.coachDecidesStrengthDuration
                                      ? t('coach.onb.review.coachDecides')
                                      : `${d.strengthSessionDurationMin ?? 60}`,
                                  }),
                          }
                        : null,
                      (d.trainingStyle === 'endurance' || d.trainingStyle === 'hybrid')
                        ? {
                            l: t('coach.onb.review.lbl.cardioVolume'),
                            v:
                              d.coachDecidesCardioSessions || d.coachAdaptiveVolume
                                ? t('coach.onb.review.coachDecides')
                                : t('coach.onb.review.volumeLine', {
                                    n: d.cardioSessionsPerWeek ?? 0,
                                    m: d.coachDecidesCardioDuration
                                      ? t('coach.onb.review.coachDecides')
                                      : `${d.cardioSessionDurationMin ?? 45}`,
                                  }),
                          }
                        : null,
                      {
                        l: t('coach.onb.review.lbl.weekdays'),
                        v: (d.availableTrainingDays || [])
                          .map(x => t(`coach.onb.wd.${x}` as 'coach.onb.wd.Monday'))
                          .join(', '),
                      },
                      {
                        l: t('coach.onb.review.lbl.doubles'),
                        v: d.allowDoubleSessions !== false ? t('coach.onb.review.yes') : t('coach.onb.review.no'),
                      },
                      { l: t('coach.onb.review.lbl.level'), v: d.fitnessLevel ? t(`coach.onb.level.${d.fitnessLevel}.label` as 'coach.onb.level.beginner.label') : '' },
                      (profileAge || profileGender) ? { l: t('coach.onb.review.lbl.profile'), v: profileBits || '' } : null,
                      d.benchmarks && Object.keys(d.benchmarks).length > 0
                        ? { l: t('coach.onb.review.lbl.benchmarks'), v: t('coach.onb.review.benchmarksN', { n: Object.keys(d.benchmarks).length }) }
                        : null,
                    ].filter(Boolean).map((item: any) => (
                      <div key={item.l} className="flex justify-between gap-3 border-b border-[var(--border-muted)] py-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] shrink-0">{item.l}</span>
                        <span className="text-sm font-black text-[var(--text-primary)] text-right break-words">{item.v}</span>
                      </div>
                    ))}
                    {planType === 'nutrition' && [
                      { l: t('coach.onb.review.lbl.goal'), v: d.nutritionGoal ? t(`coach.onb.nGoal.${d.nutritionGoal}.label` as 'coach.onb.nGoal.weight_loss.label') : '' },
                      {
                        l: t('coach.onb.review.lbl.body'),
                        v: [
                          d.weight ? `${d.weight}kg` : t('coach.onb.review.missing'),
                          d.height ? `${d.height}cm` : t('coach.onb.review.missing'),
                          profileAge ? `${profileAge}y` : '',
                          profileGender ? String(profileGender) : '',
                        ].filter(Boolean).join(' · '),
                      },
                      { l: t('coach.onb.review.lbl.activity'), v: d.activityLevel ? t(`coach.onb.nBody.act.${d.activityLevel}` as 'coach.onb.nBody.act.sedentary') : '' },
                      d.restrictions?.length
                        ? { l: t('coach.onb.review.lbl.restrictions'), v: (d.restrictions || []).map(r => t(`coach.onb.diet.${r}` as 'coach.onb.diet.vegan')).join(', ') }
                        : null,
                      {
                        l: t('coach.onb.review.lbl.mealSchedule'),
                        v: (d.mealScheduleDays || [])
                          .map(day => {
                            const meals = (d.mealSlotsByDay?.[day] || [])
                              .map(m => `${t(`nut.cat.${m.type}` as 'nut.cat.snack')}×${m.servings}`)
                              .join(', ');
                            return `${t(`coach.onb.wd.${day}` as 'coach.onb.wd.Monday')}: ${meals}`;
                          })
                          .join(' · '),
                      },
                      { l: t('coach.onb.review.lbl.cooking'), v: d.cookingTime ? t(`coach.onb.cook.${d.cookingTime}` as 'coach.onb.cook.minimal') : '' },
                      { l: t('coach.onb.meals.budget'), v: d.budget ? t(`coach.onb.budget.${d.budget}` as 'coach.onb.budget.low') : '' },
                      {
                        l: t('coach.onb.review.lbl.start'),
                        v: t(
                          d.startDate === 'tomorrow'
                            ? 'coach.onb.startDate.tomorrow'
                            : d.startDate === 'next_monday'
                              ? 'coach.onb.startDate.next_monday'
                              : 'coach.onb.startDate.today',
                        ),
                      },
                    ].filter(Boolean).map((item: any) => (
                      <div key={item.l} className="flex justify-between gap-3 border-b border-[var(--border-muted)] py-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] shrink-0">{item.l}</span>
                        <span className="text-sm font-black text-[var(--text-primary)] text-right break-words">{item.v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-5">
                    <Zap size={18} className="mt-0.5 flex-shrink-0 text-brand" />
                    <p className="text-xs font-medium leading-relaxed text-[var(--text-primary)]">
                      {planType === 'workout' && d.planMode === 'event' && d.eventDate
                        ? t('coach.onb.review.zap.event', {
                          days: Math.round((new Date(d.eventDate).getTime() - Date.now()) / 86400000),
                        })
                        : t('coach.onb.review.zap.default')}
                    </p>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 border-t border-[var(--border-muted)] bg-[var(--card-bg)] px-5 pt-4 md:px-7 md:pt-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
        >
          {proceedBlock && step < totalSteps - 1 ? (
            <p
              id="coach-onb-proceed-hint"
              role="status"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[11px] font-medium leading-relaxed text-amber-900 dark:text-amber-100"
            >
              {t(proceedBlock.key as 'coach.onb.block.goal', proceedBlock.vars)}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => (step > 0 ? setStep(s => s - 1) : onClose())}
              className="flex items-center gap-2 px-3 py-3 text-sm font-black uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={16} />{step > 0 ? t('coach.onb.back') : t('coach.onb.cancel')}
            </button>

            {step < totalSteps - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (!canAdvance) return;
                  setStep(s => s + 1);
                }}
                disabled={!canAdvance}
                aria-describedby={proceedBlock ? 'coach-onb-proceed-hint' : undefined}
                className={cn(
                  uiBtnPrimary,
                  'px-7 py-3 text-[10px]',
                  'disabled:!opacity-100 disabled:cursor-not-allowed disabled:border-[var(--border-muted)] disabled:bg-[var(--background)] disabled:text-[var(--text-muted)]',
                )}
              >
                {t('coach.onb.continue')} <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={finish}
                className={cn(uiBtnPrimary, 'px-7 py-3 text-[10px]')}>
                <Zap size={14} /> {t('coach.onb.generate')}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
  );
}
