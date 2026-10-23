/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Brain, Loader2, ArrowLeft } from 'lucide-react';
import type { Food } from '@/src/lib/foodDatabase';
import { mergeAppFoodPool } from '@/src/lib/foodPool';
import { searchFoodsV2 } from '@/src/services/nutritionLogService';
import { syntheticFoodFromProposedDbFood } from '@/src/lib/mealAiShared';
import { getPortionQuickSelectPresets, inferStueckGramsFromFood } from '@/src/lib/portionUtils';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { analyzeMeal } from '@/src/services/aiNutritionService';
import type { Ingredient, MealCategory, ProposedDbFood } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type Line = { id: string; food: Food; gramsStr: string };

function parsePositiveGrams(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function nutsForGrams(f: Food, grams: number) {
  const m = grams / 100;
  const n = f.nutrients;
  return {
    calories: Math.round(n.calories * m),
    protein: Math.round(n.protein * m * 10) / 10,
    carbs: Math.round(n.carbs * m * 10) / 10,
    fat: Math.round(n.fat * m * 10) / 10,
  };
}

const DEFAULT_GRAMS = 100;

function foodFromIngredientForPick(ing: Ingredient, pool: Food[]): Food | null {
  const idStr = String(ing.id ?? '').trim();
  if (idStr && !idStr.startsWith('est_')) {
    const byId = pool.find(f => f.id === idStr);
    if (byId) return byId;
  }
  const nm = ing.name.trim().toLowerCase();
  const byName = pool.find(f => f.name.trim().toLowerCase() === nm);
  if (byName) return byName;
  const g = Math.max(1, (Number(ing.amount) || 1) * 100);
  const f = 100 / g;
  return {
    id: idStr || `est_pick_${ing.name.slice(0, 24)}`,
    name: ing.name,
    category: 'readymeal',
    nutrients: {
      calories: Math.max(0, Math.round((ing.calories || 0) * f)),
      protein: Math.max(0, (ing.protein || 0) * f),
      carbs: Math.max(0, (ing.carbs || 0) * f),
      fat: Math.max(0, (ing.fat || 0) * f),
    },
    servings: [{ name: '100 g', grams: 100 }],
  };
}

export function IngredientPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (food: Food) => void }) {
  const { t } = useI18n();
  const aiCaps = useAiCapabilities();
  const [search, setSearch] = useState('');
  const [catalogStrong, setCatalogStrong] = useState<Food[]>([]);
  const [catalogSimilar, setCatalogSimilar] = useState<Food[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [aiPhase, setAiPhase] = useState<'idle' | 'loading' | 'results'>('idle');
  const [aiIngredients, setAiIngredients] = useState<Ingredient[]>([]);
  const [aiProposed, setAiProposed] = useState<ProposedDbFood[]>([]);
  const [researchNote, setResearchNote] = useState<string | null>(null);
  const [aiLookupError, setAiLookupError] = useState<string | null>(null);

  const pickPool = useMemo(
    () => mergeAppFoodPool([], [...catalogStrong, ...catalogSimilar]),
    [catalogStrong, catalogSimilar],
  );

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || aiPhase !== 'idle') {
      setCatalogStrong([]);
      setCatalogSimilar([]);
      setCatalogLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCatalogLoading(true);
        try {
          const tiered = await searchFoodsV2(q);
          if (!cancelled) {
            setCatalogStrong(tiered.strong.slice(0, 18));
            setCatalogSimilar(tiered.similar.slice(0, 28));
          }
        } catch {
          if (!cancelled) {
            setCatalogStrong([]);
            setCatalogSimilar([]);
          }
        } finally {
          if (!cancelled) setCatalogLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, aiPhase]);

  const strongPick = catalogStrong;
  const similarPick = catalogSimilar;

  const hasQuery = search.trim().length > 0;
  const showDatabaseEmpty = hasQuery && strongPick.length === 0 && similarPick.length === 0;
  const showWeakPickHelp = hasQuery && strongPick.length === 0 && similarPick.length > 0 && aiPhase === 'idle';

  const runAiLookup = async () => {
    const q = search.trim();
    if (!q || !aiCaps.enabled) return;
    setAiLookupError(null);
    setAiPhase('loading');
    try {
      const analysis = await analyzeMeal(t('nut.picker.aiSinglePrompt', { q }));
      setAiIngredients(analysis.ingredients ?? []);
      setAiProposed(analysis.proposedDbFoods ?? []);
      setResearchNote(analysis.researchNote ?? null);
      setAiPhase('results');
    } catch (e) {
      console.error(e);
      setAiPhase('idle');
      setAiLookupError(t('nut.picker.aiFailed'));
    }
  };

  const backToSearch = () => {
    setAiPhase('idle');
    setAiIngredients([]);
    setAiProposed([]);
    setResearchNote(null);
    setAiLookupError(null);
  };

  const pickIngredientRow = (ing: Ingredient) => {
    const food = foodFromIngredientForPick(ing, pickPool);
    if (food) onPick(food);
  };

  const pickProposedRow = (p: ProposedDbFood) => {
    onPick(syntheticFoodFromProposedDbFood(p));
  };

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass()}
    >
      <div
        className="absolute inset-0 hidden bg-black/75 backdrop-blur-sm md:block"
        onClick={onClose}
        role="presentation"
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative z-10 flex min-h-0 w-full max-w-md flex-1 flex-col overflow-hidden rounded-t-[1.75rem] border-x border-t border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[85dvh] lg:flex-none lg:rounded-[1.75rem] lg:border"
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          paddingTop: 'max(0px, env(safe-area-inset-top))',
        }}
      >
        <div className="p-4 border-b border-[var(--border-muted)] flex items-center justify-between shrink-0">
          <h4 className="text-sm font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{t('nut.picker.title')}</h4>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--background)] min-w-[44px] min-h-[44px] touch-manipulation"
          >
            <X size={20} />
          </button>
        </div>

        {aiPhase === 'results' ? (
          <>
            <div className="p-3 border-b border-[var(--border-muted)] shrink-0">
              <button
                type="button"
                onClick={backToSearch}
                className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-brand"
              >
                <ArrowLeft size={14} /> {t('nut.picker.backSearch')}
              </button>
              {researchNote && (
                <p className="mt-2 text-[10px] font-bold text-[var(--text-muted)] leading-snug">{researchNote}</p>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {aiIngredients.length === 0 && aiProposed.length === 0 && (
                <p className="text-center text-xs text-[var(--text-muted)] py-10 px-4">{t('nut.picker.noAi')}</p>
              )}
              {aiIngredients.map((ing, idx) => (
                <button
                  key={`${ing.id ?? ing.name}-${idx}`}
                  type="button"
                  onClick={() => pickIngredientRow(ing)}
                  className="w-full text-left px-4 py-3.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--background)] border-b border-[var(--border-muted)] flex justify-between gap-3 min-h-[52px] touch-manipulation"
                >
                  <span className="truncate">{ing.name}</span>
                  <span className="text-[var(--text-muted)] shrink-0 text-[10px]">{ing.calories} kcal</span>
                </button>
              ))}
              {aiProposed.map(p => (
                <div
                  key={p.key}
                  className="px-4 py-3 border-b border-[var(--border-muted)] flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{p.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium leading-snug mt-0.5">{p.disclaimer}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {p.calories} kcal · {p.amount}
                      {p.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => pickProposedRow(p)}
                    className="min-h-[44px] w-full shrink-0 ui-btn-brand-sm px-4 py-2 text-[10px] tracking-wider touch-manipulation sm:w-auto"
                  >
                    {t('nut.picker.apply')}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="p-4 border-b border-[var(--border-muted)] shrink-0">
              <input
                type="search"
                enterKeyHint="search"
                autoCapitalize="sentences"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setAiLookupError(null);
                }}
                placeholder={t('nut.picker.searchPh')}
                className="w-full min-h-[48px] rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 text-base font-bold text-[var(--text-primary)] md:text-sm"
              />
            </div>

            {aiPhase === 'loading' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="animate-spin text-brand" size={28} />
                <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">{t('nut.picker.aiBusy', { q: search.trim() })}</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
                {aiLookupError ? (
                  <div
                    className="mx-3 mt-3 space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3"
                    role="alert"
                  >
                    <p className="text-[11px] font-medium leading-snug text-[var(--text-primary)]">{aiLookupError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setAiLookupError(null);
                        void runAiLookup();
                      }}
                      disabled={!search.trim() || !aiCaps.enabled}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 text-[10px] font-black uppercase tracking-widest text-brand disabled:opacity-50"
                    >
                      {t('nut.common.retry')}
                    </button>
                  </div>
                ) : null}
                {showDatabaseEmpty && (
                  <div className="p-5 space-y-3 bg-[var(--background)]/50 border-b border-[var(--border-muted)]">
                    <p className="text-xs font-bold text-[var(--text-primary)]">{t('nut.picker.emptyTitle')}</p>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      {t('nut.picker.emptyHint')}
                    </p>
                    {aiCaps.loading ? (
                      <p className="text-[10px] text-[var(--text-muted)]">{t('nut.picker.aiStatus')}</p>
                    ) : aiCaps.enabled ? (
                      <button
                        type="button"
                        onClick={() => void runAiLookup()}
                        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/15"
                      >
                        <Brain size={16} /> {t('nut.picker.suggestAi')}
                      </button>
                    ) : (
                      <p className="text-[10px] text-[var(--text-muted)]">{t('nut.picker.aiOff')}</p>
                    )}
                  </div>
                )}
                {(strongPick.length > 0 || similarPick.length > 0) && (
                  <div className="space-y-2">
                    {strongPick.length > 0 && (
                      <div className="divide-y divide-[var(--border-muted)]">
                        {strongPick.map(f => {
                          const brand = String(f.brand || '').trim();
                          const kcal = Math.round(Number(f.nutrients?.calories) || 0);
                          const isBarcode = f.id.startsWith('off_') || f.catalogSource === 'openfoodfacts';
                          const meta = [
                            brand || null,
                            kcal > 0 ? t('nut.picker.per100', { kcal }) : null,
                          ].filter(Boolean);
                          return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => onPick(f)}
                            className="flex min-h-[52px] w-full touch-manipulation items-center justify-between gap-3 px-4 py-3.5 text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--background)] active:opacity-90"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{f.name}</span>
                              {(meta.length > 0 || isBarcode) ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                                  {meta.length > 0 ? <span>{meta.join(' · ')}</span> : null}
                                  {isBarcode ? (
                                    <span className="rounded border border-[var(--border-muted)] px-1 py-0.5 uppercase tracking-wide text-[10px]">
                                      {t('nut.log.search.barcodeBadge')}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          );
                        })}
                      </div>
                    )}

                    {showWeakPickHelp && (
                      <div className="mx-2 space-y-2 rounded-xl border border-dashed border-brand/35 bg-brand/5 p-3">
                        <p className="text-[11px] font-bold text-[var(--text-primary)]">{t('nut.picker.addCustom')}</p>
                        <p className="text-[10px] leading-snug text-[var(--text-muted)]">{t('nut.picker.addHint')}</p>
                        {aiCaps.loading ? (
                          <p className="text-[10px] text-[var(--text-muted)]">{t('nut.picker.aiStatus')}</p>
                        ) : aiCaps.enabled ? (
                          <button
                            type="button"
                            onClick={() => void runAiLookup()}
                            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/10 text-[10px] font-black uppercase tracking-widest text-brand hover:bg-brand/15"
                          >
                            <Brain size={16} /> {t('nut.picker.suggestAi')}
                          </button>
                        ) : (
                          <p className="text-[10px] text-[var(--text-muted)]">{t('nut.picker.aiOff')}</p>
                        )}
                      </div>
                    )}

                    {similarPick.length > 0 && (
                      <>
                        {(strongPick.length > 0 || showWeakPickHelp) && (
                          <p className="px-4 pt-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                            {t('nut.picker.similarSection')}
                          </p>
                        )}
                        <div className="divide-y divide-[var(--border-muted)]">
                          {similarPick.map(f => {
                            const brand = String(f.brand || '').trim();
                            const kcal = Math.round(Number(f.nutrients?.calories) || 0);
                            const isBarcode = f.id.startsWith('off_') || f.catalogSource === 'openfoodfacts';
                            const meta = [
                              brand || null,
                              kcal > 0 ? t('nut.picker.per100', { kcal }) : null,
                            ].filter(Boolean);
                            return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => onPick(f)}
                              className="flex min-h-[52px] w-full touch-manipulation items-center justify-between gap-3 px-4 py-3.5 text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--background)] active:opacity-90"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{f.name}</span>
                                {(meta.length > 0 || isBarcode) ? (
                                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                                    {meta.length > 0 ? <span>{meta.join(' · ')}</span> : null}
                                    {isBarcode ? (
                                      <span className="rounded border border-[var(--border-muted)] px-1 py-0.5 uppercase tracking-wide text-[10px]">
                                        {t('nut.log.search.barcodeBadge')}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function RationComposerModal({
  onClose,
  onSave,
  initialComposerLines,
  initialName,
  initialCategory,
  initialYieldsPortions,
  editingTemplateId,
}: {
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    category: MealCategory;
    ingredients: Ingredient[];
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    yieldsPortions: number;
  }) => void;
  /** Pre-filled foods (e.g. merged Mission Data logs). Parent should remount with `key` when changing seeds. */
  initialComposerLines?: { food: Food; grams: number }[];
  initialName?: string;
  initialCategory?: MealCategory;
  initialYieldsPortions?: string;
  /** Gesetztes UUID → Speichern aktualisiert die bestehende Vorlage (PATCH). */
  editingTemplateId?: string | null;
}) {
  const { t } = useI18n();
  useMobileOverlaySheet(true);
  const [name, setName] = useState(initialName ?? '');
  /** Nur für API/Altbestand; Tageszeit wird beim Loggen gewählt — UI entfernt. */
  const [category] = useState<MealCategory>(initialCategory ?? 'snack');
  const [yieldsPortions, setYieldsPortions] = useState(initialYieldsPortions ?? '1');
  const [lines, setLines] = useState<Line[]>(() =>
    (initialComposerLines ?? []).map(L => ({
      id: globalThis.crypto?.randomUUID?.() ?? `ln-${Date.now()}-${Math.random()}`,
      food: L.food,
      gramsStr: String(Math.max(1, Math.round(Number(L.grams) || 1))),
    })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const yieldsTrim = yieldsPortions.trim();
  const yieldsParsed = parseInt(yieldsTrim, 10);
  const yieldsValid =
    yieldsTrim !== '' && Number.isFinite(yieldsParsed) && yieldsParsed >= 1 && yieldsParsed <= 999;
  const yieldsNum = yieldsValid ? yieldsParsed : 1;

  const lineGrams = useMemo(() => lines.map(L => parsePositiveGrams(L.gramsStr)), [lines]);
  const allGramsValid = lines.length > 0 && lineGrams.every(g => g != null);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, L, i) => {
        const g = lineGrams[i];
        if (g == null) return acc;
        const x = nutsForGrams(L.food, g);
        return {
          calories: acc.calories + x.calories,
          protein: acc.protein + x.protein,
          carbs: acc.carbs + x.carbs,
          fat: acc.fat + x.fat,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [lines, lineGrams]);

  const perPortion = useMemo(() => {
    const y = yieldsNum;
    return {
      calories: totals.calories / y,
      protein: totals.protein / y,
      carbs: totals.carbs / y,
      fat: totals.fat / y,
    };
  }, [totals, yieldsNum]);

  const addFoodFromPicker = useCallback((f: Food) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `ln-${Date.now()}-${Math.random()}`;
    setLines(prev => [...prev, { id, food: f, gramsStr: String(DEFAULT_GRAMS) }]);
    setPickerOpen(false);
  }, []);

  const save = () => {
    if (!name.trim() || lines.length === 0 || !allGramsValid || !yieldsValid) return;
    const ingredients: Ingredient[] = lines.map((L, i) => {
      const grams = lineGrams[i]!;
      const n = nutsForGrams(L.food, grams);
      const fid = L.food.id ? String(L.food.id) : '';
      const persistFoodId =
        fid &&
        !fid.startsWith('synth_') &&
        !fid.startsWith('est_');
      return {
        ...(persistFoodId ? { id: fid } : {}),
        name: L.food.name,
        amount: grams,
        unit: 'g',
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
      };
    });
    onSave({
      ...(editingTemplateId ? { id: editingTemplateId } : {}),
      name: name.trim(),
      category,
      ingredients,
      totalCalories: Math.round(totals.calories),
      totalProtein: Math.round(totals.protein * 10) / 10,
      totalCarbs: Math.round(totals.carbs * 10) / 10,
      totalFat: Math.round(totals.fat * 10) / 10,
      yieldsPortions: yieldsNum,
    });
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={mobileSheetOverlayClass()}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} role="presentation" />
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[92dvh] lg:rounded-[2rem]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] p-5 pt-[max(1rem,env(safe-area-inset-top))] md:pt-5">
            <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)]">
              {editingTemplateId ? t('nut.ration.titleEdit') : t('nut.ration.title')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[var(--background)] text-[var(--text-muted)] min-w-[44px] min-h-[44px] touch-manipulation"
            >
              <X size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain p-5 [-webkit-overflow-scrolling:touch]">
            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.ration.name')}</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('nut.ration.namePh')}
                className="mt-1 w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.ration.yields')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={yieldsPortions}
                onChange={e => setYieldsPortions(e.target.value)}
                className={cn(
                  'mt-1 w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)]',
                  !yieldsValid && yieldsTrim !== '' && 'border-amber-500/60',
                )}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{t('nut.ration.yieldsHint')}</p>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-2">{t('nut.ration.ingredients')}</p>
              <div className="rounded-xl border border-[var(--border-muted)] overflow-hidden bg-[var(--background)]">
                <div className="md:hidden divide-y divide-[var(--border-muted)]">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="w-full min-h-[52px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand hover:bg-[var(--card-bg)] transition-colors touch-manipulation"
                  >
                    <Plus size={18} strokeWidth={2.5} />
                    {t('nut.ration.addLine')}
                  </button>
                  {lines.map((L, rowIdx) => {
                    const gRow = lineGrams[rowIdx];
                    const n = gRow != null ? nutsForGrams(L.food, gRow) : { calories: 0, protein: 0, carbs: 0, fat: 0 };
                    return (
                      <div key={L.id} className="p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-2">{L.food.name}</p>
                            <p className="text-[10px] font-medium text-[var(--text-muted)] mt-1">
                              {gRow != null ? `${n.calories} kcal` : '—'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLines(prev => prev.filter(x => x.id !== L.id))}
                            className="shrink-0 rounded-xl p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                            aria-label={t('nut.ration.remove')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                            {t('nut.ration.th.g')}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={L.gramsStr}
                            onChange={e =>
                              setLines(prev =>
                                prev.map(x => (x.id === L.id ? { ...x, gramsStr: e.target.value } : x)),
                              )
                            }
                            className={cn(
                              'mt-1 w-full min-h-[48px] bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg px-3 text-base font-bold text-[var(--text-primary)]',
                              parsePositiveGrams(L.gramsStr) == null && L.gramsStr.trim() !== '' && 'border-amber-500/60',
                            )}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {getPortionQuickSelectPresets(L.food, 5).map(s => (
                              <button
                                key={`${L.id}-m-${s.name}-${s.grams}`}
                                type="button"
                                onClick={() =>
                                  setLines(prev =>
                                    prev.map(x =>
                                      x.id === L.id ? { ...x, gramsStr: String(Math.max(1, Math.round(s.grams))) } : x,
                                    ),
                                  )
                                }
                                className="min-h-[40px] px-2.5 rounded-lg text-[10px] font-bold border border-[var(--border-muted)] text-[var(--text-muted)] hover:text-brand hover:border-brand/30 touch-manipulation"
                              >
                                {s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const g = inferStueckGramsFromFood(L.food);
                                setLines(prev => prev.map(x => (x.id === L.id ? { ...x, gramsStr: String(Math.max(1, g)) } : x)));
                              }}
                              className="min-h-[40px] px-2.5 rounded-lg text-[10px] font-bold border border-[var(--border-muted)] text-[var(--text-muted)] hover:text-brand hover:border-brand/30 touch-manipulation"
                            >
                              {t('nut.ration.onePc')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <table className="hidden md:table w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[var(--border-muted)] bg-[var(--card-bg)]">
                      <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)] w-12 text-center"> </th>
                      <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)]">{t('nut.ration.th.ing')}</th>
                      <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)] w-24 sm:w-28">
                        {t('nut.ration.th.g')}
                      </th>
                      <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)] w-10 sm:w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-dashed border-[var(--border-muted)]">
                      <td colSpan={4} className="p-0">
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          className="w-full min-h-[52px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand hover:bg-[var(--card-bg)] transition-colors touch-manipulation"
                        >
                          <Plus size={18} strokeWidth={2.5} />
                          {t('nut.ration.addLine')}
                        </button>
                      </td>
                    </tr>
                    {lines.map((L, rowIdx) => {
                      const gRow = lineGrams[rowIdx];
                      const n = gRow != null ? nutsForGrams(L.food, gRow) : { calories: 0, protein: 0, carbs: 0, fat: 0 };
                      return (
                        <tr key={L.id} className="border-b border-[var(--border-muted)] last:border-b-0 align-middle">
                          <td className="py-2 px-1 text-center text-[var(--text-muted)]">·</td>
                          <td className="py-2 px-2 font-bold text-[var(--text-primary)]">
                            <span className="line-clamp-2">{L.food.name}</span>
                            <span className="block text-[10px] font-medium text-[var(--text-muted)] mt-0.5">
                              {gRow != null ? `${n.calories} kcal` : '—'}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={L.gramsStr}
                              onChange={e =>
                                setLines(prev =>
                                  prev.map(x => (x.id === L.id ? { ...x, gramsStr: e.target.value } : x)),
                                )
                              }
                              className={cn(
                                'w-full min-h-[40px] bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-lg px-2 text-sm font-bold text-[var(--text-primary)]',
                                parsePositiveGrams(L.gramsStr) == null && L.gramsStr.trim() !== '' && 'border-amber-500/60',
                              )}
                            />
                            <div className="flex flex-wrap gap-1 mt-1.5 max-w-[11rem] sm:max-w-[14rem]">
                              {getPortionQuickSelectPresets(L.food, 5).map(s => (
                                <button
                                  key={`${L.id}-${s.name}-${s.grams}`}
                                  type="button"
                                  onClick={() =>
                                    setLines(prev =>
                                      prev.map(x =>
                                        x.id === L.id ? { ...x, gramsStr: String(Math.max(1, Math.round(s.grams))) } : x,
                                      ),
                                    )
                                  }
                                  className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-[var(--border-muted)] text-[var(--text-muted)] hover:text-brand hover:border-brand/30 touch-manipulation"
                                >
                                  {s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const g = inferStueckGramsFromFood(L.food);
                                  setLines(prev => prev.map(x => (x.id === L.id ? { ...x, gramsStr: String(Math.max(1, g)) } : x)));
                                }}
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-[var(--border-muted)] text-[var(--text-muted)] hover:text-brand hover:border-brand/30 touch-manipulation"
                              >
                                {t('nut.ration.onePc')}
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-1">
                            <button
                              type="button"
                              onClick={() => setLines(prev => prev.filter(x => x.id !== L.id))}
                              className="p-2 text-[var(--text-muted)] hover:text-red-500 mx-auto flex min-w-[44px] min-h-[44px] items-center justify-center touch-manipulation"
                              aria-label={t('nut.ration.remove')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lines.length === 0 ? (
                  <>
                    <p className="md:hidden text-center text-[10px] text-[var(--text-muted)] py-6 px-4 border-t border-[var(--border-muted)]">
                      {t('nut.ration.empty')}
                    </p>
                    <p className="hidden md:block text-center text-[10px] text-[var(--text-muted)] py-6 px-4">
                      {t('nut.ration.empty')}
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-muted)] p-4 bg-[var(--background)] space-y-2">
              <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{t('nut.ration.sum')}</p>
              <p className="text-sm font-black text-[var(--text-primary)]">
                {Math.round(totals.calories)} kcal · P {Math.round(totals.protein * 10) / 10}g · C {Math.round(totals.carbs * 10) / 10}g · F{' '}
                {Math.round(totals.fat * 10) / 10}g
              </p>
              {yieldsValid && yieldsNum > 1 && (
                <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-muted)]">
                  <span className="font-black text-[var(--text-primary)]">{t('nut.ration.perPortion', { n: yieldsNum })}</span>{' '}
                  {Math.round(perPortion.calories)} kcal · P {Math.round(perPortion.protein * 10) / 10}g · C{' '}
                  {Math.round(perPortion.carbs * 10) / 10}g · F {Math.round(perPortion.fat * 10) / 10}g
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border-muted)] bg-[var(--card-bg)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[52px] sm:min-h-[48px] rounded-xl border border-[var(--border-muted)] font-black uppercase text-[10px] text-[var(--text-muted)] touch-manipulation"
            >
              {t('nut.ration.cancel')}
            </button>
            <button
              type="button"
              disabled={!name.trim() || lines.length === 0 || !allGramsValid || !yieldsValid}
              onClick={save}
              className={cn(
                'flex-1 min-h-[52px] sm:min-h-[48px] rounded-xl font-black uppercase text-[10px] ui-btn-brand shadow-lg shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation',
              )}
            >
              <Plus size={16} /> {editingTemplateId ? t('nut.ration.saveUpdate') : t('nut.ration.save')}
            </button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {pickerOpen && (
          <IngredientPickerModal key="ingredient-picker" onClose={() => setPickerOpen(false)} onPick={addFoodFromPicker} />
        )}
      </AnimatePresence>
    </>
  );
}
