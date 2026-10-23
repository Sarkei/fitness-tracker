/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Apple, Plus, Search, Brain, Camera, Settings2, Trash2, Clock, ChevronDown, Save, Loader2, Salad, Coffee, Soup, Pizza, Target, History, ClipboardList, Info, ChevronRight, Flame, Activity, Star, X, ClipboardPlus, Pencil, ChevronLeft, PieChart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CoachPage from '@/src/components/coach/CoachPage';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { useAuth } from '@/src/lib/AuthContext';
import { api } from '@/src/lib/api';
import { useWorkouts } from '@/src/lib/useWorkouts';
import { useNutrition } from '@/src/lib/useNutrition';
import { useAppBootstrap } from '@/src/lib/AppDataContext';
import PageBootstrap from '@/src/components/ui/PageBootstrap';
import ErrorBanner from '@/src/components/ui/ErrorBanner';
import { cn } from '@/src/lib/utils';
import type { Food } from '@/src/lib/foodDatabase';
import type { MealCategory, Nutrition, MealTemplate } from '@/src/types';
import MissionDataMealDetailModal from './MissionDataMealDetailModal';
import { nutritionEntriesToMergedComposerSeeds, mealTemplateToComposerSeeds, formatIngredientPortion } from '@/src/lib/nutritionRationBridge';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';
import { format } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { useI18n } from '@/src/lib/i18n';
import NutritionLogSheet from './NutritionLogSheet';
import { mergeSessionIngredients } from '@/src/lib/mealAiShared';
import RationComposerModal from './RationComposerModal';
import DailyNutritionAiReview from './DailyNutritionAiReview';
import AiRecipeDraftModal from './AiRecipeDraftModal';
import { formatUserError } from '@/src/lib/formatUserError';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  resetMobileChromeAfterOverlay,
} from '@/src/lib/mobileViewport';
import { syncRemoveV3MealIngredient } from '@/src/lib/nutrition/pipeline/mealEditSync';
import PageTabGrid from '@/src/components/layout/PageTabGrid';
import { getMealTypeForCurrentTime } from '@/src/lib/mealTime';

const CATEGORIES_BASE: { id: MealCategory; messageKey: string; icon: typeof Coffee; color: string }[] = [
  { id: 'breakfast', messageKey: 'nut.cat.breakfast', icon: Coffee, color: 'text-orange-500 bg-orange-500/10 dark:bg-orange-500/15' },
  { id: 'lunch', messageKey: 'nut.cat.lunch', icon: Salad, color: 'text-brand bg-brand/10 dark:bg-brand/15' },
  { id: 'dinner', messageKey: 'nut.cat.dinner', icon: Soup, color: 'text-blue-500 bg-blue-500/10 dark:bg-blue-500/15' },
  { id: 'snack', messageKey: 'nut.cat.snack', icon: Pizza, color: 'text-purple-500 bg-purple-500/10 dark:bg-purple-500/15' },
];

/** Eine Zeile in der Tagesansicht: eine Zutat oder ein Einzel-Eintrag ohne ingredients[]. */
type DayFoodRow = {
  nutrition: Nutrition;
  ingredientIndex: number | null;
  displayName: string;
  portionLabel: string;
  calories: number;
  protein: number;
  sortKey: string;
};

function nutritionDataBadge(n: Nutrition): { label: string; tone: 'brand' | 'muted' } | null {
  if (n.pipelineVersion === 'nutrition-v3') return null;
  const hasIngredientEvidence = (n.ingredients ?? []).some((ing) => Boolean(ing.matchSource || ing.nutrientSource));
  if (hasIngredientEvidence) return { label: 'DB/Estimate', tone: 'muted' };
  return { label: 'Legacy', tone: 'muted' };
}

function buildSortedDayRowsForCategory(
  entries: Nutrition[],
  cat: MealCategory,
  locale: 'de' | 'en',
): DayFoodRow[] {
  const coll = locale === 'de' ? 'de' : 'en';
  const rows: DayFoodRow[] = [];
  for (const e of entries) {
    if (e.category !== cat) continue;
    const ings = e.ingredients && e.ingredients.length > 0 ? e.ingredients : null;
    if (ings) {
      for (let i = 0; i < ings.length; i++) {
        const ing = ings[i];
        rows.push({
          nutrition: e,
          ingredientIndex: i,
          displayName: ing.name,
          portionLabel: formatIngredientPortion(ing),
          calories: ing.calories,
          protein: ing.protein ?? 0,
          sortKey: `${e.id}\0${String(i).padStart(3, '0')}`,
        });
      }
    } else {
      rows.push({
        nutrition: e,
        ingredientIndex: null,
        displayName: e.meal,
        portionLabel:
          e.quantity != null && e.unit != null && String(e.unit).trim() !== ''
            ? `${e.quantity} ${e.unit}`
            : '',
        calories: e.calories,
        protein: e.protein ?? 0,
        sortKey: e.meal,
      });
    }
  }
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey, coll, { sensitivity: 'base' }));
  return rows;
}

/** Welche Zutatenzeile beim Bearbeiten geöffnet wird (Kombi = null). */
function ingredientIndexForNutritionEdit(n: Nutrition): number | null {
  const ings = n.ingredients;
  if (ings && ings.length >= 2) return null;
  if (ings && ings.length === 1) return 0;
  return null;
}

function buildMealFromTemplate(
  template: MealTemplate,
  portionsEaten: number,
  portionUnit: string,
  /** Tageszeit beim Loggen — nicht aus der Vorlage übernehmen. */
  category: MealCategory,
): Partial<Nutrition> {
  const yields = Math.max(1, template.yieldsPortions ?? 1);
  const portions = Math.max(0.25, portionsEaten);
  const f = portions / yields;
  return {
    meal: template.name,
    category,
    calories: Math.round(template.totalCalories * f),
    protein: Math.round(template.totalProtein * f * 10) / 10,
    carbs: Math.round(template.totalCarbs * f * 10) / 10,
    fat: Math.round(template.totalFat * f * 10) / 10,
    ingredients: (template.ingredients || []).map(ing => ({
      ...ing,
      amount: Math.round(ing.amount * f * 10) / 10,
      calories: Math.round(ing.calories * f),
      protein: Math.round(ing.protein * f * 10) / 10,
      carbs: Math.round(ing.carbs * f * 10) / 10,
      fat: Math.round(ing.fat * f * 10) / 10,
    })),
    ...(yields > 1 ? { quantity: portions, unit: portionUnit } : {}),
    date: format(new Date(), 'yyyy-MM-dd'),
  };
}

export default function NutritionPage() {
  const [searchParams] = useSearchParams();
  const coachAutoStart = searchParams.get('coachOnboarding') === '1';
  const { profile, updateProfile } = useAuth();
  const { workouts } = useWorkouts();
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const categories = useMemo(
    () => CATEGORIES_BASE.map(c => ({ ...c, label: t(c.messageKey) })),
    [t],
  );
  const aiCaps = useAiCapabilities();
  const coachTabDisabled = !aiCaps.loading && !aiCaps.enabled;
  const { nutritionEntries, mealTemplates, addMeal, saveTemplate, updateTemplate, deleteMeal, updateMeal, refetch } =
    useNutrition();
  const { loading: bootstrapLoading, error: bootstrapError, retry: retryBootstrap } = useAppBootstrap();

  const [view, setView] = useState<'daily' | 'history' | 'templates' | 'coach'>('daily');

  useEffect(() => {
    if (coachAutoStart && !coachTabDisabled) setView('coach');
  }, [coachAutoStart, coachTabDisabled]);

  useEffect(() => {
    if (coachTabDisabled && view === 'coach') setView('daily');
  }, [coachTabDisabled, view]);
  const [aiRecipeBusy, setAiRecipeBusy] = useState(false);
  const [aiRecipeOpen, setAiRecipeOpen] = useState(false);
  const [aiRecipeError, setAiRecipeError] = useState('');
  const [diaryActionError, setDiaryActionError] = useState('');
  useEffect(() => {
    if (!diaryActionError) return;
    const t = window.setTimeout(() => setDiaryActionError(''), 4000);
    return () => window.clearTimeout(t);
  }, [diaryActionError]);
  const [foodLogEdit, setFoodLogEdit] = useState<{
    nutrition: Nutrition;
    ingredientIndex: number | null;
  } | null>(null);
  const [isLogging, setIsLogging] = useState<{ active: boolean; category: MealCategory | null }>({ active: false, category: null });
  const [showRationComposer, setShowRationComposer] = useState(false);
  /** Remount composer when presets change (Mission Data merge vs blank). */
  const [rationComposerKey, setRationComposerKey] = useState(0);
  const [rationComposerPreset, setRationComposerPreset] = useState<{
    lines?: { food: Food; grams: number }[];
    initialName?: string;
    initialCategory?: MealCategory;
    initialYieldsPortions?: string;
  } | null>(null);
  const [missionDetailEntry, setMissionDetailEntry] = useState<Nutrition | null>(null);
  const [missionSelectMode, setMissionSelectMode] = useState(false);
  const [missionSelectedIds, setMissionSelectedIds] = useState<string[]>([]);
  const [deployTemplate, setDeployTemplate] = useState<MealTemplate | null>(null);
  const [deployPortions, setDeployPortions] = useState('1');
  const [deployMealCategory, setDeployMealCategory] = useState<MealCategory>(() => getMealTypeForCurrentTime());
  const [templateDetail, setTemplateDetail] = useState<MealTemplate | null>(null);
  const [rationComposerEditingId, setRationComposerEditingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const rawCalories = profile?.goals?.dailyCalories;
  const targetCalories = (rawCalories && !isNaN(rawCalories)) ? rawCalories : 2400;
  const targetMacros = profile?.goals?.macros || { protein: 180, carbs: 240, fat: 80 };

  const todayString = format(new Date(), 'yyyy-MM-dd');
  const selectedEntries = useMemo(() =>
    nutritionEntries.filter(entry => {
      const entryDate = typeof entry.date === 'string' ? entry.date.split('T')[0] : format(new Date(entry.date), 'yyyy-MM-dd');
      return entryDate === selectedDate;
    }), 
    [nutritionEntries, selectedDate]
  );

  const selectedRowsByCategory = useMemo(() => {
    const loc = locale === 'de' ? 'de' : 'en';
    return {
      breakfast: buildSortedDayRowsForCategory(selectedEntries, 'breakfast', loc),
      lunch: buildSortedDayRowsForCategory(selectedEntries, 'lunch', loc),
      dinner: buildSortedDayRowsForCategory(selectedEntries, 'dinner', loc),
      snack: buildSortedDayRowsForCategory(selectedEntries, 'snack', loc),
    };
  }, [selectedEntries, locale]);

  const activeBurnSelectedDay = useMemo(() => {
    return workouts.reduce((sum, w) => {
      const d = typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd');
      if (d !== selectedDate) return sum;
      return sum + (w.caloriesBurned || 0);
    }, 0);
  }, [workouts, selectedDate]);

  const adjustedCalorieTarget = Math.max(0, Math.round(targetCalories + activeBurnSelectedDay));
  const calorieGoalForBar = Math.max(1, adjustedCalorieTarget);
  const selectedDateLabel = useMemo(
    () => format(new Date(`${selectedDate}T12:00:00`), 'PPPP', { locale: dfLocale }),
    [selectedDate, dfLocale],
  );
  const canGoForward = selectedDate < todayString;

  const favoriteTemplates = useMemo(() => {
    const ids = profile?.favoriteMealTemplateIds || [];
    return mealTemplates.filter(mt => ids.includes(mt.id));
  }, [mealTemplates, profile?.favoriteMealTemplateIds]);

  const toggleFavoriteTemplate = (id: string) => {
    if (!profile) return;
    const cur = profile.favoriteMealTemplateIds || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    void updateProfile({ favoriteMealTemplateIds: next });
  };

  const requestDeployTemplate = (tmpl: MealTemplate) => {
    setDeployTemplate(tmpl);
    setDeployPortions('1');
    setDeployMealCategory(getMealTypeForCurrentTime());
  };

  const confirmDeployTemplate = () => {
    if (!deployTemplate) return;
    const p = Math.max(0.25, parseFloat(String(deployPortions).replace(',', '.')) || 1);
    void addMeal({
      ...buildMealFromTemplate(deployTemplate, p, t('nut.unit.portions'), deployMealCategory),
      date: selectedDate,
    });
    setDeployTemplate(null);
  };

  const openTemplateEditor = (tmpl: MealTemplate) => {
    setRationComposerEditingId(tmpl.id);
    setRationComposerPreset({
      lines: mealTemplateToComposerSeeds(tmpl),
      initialName: tmpl.name,
      initialCategory: tmpl.category,
      initialYieldsPortions: String(tmpl.yieldsPortions ?? 1),
    });
    setTemplateDetail(null);
    setRationComposerKey(k => k + 1);
    setShowRationComposer(true);
  };

  useEffect(() => {
    if (view !== 'history') {
      setMissionSelectMode(false);
      setMissionSelectedIds([]);
      setMissionDetailEntry(null);
    }
  }, [view]);

  const openBlankRationComposer = () => {
    setRationComposerEditingId(null);
    setRationComposerPreset(null);
    setRationComposerKey(k => k + 1);
    setShowRationComposer(true);
  };

  const submitAiRecipe = async (payload: { idea: string; allergies: string; yieldsPortions?: number }) => {
    setAiRecipeBusy(true);
    setAiRecipeError('');
    try {
      await api('/api/meal-templates/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          idea: payload.idea,
          ...(payload.allergies ? { allergies: payload.allergies } : {}),
          ...(payload.yieldsPortions != null ? { yieldsPortions: payload.yieldsPortions } : {}),
        }),
      });
      await refetch();
      setAiRecipeOpen(false);
    } catch (e: unknown) {
      setAiRecipeError(formatUserError(e, t, 'nut.tmpl.aiFailed'));
    } finally {
      setAiRecipeBusy(false);
    }
  };

  const openMergedRationComposerFromMission = () => {
    if (missionSelectedIds.length < 2) return;
    const sel = nutritionEntries
      .filter(e => missionSelectedIds.includes(e.id))
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() || String(a.id).localeCompare(String(b.id)),
      );
    const seeds = nutritionEntriesToMergedComposerSeeds(sel);
    setMissionSelectMode(false);
    setMissionSelectedIds([]);
    setRationComposerEditingId(null);
    setRationComposerPreset({
      lines: seeds,
      initialCategory: 'snack',
      initialYieldsPortions: '1',
    });
    setRationComposerKey(k => k + 1);
    setShowRationComposer(true);
  };

  const toggleMissionSelection = (id: string) => {
    setMissionSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const consumed = useMemo(
    () =>
      selectedEntries.reduce(
        (acc, curr) => {
          const tot = effectiveNutritionTotals(curr);
          return {
            calories: acc.calories + tot.calories,
            protein: acc.protein + tot.protein,
            carbs: acc.carbs + tot.carbs,
            fat: acc.fat + tot.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [selectedEntries],
  );

  const shiftSelectedDate = (deltaDays: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    base.setDate(base.getDate() + deltaDays);
    const next = format(base, 'yyyy-MM-dd');
    if (next > todayString) return;
    setSelectedDate(next);
  };

  const removeDayRow = async (row: DayFoodRow) => {
    const e = row.nutrition;
    const { ingredientIndex } = row;
    setDiaryActionError('');
    if (e.pipelineVersion === 'nutrition-v3' && ingredientIndex != null) {
      try {
        const outcome = await syncRemoveV3MealIngredient(e, ingredientIndex);
        if (outcome === 'deleted') {
          await deleteMeal(e.id);
        } else {
          await refetch();
        }
      } catch (err) {
        console.error('removeDayRow v3:', err);
        try {
          await refetch();
        } catch {
          /* ignore */
        }
        setDiaryActionError(t('nut.history.deleteFailed'));
      }
      return;
    }
    try {
      if (ingredientIndex != null && e.ingredients && e.ingredients.length > 0) {
        const nextIngs = e.ingredients.filter((_, j) => j !== ingredientIndex);
        if (nextIngs.length === 0) {
          await deleteMeal(e.id);
          return;
        }
        const merged = mergeSessionIngredients(nextIngs);
        const next: Nutrition = {
          ...e,
          meal: merged.meal,
          calories: merged.calories,
          protein: merged.protein,
          carbs: merged.carbs,
          fat: merged.fat,
          ingredients: merged.ingredients,
        };
        if (merged.ingredients.length === 1) {
          next.quantity = merged.ingredients[0].amount;
          next.unit = merged.ingredients[0].unit;
        } else {
          delete next.quantity;
          delete next.unit;
        }
        await updateMeal(next);
        return;
      }
      await deleteMeal(e.id);
    } catch (err) {
      console.error('removeDayRow:', err);
      try {
        await refetch();
      } catch {
        /* ignore */
      }
      setDiaryActionError(t('nut.history.deleteFailed'));
    }
  };

  const handleManualAdd = (category: MealCategory) => {
    setFoodLogEdit(null);
    setIsLogging({ active: true, category });
  };

  const openFoodLogEdit = (nutrition: Nutrition, ingredientIndex?: number | null) => {
    const fresh = nutritionEntries.find(x => x.id === nutrition.id) ?? nutrition;
    const idx =
      ingredientIndex !== undefined ? ingredientIndex : ingredientIndexForNutritionEdit(fresh);
    setMissionDetailEntry(null);
    setFoodLogEdit({ nutrition: fresh, ingredientIndex: idx });
    setIsLogging({ active: true, category: fresh.category });
  };

  if (bootstrapLoading) {
    return <PageBootstrap label={t('nut.loading')} />;
  }

  if (bootstrapError) {
    return (
      <ErrorBanner
        message={t('common.error.bootstrap')}
        onRetry={() => void retryBootstrap()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="space-y-8 pb-6">
      <header className="flex flex-col gap-3 sm:gap-4 sm:flex-row justify-between items-stretch sm:items-center">
        <div className="min-w-0 w-full sm:w-auto">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black italic uppercase tracking-tighter">{t('nut.titleHeader')}</h2>
          <p className="text-[var(--text-muted)] font-medium tracking-tight uppercase text-[10px] tracking-[0.2em] mt-1">
            {selectedDateLabel}
          </p>
        </div>
      </header>

      {view === 'daily' && favoriteTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] px-1">{t('nut.quickFav')}</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory">
            {favoriteTemplates.map(ft => (
              <button
                key={ft.id}
                type="button"
                onClick={() => requestDeployTemplate(ft)}
                className="snap-start shrink-0 min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-muted)] text-left hover:border-brand transition-all max-w-[220px] touch-manipulation"
              >
                <p className="text-[10px] font-black uppercase italic truncate">{ft.name}</p>
                <p className="text-[9px] font-black text-[var(--text-muted)] mt-1">
                  {(ft.yieldsPortions ?? 1) > 1
                    ? t('nut.kcalPerPort', { kcal: Math.round(ft.totalCalories / (ft.yieldsPortions ?? 1)) })
                    : t('nut.kcalOnly', { kcal: ft.totalCalories })}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <PageTabGrid
        tabs={[
          { id: 'daily', label: t('nut.tab.tactical'), icon: Target },
          { id: 'history', label: t('nut.tab.mission'), icon: History },
          { id: 'templates', label: t('nut.tab.rations'), icon: ClipboardList },
          {
            id: 'coach',
            label: t('nut.tab.aicoach'),
            icon: Brain,
            disabled: coachTabDisabled,
            disabledTitle: t('nut.aiDisabled'),
          },
        ]}
        activeId={view}
        onChange={id => setView(id as typeof view)}
        layoutId="activeTabNut"
      />

      {view === 'daily' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">{t('nut.titleHeader')}</p>
              <p className="text-sm font-black italic uppercase tracking-tight text-[var(--text-primary)] mt-1">
                {selectedDateLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftSelectedDate(-1)}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] hover:border-brand transition-colors"
                aria-label="Vorheriger Tag"
              >
                <ChevronLeft size={16} className="mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(todayString)}
                disabled={selectedDate === todayString}
                className={cn(
                  'min-h-[40px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors',
                  selectedDate === todayString
                    ? 'border-brand/40 bg-brand/10 text-brand cursor-default'
                    : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] hover:border-brand',
                )}
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => shiftSelectedDate(1)}
                disabled={!canGoForward}
                className={cn(
                  'min-h-[40px] min-w-[40px] rounded-xl border bg-[var(--background)] transition-colors',
                  canGoForward
                    ? 'border-[var(--border-muted)] text-[var(--text-primary)] hover:border-brand'
                    : 'border-[var(--border-muted)]/40 text-[var(--text-muted)]/50 cursor-not-allowed',
                )}
                aria-label="Nächster Tag"
              >
                <ChevronRight size={16} className="mx-auto" />
              </button>
            </div>
          </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
          {/* Mobil: Makros zuerst, dann Mahlzeiten — Desktop unverändert linke 2/3 + rechte Spalte */}
          <div className="order-1 lg:order-2 lg:col-start-3 lg:row-start-1 space-y-4">
            <div className="bg-[var(--card-bg)] text-[var(--text-primary)] p-5 sm:p-8 lg:p-10 rounded-3xl sm:rounded-[2.5rem] border border-[var(--border-muted)] shadow-lg shadow-black/5">
              <div className="flex items-center gap-3 mb-6 sm:mb-8">
                <div className="p-2 rounded-xl shrink-0 text-brand bg-brand/10 dark:bg-brand/15">
                  <PieChart size={16} className="text-brand" aria-hidden />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {t('nut.macroAnalytics')}
                </h3>
              </div>
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <span>{t('nut.performanceFuel')}</span>
                    <span className={cn(consumed.calories > adjustedCalorieTarget ? 'text-red-400' : 'text-brand')}>
                      {Math.round(consumed.calories)} / {adjustedCalorieTarget} kcal
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--border-muted)] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (consumed.calories / calorieGoalForBar) * 100)}%` }}
                      className={cn('h-full rounded-full', consumed.calories > adjustedCalorieTarget ? 'bg-red-500' : 'bg-brand')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: t('nut.macroProt'), val: consumed.protein, target: targetMacros.protein, color: 'text-brand' },
                    { label: t('nut.macroCarb'), val: consumed.carbs, target: targetMacros.carbs, color: 'text-blue-400' },
                    { label: t('nut.macroFat'), val: consumed.fat, target: targetMacros.fat, color: 'text-orange-400' },
                  ].map((m) => (
                    <div key={m.label} className="text-center">
                      <p className={cn("text-lg font-black italic", m.color)}>{Math.round(m.val)}g</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">{m.label}</p>
                    </div>
                  ))}
                </div>

                <DailyNutritionAiReview
                  aiEnabled={aiCaps.enabled}
                  aiCapabilitiesLoading={aiCaps.loading}
                  locale={locale === 'de' ? 'de' : 'en'}
                  dateYmd={selectedDate}
                  adjustedCalorieTarget={adjustedCalorieTarget}
                  targetCalories={targetCalories}
                  activeBurnToday={activeBurnSelectedDay}
                  targetMacros={targetMacros}
                  consumed={consumed}
                  todayEntries={selectedEntries}
                  goalType={profile?.goals?.type}
                />
              </div>
            </div>
          </div>

          {/* Mahlzeiten */}
          <div className="order-2 lg:order-1 lg:col-span-2 lg:col-start-1 lg:row-start-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {categories.map(cat => (
                <div key={cat.id} className="bg-[var(--card-bg)] rounded-3xl sm:rounded-[2.5rem] border border-[var(--border-muted)] p-4 sm:p-6 md:p-8 overflow-hidden group">
                  <div className="flex justify-between items-center mb-6 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("p-2 rounded-xl shrink-0", cat.color)}>
                        <cat.icon size={16} />
                      </div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">{cat.label}</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleManualAdd(cat.id)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-transparent bg-[var(--background)] hover:border-brand/40 hover:bg-brand/10 hover:text-brand transition-all touch-manipulation"
                      aria-label={t('nut.addMeal')}
                    >
                      <Plus size={18} strokeWidth={2.25} className="shrink-0" aria-hidden />
                    </button>
                  </div>
                  
                  <div className="space-y-0.5">
                    {selectedRowsByCategory[cat.id].length === 0 ? (
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] italic opacity-40 py-4">
                        {t('nut.noMeals')}
                      </p>
                    ) : (
                      selectedRowsByCategory[cat.id].map(row => {
                        const dataBadge = nutritionDataBadge(row.nutrition);
                        return (
                        <div 
                          key={`${row.nutrition.id}-${row.ingredientIndex ?? 'r'}`}
                          className="flex justify-between items-center gap-2 group/item cursor-pointer rounded-lg px-2 py-0.5 -mx-2 hover:bg-[var(--background)] transition-colors"
                          role="button"
                          tabIndex={0}
                          aria-label={t('nut.day.editAria', { name: row.displayName })}
                          onClick={() => openFoodLogEdit(row.nutrition, row.ingredientIndex)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openFoodLogEdit(row.nutrition, row.ingredientIndex);
                            }
                          }}
                        >
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="text-xs font-medium uppercase tracking-tight truncate text-[var(--text-primary)]">
                              {row.displayName}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] tabular-nums">
                              {t('nut.kcalOnly', { kcal: Math.round(row.calories) })}
                            </p>
                            {dataBadge ? (
                              <p
                                className={cn(
                                  'mt-1 text-[10px] font-black uppercase tracking-widest',
                                  dataBadge.tone === 'brand' ? 'text-brand' : 'text-[var(--text-muted)]',
                                )}
                              >
                                {dataBadge.label}
                              </p>
                            ) : null}
                          </div>
                          <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)] opacity-60 group-hover/item:text-brand group-hover/item:opacity-100" aria-hidden />
                          <button 
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              void removeDayRow(row);
                            }}
                            className="p-1.5 text-[var(--border-muted)] hover:text-red-500 transition-colors opacity-100 sm:opacity-70 sm:group-hover/item:opacity-100 sm:focus-visible:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                            aria-label={t('nut.history.deleteAria')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <button
              type="button"
              onClick={() => {
                setMissionSelectMode(m => !m);
                setMissionSelectedIds([]);
              }}
              className={cn(
                'min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all touch-manipulation',
                missionSelectMode
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {missionSelectMode ? t('nut.history.multiEnd') : t('nut.history.multiStart')}
            </button>
            {missionSelectMode && missionSelectedIds.length >= 2 && (
              <button
                type="button"
                onClick={openMergedRationComposerFromMission}
                className="min-h-[44px] px-4 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 flex items-center gap-2 touch-manipulation"
              >
                <ClipboardPlus size={14} />
                {t('nut.history.asRation')} ({missionSelectedIds.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {nutritionEntries.map(meal => {
              const selected = missionSelectedIds.includes(meal.id);
              return overlayPortal(
    <motion.div
                  key={meal.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (missionSelectMode) {
                      toggleMissionSelection(meal.id);
                      return;
                    }
                    openFoodLogEdit(meal);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (missionSelectMode) toggleMissionSelection(meal.id);
                      else openFoodLogEdit(meal);
                    }
                  }}
                  className={cn(
                    'bg-[var(--card-bg)] p-8 rounded-3xl border shadow-sm relative group text-left w-full transition-colors touch-manipulation outline-none',
                    missionSelectMode ? 'cursor-pointer' : 'cursor-pointer hover:border-brand/40',
                    missionSelectMode && selected ? 'border-brand ring-2 ring-brand/20' : 'border-[var(--border-muted)]',
                  )}
                >
                  {missionSelectMode && (
                    <div
                      className={cn(
                        'absolute top-5 left-5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 pointer-events-none',
                        selected ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]' : 'border-[var(--border-muted)] bg-[var(--card-bg)]',
                      )}
                      aria-hidden
                    >
                      {selected ? <span className="text-[11px] font-black">✓</span> : null}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      void deleteMeal(meal.id);
                    }}
                    className="absolute top-5 right-5 sm:top-6 sm:right-6 p-2 text-[var(--border-muted)] hover:text-red-500 transition-colors opacity-100 sm:opacity-70 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 min-h-[44px] min-w-[44px] z-10"
                    aria-label={t('nut.history.deleteAria')}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    data-testid={`nutrition-history-info-${meal.id}`}
                    onClick={e => {
                      e.stopPropagation();
                      setMissionDetailEntry(meal);
                    }}
                    className="absolute top-5 right-[3.5rem] sm:top-6 sm:right-[4.25rem] p-2 text-[var(--border-muted)] hover:text-brand transition-colors opacity-100 sm:opacity-70 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 min-h-[44px] min-w-[44px] z-10"
                    aria-label="Details anzeigen"
                  >
                    <Info size={16} />
                  </button>
                  <p
                    className={cn(
                      'text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2',
                      missionSelectMode && 'pl-8',
                    )}
                  >
                    {format(new Date(meal.date), 'PPP', { locale: dfLocale })}
                  </p>
                  <h4 className={cn('text-lg font-bold uppercase tracking-tight mb-2', missionSelectMode && 'pl-2')}>{meal.meal}</h4>
                  <p className="text-[10px] font-black uppercase text-brand mb-4">{t(`nut.cat.${meal.category}` as 'nut.cat.snack')}</p>
                  <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Flame size={12} /> {meal.calories} kcal
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity size={12} /> {t('nut.history.proteinG', { g: Math.round(meal.protein || 0) })}
                    </span>
                    {nutritionDataBadge(meal) ? (
                      <span className={cn('flex items-center gap-1', nutritionDataBadge(meal)!.tone === 'brand' ? 'text-brand' : '')}>
                        <Info size={12} /> {nutritionDataBadge(meal)!.label}
                      </span>
                    ) : null}
                  </div>
                  {!missionSelectMode && (
                    <p className="text-[9px] font-black uppercase text-[var(--text-muted)] mt-4 tracking-widest flex items-center gap-1.5">
                      <Pencil size={10} aria-hidden />
                      {t('nut.history.tapEdit')}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'templates' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              title={
                !aiCaps.loading && !aiCaps.enabled
                  ? t('coach.ai.noset')
                  : undefined
              }
              onClick={() => {
                if (!aiCaps.enabled) return;
                setAiRecipeError('');
                setAiRecipeOpen(true);
              }}
              disabled={aiRecipeBusy || aiCaps.loading || !aiCaps.enabled}
              className="min-h-[48px] px-5 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-brand transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {aiRecipeBusy ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
              {t('nut.tmpl.aiRecipe')}
            </button>
            <button
              type="button"
              onClick={openBlankRationComposer}
              className="min-h-[48px] px-5 rounded-2xl ui-btn-brand text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20"
            >
              {t('nut.tmpl.compose')}
            </button>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {mealTemplates.map(tmpl => (
            <motion.div 
              key={tmpl.id}
              className="bg-[var(--card-bg)] p-6 sm:p-8 rounded-[2rem] border border-[var(--border-muted)] hover:border-brand transition-all group relative"
            >
              <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-brand pointer-events-none"
                  aria-hidden
                >
                  <ClipboardList size={18} />
                </div>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    toggleFavoriteTemplate(tmpl.id);
                  }}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors touch-manipulation',
                    (profile?.favoriteMealTemplateIds || []).includes(tmpl.id)
                      ? 'text-amber-500 bg-amber-500/10'
                      : 'text-[var(--text-muted)] hover:text-amber-500 bg-[var(--background)]',
                  )}
                  aria-label={t('nut.tmpl.fav')}
                >
                  <Star
                    size={18}
                    className={(profile?.favoriteMealTemplateIds || []).includes(tmpl.id) ? 'fill-amber-500' : ''}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setTemplateDetail(tmpl)}
                className="text-left w-full mb-4 pr-[6.75rem] sm:pr-[7.5rem] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <h4 className="font-black italic uppercase tracking-tighter text-lg text-[var(--text-primary)]">{tmpl.name}</h4>
                <p className="text-[9px] font-bold text-[var(--text-muted)] mt-1 uppercase tracking-widest">{t('nut.tmpl.detailSubtitle')}</p>
                <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mt-3">
                  <span>{t('nut.tmpl.kcalTotal', { kcal: tmpl.totalCalories })}</span>
                  {(tmpl.yieldsPortions ?? 1) > 1 && (
                    <span className="text-brand">
                      {t('nut.tmpl.yields', {
                        n: tmpl.yieldsPortions ?? 1,
                        kcal: Math.round(tmpl.totalCalories / (tmpl.yieldsPortions ?? 1)),
                      })}
                    </span>
                  )}
                  <span>P: {tmpl.totalProtein}g</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => requestDeployTemplate(tmpl)}
                className="w-full min-h-[48px] py-3 border border-[var(--border-muted)] bg-[var(--background)] rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:border-brand/40 hover:bg-brand/10 hover:text-brand transition-all touch-manipulation"
              >
                {t('nut.tmpl.deploy')}
              </button>
            </motion.div>
          ))}
        </div>
        </div>
      )}

      {view === 'coach' && (
        <CoachPage planType="nutrition" autoStartOnboarding={coachAutoStart} />
      )}

      <AnimatePresence>
        {showRationComposer && (
          <RationComposerModal
            key={rationComposerKey}
            editingTemplateId={rationComposerEditingId}
            onClose={() => {
              setShowRationComposer(false);
              setRationComposerPreset(null);
              setRationComposerEditingId(null);
            }}
            onSave={data => {
              void (async () => {
                try {
                  if (data.id) {
                    await updateTemplate({
                      id: data.id,
                      name: data.name,
                      category: data.category,
                      ingredients: data.ingredients,
                      totalCalories: data.totalCalories,
                      totalProtein: data.totalProtein,
                      totalCarbs: data.totalCarbs,
                      totalFat: data.totalFat,
                      yieldsPortions: data.yieldsPortions,
                    });
                  } else {
                    await saveTemplate(data);
                  }
                } catch (e) {
                  console.error(e);
                  return;
                }
                setShowRationComposer(false);
                setRationComposerPreset(null);
                setRationComposerEditingId(null);
              })();
            }}
            initialComposerLines={rationComposerPreset?.lines}
            initialName={rationComposerPreset?.initialName}
            initialCategory={rationComposerPreset?.initialCategory}
            initialYieldsPortions={rationComposerPreset?.initialYieldsPortions}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {missionDetailEntry && (
          <MissionDataMealDetailModal entry={missionDetailEntry} onClose={() => setMissionDetailEntry(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {templateDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={mobileSheetOverlayClass()}
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setTemplateDetail(null)}
              role="presentation"
            />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="relative z-10 w-full max-w-lg max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-hidden flex flex-col bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-t-[1.75rem] lg:rounded-[1.75rem] shadow-2xl touch-manipulation"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border-muted)] shrink-0 pt-[max(1.25rem,env(safe-area-inset-top))]">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.tmpl.detailTitle')}</p>
                  <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] truncate mt-1">
                    {templateDetail.name}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
                    {(templateDetail.yieldsPortions ?? 1) > 1
                      ? t('nut.tmpl.detailYields', {
                          n: templateDetail.yieldsPortions ?? 1,
                          kcal: templateDetail.totalCalories,
                        })
                      : t('nut.tmpl.detailYieldsOne', { kcal: templateDetail.totalCalories })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTemplateDetail(null)}
                  className="p-2 rounded-xl hover:bg-[var(--background)] shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label={t('nut.tmpl.detailClose')}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                  {t('nut.tmpl.detailIngredients')}
                </p>
                <div className="rounded-xl border border-[var(--border-muted)] overflow-hidden bg-[var(--background)]">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-[var(--border-muted)] bg-[var(--card-bg)]">
                        <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)]">{t('nut.ration.th.ing')}</th>
                        <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)]">{t('nut.tmpl.detailPortion')}</th>
                        <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)] text-right">{t('nut.label.kcal')}</th>
                        <th className="py-2 px-2 font-black uppercase text-[10px] text-[var(--text-muted)] text-right hidden sm:table-cell">
                          {t('nut.tmpl.detailMacros')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(templateDetail.ingredients ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 px-3 text-center text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">
                            —
                          </td>
                        </tr>
                      ) : (
                        templateDetail.ingredients!.map((ing, idx) => (
                          <tr key={`${ing.name}-${idx}`} className="border-b border-[var(--border-muted)] last:border-b-0 align-top">
                            <td className="py-2.5 px-2 font-bold text-[var(--text-primary)]">{ing.name}</td>
                            <td className="py-2.5 px-2 text-[var(--text-muted)] whitespace-pre-wrap">{formatIngredientPortion(ing)}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-[var(--text-muted)]">{Math.round(ing.calories)}</td>
                            <td className="py-2.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell tabular-nums">
                              {ing.protein} / {ing.carbs} / {ing.fat}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="p-4 border-t border-[var(--border-muted)] shrink-0 flex flex-col sm:flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setTemplateDetail(null)}
                  className="flex-1 min-h-[52px] rounded-xl border border-[var(--border-muted)] font-black uppercase text-[10px] text-[var(--text-muted)] touch-manipulation"
                >
                  {t('nut.tmpl.detailClose')}
                </button>
                <button
                  type="button"
                  onClick={() => openTemplateEditor(templateDetail)}
                  className="flex-1 min-h-[52px] rounded-xl ui-btn-brand font-black uppercase text-[10px] shadow-lg shadow-brand/20 touch-manipulation"
                >
                  {t('nut.tmpl.edit')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deployTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={mobileSheetOverlayClass()}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeployTemplate(null)} role="presentation" />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="relative z-10 w-full max-w-md max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] bg-[var(--card-bg)] border border-[var(--border-muted)] rounded-t-[1.75rem] lg:rounded-[1.75rem] shadow-2xl p-6 touch-manipulation"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-3 mb-4 pt-[max(0.25rem,env(safe-area-inset-top))]">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.deploy.title')}</p>
                  <h3 className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)] truncate">{deployTemplate.name}</h3>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    {t('nut.deploy.summary', {
                      total: deployTemplate.yieldsPortions ?? 1,
                      kcal: Math.round(deployTemplate.totalCalories / (deployTemplate.yieldsPortions ?? 1)),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeployTemplate(null)}
                  className="flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 hover:bg-[var(--background)]"
                  aria-label={t('nut.mission.close')}
                >
                  <X size={20} />
                </button>
              </div>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest block mb-1">{t('nut.deploy.mealSlot')}</label>
              <select
                value={deployMealCategory}
                onChange={e => setDeployMealCategory(e.target.value as MealCategory)}
                className="w-full min-h-[52px] mb-4 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)] text-base"
              >
                <option value="breakfast">{t('nut.cat.breakfast')}</option>
                <option value="lunch">{t('nut.cat.lunch')}</option>
                <option value="dinner">{t('nut.cat.dinner')}</option>
                <option value="snack">{t('nut.cat.snack')}</option>
              </select>
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.deploy.howMany')}</label>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={deployPortions}
                onChange={e => setDeployPortions(e.target.value)}
                className="mt-2 w-full min-h-[52px] bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 font-bold text-[var(--text-primary)] text-base"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-2 mb-5">
                {t('nut.deploy.tracked', {
                  kcal: Math.round(
                    (deployTemplate.totalCalories * Math.max(0.25, parseFloat(String(deployPortions).replace(',', '.')) || 1)) /
                      Math.max(1, deployTemplate.yieldsPortions ?? 1),
                  ),
                })}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeployTemplate(null)}
                  className="flex-1 min-h-[52px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase text-[var(--text-muted)] touch-manipulation"
                >
                  {t('nut.deploy.cancel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDeployTemplate}
                  className="flex-1 min-h-[52px] rounded-xl ui-btn-brand text-[10px] font-black uppercase shadow-lg shadow-brand/20 touch-manipulation"
                >
                  {t('nut.deploy.log')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLogging.active && isLogging.category ? (
          <NutritionLogSheet
            defaultCategory={isLogging.category}
            selectedDate={selectedDate}
            nutritionEntries={nutritionEntries}
            editTarget={foodLogEdit}
            onEditSave={async patch => {
              const cur = nutritionEntries.find(e => e.id === patch.id);
              if (!cur) return;
              const next: Nutrition = { ...cur, ...patch };
              if (patch.ingredients && patch.ingredients.length > 1) {
                delete next.quantity;
                delete next.unit;
              } else if (patch.ingredients?.length === 1) {
                next.quantity = patch.ingredients[0].amount;
                next.unit = patch.ingredients[0].unit;
              }
              await updateMeal(next);
              setFoodLogEdit(null);
              setIsLogging({ active: false, category: null });
            }}
            onClose={() => {
              resetMobileChromeAfterOverlay();
              setFoodLogEdit(null);
              setIsLogging({ active: false, category: null });
            }}
            onAfterSave={async () => {
              await refetch();
              resetMobileChromeAfterOverlay();
              setFoodLogEdit(null);
              setIsLogging({ active: false, category: null });
            }}
            onLog={async data => {
              await addMeal({
                ...data,
                category: isLogging.category!,
                date: data.date || selectedDate,
              });
              setFoodLogEdit(null);
              setIsLogging({ active: false, category: null });
            }}
          />
        ) : null}

      <AiRecipeDraftModal
        open={aiRecipeOpen}
        busy={aiRecipeBusy}
        onClose={() => !aiRecipeBusy && setAiRecipeOpen(false)}
        onSubmit={payload => void submitAiRecipe(payload)}
      />
      {aiRecipeError && (
        <p className="fixed bottom-24 left-4 right-4 z-[130] text-center text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/80 p-3 rounded-xl border border-red-200">
          {aiRecipeError}
        </p>
      )}
      {diaryActionError && (
        <p
          role="alert"
          className="fixed bottom-24 left-4 right-4 z-[130] text-center text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/80 p-3 rounded-xl border border-red-200"
        >
          {diaryActionError}
        </p>
      )}
    </div>
  );
}
