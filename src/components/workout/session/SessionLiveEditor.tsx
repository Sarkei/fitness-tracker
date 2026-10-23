import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GripVertical, Trash2, Plus, Info, RefreshCw } from 'lucide-react';
import type { Exercise } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import ExercisePaletteModal from '@/src/components/workout/ExercisePaletteModal';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import { mobileSheetOverlayClass, useMobileOverlaySheet } from '@/src/lib/mobileViewport';
import { buildSwappedExercise } from '@/src/lib/exerciseLibrarySwap';

function randomId() {
  return Math.random().toString(36).slice(2, 11);
}

export default function SessionLiveEditor({
  open,
  exercises,
  onClose,
  onApply,
}: {
  open: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onApply: (exercises: Exercise[]) => void;
}) {
  const { t } = useI18n();
  const { openExerciseDetail, openExerciseSwap } = useExerciseDetail();
  useMobileOverlaySheet(open);
  const [draft, setDraft] = useState<Exercise[]>([]);
  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft([]);
      return;
    }
    // Snapshot beim Öffnen — nicht bei jeder exercises-Referenz während Edit zurücksetzen
    setDraft(exercises.map(e => ({ ...e })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei open-Wechsel
  }, [open]);

  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= draft.length) return;
    const arr = [...draft];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setDraft(arr);
  };

  const remove = (i: number) => setDraft(arr => arr.filter((_, idx) => idx !== i));

  const exerciseFromLib = (item: LibraryExercise): Exercise => {
    const cardio = item.category === 'cardio';
    return {
      id: randomId(),
      exerciseKey: item.key,
      name: item.name,
      exerciseCategory: item.category,
      sets: cardio ? 1 : 3,
      reps: cardio ? 30 : 10,
      weight: 0,
      blockFormat: 'normal',
    };
  };

  const addFromLib = (item: LibraryExercise) => {
    setDraft(arr => [...arr, exerciseFromLib(item)]);
    setShowPalette(false);
  };

  const addManyFromLib = (items: LibraryExercise[]) => {
    if (items.length === 0) return;
    setDraft(arr => [...arr, ...items.map(exerciseFromLib)]);
    setShowPalette(false);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={mobileSheetOverlayClass()}
          >
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h3 className="font-black uppercase tracking-tight">{t('workout.session.liveEdit.title')}</h3>
                <button type="button" onClick={onClose} className="p-2 text-neutral-500">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {draft.map((ex, i) => (
                  <div
                    key={ex.id ?? i}
                    className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        className="min-h-[36px] min-w-[36px] text-neutral-400 text-sm touch-manipulation"
                        aria-label={t('workout.session.rail.moveUp')}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        className="min-h-[36px] min-w-[36px] text-neutral-400 text-sm touch-manipulation"
                        aria-label={t('workout.session.rail.moveDown')}
                      >
                        ▼
                      </button>
                    </div>
                    <GripVertical size={14} className="text-neutral-600 shrink-0" />
                    <button
                      type="button"
                      className="flex-1 text-sm font-bold truncate text-left hover:text-brand min-h-[44px]"
                      onClick={() =>
                        openExerciseDetail({
                          exerciseKey: ex.exerciseKey,
                          name: ex.name,
                        })
                      }
                    >
                      {ex.name}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openExerciseSwap({
                          exerciseKey: ex.exerciseKey,
                          name: ex.name,
                          onSwap: repl => {
                            setDraft(arr => {
                              const n = [...arr];
                              n[i] = buildSwappedExercise(n[i], repl, {
                                keepId: n[i]?.id,
                                sessionPhase: n[i]?.sessionPhase,
                                blockFormat: n[i]?.blockFormat,
                              });
                              return n;
                            });
                          },
                        })
                      }
                      className="min-h-[44px] min-w-[44px] text-neutral-500 hover:text-brand flex items-center justify-center touch-manipulation"
                      aria-label={t('exercise.action.swap')}
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openExerciseDetail({ exerciseKey: ex.exerciseKey, name: ex.name })
                      }
                      className="min-h-[44px] min-w-[44px] text-neutral-500 hover:text-brand flex items-center justify-center touch-manipulation"
                      aria-label={t('exercise.action.info')}
                    >
                      <Info size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="min-h-[44px] min-w-[44px] text-red-400 flex items-center justify-center touch-manipulation"
                      aria-label={t('workout.session.rail.delete')}
                    >
                      <Trash2 size={18} />
                    </button>                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowPalette(true)}
                  className="w-full min-h-[44px] border border-dashed border-neutral-700 rounded-xl text-[10px] font-black uppercase text-neutral-500 flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> {t('workout.session.addExercise')}
                </button>
              </div>
              <div className="p-4 border-t border-neutral-800 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[48px] rounded-xl bg-neutral-800 text-[10px] font-black uppercase"
                >
                  {t('profile.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(draft);
                    onClose();
                  }}
                  className="flex-1 min-h-[48px] rounded-xl ui-btn-brand text-[10px] font-black uppercase"
                >
                  {t('workout.session.liveEdit.apply')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ExercisePaletteModal
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onPickMultiple={addManyFromLib}
        multiSelect
      />
    </>
  );
}
