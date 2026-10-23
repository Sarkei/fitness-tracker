/**
 * Bearbeitbare kcal / Makros pro Portion; Eltern rechnen Kohärenz (4/4/9).
 */

import type { MacroSet } from '@/src/lib/macroEnergyBalance';
import { useI18n } from '@/src/lib/i18n';
import { cn } from '@/src/lib/utils';

type Props = {
  nutrients: MacroSet;
  onKcalChange: (raw: string) => void;
  onProteinChange: (raw: string) => void;
  onCarbsChange: (raw: string) => void;
  onFatChange: (raw: string) => void;
  showReset: boolean;
  onReset: () => void;
  /** z. B. muted Karte vs. neutral */
  className?: string;
};

export function NutrientOverrideFields({
  nutrients,
  onKcalChange,
  onProteinChange,
  onCarbsChange,
  onFatChange,
  showReset,
  onReset,
  className,
}: Props) {
  const { t } = useI18n();

  const inputCls = cn(
    'min-h-[48px] w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)]',
    'px-3 py-2.5 text-center text-base font-black tabular-nums text-[var(--text-primary)] sm:text-sm',
    'touch-manipulation focus:border-brand focus:outline-none',
  );

  return (
    <div
      className={cn(
        'space-y-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t('nut.foodLog.adjustHeading')}
          </p>
          <p className="mt-1 text-[9px] font-medium leading-snug text-[var(--text-muted)]">
            {t('nut.foodLog.macroSyncHint')}
          </p>
        </div>
        {showReset ? (
          <button
            type="button"
            onClick={onReset}
            className="min-h-[44px] shrink-0 touch-manipulation rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest text-brand hover:bg-brand/10 active:opacity-90"
          >
            {t('nut.foodLog.resetNutrients')}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-brand/90">{t('nut.label.kcal')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={nutrients.calories}
            onChange={e => onKcalChange(e.target.value)}
            className={cn(inputCls, 'text-brand')}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-blue-500/90">{t('nut.label.protein')}</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(nutrients.protein) ? nutrients.protein : 0}
            onChange={e => onProteinChange(e.target.value)}
            className={cn(inputCls, 'text-blue-500')}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-orange-500/90">{t('nut.label.carbs')}</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(nutrients.carbs) ? nutrients.carbs : 0}
            onChange={e => onCarbsChange(e.target.value)}
            className={cn(inputCls, 'text-orange-500')}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-purple-500/90">{t('nut.label.fat')}</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(nutrients.fat) ? nutrients.fat : 0}
            onChange={e => onFatChange(e.target.value)}
            className={cn(inputCls, 'text-purple-500')}
          />
        </div>
      </div>
    </div>
  );
}

export type { MacroSet };
