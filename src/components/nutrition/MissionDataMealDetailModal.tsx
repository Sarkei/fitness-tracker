/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import type { Nutrition } from '@/src/types';
import { nutritionEntryToDetailRows } from '@/src/lib/nutritionRationBridge';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import {
  fetchNutritionLogComponents,
  type NutritionLogComponentRow,
} from '@/src/services/nutritionLogService';

export default function MissionDataMealDetailModal({
  entry,
  onClose,
}: {
  entry: Nutrition;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const rows = nutritionEntryToDetailRows(entry);
  const [components, setComponents] = useState<NutritionLogComponentRow[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentsError, setComponentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry?.id) return;
    let cancelled = false;
    setComponentsLoading(true);
    setComponentsError(null);
    fetchNutritionLogComponents(entry.id)
      .then((data) => {
        if (cancelled) return;
        setComponents(data);
      })
      .catch(() => {
        if (cancelled) return;
        setComponentsError('Komponentendaten konnten nicht geladen werden.');
      })
      .finally(() => {
        if (cancelled) return;
        setComponentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry?.id]);
  const totals = {
    calories: Math.round(entry.calories),
    protein: entry.protein ?? 0,
    carbs: entry.carbs ?? 0,
    fat: entry.fat ?? 0,
  };

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="nutrition-mission-detail-modal"
      className={mobileSheetOverlayClass()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[90dvh] lg:rounded-[2rem]"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-muted)] p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('nut.mission.title')}</p>
            <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] truncate">{entry.meal}</h3>
            <p className="text-[10px] font-black uppercase text-brand mt-0.5">
              {t(`nut.cat.${entry.category}` as 'nut.cat.snack')} · {format(new Date(entry.date), 'PPP', { locale: dfLocale })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--background)] active:opacity-90"
            aria-label={t('nut.mission.close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-5 [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-[var(--border-muted)]">
                <th className="py-2 pr-2 font-black uppercase text-[10px] text-[var(--text-muted)]">{t('nut.mission.th.food')}</th>
                <th className="py-2 px-1 font-black uppercase text-[10px] text-[var(--text-muted)] whitespace-nowrap">{t('nut.mission.th.portion')}</th>
                <th className="py-2 px-1 font-black uppercase text-[10px] text-[var(--text-muted)] text-right w-14">{t('nut.mission.th.kcal')}</th>
                <th className="py-2 pl-1 font-black uppercase text-[10px] text-[var(--text-muted)] text-right hidden sm:table-cell w-28">{t('nut.mission.th.pcf')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-[var(--border-muted)] align-top">
                  <td className="py-2.5 pr-2 font-bold text-[var(--text-primary)]">{r.name}</td>
                  <td className="py-2.5 px-1 text-[10px] text-[var(--text-muted)] font-medium whitespace-nowrap">{r.portionLabel}</td>
                  <td className="py-2.5 px-1 font-black text-[var(--text-primary)] text-right">{r.calories}</td>
                  <td className="py-2.5 pl-1 text-[9px] text-[var(--text-muted)] font-bold text-right hidden sm:table-cell">
                    {Math.round(r.protein)} / {Math.round(r.carbs)} / {Math.round(r.fat)} g
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[9px] text-[var(--text-muted)] font-medium mt-2 sm:hidden">
            {t('nut.mission.macrosMob', {
              p: Math.round(totals.protein),
              c: Math.round(totals.carbs),
              f: Math.round(totals.fat),
            })}
          </p>

          <div className="mt-5 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
              V3 Komponenten (Datenquelle)
            </p>
            {componentsLoading ? (
              <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Komponenten werden geladen...
              </p>
            ) : componentsError ? (
              <p className="text-xs text-amber-500">{componentsError}</p>
            ) : components.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Keine V3-Komponenten gespeichert (Legacy oder manueller Alt-Eintrag).
              </p>
            ) : (
              <ul className="space-y-1.5">
                {components.map((row, idx) => (
                  <li
                    key={`${row.component_id || row.food_name}-${idx}`}
                    className="text-[11px]"
                    data-testid="nutrition-component-row"
                  >
                    <p className="font-bold text-[var(--text-primary)]">
                      {row.product_name}
                      <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                        {Math.round(Number(row.grams) || 0)} g · {Math.round(Number(row.kcal) || 0)} kcal
                      </span>
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Quelle: {row.data_source} · Confidence: {Math.round(Number(row.confidence_score) || 0)}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-[var(--border-muted)] shrink-0 bg-[var(--background)] space-y-1">
          <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.mission.total')}</p>
          <p className="text-sm font-black text-[var(--text-primary)]">
            {totals.calories} kcal · P {Math.round(totals.protein * 10) / 10}g · C {Math.round(totals.carbs * 10) / 10}g · F{' '}
            {Math.round(totals.fat * 10) / 10}g
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
