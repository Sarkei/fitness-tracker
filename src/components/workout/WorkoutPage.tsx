/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Plus, Dumbbell, Clock, Flame, Loader2, Trash2, Activity, Zap, Settings, Brain, ChevronRight, PlayCircle, Wand2, X as XIcon, CheckCircle2, Moon, RotateCcw, Calendar, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CoachPage from '@/src/components/coach/CoachPage';
import { useWorkouts, useCoachPlans, useAppBootstrap } from '@/src/lib/AppDataContext';
import { displayCoachExerciseName } from '@/src/lib/coachExerciseDisplay';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import PageBootstrap from '@/src/components/ui/PageBootstrap';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import { useAuth } from '@/src/lib/AuthContext';
import { cn } from '@/src/lib/utils';
import { format, addDays, startOfWeek, isSameDay, startOfDay, isAfter, type Locale as DateFnsLocale } from 'date-fns';
import { dateInCoachWeek, toLocalYmd, weekMondayForWorkoutView } from '@/src/lib/coachWeekWindow';
import {
  applyManualPlanWeekOverrides,
  manualPlanWeekStartYmd,
  pruneManualPlanWeekOverrides,
  upsertManualPlanWeekSwap,
} from '@/src/lib/manualPlanWeekOverrides';
import {
  coachDateForScheduleDay,
  coachScheduleRowsForCalendarDate,
  parseCoachStartYmd,
} from '@/src/lib/coachWeekDisplay';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { Workout, WorkoutTemplate, PlannedSession, Exercise } from '@/src/types';
import WorkoutSessionPlayer from './WorkoutSessionPlayer';
import WorkoutCompleteSummaryModal from './WorkoutCompleteSummaryModal';
import RecoverSessionDraftBanner from './RecoverSessionDraftBanner';
import WorkoutTemplateEditor from './WorkoutTemplateEditor';
import { useSocial } from '@/src/lib/useSocial';
import { Share2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { generateWorkoutTemplate, AIWorkoutRequest } from '@/src/services/aiWorkoutService';
import { downloadCsv, workoutTemplateToCsv } from '@/src/lib/workoutTemplateCsv';
import { useI18n } from '@/src/lib/i18n';
import {
  MobileOverlayRoot,
  mobileSheetOverlayClass,
  overlayPortal,
  resetMobileChromeAfterOverlay,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import { prepareExercisesForSession } from '@/src/lib/sessionExercisePrep';
import {
  coachDayHasWorkoutContent,
  coachDayToSessionExerciseList,
  coachRowExercises,
  coachRowHasExercises,
  resolveCoachScheduleDayList,
} from '@/src/lib/coachTemplateMappers';
import CoachWeekSessionChip from '@/src/components/coach/CoachWeekSessionChip';
import CoachWeekTypeLegend from '@/src/components/coach/CoachWeekTypeLegend';
import CoachSessionDetailContent from '@/src/components/coach/CoachSessionDetailContent';
import {
  coachDayGroupTrainingSessions,
  coachSessionExpandKey,
  sortCoachSessionsBySlot,
} from '@/src/lib/coachScheduleGrouping';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import { formatCoachSessionType } from '@/src/lib/coachScheduleDisplay';
import { estimateWorkoutCalories } from '@/src/lib/workoutAnalytics';
import { buildWorkoutShareText } from '@/src/lib/workoutShare';
import { buildRepeatSessionFromWorkout, getLastCompletedWorkout } from '@/src/lib/repeatLastWorkout';
import PageTabGrid from '@/src/components/layout/PageTabGrid';
import {
  buildCoachSessionSourceKey,
  buildTemplateSourceKey,
  clearSessionDraft,
  createSessionInstanceId,
  draftMatchesSourceKey,
  fetchSessionDraftFromServer,
  hasResumableSessionDraft,
  isSessionDraftAged,
  loadSessionDraft,
  persistInitialSessionDraft,
  todayWorkoutSourceKey,
  useSessionDraft,
  workoutFromSessionDraft,
} from '@/src/lib/sessionDraft';
import { useActiveWorkoutSession } from '@/src/lib/ActiveWorkoutSessionContext';
function startSessionPayload(payload: Partial<Workout>): Partial<Workout> {
  return { ...payload, sessionInstanceId: createSessionInstanceId() };
}

const DAY_IDX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// ─── AI Template Generator Modal ──────────────────────────────────────────────

const EQUIPMENT_IDS = ['barbell', 'dumbbell', 'cables', 'machines', 'bodyweight', 'kettlebell', 'resistance_bands', 'pull_up_bar'] as const;

function workoutTypeUi(t: (k: string) => string, type: string): string {
  const m: Record<string, string> = {
    Strength: t('work.type.strength'),
    Cardio: t('work.type.cardio'),
    Hybrid: t('work.type.hybrid'),
    Other: t('work.type.other'),
  };
  return m[type] ?? type;
}

const DURATION_OPTIONS = [30, 45, 60, 75, 90];

function AITemplateGeneratorModal({
  onClose,
  onSave,
  userId,
}: {
  onClose: () => void;
  onSave: (template: Omit<WorkoutTemplate, 'id'>) => Promise<void>;
  userId: string;
}) {
  const { t, locale } = useI18n();
  const [equipment, setEquipment] = useState<string[]>([]);
  const [duration, setDuration]   = useState(60);
  const [type, setType]           = useState<'Strength' | 'Cardio' | 'Hybrid'>('Strength');
  const [special, setSpecial]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const toggleEquip = (id: string) =>
    setEquipment(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const req: AIWorkoutRequest = { equipment, duration, type, specialRequests: special };
      const result = await generateWorkoutTemplate(req);
      await onSave({
        name: result.name,
        type: result.type,
        exercises: result.exercises,
        userId,
        templateMode: 'workout',
      });
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message?.trim() ? e.message : t('work.aiGen.errFallback');
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  useMobileOverlaySheet(true);

  const sheet = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-lg bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl z-10 flex flex-col border border-[var(--border-muted)] overflow-hidden max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]">
        <div className="p-5 pb-4 md:p-7 md:pb-4 border-b border-[var(--border-muted)] flex items-start justify-between flex-shrink-0 pt-[max(1rem,env(safe-area-inset-top))] gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">{t('work.aiGen.badge')}</p>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-[var(--text-primary)] mt-0.5">{t('work.aiGen.title')}</h3>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)]" aria-label={t('profile.cancel')}><XIcon size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-5 md:p-7 space-y-6">
          {/* Type */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">{t('work.aiGen.workoutType')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Strength', 'Cardio', 'Hybrid'] as const).map(wt => (
                <button key={wt} type="button" onClick={() => setType(wt)}
                  className={cn("min-h-[44px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border touch-manipulation",
                    type === wt ? "border-2 border-brand bg-brand/15 text-[var(--text-primary)]" : "bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand")}>
                  {workoutTypeUi(t, wt)}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">{t('work.aiGen.duration')}</label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_OPTIONS.map(d => (
                <button key={d} type="button" onClick={() => setDuration(d)}
                  className={cn("min-h-[44px] px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border touch-manipulation",
                    duration === d ? "border-2 border-brand bg-brand/15 text-[var(--text-primary)]" : "bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand")}>
                  {d}m
                </button>
              ))}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">{t('work.aiGen.equipment')}</label>
            <div className="flex gap-2 flex-wrap">
              {EQUIPMENT_IDS.map(eq => (
                <button key={eq} type="button" onClick={() => toggleEquip(eq)}
                  className={cn("min-h-[40px] px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border touch-manipulation",
                    equipment.includes(eq) ? "border-2 border-brand bg-brand/15 text-[var(--text-primary)]" : "bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand")}>
                  {t('work.equip.' + eq)}
                </button>
              ))}
            </div>
          </div>

          {/* Special requests */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
              {t('work.aiGen.special')}
            </label>
            <textarea
              value={special}
              onChange={e => setSpecial(e.target.value)}
              placeholder={t('work.aiGen.placeholder')}
              className="w-full min-h-[96px] h-24 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 text-base font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 font-bold bg-red-50 p-3 rounded-xl">{error}</p>
          )}
        </div>

        <div className="p-5 pt-0 md:p-7 md:pt-0 flex-shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="w-full min-h-[52px] ui-btn-brand rounded-xl py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-brand/20 touch-manipulation">
            {generating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            {generating ? t('work.aiGen.generating') : t('work.aiGen.generate')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}

// ─── Day Assignment Modal ──────────────────────────────────────────────────────

function DayAssignModal({
  dayDate,
  templates,
  onAssign,
  onClose,
}: {
  dayDate: Date;
  templates: WorkoutTemplate[];
  onAssign: (assignment: { type: 'rest' | 'template'; templateId?: string; templateName?: string } | null) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const dfLoc: DateFnsLocale = locale === 'de' ? dfDe : dfEnUS;
  const workoutTemplates = templates.filter(tpl => !tpl.templateMode || tpl.templateMode === 'workout');
  const heading = format(dayDate, 'EEEE, d. MMM', { locale: dfLoc });
  useMobileOverlaySheet(true);

  const sheet = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-sm bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl z-10 border border-[var(--border-muted)] overflow-hidden max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col max-lg:max-h-[min(85dvh,calc(100dvh-5.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]">
        <div className="p-5 pb-4 md:p-7 md:pb-4 border-b border-[var(--border-muted)] flex justify-between items-center gap-3 shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
          <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] min-w-0">{heading}</h3>
          <button type="button" onClick={onClose} className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)]" aria-label={t('profile.cancel')}><XIcon size={16} /></button>
        </div>
        <div className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Rest Day */}
          <button
            type="button"
            onClick={() => onAssign({ type: 'rest' })}
            className="w-full min-h-[52px] flex items-center gap-3 p-4 rounded-2xl border border-[var(--border-muted)] hover:border-brand hover:bg-brand/5 transition-all text-left group touch-manipulation"
          >
            <div className="w-10 h-10 bg-[var(--background)] rounded-xl border border-transparent flex items-center justify-center text-[var(--text-muted)] group-hover:border-brand/40 group-hover:bg-brand/10 group-hover:text-brand transition-all">
              <Moon size={18} />
            </div>
            <div>
              <p className="text-sm font-black uppercase italic">{t('work.assign.restTitle')}</p>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('work.assign.restSub')}</p>
            </div>
          </button>

          {/* Clear assignment */}
          <button
            type="button"
            onClick={() => onAssign(null)}
            className="w-full min-h-[52px] flex items-center gap-3 p-4 rounded-2xl border border-[var(--border-muted)] hover:border-[var(--text-muted)] transition-all text-left group touch-manipulation"
          >
            <div className="w-10 h-10 bg-[var(--background)] rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:text-red-500 transition-all">
              <RotateCcw size={18} />
            </div>
            <div>
              <p className="text-sm font-black uppercase italic text-[var(--text-muted)]">{t('work.assign.clearTitle')}</p>
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('work.assign.clearSub')}</p>
            </div>
          </button>

          {workoutTemplates.length > 0 && (
            <div className="pt-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] px-1 mb-2">{t('work.assign.templates')}</p>
              {workoutTemplates.map(tpl => (
                <button key={tpl.id}
                  type="button"
                  onClick={() => onAssign({ type: 'template', templateId: tpl.id, templateName: tpl.name })}
                  className="w-full min-h-[52px] flex items-center gap-3 p-4 rounded-2xl border border-[var(--border-muted)] hover:border-brand hover:bg-brand/5 transition-all text-left group mb-2 touch-manipulation">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0",
                    tpl.type === 'Strength' ? 'bg-blue-500' : tpl.type === 'Cardio' ? 'bg-orange-500' : 'bg-teal-500')}>
                    <Dumbbell size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase italic truncate">{tpl.name}</p>
                    <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">
                      {t('work.assign.meta', { type: workoutTypeUi(t, tpl.type), n: tpl.exercises.length })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {workoutTemplates.length === 0 && (
            <p className="text-center text-[10px] text-[var(--text-muted)] font-black uppercase py-4">{t('work.assign.noTemplates')}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}

// ─── Extra-Workout (nur heute) ─────────────────────────────────────────────────

function SpontaneousWorkoutModal({
  onClose,
  onSave,
  logDate,
}: {
  onClose: () => void;
  onSave: (payload: {
    name: string;
    type: Workout['type'];
    duration: number;
    caloriesBurned: number;
    date: string;
  }) => Promise<void>;
  logDate: Date;
}) {
  const { t, locale } = useI18n();
  const dfLoc: DateFnsLocale = locale === 'de' ? dfDe : dfEnUS;
  const [label, setLabel] = useState('');
  const [type, setType] = useState<Workout['type']>('Cardio');
  const [duration, setDuration] = useState(30);
  const [calories, setCalories] = useState(200);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateStr = format(startOfDay(logDate), 'yyyy-MM-dd');
  const dateShown = format(logDate, 'EEE dd.MM.yyyy', { locale: dfLoc });

  const handleSubmit = async () => {
    const d = Math.max(1, Math.round(Number(duration)) || 0);
    const kcal = Math.max(0, Math.round(Number(calories)) || 0);
    const trimmed = label.trim();
    const name = trimmed || t('work.spon.defaultName');
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, type, duration: d, caloriesBurned: kcal, date: dateStr });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('work.err.save'));
    } finally {
      setSaving(false);
    }
  };

  useMobileOverlaySheet(true);

  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-sm bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl z-10 border border-[var(--border-muted)] overflow-hidden max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col max-lg:max-h-[min(85dvh,calc(100dvh-5.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
      >
        <div className="p-5 pb-4 md:p-7 md:pb-4 border-b border-[var(--border-muted)] flex justify-between items-start flex-shrink-0 gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">{t('work.spon.kicker')}</p>
            <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] mt-0.5">
              {t('work.spon.title')}
            </h3>
            <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">
              {dateShown}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)]"
            aria-label={t('work.spon.closeAria')}
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-5 md:p-7 space-y-5">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
              {t('work.spon.activity')}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('work.spon.activityPh')}
              className="w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 text-base font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">{t('work.spon.type')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Cardio', 'Strength', 'Hybrid', 'Other'] as const).map((wt) => (
                <button
                  key={wt}
                  type="button"
                  onClick={() => setType(wt)}
                  className={cn(
                    'min-h-[44px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border touch-manipulation',
                    type === wt
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand',
                  )}
                >
                  {workoutTypeUi(t, wt)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">
              {t('work.spon.duration')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {[15, 30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={cn(
                    'min-h-[44px] px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border touch-manipulation',
                    duration === m
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand',
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
              {t('work.spon.kcal')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={Number.isNaN(calories) ? '' : calories}
              onChange={(e) => setCalories(parseInt(e.target.value, 10) || 0)}
              className="w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 text-base font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-bold bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>

        <div className="p-5 pt-0 md:p-7 md:pt-0 flex-shrink-0 flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full min-h-[52px] ui-btn-brand rounded-xl py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-brand/20 touch-manipulation"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            {saving ? t('work.spon.saving') : t('work.spon.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] py-3 text-[var(--text-muted)] font-black uppercase tracking-widest text-[10px] touch-manipulation"
          >
            {t('work.spon.cancel')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const coachAutoStart = searchParams.get('coachOnboarding') === '1';
  const { profile, updateProfile, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  const dfLoc: DateFnsLocale = locale === 'de' ? dfDe : dfEnUS;
  const aiCaps = useAiCapabilities();
  const coachTabDisabled = !aiCaps.loading && !aiCaps.enabled;
  const {
    workouts,
    templates,
    addWorkout,
    addTemplate,
    updateTemplate,
    deleteWorkout,
    deleteTemplate,
  } = useWorkouts();
  const { loading: bootstrapLoading, error: bootstrapError, retry: retryBootstrap } = useAppBootstrap();

  const [view, setView] = useState<'thisweek' | 'history' | 'templates' | 'coach'>('thisweek');

  useEffect(() => {
    if (coachTabDisabled && view === 'coach') setView('thisweek');
  }, [coachTabDisabled, view]);

  useEffect(() => {
    const st = location.state as { quickAction?: string } | null;
    if (st?.quickAction === 'log') {
      setView('thisweek');
      setSpontaneousLogForDate(new Date());
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [activeSession, setActiveSession] = useState<Partial<Workout> | null>(null);
  const { startSession: registerActiveSession, clearSession: unregisterActiveSession, isActive: globalSessionActive } =
    useActiveWorkoutSession();
  const sessionDraft = useSessionDraft();
  /** ActiveWorkoutBar ist Primary-Resume — Today/Chips nicht parallel. */
  const barOwnsResume =
    globalSessionActive &&
    hasResumableSessionDraft(sessionDraft) &&
    !!sessionDraft &&
    !isSessionDraftAged(sessionDraft);
  const [draftConflict, setDraftConflict] = useState<{
    draftName: string;
    proceed: () => void;
  } | null>(null);

  const runOrConfirmOverwrite = useCallback(
    (intendedSourceKey: string | undefined, proceed: () => void) => {
      const draft = loadSessionDraft();
      if (!hasResumableSessionDraft(draft)) {
        proceed();
        return;
      }
      if (intendedSourceKey && draftMatchesSourceKey(draft, intendedSourceKey)) {
        proceed();
        return;
      }
      setDraftConflict({
        draftName: draft!.workoutMeta.name?.trim() || t('workout.new'),
        proceed,
      });
    },
    [t],
  );

  const beginWorkoutSession = useCallback(
    (payload: Partial<Workout>) => {
      runOrConfirmOverwrite(payload.sessionSourceKey, () => {
        const session = startSessionPayload(payload);
        persistInitialSessionDraft(session);
        registerActiveSession({ workoutId: session.id, workoutName: session.name });
        setActiveSession(session);
      });
    },
    [registerActiveSession, runOrConfirmOverwrite],
  );

  const resumeWorkoutSessionFromDraft = useCallback(
    (draft: NonNullable<ReturnType<typeof loadSessionDraft>>) => {
      const session = workoutFromSessionDraft(draft);
      if (!session.userId && profile?.uid) session.userId = profile.uid;
      registerActiveSession({
        workoutId: session.id,
        workoutName: session.name,
        startedAt: draft.startedAt ?? draft.savedAt,
        elapsedSeconds: draft.elapsedSeconds ?? 0,
        lastSavedAt: draft.savedAt,
      });
      setActiveSession(session);
    },
    [registerActiveSession, profile?.uid],
  );

  const openSessionForSourceKey = useCallback(
    (sourceKey: string, startFresh: () => void) => {
      const draft = loadSessionDraft();
      if (draftMatchesSourceKey(draft, sourceKey) && draft) {
        resumeWorkoutSessionFromDraft(draft);
        return;
      }
      runOrConfirmOverwrite(sourceKey, startFresh);
    },
    [resumeWorkoutSessionFromDraft, runOrConfirmOverwrite],
  );

  const endWorkoutSession = useCallback(() => {
    unregisterActiveSession();
    setActiveSession(null);
  }, [unregisterActiveSession]);

  useEffect(() => {
    const st = location.state as { resumeWorkout?: boolean } | null;
    if (!st?.resumeWorkout || activeSession || !profile?.uid) return;
    let cancelled = false;
    void (async () => {
      let draft = loadSessionDraft();
      if (!hasResumableSessionDraft(draft)) {
        draft = (await fetchSessionDraftFromServer(workouts)) ?? null;
      }
      if (cancelled || !hasResumableSessionDraft(draft) || !draft) return;
      resumeWorkoutSessionFromDraft(draft);
      window.history.replaceState({}, document.title);
    })();
    return () => {
      cancelled = true;
    };
  }, [location.state, activeSession, profile?.uid, resumeWorkoutSessionFromDraft, workouts]);

  const [editingTemplate, setEditingTemplate] = useState<Partial<WorkoutTemplate> | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<Partial<Workout> | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [assigningDay, setAssigningDay] = useState<{ name: string; date: Date } | null>(null); // day name EN, e.g. Monday
  const [spontaneousLogForDate, setSpontaneousLogForDate] = useState<Date | null>(null);
  const { createPost } = useSocial();

  const [deepLinkToCoach, setDeepLinkToCoach] = useState<{ planId: string, day: string } | null>(null);
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const { coachPlans, ready: coachPlansReady, refetch: refetchCoachPlans } = useCoachPlans();
  const { openExerciseDetail, openExerciseSwap } = useExerciseDetail();
  const [coachSwapBusy, setCoachSwapBusy] = useState(false);
  const [coachSwapToast, setCoachSwapToast] = useState('');

  const lastCompletedWorkout = useMemo(() => getLastCompletedWorkout(workouts), [workouts]);

  const singleWorkoutTemplates = useMemo(
    () => templates.filter(tpl => !tpl.templateMode || tpl.templateMode === 'workout'),
    [templates],
  );
  const strengthWorkoutTemplates = useMemo(
    () => singleWorkoutTemplates.filter(tpl => tpl.type !== 'Cardio'),
    [singleWorkoutTemplates],
  );
  const cardioWorkoutTemplates = useMemo(
    () => singleWorkoutTemplates.filter(tpl => tpl.type === 'Cardio'),
    [singleWorkoutTemplates],
  );

  const priorWorkoutsForSummary = useMemo(
    () => (completedWorkout?.id ? workouts.filter(w => w.id !== completedWorkout.id) : workouts),
    [workouts, completedWorkout?.id],
  );

  const startRepeatLastWorkout = useCallback(() => {
    if (!lastCompletedWorkout || !profile?.uid) return;
    beginWorkoutSession(
      buildRepeatSessionFromWorkout(lastCompletedWorkout, profile.uid, t('work.repeat.suffix')),
    );
  }, [lastCompletedWorkout, profile?.uid, t, beginWorkoutSession]);

  useEffect(() => {
    const state = location.state as { repeatLast?: boolean } | null;
    if (state?.repeatLast && lastCompletedWorkout && profile?.uid) {
      startRepeatLastWorkout();
      window.history.replaceState({}, document.title);
    }
  }, [location.state, lastCompletedWorkout, profile?.uid, startRepeatLastWorkout]);

  useEffect(() => {
    if (!activeSession) resetMobileChromeAfterOverlay();
  }, [activeSession]);

  // Unifies upcoming sessions from both AI Coach (priority) and manual plans
  const { upcomingSessions, activePlanName, hasActivePlan, isCoachPlan, activePlanId } = useMemo(() => {
    const today = startOfDay(new Date());

    const activeCoachPlan = coachPlans.find(p => p.type === 'workout' && p.status === 'active');
    const coachDayList = activeCoachPlan?.current_schedule?.schedule
      ? resolveCoachScheduleDayList(activeCoachPlan.current_schedule.schedule)
      : [];
    if (coachDayList.length > 0) {
      const schedule = coachDayList;
      const startYmd = parseCoachStartYmd(activeCoachPlan.current_schedule?.start_date);

      const sessions = schedule
        .map((s: any) => {
          if (!startYmd || !s.day) return null;
          const sessionDate = coachDateForScheduleDay(startYmd, String(s.day));
          if (!sessionDate || !dateInCoachWeek(startYmd, sessionDate)) return null;
          if (sessionDate < today) return null;
          return { ...s, date: sessionDate, activity: s.sessionType || activeCoachPlan.discipline };
        })
        .filter(Boolean);
      return {
        upcomingSessions: sessions.sort((a: any, b: any) => a.date.getTime() - b.date.getTime()),
        activePlanName: activeCoachPlan.discipline,
        hasActivePlan: true,
        isCoachPlan: true,
        activePlanId: activeCoachPlan.id,
      };
    }

    // Fallback to manual plan from profile
    if (profile?.workoutPlan?.schedule) {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const sessions = profile.workoutPlan.schedule.map(s => {
        const sessionDate = addDays(weekStart, s.day - 1);
        if (sessionDate >= today) {
          return { ...s, date: sessionDate, isRest: s.isRestDay };
        }
        return null;
      }).filter(Boolean);
      return {
        upcomingSessions: sessions.sort((a: any, b: any) => a.date.getTime() - b.date.getTime()),
        activePlanName: profile.workoutPlan.name,
        hasActivePlan: true,
        isCoachPlan: false,
        activePlanId: null,
      };
    }

    return { upcomingSessions: [], activePlanName: null, hasActivePlan: false, isCoachPlan: false, activePlanId: null };
  }, [profile, coachPlans]);

  const activeCoachPlanMeta = useMemo(() => {
    if (!isCoachPlan || !activePlanId) return null;
    const plan = coachPlans.find(p => p.id === activePlanId);
    if (!plan) return null;
    const weekNumber =
      (plan.current_schedule as { week_number?: number } | undefined)?.week_number ??
      (typeof plan.current_week === 'number' ? plan.current_week : 1);
    return { planId: plan.id, weekNumber };
  }, [isCoachPlan, activePlanId, coachPlans]);

  const handleCoachSwapExercise = useCallback(
    async (dayName: string, exerciseIndex: number, repl: LibraryExercise) => {
      if (!activeCoachPlanMeta) return;
      setCoachSwapBusy(true);
      try {
        const nameDe = displayCoachExerciseName(
          { name: repl.name, exerciseKey: repl.key },
          locale,
        );
        await api(
          `/api/coach/plans/${activeCoachPlanMeta.planId}/schedules/${activeCoachPlanMeta.weekNumber}/swap-exercise`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              day: dayName,
              exerciseIndex,
              exerciseKey: repl.key,
              name: nameDe,
            }),
          },
        );
        await refetchCoachPlans();
        setCoachSwapToast(`✅ ${t('coach.exercise.replaced')}`);
        window.setTimeout(() => setCoachSwapToast(''), 4500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setCoachSwapToast(`${t('coach.toast.err')}: ${msg}`.trim());
        window.setTimeout(() => setCoachSwapToast(''), 5500);
      } finally {
        setCoachSwapBusy(false);
      }
    },
    [activeCoachPlanMeta, locale, refetchCoachPlans, t],
  );

  const manualViewWeekStartYmd = useMemo(() => {
    const activeCoachPlan = coachPlans.find((p: { type?: string; status?: string }) => p.type === 'workout' && p.status === 'active');
    return manualPlanWeekStartYmd(activeCoachPlan?.current_schedule?.start_date);
  }, [coachPlans]);

  const handleManualPlanSwapExercise = useCallback(
    async (weekStartYmd: string, dayNumber: number, exerciseIndex: number, repl: LibraryExercise) => {
      if (!profile?.workoutPlan?.schedule?.length) return;
      setCoachSwapBusy(true);
      try {
        const nameDe = displayCoachExerciseName(
          { name: repl.name, exerciseKey: repl.key },
          locale,
        );
        const baseDay = profile.workoutPlan.schedule.find(s => s.day === dayNumber);
        const prev = baseDay?.exercises?.[exerciseIndex];
        const swap = {
          exerciseKey: repl.key,
          name: nameDe,
          exerciseCategory: repl.category ?? prev?.exerciseCategory,
          id: prev?.id || globalThis.crypto?.randomUUID?.() || `ex-${Date.now()}`,
        };
        const overrides = pruneManualPlanWeekOverrides(
          upsertManualPlanWeekSwap(
            profile.manualPlanWeekOverrides,
            weekStartYmd,
            dayNumber,
            exerciseIndex,
            swap,
          ),
        );
        await updateProfile({ manualPlanWeekOverrides: overrides } as any);

        setCoachSwapToast(`✅ ${t('coach.exercise.replaced')}`);
        window.setTimeout(() => setCoachSwapToast(''), 4500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setCoachSwapToast(`${t('coach.toast.err')}: ${msg}`.trim());
        window.setTimeout(() => setCoachSwapToast(''), 5500);
      } finally {
        setCoachSwapBusy(false);
      }
    },
    [profile?.workoutPlan, profile?.manualPlanWeekOverrides, locale, updateProfile, t],
  );

  // ── This Week: all 7 days Mon–Sun enriched with plan/free schedule ──────────

  const thisWeekDays = useMemo(() => {
    const activeCoachPlan = coachPlans.find((p: any) => p.type === 'workout' && p.status === 'active');
    const weekStart = weekMondayForWorkoutView(activeCoachPlan?.current_schedule?.start_date);

    return WEEKDAYS.map((name, i) => {
      const date = addDays(weekStart, i);
      const dayNumber = i + 1;

      let planSessions: any[] | null = null;
      let planSession: any | null = null;

      const coachDays = activeCoachPlan?.current_schedule?.schedule
        ? resolveCoachScheduleDayList(activeCoachPlan.current_schedule.schedule)
        : [];
      if (coachDays.length > 0) {
        const startYmd = parseCoachStartYmd(activeCoachPlan.current_schedule?.start_date);
        const rows = coachScheduleRowsForCalendarDate(
          startYmd,
          date,
          coachDays,
        );
        if (rows.length) {
          planSessions = sortCoachSessionsBySlot(
            rows.map((s: any) => ({
              ...s,
              activity: s.sessionType || activeCoachPlan.discipline,
            })),
          );
          planSession = planSessions[0];
        }
      } else if (profile?.workoutPlan?.schedule) {
        const raw = profile.workoutPlan.schedule.find((s: any) => s.day === dayNumber);
        if (raw) {
          const weekStartYmd = toLocalYmd(weekStart);
          planSession = applyManualPlanWeekOverrides(
            { ...raw, isRest: raw.isRestDay },
            dayNumber,
            weekStartYmd,
            profile.manualPlanWeekOverrides,
          );
          planSessions = [planSession];
        }
      }

      return { name, date, dayNumber, planSession, planSessions, weekStartYmd: toLocalYmd(weekStart) };
    });
  }, [coachPlans, profile]);

  const hasManualWeek =
    !!profile?.workoutPlan?.schedule ||
    !!((profile as { freeWorkoutSchedule?: Record<number, unknown> })?.freeWorkoutSchedule &&
      Object.keys((profile as { freeWorkoutSchedule?: Record<number, unknown> }).freeWorkoutSchedule!).length > 0);

  const thisWeekScheduleReady =
    !authLoading && !!profile && (coachPlansReady || hasManualWeek);

  const startCoachSession = useCallback(
    (session: Record<string, unknown>, title: string, sourceKey: string, dateIso?: string) => {
      if (!profile?.uid) return;
      const rawExercises: Exercise[] = coachDayHasWorkoutContent(session)
        ? coachDayToSessionExerciseList(session, locale, profile ?? undefined)
        : [];
      const exercises = prepareExercisesForSession(rawExercises);
      const sessionType = session.sessionType as string | undefined;
      const workoutType: Workout['type'] =
        sessionType === 'Cardio' || sessionType === 'Intervals'
          ? 'Cardio'
          : sessionType === 'Strength'
            ? 'Strength'
            : 'Hybrid';
      beginWorkoutSession({
        name: title,
        type: workoutType,
        date: dateIso ?? new Date().toISOString(),
        exercises,
        isPlanned: true,
        userId: profile.uid,
        sessionSourceKey: sourceKey,
      });
    },
    [profile, locale, beginWorkoutSession],
  );

  const todayPlan = useMemo(() => {
    const today = new Date();
    const day = thisWeekDays.find(d => isSameDay(d.date, today));
    if (!day) return { isRest: true, canStart: false, title: '' as string, primary: null as any, assignedTemplate: null as WorkoutTemplate | null };
    const assignment = (profile as { freeWorkoutSchedule?: Record<number, { type: string; templateId?: string }> })?.freeWorkoutSchedule?.[day.dayNumber] ?? null;
    const sessions = sortCoachSessionsBySlot(
      day.planSessions?.length ? day.planSessions : day.planSession ? [day.planSession] : [],
    );
    const primary = sessions.find((s: { isRest?: boolean }) => !s.isRest) ?? sessions[0];
    const trainCount = sessions.filter((s: { isRest?: boolean; isRestDay?: boolean }) => !(s.isRest || s.isRestDay)).length;
    const isRest = assignment?.type === 'rest' || (sessions.length > 0 && trainCount === 0);
    const assignedTemplate = assignment?.templateId
      ? templates.find(tp => tp.id === assignment.templateId) ?? null
      : null;
    const title = primary
      ? isRest
        ? t('work.day.rest')
        : primary.title || t('work.day.training')
      : assignment?.type === 'rest'
        ? t('work.day.rest')
        : assignedTemplate?.name || null;
    const coachContent = primary && coachDayHasWorkoutContent(primary as Record<string, unknown>);
    const canStart =
      !isRest &&
      !!(
        coachContent ||
        (primary && coachRowHasExercises(primary as Record<string, unknown>)) ||
        assignedTemplate
      );
    return { isRest, canStart, title, primary, assignedTemplate, coachContent };
  }, [thisWeekDays, profile, templates, t]);

  const todayResumeSourceKey = useMemo(() => {
    const todayDay = thisWeekDays.find(d => isSameDay(d.date, new Date()));
    const primary = todayPlan.primary as Record<string, unknown> | undefined;
    if (todayPlan.coachContent && primary && todayDay) {
      return buildCoachSessionSourceKey(todayDay.name, primary, 0);
    }
    if (todayPlan.assignedTemplate) return buildTemplateSourceKey(todayPlan.assignedTemplate.id);
    return todayWorkoutSourceKey();
  }, [thisWeekDays, todayPlan]);

  const todayHasResumeDraft = draftMatchesSourceKey(sessionDraft, todayResumeSourceKey);
  const todayShowResumeCta = todayHasResumeDraft && !barOwnsResume;

  const startTodayWorkout = useCallback(() => {
    if (!profile?.uid) return;
    if (todayHasResumeDraft) {
      const draft = loadSessionDraft();
      if (draftMatchesSourceKey(draft, todayResumeSourceKey) && draft) {
        resumeWorkoutSessionFromDraft(draft);
      }
      return;
    }
    if (!todayPlan.canStart) return;
    const primary = todayPlan.primary as Record<string, unknown> | undefined;
    const todayDay = thisWeekDays.find(d => isSameDay(d.date, new Date()));
    if (todayPlan.coachContent && primary && todayDay) {
      const coachKey = buildCoachSessionSourceKey(todayDay.name, primary, 0);
      openSessionForSourceKey(coachKey, () =>
        startCoachSession(primary, todayPlan.title || t('work.day.training'), coachKey),
      );
      return;
    }
    if (todayPlan.assignedTemplate) {
      const templateKey = buildTemplateSourceKey(todayPlan.assignedTemplate.id);
      openSessionForSourceKey(templateKey, () => {
        beginWorkoutSession({
          name: todayPlan.assignedTemplate!.name,
          type: todayPlan.assignedTemplate!.type,
          date: new Date().toISOString(),
          exercises: prepareExercisesForSession(todayPlan.assignedTemplate!.exercises),
          isPlanned: true,
          userId: profile.uid,
          sessionSourceKey: templateKey,
        });
      });
      return;
    }
    const rawExercises =
      todayPlan.primary?.exercises || todayPlan.assignedTemplate?.exercises || [];
    const exercises = prepareExercisesForSession(rawExercises);
    const sessionType = primary?.sessionType as string | undefined;
    const workoutType: Workout['type'] =
      todayPlan.assignedTemplate?.type ||
      (sessionType === 'Cardio' || sessionType === 'Intervals'
        ? 'Cardio'
        : sessionType === 'Strength'
          ? 'Strength'
          : 'Hybrid');
    openSessionForSourceKey(todayResumeSourceKey, () =>
      beginWorkoutSession({
        name: todayPlan.title || t('work.day.training'),
        type: workoutType,
        date: new Date().toISOString(),
        exercises,
        isPlanned: true,
        userId: profile.uid,
        sessionSourceKey: todayResumeSourceKey,
      }),
    );
  }, [
    todayPlan,
    profile,
    t,
    startCoachSession,
    beginWorkoutSession,
    openSessionForSourceKey,
    thisWeekDays,
    todayResumeSourceKey,
    todayHasResumeDraft,
    resumeWorkoutSessionFromDraft,
  ]);

  useEffect(() => {
    if (coachAutoStart) setView('coach');
  }, [coachAutoStart]);

  // ── Save free-schedule day assignment ──────────────────────────────────────

  const handleDayAssign = async (
    dayName: string,
    assignment: { type: 'rest' | 'template'; templateId?: string; templateName?: string } | null
  ) => {
    const dayIdx = WEEKDAYS.indexOf(dayName as any) + 1;
    const current = (profile as any)?.freeWorkoutSchedule || {};
    await updateProfile({
      freeWorkoutSchedule: { ...current, [dayIdx]: assignment },
    } as any);
    setAssigningDay(null);
  };

  const handleCompleteWorkout = async (session: Partial<Workout>) => {
    const sessionData = {
      ...session,
      caloriesBurned: session.caloriesBurned ?? estimateWorkoutCalories(session),
      userId: profile?.uid,
      completedAt: new Date().toISOString(),
    } as any;

    const workoutId = await addWorkout(sessionData);
    setCompletedWorkout({ ...sessionData, id: workoutId });
    clearSessionDraft();
    endWorkoutSession();
  };

  const handleCopyWorkoutShare = async () => {
    if (!completedWorkout) return;
    const text = buildWorkoutShareText(completedWorkout, locale === 'de' ? 'de' : 'en');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const handleSpontaneousSave = async (payload: {
    name: string;
    type: Workout['type'];
    duration: number;
    caloriesBurned: number;
    date: string;
  }) => {
    const sessionData = {
      name: payload.name,
      type: payload.type,
      subtype: 'spontaneous',
      duration: payload.duration,
      caloriesBurned: payload.caloriesBurned,
      date: payload.date,
      exercises: [] as Workout['exercises'],
      userId: profile?.uid,
      completedAt: new Date().toISOString(),
    } as any;
    const workoutId = await addWorkout(sessionData);
    setCompletedWorkout({ ...sessionData, id: workoutId });
  };

  const handlePostToFeed = async () => {
    if (!completedWorkout || isPosting) return;
    setIsPosting(true);
    try {
      const content = t('work.feedPost', {
        name: String(completedWorkout.name || t('work.day.training')),
        duration: completedWorkout.duration ?? 0,
        kcal: completedWorkout.caloriesBurned ?? 0,
      });
      await createPost(content, undefined, 'workout', completedWorkout.id);
      setCompletedWorkout(null);
    } catch (error) {
       console.error(error);
    } finally {
      setIsPosting(false);
    }
  };

  const startPlannedWorkout = (session: PlannedSession & { date: Date }) => {
    beginWorkoutSession({
      name: session.title,
      type: 'Strength',
      date: new Date().toISOString(),
      exercises: prepareExercisesForSession(session.exercises),
      isPlanned: true,
      userId: profile?.uid || '',
    });
  };

  type WeekDayRow = (typeof thisWeekDays)[number];

  const toggleSessionExpand = useCallback((key: string) => {
    setExpandedSessionKey(prev => (prev === key ? null : key));
  }, []);

  const renderThisWeekDayRow = (day: WeekDayRow) => {
    const assignment = (profile as any)?.freeWorkoutSchedule?.[day.dayNumber] ?? null;
    const sessions = sortCoachSessionsBySlot(
      day.planSessions?.length ? day.planSessions : day.planSession ? [day.planSession] : [],
    );
    const trainingSessions = coachDayGroupTrainingSessions(sessions);
    const primary = trainingSessions[0] ?? sessions[0];
    const isRest = assignment?.type === 'rest' || (sessions.length > 0 && trainingSessions.length === 0);
    const isToday = isSameDay(day.date, new Date());
    const canStartDay = !isAfter(startOfDay(day.date), startOfDay(new Date()));
    const isCatchUp = canStartDay && !isToday;
    const isFreeMode = !hasActivePlan;
    const assignedTemplate = assignment?.templateId
      ? templates.find(tp => tp.id === assignment.templateId) ?? null
      : null;

    const chipSessions: Record<string, unknown>[] = trainingSessions.length
      ? (trainingSessions as Record<string, unknown>[])
      : assignedTemplate
        ? [
            {
              title: assignedTemplate.name,
              sessionType: assignedTemplate.type,
              exercises: assignedTemplate.exercises,
              day: day.name,
            },
          ]
        : primary && !primary.isRest
          ? [primary as Record<string, unknown>]
          : [];

    const fromManualWeekPlan =
      !isCoachPlan &&
      Boolean(profile?.workoutPlan?.schedule?.length) &&
      Boolean(day.planSession) &&
      !(day.planSession as { isRest?: boolean; isRestDay?: boolean }).isRest &&
      !(day.planSession as { isRestDay?: boolean }).isRestDay &&
      coachRowHasExercises(day.planSession as Record<string, unknown>) &&
      !assignedTemplate;

    const exerciseSwapEnabled = Boolean(isCoachPlan && activeCoachPlanMeta) || fromManualWeekPlan;

    const renderSessionChip = (
      sess: Record<string, unknown>,
      si: number,
      sourceKey: string | null,
      startFresh?: () => void,
    ) => {
      const key = coachSessionExpandKey(day.name, sess, si);
      const isResume = Boolean(sourceKey && draftMatchesSourceKey(sessionDraft, sourceKey));
      /** Eine Primary-Resume: Bar > Today-CTA > Chip */
      const chipShowsStart =
        canStartDay &&
        sourceKey &&
        startFresh &&
        !(isResume && barOwnsResume) &&
        !(isResume && todayShowResumeCta && sourceKey === todayResumeSourceKey);
      const onStart = chipShowsStart
        ? () => openSessionForSourceKey(sourceKey, startFresh)
        : undefined;
      return (
        <CoachWeekSessionChip
          key={key}
          session={sess}
          t={t}
          expanded={expandedSessionKey === key}
          onExpand={() => toggleSessionExpand(key)}
          isToday={isToday}
          startMode={isResume && onStart ? 'resume' : 'start'}
          onStart={onStart}
        >
          <CoachSessionDetailContent
            session={sess}
            locale={locale}
            t={t}
            preview={!exerciseSwapEnabled}
            dayName={day.name}
            templateBusy={coachSwapBusy}
            onOpenExercise={payload => openExerciseDetail(payload)}
            onOpenSwapPicker={
              exerciseSwapEnabled
                ? payload =>
                    openExerciseSwap({
                      exerciseKey: payload.exerciseKey,
                      name: payload.name,
                      onSwap: payload.onSwap,
                    })
                : undefined
            }
            onSwapExercise={
              isCoachPlan && activeCoachPlanMeta
                ? handleCoachSwapExercise
                : fromManualWeekPlan
                  ? (_dayName, exerciseIndex, repl) =>
                      void handleManualPlanSwapExercise(
                        day.weekStartYmd ?? manualViewWeekStartYmd,
                        day.dayNumber,
                        exerciseIndex,
                        repl,
                      )
                  : undefined
            }
          />
        </CoachWeekSessionChip>
      );
    };

    return (
      <motion.div
        key={day.name}
        initial={false}
        className={cn(
          'p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 transition-all',
          isRest
            ? 'bg-[var(--background)] border-dashed border-[var(--border-muted)] opacity-55 grayscale-[0.4]'
            : 'bg-[var(--card-bg)] border-[var(--border-muted)]',
          isToday && !isRest && 'border-brand shadow-lg shadow-brand/10',
          isToday && isRest && 'ring-1 ring-brand/30',
        )}
      >
        <div className="flex items-start gap-3 sm:gap-4 flex-shrink-0">
          <div className="text-center w-11 sm:w-12 flex-shrink-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {format(day.date, 'EEE', { locale: dfLoc })}
            </p>
            <p className={cn('text-xl sm:text-2xl font-black italic leading-none', isToday && 'text-brand')}>
              {format(day.date, 'dd')}
            </p>
          </div>
          {isToday && (
            <span className="text-[8px] font-black uppercase tracking-widest ui-btn-brand px-2 py-0.5 rounded-full h-fit">
              {t('work.day.today')}
            </span>
          )}
          {isCatchUp && (
            <span className="text-[8px] font-black uppercase tracking-widest border border-brand/40 text-brand px-2 py-0.5 rounded-full h-fit">
              {t('coach.day.catchUp')}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {isRest ? (
            <p className="text-sm font-black uppercase tracking-tight text-[var(--text-muted)] py-1">
              {t('work.day.rest')}
            </p>
          ) : chipSessions.length > 0 ? (
            chipSessions.map((sess, si) => {
              const sourceKey = buildCoachSessionSourceKey(day.name, sess, si);
              const title = String(
                sess.title || formatCoachSessionType(String(sess.sessionType || ''), t),
              );
              let startFresh: (() => void) | undefined;
              const dayIso = day.date.toISOString();
              if (canStartDay && coachDayHasWorkoutContent(sess)) {
                startFresh = () => startCoachSession(sess, title, sourceKey, dayIso);
              } else if (canStartDay && coachRowHasExercises(sess)) {
                startFresh = () =>
                  startCoachSession(sess, String(sess.title || t('work.day.training')), sourceKey, dayIso);
              } else if (canStartDay && assignedTemplate && si === 0) {
                const templateKey = buildTemplateSourceKey(assignedTemplate.id);
                startFresh = () =>
                  beginWorkoutSession({
                    name: assignedTemplate.name,
                    type: assignedTemplate.type,
                    date: dayIso,
                    exercises: prepareExercisesForSession(assignedTemplate.exercises),
                    isPlanned: true,
                    userId: profile?.uid || '',
                    sessionSourceKey: templateKey,
                  });
              } else if (canStartDay && primary && si === 0) {
                startFresh = () => {
                  const primaryExercises = (primary as { exercises?: Exercise[] }).exercises;
                  const exercises = prepareExercisesForSession(
                    Array.isArray(primaryExercises) ? primaryExercises : [],
                  );
                  beginWorkoutSession({
                    name: String(primary.title || t('work.day.training')),
                    type: 'Strength',
                    date: dayIso,
                    exercises,
                    isPlanned: true,
                    userId: profile?.uid || '',
                    sessionSourceKey: sourceKey,
                  });
                };
              }
              return renderSessionChip(
                sess,
                si,
                startFresh ? (assignedTemplate && si === 0 ? buildTemplateSourceKey(assignedTemplate.id) : sourceKey) : null,
                startFresh,
              );
            })
          ) : isFreeMode ? (
            <button
              type="button"
              onClick={() => setAssigningDay({ name: day.name, date: day.date })}
              className="text-left text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-brand py-2 border border-dashed border-[var(--border-muted)] rounded-xl px-3 py-3 w-full"
            >
              {t('work.day.assign')}
            </button>
          ) : null}

          {isCoachPlan && activePlanId && primary?.day && !isRest ? (
            <button
              type="button"
              onClick={() => {
                setDeepLinkToCoach({ planId: activePlanId, day: String(primary.day) });
                setView('coach');
              }}
              className="text-[9px] font-black uppercase tracking-widest text-brand hover:underline flex items-center gap-0.5 w-fit"
            >
              {t('work.plan.viewCoach')} <ChevronRight size={11} />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 sm:flex-col sm:items-end">
          {canStartDay && !isRest && (
            <button
              type="button"
              title={t('work.extra.tooltip')}
              onClick={() => setSpontaneousLogForDate(day.date)}
              className={cn(
                'px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all min-h-[44px]',
                'bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)] hover:border-brand hover:bg-brand/5',
              )}
            >
              <Plus size={13} />
              <span className="sm:hidden">{t('work.extra.short')}</span>
            </button>
          )}
          {isFreeMode && (
            <button
              type="button"
              onClick={() => setAssigningDay({ name: day.name, date: day.date })}
              className="p-2 text-[var(--text-muted)] hover:text-brand rounded-xl hover:bg-[var(--background)] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={t('work.day.assign')}
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  if (bootstrapLoading) {
    return <PageBootstrap label={t('work.loading')} />;
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
    <div className="relative isolate overflow-x-hidden space-y-8 pb-6">
      <AnimatePresence>
        {activeSession && (
          <WorkoutSessionPlayer
            key={activeSession.sessionInstanceId ?? 'session'}
            workout={activeSession}
            onComplete={handleCompleteWorkout}
            onCancel={() => {
              endWorkoutSession();
            }}
          />
        )}

        <WorkoutCompleteSummaryModal
          open={!!completedWorkout}
          workout={completedWorkout ?? {}}
          priorWorkouts={priorWorkoutsForSummary}
          onClose={() => setCompletedWorkout(null)}
          onShareFeed={() => void handlePostToFeed()}
          onCopyShare={() => void handleCopyWorkoutShare()}
          isPosting={isPosting}
        />
      </AnimatePresence>
      <div className="flex flex-col gap-6 md:gap-8">
      <RecoverSessionDraftBanner />
      <header className="flex flex-col gap-4 w-full">
        <div className="min-w-0 w-full">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
            {t('work.header.title')}
          </h2>
          <p className="text-[var(--text-muted)] font-medium tracking-tight uppercase text-[10px] tracking-[0.2em] mt-1">
            {format(new Date(), 'PPPP', { locale: dfLoc })}
          </p>
        </div>

        {!(todayHasResumeDraft && barOwnsResume) ? (
        <button
          type="button"
          disabled={(!todayPlan.canStart && !todayShowResumeCta) || !!activeSession}
          onClick={startTodayWorkout}
          className={cn(
            'w-full min-h-[52px] px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 touch-manipulation transition-all',
            (todayPlan.canStart || todayShowResumeCta) && !activeSession
              ? todayShowResumeCta
                ? 'border-2 border-brand bg-brand/10 text-brand hover:bg-brand/15 active:scale-[0.99]'
                : 'ui-btn-brand !shadow-none hover:scale-[1.01] active:scale-[0.99]'
              : 'bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-muted)] cursor-not-allowed opacity-80',
          )}
        >
          {todayShowResumeCta ? <RotateCcw size={16} /> : <PlayCircle size={16} />}
          {todayShowResumeCta
            ? t('work.today.resume')
            : todayPlan.canStart
              ? t('work.today.start')
              : t('work.today.rest')}
        </button>
        ) : null}

        {lastCompletedWorkout && !activeSession && (
          <button
            type="button"
            onClick={startRepeatLastWorkout}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-brand/30 bg-brand/5 text-brand flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest hover:bg-brand/10 transition-all touch-manipulation"
          >
            <RotateCcw size={14} />
            {t('work.repeat.title')}
          </button>
        )}
      </header>

      <PageTabGrid
        tabs={[
          { id: 'thisweek', label: t('work.tab.thisWeek'), icon: Dumbbell },
          { id: 'history', label: t('work.tab.history'), icon: Activity },
          { id: 'templates', label: t('work.tab.templates'), icon: Settings },
          {
            id: 'coach',
            label: t('work.tab.coach'),
            icon: Brain,
            disabled: coachTabDisabled,
            disabledTitle: t('work.ai.notConfigured'),
          },
        ]}
        activeId={view}
        onChange={id => setView(id as typeof view)}
      />
      </div>

      {view === 'thisweek' && (
        <div className="space-y-4">
          {coachSwapToast ? (
            <p
              className={cn(
                'rounded-xl px-4 py-3 text-sm font-bold',
                coachSwapToast.startsWith('✅')
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}
            >
              {coachSwapToast}
            </p>
          ) : null}
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              {isCoachPlan && (
                <div className="flex items-center gap-2">
                  <Brain size={14} className="text-brand" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-brand">
                    {t('work.plan.aiCoach', { plan: activePlanName?.replace(/_/g, ' ') ?? '—' })}
                  </p>
                  <button type="button" onClick={() => setView('coach')} className="ml-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-brand flex items-center gap-0.5">
                    {t('work.plan.viewCoach')} <ChevronRight size={11} />
                  </button>
                </div>
              )}
              {!isCoachPlan && hasActivePlan && (
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {t('work.plan.manual', { name: activePlanName ?? '—' })}
                </p>
              )}
              {!hasActivePlan && (
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {t('work.plan.freeSchedule')}
                </p>
              )}
            </div>
            {!hasActivePlan && (
              <button
                type="button"
                title={
                  !aiCaps.loading && !aiCaps.enabled
                    ? t('work.ai.notConfigured')
                    : undefined
                }
                onClick={() => aiCaps.enabled && setView('coach')}
                disabled={aiCaps.loading || !aiCaps.enabled}
                className={cn(
                  'text-[9px] font-black uppercase tracking-widest text-brand hover:underline flex items-center gap-1',
                  (!aiCaps.enabled || aiCaps.loading) && 'opacity-40 cursor-not-allowed hover:no-underline',
                )}
              >
                <Brain size={12} /> {t('work.ai.getPlan')}
              </button>
            )}
          </div>

          {thisWeekScheduleReady && hasActivePlan && (
            <CoachWeekTypeLegend
              strengthLabel={t('work.type.strength')}
              cardioLabel={t('work.type.cardio')}
              className="px-1 pb-1"
            />
          )}

          {/* Week days — immer Montag → Sonntag (auch mobil) */}
          {!thisWeekScheduleReady ? (
            <div className="space-y-4">
              {WEEKDAYS.map(name => (
                <div
                  key={name}
                  className="h-[88px] rounded-2xl bg-[var(--background)] border border-[var(--border-muted)] animate-pulse"
                  aria-hidden
                />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-4">{thisWeekDays.map(renderThisWeekDayRow)}</div>
            </>
          )}
        </div>
      )}

      {view === 'history' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workouts.length === 0 ? (
            <div className="col-span-full py-24 text-center bg-[var(--card-bg)] rounded-[2.5rem] border border-dashed border-[var(--border-muted)]">
              <Dumbbell className="mx-auto text-[var(--text-muted)] opacity-30 mb-4" size={48} />
              <p className="text-[var(--text-muted)] font-bold uppercase tracking-widest text-xs">{t('work.history.empty')}</p>
            </div>
          ) : (
            workouts.map((workout) => (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--card-bg)] p-8 rounded-3xl border border-[var(--border-muted)] shadow-sm relative group hover:border-brand transition-all flex flex-col justify-between"
              >
                <button 
                  onClick={() => deleteWorkout(workout.id)}
                  className="absolute top-5 right-5 sm:top-6 sm:right-6 p-2 text-[var(--text-muted)] hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all min-h-[44px] min-w-[44px]"
                  type="button"
                  aria-label={t('work.history.deleteAria')}
                >
                  <Trash2 size={16} />
                </button>
                
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-[0.2em] text-[var(--text-muted)] mb-1">
                        {workoutTypeUi(t, workout.type)} • {format(new Date(workout.date), 'd. MMM yyyy', { locale: dfLoc })}
                      </p>
                      <h4 className="text-lg font-bold uppercase tracking-tight text-[var(--text-primary)]">{workout.name}</h4>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center text-[var(--text-muted)]">
                      {workout.type === 'Cardio' ? <Zap size={18} /> : <Dumbbell size={18} />}
                    </div>
                  </div>

                  <div className="flex gap-8">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-[var(--text-muted)]" />
                      <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">{workout.duration}m</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flame size={14} className="text-[var(--text-muted)]" />
                      <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
                        {workout.caloriesBurned} {t('dash.unit.kcal')}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {view === 'templates' && (
        <div className="space-y-10">
          {/* Plan Templates */}
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter">{t('work.tpl.plansTitle')}</h3>
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{t('work.tpl.plansSub')}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate({ name: '', type: 'Strength', exercises: [], userId: profile?.uid || '', templateMode: 'plan' })}
                className="flex items-center justify-center gap-2 ui-btn-brand px-4 py-2.5 text-[10px] shrink-0">
                <Plus size={14} /> {t('work.tpl.newPlan')}
              </button>
            </div>

            {templates.filter(tpl => tpl.templateMode === 'plan').length === 0 ? (
              <div className="bg-[var(--card-bg)] border-2 border-dashed border-[var(--border-muted)] rounded-[2rem] p-10 text-center">
                <Calendar size={32} className="mx-auto text-[var(--text-muted)] opacity-30 mb-3" />
                <p className="text-xs font-black uppercase text-[var(--text-muted)]">{t('work.tpl.noPlans')}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('work.tpl.noPlansHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.filter(tpl => tpl.templateMode === 'plan').map(template => {
                  const trainingDays = template.weekPlan?.filter(d => !d.isRest).length ?? 0;
                  const isActivePlan = profile?.workoutPlan?.name === template.name;
                  return (
                    <motion.div key={template.id}
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className={cn("bg-[var(--card-bg)] p-6 rounded-[2rem] border flex flex-col justify-between group shadow-sm relative",
                        isActivePlan ? "border-brand" : "border-[var(--border-muted)] hover:border-brand transition-all")}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-white",
                            template.type === 'Strength' ? "bg-blue-500" : template.type === 'Cardio' ? "bg-orange-500" : "bg-teal-500")}>
                            {template.type === 'Strength' ? <Dumbbell size={18} /> : template.type === 'Cardio' ? <Zap size={18} /> : <Activity size={18} />}
                          </div>
                          <div>
                            <h4 className="text-base font-black italic uppercase tracking-tight">{template.name}</h4>
                            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                              {t('work.tpl.perWeek', { n: trainingDays, type: workoutTypeUi(t, template.type) })}
                            </p>
                          </div>
                        </div>
                        {isActivePlan && (
                          <span className="text-[8px] font-black uppercase tracking-widest bg-green-100 text-green-700 px-2 py-1 rounded-full">{t('work.tpl.activePill')}</span>
                        )}
                      </div>

                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!template.weekPlan) return;
                            const schedule = template.weekPlan
                              .filter(d => !d.isRest)
                              .map((d, i) => ({
                                day: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(d.day) + 1,
                                title: d.name || d.day,
                                activity: d.type || template.type,
                                exercises: d.exercises,
                                isRestDay: false,
                              }));
                            await updateProfile({ workoutPlan: { name: template.name, schedule } } as any);
                          }}
                          className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all",
                            isActivePlan
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "ui-btn-brand hover:scale-105 shadow-lg shadow-brand/20")}>
                          <PlayCircle size={14} /> {isActivePlan ? t('work.tpl.activePill') : t('work.tpl.activate')}
                        </button>
                        <button
                          type="button"
                          title={t('tpl.exportCsvTitle')}
                          onClick={() =>
                            downloadCsv(
                              `${template.name.replace(/[^\w\-]+/g, '_')}.csv`,
                              workoutTemplateToCsv(template)
                            )
                          }
                          className="p-3 text-[var(--text-muted)] hover:text-brand hover:bg-brand/10 rounded-xl transition-all"
                        >
                          <Download size={15} />
                        </button>
                        <button onClick={() => setEditingTemplate(template)}
                          className="p-3 text-[var(--text-muted)] hover:text-brand hover:bg-brand/10 rounded-xl transition-all">
                          <Settings size={15} />
                        </button>
                        <button onClick={() => deleteTemplate(template.id)}
                          className="p-3 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Single Workout Templates */}
          <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter">{t('work.tpl.workoutsTitle')}</h3>
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{t('work.tpl.workoutsSub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  title={
                    !aiCaps.loading && !aiCaps.enabled
                      ? t('work.ai.notConfigured')
                      : undefined
                  }
                  onClick={() => aiCaps.enabled && setShowAIGenerator(true)}
                  disabled={aiCaps.loading || !aiCaps.enabled}
                  className={cn(
                    'flex items-center gap-2 ui-btn-brand px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand/20',
                    (!aiCaps.enabled || aiCaps.loading) && 'opacity-40 cursor-not-allowed hover:scale-100',
                  )}
                >
                  <Wand2 size={14} /> {t('work.tpl.aiGen')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTemplate({ name: '', type: 'Strength', exercises: [], userId: profile?.uid || '', templateMode: 'workout' })}
                  className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border-muted)] text-[var(--text-primary)] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand hover:text-brand transition-all">
                  <Plus size={14} /> {t('work.tpl.manual')}
                </button>
              </div>
            </div>

            {singleWorkoutTemplates.length === 0 ? (
              <div className="bg-[var(--card-bg)] border-2 border-dashed border-[var(--border-muted)] rounded-[2rem] p-8 text-center">
                <Dumbbell size={28} className="mx-auto text-[var(--text-muted)] opacity-30 mb-2" />
                <p className="text-xs font-black uppercase text-[var(--text-muted)]">{t('work.tpl.noWorkouts')}</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] px-1">
                    {t('work.tpl.sectionStrength')}
                  </p>
                  {strengthWorkoutTemplates.length === 0 ? (
                    <p className="text-xs font-black uppercase text-[var(--text-muted)] px-1">{t('work.tpl.noStrength')}</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {strengthWorkoutTemplates.map(template => (
                        <motion.div key={template.id}
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          className="bg-[var(--card-bg)] p-6 rounded-[2rem] border border-[var(--border-muted)] flex flex-col justify-between group hover:border-brand transition-all shadow-sm relative">
                          <button type="button" onClick={() => setEditingTemplate(template)}
                            className="absolute top-5 right-5 p-2 text-[var(--text-muted)] hover:text-brand transition-colors">
                            <Settings size={15} />
                          </button>

                          <div>
                            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm text-white",
                              template.type === 'Strength' ? "bg-blue-500" : template.type === 'Cardio' ? "bg-orange-500" : "bg-teal-500")}>
                              {template.type === 'Strength' ? <Dumbbell size={18} /> : template.type === 'Cardio' ? <Zap size={18} /> : <Activity size={18} />}
                            </div>
                            <h4 className="text-base font-black italic uppercase tracking-tight mb-1">{template.name}</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2 py-1 rounded-md">{workoutTypeUi(t, template.type)}</span>
                              <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{t('work.tpl.units', { n: template.exercises.length })}</span>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-6">
                            <button
                              type="button"
                              onClick={() => {
                                const templateKey = buildTemplateSourceKey(template.id);
                                openSessionForSourceKey(templateKey, () =>
                                  beginWorkoutSession({
                                    ...template,
                                    exercises: prepareExercisesForSession(template.exercises),
                                    date: new Date().toISOString(),
                                    sessionSourceKey: templateKey,
                                  }),
                                );
                              }}
                              className="flex-1 py-3 ui-btn-brand rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-brand/20">
                              {t('work.tpl.logNow')}
                            </button>
                            <button
                              type="button"
                              title={t('tpl.exportCsvTitle')}
                              onClick={() =>
                                downloadCsv(
                                  `${template.name.replace(/[^\w\-]+/g, '_')}.csv`,
                                  workoutTemplateToCsv(template)
                                )
                              }
                              className="p-3 text-[var(--text-muted)] hover:text-brand hover:bg-brand/10 rounded-xl transition-all"
                            >
                              <Download size={15} />
                            </button>
                            <button onClick={() => deleteTemplate(template.id)}
                              className="p-3 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] px-1">
                    {t('work.tpl.sectionCardio')}
                  </p>
                  {cardioWorkoutTemplates.length === 0 ? (
                    <p className="text-xs font-black uppercase text-[var(--text-muted)] px-1">{t('work.tpl.noCardio')}</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {cardioWorkoutTemplates.map(template => (
                        <motion.div key={template.id}
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          className="bg-[var(--card-bg)] p-6 rounded-[2rem] border border-[var(--border-muted)] flex flex-col justify-between group hover:border-brand transition-all shadow-sm relative">
                          <button type="button" onClick={() => setEditingTemplate(template)}
                            className="absolute top-5 right-5 p-2 text-[var(--text-muted)] hover:text-brand transition-colors">
                            <Settings size={15} />
                          </button>

                          <div>
                            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm text-white bg-orange-500">
                              <Zap size={18} />
                            </div>
                            <h4 className="text-base font-black italic uppercase tracking-tight mb-1">{template.name}</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2 py-1 rounded-md">{workoutTypeUi(t, template.type)}</span>
                              <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{t('work.tpl.units', { n: template.exercises.length })}</span>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-6">
                            <button
                              type="button"
                              onClick={() => {
                                const templateKey = buildTemplateSourceKey(template.id);
                                openSessionForSourceKey(templateKey, () =>
                                  beginWorkoutSession({
                                    ...template,
                                    exercises: prepareExercisesForSession(template.exercises),
                                    date: new Date().toISOString(),
                                    sessionSourceKey: templateKey,
                                  }),
                                );
                              }}
                              className="flex-1 py-3 ui-btn-brand rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-brand/20">
                              {t('work.tpl.logNow')}
                            </button>
                            <button
                              type="button"
                              title={t('tpl.exportCsvTitle')}
                              onClick={() =>
                                downloadCsv(
                                  `${template.name.replace(/[^\w\-]+/g, '_')}.csv`,
                                  workoutTemplateToCsv(template)
                                )
                              }
                              className="p-3 text-[var(--text-muted)] hover:text-brand hover:bg-brand/10 rounded-xl transition-all"
                            >
                              <Download size={15} />
                            </button>
                            <button onClick={() => deleteTemplate(template.id)}
                              className="p-3 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {editingTemplate && (
              <WorkoutTemplateEditor
                template={editingTemplate}
                onSave={async (data) => {
                  if (data.id) {
                    const { id, userId, ...updateData } = data as any;
                    await updateTemplate(id, updateData);
                  } else {
                    await addTemplate(data as Omit<WorkoutTemplate, 'id'>);
                  }
                  setEditingTemplate(null);
                }}
                onClose={() => setEditingTemplate(null)}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {view === 'coach' && (
        <CoachPage
          planType="workout"
          deepLink={deepLinkToCoach}
          autoStartOnboarding={coachAutoStart}
        />
      )}

      {/* ── AI Template Generator Modal ── */}
      <AnimatePresence>
        {showAIGenerator && (
          <AITemplateGeneratorModal
            onClose={() => setShowAIGenerator(false)}
            onSave={addTemplate}
            userId={profile?.uid || ''}
          />
        )}
      </AnimatePresence>

      {/* ── Day Assignment Modal ── */}
      <AnimatePresence>
        {assigningDay && (
          <DayAssignModal
            dayDate={assigningDay.date}
            templates={templates}
            onAssign={(assignment) => handleDayAssign(assigningDay.name, assignment)}
            onClose={() => setAssigningDay(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spontaneousLogForDate && (
          <SpontaneousWorkoutModal
            logDate={spontaneousLogForDate}
            onClose={() => setSpontaneousLogForDate(null)}
            onSave={handleSpontaneousSave}
          />
        )}
      </AnimatePresence>

      <MobileOverlayRoot open={draftConflict != null}>
        <div className={mobileSheetOverlayClass()}>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="absolute inset-0 bg-black/60"
            onClick={() => setDraftConflict(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-t-[1.75rem] lg:rounded-[1.75rem] border border-[var(--border-muted)] bg-[var(--card-bg)] p-6 sm:p-8 space-y-4"
          >
            <h3 className="text-lg font-black italic uppercase tracking-tighter">
              {t('work.draftConflict.title')}
            </h3>
            <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">
              {t('work.draftConflict.body', { name: draftConflict?.draftName ?? '' })}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                className="min-h-[48px] rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
                onClick={() => {
                  setDraftConflict(null);
                  const draft = loadSessionDraft();
                  if (hasResumableSessionDraft(draft) && draft) {
                    resumeWorkoutSessionFromDraft(draft);
                  }
                }}
              >
                {t('work.draftConflict.resume')}
              </button>
              <button
                type="button"
                className="min-h-[48px] rounded-xl border-2 border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 text-[10px] font-black uppercase tracking-widest"
                onClick={() => {
                  const next = draftConflict?.proceed;
                  clearSessionDraft();
                  unregisterActiveSession();
                  setDraftConflict(null);
                  next?.();
                }}
              >
                {t('work.draftConflict.discardStart')}
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"
                onClick={() => setDraftConflict(null)}
              >
                {t('profile.cancel')}
              </button>
            </div>
          </div>
        </div>
      </MobileOverlayRoot>

    </div>
  );
}
