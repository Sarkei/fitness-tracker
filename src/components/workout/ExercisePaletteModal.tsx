/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2, Check, Info } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  LIBRARY_MUSCLE_FILTERS,
  LIBRARY_MUSCLE_FILTER_ROW_IDS,
  type LibraryExercise,
  type LibraryExerciseCategory,
  type LibraryMuscleFilterId,
} from '@/src/lib/exerciseLibrary';
import { searchExercisesCatalog, fetchExerciseDbStatus } from '@/src/services/exerciseDbService';
import { getExerciseGifUrl } from '@/src/lib/exerciseMedia';
import { useExerciseDetail } from '@/src/lib/exerciseDetailContext';
import { useLocalExerciseLibrary } from '@/src/lib/exercisePool';
import {
  mobileSheetOverlayClass,
  MobileOverlayRoot,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

const USE_LOCAL_EXERCISE_LIBRARY = useLocalExerciseLibrary();

const CARDIO_SUBFILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'laufen', label: 'Laufen' },
  { id: 'bike', label: 'Rad' },
  { id: 'rudern', label: 'Ruder / Ski' },
  { id: 'hiit', label: 'HIIT' },
  { id: 'schwimmen', label: 'Schwimmen' },
  { id: 'gerät', label: 'Gerät' },
];

function ExerciseThumb({ item }: { item: LibraryExercise }) {
  const gif = getExerciseGifUrl(item.key, item.gifUrl);
  if (!gif) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[10px] font-black text-[var(--text-muted)]">
        {item.category === 'strength' ? 'K' : 'C'}
      </span>
    );
  }
  return (
    <img src={gif} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover bg-black/30" loading="lazy" />
  );
}

export default function ExercisePaletteModal({
  open,
  onClose,
  onPick,
  onPickMultiple,
  restrict,
  multiSelect = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick?: (ex: LibraryExercise) => void;
  onPickMultiple?: (items: LibraryExercise[]) => void;
  restrict?: LibraryExerciseCategory;
  /** Mehrere Übungen per Checkbox auswählen */
  multiSelect?: boolean;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | LibraryExerciseCategory>('all');
  const [muscleFilter, setMuscleFilter] = useState<LibraryMuscleFilterId>('all');
  const [cardioTag, setCardioTag] = useState<string>('all');
  const [remoteList, setRemoteList] = useState<LibraryExercise[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { openExerciseDetail } = useExerciseDetail();

  const effectiveTab: 'all' | LibraryExerciseCategory = restrict ?? tab;

  const showMuscleRow = useMemo(() => {
    if (restrict === 'cardio') return false;
    if (effectiveTab === 'cardio') return false;
    return true;
  }, [restrict, effectiveTab]);

  const muscleChipList = useMemo(() => {
    if (restrict === 'strength' || effectiveTab === 'strength') {
      return LIBRARY_MUSCLE_FILTERS.filter(c => c.id !== 'cardio_art');
    }
    return LIBRARY_MUSCLE_FILTERS;
  }, [restrict, effectiveTab]);

  const muscleFilterRows = useMemo(() => {
    const byId = new Map(muscleChipList.map(c => [c.id, c]));
    return LIBRARY_MUSCLE_FILTER_ROW_IDS.map(row =>
      row.map(id => byId.get(id)).filter((c): c is (typeof LIBRARY_MUSCLE_FILTERS)[number] => Boolean(c)),
    ).filter(row => row.length > 0);
  }, [muscleChipList]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      return;
    }
    fetchExerciseDbStatus()
      .then(s => setApiConfigured(s.configured))
      .catch(() => setApiConfigured(false));
  }, [open]);

  const loadRemote = useCallback(async () => {
    if (apiConfigured !== true) return;
    const muscle = showMuscleRow ? muscleFilter : 'all';
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const catFilter =
        effectiveTab === 'all' ? undefined : (effectiveTab as LibraryExerciseCategory);
      let rows = await searchExercisesCatalog({
        q: q.trim() || undefined,
        muscle: muscle === 'all' ? undefined : muscle,
        limit: muscle === 'all' ? 40 : 48,
      });
      if (catFilter) rows = rows.filter(e => e.category === catFilter);
      if (!showMuscleRow && cardioTag !== 'all') {
        rows = rows.filter(e => e.tags?.includes(cardioTag));
      }
      setRemoteList(rows);
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : 'Übungen konnten nicht geladen werden.');
      setRemoteList([]);
    } finally {
      setRemoteLoading(false);
    }
  }, [apiConfigured, q, muscleFilter, showMuscleRow, cardioTag, effectiveTab]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void loadRemote(), 280);
    return () => window.clearTimeout(t);
  }, [open, loadRemote, apiConfigured]);

  const list = remoteList;
  const selectedItems = useMemo(
    () => list.filter(item => selected.has(item.key)),
    [list, selected],
  );

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const confirmMulti = () => {
    if (!onPickMultiple || selectedItems.length === 0) return;
    onPickMultiple(selectedItems);
    setSelected(new Set());
    setQ('');
    onClose();
  };

  const showRemoteHint = apiConfigured === false && list.length === 0 && !remoteLoading;

  return (
    <MobileOverlayRoot open={open}>
        <motion.div
          className={mobileSheetOverlayClass()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="Schließen" onClick={onClose} />
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[88dvh] lg:rounded-3xl"
            style={{ paddingBottom: multiSelect ? '0' : 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-4">
              <div>
                <h3 className="text-sm font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
                  {multiSelect ? 'Übungen auswählen' : 'Übung wählen'}
                </h3>
                <p className="text-[8px] font-black uppercase tracking-widest text-brand mt-0.5">ExerciseDB</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl hover:bg-[var(--background)]"
                aria-label="Schließen"
              >
                <X size={20} />
              </button>
            </div>

            {restrict == null && (
              <div className="flex shrink-0 border-b border-[var(--border-muted)]">
                {(['all', 'strength', 'cardio'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setTab(k);
                      setMuscleFilter('all');
                      setCardioTag('all');
                    }}
                    className={cn(
                      'min-h-[44px] flex-1 touch-manipulation py-2.5 text-[9px] font-black uppercase tracking-widest',
                      effectiveTab === k ? 'bg-brand/15 text-brand' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {k === 'all' ? 'Alle' : k === 'strength' ? 'Kraft' : 'Cardio'}
                  </button>
                ))}
              </div>
            )}

            {!showMuscleRow && (restrict === 'cardio' || effectiveTab === 'cardio') && (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border-muted)] px-3 py-2 [-webkit-overflow-scrolling:touch]">
                {CARDIO_SUBFILTERS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCardioTag(c.id)}
                    className={cn(
                      'min-h-[36px] shrink-0 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest whitespace-nowrap',
                      cardioTag === c.id ? 'ui-mark-selected' : 'bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border-muted)]',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {showMuscleRow && (
              <div className="shrink-0 space-y-1.5 border-b border-[var(--border-muted)] px-3 py-2">
                {muscleFilterRows.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    className={cn(
                      'grid gap-1.5',
                      row.length <= 3 ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6',
                    )}
                  >
                    {row.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setMuscleFilter(c.id)}
                        className={cn(
                          'min-h-[36px] w-full rounded-xl px-2 py-1.5 text-[8px] font-black uppercase tracking-widest touch-manipulation',
                          muscleFilter === c.id
                            ? 'ui-mark-selected'
                            : 'border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-muted)]',
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="shrink-0 border-b border-[var(--border-muted)] p-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Suchen oder Muskelgruppe wählen…"
                  className="min-h-[48px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] pl-10 pr-3 text-base font-bold text-[var(--text-primary)]"
                />
              </div>
            </div>

            {showRemoteHint && (
              <p className="shrink-0 px-4 py-2 text-xs text-amber-600">ExerciseDB nicht konfiguriert (EXERCISEDB_RAPIDAPI_KEY).</p>
            )}
            {remoteError && <p className="shrink-0 px-4 py-2 text-xs text-red-500">{remoteError}</p>}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain divide-y divide-[var(--border-muted)] [-webkit-overflow-scrolling:touch]">
              {apiConfigured === null && !USE_LOCAL_EXERCISE_LIBRARY && (
                <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">ExerciseDB-Status…</span>
                </div>
              )}
              {remoteLoading && apiConfigured === true && (
                <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Laden…</span>
                </div>
              )}
              {!remoteLoading && apiConfigured !== null && list.length === 0 && !showRemoteHint && !remoteError && (
                <p className="py-10 text-center text-xs text-[var(--text-muted)]">Keine Treffer — Suchbegriff oder Filter ändern</p>
              )}
              {list.map(item => {
                const isOn = selected.has(item.key);
                return (
                  <div key={item.key} className="flex items-center gap-2 px-3 py-2.5">
                    {multiSelect && (
                      <button
                        type="button"
                        onClick={() => toggleSelect(item.key)}
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 touch-manipulation',
                          isOn ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]' : 'border-[var(--border-muted)] bg-[var(--background)]',
                        )}
                        aria-label={isOn ? 'Abwählen' : 'Auswählen'}
                      >
                        {isOn && <Check size={18} strokeWidth={3} />}
                      </button>
                    )}
                    <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2">
                      <ExerciseThumb item={item} />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (multiSelect) {
                              openExerciseDetail({ exercise: item });
                              return;
                            }
                            onPick?.(item);
                            setQ('');
                            onClose();
                          }}
                          className="w-full text-left touch-manipulation active:opacity-90"
                        >
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-2 underline-offset-2 hover:underline">
                            {item.name}
                          </p>
                        </button>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-0.5 pl-0">
                          {item.targetMuscle || item.bodyPart || (item.category === 'strength' ? 'Kraft' : 'Cardio')}
                        </p>
                      </div>
                      {multiSelect ? (
                        <button
                          type="button"
                          onClick={() => openExerciseDetail({ exercise: item })}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-brand touch-manipulation"
                          aria-label="Übungsinfos"
                        >
                          <Info size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {multiSelect && (
              <div
                className="shrink-0 border-t border-[var(--border-muted)] bg-[var(--card-bg)] p-4 flex gap-2"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[52px] flex-1 rounded-2xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={confirmMulti}
                  className="min-h-[52px] flex-[2] rounded-2xl ui-btn-brand text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {selectedItems.length > 0 ? `${selectedItems.length} hinzufügen` : 'Übungen wählen'}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
    </MobileOverlayRoot>
  );
}
