import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X, ScanBarcode, Search, Brain, Loader2, Camera, Check } from 'lucide-react';
import type { MealCategory, Ingredient, Nutrition } from '@/src/types';
import type { Food } from '@/src/lib/foodDatabase';
import type { ResolvedFoodLine } from '@/src/lib/nutrition/schemas';
import { buildPortionOptions, pickDefaultPortion, toGrams } from '@/src/lib/nutrition/portionCatalog';
import { macrosForGrams } from '@/src/lib/nutrition/macroCalculator';
import { macrosForCandidate } from '@/src/lib/nutrition/pipeline/nutritionFromCandidate';
import { recomputePipelineFromReview } from '@/src/lib/nutrition/pipeline/legacyAdapter';
import {
  appendManualFoodToPipeline,
  removeComponentFromPipeline,
} from '@/src/lib/nutrition/pipeline/manualFoodMatch';
import {
  parseMealText,
  resolveMealIntent,
  searchFoodsV2,
  fetchFoodV2,
  savePortionPrefs,
  submitMealFeedback,
  processNutritionPipelineV3,
  finalizeNutritionPipelineV3,
  updateNutritionPipelineV3,
  reprocessNutritionPipelineV3,
  trackNutritionV3UxEvent,
  fetchNutritionLogComponents,
  type NutritionReprocessDelta,
  type PlausibilityIssue,
} from '@/src/services/nutritionLogService';
import { formatDeltaLabel } from '@/src/lib/nutrition/pipeline/reprocessDiff';
import { pipelineResultFromStoredMeal } from '@/src/lib/nutrition/pipeline/storedMealPipeline';
import {
  filterPipelineResultToReviewed,
  initialReviewedFromPipeline,
  resolveMatchIndexForIngredient,
} from '@/src/lib/nutrition/pipeline/mealEditSync';
import { checkLineGrams } from '@/src/lib/nutrition/plausibilityCheck';
import { canSaveWithoutCandidatePick } from '@/src/lib/nutrition/matchThresholds';
import PortionPicker from './PortionPicker';
import BarcodeCreateFoodSheet from './BarcodeCreateFoodSheet';
import BarcodeScanModal from './BarcodeScanModal';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { buildFrequentTrackedFoods } from '@/src/lib/frequentTrackedFoods';
import type { PipelineResult } from '@/src/lib/nutrition/pipeline/schemas';
import MealReviewScreen, { type ReviewedComponent } from './MealReviewScreen';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  resetMobileChromeAfterOverlay,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type Tab = 'search' | 'describe' | 'recent';

function normalizeInitialTab(tab?: Tab | 'photo' | 'scan'): Tab {
  if (tab === 'photo') return 'describe';
  if (tab === 'scan') return 'search';
  return tab ?? 'describe';
}

type DraftLine = {
  key: string;
  food: Food;
  portionOptions: ReturnType<typeof buildPortionOptions>;
  selectedPortionId: string;
  quantity: number;
  resolved?: ResolvedFoodLine;
  /** Ursprünglicher Auto-Match vor Nutzerwahl */
  originalFoodId?: string;
  foodHint?: string;
  candidatePicked?: boolean;
};

function pickPieceFirstOption(options: ReturnType<typeof buildPortionOptions>) {
  return options.find((opt) => opt.logUnit === 'stk') ?? options[0];
}

function quantityFromGramsForOption(option: ReturnType<typeof buildPortionOptions>[number], grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return option.quantity;
  if (option.logUnit === 'g' || option.logUnit === 'ml') return Math.max(1, Math.round(grams));
  const raw = grams / Math.max(1, option.grams);
  const snappedInt = Math.round(raw);
  if (Math.abs(raw - snappedInt) <= 0.2) {
    return Math.max(0.25, snappedInt);
  }
  return Math.max(0.25, Math.round(raw * 4) / 4);
}

type Props = {
  onClose: () => void;
  onLog: (data: {
    meal: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    category: MealCategory;
    ingredients: Ingredient[];
    date?: string;
  }) => void | Promise<void>;
  /** Nach V3-Finalize (kein doppeltes POST /api/nutrition). */
  onAfterSave?: () => void | Promise<void>;
  defaultCategory?: MealCategory;
  selectedDate?: string;
  initialTab?: Tab | 'photo' | 'scan';
  initialOpenBarcode?: boolean;
  nutritionEntries?: Array<{ date: string; ingredients?: Ingredient[]; meal?: string; foodId?: string; quantity?: number; unit?: string; calories: number; protein?: number; carbs?: number; fat?: number }>;
  editTarget?: { nutrition: Nutrition; ingredientIndex: number | null } | null;
  onEditSave?: (patch: Partial<Nutrition> & { id: string }) => void | Promise<void>;
};

function lineToIngredient(d: DraftLine): Ingredient {
  const opt = d.portionOptions.find((o) => o.id === d.selectedPortionId) ?? d.portionOptions[0];
  const grams = toGrams({ ...opt, quantity: d.quantity });
  const m = macrosForGrams(d.food, grams);
  return {
    name: d.food.name,
    amount: d.quantity,
    unit: opt.logUnit,
    calories: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    id: d.food.id,
    matchScore: d.resolved?.matchScore,
    matchSource: d.resolved?.source,
    nutrientSource: 'database',
  };
}

async function fileToImageDataUrl(file: File, maxEdge = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('invalid-image-file');
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = reject;
      node.src = objectUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image-context-unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function NutritionLogSheet({
  onClose,
  onLog,
  onAfterSave,
  defaultCategory = 'lunch',
  selectedDate,
  initialTab = 'describe',
  initialOpenBarcode = false,
  nutritionEntries = [],
  editTarget = null,
  onEditSave,
}: Props) {
  useMobileOverlaySheet(true);
  const { t } = useI18n();

  const effectiveDate = useMemo(
    () => selectedDate || new Date().toISOString().split('T')[0],
    [selectedDate],
  );
  const isEdit = Boolean(editTarget);
  const [tab, setTab] = useState<Tab>(() =>
    initialOpenBarcode ? 'search' : normalizeInitialTab(initialTab),
  );
  const [text, setText] = useState('');
  const [parseBusy, setParseBusy] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Food[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<'failed' | 'rate_limited' | null>(null);
  const [searchRetryTick, setSearchRetryTick] = useState(0);
  const searchRequestRef = useRef(0);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [scanOpen, setScanOpen] = useState(initialOpenBarcode);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [category, setCategory] = useState<MealCategory>(defaultCategory);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [plausibilityIssues, setPlausibilityIssues] = useState<PlausibilityIssue[]>([]);
  const [mediumReviewOk, setMediumReviewOk] = useState(false);
  const [v3Busy, setV3Busy] = useState(false);
  const [v3Result, setV3Result] = useState<PipelineResult | null>(null);
  const [reviewedComponents, setReviewedComponents] = useState<ReviewedComponent[]>([]);
  const [pipelineInput, setPipelineInput] = useState('');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [sanityReviewOk, setSanityReviewOk] = useState(false);
  const [reprocessText, setReprocessText] = useState('');
  const [reprocessDelta, setReprocessDelta] = useState<NutritionReprocessDelta | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const sessionStartedAtRef = useRef<number>(Date.now());
  const sessionTrackedRef = useRef<boolean>(false);
  const saveSucceededRef = useRef<boolean>(false);
  /** Volle V3-Mahlzeit beim Bearbeiten einer einzelnen Zutat (Merge beim Speichern). */
  const fullV3EditRef = useRef<{ result: PipelineResult; reviewed: ReviewedComponent[] } | null>(null);
  /** Abbruch invalidiert laufende Analyse (kein setState nach Schließen). */
  const analysisRunIdRef = useRef(0);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const recentFoods = useMemo(() => buildFrequentTrackedFoods(nutritionEntries as any), [nutritionEntries]);

  const pipelineBusy = parseBusy || photoBusy || v3Busy;

  const isAnalysisRunCurrent = (runId: number) => runId === analysisRunIdRef.current;

  useEffect(() => {
    sessionStartedAtRef.current = Date.now();
    saveSucceededRef.current = false;
    if (sessionTrackedRef.current) return;
    sessionTrackedRef.current = true;
    void trackNutritionV3UxEvent({
      eventName: 'session_start',
      source: isEdit ? 'edit' : 'create',
    }).catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (!editTarget) return;
    let cancelled = false;
    const loadEdit = async () => {
      const n = editTarget.nutrition;
      setCategory(n.category);

      if (n.pipelineVersion === 'nutrition-v3') {
        try {
          const rows = await fetchNutritionLogComponents(n.id);
          if (cancelled) return;
          const result = pipelineResultFromStoredMeal(n, rows, n.ingredients ?? undefined);
          const allReviewed = initialReviewedFromPipeline(result, n.ingredients ?? undefined);
          const idx = editTarget.ingredientIndex;
          const matchIdx =
            idx != null ? resolveMatchIndexForIngredient(result, n.ingredients ?? undefined, idx) : null;
          if (matchIdx != null && matchIdx >= 0 && matchIdx < result.matches.length) {
            fullV3EditRef.current = { result, reviewed: allReviewed };
            const match = result.matches[matchIdx];
            const analysisComponent = result.analysis.components.find((c) => c.id === match.component_id);
            setV3Result({
              ...result,
              matches: [match],
              analysis: {
                ...result.analysis,
                components: analysisComponent ? [analysisComponent] : result.analysis.components.slice(matchIdx, matchIdx + 1),
              },
            });
            setReviewedComponents([allReviewed[matchIdx]]);
          } else {
            fullV3EditRef.current = null;
            setV3Result(result);
            setReviewedComponents(allReviewed);
          }
          setPipelineInput(n.originalInput || n.meal);
          setReprocessText(n.originalInput || n.meal);
          setSanityReviewOk(result.sanityWarnings.length === 0);
          setStep('review');
          return;
        } catch {
          fullV3EditRef.current = null;
          /* Fallback auf Legacy-Zeilen-Editor */
        }
      }
      fullV3EditRef.current = null;
      const ings: Ingredient[] =
        n.ingredients && n.ingredients.length > 0
          ? n.ingredients
          : [
              {
                name: n.meal,
                amount: n.quantity ?? 100,
                unit: n.unit ?? 'g',
                calories: n.calories,
                protein: n.protein ?? 0,
                carbs: n.carbs ?? 0,
                fat: n.fat ?? 0,
                id: n.foodId,
              },
            ];
      const idx = editTarget.ingredientIndex;
      const subset = idx != null ? [ings[idx]] : ings;
      const drafts: DraftLine[] = [];
      for (const ing of subset) {
        const fid = ing.id ?? (ing as { foodId?: string }).foodId;
        let food: Food;
        let portionOptions = buildPortionOptions({
          id: fid ?? `edit_${ing.name}`,
          name: ing.name,
          category: 'readymeal',
          nutrients: {
            calories: Math.round((ing.calories / Math.max(ing.amount, 1)) * 100),
            protein: Math.round(((ing.protein ?? 0) / Math.max(ing.amount, 1)) * 100),
            carbs: Math.round(((ing.carbs ?? 0) / Math.max(ing.amount, 1)) * 100),
            fat: Math.round(((ing.fat ?? 0) / Math.max(ing.amount, 1)) * 100),
          },
          servings: [{ name: '100 g', grams: 100 }],
          catalogSource: 'app',
        });
        if (fid && (fid.startsWith('off_') || fid.startsWith('generic_') || fid.startsWith('ucf_'))) {
          try {
            const loaded = await fetchFoodV2(fid);
            food = loaded.food;
            portionOptions = loaded.portionOptions.length ? loaded.portionOptions : buildPortionOptions(food);
          } catch {
            food = {
              id: fid,
              name: ing.name,
              category: 'readymeal',
              nutrients: {
                calories: Math.max(0, Math.round((ing.calories / Math.max(ing.amount, 1)) * 100)),
                protein: 0,
                carbs: 0,
                fat: 0,
              },
              servings: [{ name: '100 g', grams: 100 }],
              catalogSource: 'app',
            };
          }
        } else {
          food = {
            id: fid ?? `edit_${ing.name}`,
            name: ing.name,
            category: 'readymeal',
            nutrients: {
              calories: Math.max(0, Math.round((ing.calories / Math.max(ing.amount, 1)) * 100)),
              protein: 0,
              carbs: 0,
              fat: 0,
            },
            servings: [{ name: '100 g', grams: 100 }],
            catalogSource: 'app',
          };
        }
        const preferredOpt = pickPieceFirstOption(portionOptions);
        const currentOpt =
          portionOptions.find((o) => o.logUnit === ing.unit) ?? pickDefaultPortion(food);
        const currentGrams = toGrams({ ...currentOpt, quantity: ing.amount ?? currentOpt.quantity });
        drafts.push({
          key: `${food.id}-${Date.now()}-${drafts.length}`,
          food,
          portionOptions,
          selectedPortionId: preferredOpt.id,
          quantity: quantityFromGramsForOption(preferredOpt, currentGrams),
          candidatePicked: true,
        });
      }
      if (!cancelled) {
        setLines(drafts);
        setStep('review');
      }
    };
    void loadEdit();
    return () => {
      cancelled = true;
    };
  }, [editTarget]);

  const addFoodLine = useCallback(
    (food: Food, gramsOverride?: number) => {
      const opts = buildPortionOptions(food);
      const def = pickPieceFirstOption(opts);
      const grams =
        gramsOverride != null && Number.isFinite(gramsOverride) && gramsOverride > 0
          ? gramsOverride
          : toGrams({ ...def, quantity: def.quantity });
      const next = appendManualFoodToPipeline(v3Result, food, grams);
      setV3Result(next);
      setPipelineInput((prev) => prev || `manual:${food.name}`);
      setReviewedComponents(initialReviewedFromPipeline(next));
      setSanityReviewOk(next.sanityWarnings.length === 0);
      setStep('review');
    },
    [v3Result],
  );

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 1) {
      setSearchHits([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    const requestId = ++searchRequestRef.current;
    setSearchLoading(true);
    setSearchError(null);
    const t = setTimeout(() => {
      void searchFoodsV2(q)
        .then((r) => {
          if (searchRequestRef.current !== requestId) return;
          setSearchHits([...r.strong, ...r.similar].slice(0, 20));
          setSearchError(null);
        })
        .catch((err: unknown) => {
          if (searchRequestRef.current !== requestId) return;
          setSearchHits([]);
          const msg = err instanceof Error ? err.message : String(err ?? '');
          const code = (err as { code?: string })?.code;
          if (code === 'rate_limited' || /rate.?limit/i.test(msg)) {
            setSearchError('rate_limited');
          } else {
            setSearchError('failed');
          }
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearchLoading(false);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [searchQ, searchRetryTick]);

  const runParse = async () => {
    if (!text.trim() || pipelineBusy) return;
    const runId = ++analysisRunIdRef.current;
    const startedAt = Date.now();
    setParseBusy(true);
    setV3Busy(true);
    setPipelineError(null);
    try {
      const result = await processNutritionPipelineV3({ text: text.trim(), retries: 1 });
      if (!isAnalysisRunCurrent(runId)) return;
      setV3Result(result);
      setPipelineInput(text.trim());
      setReviewedComponents(initialReviewedFromPipeline(result));
      setSanityReviewOk(result.sanityWarnings.length === 0);
      setStep('review');
      void trackNutritionV3UxEvent({
        eventName: 'process_attempt',
        inputType: 'text',
        source: isEdit ? 'edit' : 'create',
        success: true,
        durationMs: Date.now() - startedAt,
        componentsCount: result.matches.length,
      }).catch(() => {});
    } catch (error) {
      if (!isAnalysisRunCurrent(runId)) return;
      const message = error instanceof Error ? error.message : t('nut.log.err.analyzeFailed');
      const shouldTryLegacyFallback =
        message === 'pipeline-failed' || /^analyse fehlgeschlagen\.?$/i.test(message.trim());
      if (shouldTryLegacyFallback) {
        try {
          const intent = await parseMealText(text.trim());
          if (!isAnalysisRunCurrent(runId)) return;
          const legacy = await resolveMealIntent(intent);
          if (!isAnalysisRunCurrent(runId)) return;
          const drafts: DraftLine[] = await Promise.all(
            legacy.lines.map(async (line, index) => {
              const fallbackFood: Food = {
                id: line.foodId,
                name: line.displayName,
                category: 'readymeal',
                nutrients: {
                  calories: Math.max(0, Math.round(line.per100g.kcal)),
                  protein: Math.max(0, Math.round(line.per100g.protein)),
                  carbs: Math.max(0, Math.round(line.per100g.carbs)),
                  fat: Math.max(0, Math.round(line.per100g.fat)),
                },
                servings: [{ name: '100 g', grams: 100 }],
                catalogSource: 'app',
              };
              const fetched = await fetchFoodV2(line.foodId).catch(() => null);
              const food = fetched?.food ?? fallbackFood;
              const options =
                fetched?.portionOptions?.length
                  ? fetched.portionOptions
                  : line.portionOptions.length
                    ? line.portionOptions
                    : buildPortionOptions(food);
              const selected = pickPieceFirstOption(options);
              return {
                key: `${line.foodId}-${Date.now()}-${index}`,
                food,
                portionOptions: options,
                selectedPortionId: selected.id,
                quantity: quantityFromGramsForOption(selected, line.grams),
                resolved: line,
                originalFoodId: line.foodId,
                foodHint: line.displayName,
                candidatePicked: !line.requiresCandidatePick,
              };
            }),
          );
          setLines(drafts);
          setRunId(legacy.runId ?? null);
          setPlausibilityIssues(legacy.plausibilityIssues ?? []);
          setV3Result(null);
          setReviewedComponents([]);
          setStep('review');
          setPipelineError(null);
          void trackNutritionV3UxEvent({
            eventName: 'process_attempt',
            inputType: 'text',
            source: isEdit ? 'edit' : 'create',
            success: true,
            durationMs: Date.now() - startedAt,
            componentsCount: drafts.length,
          }).catch(() => {});
          return;
        } catch {
          setPipelineError(t('nut.log.err.analyzeUnavailable'));
        }
      } else {
        setPipelineError(message);
      }
      void trackNutritionV3UxEvent({
        eventName: 'process_attempt',
        inputType: 'text',
        source: isEdit ? 'edit' : 'create',
        success: false,
        durationMs: Date.now() - startedAt,
      }).catch(() => {});
    } finally {
      if (isAnalysisRunCurrent(runId)) {
        setParseBusy(false);
        setV3Busy(false);
      }
    }
  };

  const runReprocess = async () => {
    if (!isEdit || !editTarget || !reprocessText.trim() || pipelineBusy) return;
    const runId = ++analysisRunIdRef.current;
    const startedAt = Date.now();
    setV3Busy(true);
    setPipelineError(null);
    try {
      const { result, delta } = await reprocessNutritionPipelineV3({
        nutritionId: editTarget.nutrition.id,
        text: reprocessText.trim(),
      });
      if (!isAnalysisRunCurrent(runId)) return;
      setV3Result(result);
      setPipelineInput(reprocessText.trim());
      setReviewedComponents(initialReviewedFromPipeline(result).map((row) => ({ ...row, user_modified: true })));
      setReprocessDelta(delta);
      setSanityReviewOk(result.sanityWarnings.length === 0);
      setStep('review');
      void trackNutritionV3UxEvent({
        eventName: 'reprocess_attempt',
        inputType: 'text',
        source: 'edit',
        success: true,
        durationMs: Date.now() - startedAt,
        componentsCount: result.matches.length,
      }).catch(() => {});
    } catch (error) {
      if (!isAnalysisRunCurrent(runId)) return;
      setPipelineError(error instanceof Error ? error.message : t('nut.log.err.reanalyzeFailed'));
      void trackNutritionV3UxEvent({
        eventName: 'reprocess_attempt',
        inputType: 'text',
        source: 'edit',
        success: false,
        durationMs: Date.now() - startedAt,
      }).catch(() => {});
    } finally {
      if (isAnalysisRunCurrent(runId)) setV3Busy(false);
    }
  };

  const onPhotoPicked = async (file: File) => {
    if (pipelineBusy) return;
    const runId = ++analysisRunIdRef.current;
    const startedAt = Date.now();
    setPhotoBusy(true);
    setV3Busy(true);
    setPipelineError(null);
    try {
      const imageDataUrl = await fileToImageDataUrl(file);
      if (!isAnalysisRunCurrent(runId)) return;
      const result = await processNutritionPipelineV3({ imageDataUrl, text: text.trim(), retries: 2 });
      if (!isAnalysisRunCurrent(runId)) return;
      setV3Result(result);
      setPipelineInput(text.trim());
      setReviewedComponents(initialReviewedFromPipeline(result));
      setSanityReviewOk(result.sanityWarnings.length === 0);
      setStep('review');
      setTab('describe');
      void trackNutritionV3UxEvent({
        eventName: 'process_attempt',
        inputType: text.trim() ? 'mixed' : 'image',
        source: isEdit ? 'edit' : 'create',
        success: true,
        durationMs: Date.now() - startedAt,
        componentsCount: result.matches.length,
      }).catch(() => {});
    } catch (error) {
      if (!isAnalysisRunCurrent(runId)) return;
      setPipelineError(error instanceof Error ? error.message : t('nut.log.err.analyzeFailed'));
      void trackNutritionV3UxEvent({
        eventName: 'process_attempt',
        inputType: text.trim() ? 'mixed' : 'image',
        source: isEdit ? 'edit' : 'create',
        success: false,
        durationMs: Date.now() - startedAt,
      }).catch(() => {});
    } finally {
      if (isAnalysisRunCurrent(runId)) {
        setPhotoBusy(false);
        setV3Busy(false);
      }
    }
  };

  const applyBarcodeToSearch = (code: string) => {
    const digits = code.replace(/\D/g, '');
    if (!digits) return;
    setTab('search');
    setStep('input');
    setSearchQ(digits);
  };

  const onBarcodeNotFound = (code: string) => {
    setScanOpen(false);
    applyBarcodeToSearch(code);
    setUnknownBarcode(code);
  };

  const onBarcodeFood = (food: Food, grams?: number) => {
    setScanOpen(false);
    addFoodLine(food, grams);
  };

  const needsMediumConfirm = lines.some((d) => d.resolved?.matchUncertainty === 'medium');
  const blockedLines = lines.filter(
    (d) =>
      d.resolved?.requiresCandidatePick &&
      !d.candidatePicked &&
      !canSaveWithoutCandidatePick(d.resolved.matchScore ?? 0),
  );
  const linePlausibility = lines.flatMap((d) => {
    const opt = d.portionOptions.find((o) => o.id === d.selectedPortionId) ?? d.portionOptions[0];
    const grams = toGrams({ ...opt, quantity: d.quantity });
    return checkLineGrams(grams, d.food.name);
  });
  const allIssues = [...plausibilityIssues, ...linePlausibility];
  const hasBlockingIssue = allIssues.some((i) => i.severity === 'error');
  const canSave =
    v3Result
      ? reviewedComponents.length > 0 &&
        (v3Result.sanityWarnings.length === 0 || sanityReviewOk)
      : lines.length > 0 &&
        blockedLines.length === 0 &&
        !hasBlockingIssue &&
        (!needsMediumConfirm || mediumReviewOk);

  const totals = v3Result
    ? reviewedComponents.reduce(
        (acc, row) => {
          const match = v3Result.matches.find((m) => m.component_id === row.component_id);
          const candidate = match?.candidates[(row.selectedRank || 1) - 1] ?? match?.candidates[0];
          if (!candidate) return acc;
          const macros = macrosForCandidate(candidate, row.grams);
          return {
            kcal: acc.kcal + macros.kcal,
            protein: Math.round((acc.protein + macros.protein) * 10) / 10,
            carbs: Math.round((acc.carbs + macros.carbs) * 10) / 10,
            fat: Math.round((acc.fat + macros.fat) * 10) / 10,
          };
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      )
    : lines.reduce(
        (acc, d) => {
          const ing = lineToIngredient(d);
          return {
            kcal: acc.kcal + ing.calories,
            protein: acc.protein + (ing.protein ?? 0),
            carbs: acc.carbs + (ing.carbs ?? 0),
            fat: acc.fat + (ing.fat ?? 0),
          };
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );

  const save = async () => {
    if (!canSave || (!v3Result && lines.length === 0)) return;
    setSaving(true);
    try {
      if (v3Result) {
        const preferenceUpdates = reviewedComponents
          .map((row) => {
            const match = v3Result.matches.find((m) => m.component_id === row.component_id);
            const candidate = match?.candidates[(row.selectedRank || 1) - 1] ?? match?.candidates[0];
            if (!match || !candidate?.openfoodfacts_id) return null;
            return {
              ingredientKey: match.component_name,
              preferredOpenfoodfactsId: candidate.openfoodfacts_id,
              preferredProductName: candidate.product_name,
              preferredGrams: row.grams,
            };
          })
          .filter((v): v is NonNullable<typeof v> => Boolean(v));

        const editedComponentId =
          isEdit && editTarget?.ingredientIndex != null && reviewedComponents.length === 1
            ? reviewedComponents[0]?.component_id
            : null;
        const fullV3 = editedComponentId != null ? fullV3EditRef.current : null;
        let reviewedForSave = reviewedComponents;
        if (fullV3 && editedComponentId) {
          reviewedForSave = fullV3.reviewed.map((row) =>
            row.component_id === editedComponentId ? reviewedComponents[0]! : row,
          );
        }
        const pipelineBase = fullV3?.result ?? v3Result!;
        const recomputed = filterPipelineResultToReviewed(pipelineBase, reviewedForSave);

        if (isEdit && editTarget) {
          await updateNutritionPipelineV3({
            nutritionId: editTarget.nutrition.id,
            result: recomputed,
            reviewedComponents: reviewedForSave,
            originalInput: pipelineInput || editTarget.nutrition.originalInput || '',
            date: editTarget.nutrition.date,
            category,
            preferenceUpdates,
          });
          if (onAfterSave) await onAfterSave();
          else if (onEditSave) {
            await onEditSave({
              id: editTarget.nutrition.id,
              meal: recomputed.analysis.meal_name.slice(0, 200),
              calories: recomputed.totals.kcal,
              protein: recomputed.totals.protein,
              carbs: recomputed.totals.carbs,
              fat: recomputed.totals.fat,
              category,
            });
          }
        } else {
          await finalizeNutritionPipelineV3({
            result: recomputed,
            reviewedComponents: reviewedForSave,
            originalInput: pipelineInput,
            date: effectiveDate,
            category,
            preferenceUpdates,
          });

          if (onAfterSave) {
            await onAfterSave();
          } else {
            await onLog({
              meal: recomputed.analysis.meal_name.slice(0, 200),
              calories: recomputed.totals.kcal,
              protein: recomputed.totals.protein,
              carbs: recomputed.totals.carbs,
              fat: recomputed.totals.fat,
              category,
              ingredients: [],
              date: effectiveDate,
            });
          }
        }
        saveSucceededRef.current = true;
        void trackNutritionV3UxEvent({
          eventName: 'save_attempt',
          source: isEdit ? 'edit' : 'create',
          success: true,
          durationMs: Date.now() - sessionStartedAtRef.current,
          componentsCount: reviewedForSave.length,
          correctionsCount: reviewedForSave.filter((x) => x.user_modified).length,
        }).catch(() => {});
        resetMobileChromeAfterOverlay();
        onClose();
        return;
      }

      if (!isEdit && lines.length > 0) {
        let manualPipeline = v3Result;
        for (const d of lines) {
          const opt = d.portionOptions.find((o) => o.id === d.selectedPortionId) ?? d.portionOptions[0];
          const grams = toGrams({ ...opt, quantity: d.quantity });
          manualPipeline = appendManualFoodToPipeline(manualPipeline, d.food, grams);
        }
        if (manualPipeline) {
          const reviewed = initialReviewedFromPipeline(manualPipeline);
          const recomputed = recomputePipelineFromReview(manualPipeline, reviewed);
          await finalizeNutritionPipelineV3({
            result: recomputed,
            reviewedComponents: reviewed,
            originalInput: pipelineInput || manualPipeline.analysis.meal_name,
            date: effectiveDate,
            category,
          });
          if (onAfterSave) await onAfterSave();
          else {
            await onLog({
              meal: manualPipeline.analysis.meal_name.slice(0, 200),
              calories: recomputed.totals.kcal,
              protein: recomputed.totals.protein,
              carbs: recomputed.totals.carbs,
              fat: recomputed.totals.fat,
              category,
              ingredients: [],
              date: effectiveDate,
            });
          }
          saveSucceededRef.current = true;
          void trackNutritionV3UxEvent({
            eventName: 'save_attempt',
            source: 'create',
            success: true,
            durationMs: Date.now() - sessionStartedAtRef.current,
            componentsCount: reviewed.length,
          }).catch(() => {});
          resetMobileChromeAfterOverlay();
          onClose();
          return;
        }
      }

      const ingredients = lines.map(lineToIngredient);
      const meal = isEdit
        ? editTarget!.nutrition.meal
        : lines.map((l) => l.food.name).join(', ');

      const prefs = lines.map((d) => {
        const opt = d.portionOptions.find((o) => o.id === d.selectedPortionId) ?? d.portionOptions[0];
        return {
          foodId: d.food.id,
          portionId: d.selectedPortionId,
          logUnit: opt.logUnit,
          quantity: d.quantity,
        };
      });
      await savePortionPrefs(prefs).catch(() => {});

      const corrections = lines
        .filter((d) => d.originalFoodId && d.food.id !== d.originalFoodId && d.foodHint)
        .map((d) => ({
          foodHint: d.foodHint!,
          originalFoodId: d.originalFoodId!,
          chosenFoodId: d.food.id,
        }));
      if (corrections.length > 0) {
        await submitMealFeedback({ runId, corrections }).catch(() => {});
      }

      if (isEdit && onEditSave && editTarget) {
        const patch: Partial<Nutrition> & { id: string } = {
          id: editTarget.nutrition.id,
          meal: meal.slice(0, 200),
          calories: totals.kcal,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          category,
          ingredients,
        };
        if (editTarget.ingredientIndex != null && ingredients.length === 1) {
          const orig = editTarget.nutrition.ingredients ?? [];
          const next = [...orig];
          next[editTarget.ingredientIndex] = ingredients[0];
          patch.ingredients = next;
          patch.calories = next.reduce((s, i) => s + i.calories, 0);
          patch.protein = next.reduce((s, i) => s + (i.protein ?? 0), 0);
          patch.carbs = next.reduce((s, i) => s + (i.carbs ?? 0), 0);
          patch.fat = next.reduce((s, i) => s + (i.fat ?? 0), 0);
        }
        await onEditSave(patch);
      } else {
        await onLog({
          meal: meal.slice(0, 200),
          calories: totals.kcal,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          category,
          ingredients,
          date: effectiveDate,
        });
      }
      saveSucceededRef.current = true;
      void trackNutritionV3UxEvent({
        eventName: 'save_attempt',
        source: isEdit ? 'edit' : 'create',
        success: true,
        durationMs: Date.now() - sessionStartedAtRef.current,
        componentsCount: lines.length,
      }).catch(() => {});
      resetMobileChromeAfterOverlay();
      onClose();
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : t('nut.log.err.saveFailed'));
      void trackNutritionV3UxEvent({
        eventName: 'save_attempt',
        source: isEdit ? 'edit' : 'create',
        success: false,
        durationMs: Date.now() - sessionStartedAtRef.current,
        componentsCount: v3Result ? reviewedComponents.length : lines.length,
      }).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const hasDiscardableSession = () => {
    if (saveSucceededRef.current) return false;
    if (pipelineBusy) return true;
    if (step === 'review' && (v3Result != null || lines.length > 0)) return true;
    if (text.trim().length > 0) return true;
    if (searchQ.trim().length > 0) return true;
    return false;
  };

  const cancelDialogCopy = () => {
    if (pipelineBusy) {
      return {
        title: t('nut.log.cancel.pipelineTitle'),
        body: t('nut.log.cancel.pipelineBody'),
        stayLabel: t('nut.log.cancel.pipelineStay'),
        discardLabel: t('nut.log.cancel.pipelineDiscard'),
      };
    }
    if (step === 'review' && (v3Result != null || lines.length > 0)) {
      return {
        title: t('nut.log.cancel.reviewTitle'),
        body: t('nut.log.cancel.reviewBody'),
        stayLabel: t('nut.log.cancel.stay'),
        discardLabel: t('nut.log.cancel.discard'),
      };
    }
    return {
      title: t('nut.log.cancel.inputTitle'),
      body: t('nut.log.cancel.inputBody'),
      stayLabel: t('nut.log.cancel.stay'),
      discardLabel: t('nut.log.cancel.discard'),
    };
  };

  const handleClose = () => {
    setCancelConfirmOpen(false);
    if (!saveSucceededRef.current) {
      const durationMs = Date.now() - sessionStartedAtRef.current;
      const hadInput = Boolean(text.trim() || searchQ.trim() || v3Result || lines.length > 0);
      if (hadInput) {
        void trackNutritionV3UxEvent({
          eventName: 'session_abandon',
          source: isEdit ? 'edit' : 'create',
          durationMs,
          success: false,
          componentsCount: v3Result ? reviewedComponents.length : lines.length,
        }).catch(() => {});
      }
    }
    resetMobileChromeAfterOverlay();
    onClose();
  };

  const requestClose = () => {
    if (hasDiscardableSession()) {
      setCancelConfirmOpen(true);
      return;
    }
    handleClose();
  };

  const confirmDiscardAndClose = () => {
    if (pipelineBusy) {
      analysisRunIdRef.current += 1;
      setParseBusy(false);
      setPhotoBusy(false);
      setV3Busy(false);
    }
    setCancelConfirmOpen(false);
    handleClose();
  };

  const discardDialog = cancelDialogCopy();

  return overlayPortal(
    <div className={mobileSheetOverlayClass('bg-black/70')}>
      <div className="dark relative w-full max-w-xl max-h-[min(74vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--card-bg)] border border-[var(--border-muted)] shadow-xl text-[var(--text-primary)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border-muted)] shrink-0 z-30 bg-[var(--card-bg)]">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-wide uppercase">
              {isEdit ? t('nut.log.editTitle') : t('nut.log.title')}
            </h2>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {t('nut.log.day', { date: effectiveDate })}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="min-h-[44px] min-w-[44px] p-2 -mr-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] touch-manipulation flex items-center justify-center"
            aria-label={t('common.dismiss')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isEdit && (
        <div
          className={cn(
            'flex items-stretch gap-2 overflow-x-auto snap-x snap-mandatory pl-5 pr-4 sm:px-5 py-2.5 border-b border-[var(--border-muted)] scrollbar-hide sm:grid sm:grid-cols-3 sm:overflow-visible shrink-0',
            pipelineBusy && 'pointer-events-none opacity-50',
          )}
        >
          {(
            [
              ['search', 'nut.log.tab.search', Search],
              ['describe', 'nut.log.tab.describe', Brain],
              ['recent', 'nut.log.tab.recent', Check],
            ] as const
          ).map(([id, labelKey, Icon]) => (
            <button
              key={id}
              type="button"
              disabled={pipelineBusy}
              onClick={() => {
                if (pipelineBusy) return;
                setTab(id);
                setStep('input');
              }}
              className={cn(
                'w-[calc((100%_-_1rem)/3)] min-w-[calc((100%_-_1rem)/3)] sm:min-w-0 sm:w-full h-11 min-h-[44px] px-3 sm:px-2 flex items-center justify-center gap-1.5 text-[11px] leading-none rounded-lg border transition-colors whitespace-nowrap shrink-0 snap-start',
                tab === id
                  ? 'bg-brand/15 border-brand/40 text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--background)]',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {t(labelKey)}
            </button>
          ))}
        </div>
        )}

        <div
          className={cn(
            'relative flex-1 min-h-0 p-4 sm:px-5 sm:py-4 space-y-4',
            step === 'review' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto',
            pipelineBusy && 'pointer-events-none select-none',
          )}
        >
          {pipelineBusy && (
            <div
              className="absolute inset-0 z-10 bg-black/25"
              aria-hidden
            />
          )}
          {unknownBarcode && (
            <BarcodeCreateFoodSheet
              barcode={unknownBarcode}
              onCancel={() => setUnknownBarcode(null)}
              onSaved={(food) => {
                setUnknownBarcode(null);
                addFoodLine(food);
              }}
            />
          )}
          {v3Busy && (
            <div className="rounded-lg border border-brand/30 bg-brand/10 p-3 text-xs text-brand flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('nut.log.pipelineBusy')}
            </div>
          )}
          {pipelineError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {pipelineError}
            </div>
          )}

          {tab === 'describe' && step === 'input' && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={pipelineBusy}
                tabIndex={pipelineBusy ? -1 : 0}
                aria-busy={pipelineBusy}
                placeholder={t('nut.log.describePh')}
                className={cn(
                  'w-full h-28 rounded-xl bg-black/40 border border-white/10 p-3 text-sm resize-none',
                  pipelineBusy && 'opacity-60 cursor-not-allowed',
                )}
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPhotoPicked(f);
                  e.target.value = '';
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={photoBusy || parseBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="flex-1 min-h-[44px] py-2.5 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 text-[10px] sm:text-[11px] font-semibold text-white/80 hover:bg-white/10 touch-manipulation disabled:opacity-50"
                  aria-label={t('nut.log.photoAnalyze')}
                >
                  {photoBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Camera className="w-4 h-4 shrink-0" />
                  )}
                  {photoBusy ? t('nut.log.analyzing') : t('nut.log.photoAnalyze')}
                </button>
                <button
                  type="button"
                  disabled={parseBusy || photoBusy || !text.trim()}
                  onClick={() => void runParse()}
                  className="flex-1 min-h-[44px] py-2.5 ui-btn-brand text-[10px] sm:text-[11px] inline-flex items-center justify-center gap-2 touch-manipulation"
                >
                  {parseBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Brain className="w-4 h-4 shrink-0" />
                  )}
                  {t('nut.log.understand')}
                </button>
              </div>
            </>
          )}

          {tab === 'search' && step === 'input' && (
            <>
              <div className="flex gap-2">
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={t('nut.log.searchPh')}
                  className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 touch-manipulation"
                  aria-label={t('nut.log.scanBarcode')}
                  title={t('nut.log.scanBarcode')}
                >
                  <ScanBarcode className="w-5 h-5" />
                </button>
              </div>
              {searchLoading && (
                <p className="text-xs text-white/50 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('nut.log.searching')}
                </p>
              )}
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {!searchLoading && searchError && searchQ.trim().length >= 1 && (
                  <li className="px-2 py-2 space-y-2">
                    <p className="text-sm text-amber-300/90" role="alert">
                      {searchError === 'rate_limited'
                        ? t('nut.foodLog.searchRateLimited')
                        : t('nut.foodLog.searchFailed')}
                    </p>
                    <button
                      type="button"
                      className="min-h-[40px] px-3 rounded-lg border border-white/15 text-[10px] font-black uppercase tracking-widest text-white/80"
                      onClick={() => setSearchRetryTick(n => n + 1)}
                    >
                      {t('nut.foodLog.searchRetry')}
                    </button>
                  </li>
                )}
                {!searchLoading &&
                  !searchError &&
                  searchQ.trim().length >= 1 &&
                  searchHits.length === 0 && (
                  <li className="px-2 py-2 text-sm text-white/50">{t('nut.foodLog.noHits')}</li>
                )}
                {searchHits.map((f) => {
                  const brand = String(f.brand || '').trim();
                  const kcal = Math.round(Number(f.nutrients?.calories) || 0);
                  const isBarcode = f.id.startsWith('off_') || f.catalogSource === 'openfoodfacts';
                  const meta = [
                    brand || null,
                    kcal > 0 ? t('nut.picker.per100', { kcal }) : null,
                  ].filter(Boolean);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 text-sm"
                        onClick={() => addFoodLine(f)}
                      >
                        <span className="font-medium text-white/90">{f.name}</span>
                        {(meta.length > 0 || isBarcode) && (
                          <p className="text-[10px] text-white/50 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {meta.length > 0 ? <span>{meta.join(' · ')}</span> : null}
                            {isBarcode ? (
                              <span className="rounded px-1 py-0.5 border border-white/20 uppercase tracking-wide text-[9px]">
                                {t('nut.log.search.barcodeBadge')}
                              </span>
                            ) : null}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'recent' && (
            <div className="space-y-2">
              {recentFoods.length === 0 && (
                <p className="text-sm text-white/50">{t('nut.log.recentEmpty')}</p>
              )}
              {recentFoods.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() =>
                    addFoodLine({
                      id: r.foodId ?? `recent_${r.key}`,
                      name: r.name,
                      category: 'readymeal',
                      nutrients: { calories: Math.max(0, r.lastCalories), protein: r.lastProtein, carbs: r.lastCarbs, fat: r.lastFat },
                      servings: [{ name: '100 g', grams: 100 }],
                      catalogSource: 'app',
                    })
                  }
                  className="w-full text-left rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
                >
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-white/50">
                    {r.lastAmount} {r.lastUnit} · {r.lastCalories} kcal · {r.logCount}x
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 'review' && (v3Result ? reviewedComponents.length > 0 : lines.length > 0) && (
            <div className="flex-1 min-h-0 flex flex-col gap-3 border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-white/50 uppercase">{t('nut.log.review')}</p>
              {isEdit &&
                v3Result &&
                editTarget?.nutrition.pipelineVersion === 'nutrition-v3' &&
                editTarget.ingredientIndex == null && (
                <div className="rounded-xl border border-white/15 bg-black/25 p-3 space-y-2">
                  <p className="text-xs font-medium text-white/60 uppercase">{t('nut.log.reprocessTitle')}</p>
                  <textarea
                    value={reprocessText}
                    onChange={(e) => setReprocessText(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
                    placeholder={t('nut.log.reprocessPh')}
                  />
                  <button
                    type="button"
                    disabled={v3Busy || !reprocessText.trim()}
                    onClick={() => void runReprocess()}
                    className="w-full py-2 rounded-lg border border-brand/40 text-brand text-xs font-semibold disabled:opacity-50"
                  >
                    {v3Busy ? t('nut.log.analyzing') : t('nut.log.reprocess')}
                  </button>
                  {reprocessDelta ? (
                    <p className="text-[11px] text-white/65">
                      {t('nut.log.reprocessDelta', {
                        kcal: formatDeltaLabel(reprocessDelta.kcal, 'kcal'),
                        protein: formatDeltaLabel(reprocessDelta.protein, 'g'),
                        carbs: formatDeltaLabel(reprocessDelta.carbs, 'g'),
                        fat: formatDeltaLabel(reprocessDelta.fat, 'g'),
                      })}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-3 shrink-0">
                <label className="block text-xs text-white/50">
                  {t('nut.log.meal')}
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MealCategory)}
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-sm"
                  >
                    <option value="breakfast">{t('nut.log.mealBreakfast')}</option>
                    <option value="lunch">{t('nut.log.mealLunch')}</option>
                    <option value="dinner">{t('nut.log.mealDinner')}</option>
                    <option value="snack">{t('nut.log.mealSnack')}</option>
                  </select>
                </label>
                <p className="text-center text-sm text-white/60">
                  {t('nut.log.totals', {
                    kcal: Math.round(totals.kcal),
                    protein: Math.round(totals.protein),
                    carbs: Math.round(totals.carbs),
                    fat: Math.round(totals.fat),
                  })}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-3">
                {v3Result ? (
                  <MealReviewScreen
                    result={v3Result}
                    reviewed={reviewedComponents}
                    isPhotoReview={v3Result.analysis.input_type === 'image'}
                    onReviewedChange={setReviewedComponents}
                    onAddIngredient={
                      editTarget?.ingredientIndex != null
                        ? undefined
                        : () => {
                            setTab('search');
                            setStep('input');
                          }
                    }
                    onRemoveComponent={(componentId) => {
                      const next = removeComponentFromPipeline(v3Result, componentId);
                      if (!next) {
                        setV3Result(null);
                        setReviewedComponents([]);
                        setStep('input');
                        return;
                      }
                      setV3Result(next);
                      setReviewedComponents((prev) => prev.filter((r) => r.component_id !== componentId));
                    }}
                  />
                ) : (
                  <>
                    {lines.map((d) => {
                      const opt = d.portionOptions.find((o) => o.id === d.selectedPortionId) ?? d.portionOptions[0];
                      const grams = toGrams({ ...opt, quantity: d.quantity });
                      const m = macrosForGrams(d.food, grams);
                      return (
                        <div key={d.key} className="rounded-xl border border-white/10 p-3 space-y-2">
                          <div className="flex justify-between gap-2">
                            <p className="text-sm font-medium truncate">{d.food.name}</p>
                            <div className="text-right">
                              <span className="text-xs text-white/40 shrink-0">{m.kcal} kcal</span>
                              {d.resolved && (
                                <p
                                  className={cn(
                                    'text-[10px]',
                                    d.resolved.matchUncertainty === 'blocked'
                                      ? 'text-amber-400'
                                      : d.resolved.matchUncertainty === 'medium'
                                        ? 'text-yellow-400'
                                        : 'text-white/40',
                                  )}
                                >
                                  {d.resolved.source === 'openfoodfacts' ? 'OFF' : d.resolved.source === 'generic_baseline' ? 'Generic' : 'App'}
                                  {d.resolved.requiresCandidatePick && !d.candidatePicked ? t('nut.log.pickPlease') : ''}
                                </p>
                              )}
                            </div>
                          </div>
                          {d.resolved?.requiresCandidatePick && !d.candidatePicked && (
                            <p className="text-xs text-amber-400/90">{t('nut.log.uncertainPick')}</p>
                          )}
                          {d.resolved?.candidates && d.resolved.candidates.length > 0 && (
                            <select
                              className={cn(
                                'w-full rounded bg-black/40 border px-2 py-1.5 text-xs',
                                d.resolved.requiresCandidatePick && !d.candidatePicked
                                  ? 'border-amber-500/50'
                                  : 'border-white/10',
                              )}
                              value={d.food.id}
                              onChange={async (e) => {
                                const foodId = e.target.value;
                                const { food, portionOptions } = await fetchFoodV2(foodId).catch(() => ({ food: d.food, portionOptions: d.portionOptions }));
                                const def = pickPieceFirstOption(portionOptions);
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.key === d.key
                                      ? {
                                          ...x,
                                          food,
                                          portionOptions,
                                          selectedPortionId: def.id,
                                          quantity: def.quantity,
                                          candidatePicked: true,
                                        }
                                      : x,
                                  ),
                                );
                              }}
                            >
                              {d.resolved.candidates.map((c) => (
                                <option key={c.foodId} value={c.foodId}>{c.displayName}</option>
                              ))}
                            </select>
                          )}
                          <PortionPicker
                            options={d.portionOptions}
                            selectedId={d.selectedPortionId}
                            quantity={d.quantity}
                            onSelect={(o) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === d.key
                                    ? {
                                        ...x,
                                        selectedPortionId: o.id,
                                        quantity: Math.max(0.25, Math.round(o.quantity * 100) / 100),
                                      }
                                    : x,
                                ),
                              )
                            }
                            onQuantityChange={(q) =>
                              setLines((prev) =>
                                prev.map((x) => (x.key === d.key ? { ...x, quantity: q } : x)),
                              )
                            }
                            totalGrams={grams}
                            totalKcal={m.kcal}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
                {v3Result && v3Result.sanityWarnings.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    <ul className="space-y-1">
                      {v3Result.sanityWarnings.map((message, i) => (
                        <li key={i} className="text-xs text-amber-200/90">
                          {message}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-start gap-2 text-xs text-amber-100 cursor-pointer border-t border-amber-500/25 pt-2">
                      <input
                        type="checkbox"
                        checked={sanityReviewOk}
                        onChange={(e) => setSanityReviewOk(e.target.checked)}
                        className="mt-0.5"
                      />
                      <Check className="w-3.5 h-3.5 mt-[1px] shrink-0" />
                      {t('nut.log.sanityConfirm')}
                    </label>
                  </div>
                )}
                {!v3Result && allIssues.length > 0 && (
                  <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    {allIssues.map((issue, i) => (
                      <li key={i} className="text-xs text-amber-200/90">
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
                {!v3Result && blockedLines.length > 0 && (
                  <p className="text-xs text-amber-400 text-center">
                    {t('nut.log.blockedLines', { n: blockedLines.length })}
                  </p>
                )}
                {!v3Result && needsMediumConfirm && (
                  <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mediumReviewOk}
                      onChange={(e) => setMediumReviewOk(e.target.checked)}
                      className="mt-0.5"
                    />
                    {t('nut.log.mediumConfirm')}
                  </label>
                )}
              </div>
              <div className="shrink-0 sticky bottom-0 z-20 -mx-4 px-4 sm:-mx-5 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[var(--card-bg)] from-70% via-[var(--card-bg)] to-transparent">
                <button
                  type="button"
                  disabled={saving || !canSave}
                  onClick={() => void save()}
                  className="w-full min-h-[48px] py-3 ui-btn-brand text-[11px] touch-manipulation disabled:opacity-50 shadow-lg"
                >
                  {saving
                    ? t('nut.log.saving')
                    : isEdit
                      ? t('nut.log.saveEdit')
                      : t('nut.log.save')}
                </button>
              </div>
            </div>
          )}
        </div>

        {cancelConfirmOpen && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nutrition-log-cancel-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#1a1a1a] p-5 shadow-2xl pointer-events-auto">
              <h3 id="nutrition-log-cancel-title" className="text-sm font-bold text-white">
                {discardDialog.title}
              </h3>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">{discardDialog.body}</p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelConfirmOpen(false)}
                  className="flex-1 min-h-[44px] rounded-lg border border-white/15 bg-white/5 text-[11px] font-semibold text-white/80 hover:bg-white/10 touch-manipulation"
                >
                  {discardDialog.stayLabel}
                </button>
                <button
                  type="button"
                  onClick={confirmDiscardAndClose}
                  className="flex-1 min-h-[44px] rounded-lg border border-red-500/40 bg-red-500/15 text-[11px] font-semibold text-red-200 hover:bg-red-500/25 touch-manipulation"
                >
                  {discardDialog.discardLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {scanOpen && !pipelineBusy && (
        <BarcodeScanModal
          onClose={() => setScanOpen(false)}
          onFoodFound={onBarcodeFood}
          onBarcodeNotFound={onBarcodeNotFound}
        />
      )}
    </div>,
  );
}
