import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, UtensilsCrossed, Minus, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import {
  coachMealIngredientLines,
  coachMealToNutritionEntry,
  coachMealPerServingMacros,
} from '@/src/lib/coachTemplateMappers';
import {
  buildCoachPlanPipelineResult,
  coachPipelineReviewedComponents,
} from '@/src/lib/nutrition/pipeline/coachPlanPipeline';
import { finalizeNutritionPipelineV3 } from '@/src/services/nutritionLogService';
import type { MealCategory, Nutrition } from '@/src/types';
import { cn } from '@/src/lib/utils';

export default function CoachMealDetailModal({
  meal,
  dayLabel,
  onClose,
  onLog,
  onLogLegacy,
}: {
  meal: Record<string, unknown>;
  dayLabel?: string;
  onClose: () => void;
  onLog: () => Promise<void>;
  onLogLegacy?: (data: Partial<Nutrition>) => Promise<void>;
}) {
  const { t } = useI18n();
  useMobileOverlaySheet(true);
  const [portions, setPortions] = useState(1);
  const [logging, setLogging] = useState(false);
  const [mealCategory, setMealCategory] = useState<MealCategory>(() => {
    const raw = String(meal.type || 'snack').toLowerCase();
    if (raw === 'breakfast' || raw === 'lunch' || raw === 'dinner' || raw === 'snack') return raw;
    return 'snack';
  });

  const title = typeof meal.title === 'string' ? meal.title.trim() : t('coach.meal.detailUntitled');
  const cookServings = Math.max(1, Math.round(Number(meal.servings) || 1));
  const macros = useMemo(() => coachMealPerServingMacros(meal), [meal]);
  const ingredients = useMemo(() => coachMealIngredientLines(meal), [meal]);
  const prepSteps = useMemo(() => {
    const raw = meal.prepSteps ?? meal.prep_steps;
    if (!Array.isArray(raw)) return [] as string[];
    return raw.map(s => String(s).trim()).filter(Boolean);
  }, [meal]);

  const handleLog = async () => {
    setLogging(true);
    try {
      const result = buildCoachPlanPipelineResult(meal, {
        portionsEaten: portions,
        category: mealCategory,
        dayLabel,
      });
      await finalizeNutritionPipelineV3({
        result,
        reviewedComponents: coachPipelineReviewedComponents(result),
        originalInput: `coach:${title}`,
        category: mealCategory,
        date: format(new Date(), 'yyyy-MM-dd'),
      });
      await onLog();
      onClose();
    } catch {
      if (onLogLegacy) {
        await onLogLegacy(
          coachMealToNutritionEntry(meal, {
            portionsEaten: portions,
            category: mealCategory,
            dayLabel,
          }),
        );
      }
      await onLog();
      onClose();
    } finally {
      setLogging(false);
    }
  };

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass('h-[100dvh] max-h-[100dvh] lg:max-h-none lg:p-6')}
    >
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[90dvh] lg:rounded-[2rem]"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-muted)] p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">
              {dayLabel ? `${dayLabel} · ` : ''}
              {t(`nut.cat.${mealCategory}` as 'nut.cat.snack')}
            </p>
            <h3 className="truncate text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
              {title}
            </h3>
            {cookServings > 1 && (
              <p className="mt-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                {t('coach.meal.cookFor', { n: cookServings })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--background)]"
            aria-label={t('coach.meal.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain p-5 [-webkit-overflow-scrolling:touch]">
          {typeof meal.description === 'string' && meal.description.trim() ? (
            <p className="text-sm font-medium leading-relaxed text-[var(--text-muted)]">{meal.description.trim()}</p>
          ) : null}

          <motion.div className="grid grid-cols-4 gap-2 rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
            {[
              { label: 'kcal', value: macros.calories },
              { label: 'P', value: `${macros.protein}g` },
              { label: 'C', value: `${macros.carbs}g` },
              { label: 'F', value: `${macros.fat}g` },
            ].map(m => (
              <div key={m.label} className="text-center">
                <p className="text-base font-black text-[var(--text-primary)]">{m.value}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {m.label}
                  <span className="block normal-case font-medium">{t('coach.meal.perServing')}</span>
                </p>
              </div>
            ))}
          </motion.div>

          {ingredients.length > 0 && (
            <motion.div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('coach.meal.ingredients')}
              </p>
              <ul className="space-y-2">
                {ingredients.map((ing, i) => (
                  <li
                    key={`${ing.name}-${i}`}
                    className="flex justify-between gap-3 rounded-xl bg-[var(--background)] px-3 py-2.5 text-sm"
                  >
                    <span className="font-bold text-[var(--text-primary)]">{ing.name}</span>
                    {(ing.amount != null || ing.unit) && (
                      <span className="shrink-0 text-[10px] font-black uppercase text-[var(--text-muted)]">
                        {[ing.amount, ing.unit].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {prepSteps.length > 0 && (
            <motion.div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('coach.meal.prep')}
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                {prepSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </motion.div>
          )}

          {typeof meal.notes === 'string' && meal.notes.trim() ? (
            <p className="text-xs font-medium italic text-[var(--text-muted)]">{meal.notes.trim()}</p>
          ) : null}
        </div>

        <div className="shrink-0 space-y-3 border-t border-[var(--border-muted)] bg-[var(--background)] p-5">
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('coach.meal.logCategory')}
            </p>
            <select
              value={mealCategory}
              onChange={e => setMealCategory(e.target.value as MealCategory)}
              className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(c => (
                <option key={c} value={c}>
                  {t(`nut.cat.${c}` as 'nut.cat.snack')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('coach.meal.portionsEaten')}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPortions(p => Math.max(0.25, Math.round((p - 0.25) * 4) / 4))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)]"
                aria-label="-"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[3rem] text-center text-lg font-black text-[var(--text-primary)]">{portions}</span>
              <button
                type="button"
                onClick={() => setPortions(p => Math.min(12, Math.round((p + 0.25) * 4) / 4))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)]"
                aria-label="+"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] font-bold text-[var(--text-muted)]">
            {t('coach.meal.logPreview', {
              kcal: Math.round(macros.calories * portions),
              date: format(new Date(), 'yyyy-MM-dd'),
            })}
          </p>

          <button
            type="button"
            disabled={logging}
            onClick={() => void handleLog()}
            className={cn(
              'flex min-h-[52px] w-full items-center justify-center gap-2 ui-btn-brand rounded-2xl text-[10px] disabled:opacity-50',
            )}
          >
            {logging ? <Loader2 size={18} className="animate-spin" /> : <UtensilsCrossed size={18} />}
            {t('coach.meal.logCta')}
          </button>
        </div>
      </motion.div>
    </motion.div>,
  );
}
