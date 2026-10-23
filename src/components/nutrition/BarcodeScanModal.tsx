/**
 * Barcode-Scanner für Web (html5-qrcode) + manuelle Eingabe / Foto → Open Food Facts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, ScanBarcode, Camera, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { fetchFoodByBarcode } from '@/src/services/openFoodFactsService';
import type { Food } from '@/src/lib/foodDatabase';
import type { MealCategory } from '@/src/types';
import { mergeSessionIngredients } from '@/src/lib/mealAiShared';
import {
  inferDefaultLogPortionForFood,
  inferDoseGramsFromFood,
  inferFlascheGramsFromFood,
  inferGlasMlFromFood,
  getLogUnitEquivalentAmount,
  inferPortionGramsFromFood,
  inferScheibeGramsFromFood,
  inferStueckGramsFromFood,
  logUnitChoicesForFoodWithFallback,
} from '@/src/lib/portionUtils';
import BarcodeScanOverlay from '@/src/components/nutrition/BarcodeScanOverlay';
import {
  markBarcodeCameraConsent,
  queryCameraPermission,
  shouldAutoStartBarcodeCamera,
} from '@/src/lib/cameraPermission';
import {
  BARCODE_SCANNER_ELEMENT_ID,
  type BarcodeScannerDebugEvent,
  type BarcodeScannerHandle,
  cameraFailureMessage,
  canUseWebCamera,
  releaseBarcodeCameraStream,
  scanBarcodeFromFile,
  startBarcodeScanner,
  stopBarcodeScanner,
} from '@/src/lib/barcodeCamera';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type TrackPayload = ReturnType<typeof mergeSessionIngredients>;

interface BarcodeScanModalProps {
  onClose: () => void;
  /** Schnellaktion: Menge + Mahlzeit + direkt loggen */
  mealCategory?: MealCategory;
  onMealCategoryChange?: (category: MealCategory) => void;
  onTrack?: (data: TrackPayload) => void | Promise<void>;
  /** FoodLogModal: Produkt + optionale Gramm-Menge aus Preview übernehmen */
  onFoodFound?: (food: Food, grams?: number) => void;
  /** v2: Barcode nicht im Katalog — Anlege-Wizard */
  onBarcodeNotFound?: (barcode: string) => void;
}

const unitToGrams: Record<string, number> = {
  g: 1,
  ml: 1,
  tl: 5,
  el: 15,
  stk: 100,
};

const barcodeQuantityFieldClass =
  'box-border flex h-[52px] min-h-[52px] w-full items-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 text-lg font-black leading-none text-[var(--text-primary)]';

const barcodeUnitLabelKey: Record<string, string> = {
  portion: 'nut.barcode.unitLabel.portion',
  stk: 'nut.barcode.unitLabel.stk',
  scheibe: 'nut.barcode.unitLabel.scheibe',
  dose: 'nut.barcode.unitLabel.dose',
  glas: 'nut.barcode.unitLabel.glas',
  flasche: 'nut.barcode.unitLabel.flasche',
};

function parsePositiveQuantityInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type ScanPhase = 'scan' | 'lookup' | 'preview';
type CameraPhase =
  | 'idle'
  | 'awaiting-consent'
  | 'starting'
  | 'live'
  | 'error'
  | 'no-secure-context';

function barcodeFromFoodId(food: Food): string | null {
  if (food.id.startsWith('off_')) return food.id.slice(4);
  return null;
}

export default function BarcodeScanModal({
  onClose,
  mealCategory,
  onMealCategoryChange,
  onTrack,
  onFoodFound,
  onBarcodeNotFound,
}: BarcodeScanModalProps) {
  const { t } = useI18n();
  useMobileOverlaySheet(true);

  const scannerRef = useRef<BarcodeScannerHandle | null>(null);
  const busyRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const decodeErrorCountRef = useRef(0);
  const lastDecodeErrorRef = useRef(0);

  const [manualCode, setManualCode] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('scan');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [cameraSession, setCameraSession] = useState(0);
  const [cameraBootAllowed, setCameraBootAllowed] = useState(false);
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [unit, setUnit] = useState('g');
  const directTrackMode = Boolean(onTrack);
  const [debugInfo, setDebugInfo] = useState<{
    engine: string;
    cameraPath: string;
    lastSuccess: string | null;
    scanFrames: number;
    decodeErrors: number;
    lastDecodeError: string | null;
  }>({
    engine: '-',
    cameraPath: '-',
    lastSuccess: null,
    scanFrames: 0,
    decodeErrors: 0,
    lastDecodeError: null,
  });

  useEffect(() => {
    if (!canUseWebCamera()) return;
    let cancelled = false;
    void shouldAutoStartBarcodeCamera().then(auto => {
      if (!cancelled && auto) setCameraBootAllowed(true);
    });
    void queryCameraPermission().then(perm => {
      if (!cancelled && perm === 'denied') {
        setCameraPhase('error');
        setCameraError(t('nut.barcode.consentDeniedHint'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const requestCameraStart = useCallback(() => {
    setCameraError(null);
    setCameraBootAllowed(true);
    setCameraSession(s => s + 1);
  }, []);

  useEffect(() => {
    return () => {
      void stopBarcodeScanner(scannerRef.current, { releaseCamera: true });
      releaseBarcodeCameraStream();
      scannerRef.current = null;
    };
  }, []);

  const restartScan = useCallback(() => {
    setFoundFood(null);
    setScannedCode(null);
    setLookupError(null);
    setPhase('scan');
    setCameraBootAllowed(true);
    setCameraSession(s => s + 1);
    decodeErrorCountRef.current = 0;
    lastDecodeErrorRef.current = 0;
    setDebugInfo({
      engine: '-',
      cameraPath: '-',
      lastSuccess: null,
      scanFrames: 0,
      decodeErrors: 0,
      lastDecodeError: null,
    });
  }, []);

  const lookupBarcode = useCallback(
    async (raw: string) => {
      const code = raw.replace(/\D/g, '');
      if (busyRef.current) return false;
      if (code.length < 8) {
        setLookupError(t('nut.barcode.invalidCode'));
        setLoading(false);
        return false;
      }
      busyRef.current = true;
      setLoading(true);
      setLookupError(null);
      setScannedCode(code);
      setPhase('lookup');

      await stopBarcodeScanner(scannerRef.current);
      scannerRef.current = null;
      setCameraPhase('idle');

      try {
        const food = await fetchFoodByBarcode(code);
        setFoundFood(food);
        setPhase('preview');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        const apiStatus =
          err && typeof err === 'object' && 'status' in err
            ? Number((err as { status?: number }).status)
            : 0;
        if (apiStatus === 404 || msg.includes('404') || msg === 'product-not-found') {
          if (onBarcodeNotFound) {
            onBarcodeNotFound(code);
            return false;
          }
          setLookupError(t('nut.barcode.notFound'));
        } else if (msg === 'off-rate-limited') {
          setLookupError(t('nut.off.rateLimited'));
        } else if (msg === 'off-fetch-failed') {
          setLookupError(t('nut.off.searchUnavailable'));
        } else {
          setLookupError(t('nut.barcode.notFound'));
        }
        setPhase('scan');
        setCameraSession(s => s + 1);
        return false;
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (phase !== 'scan') return;

    let cancelled = false;

    const boot = async () => {
      if (!canUseWebCamera()) {
        setCameraPhase('no-secure-context');
        setCameraError(t('nut.barcode.insecureContext'));
        return;
      }

      if (!cameraBootAllowed) {
        const auto = await shouldAutoStartBarcodeCamera();
        if (cancelled) return;
        if (!auto) {
          setCameraPhase('awaiting-consent');
          setCameraError(null);
          return;
        }
        setCameraBootAllowed(true);
      }

      setCameraPhase('starting');
      setCameraError(null);

      await new Promise<void>(r => requestAnimationFrame(() => r()));

      try {
        const onDebugEvent = (event: BarcodeScannerDebugEvent) => {
          if (event.stage === 'engine') {
            setDebugInfo(prev => ({ ...prev, engine: event.detail ?? '-' }));
            return;
          }
          if (event.stage === 'camera_ready') {
            markBarcodeCameraConsent();
            setDebugInfo(prev => ({ ...prev, cameraPath: event.detail ?? '-' }));
            return;
          }
          if (event.stage === 'decode_success') {
            setDebugInfo(prev => ({ ...prev, lastSuccess: event.detail ?? null }));
            return;
          }
          if (event.stage === 'decode_tick') {
            setDebugInfo(prev => ({ ...prev, scanFrames: prev.scanFrames + 1 }));
            return;
          }
          if (event.stage === 'decode_error') {
            decodeErrorCountRef.current += 1;
            const now = Date.now();
            if (now - lastDecodeErrorRef.current < 600) return;
            lastDecodeErrorRef.current = now;
            setDebugInfo(prev => ({
              ...prev,
              decodeErrors: decodeErrorCountRef.current,
              lastDecodeError: event.detail ?? null,
            }));
          }
        };
        const scanner = await startBarcodeScanner(raw => {
          if (!busyRef.current) void lookupBarcode(raw);
        }, onDebugEvent);
        if (cancelled) {
          await stopBarcodeScanner(scanner);
          return;
        }
        scannerRef.current = scanner;
        setDebugInfo(prev => ({
          ...prev,
          engine: scanner.engine,
        }));
        setCameraPhase('live');
      } catch (err) {
        if (!cancelled) {
          const denied =
            err instanceof DOMException &&
            (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
          setCameraPhase('error');
          const msg = err instanceof Error ? err.message : '';
          setCameraError(
            denied
              ? t('nut.barcode.consentDeniedHint')
              : msg.includes('zxing') || msg.includes('native')
                ? t('nut.barcode.scannerStartFailed')
                : cameraFailureMessage(t, err),
          );
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      void stopBarcodeScanner(scannerRef.current).then(() => {
        scannerRef.current = null;
      });
    };
  }, [cameraBootAllowed, cameraSession, lookupBarcode, phase, t]);

  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLookupError(null);
    setLoading(true);
    await stopBarcodeScanner(scannerRef.current);
    scannerRef.current = null;
    setCameraPhase('idle');
    try {
      const raw = await scanBarcodeFromFile(file);
      const ok = await lookupBarcode(raw);
      if (!ok) {
        setPhase('scan');
        setCameraSession(s => s + 1);
      }
    } catch {
      setLookupError(t('nut.barcode.photoScanFailed'));
      setLoading(false);
      busyRef.current = false;
      setPhase('scan');
      setCameraSession(s => s + 1);
    }
  };

  useEffect(() => {
    if (!foundFood || phase !== 'preview') return;
    const def = inferDefaultLogPortionForFood(foundFood);
    setQuantityInput(String(def.quantity));
    setUnit(def.unit);
    setTrackError(null);
  }, [foundFood, phase]);

  const pieceGrams = useMemo(
    () => (foundFood ? inferStueckGramsFromFood(foundFood) : 100),
    [foundFood],
  );
  const doseGrams = useMemo(
    () => (foundFood ? inferDoseGramsFromFood(foundFood) : null),
    [foundFood],
  );
  const glasMl = useMemo(() => (foundFood ? inferGlasMlFromFood(foundFood) : null), [foundFood]);
  const flascheMl = useMemo(
    () => (foundFood ? inferFlascheGramsFromFood(foundFood) : null),
    [foundFood],
  );
  const scheibeGrams = useMemo(
    () => (foundFood ? inferScheibeGramsFromFood(foundFood) : null),
    [foundFood],
  );
  const portionGramsInf = useMemo(
    () => (foundFood ? inferPortionGramsFromFood(foundFood) : null),
    [foundFood],
  );
  const logUnits = useMemo(
    () => (foundFood ? logUnitChoicesForFoodWithFallback(foundFood, unit) : ['g']),
    [foundFood, unit],
  );
  const parsedQuantity = useMemo(() => parsePositiveQuantityInput(quantityInput), [quantityInput]);

  const portionNutrition = useMemo(() => {
    if (!foundFood?.nutrients) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const q = parsedQuantity ?? 0;
    const specificUnitToGrams: Record<string, number> = { ...unitToGrams, stk: pieceGrams };
    if (doseGrams != null) specificUnitToGrams.dose = doseGrams;
    if (glasMl != null) specificUnitToGrams.glas = glasMl;
    if (flascheMl != null) specificUnitToGrams.flasche = flascheMl;
    if (scheibeGrams != null) specificUnitToGrams.scheibe = scheibeGrams;
    else if (unit === 'scheibe') specificUnitToGrams.scheibe = pieceGrams;
    if (portionGramsInf != null) specificUnitToGrams.portion = portionGramsInf;
    else if (unit === 'portion') specificUnitToGrams.portion = pieceGrams;
    const multiplier = (q * (specificUnitToGrams[unit] ?? 1)) / 100;
    const n = foundFood.nutrients;
    return {
      calories: Math.round((n.calories || 0) * multiplier),
      protein: parseFloat(((n.protein || 0) * multiplier).toFixed(1)),
      carbs: parseFloat(((n.carbs || 0) * multiplier).toFixed(1)),
      fat: parseFloat(((n.fat || 0) * multiplier).toFixed(1)),
    };
  }, [
    foundFood,
    parsedQuantity,
    unit,
    pieceGrams,
    doseGrams,
    glasMl,
    flascheMl,
    scheibeGrams,
    portionGramsInf,
  ]);

  const canTrack = Boolean(foundFood && parsedQuantity != null);

  const unitEquivalentHint = useMemo(() => {
    if (!foundFood) return null;
    const eq = getLogUnitEquivalentAmount(foundFood, unit);
    if (!eq) return null;
    const labelKey = barcodeUnitLabelKey[unit];
    const unitLabel = labelKey ? t(labelKey) : unit;
    return t('nut.barcode.unitEquivalent', {
      unit: unitLabel,
      value: eq.value,
      measure: eq.measure,
    });
  }, [foundFood, unit, t]);

  const buildIngredient = useCallback(() => {
    if (!foundFood || parsedQuantity == null) return null;
    const idStr = String(foundFood.id ?? '');
    const nutrientSource: 'database' | 'model_estimate' = idStr.startsWith('off_')
      ? 'database'
      : 'database';
    return {
      id: foundFood.id,
      name: foundFood.name,
      amount: parsedQuantity,
      unit,
      calories: portionNutrition.calories,
      protein: portionNutrition.protein,
      carbs: portionNutrition.carbs,
      fat: portionNutrition.fat,
      nutrientSource,
    };
  }, [foundFood, parsedQuantity, unit, portionNutrition]);

  const confirmPreview = async () => {
    if (!foundFood) return;
    if (directTrackMode && onTrack) {
      const ing = buildIngredient();
      if (!ing) return;
      setTracking(true);
      setTrackError(null);
      try {
        await onTrack(mergeSessionIngredients([ing]));
        onClose();
      } catch {
        setTrackError(t('nut.barcode.trackFailed'));
      } finally {
        setTracking(false);
      }
      return;
    }
    if (onFoodFound) {
      if (parsedQuantity == null) return;
      const specificUnitToGrams: Record<string, number> = { ...unitToGrams, stk: pieceGrams };
      if (doseGrams != null) specificUnitToGrams.dose = doseGrams;
      if (glasMl != null) specificUnitToGrams.glas = glasMl;
      if (flascheMl != null) specificUnitToGrams.flasche = flascheMl;
      if (scheibeGrams != null) specificUnitToGrams.scheibe = scheibeGrams;
      else if (unit === 'scheibe') specificUnitToGrams.scheibe = pieceGrams;
      if (portionGramsInf != null) specificUnitToGrams.portion = portionGramsInf;
      else if (unit === 'portion') specificUnitToGrams.portion = pieceGrams;
      const grams = parsedQuantity * (specificUnitToGrams[unit] ?? 1);
      onFoodFound(foundFood, grams > 0 ? grams : undefined);
      onClose();
    }
  };

  const mealTypeButtons =
    directTrackMode && mealCategory && onMealCategoryChange
      ? (['breakfast', 'lunch', 'dinner', 'snack'] as MealCategory[]).map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => onMealCategoryChange(cat)}
            className={cn(
              'min-h-[40px] flex-1 rounded-xl px-2 text-[9px] font-black uppercase tracking-widest touch-manipulation',
              mealCategory === cat
                ? 'ui-mark-selected'
                : 'border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-muted)]',
            )}
          >
            {t(`nut.cat.${cat}` as 'nut.cat.breakfast')}
          </button>
        ))
      : null;

  const showLivePreview = phase === 'scan' && (cameraPhase === 'live' || cameraPhase === 'starting');
  const showAwaitingConsent = phase === 'scan' && cameraPhase === 'awaiting-consent';
  const showCameraHint =
    phase === 'scan' &&
    (cameraPhase === 'error' || cameraPhase === 'no-secure-context' || showAwaitingConsent);
  const showManualFallback = phase !== 'preview';
  const ean = foundFood ? (scannedCode ?? barcodeFromFoodId(foundFood)) : scannedCode;

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass('bg-black/70 backdrop-blur-sm')}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-6 shadow-2xl lg:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ScanBarcode size={20} className="text-brand" />
            <h3 className="text-lg font-black uppercase italic tracking-tighter text-[var(--text-primary)]">
              {phase === 'preview' ? t('nut.barcode.foundTitle') : t('nut.barcode.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopBarcodeScanner(scannerRef.current, { releaseCamera: true });
              releaseBarcodeCameraStream();
              onClose();
            }}
            className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--background)]"
            aria-label={t('nut.barcode.close')}
          >
            <X size={20} />
          </button>
        </div>

        <style>{`
          #${BARCODE_SCANNER_ELEMENT_ID} video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border-radius: 1rem;
          }
          #${BARCODE_SCANNER_ELEMENT_ID} > div {
            border: none !important;
            box-shadow: none !important;
          }
          #${BARCODE_SCANNER_ELEMENT_ID} #qr-shaded-region,
          #${BARCODE_SCANNER_ELEMENT_ID} #qr-shaded-region > div {
            display: none !important;
          }
        `}</style>

        <div
          className={cn(
            'relative mb-3 w-full overflow-hidden rounded-2xl bg-black',
            phase === 'preview' ? 'bg-transparent' : 'aspect-square max-h-[min(78vw,320px)]',
          )}
        >
          {phase === 'scan' ? (
            <>
              <div
                id={BARCODE_SCANNER_ELEMENT_ID}
                className={cn('h-full w-full min-h-[200px]', !showLivePreview && 'opacity-0')}
              />
              {showLivePreview ? (
                <BarcodeScanOverlay hint={t('nut.barcode.alignHint')} />
              ) : null}
              {cameraPhase === 'starting' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                  <Loader2 className="animate-spin text-brand" size={28} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/80">
                    {t('nut.barcode.starting')}
                  </p>
                </div>
              ) : null}
              {showAwaitingConsent ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 text-center">
                  <ScanBarcode className="text-brand" size={32} />
                  <p className="text-[10px] font-medium leading-snug text-white/90">
                    {t('nut.barcode.consentHint')}
                  </p>
                  <button
                    type="button"
                    onClick={requestCameraStart}
                    className="min-h-[44px] ui-btn-brand px-5 text-[10px] touch-manipulation"
                  >
                    {t('nut.barcode.enableCamera')}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {phase === 'lookup' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--background)]">
              <Loader2 className="animate-spin text-brand" size={36} />
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                {t('nut.barcode.lookupBusy')}
              </p>
              {scannedCode ? (
                <p className="font-mono text-xs text-[var(--text-primary)]">{scannedCode}</p>
              ) : null}
            </div>
          ) : null}

          {phase === 'preview' && foundFood ? (
            <div className="space-y-3 rounded-2xl border border-[var(--border-muted)] bg-gradient-to-b from-[var(--background)] to-[var(--card-bg)] p-4">
              <div>
                <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-brand">
                  {t('nut.barcode.offSection')}
                </p>
                <h4 className="text-base font-black leading-snug text-[var(--text-primary)]">
                  {foundFood.name}
                </h4>
                {ean ? (
                  <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                    {t('nut.barcode.eanLabel')}: {ean}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-3">
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">kcal</p>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {directTrackMode ? portionNutrition.calories : foundFood.nutrients.calories}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">P</p>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {directTrackMode ? portionNutrition.protein : foundFood.nutrients.protein}g
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">K</p>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {directTrackMode ? portionNutrition.carbs : foundFood.nutrients.carbs}g
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">F</p>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {directTrackMode ? portionNutrition.fat : foundFood.nutrients.fat}g
                  </p>
                </div>
              </div>
              <p className="text-center text-[9px] font-medium text-[var(--text-muted)]">
                {directTrackMode ? t('nut.barcode.portionFor') : t('nut.barcode.per100g')}
              </p>
              {directTrackMode ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        {t('nut.foodLog.amount')}
                      </p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quantityInput}
                        onChange={e => setQuantityInput(e.target.value)}
                        className={barcodeQuantityFieldClass}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        {t('nut.foodLog.unit')}
                      </p>
                      <select
                        value={unit}
                        onChange={e => setUnit(e.target.value)}
                        className={cn(barcodeQuantityFieldClass, 'appearance-none pr-9')}
                      >
                        {logUnits.map(u => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {unitEquivalentHint ? (
                    <p className="text-center text-[11px] font-medium text-[var(--text-muted)]">
                      {unitEquivalentHint}
                    </p>
                  ) : null}
                  {mealTypeButtons ? (
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        {t('nut.barcode.mealTime')}
                      </p>
                      <div className="flex gap-2">{mealTypeButtons}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {phase === 'scan' && process.env.NODE_ENV === 'development' ? (
          <div className="mb-3 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-2 text-[10px]">
            <p className="font-black uppercase tracking-wide text-[var(--text-muted)]">Scanner Debug</p>
            <p className="text-[var(--text-primary)]">Engine: {debugInfo.engine}</p>
            <p className="text-[var(--text-primary)]">Camera: {debugInfo.cameraPath}</p>
            <p className="text-[var(--text-primary)]">Scan frames: {debugInfo.scanFrames}</p>
            <p className="text-[var(--text-primary)]">
              Unexpected errors: {debugInfo.decodeErrors}
            </p>
            <p className="truncate text-[var(--text-muted)]">
              Last decode ok: {debugInfo.lastSuccess ?? '-'}
            </p>
            <p className="truncate text-[var(--text-muted)]">
              Last decode err: {debugInfo.lastDecodeError ?? '-'}
            </p>
          </div>
        ) : null}

        {showCameraHint && cameraPhase !== 'awaiting-consent' ? (
          <p className="mb-3 text-xs font-medium leading-snug text-[var(--text-muted)]" role="alert">
            {cameraError}
          </p>
        ) : null}

        {phase === 'preview' ? (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={restartScan}
              className="flex min-h-[48px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]"
            >
              <RotateCcw size={16} />
              {t('nut.barcode.scanAgain')}
            </button>
            <button
              type="button"
              disabled={directTrackMode ? !canTrack || tracking : false}
              onClick={() => void confirmPreview()}
              className="flex min-h-[48px] flex-[1.2] touch-manipulation items-center justify-center gap-2 ui-btn-brand text-[10px] disabled:opacity-50"
            >
              {tracking ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {directTrackMode ? t('nut.barcode.trackNow') : t('nut.barcode.confirm')}
            </button>
          </div>
        ) : null}

        {trackError ? (
          <p className="mb-3 text-[11px] font-bold text-red-500" role="alert">
            {trackError}
          </p>
        ) : null}

        {showManualFallback ? (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => photoInputRef.current?.click()}
              className="mb-4 flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-brand/35 bg-brand/10 text-[10px] font-black uppercase tracking-widest text-brand disabled:opacity-50"
            >
              <Camera size={16} />
              {t('nut.barcode.scanFromPhoto')}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => void onPhotoSelected(e)}
            />

            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.barcode.manualLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualCode}
                onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('nut.barcode.manualPh')}
                className="min-h-[48px] flex-1 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 text-sm font-bold text-[var(--text-primary)]"
              />
              <button
                type="button"
                disabled={loading || manualCode.replace(/\D/g, '').length < 8}
                onClick={() => void lookupBarcode(manualCode)}
                className="min-h-[48px] shrink-0 ui-btn-brand px-4 text-[10px] disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : t('nut.barcode.lookup')}
              </button>
            </div>
          </>
        ) : null}

        {lookupError ? (
          <p className="mt-3 text-[11px] font-bold text-red-500" role="alert">
            {lookupError}
          </p>
        ) : null}

        <p className="mt-4 text-[9px] font-medium leading-snug text-[var(--text-muted)]">
          {t('nut.barcode.attribution')}
        </p>
      </motion.div>
    </motion.div>,
  );
}
