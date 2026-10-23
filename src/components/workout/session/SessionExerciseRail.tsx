import { useCallback, useRef, useState } from 'react';
import { Check, GripVertical, MoreHorizontal } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { exerciseIsFullyCompleted } from '@/src/lib/workoutSessionUtils';
import type { Exercise } from '@/src/types';
import { mobileSheetOverlayClass, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

type Props = {
  exercises: Exercise[];
  railIndices: number[];
  focusedExIdx: number;
  onFocus: (exIdx: number) => void;
  onReorder: (fromExIdx: number, toExIdx: number) => void;
  onSwap: (exIdx: number) => void;
  onDelete: (exIdx: number) => void;
  t: (key: string) => string;
  /** Desktop 2-pane: vertical list instead of horizontal chips */
  orientation?: 'horizontal' | 'vertical';
};

export default function SessionExerciseRail({
  exercises,
  railIndices,
  focusedExIdx,
  onFocus,
  onReorder,
  onSwap,
  onDelete,
  t,
  orientation = 'horizontal',
}: Props) {
  const vertical = orientation === 'vertical';
  const [menuExIdx, setMenuExIdx] = useState<number | null>(null);
  useMobileOverlaySheet(menuExIdx != null);
  const [dragExIdx, setDragExIdx] = useState<number | null>(null);
  const [dragOverExIdx, setDragOverExIdx] = useState<number | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const startLongPress = useCallback(
    (exIdx: number) => {
      clearLongPress();
      longPressRef.current = setTimeout(() => {
        setMenuExIdx(exIdx);
      }, 520);
    },
    [clearLongPress],
  );

  const handleDrop = useCallback(
    (targetExIdx: number) => {
      if (dragExIdx == null || dragExIdx === targetExIdx) return;
      onReorder(dragExIdx, targetExIdx);
      setDragExIdx(null);
      setDragOverExIdx(null);
    },
    [dragExIdx, onReorder],
  );

  const moveInRail = (exIdx: number, dir: -1 | 1) => {
    const pos = railIndices.indexOf(exIdx);
    if (pos < 0) return;
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= railIndices.length) return;
    onReorder(exIdx, railIndices[targetPos]);
  };

  if (railIndices.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'flex-none border-neutral-800 bg-neutral-900/80',
          vertical ? 'h-full border-r flex flex-col min-h-0' : 'border-b',
        )}
      >
        <div
          className={cn(
            'gap-2 scrollbar-hide',
            vertical
              ? 'flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3'
              : 'flex overflow-x-auto px-3 py-3 snap-x snap-mandatory',
          )}
        >
          {railIndices.map((exIdx, railPos) => {
            const ex = exercises[exIdx];
            const done = exerciseIsFullyCompleted(ex);
            const active = focusedExIdx === exIdx;
            const isDragOver = dragOverExIdx === exIdx && dragExIdx !== exIdx;
            return (
              <div
                key={ex.id ?? `rail-${exIdx}`}
                draggable={vertical}
                onPointerDown={() => startLongPress(exIdx)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
                onDragStart={e => {
                  if (!vertical) {
                    e.preventDefault();
                    return;
                  }
                  clearLongPress();
                  setDragExIdx(exIdx);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragExIdx(null);
                  setDragOverExIdx(null);
                }}
                onDragOver={e => {
                  if (!vertical) return;
                  e.preventDefault();
                  setDragOverExIdx(exIdx);
                }}
                onDragLeave={() => {
                  if (dragOverExIdx === exIdx) setDragOverExIdx(null);
                }}
                onDrop={e => {
                  e.preventDefault();
                  handleDrop(exIdx);
                }}
                className={cn(
                  'rounded-xl border px-2.5 py-2 text-left transition-all touch-manipulation',
                  vertical
                    ? 'w-full shrink-0'
                    : 'snap-start shrink-0 min-w-[148px] max-w-[220px]',
                  active
                    ? 'border-brand bg-brand/15 ring-1 ring-brand/40'
                    : done
                      ? 'border-brand/30 bg-brand/5'
                      : 'border-neutral-700 bg-neutral-800/80 hover:border-neutral-500',
                  isDragOver && 'border-cyan-400/60 bg-cyan-500/10',
                  dragExIdx === exIdx && 'opacity-50',
                )}
              >
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFocus(exIdx)}
                    className="flex flex-1 min-w-0 items-start gap-2 text-left touch-manipulation min-h-[44px]"
                  >
                    <span
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black',
                        done ? 'bg-brand text-black' : 'bg-neutral-700 text-neutral-400',
                      )}
                    >
                      {done ? <Check size={14} strokeWidth={3} /> : railPos + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[11px] font-black uppercase tracking-tight leading-tight line-clamp-2 pt-1">
                      {ex.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('workout.session.rail.swap')}
                    onClick={e => {
                      e.stopPropagation();
                      clearLongPress();
                      setMenuExIdx(exIdx);
                    }}
                    className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-neutral-400 hover:text-brand hover:bg-neutral-700/80 touch-manipulation shrink-0"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {vertical ? (
                    <GripVertical size={14} className="text-neutral-600 shrink-0 mt-3" aria-hidden />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {!vertical && (
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-center">
            {t('workout.session.rail.hint')}
          </p>
        )}
      </div>

      {menuExIdx != null && (
        <div className={mobileSheetOverlayClass()} onClick={() => setMenuExIdx(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-2 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-neutral-500 truncate">
              {exercises[menuExIdx]?.name}
            </p>
            <button
              type="button"
              onClick={() => {
                moveInRail(menuExIdx, -1);
                setMenuExIdx(null);
              }}
              disabled={railIndices.indexOf(menuExIdx) <= 0}
              className="w-full min-h-[48px] px-4 rounded-xl text-left text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-30"
            >
              {t('workout.session.rail.moveUp')}
            </button>
            <button
              type="button"
              onClick={() => {
                moveInRail(menuExIdx, 1);
                setMenuExIdx(null);
              }}
              disabled={railIndices.indexOf(menuExIdx) >= railIndices.length - 1}
              className="w-full min-h-[48px] px-4 rounded-xl text-left text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-30"
            >
              {t('workout.session.rail.moveDown')}
            </button>
            <button
              type="button"
              onClick={() => {
                onSwap(menuExIdx);
                setMenuExIdx(null);
              }}
              className="w-full min-h-[48px] px-4 rounded-xl text-left text-sm font-bold text-white hover:bg-neutral-800"
            >
              {t('workout.session.rail.swap')}
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(menuExIdx);
                setMenuExIdx(null);
              }}
              className="w-full min-h-[48px] px-4 rounded-xl text-left text-sm font-bold text-red-400 hover:bg-red-500/10"
            >
              {t('workout.session.rail.delete')}
            </button>
            <button
              type="button"
              onClick={() => setMenuExIdx(null)}
              className="w-full min-h-[44px] mt-1 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-800"
            >
              {t('workout.session.resume')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
