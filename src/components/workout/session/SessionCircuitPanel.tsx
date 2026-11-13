import { useEffect, useState, useCallback } from 'react';
import { Timer, SkipForward, RotateCcw } from 'lucide-react';
import type { Exercise } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';

type Phase = 'work' | 'rest' | 'round_rest' | 'idle';

interface Props {
  block: Exercise;
  childCount: number;
  onAdvanceChild?: () => void;
}

export default function SessionCircuitPanel({ block, childCount, onAdvanceChild }: Props) {
  const { t } = useI18n();
  const rounds = Math.max(1, block.structureRounds ?? 3);
  const workSec =
    block.blockFormat === 'hiit_tabata'
      ? 20
      : block.intervalWorkSec ?? (block.blockFormat === 'emom' ? 60 : 45);
  const restSec =
    block.blockFormat === 'hiit_tabata'
      ? 10
      : block.intervalRestSec ?? 15;
  const amrapSec = block.blockFormat === 'amrap' ? (block.structureMinutes ?? 12) * 60 : 0;

  const [round, setRound] = useState(1);
  const [childIdx, setChildIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>(block.blockFormat === 'amrap' ? 'work' : 'idle');
  const [secondsLeft, setSecondsLeft] = useState(amrapSec || workSec);

  const startInterval = useCallback(() => {
    setPhase('work');
    setSecondsLeft(block.blockFormat === 'amrap' ? amrapSec : workSec);
    setRound(1);
    setChildIdx(0);
  }, [amrapSec, workSec, block.blockFormat]);

  useEffect(() => {
    if (phase === 'idle') return;
    if (secondsLeft <= 0) {
      if (block.blockFormat === 'amrap') {
        setPhase('idle');
        return;
      }
      if (phase === 'work') {
        setPhase('rest');
        setSecondsLeft(restSec);
        return;
      }
      if (phase === 'rest') {
        const nextChild = childIdx + 1;
        if (nextChild < childCount) {
          setChildIdx(nextChild);
          onAdvanceChild?.();
          setPhase('work');
          setSecondsLeft(workSec);
        } else if (round < rounds) {
          setRound(r => r + 1);
          setChildIdx(0);
          setPhase('round_rest');
          setSecondsLeft(restSec * 2);
        } else {
          setPhase('idle');
        }
        return;
      }
      if (phase === 'round_rest') {
        setPhase('work');
        setSecondsLeft(workSec);
      }
      return;
    }
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [phase, secondsLeft, childIdx, childCount, round, rounds, restSec, workSec, block.blockFormat, onAdvanceChild]);

  const phaseLabel =
    phase === 'work'
      ? t('workout.session.circuit.work')
      : phase === 'rest' || phase === 'round_rest'
        ? t('workout.session.circuit.rest')
        : t('workout.session.circuit.ready');

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
          {t('workout.session.circuit.round', { current: round, total: rounds })}
          {childCount > 1 ? ` · ${t('workout.session.circuit.ex', { n: childIdx + 1, total: childCount })}` : ''}
        </p>
        <span className="text-[9px] font-bold text-muted uppercase">{phaseLabel}</span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Timer size={20} className="text-cyan-400" />
        <span className="text-3xl font-black tabular-nums">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="flex gap-2">
        {phase === 'idle' ? (
          <button
            type="button"
            onClick={startInterval}
            className="flex-1 min-h-[44px] rounded-xl bg-cyan-600 text-[var(--ink)] text-[10px] font-black uppercase tracking-widest"
          >
            {t('workout.session.circuit.start')}
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
                setSecondsLeft(workSec);
              }}
              className="min-h-[44px] px-3 rounded-xl bg-surface text-[10px] font-bold text-muted flex items-center gap-1"
            >
              <RotateCcw size={12} /> {t('workout.session.circuit.reset')}
            </button>
            <button
              type="button"
              onClick={() => setSecondsLeft(0)}
              className="flex-1 min-h-[44px] rounded-xl bg-cyan-600/20 text-cyan-300 text-[10px] font-black uppercase flex items-center justify-center gap-1"
            >
              <SkipForward size={14} /> {t('workout.session.circuit.skip')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
