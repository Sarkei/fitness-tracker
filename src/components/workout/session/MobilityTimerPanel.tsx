import { useEffect, useRef, useState } from 'react';
import { Check, Play, Square } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type Props = {
  durationSec: number;
  label?: string;
  notes?: string;
  completed: boolean;
  onComplete: () => void;
  onUndo: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export default function MobilityTimerPanel({
  durationSec,
  label,
  notes,
  completed,
  onComplete,
  onUndo,
  t,
}: Props) {
  const total = Math.max(60, durationSec);
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (completed) {
      setRunning(false);
      setRemaining(0);
    }
  }, [completed]);

  useEffect(() => {
    if (!running || completed) return;
    const id = window.setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          window.clearInterval(id);
          setRunning(false);
          onComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, completed, onComplete]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const display = `${mm}:${String(ss).padStart(2, '0')}`;
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

  const start = () => {
    if (completed) return;
    startedRef.current = true;
    setRunning(true);
  };

  const stopEarly = () => {
    setRunning(false);
    onComplete();
  };

  return (
    <div className="mt-3 space-y-3">
      {notes ? <p className="text-xs text-neutral-400 leading-relaxed">{notes}</p> : null}
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-center">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500/90 mb-2 truncate">
          {label?.trim() || t('workout.session.mobility.label')}
        </p>
        <p className="text-4xl font-black tabular-nums text-white mb-3">{completed ? '0:00' : display}</p>
        <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-4">
          <div
            className="h-full bg-yellow-500 transition-all duration-1000"
            style={{ width: `${completed ? 100 : progress}%` }}
          />
        </div>
        {completed ? (
          <button
            type="button"
            onClick={onUndo}
            className="w-full min-h-[48px] rounded-xl border border-neutral-700 text-[10px] font-black uppercase tracking-widest text-neutral-400"
          >
            {t('workout.session.mobility.reopen')}
          </button>
        ) : (
          <div className="flex gap-2">
            {!running ? (
              <button
                type="button"
                onClick={start}
                className={cn(
                  'flex-1 min-h-[48px] rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2',
                )}
              >
                <Play size={16} />
                {startedRef.current ? t('workout.session.mobility.resume') : t('workout.session.mobility.start')}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopEarly}
                className="flex-1 min-h-[48px] ui-btn-brand text-[10px] flex items-center justify-center gap-2"
              >
                <Square size={14} />
                {t('workout.session.mobility.finishEarly')}
              </button>
            )}
            {!running && startedRef.current && (
              <button
                type="button"
                onClick={onComplete}
                className="min-h-[48px] px-4 rounded-xl bg-neutral-800 text-[10px] font-black uppercase text-neutral-300 flex items-center gap-1"
              >
                <Check size={16} /> {t('workout.session.mobility.done')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
