/**
 * Übung tauschen: ähnliche Übungen + freie ExerciseDB-Suche (ohne Detailansicht).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2, RefreshCw } from 'lucide-react';
import { displayCoachExerciseName } from '@/src/lib/coachExerciseDisplay';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import { getExerciseGifUrl } from '@/src/lib/exerciseMedia';
import { useI18n } from '@/src/lib/i18n';
import { isExerciseDbCatalogKey } from '@/src/lib/exerciseDb';
import {
  fetchExerciseDbStatus,
  fetchSimilarExercises,
  searchExercisesCatalog,
} from '@/src/services/exerciseDbService';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

function ExerciseThumb({ item }: { item: LibraryExercise }) {
  const gif = getExerciseGifUrl(item.key, item.gifUrl);
  if (!gif) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[10px] font-black text-[var(--text-muted)]">
        ·
      </span>
    );
  }
  return <img src={gif} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover bg-black/30" loading="lazy" />;
}

export default function ExerciseSwapModal({
  open,
  exerciseKey,
  exerciseName,
  onClose,
  onSwap,
}: {
  open: boolean;
  exerciseKey?: string;
  exerciseName?: string;
  onClose: () => void;
  onSwap: (ex: LibraryExercise) => void;
}) {
  const { t, locale } = useI18n();
  useMobileOverlaySheet(open);
  const [q, setQ] = useState('');
  const [similar, setSimilar] = useState<LibraryExercise[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<LibraryExercise[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  const currentKey = exerciseKey?.trim() || '';
  const currentLabel = exerciseName?.trim() || t('exercise.swap.currentFallback');

  useEffect(() => {
    if (!open) {
      setQ('');
      setSimilar([]);
      setSearchHits([]);
      setSearchError(null);
      return;
    }
    fetchExerciseDbStatus()
      .then(s => setApiConfigured(s.configured))
      .catch(() => setApiConfigured(false));
  }, [open]);

  useEffect(() => {
    if (!open || !currentKey || !isExerciseDbCatalogKey(currentKey)) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    setSimilarLoading(true);
    fetchSimilarExercises(currentKey, 14)
      .then(list => {
        if (!cancelled) setSimilar(list.filter(e => e.key !== currentKey));
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentKey]);

  const loadSearch = useCallback(async () => {
    if (apiConfigured !== true) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const rows = await searchExercisesCatalog({
        q: q.trim() || undefined,
        limit: 40,
      });
      const filtered = rows.filter(e => e.key !== currentKey && e.category !== 'cardio');
      setSearchHits(filtered);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
      setSearchHits([]);
    } finally {
      setSearchLoading(false);
    }
  }, [apiConfigured, q, currentKey]);

  useEffect(() => {
    if (!open || apiConfigured !== true) return;
    const timer = window.setTimeout(() => void loadSearch(), 280);
    return () => window.clearTimeout(timer);
  }, [open, loadSearch, apiConfigured]);

  const pick = (item: LibraryExercise) => {
    onSwap(item);
    onClose();
  };

  const labelFor = (item: LibraryExercise) =>
    displayCoachExerciseName({ name: item.name, exerciseKey: item.key }, locale);

  const showSimilar = currentKey && isExerciseDbCatalogKey(currentKey);
  const searchSectionTitle = q.trim()
    ? t('exercise.swap.searchResults')
    : t('exercise.swap.browse');

  const similarIds = useMemo(() => new Set(similar.map(s => s.key)), [similar]);
  const searchOnly = useMemo(
    () => searchHits.filter(h => !similarIds.has(h.key)),
    [searchHits, similarIds],
  );

  if (!open) return null;

  return overlayPortal(
    <AnimatePresence mode="wait">
      <motion.div
        key="exercise-swap-sheet"
        className={mobileSheetOverlayClass()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Schließen" onClick={onClose} />
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[88dvh] lg:rounded-3xl"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] p-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-4">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="shrink-0 text-brand" />
                <h3 className="text-sm font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
                  {t('exercise.swap.title')}
                </h3>
              </div>
              <p className="mt-1 text-[10px] font-bold text-[var(--text-muted)] truncate">
                {t('exercise.swap.replaces', { name: currentLabel })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 hover:bg-[var(--background)]"
              aria-label="Schließen"
            >
              <X size={20} />
            </button>
          </div>

          <div className="shrink-0 border-b border-[var(--border-muted)] p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('exercise.swap.searchPlaceholder')}
                className="min-h-[48px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] pl-10 pr-3 text-base font-bold text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            {apiConfigured === false && (
              <p className="px-4 py-3 text-xs text-amber-600">{t('exercise.swap.notConfigured')}</p>
            )}
            {searchError && <p className="px-4 py-2 text-xs text-red-500">{searchError}</p>}

            {showSimilar && (
              <section className="border-b border-[var(--border-muted)] p-3 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-brand">
                  {t('exercise.swap.similarSection')}
                </p>
                {similarLoading && (
                  <div className="flex items-center gap-2 py-2 text-[var(--text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t('exercise.detail.similarLoading')}</span>
                  </div>
                )}
                {!similarLoading && similar.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">{t('exercise.detail.similarEmpty')}</p>
                )}
                <div className="space-y-1">
                  {similar.map(item => (
                    <SwapRow key={item.key} item={item} label={labelFor(item)} onPick={() => pick(item)} pickLabel={t('exercise.swap.pick')} />
                  ))}
                </div>
              </section>
            )}

            <section className="p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {searchSectionTitle}
              </p>
              {searchLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t('exercise.detail.loading')}</span>
                </div>
              )}
              {!searchLoading && searchOnly.length === 0 && apiConfigured === true && (
                <p className="py-4 text-center text-xs text-[var(--text-muted)]">{t('exercise.swap.empty')}</p>
              )}
              <div className="space-y-1">
                {searchOnly.map(item => (
                  <SwapRow key={item.key} item={item} label={labelFor(item)} onPick={() => pick(item)} pickLabel={t('exercise.swap.pick')} />
                ))}
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
  );
}

function SwapRow({
  item,
  label,
  onPick,
  pickLabel,
}: {
  item: LibraryExercise;
  label: string;
  onPick: () => void;
  pickLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full min-h-[52px] touch-manipulation items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--background)] active:opacity-90"
    >
      <ExerciseThumb item={item} />
      <span className="flex-1 text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-2">{label}</span>
      <span className="text-[8px] font-black uppercase text-brand shrink-0">{pickLabel}</span>
    </button>
  );
}
