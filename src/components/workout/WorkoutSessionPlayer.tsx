import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Check,
  Timer,
  X,
  Plus,
  LayoutList,
  Bell,
  Trophy,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Link2,
  Trash2,
  Scale,
  Pencil,
  ListOrdered,
  TrendingUp,
  Info,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Exercise, SetDetail, Workout } from '@/src/types';
import { useAuth } from '@/src/lib/AuthContext';
import { useWorkouts } from '@/src/lib/useWorkouts';
import {
  formatRestSeconds,
  getExerciseRestSeconds,
  setExerciseRestInProfile,
} from '@/src/lib/exerciseRestPreferences';
import { getLastSessionHint, getPersonalRecordKg } from '@/src/lib/fitnessInsights';
import { getLibraryExercise, type LibraryExercise } from '@/src/lib/exerciseLibrary';
import { prepareExercisesForSession } from '@/src/lib/sessionExercisePrep';
import {
  buildSessionDraftFromWorkout,
  clearSessionDraft,
  fetchSessionDraftFromServer,
  loadSessionDraft,
  pushSessionDraftToServer,
  saveSessionDraft,
} from '@/src/lib/sessionDraft';
import { suggestSetForExercise, isDeloadWeek } from '@/src/lib/progressiveOverload';
import { isExerciseDbCatalogKey } from '@/src/lib/exerciseDb';
import { fetchExerciseById } from '@/src/services/exerciseDbService';
import { useLocalExerciseLibrary } from '@/src/lib/exercisePool';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import { exerciseSupportsGpsTracking, isDistanceCardioExercise } from '@/src/lib/gpsCardio';
import { estimateWorkoutCalories } from '@/src/lib/workoutAnalytics';
import {
  displayWeight,
  getWeightUnit,
  inputToKg,
  plateCalcBarPlusPlates,
  setWeightUnit,
  type WeightUnit,
} from '@/src/lib/workoutPreferences';
import {
  buildSessionDisplayItems,
  exerciseIsFullyCompleted,
  findNextExerciseIndex,
  getRailExerciseIndices,
  inputId,
  isBlockMetaExercise,
  isCircuitBlock,
  nextSupersetFocus,
  normalizeSetType,
  sanitizeExercisesForSave,
  supersetRoundComplete,
  type SessionDisplayItem,
} from '@/src/lib/workoutSessionUtils';
import SessionExerciseRail from '@/src/components/workout/session/SessionExerciseRail';
import ExercisePaletteModal from '@/src/components/workout/ExercisePaletteModal';
import SessionCircuitPanel from '@/src/components/workout/session/SessionCircuitPanel';
import SessionEmomPanel from '@/src/components/workout/session/SessionEmomPanel';
import CardioGpsPanel from '@/src/components/workout/session/CardioGpsPanel';
import CardioSessionFeedbackModal from '@/src/components/workout/session/CardioSessionFeedbackModal';
import {
  enrichExercisesForLiveSession,
  formatPrescriptionHint,
  isBodyweightDefault,
  isBodyweightExercise,
  normalizeSetWeightKg,
  prescriptionPlaceholder,
} from '@/src/lib/sessionPrescription';
import type { CardioSessionFeedback } from '@/src/types';
import SessionLiveEditor from '@/src/components/workout/session/SessionLiveEditor';
import MobilityTimerPanel from '@/src/components/workout/session/MobilityTimerPanel';
import SetTypePickerSheet from '@/src/components/workout/session/SetTypePickerSheet';
import { useI18n } from '@/src/lib/i18n';
import { playRestTimerDone } from '@/src/lib/workoutRestBeep';
import { finalizeExerciseForLiveSession } from '@/src/lib/coachSessionSets';
import { buildSwappedExercise } from '@/src/lib/exerciseLibrarySwap';
import { resetMobileChromeAfterOverlay, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

function resolveSessionCategory(ex: Exercise): 'strength' | 'cardio' {
  if (ex.exerciseCategory) return ex.exerciseCategory;
  const lib = ex.exerciseKey ? getLibraryExercise(ex.exerciseKey) : undefined;
  return lib?.category ?? 'strength';
}

function initExerciseFromTemplate(ex: Exercise): Exercise {
  const id = ex.id || Math.random().toString(36).substring(7);
  const typeFallback = normalizeSetType(ex.setType);

  if (isBlockMetaExercise(ex)) {
    return { ...ex, id, setType: typeFallback, sets: [{ reps: 1, weight: 0, completed: false, type: typeFallback }] };
  }

  const setsArr = ex.sets;
  if (Array.isArray(setsArr) && setsArr.length > 0 && typeof setsArr[0] === 'object' && setsArr[0] != null && 'reps' in setsArr[0]) {
    return {
      ...ex,
      id,
      setType: typeFallback,
      sets: (setsArr as SetDetail[]).map(s => ({
        ...s,
        completed: false,
        type: normalizeSetType(s.type || typeFallback),
      })),
    };
  }

  if (resolveSessionCategory(ex) === 'cardio') {
    const n = typeof ex.sets === 'number' ? Math.max(1, ex.sets) : 1;
    const durMin =
      ex.durationSec != null && ex.durationSec > 0
        ? Math.round(ex.durationSec / 60)
        : Math.max(1, ex.reps || 1);
    return {
      ...ex,
      id,
      setType: typeFallback,
      sets: Array.from({ length: n }, () => ({
        reps: durMin,
        weight: ex.distanceKm ?? 0,
        completed: false,
        type: typeFallback,
      })),
    };
  }

  const n = typeof ex.sets === 'number' ? ex.sets : ex.coachPrescription?.targetSets ?? 3;
  const coach = ex.coachPrescription;
  const templateEx = { ...ex, coachPrescription: coach };
  return {
    ...ex,
    id,
    setType: typeFallback,
    weight: normalizeSetWeightKg(templateEx, ex.weight),
    sets: Array.from({ length: n }, () => ({
      reps: (coach?.targetReps ?? ex.reps) || 10,
      weight: normalizeSetWeightKg(templateEx, coach?.targetWeightKg ?? ex.weight),
      completed: false,
      type: typeFallback,
      ...(coach?.targetRpe != null ? { rpe: coach.targetRpe } : {}),
    })),
  };
}

function exerciseSessionMode(ex: Exercise | undefined): 'block' | 'strength' | 'cardio' {
  if (!ex) return 'strength';
  if (isBlockMetaExercise(ex)) return 'block';
  if (resolveSessionCategory(ex) === 'cardio') return 'cardio';
  return 'strength';
}

function blockFormatLabel(ex: Exercise, t: (k: string) => string): string {
  const fmt = ex.blockFormat;
  if (fmt === 'emom') return t('workout.session.block.emom');
  if (fmt === 'amrap') return t('workout.session.block.amrap');
  if (fmt === 'circuit') return t('workout.session.block.circuit');
  if (fmt === 'hiit_tabata') return t('workout.session.block.tabata');
  if (fmt === 'intervals') return t('workout.session.block.intervals');
  return t('workout.session.block.generic');
}

function getSetColors(type: string, completed: boolean) {
  if (completed) {
    if (type === 'warmup') return 'bg-yellow-500 text-black border-yellow-500';
    if (type === 'dropset') return 'bg-orange-500 text-[var(--ink)] border-orange-500';
    if (type === 'failure') return 'bg-red-500 text-[var(--ink)] border-red-500';
    return 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]';
  }
  if (type === 'warmup') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:border-yellow-500/40';
  if (type === 'dropset') return 'bg-orange-500/10 text-orange-500 border-orange-500/20 hover:border-orange-500/40';
  if (type === 'failure') return 'bg-red-500/10 text-red-500 border-red-500/20 hover:border-red-500/40';
  return 'bg-surface-2 text-ink border-line hover:border-line-strong';
}

function canAccessSet(sets: SetDetail[], setIdx: number): boolean {
  if (setIdx <= 0) return true;
  return sets[setIdx - 1]?.completed === true;
}

function setTypeLabel(type: SetDetail['type'], t: (k: string) => string): string {
  if (type === 'warmup') return t('workout.session.type.warmup');
  if (type === 'dropset') return t('workout.session.type.dropset');
  if (type === 'failure') return t('workout.session.type.failure');
  return t('workout.session.type.normal');
}

interface WorkoutSessionPlayerProps {
  workout: Partial<Workout>;
  onComplete: (session: Partial<Workout>) => void | Promise<void>;
  onCancel: () => void;
}

export default function WorkoutSessionPlayer({ workout, onComplete, onCancel }: WorkoutSessionPlayerProps) {
  const { profile, updateProfile } = useAuth();
  const { workouts } = useWorkouts();
  const { t } = useI18n();
  const { openExerciseDetail, openExerciseSwap } = useExerciseDetail();
  const [exercises, setExercises] = useState<Exercise[]>(() => {
    const prepared = prepareExercisesForSession(workout.exercises);
    const mainCtx = prepared.filter(e => e.sessionPhase !== 'warmup' && e.sessionPhase !== 'cooldown');
    return prepared.map(ex =>
      initExerciseFromTemplate(finalizeExerciseForLiveSession(ex, mainCtx)),
    );
  });
  useEffect(() => {
    document.documentElement.classList.add('workout-session-active');
    resetMobileChromeAfterOverlay();
    return () => {
      document.documentElement.classList.remove('workout-session-active');
      resetMobileChromeAfterOverlay();
    };
  }, []);

  const [showCardioFeedback, setShowCardioFeedback] = useState(false);
  const [desktopTwoPane, setDesktopTwoPane] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [setTypePicker, setSetTypePicker] = useState<{ exIdx: number; setIdx: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktopTwoPane(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tabOrderRef = useRef(0);

  const sessionInstanceId = workout.sessionInstanceId ?? workout.id ?? 'session';
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsedBaseline, setElapsedBaseline] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<string | null>(null);
  const [restingExerciseIdx, setRestingExerciseIdx] = useState<number | null>(null);
  const [restingSetIdx, setRestingSetIdx] = useState(0);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(() => getWeightUnit());
  const [showPalette, setShowPalette] = useState(false);
  const [focusedExIdx, setFocusedExIdx] = useState(0);
  const [showPlate, setShowPlate] = useState(false);
  const [plateTarget, setPlateTarget] = useState(60);
  const [editNotesIdx, setEditNotesIdx] = useState<number | null>(null);
  const [showLiveEdit, setShowLiveEdit] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const prescriptionEnriched = useRef(false);

  useMobileOverlaySheet(
    showPlate ||
      editNotesIdx != null ||
      showAbortConfirm ||
      showCardioFeedback ||
      showLiveEdit ||
      setTypePicker != null,
  );

  useEffect(() => {
    if (!draftRestored || prescriptionEnriched.current) return;
    prescriptionEnriched.current = true;
    setExercises(prev =>
      enrichExercisesForLiveSession(prev, workouts, profile ?? undefined, workout.id),
    );
  }, [draftRestored, workouts, profile, workout.id]);

  const deloadActive = useMemo(() => isDeloadWeek(workouts), [workouts]);
  const sessionHasCardio = useMemo(
    () =>
      workout.type === 'Cardio' ||
      workout.type === 'Hybrid' ||
      exercises.some(ex => resolveSessionCategory(ex) === 'cardio'),
    [workout.type, exercises],
  );
  const localExercises = useLocalExerciseLibrary();
  const mediaGender =
    profile?.measurements?.gender === 'female'
      ? 'female'
      : profile?.measurements?.gender === 'male'
        ? 'male'
        : undefined;

  useEffect(() => {
    if (localExercises) return;
    for (const ex of exercises) {
      const key = ex.exerciseKey;
      if (!key || !isExerciseDbCatalogKey(key)) continue;
      if (getLibraryExercise(key)?.gifUrl) continue;
      fetchExerciseById(key).catch(() => {});
    }
  }, [exercises, localExercises]);

  const displayItems = useMemo(() => buildSessionDisplayItems(exercises), [exercises]);
  const railIndices = useMemo(() => getRailExerciseIndices(exercises), [exercises]);

  useEffect(() => {
    setStartTime(Date.now());
    setElapsedBaseline(0);
    setElapsedTime(0);
  }, [sessionInstanceId]);

  const allDone = useMemo(
    () => exercises.length > 0 && exercises.every(ex => exerciseIsFullyCompleted(ex)),
    [exercises],
  );

  const completedCount = useMemo(
    () => exercises.filter(ex => exerciseIsFullyCompleted(ex)).length,
    [exercises],
  );

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current[id] = el;
    else delete inputRefs.current[id];
  }, []);

  const nextTabIndex = useCallback(() => {
    tabOrderRef.current += 1;
    return tabOrderRef.current;
  }, []);

  const focusInput = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (el) {
        el.focus();
        el.select?.();
      }
    });
  }, []);

  const expandKeyForExercise = useCallback((exIdx: number) => {
    const ex = exercises[exIdx];
    const group = ex.supersetGroup?.trim();
    if (group) return `ss-${group}`;
    if (ex.structureParentId) return `circuit-${ex.structureParentId}`;
    return `ex-${ex.id ?? exIdx}`;
  }, [exercises]);

  useEffect(() => {
    if (draftRestored) return;
    void (async () => {
      let draft = loadSessionDraft();
      if (!draft?.exercises?.length) {
        draft = (await fetchSessionDraftFromServer()) ?? null;
      }
      if (!draft?.exercises?.length) {
        setDraftRestored(true);
        return;
      }
      const match =
        (workout.sessionInstanceId &&
          draft.sessionInstanceId &&
          workout.sessionInstanceId === draft.sessionInstanceId) ||
        (workout.sessionSourceKey &&
          draft.workoutMeta.sourceKey &&
          workout.sessionSourceKey === draft.workoutMeta.sourceKey) ||
        (workout.id && draft.workoutMeta.id === workout.id);
      const sid = workout.sessionInstanceId;
      const draftSid = draft.sessionInstanceId;
      if (sid && draftSid && sid !== draftSid) {
        setDraftRestored(true);
        return;
      }
      if (!match) {
        setDraftRestored(true);
        return;
      }
      const sameInstance =
        sid && draftSid ? sid === draftSid : !sid && !draftSid;
      setExercises(draft.exercises.map(ex => initExerciseFromTemplate(finalizeExerciseForLiveSession(ex))));
      if (sameInstance && draft.expandedKey) setExpandedKey(draft.expandedKey);
      if (
        sameInstance &&
        typeof draft.elapsedSeconds === 'number' &&
        draft.elapsedSeconds > 0
      ) {
        setElapsedBaseline(draft.elapsedSeconds);
        setElapsedTime(draft.elapsedSeconds);
        setStartTime(Date.now());
      }
      if (draft.restEndsAt) {
        const left = Math.ceil((Date.parse(draft.restEndsAt) - Date.now()) / 1000);
        if (Number.isFinite(left) && left > 0) {
          setRestEndsAt(draft.restEndsAt);
          setRestTimer(left);
          setIsResting(true);
          setRestingExerciseIdx(
            typeof draft.restingExerciseIdx === 'number' ? draft.restingExerciseIdx : null,
          );
          setRestingSetIdx(typeof draft.restingSetIdx === 'number' ? draft.restingSetIdx : 0);
        }
      }
      setDraftRestored(true);
    })();
  }, [draftRestored, workout.id, workout.sessionInstanceId, workout.sessionSourceKey]);

  const persistDraftNow = useCallback(
    (
      nextExercises: Exercise[],
      opts?: {
        elapsed?: number;
        expanded?: string | null;
        restEndsAt?: string | null;
        restingExerciseIdx?: number | null;
        restingSetIdx?: number;
        resting?: boolean;
      },
    ) => {
      if (!draftRestored) return;
      const existing = loadSessionDraft();
      const sameInstance = existing?.sessionInstanceId === workout.sessionInstanceId;
      const resting = opts?.resting ?? isResting;
      const endsAt =
        opts && 'restEndsAt' in opts
          ? opts.restEndsAt
          : resting
            ? restEndsAt
            : null;
      const draft = buildSessionDraftFromWorkout(
        { ...workout, exercises: nextExercises },
        {
          elapsedSeconds: opts?.elapsed ?? elapsedTime,
          expandedKey: opts?.expanded ?? expandedKey,
          startedAt: sameInstance ? existing?.startedAt ?? existing?.savedAt : undefined,
          restEndsAt: resting ? endsAt : null,
          restingExerciseIdx: resting
            ? (opts?.restingExerciseIdx ?? restingExerciseIdx)
            : null,
          restingSetIdx: resting ? (opts?.restingSetIdx ?? restingSetIdx) : undefined,
        },
      );
      saveSessionDraft(draft);
      void pushSessionDraftToServer(draft);
    },
    [
      draftRestored,
      workout,
      elapsedTime,
      expandedKey,
      isResting,
      restEndsAt,
      restingExerciseIdx,
      restingSetIdx,
    ],
  );

  /** Timer & Fokus: debounced; Satz-Tracking: sofort via persistDraftNow. */
  useEffect(() => {
    if (!draftRestored) return;
    const handle = setTimeout(() => {
      persistDraftNow(exercises);
    }, 700);
    return () => clearTimeout(handle);
  }, [elapsedTime, expandedKey, draftRestored, persistDraftNow, exercises]);

  const focusAfterSet = useCallback(
    (exIdx: number, setIdx: number) => {
      const ex = exercises[exIdx];
      const sets = Array.isArray(ex.sets) ? (ex.sets as SetDetail[]) : [];
      const mode = exerciseSessionMode(ex);

      const ssNext = nextSupersetFocus(exercises, exIdx, setIdx);
      if (ssNext) {
        setFocusedExIdx(ssNext.exIdx);
        const nm = exerciseSessionMode(exercises[ssNext.exIdx]);
        if (nm === 'cardio') focusInput(inputId(ssNext.exIdx, 0, 'duration'));
        else focusInput(inputId(ssNext.exIdx, ssNext.setIdx, 'weight'));
        return;
      }

      if (mode === 'strength' && setIdx < sets.length - 1) {
        focusInput(inputId(exIdx, setIdx + 1, 'weight'));
        return;
      }

      const group = ex.supersetGroup?.trim();
      const nextInSs = findNextExerciseIndex(exercises, exIdx, group ? { supersetGroup: group } : undefined);
      if (nextInSs != null) {
        setFocusedExIdx(nextInSs);
        const nextSets = exercises[nextInSs].sets as SetDetail[];
        const firstOpen = nextSets.findIndex(s => !s.completed);
        const si = firstOpen >= 0 ? firstOpen : 0;
        const nextMode = exerciseSessionMode(exercises[nextInSs]);
        if (nextMode === 'cardio') focusInput(inputId(nextInSs, 0, 'duration'));
        else if (nextMode === 'strength') focusInput(inputId(nextInSs, si, 'weight'));
        return;
      }

      const nextGlobal = findNextExerciseIndex(exercises, exIdx);
      if (nextGlobal != null) {
        setFocusedExIdx(nextGlobal);
        const nm = exerciseSessionMode(exercises[nextGlobal]);
        if (nm === 'cardio') focusInput(inputId(nextGlobal, 0, 'duration'));
        else if (nm === 'strength') focusInput(inputId(nextGlobal, 0, 'weight'));
      }
    },
    [exercises, expandKeyForExercise, focusInput],
  );

  useEffect(() => {
    if (!railIndices.length) return;
    if (!railIndices.includes(focusedExIdx)) setFocusedExIdx(railIndices[0]);
  }, [railIndices, focusedExIdx]);

  useEffect(() => {
    if (!railIndices.includes(focusedExIdx)) return;
    setExpandedKey(expandKeyForExercise(focusedExIdx));
  }, [focusedExIdx, expandKeyForExercise, railIndices]);

  useEffect(() => {
    if (isPaused) return;
    const int = setInterval(
      () => setElapsedTime(elapsedBaseline + Math.floor((Date.now() - startTime) / 1000)),
      1000,
    );
    return () => clearInterval(int);
  }, [isPaused, startTime, elapsedBaseline]);

  useEffect(() => {
    if (!isResting || !restEndsAt) return;
    const tick = () => {
      const left = Math.ceil((Date.parse(restEndsAt) - Date.now()) / 1000);
      if (!Number.isFinite(left) || left <= 0) {
        setRestTimer(0);
        setIsResting(false);
        setRestEndsAt(null);
        playRestTimerDone();
        // Rest-Felder im Draft räumen (exercises aus Closure beim Start reicht)
        const existing = loadSessionDraft();
        if (existing?.exercises?.length) {
          const draft = buildSessionDraftFromWorkout(
            {
              ...workout,
              exercises: existing.exercises,
              sessionInstanceId: workout.sessionInstanceId,
            },
            {
              elapsedSeconds: existing.elapsedSeconds,
              expandedKey: existing.expandedKey,
              startedAt: existing.startedAt,
              restEndsAt: null,
              restingExerciseIdx: null,
            },
          );
          saveSessionDraft(draft);
          void pushSessionDraftToServer(draft);
        }
        const exIdx = restingExerciseIdx;
        const setIdx = restingSetIdx;
        if (exIdx != null) {
          setTimeout(() => focusAfterSet(exIdx, setIdx), 120);
        }
        return;
      }
      setRestTimer(left);
    };
    tick();
    const int = setInterval(tick, 1000);
    return () => clearInterval(int);
  }, [isResting, restEndsAt, restingExerciseIdx, restingSetIdx, focusAfterSet, workout]);

  const ensureSetSlots = (exIdx: number, count: number) => {
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      if (!Array.isArray(ex.sets)) return prev;
      const setsArr = [...(ex.sets as SetDetail[])];
      const last = setsArr[setsArr.length - 1];
      while (setsArr.length < count) {
        setsArr.push({
          reps: last?.reps ?? ex.coachPrescription?.targetReps ?? ex.reps ?? 0,
          weight: last?.weight ?? ex.weight ?? 0,
          completed: false,
          type: last?.type ?? 'normal',
        });
      }
      ex.sets = setsArr;
      arr[exIdx] = ex;
      return arr;
    });
  };

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<SetDetail>) => {
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      if (!Array.isArray(ex.sets)) return prev;
      const setsArr = [...(ex.sets as SetDetail[])];
      setsArr[setIdx] = { ...setsArr[setIdx], ...patch };
      ex.sets = setsArr;
      arr[exIdx] = ex;
      return arr;
    });
  };

  const setSetTypeAt = (exIdx: number, setIdx: number, type: SetDetail['type']) => {
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      if (!Array.isArray(ex.sets)) return prev;
      const setsArr = [...(ex.sets as SetDetail[])];
      setsArr[setIdx] = { ...setsArr[setIdx], type: normalizeSetType(type) };
      ex.sets = setsArr;
      arr[exIdx] = ex;
      return arr;
    });
  };

  const markSetCompleted = (exIdx: number, setIdx: number, completed: boolean) => {
    if (completed) {
      const sets = exercises[exIdx]?.sets as SetDetail[] | undefined;
      if (sets && !canAccessSet(sets, setIdx)) return;
    }
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      if (!Array.isArray(ex.sets)) return prev;
      const setsArr = [...(ex.sets as SetDetail[])];
      if (completed && setIdx > 0 && !setsArr[setIdx - 1]?.completed) return prev;
      const s = { ...setsArr[setIdx], completed };
      setsArr[setIdx] = s;
      ex.sets = setsArr;
      arr[exIdx] = ex;

      if (completed && exerciseSessionMode(ex) === 'strength') {
        const roundDone = supersetRoundComplete(arr, exIdx, setIdx);
        const moreInSs = nextSupersetFocus(arr, exIdx, setIdx);
        if (roundDone && !moreInSs) {
          const secs = getExerciseRestSeconds(profile, ex);
          const ends = new Date(Date.now() + secs * 1000).toISOString();
          setRestingExerciseIdx(exIdx);
          setRestingSetIdx(setIdx);
          setRestTimer(secs);
          setRestEndsAt(ends);
          setIsResting(true);
          if (draftRestored) {
            persistDraftNow(arr, {
              resting: true,
              restEndsAt: ends,
              restingExerciseIdx: exIdx,
              restingSetIdx: setIdx,
            });
            return arr;
          }
        }
      }
      if (draftRestored) persistDraftNow(arr);
      return arr;
    });

    if (completed) {
      setTimeout(() => focusAfterSet(exIdx, setIdx), 80);
    }
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    const sets = exercises[exIdx]?.sets as SetDetail[] | undefined;
    const was = sets?.[setIdx]?.completed;
    markSetCompleted(exIdx, setIdx, !was);
  };

  const addSet = (exIdx: number) => {
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      const sc = [...(ex.sets as SetDetail[])];
      const last = sc[sc.length - 1];
      sc.push({
        reps: last?.reps ?? 10,
        weight: last?.weight ?? 0,
        completed: false,
        type: last?.type || 'normal',
        rpe: last?.rpe,
      });
      ex.sets = sc;
      arr[exIdx] = ex;
      return arr;
    });
  };

  const deleteSet = (exIdx: number, setIdx: number) => {
    setExercises(prev => {
      const arr = [...prev];
      const ex = { ...arr[exIdx] };
      const sc = [...(ex.sets as SetDetail[])];
      if (sc.length <= 1) return prev;
      sc.splice(setIdx, 1);
      ex.sets = sc;
      arr[exIdx] = ex;
      return arr;
    });
  };

  const exerciseFromLibrary = (item: LibraryExercise) => {
    const cardio = item.category === 'cardio';
    return initExerciseFromTemplate({
      id: Math.random().toString(36).slice(2, 11),
      exerciseKey: item.key,
      name: item.name,
      exerciseCategory: item.category,
      sets: cardio ? 1 : 3,
      reps: cardio ? 30 : 10,
      weight: 0,
      blockFormat: 'normal',
    });
  };

  const addManyFromLibrary = (items: LibraryExercise[]) => {
    if (items.length === 0) return;
    const added = items.map(exerciseFromLibrary);
    setExercises(prev => [...prev, ...added]);
    setShowPalette(false);
    const lastIdx = exercises.length + added.length - 1;
    setFocusedExIdx(lastIdx);
  };

  const replaceExerciseAt = (exIdx: number, item: LibraryExercise) => {
    setExercises(prev => {
      const arr = [...prev];
      const prevEx = arr[exIdx];
      const mainCtx = arr.filter(
        (e, i) => i !== exIdx && e.sessionPhase !== 'warmup' && e.sessionPhase !== 'cooldown',
      );
      const swapped = buildSwappedExercise(prevEx, item, {
        keepId: prevEx?.id,
        sessionPhase: prevEx?.sessionPhase,
        blockFormat: prevEx?.blockFormat,
      });
      arr[exIdx] = finalizeExerciseForLiveSession(initExerciseFromTemplate(swapped), mainCtx);
      return arr;
    });
  };

  const reorderExercises = (fromExIdx: number, toExIdx: number) => {
    if (fromExIdx === toExIdx) return;
    setExercises(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromExIdx, 1);
      arr.splice(toExIdx, 0, item);
      return arr;
    });
  };

  const deleteExerciseAt = (exIdx: number) => {
    setExercises(prev => prev.filter((_, i) => i !== exIdx));
  };

  const updateExerciseNotes = (exIdx: number, notes: string) => {
    setExercises(prev => {
      const arr = [...prev];
      arr[exIdx] = { ...arr[exIdx], notes: notes || undefined };
      return arr;
    });
  };

  const toggleWeightUnit = () => {
    const next: WeightUnit = weightUnit === 'kg' ? 'lb' : 'kg';
    setWeightUnit(next);
    setWeightUnitState(next);
  };

  const finishWithPayload = (cardioFeedback?: CardioSessionFeedback) => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    const saved = sanitizeExercisesForSave(exercises);
    const duration = Math.max(1, Math.floor(elapsedTime / 60));
    const payload = {
      ...workout,
      exercises: saved,
      duration,
      caloriesBurned: estimateWorkoutCalories({ ...workout, exercises: saved, duration }),
      ...(typeof cardioFeedback?.perceivedEffort === 'number'
        ? { sessionRpe: cardioFeedback.perceivedEffort }
        : {}),
      ...(cardioFeedback ? { cardioSessionFeedback: cardioFeedback } : {}),
    };
    void (async () => {
      try {
        await Promise.resolve(onComplete(payload));
        clearSessionDraft();
      } catch (err) {
        console.error('Workout save failed — session draft kept for recovery:', err);
      }
    })();
  };

  const completeWorkout = () => {
    setShowCardioFeedback(true);
  };

  const plateResult = plateCalcBarPlusPlates(plateTarget);
  const unitLabel = weightUnit === 'lb' ? 'lb' : 'kg';

  const renderStrengthSets = (exIdx: number, sets: SetDetail[]) => (
    <div className="mt-1">
      <div className="grid grid-cols-[2.75rem_1fr_1fr_2.5rem_3rem_2.5rem] gap-1.5 px-1 mb-2">
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted">
          {t('workout.session.col.type')}
        </span>
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted">
          {unitLabel}
        </span>
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted">
          {t('workout.session.col.reps')}
        </span>
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted">RPE</span>
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted">✓</span>
        <span className="text-center text-[10px] font-black uppercase tracking-widest text-muted" aria-hidden>
          {' '}
        </span>
      </div>
      {sets.map((s, idx) => {
        const exRow = exercises[exIdx];
        const wPh = prescriptionPlaceholder(exRow, 'weight', weightUnit);
        const rPh = prescriptionPlaceholder(exRow, 'reps');
        const bwDefault = isBodyweightDefault(exRow);
        const locked = !canAccessSet(sets, idx);
        return (
        <div key={idx} className="mb-2">
          <div
            className={cn(
              'grid grid-cols-[2.75rem_1fr_1fr_2.5rem_3rem_2.5rem] gap-1.5 items-center p-1.5 rounded-2xl border transition-all',
              getSetColors(s.type, s.completed),
              locked && !s.completed && 'opacity-45 pointer-events-none',
            )}
          >
            <button
              type="button"
              title={setTypeLabel(s.type, t)}
              aria-label={setTypeLabel(s.type, t)}
              onClick={() => setSetTypePicker({ exIdx, setIdx: idx })}
              className="w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black text-[10px] relative mx-auto bg-black/30 border border-white/10 touch-manipulation min-h-[44px]"
            >
              <span>{idx + 1}</span>
              <span className="text-[9px] uppercase opacity-80">
                {s.type === 'normal' ? '·' : s.type[0].toUpperCase()}
              </span>
            </button>
            <input
              ref={el => registerInput(inputId(exIdx, idx, 'weight'), el)}
              tabIndex={nextTabIndex()}
              enterKeyHint="next"
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder={wPh || (bwDefault ? '0' : undefined)}
              value={s.weight > 0 ? String(displayWeight(s.weight, weightUnit)) : ''}
              onChange={e =>
                updateSet(exIdx, idx, {
                  weight: inputToKg(parseFloat(e.target.value) || 0, weightUnit),
                })
              }
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  focusInput(inputId(exIdx, idx, 'reps'));
                }
              }}
              className={cn(
                'w-full min-h-[48px] text-center text-lg font-black tabular-nums bg-black/40 rounded-xl focus:outline-none focus:ring-2 appearance-none',
                s.completed ? 'text-[var(--ink)] focus:ring-white/50' : 'text-[var(--ink)] focus:ring-brand',
              )}
            />
            <input
              ref={el => registerInput(inputId(exIdx, idx, 'reps'), el)}
              tabIndex={nextTabIndex()}
              enterKeyHint="next"
              type="number"
              inputMode="numeric"
              placeholder={rPh || undefined}
              value={s.reps || ''}
              onChange={e => updateSet(exIdx, idx, { reps: parseInt(e.target.value, 10) || 0 })}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  focusInput(inputId(exIdx, idx, 'rpe'));
                }
              }}
              className={cn(
                'w-full min-h-[48px] text-center text-lg font-black tabular-nums bg-black/40 rounded-xl focus:outline-none focus:ring-2 appearance-none',
                s.completed ? 'text-[var(--ink)] focus:ring-white/50' : 'text-[var(--ink)] focus:ring-brand',
              )}
            />
            <input
              ref={el => registerInput(inputId(exIdx, idx, 'rpe'), el)}
              tabIndex={nextTabIndex()}
              enterKeyHint={idx < sets.length - 1 ? 'next' : 'done'}
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              placeholder="·"
              value={s.rpe ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                updateSet(exIdx, idx, {
                  rpe: Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : undefined,
                });
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!s.completed) markSetCompleted(exIdx, idx, true);
                  else focusAfterSet(exIdx, idx);
                }
              }}
              className="w-full min-h-[48px] text-center text-sm font-black tabular-nums bg-black/40 rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (locked && !s.completed) return;
                toggleSet(exIdx, idx);
              }}
              disabled={locked && !s.completed}
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-black/40 border-2 mx-auto touch-manipulation min-h-[48px] min-w-[48px]',
                s.completed
                  ? 'border-transparent text-[var(--accent-ink)] bg-brand/30'
                  : locked
                    ? 'border-line text-placeholder'
                    : 'border-line text-muted hover:border-line-strong',
              )}
              aria-label={t('workout.session.setDone')}
            >
              <Check size={22} strokeWidth={4} />
            </button>
            <button
              type="button"
              onClick={() => deleteSet(exIdx, idx)}
              disabled={sets.length <= 1}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-muted hover:text-red-400 disabled:opacity-20 touch-manipulation mx-auto"
              aria-label={t('workout.session.deleteSet')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      );
      })}
      <button
        type="button"
        onClick={() => addSet(exIdx)}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted border-2 border-dashed border-line rounded-2xl hover:bg-surface transition-colors touch-manipulation"
      >
        <Plus size={14} /> {t('workout.session.addSet')}
      </button>
    </div>
  );


  const renderCardioSets = (exIdx: number, sets: SetDetail[]) => {
    const exCardio = exercises[exIdx];
    const showDistance = isDistanceCardioExercise(exCardio);
    const durPh = prescriptionPlaceholder(exCardio, 'duration');
    const distPh = prescriptionPlaceholder(exCardio, 'distance');
    const coachHint = formatPrescriptionHint(exCardio, workouts, workout.id, t);
    if (exerciseSupportsGpsTracking(exCardio)) {
      return (
        <div className="space-y-3 mt-2">
          <CardioGpsPanel
            exercise={exCardio}
            onClose={() => {}}
            onSave={result => {
              setExercises(prev => {
                const arr = [...prev];
                arr[exIdx] = {
                  ...arr[exIdx],
                  routeData: result.routeData,
                  sets: [{ reps: result.minutes, weight: result.distanceKm, completed: true, type: 'normal' }],
                };
                return arr;
              });
            }}
          />
        </div>
      );
    }
    return (
    <div className="space-y-3 mt-2">
      {coachHint && (
        <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/90 bg-cyan-500/10 px-2 py-1.5 rounded-lg">
          {coachHint}
        </p>
      )}
      <div className={cn('grid gap-3', showDistance ? 'grid-cols-2' : 'grid-cols-1')}>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1.5 block">
            {t('workout.session.col.duration')}
          </label>
          <input
            ref={el => registerInput(inputId(exIdx, 0, 'duration'), el)}
            tabIndex={nextTabIndex()}
            enterKeyHint={showDistance ? 'next' : 'done'}
            type="number"
            inputMode="numeric"
            placeholder={durPh || undefined}
            value={sets[0]?.reps || ''}
            onChange={e => updateSet(exIdx, 0, { reps: parseInt(e.target.value, 10) || 0 })}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (showDistance) focusInput(inputId(exIdx, 0, 'distance'));
                else if (!sets[0]?.completed) markSetCompleted(exIdx, 0, true);
                else focusAfterSet(exIdx, 0);
              }
            }}
            className="w-full min-h-[52px] text-center text-xl font-black tabular-nums bg-surface border border-line rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-brand focus:outline-none"
          />
        </div>
        {showDistance ? (
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1.5 block">
              {t('workout.session.col.distance')}
            </label>
            <input
              ref={el => registerInput(inputId(exIdx, 0, 'distance'), el)}
              tabIndex={nextTabIndex()}
              enterKeyHint="done"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={distPh || undefined}
              value={sets[0]?.weight || ''}
              onChange={e => updateSet(exIdx, 0, { weight: parseFloat(e.target.value) || 0 })}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!sets[0]?.completed) markSetCompleted(exIdx, 0, true);
                  else focusAfterSet(exIdx, 0);
                }
              }}
              className="w-full min-h-[52px] text-center text-xl font-black tabular-nums bg-surface border border-line rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
        ) : null}
      </div>
      {exCardio.coachPrescription?.targetPace && (
        <p className="text-xs text-muted font-medium text-center">
          {t('workout.session.cardio.paceTarget', { pace: exCardio.coachPrescription.targetPace })}
        </p>
      )}
      <button
        type="button"
        onClick={() => toggleSet(exIdx, 0)}
        className={cn(
          'w-full min-h-[52px] rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all touch-manipulation',
          sets[0]?.completed ? 'ui-mark-selected' : 'bg-surface border border-line text-muted',
        )}
      >
        <Check size={18} strokeWidth={3} />
        {sets[0]?.completed ? t('workout.session.cardioDone') : t('workout.session.cardioMark')}
      </button>
    </div>
    );
  };

  const renderBlock = (exIdx: number, ex: Exercise, sets: SetDetail[]) => (
    <div className="mt-2 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-brand">{blockFormatLabel(ex, t)}</p>
      {(ex.structureMinutes != null || ex.structureRounds != null) && (
        <p className="text-xs text-muted font-medium">
          {ex.structureMinutes != null ? `${ex.structureMinutes} min` : ''}
          {ex.structureMinutes != null && ex.structureRounds != null ? ' · ' : ''}
          {ex.structureRounds != null ? `${ex.structureRounds} ${t('workout.session.rounds')}` : ''}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          const done = !sets[0]?.completed;
          markSetCompleted(exIdx, 0, done);
        }}
        className={cn(
          'w-full min-h-[52px] rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 touch-manipulation',
          sets[0]?.completed ? 'ui-mark-selected' : 'bg-surface border border-line text-muted',
        )}
      >
        <Check size={18} strokeWidth={3} />
        {sets[0]?.completed ? t('workout.session.blockDone') : t('workout.session.blockMark')}
      </button>
    </div>
  );

  const renderExerciseBody = (exIdx: number, nested?: boolean) => {
    tabOrderRef.current = nested ? tabOrderRef.current : tabOrderRef.current;
    const ex = exercises[exIdx];
    const mode = exerciseSessionMode(ex);
    const sets = Array.isArray(ex.sets) ? (ex.sets as SetDetail[]) : [];
    const lastHint =
      ex.name && mode === 'strength' && !isBlockMetaExercise(ex)
        ? getLastSessionHint(workouts, ex.name, workout.id)
        : null;
    const historicalPR =
      ex.name && mode === 'strength' && !isBlockMetaExercise(ex) ? getPersonalRecordKg(workouts, ex.name) : 0;
    const swapExercise = (repl: LibraryExercise) => {
      replaceExerciseAt(exIdx, repl);
    };
    const openDetail = () => {
      if (isBlockMetaExercise(ex)) return;
      openExerciseDetail({
        exerciseKey: ex.exerciseKey,
        name: ex.name,
        exercise: ex.exerciseKey
          ? {
              key: ex.exerciseKey,
              name: ex.name,
              category: ex.exerciseCategory ?? 'strength',
              gifUrl: ex.gifUrl,
            }
          : undefined,
      });
    };
    const openSwap = () => {
      if (isBlockMetaExercise(ex)) return;
      openExerciseSwap({
        exerciseKey: ex.exerciseKey,
        name: ex.name,
        onSwap: swapExercise,
      });
    };
    const prescriptionHint =
      !isBlockMetaExercise(ex) ? formatPrescriptionHint(ex, workouts, workout.id, t) : null;
    const suggestion =
      mode === 'strength' && !isBlockMetaExercise(ex)
        ? suggestSetForExercise(workouts, ex.name, 0, workout.id)
        : null;
    const coachTargets = ex.coachPrescription;

    const mobilityDone = ex.mobilityTimer && sets[0]?.completed;

    return (
      <div className={cn(nested && 'pt-3 border-t border-line first:border-0 first:pt-0')}>
        <div className={cn('flex items-start gap-2', nested || ex.mobilityTimer ? 'mb-2' : 'mb-0')}>
          {nested ? (
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={openDetail}
                className="text-left w-full touch-manipulation active:opacity-90"
              >
                <p className="font-black uppercase tracking-tight text-sm leading-tight hover:text-brand transition-colors">
                  {ex.name}
                </p>
              </button>
              {ex.supersetGroup && (
                <p className="text-[8px] font-black uppercase tracking-widest text-purple-400 mt-0.5">
                  {t('workout.session.supersetTag', { group: ex.supersetGroup })}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              {ex.supersetGroup && (
                <p className="text-[8px] font-black uppercase tracking-widest text-purple-400">
                  {t('workout.session.supersetTag', { group: ex.supersetGroup })}
                </p>
              )}
            </div>
          )}
          {!isBlockMetaExercise(ex) && (
            <div className="flex shrink-0 items-center gap-0.5 ml-auto">
              <button
                type="button"
                onClick={openDetail}
                className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center text-muted hover:text-brand touch-manipulation"
                aria-label={t('exercise.action.info')}
              >
                <Info size={18} />
              </button>
              <button
                type="button"
                onClick={openSwap}
                className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center text-muted hover:text-brand touch-manipulation"
                aria-label={t('exercise.action.swap')}
              >
                <RefreshCw size={18} />
              </button>
              <button
                type="button"
                onClick={() => setEditNotesIdx(exIdx)}
                className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center text-muted hover:text-ink touch-manipulation"
                aria-label={t('workout.session.editNotes')}
              >
                <Pencil size={18} />
              </button>
            </div>
          )}
        </div>
        {ex.notes && !ex.mobilityTimer && (
          <p className="text-xs text-muted mb-2 leading-relaxed">{ex.notes}</p>
        )}
        {prescriptionHint && mode !== 'block' && (
          <p className="text-[9px] font-black uppercase tracking-widest text-brand/90 bg-brand/10 px-2 py-1.5 rounded-lg mb-2">
            {prescriptionHint}
          </p>
        )}
        {(historicalPR > 0 || lastHint || suggestion || coachTargets?.targetWeightKg) &&
          mode === 'strength' &&
          !isBodyweightExercise(ex) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {historicalPR > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-400 px-2 py-1 rounded-lg">
                <Trophy size={11} /> PR {historicalPR} kg
              </span>
            )}
            {lastHint && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded-lg">
                <Clock size={11} /> {lastHint.weight}×{lastHint.reps}
              </span>
            )}
            {coachTargets?.targetWeightKg != null && coachTargets.targetReps != null && (
              <button
                type="button"
                onClick={() => {
                  const n = (exercises[exIdx].sets as SetDetail[]).length;
                  for (let si = 0; si < n; si++) {
                    updateSet(exIdx, si, {
                      weight: coachTargets.targetWeightKg!,
                      reps: coachTargets.targetReps!,
                    });
                  }
                }}
                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-brand/10 text-brand px-2 py-1 rounded-lg touch-manipulation"
              >
                <TrendingUp size={11} /> {t('workout.session.applyCoach')}
              </button>
            )}
            {suggestion && !coachTargets?.targetWeightKg && suggestion.weightKg > 0 && (
              <button
                type="button"
                onClick={() => {
                  const n = (exercises[exIdx].sets as SetDetail[]).length;
                  for (let si = 0; si < n; si++) {
                    updateSet(exIdx, si, { weight: suggestion.weightKg, reps: suggestion.reps });
                  }
                }}
                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-violet-500/10 text-violet-300 px-2 py-1 rounded-lg touch-manipulation"
              >
                <TrendingUp size={11} /> {t(suggestion.reasonKey)} · {suggestion.weightKg}×{suggestion.reps}
              </button>
            )}
          </div>
        )}
        {ex.mobilityTimer ? (
          <MobilityTimerPanel
            durationSec={ex.durationSec ?? (sets[0]?.reps ?? 10) * 60}
            label={ex.name}
            notes={ex.notes}
            completed={Boolean(mobilityDone)}
            onComplete={() => markSetCompleted(exIdx, 0, true)}
            onUndo={() => markSetCompleted(exIdx, 0, false)}
            t={t}
          />
        ) : null}
        {!ex.mobilityTimer && mode === 'strength' && renderStrengthSets(exIdx, sets)}
        {!ex.mobilityTimer && mode === 'cardio' && renderCardioSets(exIdx, sets)}
        {!ex.mobilityTimer && mode === 'block' && renderBlock(exIdx, ex, sets)}
      </div>
    );
  };

  const renderDisplayItem = (item: SessionDisplayItem, itemIndex: number) => {
    if (item.kind === 'circuit') {
      const block = exercises[item.blockExIdx];
      const key = block?.id ? `circuit-${block.id}` : `circuit-${item.blockExIdx}`;
      const open = expandedKey === key;
      const groupDone =
        exerciseIsFullyCompleted(block) &&
        item.childExIndices.every(i => exerciseIsFullyCompleted(exercises[i]));

      return (
        <div
          key={key}
          className={cn(
            'rounded-2xl border-2 transition-all',
            groupDone ? 'border-brand/50 bg-brand/5' : 'border-cyan-500/40 bg-cyan-500/5',
            open && 'ring-1 ring-cyan-400/40',
          )}
        >
          <button
            type="button"
            className="w-full text-left p-4 flex items-center gap-3 touch-manipulation min-h-[56px]"
            onClick={() => {
              tabOrderRef.current = 0;
              setExpandedKey(open ? null : key);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 font-black text-xs">
              Z
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black uppercase tracking-tight text-sm">{block?.name || blockFormatLabel(block, t)}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/80 mt-0.5">
                {t('workout.session.circuit.label', { n: item.childExIndices.length })}
              </p>
            </div>
            {open ? <ChevronUp size={18} className="text-cyan-400" /> : <ChevronDown size={18} className="text-cyan-400" />}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-4">
                  {block.blockFormat === 'emom' ? (
                    <SessionEmomPanel
                      block={block}
                      childExIndices={item.childExIndices}
                      exercises={exercises}
                      onUpdateSet={updateSet}
                      onEnsureSetSlots={ensureSetSlots}
                      onFocusChild={exIdx => setExpandedKey(expandKeyForExercise(exIdx))}
                    />
                  ) : (
                    isCircuitBlock(block) && (
                      <SessionCircuitPanel
                        block={block}
                        childCount={item.childExIndices.length}
                        onAdvanceChild={() => {
                          const next = item.childExIndices.find(i => !exerciseIsFullyCompleted(exercises[i]));
                          if (next != null) setExpandedKey(expandKeyForExercise(next));
                        }}
                      />
                    )
                  )}
                  {item.childExIndices.map(exIdx => (
                    <div key={exercises[exIdx].id ?? exIdx}>{renderExerciseBody(exIdx, true)}</div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    if (item.kind === 'superset') {
      const key = `ss-${item.group}`;
      const open = expandedKey === key;
      const groupDone = item.exIndices.every(i => exerciseIsFullyCompleted(exercises[i]));

      return (
        <div
          key={key}
          className={cn(
            'rounded-2xl border-2 transition-all',
            groupDone ? 'border-brand/50 bg-brand/5' : 'border-purple-500/40 bg-purple-500/5',
            open && 'ring-1 ring-purple-400/40',
          )}
        >
          <button
            type="button"
            className="w-full text-left p-4 flex items-center gap-3 touch-manipulation min-h-[56px]"
            onClick={() => {
              tabOrderRef.current = 0;
              setExpandedKey(open ? null : key);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
              <Link2 size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black uppercase tracking-tight text-sm">
                {t('workout.session.supersetTitle', { group: item.group })}
              </p>
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-400/80 mt-0.5">
                {t('workout.session.supersetHint', { n: item.exIndices.length })}
              </p>
            </div>
            {open ? <ChevronUp size={18} className="text-purple-400" /> : <ChevronDown size={18} className="text-purple-400" />}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-4">
                  {item.exIndices.map(exIdx => (
                    <div key={exercises[exIdx].id ?? exIdx}>{renderExerciseBody(exIdx, true)}</div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    const exIdx = item.exIdx;
    const ex = exercises[exIdx];
    const exKey = `ex-${ex.id ?? exIdx}`;
    const open = expandedKey === exKey;
    const done = exerciseIsFullyCompleted(ex);

    return (
      <div
        key={exKey}
        className={cn(
          'rounded-2xl border transition-all',
          done ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface-2',
          open && 'ring-1 ring-brand/30',
        )}
      >
        <button
          type="button"
          className="w-full text-left p-4 flex items-start gap-3 touch-manipulation min-h-[56px]"
          onClick={() => {
            tabOrderRef.current = 0;
            setExpandedKey(open ? null : exKey);
          }}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-xs',
              done ? 'ui-mark-selected' : 'bg-surface-2 text-muted',
            )}
          >
            {done ? <Check size={16} strokeWidth={3} /> : itemIndex + 1}
          </div>
          <motion.div className="flex-1 min-w-0">
            <p className="font-black uppercase tracking-tight text-sm leading-tight pr-6">{ex.name}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-1">
              {exerciseSessionMode(ex) === 'cardio'
                ? t('workout.session.type.cardio')
                : exerciseSessionMode(ex) === 'block'
                  ? blockFormatLabel(ex, t)
                  : t('workout.session.setsProgress', {
                      done: (ex.sets as SetDetail[]).filter(s => s.completed).length,
                      total: (ex.sets as SetDetail[]).length,
                    })}
            </p>
          </motion.div>
          {open ? <ChevronUp size={18} className="text-muted shrink-0" /> : <ChevronDown size={18} className="text-muted shrink-0" />}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 border-t border-line">{renderExerciseBody(exIdx)}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div
      className="fixed left-0 right-0 lg:left-64 z-50 bg-surface-2 flex flex-col text-[var(--ink)] touch-manipulation overflow-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      style={{
        top: 'var(--vv-top-inset, 0px)',
        height: 'var(--vv-height, 100dvh)',
        minHeight: '100dvh',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <motion.div className="flex-none p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between bg-surface border-b border-line shadow-sm z-10">
        <button
          type="button"
          onClick={() => setShowAbortConfirm(true)}
          className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted hover:text-ink"
          aria-label={t('workout.session.abort')}
        >
          <X size={24} />
        </button>
        <div className="text-center truncate px-2 flex-1 min-w-0">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted truncate">
            {workout.name || t('workout.new')}
          </h2>
          <button
            type="button"
            className="flex items-center justify-center gap-2 mt-0.5 mx-auto"
            onClick={() => setIsPaused(!isPaused)}
          >
            <Timer size={12} className={cn(isPaused ? 'text-yellow-500' : 'text-brand')} />
            <span className={cn('text-lg font-black tabular-nums', isPaused && 'text-yellow-500')}>
              {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
            </span>
          </button>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-0.5">
            {t('workout.session.progress', { done: completedCount, total: exercises.length })}
          </p>
        </div>
        {!allDone && (
          <button
            type="button"
            onClick={completeWorkout}
            className="flex items-center gap-1.5 bg-surface-2 text-ink px-3 py-2 min-h-[44px] rounded-lg text-[10px] font-black uppercase tracking-widest border border-line"
          >
            <Check size={14} /> {t('workout.finishBtn')}
          </button>
        )}
      </motion.div>

      {deloadActive && (
        <div className="flex-none px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-400 text-center">
          {t('progressive.overload.deloadBanner')}
        </div>
      )}

      <div className="flex-none px-4 py-2 flex flex-wrap gap-2 border-b border-line bg-surface-2">
        <button
          type="button"
          onClick={() => setShowLiveEdit(true)}
          className="min-h-[44px] px-3 rounded-xl bg-surface-2 text-[10px] font-black uppercase tracking-widest text-ink flex items-center gap-1.5 touch-manipulation"
        >
          <ListOrdered size={16} /> {t('workout.session.liveEdit.short')}
        </button>
        <button
          type="button"
          onClick={() => setShowPalette(true)}
          className="min-h-[44px] px-3 rounded-xl bg-surface-2 text-[10px] font-black uppercase tracking-widest text-ink flex items-center gap-1.5 touch-manipulation"
        >
          <Plus size={14} /> {t('workout.session.addExercise')}
        </button>
        <button
          type="button"
          onClick={toggleWeightUnit}
          className="min-h-[40px] px-3 rounded-xl bg-surface-2 text-[10px] font-black uppercase tracking-widest text-ink"
        >
          {weightUnit.toUpperCase()}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlateTarget(60);
            setShowPlate(true);
          }}
          className="min-h-[40px] px-3 rounded-xl bg-surface-2 text-[10px] font-black uppercase tracking-widest text-ink flex items-center gap-1.5"
        >
          <Scale size={14} /> {t('workout.session.plates')}
        </button>
      </div>

            {isResting && (
        <motion.div className="bg-brand/10 border-b border-brand/20 p-3 shrink-0 flex flex-col gap-2">
          <motion.div className="flex items-center justify-between gap-2">
            <motion.div className="flex items-center gap-3 min-w-0">
              <motion.div className="w-10 h-10 rounded-full border-2 border-brand flex items-center justify-center shrink-0">
                <Bell size={18} className="text-brand animate-pulse" />
              </motion.div>
              <motion.div>
                <p className="text-[10px] font-black uppercase tracking-widest text-brand">{t('workout.session.rest')}</p>
                <p className="text-xl font-black tabular-nums">
                  {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
                </p>
              </motion.div>
            </motion.div>
            <motion.div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0, restTimer - 15);
                  setRestTimer(next);
                  if (next <= 0) {
                    setIsResting(false);
                    setRestEndsAt(null);
                    persistDraftNow(exercises, { resting: false, restEndsAt: null });
                  } else {
                    const ends = new Date(Date.now() + next * 1000).toISOString();
                    setRestEndsAt(ends);
                    persistDraftNow(exercises, { resting: true, restEndsAt: ends });
                  }
                }}
                className="min-h-[44px] px-3 bg-surface rounded-lg text-[10px] font-bold text-muted touch-manipulation"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = restTimer + 15;
                  setRestTimer(next);
                  const ends = new Date(Date.now() + next * 1000).toISOString();
                  setRestEndsAt(ends);
                  persistDraftNow(exercises, { resting: true, restEndsAt: ends });
                }}
                className="min-h-[44px] px-3 bg-surface rounded-lg text-[10px] font-bold text-muted touch-manipulation"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResting(false);
                  setRestTimer(0);
                  setRestEndsAt(null);
                  persistDraftNow(exercises, { resting: false, restEndsAt: null });
                }}
                className="min-h-[44px] px-3 bg-brand/20 text-brand rounded-lg text-[10px] font-bold touch-manipulation"
              >
                {t('workout.session.restSkip')}
              </button>
            </motion.div>
          </motion.div>
          {restingExerciseIdx != null && profile && exercises[restingExerciseIdx] && (
            <button
              type="button"
              onClick={async () => {
                const ex = exercises[restingExerciseIdx];
                const secs = Math.max(15, restTimer);
                await updateProfile({
                  exerciseRestSeconds: setExerciseRestInProfile(profile, ex.name, secs),
                });
              }}
              className="w-full min-h-[44px] rounded-xl bg-surface-2 border border-brand/30 text-[10px] font-black uppercase tracking-widest text-brand touch-manipulation"
            >
              {t('workout.session.restSaveDefault', {
                sec: formatRestSeconds(Math.max(15, restTimer)),
                name: exercises[restingExerciseIdx]?.name ?? '',
              })}
            </button>
          )}
        </motion.div>
      )}

      {exercises.length > 0 && !desktopTwoPane && (
        <SessionExerciseRail
          exercises={exercises}
          railIndices={railIndices}
          focusedExIdx={focusedExIdx}
          onFocus={setFocusedExIdx}
          onReorder={reorderExercises}
          onSwap={exIdx => {
            const ex = exercises[exIdx];
            if (isBlockMetaExercise(ex)) return;
            openExerciseSwap({
              exerciseKey: ex.exerciseKey,
              name: ex.name,
              onSwap: item => replaceExerciseAt(exIdx, item),
            });
          }}
          onDelete={deleteExerciseAt}
          t={t}
        />
      )}

      <div className={cn('flex-1 min-h-0 flex', desktopTwoPane ? 'flex-row' : 'flex-col')}>
        {exercises.length > 0 && desktopTwoPane && (
          <aside className="w-80 shrink-0 min-h-0 self-stretch">
            <SessionExerciseRail
              exercises={exercises}
              railIndices={railIndices}
              focusedExIdx={focusedExIdx}
              onFocus={setFocusedExIdx}
              onReorder={reorderExercises}
              onSwap={exIdx => {
                const ex = exercises[exIdx];
                if (isBlockMetaExercise(ex)) return;
                openExerciseSwap({
                  exerciseKey: ex.exerciseKey,
                  name: ex.name,
                  onSwap: item => replaceExerciseAt(exIdx, item),
                });
              }}
              onDelete={deleteExerciseAt}
              t={t}
              orientation="vertical"
            />
          </aside>
        )}

      <div
        className={cn(
          'flex-1 overflow-y-auto w-full mx-auto p-4 pb-[max(7rem,calc(6rem+env(safe-area-inset-bottom)))]',
          desktopTwoPane ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center text-muted">
            <LayoutList size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">{t('workout.session.empty')}</p>
          </div>
        ) : railIndices.includes(focusedExIdx) ? (
          <div className="space-y-3">
            {exercises[focusedExIdx]?.sessionPhase && (
              <div
                className={cn(
                  'rounded-xl border px-3 py-2 text-center',
                  exercises[focusedExIdx].sessionPhase === 'warmup'
                    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                    : exercises[focusedExIdx].sessionPhase === 'cooldown'
                      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                      : 'border-brand/30 bg-brand/10 text-brand',
                )}
              >
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">
                  {t(
                    `workout.session.phase.${exercises[focusedExIdx].sessionPhase}` as 'workout.session.phase.main',
                  )}
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-line bg-surface-2 overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-line">
                <p className="font-black uppercase tracking-tight text-base leading-tight">
                  {exercises[focusedExIdx].name}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-1">
                  {exercises[focusedExIdx].mobilityTimer
                    ? t(
                        `workout.session.phase.${exercises[focusedExIdx].sessionPhase ?? 'warmup'}` as 'workout.session.phase.warmup',
                      )
                    : exerciseSessionMode(exercises[focusedExIdx]) === 'cardio'
                      ? isDistanceCardioExercise(exercises[focusedExIdx])
                        ? t('workout.session.type.cardio')
                        : t('workout.session.col.duration')
                      : exerciseSessionMode(exercises[focusedExIdx]) === 'block'
                        ? blockFormatLabel(exercises[focusedExIdx], t)
                        : t('workout.session.setsProgress', {
                            done: (exercises[focusedExIdx].sets as SetDetail[]).filter(s => s.completed)
                              .length,
                            total: (exercises[focusedExIdx].sets as SetDetail[]).length,
                          })}
                </p>
              </div>
              <div className="px-4 pb-4 pt-2">
                {(() => {
                  tabOrderRef.current = 0;
                  return renderExerciseBody(focusedExIdx);
                })()}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[var(--surface)] via-[var(--surface)] to-transparent pointer-events-none"
          >
            <div className={cn('mx-auto pointer-events-auto', desktopTwoPane ? 'max-w-2xl' : 'max-w-lg')}>
              <button
                type="button"
                onClick={completeWorkout}
                className="w-full min-h-[56px] rounded-2xl ui-btn-brand font-black uppercase tracking-widest text-sm shadow-xl shadow-brand/30 flex items-center justify-center gap-2 touch-manipulation"
              >
                <Check size={22} strokeWidth={3} />
                {t('workout.session.finishAll')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExercisePaletteModal
        open={showPalette}
        onClose={() => {
          setShowPalette(false);
        }}
        onPick={item => {
          addManyFromLibrary([item]);
        }}
        onPickMultiple={items => {
          addManyFromLibrary(items);
        }}
        multiSelect
      />

      <CardioSessionFeedbackModal
        open={showCardioFeedback}
        hasCardio={sessionHasCardio}
        onSubmit={fb => {
          setShowCardioFeedback(false);
          finishWithPayload(fb);
        }}
        onSkip={() => {
          setShowCardioFeedback(false);
          finishWithPayload();
        }}
      />

      <SetTypePickerSheet
        open={setTypePicker != null}
        current={
          setTypePicker
            ? ((exercises[setTypePicker.exIdx]?.sets as SetDetail[] | undefined)?.[setTypePicker.setIdx]
                ?.type ?? 'normal')
            : 'normal'
        }
        setNumber={(setTypePicker?.setIdx ?? 0) + 1}
        onClose={() => setSetTypePicker(null)}
        onPick={type => {
          if (!setTypePicker) return;
          setSetTypeAt(setTypePicker.exIdx, setTypePicker.setIdx, type);
        }}
        t={t}
      />

      <SessionLiveEditor
        open={showLiveEdit}
        exercises={exercises}
        onClose={() => setShowLiveEdit(false)}
        onApply={next => {
          const mainCtx = next.filter(e => e.sessionPhase !== 'warmup' && e.sessionPhase !== 'cooldown');
          setExercises(next.map(ex => initExerciseFromTemplate(finalizeExerciseForLiveSession(ex, mainCtx))));
        }}
      />

      <AnimatePresence>
        {showPlate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div className="bg-surface border border-line rounded-3xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-black uppercase tracking-tight mb-4">{t('workout.session.plates')}</h3>
              <input
                type="number"
                value={plateTarget}
                onChange={e => setPlateTarget(parseFloat(e.target.value) || 0)}
                className="w-full min-h-[48px] text-center text-xl font-black bg-surface-2 rounded-xl text-[var(--ink)] mb-4"
              />
              <p className="text-sm text-ink mb-2">
                {t('workout.session.plateResult', {
                  bar: plateResult.barKg,
                  total: plateResult.total,
                })}
              </p>
              <p className="text-xs text-muted mb-6">
                {plateResult.perSide.length
                  ? t('workout.session.platePerSide', { plates: plateResult.perSide.join(' + ') })
                  : t('workout.session.plateEmpty')}
              </p>
              <button
                type="button"
                onClick={() => setShowPlate(false)}
                className="w-full min-h-[48px] ui-btn-brand rounded-xl font-black uppercase text-[10px]"
              >
                {t('workout.session.plateClose')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editNotesIdx != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div className="bg-surface border border-line rounded-3xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-black uppercase tracking-tight mb-3">{t('workout.session.editNotes')}</h3>
              <textarea
                className="w-full min-h-[100px] bg-surface-2 rounded-xl p-3 text-sm text-[var(--ink)] mb-4"
                defaultValue={exercises[editNotesIdx]?.notes || ''}
                id="session-notes-edit"
              />
              <motion.div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditNotesIdx(null)}
                  className="flex-1 min-h-[48px] bg-surface-2 rounded-xl text-[10px] font-black uppercase"
                >
                  {t('workout.session.resume')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('session-notes-edit') as HTMLTextAreaElement | null;
                    if (editNotesIdx != null) updateExerciseNotes(editNotesIdx, el?.value || '');
                    setEditNotesIdx(null);
                  }}
                  className="flex-1 min-h-[48px] ui-btn-brand rounded-xl text-[10px] font-black uppercase"
                >
                  {t('workout.session.notesSave')}
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAbortConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-surface border border-line p-8 rounded-3xl w-full max-w-sm text-center"
            >
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">{t('workout.session.abortTitle')}</h3>
              <p className="text-muted text-sm mb-8">{t('workout.session.abortBody')}</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAbortConfirm(false)} className="flex-1 min-h-[48px] bg-surface-2 text-[var(--ink)] font-black uppercase tracking-widest text-[10px] rounded-xl">
                  {t('workout.session.resume')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearSessionDraft();
                    onCancel();
                  }}
                  className="flex-1 min-h-[48px] bg-red-500/10 text-red-500 border border-red-500/20 font-black uppercase tracking-widest text-[10px] rounded-xl"
                >
                  {t('workout.session.abort')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
