/**
 * Globale Übungs-Detailansicht (Info, Video, ähnliche Übungen, Tausch).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ExerciseDetailModal from '@/src/components/workout/ExerciseDetailModal';
import ExerciseSwapModal from '@/src/components/workout/ExerciseSwapModal';
import { getLibraryExercise, findLibraryExerciseByName, type LibraryExercise } from '@/src/lib/exerciseLibrary';
import { isExerciseDbCatalogKey } from '@/src/lib/exerciseDb';

export type ExerciseDetailOpenOptions = {
  exercise?: LibraryExercise | null;
  exerciseKey?: string;
  name?: string;
  onPick?: (ex: LibraryExercise) => void;
};

export type ExerciseSwapOpenOptions = {
  exerciseKey?: string;
  name?: string;
  onSwap: (ex: LibraryExercise) => void;
};

type Ctx = {
  openExerciseDetail: (opts: ExerciseDetailOpenOptions) => void;
  openExerciseSwap: (opts: ExerciseSwapOpenOptions) => void;
  closeExerciseDetail: () => void;
};

const ExerciseDetailContext = createContext<Ctx | null>(null);

function resolveInitialExercise(opts: ExerciseDetailOpenOptions): LibraryExercise | null {
  if (opts.exercise?.key) return opts.exercise;
  const key = opts.exerciseKey?.trim();
  if (key) {
    const hit = getLibraryExercise(key);
    if (hit) return hit;
    if (isExerciseDbCatalogKey(key)) {
      return {
        key,
        exerciseId: key.replace(/^edb_/, ''),
        name: opts.name || key,
        category: 'strength',
        source: 'exercisedb',
      };
    }
  }
  if (opts.name?.trim() && (!key || !isExerciseDbCatalogKey(key))) {
    const byName = findLibraryExerciseByName(opts.name);
    if (byName) return byName;
    return {
      key: key || `custom_${opts.name.slice(0, 12).replace(/\W/g, '_')}`,
      name: opts.name.trim(),
      category: 'strength',
    };
  }
  return null;
}

export function ExerciseDetailProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [exercise, setExercise] = useState<LibraryExercise | null>(null);
  const [onPick, setOnPick] = useState<((ex: LibraryExercise) => void) | undefined>();

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapKey, setSwapKey] = useState<string | undefined>();
  const [swapName, setSwapName] = useState<string | undefined>();
  const onSwapRef = useRef<((ex: LibraryExercise) => void) | null>(null);

  const closeExerciseDetail = useCallback(() => {
    setOpen(false);
    setOnPick(undefined);
    setExercise(null);
  }, []);

  const closeExerciseSwap = useCallback(() => {
    setSwapOpen(false);
    setSwapKey(undefined);
    setSwapName(undefined);
    onSwapRef.current = null;
  }, []);

  const openExerciseDetail = useCallback((opts: ExerciseDetailOpenOptions) => {
    const ex = resolveInitialExercise(opts);
    if (!ex) return;
    setExercise(ex);
    setOnPick(() => opts.onPick);
    setOpen(true);
  }, []);

  const openExerciseSwap = useCallback((opts: ExerciseSwapOpenOptions) => {
    setOpen(false);
    setExercise(null);
    setOnPick(undefined);
    onSwapRef.current = opts.onSwap;
    setSwapKey(opts.exerciseKey);
    setSwapName(opts.name);
    setSwapOpen(true);
  }, []);

  const value = useMemo(
    () => ({ openExerciseDetail, openExerciseSwap, closeExerciseDetail }),
    [openExerciseDetail, openExerciseSwap, closeExerciseDetail],
  );

  return (
    <ExerciseDetailContext.Provider value={value}>
      {children}
      {exercise ? (
        <ExerciseDetailModal
          open={open}
          exercise={exercise}
          onClose={closeExerciseDetail}
          onPick={onPick}
        />
      ) : null}
      <ExerciseSwapModal
        open={swapOpen}
        exerciseKey={swapKey}
        exerciseName={swapName}
        onClose={closeExerciseSwap}
        onSwap={ex => {
          onSwapRef.current?.(ex);
          closeExerciseSwap();
        }}
      />
    </ExerciseDetailContext.Provider>
  );
}

export function useExerciseDetail(): Ctx {
  const ctx = useContext(ExerciseDetailContext);
  if (!ctx) {
    throw new Error('useExerciseDetail must be used within ExerciseDetailProvider');
  }
  return ctx;
}

/** Optional: ohne Provider (z. B. Tests) — no-op */
export function useExerciseDetailOptional(): Ctx | null {
  return useContext(ExerciseDetailContext);
}
