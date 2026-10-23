/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Trash2,
  Dumbbell,
  Zap,
  Activity,
  Save,
  Calendar,
  Clock,
  Timer,
  Ruler,
  LayoutList,
  ChevronDown,
  Search,
  Info,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { WorkoutTemplate, TemplateDayPlan, Exercise } from '@/src/types';
import { getLibraryExercise, type LibraryExercise, type LibraryExerciseCategory } from '@/src/lib/exerciseLibrary';
import {
  childrenSorted,
  removeExerciseWithDescendants,
  rootsInListOrder,
} from '@/src/lib/workoutTemplateStructure';
import ExercisePaletteModal from '@/src/components/workout/ExercisePaletteModal';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import { getExerciseGifUrl } from '@/src/lib/exerciseMedia';
import { useI18n } from '@/src/lib/i18n';
import { mobileSheetOverlayClass, overlayPortal, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const SUPERSET_OPTIONS = ['', 'A', 'B', 'C', 'D', 'E', 'F'] as const;

interface Props {
  template: Partial<WorkoutTemplate>;
  onSave: (template: Partial<WorkoutTemplate>) => void;
  onClose: () => void;
}

function randomId() {
  return Math.random().toString(36).slice(2, 11);
}

function isBlockExercise(ex: Exercise): boolean {
  return ex.blockFormat != null && ex.blockFormat !== 'normal';
}

function deriveTemplateTypeFromWeek(week: TemplateDayPlan[]): 'Strength' | 'Cardio' | 'Hybrid' {
  const active = week.filter(d => !d.isRest);
  if (active.length === 0) return 'Strength';
  const types = new Set(active.map(d => d.type || 'Strength'));
  if (types.has('Hybrid')) return 'Hybrid';
  if (types.has('Strength') && types.has('Cardio')) return 'Hybrid';
  if (types.has('Cardio')) return 'Cardio';
  return 'Strength';
}

function exerciseFromLibraryItem(item: LibraryExercise, structureParentId?: string): Exercise {
  const cardio = item.category === 'cardio';
  return {
    id: randomId(),
    exerciseKey: item.key,
    name: item.name,
    exerciseCategory: item.category,
    sets: cardio ? 1 : 3,
    reps: cardio ? 1 : 10,
    weight: 0,
    blockFormat: 'normal',
    ...(structureParentId ? { structureParentId } : {}),
  };
}

function createBlockExercise(
  format: Exclude<Exercise['blockFormat'], undefined | 'normal'>,
  structureParentId?: string,
): Exercise {
  const id = `_block_${randomId()}`;
  const base: Exercise = {
    id,
    name: '',
    sets: 1,
    reps: 1,
    weight: 0,
    blockFormat: format,
    exerciseCategory: undefined,
    ...(structureParentId ? { structureParentId } : {}),
  };
  switch (format) {
    case 'emom':
      return { ...base, name: 'EMOM', structureMinutes: 10 };
    case 'amrap':
      return { ...base, name: 'AMRAP', structureMinutes: 15 };
    case 'circuit':
      return { ...base, name: 'Zirkeltraining', structureRounds: 3 };
    case 'hiit_tabata':
      return {
        ...base,
        name: 'HIIT / Tabata',
        structureRounds: 8,
        intervalWorkSec: 20,
        intervalRestSec: 10,
      };
    case 'intervals':
      return {
        ...base,
        name: 'Intervall-Sequenz',
        intervalWorkSec: 60,
        intervalRestSec: 60,
        intervalRepeat: 5,
      };
    default:
      return { ...base, blockFormat: 'emom', name: 'EMOM', structureMinutes: 10 };
  }
}

function blockSummaryLabel(ex: Exercise): string {
  const f = ex.blockFormat;
  if (f === 'emom') return `EMOM · ${ex.structureMinutes ?? '?'} Min`;
  if (f === 'amrap') return `AMRAP · ${ex.structureMinutes ?? '?'} Min`;
  if (f === 'circuit') return `Zirkel · ${ex.structureRounds ?? '?'} Runden`;
  if (f === 'hiit_tabata')
    return `HIIT · ${ex.structureRounds ?? '?'}× (${ex.intervalWorkSec ?? '?'}/${ex.intervalRestSec ?? '?'}s)`;
  if (f === 'intervals')
    return `Intervals · ${ex.intervalWorkSec ?? '?'}/${ex.intervalRestSec ?? '?'}s ×${ex.intervalRepeat ?? '?'}`;
  return ex.name || 'Block';
}

// ─── Block Editor Row ──────────────────────────────────────────────────────────

function BlockRowEditor({
  ex,
  blockFlatIndex,
  exercises,
  templateType,
  onListChange,
  onOpenPaletteInside,
  onAddStructureInside,
  onOpenPaletteReplace,
}: {
  ex: Exercise;
  blockFlatIndex: number;
  exercises: Exercise[];
  templateType: 'Strength' | 'Cardio' | 'Hybrid';
  onListChange: (list: Exercise[]) => void;
  onOpenPaletteInside: (parentId: string, restrict: LibraryExerciseCategory | undefined) => void;
  onAddStructureInside: (
    parentId: string,
    format: Exclude<Exercise['blockFormat'], undefined | 'normal'>,
  ) => void;
  onOpenPaletteReplace: (flatIndex: number) => void;
}) {
  const { t } = useI18n();
  const fmt = ex.blockFormat!;
  const bid = ex.id!;
  const [structureInsideOpen, setStructureInsideOpen] = useState(false);
  const structureInsideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!structureInsideOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = structureInsideRef.current;
      if (el && !el.contains(e.target as Node)) setStructureInsideOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [structureInsideOpen]);

  const kids = childrenSorted(exercises, bid);

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-brand/10 to-transparent border-2 border-brand/25 rounded-2xl p-5 group relative space-y-4"
    >
      <button
        type="button"
        onClick={() => onListChange(removeExerciseWithDescendants(exercises, bid))}
        className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
        aria-label={t('work.editor.remove')}
      >
        <Trash2 size={14} />
      </button>
      <div className="flex items-center gap-2 mb-1 pr-8">
        <LayoutList size={16} className="text-brand shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-brand">{t('work.editor.structure')}</span>
      </div>
      <p className="text-xs font-black text-[var(--text-primary)] mb-2">{blockSummaryLabel(ex)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(fmt === 'emom' || fmt === 'amrap') && (
          <div>
            <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block flex items-center gap-1">
              <Clock size={9} /> {t('work.editor.durationMin')}
            </label>
            <input
              type="number"
              min={1}
              value={ex.structureMinutes ?? ''}
              onChange={e => {
                const n = [...exercises];
                n[blockFlatIndex] = { ...n[blockFlatIndex], structureMinutes: parseInt(e.target.value, 10) || 0 };
                onListChange(n);
              }}
              className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
            />
          </div>
        )}
        {fmt === 'circuit' && (
          <div>
            <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">{t('work.editor.rounds')}</label>
            <input
              type="number"
              min={1}
              value={ex.structureRounds ?? ''}
              onChange={e => {
                const n = [...exercises];
                n[blockFlatIndex] = { ...n[blockFlatIndex], structureRounds: parseInt(e.target.value, 10) || 0 };
                onListChange(n);
              }}
              className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
            />
          </div>
        )}
        {(fmt === 'hiit_tabata' || fmt === 'intervals') && (
          <>
            <div>
              <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">{t('work.editor.workSecFull')}</label>
              <input
                type="number"
                min={1}
                value={ex.intervalWorkSec ?? ''}
                onChange={e => {
                  const n = [...exercises];
                  n[blockFlatIndex] = { ...n[blockFlatIndex], intervalWorkSec: parseInt(e.target.value, 10) || 0 };
                  onListChange(n);
                }}
                className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">{t('work.editor.restSecFull')}</label>
              <input
                type="number"
                min={0}
                value={ex.intervalRestSec ?? ''}
                onChange={e => {
                  const n = [...exercises];
                  n[blockFlatIndex] = { ...n[blockFlatIndex], intervalRestSec: parseInt(e.target.value, 10) || 0 };
                  onListChange(n);
                }}
                className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
              />
            </div>
          </>
        )}
        {fmt === 'hiit_tabata' && (
          <div>
            <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">{t('work.editor.rounds')}</label>
            <input
              type="number"
              min={1}
              value={ex.structureRounds ?? ''}
              onChange={e => {
                const n = [...exercises];
                n[blockFlatIndex] = { ...n[blockFlatIndex], structureRounds: parseInt(e.target.value, 10) || 0 };
                onListChange(n);
              }}
              className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
            />
          </div>
        )}
        {fmt === 'intervals' && (
          <div>
            <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">Wiederholungen Sequenz</label>
            <input
              type="number"
              min={1}
              value={ex.intervalRepeat ?? ''}
              onChange={e => {
                const n = [...exercises];
                n[blockFlatIndex] = { ...n[blockFlatIndex], intervalRepeat: parseInt(e.target.value, 10) || 0 };
                onListChange(n);
              }}
              className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
            />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">Notiz (optional)</label>
        <input
          type="text"
          value={ex.notes || ''}
          onChange={e => {
            const n = [...exercises];
            n[blockFlatIndex] = { ...n[blockFlatIndex], notes: e.target.value };
            onListChange(n);
          }}
          placeholder="z. B. gleiche Übung jede Minute …"
          className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="rounded-2xl border border-brand/20 bg-[var(--background)]/80 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Im Block</p>
          <span className="text-[9px] font-black uppercase text-brand">{kids.length} Einträge</span>
        </div>

        <div className="space-y-3 pl-2 border-l-2 border-brand/30">
          {kids.length === 0 ? (
            <p className="text-[10px] text-[var(--text-muted)] font-medium py-1">Übungen oder Unter-Stuktur hinzufügen.</p>
          ) : (
            kids.map(child => {
              const ci = exercises.findIndex(e => e.id === child.id);
              if (ci < 0) return null;
              if (isBlockExercise(child)) {
                return (
                  <BlockRowEditor
                    key={child.id || ci}
                    ex={child}
                    blockFlatIndex={ci}
                    exercises={exercises}
                    templateType={templateType}
                    onListChange={onListChange}
                    onOpenPaletteInside={onOpenPaletteInside}
                    onAddStructureInside={onAddStructureInside}
                    onOpenPaletteReplace={onOpenPaletteReplace}
                  />
                );
              }
              return (
                <NormalExerciseRow
                  key={child.id || ci}
                  ex={child}
                  onUpdate={d => {
                    const n = [...exercises];
                    n[ci] = { ...n[ci], ...d };
                    onListChange(n);
                  }}
                  onRemove={() => onListChange(removeExerciseWithDescendants(exercises, child.id!))}
                  onPickLibrary={() => onOpenPaletteReplace(ci)}
                />
              );
            })
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {templateType === 'Hybrid' ? (
            <>
              <button
                type="button"
                onClick={() => onOpenPaletteInside(bid, 'strength')}
                className="flex-1 min-w-[120px] min-h-[48px] py-3 border border-dashed border-[var(--border-muted)] rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand transition-all flex items-center justify-center gap-2 touch-manipulation"
              >
                <Plus size={14} /> Kraft im Block
              </button>
              <button
                type="button"
                onClick={() => onOpenPaletteInside(bid, 'cardio')}
                className="flex-1 min-w-[120px] min-h-[48px] py-3 border border-dashed border-[var(--border-muted)] rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand transition-all flex items-center justify-center gap-2 touch-manipulation"
              >
                <Plus size={14} /> Cardio im Block
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenPaletteInside(bid, templateType === 'Strength' ? 'strength' : 'cardio')}
              className="flex-1 min-w-[120px] min-h-[48px] py-3 border border-dashed border-[var(--border-muted)] rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand transition-all flex items-center justify-center gap-2 touch-manipulation"
            >
              <Plus size={14} /> Übung im Block
            </button>
          )}

          <div className="relative flex-1 min-w-[140px]" ref={structureInsideRef}>
            <button
              type="button"
              onClick={() => setStructureInsideOpen(o => !o)}
              className="w-full min-h-[48px] py-3 border border-dashed border-brand/40 rounded-xl text-[9px] font-black uppercase tracking-widest text-brand hover:bg-brand/10 transition-all flex items-center justify-center gap-2 touch-manipulation"
            >
              <LayoutList size={14} /> Struktur im Block <ChevronDown size={12} className={cn(structureInsideOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {structureInsideOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-20 bottom-full left-0 right-0 mb-1 bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl shadow-xl overflow-hidden py-1"
                >
                  {(
                    [
                      ['emom', 'EMOM'],
                      ['amrap', 'AMRAP'],
                      ['circuit', t('work.editor.circuit')],
                      ['hiit_tabata', 'HIIT / Tabata'],
                      ['intervals', t('work.editor.intervalSeq')],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className="w-full text-left min-h-[48px] px-4 py-3 text-[10px] font-black uppercase hover:bg-[var(--background)] flex items-center touch-manipulation"
                      onClick={() => {
                        onAddStructureInside(bid, k);
                        setStructureInsideOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Normal Exercise Row ───────────────────────────────────────────────────────

function NormalExerciseRow({
  ex,
  onUpdate,
  onRemove,
  onPickLibrary,
}: {
  ex: Exercise;
  onUpdate: (data: Partial<Exercise>) => void;
  onRemove: () => void;
  onPickLibrary: () => void;
}) {
  const { t } = useI18n();
  const { openExerciseDetail, openExerciseSwap } = useExerciseDetail();
  const lib = ex.exerciseKey ? getLibraryExercise(ex.exerciseKey) : undefined;
  const category: LibraryExerciseCategory = ex.exerciseCategory ?? lib?.category ?? 'strength';
  const isCardio = category === 'cardio';
  const hasIntervals = isCardio && (ex.intervalWorkSec != null && ex.intervalWorkSec > 0);
  const thumb = getExerciseGifUrl(ex.exerciseKey, lib?.gifUrl);

  const applySwap = (repl: LibraryExercise) => {
    onUpdate({
      exerciseKey: repl.key,
      name: repl.name,
      exerciseCategory: repl.category,
    });
  };

  const openDetail = () => {
    openExerciseDetail({
      exercise: lib
        ? { ...lib, name: ex.name }
        : ex.exerciseKey
          ? {
              key: ex.exerciseKey,
              name: ex.name,
              category: ex.exerciseCategory ?? 'strength',
              gifUrl: ex.gifUrl,
            }
          : undefined,
      exerciseKey: ex.exerciseKey,
      name: ex.name,
    });
  };
  const openSwap = () => {
    openExerciseSwap({
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      onSwap: applySwap,
    });
  };

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--background)] border border-[var(--border-muted)] rounded-2xl p-4 sm:p-5 relative"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span
          className={cn(
            'text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg',
            isCardio ? 'bg-orange-500/15 text-orange-600' : 'bg-blue-500/15 text-blue-600',
          )}
        >
          {isCardio ? 'Cardio' : 'Kraft'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-red-500 p-2 -mr-1 touch-manipulation"
          aria-label="Entfernen"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="flex gap-3 items-start">
          {thumb ? (
            <button type="button" onClick={openDetail} className="shrink-0 touch-manipulation">
              <img src={thumb} alt="" className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl object-cover bg-black/30" loading="lazy" />
            </button>
          ) : null}
          <div className="flex-1 min-w-0 space-y-2">
            <button
              type="button"
              onClick={ex.name ? openDetail : onPickLibrary}
              className="w-full text-left touch-manipulation"
            >
              <p
                className={cn(
                  'text-base sm:text-lg font-black leading-snug text-[var(--text-primary)]',
                  !ex.name && 'text-[var(--text-muted)]',
                )}
              >
                {ex.name || 'Übung aus Bibliothek wählen…'}
              </p>
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPickLibrary}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-1.5 touch-manipulation"
              >
                <Search size={12} /> Bibliothek
              </button>
              {ex.name && (
                <>
                  <button
                    type="button"
                    onClick={openDetail}
                    className="min-h-[40px] px-3 rounded-xl border border-[var(--border-muted)] text-[9px] font-black uppercase tracking-widest touch-manipulation"
                  >
                    {t('exercise.action.info')}
                  </button>
                  <button
                    type="button"
                    onClick={openSwap}
                    className="min-h-[40px] px-3 rounded-xl border border-brand/30 text-[9px] font-black uppercase tracking-widest text-brand touch-manipulation"
                  >
                    {t('exercise.action.swap')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-black uppercase text-[var(--text-muted)] whitespace-nowrap">Supersatz</label>
          <select
            value={ex.supersetGroup || ''}
            onChange={e => onUpdate({ supersetGroup: e.target.value || undefined })}
            className="flex-1 min-w-[80px] text-[10px] font-black uppercase bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:border-brand touch-manipulation"
          >
            {SUPERSET_OPTIONS.map(o => (
              <option key={o || '—'} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </div>

        {isCardio ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block flex items-center gap-1">
                  <Timer size={9} /> {t('work.editor.durationMin')}
                </label>
                <input
                  type="number"
                  value={ex.durationSec != null && ex.durationSec > 0 ? Math.round(ex.durationSec / 60) : ''}
                  min={0}
                  onChange={e => {
                    const m = parseInt(e.target.value, 10);
                    onUpdate({ durationSec: Number.isFinite(m) && m > 0 ? m * 60 : undefined });
                  }}
                  placeholder="—"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block flex items-center gap-1">
                  <Ruler size={9} /> {t('work.editor.distanceKm')}
                </label>
                <input
                  type="number"
                  value={ex.distanceKm ?? ''}
                  step={0.1}
                  min={0}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    onUpdate({ distanceKm: Number.isFinite(v) ? v : undefined });
                  }}
                  placeholder="—"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-[var(--border-muted)] p-4 space-y-3">
              <p className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest">{t('work.editor.intervalOptional')}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-0.5 block">{t('work.editor.workSec')}</label>
                  <input
                    type="number"
                    min={0}
                    value={ex.intervalWorkSec ?? ''}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      onUpdate({ intervalWorkSec: Number.isFinite(v) && v > 0 ? v : undefined });
                    }}
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg py-2 px-2 text-center text-xs font-black focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-0.5 block">{t('work.editor.restSec')}</label>
                  <input
                    type="number"
                    min={0}
                    value={ex.intervalRestSec ?? ''}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      onUpdate({ intervalRestSec: Number.isFinite(v) && v >= 0 ? v : undefined });
                    }}
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg py-2 px-2 text-center text-xs font-black focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-0.5 block">{t('work.editor.repeats')}</label>
                  <input
                    type="number"
                    min={1}
                    value={ex.intervalRepeat ?? ''}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      onUpdate({ intervalRepeat: Number.isFinite(v) && v > 0 ? v : undefined });
                    }}
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg py-2 px-2 text-center text-xs font-black focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
              {hasIntervals && (
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-0.5 block">{t('work.editor.setsAsRounds')}</label>
                  <input
                    type="number"
                    min={1}
                    value={typeof ex.sets === 'number' ? ex.sets : 1}
                    onChange={e => onUpdate({ sets: parseInt(e.target.value, 10) || 1 })}
                    className="w-full max-w-[5rem] bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg py-2 px-2 text-center text-xs font-black focus:border-brand focus:outline-none"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">{t('work.editor.sets')}</label>
              <input
                type="number"
                value={typeof ex.sets === 'number' ? ex.sets : 0}
                min={1}
                onChange={e => onUpdate({ sets: parseInt(e.target.value, 10) || 1 })}
                className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">Wdh.</label>
              <input
                type="number"
                value={ex.reps || 0}
                min={0}
                onChange={e => onUpdate({ reps: parseInt(e.target.value, 10) })}
                className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">KG</label>
              <input
                type="number"
                value={ex.weight || 0}
                step={2.5}
                min={0}
                onChange={e => onUpdate({ weight: parseFloat(e.target.value) })}
                className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-center text-sm font-black focus:border-brand focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-black uppercase text-[var(--text-muted)] tracking-widest mb-1 block">Notiz (optional)</label>
          <input
            type="text"
            value={ex.notes || ''}
            onChange={e => onUpdate({ notes: e.target.value })}
            placeholder="Tempo, Pacing, …"
            className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-xl py-2.5 px-3 text-sm focus:border-brand focus:outline-none"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Exercise List ─────────────────────────────────────────────────────────────

function ExerciseList({
  exercises,
  templateType,
  onChange,
}: {
  exercises: Exercise[];
  templateType: 'Strength' | 'Cardio' | 'Hybrid';
  onChange: (ex: Exercise[]) => void;
}) {
  const { t } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteRestrict, setPaletteRestrict] = useState<LibraryExerciseCategory | undefined>(undefined);
  const [paletteReplaceIndex, setPaletteReplaceIndex] = useState<number | null>(null);
  const [paletteStructureParent, setPaletteStructureParent] = useState<string | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);
  const structureMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!structureOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = structureMenuRef.current;
      if (el && !el.contains(e.target as Node)) setStructureOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [structureOpen]);

  const openPaletteForNew = (restrict: LibraryExerciseCategory | undefined, structureParentId: string | null = null) => {
    setPaletteReplaceIndex(null);
    setPaletteRestrict(restrict);
    setPaletteStructureParent(structureParentId);
    setPaletteOpen(true);
  };

  const openPaletteInside = (parentId: string, restrict: LibraryExerciseCategory | undefined) => {
    openPaletteForNew(restrict, parentId);
  };

  const openPaletteReplace = (index: number) => {
    const ex = exercises[index];
    if (isBlockExercise(ex)) return;
    let r: LibraryExerciseCategory | undefined;
    if (templateType === 'Strength') r = 'strength';
    else if (templateType === 'Cardio') r = 'cardio';
    else r = ex.exerciseCategory ?? (ex.exerciseKey ? getLibraryExercise(ex.exerciseKey)?.category : undefined);
    setPaletteRestrict(r);
    setPaletteReplaceIndex(index);
    setPaletteStructureParent(null);
    setPaletteOpen(true);
  };

  const applyLibraryPickMultiple = (items: LibraryExercise[]) => {
    const parent = paletteStructureParent ?? undefined;
    const added = items.map(item => exerciseFromLibraryItem(item, parent));
    onChange([...exercises, ...added]);
    setPaletteOpen(false);
    setPaletteStructureParent(null);
  };

  const applyLibraryPick = (item: LibraryExercise) => {
    if (paletteReplaceIndex !== null) {
      const n = [...exercises];
      const prev = n[paletteReplaceIndex];
      n[paletteReplaceIndex] = {
        ...exerciseFromLibraryItem(item),
        id: prev.id,
        structureParentId: prev.structureParentId,
        notes: prev.notes,
        supersetGroup: prev.supersetGroup,
        durationSec: prev.durationSec,
        distanceKm: prev.distanceKm,
        intervalWorkSec: prev.intervalWorkSec,
        intervalRestSec: prev.intervalRestSec,
        intervalRepeat: prev.intervalRepeat,
      };
      if (item.category === 'strength') {
        n[paletteReplaceIndex].durationSec = undefined;
        n[paletteReplaceIndex].distanceKm = undefined;
        n[paletteReplaceIndex].intervalWorkSec = undefined;
        n[paletteReplaceIndex].intervalRestSec = undefined;
        n[paletteReplaceIndex].intervalRepeat = undefined;
      } else {
        n[paletteReplaceIndex].sets = typeof prev.sets === 'number' ? prev.sets : 1;
      }
      onChange(n);
    } else {
      const parent = paletteStructureParent ?? undefined;
      onChange([...exercises, exerciseFromLibraryItem(item, parent)]);
    }
    setPaletteOpen(false);
    setPaletteStructureParent(null);
  };

  const updateEx = (i: number, d: Partial<Exercise>) => {
    const n = [...exercises];
    n[i] = { ...n[i], ...d };
    onChange(n);
  };

  const addStructure = (format: Exclude<Exercise['blockFormat'], undefined | 'normal'>) => {
    onChange([...exercises, createBlockExercise(format)]);
    setStructureOpen(false);
  };

  const roots = rootsInListOrder(exercises);

  return (
    <div className="space-y-3">
      {roots.map(r => {
        const i = exercises.findIndex(e => e.id === r.id);
        if (i < 0) return null;
        if (isBlockExercise(r)) {
          return (
            <BlockRowEditor
              key={r.id || i}
              ex={r}
              blockFlatIndex={i}
              exercises={exercises}
              templateType={templateType}
              onListChange={onChange}
              onOpenPaletteInside={openPaletteInside}
              onAddStructureInside={(parentId, format) => onChange([...exercises, createBlockExercise(format, parentId)])}
              onOpenPaletteReplace={openPaletteReplace}
            />
          );
        }
        return (
          <NormalExerciseRow
            key={r.id || i}
            ex={r}
            onUpdate={d => updateEx(i, d)}
            onRemove={() => onChange(removeExerciseWithDescendants(exercises, r.id!))}
            onPickLibrary={() => openPaletteReplace(i)}
          />
        );
      })}

      <div className="flex flex-col sm:flex-row gap-2">
        {templateType === 'Hybrid' ? (
          <>
            <button
              type="button"
              onClick={() => openPaletteForNew('strength', null)}
              className="flex-1 py-4 border-2 border-dashed border-[var(--border-muted)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand hover:bg-brand/5 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> {t('work.editor.addStrength')}
            </button>
            <button
              type="button"
              onClick={() => openPaletteForNew('cardio', null)}
              className="flex-1 py-4 border-2 border-dashed border-[var(--border-muted)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand hover:bg-brand/5 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> {t('work.editor.addCardio')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => openPaletteForNew(templateType === 'Strength' ? 'strength' : 'cardio', null)}
            className="flex-1 py-4 border-2 border-dashed border-[var(--border-muted)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand hover:bg-brand/5 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} />{' '}
            {templateType === 'Cardio' ? t('work.editor.addCardioFromLib') : t('work.editor.addFromLib')}
          </button>
        )}

        <div className="relative flex-1 min-w-[140px]" ref={structureMenuRef}>
          <button
            type="button"
            onClick={() => setStructureOpen(o => !o)}
            className="w-full py-4 border-2 border-dashed border-brand/40 rounded-2xl text-[9px] font-black uppercase tracking-widest text-brand hover:bg-brand/10 transition-all flex items-center justify-center gap-2"
          >
            <LayoutList size={16} /> Struktur <ChevronDown size={14} className={cn(structureOpen && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {structureOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 bottom-full left-0 right-0 mb-1 bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl shadow-xl overflow-hidden py-1"
              >
                {(
                  [
                    ['emom', 'EMOM'],
                    ['amrap', 'AMRAP'],
                    ['circuit', t('work.editor.circuit')],
                    ['hiit_tabata', 'HIIT / Tabata'],
                    ['intervals', t('work.editor.intervalSeq')],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className="w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-[var(--background)]"
                    onClick={() => addStructure(k)}
                  >
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ExercisePaletteModal
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteReplaceIndex(null);
          setPaletteStructureParent(null);
        }}
        onPick={paletteReplaceIndex !== null ? applyLibraryPick : undefined}
        onPickMultiple={paletteReplaceIndex === null ? applyLibraryPickMultiple : undefined}
        multiSelect={paletteReplaceIndex === null}
        restrict={paletteRestrict}
      />
    </div>
  );
}

// ─── Type Picker ───────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'Strength' as const, icon: Dumbbell, desc: 'Kraft & Hypertrophie' },
  { id: 'Cardio' as const, icon: Zap, desc: 'Ausdauer & Conditioning' },
  { id: 'Hybrid' as const, icon: Activity, desc: 'Mix aus beidem' },
] as const;

function TypePicker({ value, onChange }: { value: string; onChange: (v: 'Strength' | 'Cardio' | 'Hybrid') => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TYPE_OPTIONS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all',
            value === t.id ? 'border-brand bg-brand/5' : 'border-[var(--border-muted)] bg-[var(--card-bg)]',
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              value === t.id ? 'ui-mark-selected' : 'bg-[var(--background)] text-[var(--text-muted)]',
            )}
          >
            <t.icon size={18} />
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest">{t.id}</p>
          <p className="text-[8px] text-[var(--text-muted)] font-medium leading-tight">{t.desc}</p>
        </button>
      ))}
    </div>
  );
}

// ─── Plan: Wochen-Strip + Detail-Panel ─────────────────────────────────────────

function PlanEditor({
  weekPlan,
  onChangeWeek,
}: {
  weekPlan: TemplateDayPlan[];
  onChangeWeek: (w: TemplateDayPlan[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [pendingDayFocus, setPendingDayFocus] = useState<TemplateDayPlan['type'] | null>(null);
  const [pendingRestClear, setPendingRestClear] = useState(false);
  const day = weekPlan[activeIdx];

  const updateDay = (i: number, d: TemplateDayPlan) => {
    const n = [...weekPlan];
    n[i] = d;
    onChangeWeek(n);
  };

  const toggleRestDay = () => {
    if (!day.isRest && day.exercises.length > 0) {
      setPendingRestClear(true);
      return;
    }
    updateDay(activeIdx, {
      ...day,
      isRest: !day.isRest,
      exercises: day.isRest ? day.exercises : [],
    });
  };

  const summary = useMemo(() => {
    const train = weekPlan.filter(d => !d.isRest).length;
    const rest = weekPlan.filter(d => d.isRest).length;
    const ex = weekPlan.reduce((s, d) => s + (d.isRest ? 0 : d.exercises.length), 0);
    return { train, rest, ex };
  }, [weekPlan]);

  if (!day) return null;

  const dayShort = (d: string) => ({ Monday: 'Mo', Tuesday: 'Di', Wednesday: 'Mi', Thursday: 'Do', Friday: 'Fr', Saturday: 'Sa', Sunday: 'So' } as const)[d as TemplateDayPlan['day']] ?? d;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Wochenübersicht</p>
        <p className="text-[9px] font-black uppercase tracking-widest text-brand">
          {summary.train} Trainingstage · {summary.rest} Ruhetage · {summary.ex} Bausteine
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 snap-x snap-mandatory scrollbar-thin">
        {weekPlan.map((d, i) => (
          <button
            key={d.day}
            type="button"
            onClick={() => setActiveIdx(i)}
            className={cn(
              'snap-start shrink-0 w-[92px] sm:w-[100px] rounded-2xl border-2 p-3.5 text-left transition-all',
              i === activeIdx ? 'border-brand bg-brand/10 shadow-lg shadow-brand/10' : 'border-[var(--border-muted)] bg-[var(--card-bg)] hover:border-brand/40',
            )}
          >
            <p className="text-[10px] font-black text-[var(--text-primary)]">{dayShort(d.day)}</p>
            <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase mt-0.5 truncate">{d.day.slice(0, 3)}</p>
            {d.isRest ? (
              <span className="mt-2 inline-block text-[8px] font-black uppercase text-[var(--text-muted)]">Ruhe</span>
            ) : (
              <span className="mt-2 inline-block text-[8px] font-black uppercase text-brand">{d.exercises.length} Üb.</span>
            )}
          </button>
        ))}
      </div>

      <motion.div
        layout
        className="rounded-[1.75rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] overflow-hidden"
      >
        <div
          className={cn(
            'px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 border-b border-[var(--border-muted)]',
            day.isRest && 'opacity-80',
          )}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={toggleRestDay}
              className={cn(
                'min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center text-xs font-black transition-all',
                day.isRest ? 'bg-[var(--border-muted)] text-[var(--text-muted)]' : 'ui-mark-selected',
              )}
              aria-pressed={!day.isRest}
            >
              {dayShort(day.day)}
            </button>
            <div className="flex-1 min-w-0">
              {day.isRest ? (
                <p className="text-sm font-black uppercase text-[var(--text-muted)]">Ruhetag — {day.day}</p>
              ) : (
                <input
                  type="text"
                  value={day.name || ''}
                  onChange={e => updateDay(activeIdx, { ...day, name: e.target.value })}
                  placeholder={`${day.day} Session`}
                  className="w-full text-base sm:text-lg font-black bg-transparent focus:outline-none text-[var(--text-primary)] placeholder:opacity-30"
                />
              )}
            </div>
          </div>
          {!day.isRest && (
            <select
              value={day.type || 'Strength'}
              onChange={e => {
                const next = e.target.value as TemplateDayPlan['type'];
                const cur = day.type || 'Strength';
                if (next === cur) return;
                if (day.exercises.length === 0) {
                  updateDay(activeIdx, { ...day, type: next });
                  return;
                }
                setPendingDayFocus(next);
              }}
              className="text-[10px] font-black uppercase bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 min-h-[48px] focus:outline-none focus:border-brand shrink-0"
            >
              <option value="Strength">Strength</option>
              <option value="Cardio">Cardio</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          )}
        </div>

        {!day.isRest && (
          <div className="p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Inhalt</p>
            <ExerciseList
              exercises={day.exercises}
              templateType={day.type || 'Strength'}
              onChange={ex => updateDay(activeIdx, { ...day, exercises: ex })}
            />
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {pendingDayFocus && (
          <div className={mobileSheetOverlayClass()}>
            <motion.button
              type="button"
              aria-label="Schließen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingDayFocus(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 24 }}
              className="relative z-10 w-full max-w-md rounded-t-[2rem] lg:rounded-[2rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] p-6 sm:p-8 shadow-2xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-black italic uppercase tracking-tighter mb-4">Schwerpunkt wechseln?</h3>
              <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed mb-8">
                Fortfahren schaltet einen neuen Aufbau frei und entfernt alle Bausteine unter dem bisherigen Fokus für diesen
                Tag.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={() => setPendingDayFocus(null)}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] touch-manipulation"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingDayFocus) updateDay(activeIdx, { ...day, type: pendingDayFocus, exercises: [] });
                    setPendingDayFocus(null);
                  }}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 touch-manipulation"
                >
                  Fortfahren
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {pendingRestClear && (
          <div className={mobileSheetOverlayClass()}>
            <motion.button
              type="button"
              aria-label="Schließen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingRestClear(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 24 }}
              className="relative z-10 w-full max-w-md rounded-t-[2rem] lg:rounded-[2rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] p-6 sm:p-8 shadow-2xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-black italic uppercase tracking-tighter mb-4">Ruhetag setzen?</h3>
              <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed mb-8">
                Alle Übungen dieses Tages werden entfernt. Das lässt sich nicht rückgängig machen.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={() => setPendingRestClear(false)}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] touch-manipulation"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDay(activeIdx, { ...day, isRest: true, exercises: [] });
                    setPendingRestClear(false);
                  }}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 touch-manipulation"
                >
                  Ruhetag setzen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function WorkoutTemplateEditor({ template, onSave, onClose }: Props) {
  const { t } = useI18n();
  const isEdit = !!template.id;
  const initialMode: 'workout' | 'plan' = template.templateMode === 'plan' ? 'plan' : 'workout';

  const [mode, setMode] = useState<'workout' | 'plan'>(initialMode);
  const [modeChosen, setModeChosen] = useState(isEdit || !!template.templateMode);

  const [name, setName] = useState(template.name || '');
  const [type, setType] = useState<'Strength' | 'Cardio' | 'Hybrid'>(template.type || 'Strength');
  const [exercises, setExercises] = useState<Exercise[]>(template.exercises || []);
  const [pendingFocus, setPendingFocus] = useState<null | { next: 'Strength' | 'Cardio' | 'Hybrid' }>(null);
  const [saveError, setSaveError] = useState('');

  const [planName, setPlanName] = useState(template.name || '');
  const [weekPlan, setWeekPlan] = useState<TemplateDayPlan[]>(
    template.weekPlan || WEEKDAYS.map(d => ({ day: d, isRest: d === 'Saturday' || d === 'Sunday', exercises: [] })),
  );

  const derivedPlanType = useMemo(() => deriveTemplateTypeFromWeek(weekPlan), [weekPlan]);

  const handleSave = () => {
    if (mode === 'workout') {
      const trimmed = name.trim();
      if (!trimmed) {
        setSaveError(t('work.tpl.err.name'));
        return;
      }
      if (exercises.length === 0) {
        setSaveError(t('work.tpl.err.exercises'));
        return;
      }
      setSaveError('');
      onSave({ ...template, name: trimmed, type, templateMode: 'workout', exercises, weekPlan: undefined });
    } else {
      const trimmed = planName.trim();
      if (!trimmed) {
        setSaveError(t('work.tpl.err.name'));
        return;
      }
      const trainDays = weekPlan.filter(d => !d.isRest && d.exercises.length > 0);
      if (trainDays.length === 0) {
        setSaveError(t('work.tpl.err.planDays'));
        return;
      }
      setSaveError('');
      onSave({
        ...template,
        name: trimmed,
        type: derivedPlanType,
        templateMode: 'plan',
        exercises: [],
        weekPlan,
      });
    }
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <header className="px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-4 border-b border-[var(--border-muted)] bg-[var(--card-bg)] flex-shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--border-muted)] transition-colors shrink-0 touch-manipulation" aria-label="Schließen">
            <X size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-black italic uppercase tracking-tighter truncate">
              {isEdit ? 'Bearbeiten' : 'Neu'} · {mode === 'plan' ? 'Trainingsplan' : 'Workout'}
            </h2>
            {modeChosen && (
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {mode === 'plan' ? 'Woche strukturieren & aktivieren' : 'Einzelnes Training · frei starten'}
              </p>
            )}
          </div>
        </div>
        {modeChosen && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            {saveError ? (
              <p className="text-[10px] font-bold text-red-500 max-w-[14rem] text-right" role="alert">
                {saveError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 ui-btn-brand min-h-[44px] px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-brand/20 hover:opacity-90 transition-opacity touch-manipulation"
            >
              <Save size={15} /> Speichern
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-5 sm:p-8">
        <div className={cn('mx-auto space-y-8 sm:space-y-10 pb-24 sm:pb-28', mode === 'plan' ? 'max-w-5xl' : 'max-w-2xl')}>

          {!modeChosen && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Was möchtest du anlegen?</p>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter">Typ wählen</h3>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:gap-6 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    setMode('workout');
                    setModeChosen(true);
                  }}
                  className="p-6 sm:p-8 rounded-[2rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] text-left hover:border-brand transition-all group touch-manipulation"
                >
                  <div className="w-14 h-14 bg-[var(--background)] group-hover:border group-hover:border-brand/40 group-hover:bg-brand/10 rounded-2xl flex items-center justify-center text-[var(--text-muted)] group-hover:text-brand transition-all mb-4">
                    <Dumbbell size={24} />
                  </div>
                  <h4 className="text-lg font-black uppercase italic tracking-tight mb-1">Einzelworkout</h4>
                  <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">
                    Ein gespeichertes Training für Extra-Workouts — inkl. Hybrid, Supersätze und Cardio-Intervalle aus der Übungsbibliothek.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('plan');
                    setModeChosen(true);
                  }}
                  className="p-6 sm:p-8 rounded-[2rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] text-left hover:border-brand transition-all group touch-manipulation"
                >
                  <div className="w-14 h-14 bg-[var(--background)] group-hover:border group-hover:border-brand/40 group-hover:bg-brand/10 rounded-2xl flex items-center justify-center text-[var(--text-muted)] group-hover:text-brand transition-all mb-4">
                    <Calendar size={24} />
                  </div>
                  <h4 className="text-lg font-black uppercase italic tracking-tight mb-1">Wochenplan</h4>
                  <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed">
                    Volle Woche mit Ruhetagen: Tag auswählen, Fokus setzen, Übungen aus derselben Bibliothek wie beim Einzelworkout.
                  </p>
                </button>
              </div>
            </div>
          )}

          {modeChosen && mode === 'workout' && (
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z. B. Upper Power"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-5 text-lg font-black focus:border-brand focus:outline-none placeholder:opacity-30"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Schwerpunkt</label>
                <TypePicker
                  value={type}
                  onChange={next => {
                    if (next === type) return;
                    if (exercises.length === 0) {
                      setType(next);
                      return;
                    }
                    setPendingFocus({ next });
                  }}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Bausteine</label>
                  <span className="text-[10px] font-black uppercase text-brand">{exercises.length} Einträge</span>
                </div>
                <ExerciseList exercises={exercises} templateType={type} onChange={setExercises} />
              </div>
            </div>
          )}

          {modeChosen && mode === 'plan' && (
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Planname</label>
                <input
                  type="text"
                  value={planName}
                  onChange={e => setPlanName(e.target.value)}
                  placeholder="z. B. 4-Tage Kraft + Cardio"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-2xl p-5 text-lg font-black focus:border-brand focus:outline-none placeholder:opacity-30"
                />
              </div>
              <p className="text-[10px] text-[var(--text-muted)] font-bold leading-relaxed">
                Der gespeicherte Plantyp ({derivedPlanType}) wird automatisch aus den gewählten Tagen abgeleitet (Hybrid, wenn gemischt).
              </p>
              <PlanEditor weekPlan={weekPlan} onChangeWeek={setWeekPlan} />
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {pendingFocus && (
          <div className={mobileSheetOverlayClass()}>
            <motion.button
              type="button"
              aria-label="Schließen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingFocus(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 24 }}
              className="relative z-10 w-full max-w-md rounded-t-[2rem] lg:rounded-[2rem] border-2 border-[var(--border-muted)] bg-[var(--card-bg)] p-6 sm:p-8 shadow-2xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-black italic uppercase tracking-tighter mb-4">Schwerpunkt wechseln?</h3>
              <p className="text-sm text-[var(--text-muted)] font-medium leading-relaxed mb-8">
                Fortfahren schaltet einen neuen Aufbau frei und entfernt alle Bausteine unter dem bisherigen Schwerpunkt
                (Strength / Cardio / Hybrid).
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={() => setPendingFocus(null)}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] touch-manipulation"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingFocus) {
                      setType(pendingFocus.next);
                      setExercises([]);
                    }
                    setPendingFocus(null);
                  }}
                  className="flex-1 min-h-[52px] py-3.5 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 touch-manipulation"
                >
                  Fortfahren
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
