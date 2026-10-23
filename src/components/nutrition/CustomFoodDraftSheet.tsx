/**
 * Bearbeitbare Vorschau für ein KI-entworfenes Nutzer-Lebensmittel vor dem Speichern.
 */

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { FOOD_CATEGORY_LIST } from '@/src/lib/mealAiShared';
import type { CustomFoodDraft } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import { mobileSheetOverlayClass, overlayPortal, useMobileOverlaySheet } from '@/src/lib/mobileViewport';

const UNIT_OPTS = ['g', 'ml', 'stk', 'scheibe', 'portion', 'dose', 'glas', 'flasche', 'tl', 'el'] as const;

function clampNum(raw: string, fallback: number, min?: number): number {
  const n = parseFloat(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return min;
  return n;
}

export default function CustomFoodDraftSheet(props: {
  draft: CustomFoodDraft;
  onDraftChange: (next: CustomFoodDraft) => void;
  onCancel: () => void;
  onConfirm: (draft: CustomFoodDraft) => void | Promise<void>;
  saving?: boolean;
  compact?: boolean;
}) {
  const { draft, onDraftChange, onCancel, onConfirm, saving } = props;
  const { t } = useI18n();

  const catOptions = useMemo(() => FOOD_CATEGORY_LIST.slice(), []);

  const patch = (partial: Partial<CustomFoodDraft>) => onDraftChange({ ...draft, ...partial });

  const patchServing = (idx: number, field: 'name' | 'grams', value: string) => {
    const next = draft.servings.map((row, i) => {
      if (i !== idx) return row;
      if (field === 'name') return { ...row, name: value };
      const g = clampNum(value, row.grams, 1);
      return { ...row, grams: Math.round(Math.min(2500, g)) };
    });
    patch({ servings: next });
  };

  const addServingRow = () => {
    patch({ servings: [...draft.servings, { name: t('nut.draft.extraPortion'), grams: 100 }] });
  };

  const removeServingRow = (idx: number) => {
    const next = draft.servings.filter((_, i) => i !== idx);
    patch({ servings: next.length ? next : [{ name: '100 g', grams: 100 }] });
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onCancel}
        aria-label={t('nut.foodLog.cancel')}
      />
      <div
        className="relative z-[131] flex max-h-[min(100dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[85vh] lg:max-w-lg lg:rounded-[1.75rem]"
        role="dialog"
        aria-labelledby="draft-food-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-muted)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p id="draft-food-title" className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.draft.title')}
            </p>
            <p className="text-[11px] font-bold leading-snug text-[var(--text-muted)]">{draft.disclaimer}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--background)] active:opacity-90"
            aria-label={t('nut.foodLog.cancel')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.draft.name')}
            </span>
            <input
              value={draft.name}
              onChange={e => patch({ name: e.target.value })}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-[16px] md:text-sm font-semibold text-[var(--text-primary)]"
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.draft.category')}
            </span>
            <select
              value={draft.category}
              onChange={e => patch({ category: e.target.value })}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-3 text-[16px] md:text-sm font-medium text-[var(--text-primary)]"
            >
              {catOptions.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.draft.per100')}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                ['calories', 'protein', 'carbs', 'fat'] as const
              ).map(k => (
                <label key={k} className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-brand/80">{k}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft.nutrientsPer100g[k]}
                    onChange={e =>
                      patch({
                        nutrientsPer100g: {
                          ...draft.nutrientsPer100g,
                          [k]: clampNum(e.target.value, draft.nutrientsPer100g[k], 0),
                        },
                      })
                    }
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[16px] md:text-sm font-bold tabular-nums text-[var(--text-primary)]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('nut.draft.defaultAmt')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft.defaultAmount > 0 ? String(draft.defaultAmount) : ''}
                onChange={e => {
                  const s = e.target.value.trim().replace(',', '.');
                  if (s === '') {
                    patch({ defaultAmount: 0 });
                    return;
                  }
                  const n = Number(s);
                  if (!Number.isFinite(n)) return;
                  patch({ defaultAmount: Math.max(0, n) });
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[16px] md:text-sm font-bold tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('nut.draft.defaultUnit')}
              </span>
              <select
                value={draft.defaultUnit}
                onChange={e => patch({ defaultUnit: e.target.value })}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[16px] md:text-sm font-medium text-[var(--text-primary)]"
              >
                {UNIT_OPTS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {draft.defaultUnit === 'stk' || draft.defaultUnit === 'scheibe' ? (
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('nut.draft.gramsPiece')}
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={draft.gramsPerPiece ?? ''}
                placeholder="—"
                onChange={e => {
                  const v = e.target.value.trim();
                  if (!v) return patch({ gramsPerPiece: undefined });
                  const n = clampNum(v, NaN as unknown as number, 1);
                  if (!Number.isFinite(n)) patch({ gramsPerPiece: undefined });
                  else patch({ gramsPerPiece: Math.round(Math.min(2000, n)) });
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[16px] md:text-sm font-bold tabular-nums"
              />
            </label>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('nut.draft.portions')}
              </p>
              <button
                type="button"
                onClick={addServingRow}
                className="text-[9px] font-black uppercase tracking-widest text-brand hover:underline"
              >
                {t('nut.draft.addPortion')}
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {draft.servings.map((row, idx) => (
                <div key={`${idx}-${row.name}-${row.grams}`} className="flex gap-2 items-start">
                  <input
                    value={row.name}
                    onChange={e => patchServing(idx, 'name', e.target.value)}
                    className="min-h-[44px] flex-1 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[16px] md:text-sm font-medium text-[var(--text-primary)]"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.grams}
                    onChange={e => patchServing(idx, 'grams', e.target.value)}
                    className="w-[5.25rem] min-h-[44px] shrink-0 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-2 py-2 text-[16px] md:text-sm font-black tabular-nums text-right"
                  />
                  {draft.servings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeServingRow(idx)}
                      className="min-h-[44px] shrink-0 rounded-xl border border-[var(--border-muted)] px-2 text-[10px] font-black uppercase text-red-400"
                      aria-label={t('nut.aiMeal.removeRow')}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-[var(--border-muted)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex min-h-[52px] flex-1 touch-manipulation items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] disabled:opacity-50 active:opacity-90 md:min-h-[48px]"
          >
            {t('nut.foodLog.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(draft)}
            disabled={saving || !draft.name.trim() || !(draft.defaultAmount > 0)}
            className="flex min-h-[52px] flex-1 touch-manipulation items-center justify-center ui-btn-brand text-[10px] disabled:opacity-50 active:opacity-90 md:min-h-[48px]"
          >
            {saving ? t('nut.draft.saving') : t('nut.draft.save')}
          </button>
        </div>
      </div>
    </div>,
  );
}
