import { useCallback, useEffect, useState } from 'react';
import { Timer, SkipForward, RotateCcw, Check } from 'lucide-react';
import type { Exercise, SetDetail } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import { prescriptionPlaceholder } from '@/src/lib/sessionPrescription';

type Phase = 'idle' | 'work' | 'rest';

interface Props {
  block: Exercise;
  childExIndices: number[];
  exercises: Exercise[];
  onUpdateSet: (exIdx: number, setIdx: number, patch: Partial<SetDetail>) => void;
  onEnsureSetSlots: (exIdx: number, count: number) => void;
  onFocusChild?: (exIdx: number) => void;
}

export default function SessionEmomPanel({
  block,
  childExIndices,
  exercises,
  onUpdateSet,
  onEnsureSetSlots,
  onFocusChild,
}: Props) {
  const { t } = useI18n();
  const totalMinutes = Math.max(1, block.structureMinutes ?? block.structureRounds ?? 12);
  const workSec = block.intervalWorkSec ?? 60;
  const restSec = block.intervalRestSec ?? 15;
  const childCount = Math.max(1, childExIndices.length);

  const [minute, setMinute] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(workSec);

  const activeChildListIdx = (minute - 1) % childCount;
  const activeExIdx = childExIndices[activeChildListIdx];
  const activeEx = exercises[activeExIdx];
  const setIdx = minute - 1;
  const activeSets = Array.isArray(activeEx?.sets) ? (activeEx.sets as SetDetail[]) : [];
  const currentReps = activeSets[setIdx]?.reps ?? 0;
  const targetReps = activeEx?.coachPrescription?.targetReps;

  const ensureEmomSets = useCallback(() => {
    for (const exIdx of childExIndices) {
      onEnsureSetSlots(exIdx, totalMinutes);
    }
  }, [childExIndices, onEnsureSetSlots, totalMinutes]);

  useEffect(() => {
    if (phase !== 'idle') ensureEmomSets();
  }, [phase, ensureEmomSets]);

  useEffect(() => {
    if (phase === 'idle') return;
    if (secondsLeft <= 0) {
      if (phase === 'work') {
        if (restSec > 0) {
          setPhase('rest');
          setSecondsLeft(restSec);
        } else {
          advanceMinute();
        }
        return;
      }
      if (phase === 'rest') {
        advanceMinute();
      }
      return;
    }
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [phase, secondsLeft, restSec]);

  const advanceMinute = () => {
    if (minute >= totalMinutes) {
      setPhase('idle');
      setSecondsLeft(workSec);
      return;
    }
    const next = minute + 1;
    setMinute(next);
    setPhase('work');
    setSecondsLeft(workSec);
    const nextChildIdx = childExIndices[(next - 1) % childCount];
    onFocusChild?.(nextChildIdx);
  };

  const startEmom = () => {
    ensureEmomSets();
    setMinute(1);
    setPhase('work');
    setSecondsLeft(workSec);
    onFocusChild?.(childExIndices[0]);
  };

  const phaseLabel =
    phase === 'work'
      ? t('workout.session.emom.work')
      : phase === 'rest'
        ? t('workout.session.emom.logRest')
        : t('workout.session.circuit.ready');

  const repsPlaceholder =
    prescriptionPlaceholder(activeEx ?? ({} as Exercise), 'reps') ||
    (targetReps != null ? String(targetReps) : '');

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
          {t('workout.session.emom.minute', { current: minute, total: totalMinutes })}
        </p>
        <span className="text-[9px] font-bold text-muted uppercase">{phaseLabel}</span>
      </div>

      {activeEx && (
        <p className="text-sm font-black uppercase tracking-tight text-[var(--ink)] truncate">{activeEx.name}</p>
      )}

      <div className="flex items-center justify-center gap-3">
        <Timer size={20} className="text-violet-400" />
        <span className="text-3xl font-black tabular-nums">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>

      {(phase === 'work' || phase === 'rest') && activeExIdx != null && (
        <div className="space-y-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted block text-center">
            {phase === 'work' ? t('workout.session.emom.repsDuring') : t('workout.session.emom.repsAfter')}
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={repsPlaceholder}
            value={currentReps > 0 ? currentReps : ''}
            onChange={e => {
              const reps = parseInt(e.target.value, 10) || 0;
              onUpdateSet(activeExIdx, setIdx, { reps, completed: reps > 0 });
            }}
            className="w-full min-h-[52px] text-center text-2xl font-black tabular-nums bg-black/40 border border-violet-500/30 rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-violet-500 focus:outline-none"
          />
          {targetReps != null && (
            <p className="text-[9px] text-center font-bold text-violet-300/80 uppercase tracking-widest">
              {t('workout.session.emom.target', { n: targetReps })}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {phase === 'idle' ? (
          <button
            type="button"
            onClick={startEmom}
            className="flex-1 min-h-[44px] rounded-xl bg-violet-600 text-[var(--ink)] text-[10px] font-black uppercase tracking-widest"
          >
            {t('workout.session.emom.start')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSecondsLeft(s => Math.max(0, s - 15))}
              className="min-h-[44px] px-3 rounded-xl bg-surface text-[10px] font-bold text-muted"
            >
              −15s
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('idle');
                setMinute(1);
                setSecondsLeft(workSec);
              }}
              className="min-h-[44px] px-3 rounded-xl bg-surface text-[10px] font-bold text-muted flex items-center gap-1"
            >
              <RotateCcw size={12} /> {t('workout.session.circuit.reset')}
            </button>
            <button
              type="button"
              onClick={() => setSecondsLeft(0)}
              className="flex-1 min-h-[44px] rounded-xl bg-violet-600/20 text-violet-300 text-[10px] font-black uppercase flex items-center justify-center gap-1"
            >
              <SkipForward size={14} /> {t('workout.session.circuit.skip')}
            </button>
          </>
        )}
      </div>

      {phase !== 'idle' && currentReps > 0 && (
        <button
          type="button"
          onClick={() => onUpdateSet(activeExIdx, setIdx, { reps: currentReps, completed: true })}
          className="w-full min-h-[40px] rounded-xl border border-violet-500/40 text-violet-300 text-[9px] font-black uppercase flex items-center justify-center gap-1"
        >
          <Check size={14} /> {t('workout.session.emom.repsSaved')}
        </button>
      )}
    </div>
  );
}
