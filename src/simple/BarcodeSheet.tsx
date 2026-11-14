import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, ScanBarcode, X } from 'lucide-react';
import { api } from '../lib/api';

type Product = {
  barcode: string;
  name: string;
  brand?: string;
  quantity?: string;
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  perQuantity?: string;
  imageUrl?: string | null;
};

/**
 * Barcode-Scanner für die einfache Ansicht.
 * Nutzt die BarcodeDetector-API (Chrome/Android). Ohne Kamera bleibt die manuelle Eingabe.
 */
export function BarcodeSheet({
  category,
  date,
  onClose,
  onSaved,
}: {
  category: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'found' | 'error'>('starting');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!('BarcodeDetector' in window)) {
        setStatus('error');
        setMessage('Dieser Browser kann keine Barcodes scannen. Bitte Nummer eintippen.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('scanning');
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length && codes[0].rawValue) {
              const code = String(codes[0].rawValue).replace(/[^0-9]/g, '');
              if (code.length >= 6) {
                stopCamera();
                await loadProduct(code);
                return;
              }
            }
          } catch {
            /* weiter scannen */
          }
          setTimeout(tick, 350);
        };
        setTimeout(tick, 600);
      } catch {
        setStatus('error');
        setMessage('Kamera nicht verfügbar. Bitte Nummer eintippen.');
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function loadProduct(code: string) {
    setStatus('starting');
    setMessage('');
    try {
      const hit = await api<Product>(`/api/foods/barcode/${code}`);
      setProduct(hit);
      setGrams(100);
      setStatus('found');
    } catch {
      setStatus('error');
      setMessage(`Kein Produkt zu ${code} gefunden.`);
    }
  }

  async function save() {
    if (!product) return;
    const factor = grams / 100;
    setSaving(true);
    try {
      await api('/api/nutrition', {
        method: 'POST',
        body: JSON.stringify({
          meal: product.name,
          category,
          calories: Math.round((product.kcal ?? 0) * factor),
          protein: Math.round((product.protein ?? 0) * factor * 10) / 10,
          carbs: Math.round((product.carbs ?? 0) * factor * 10) / 10,
          fat: Math.round((product.fat ?? 0) * factor * 10) / 10,
          date,
          ingredients: [product.name],
          quantity: grams,
          unit: 'g',
          inputType: 'barcode',
        }),
      });
      onSaved();
      onClose();
    } catch {
      setMessage('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ScanBarcode className="h-5 w-5" /> Barcode scannen
          </h2>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2" aria-label="Schließen">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === 'scanning' && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-28 w-72 rounded-xl border-2 border-white/70" />
            </div>
            <p className="p-2 text-center text-xs text-white/70">Barcode in den Rahmen halten …</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="flex h-32 items-center justify-center gap-2 rounded-2xl bg-white/5 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Kamera wird gestartet …
          </div>
        )}

        {status === 'found' && product && (
          <div className="rounded-2xl bg-surface p-4 text-ink">
            <div className="flex gap-3">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="h-20 w-20 rounded-lg object-contain" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-2">
                  <Camera className="h-6 w-6 text-muted" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{product.name}</p>
                <p className="text-xs text-muted">
                  {product.brand || ''} {product.quantity ? `· ${product.quantity}` : ''}
                </p>
                <p className="mt-1 text-sm">
                  {product.kcal ?? '—'} kcal · {product.protein ?? '—'} g P · {product.carbs ?? '—'} g K ·{' '}
                  {product.fat ?? '—'} g F <span className="text-muted">pro 100 g</span>
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={grams}
                onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg border border-line-strong px-2 py-1.5 text-center"
              />
              <span className="text-sm text-muted">Gramm</span>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Speichert …' : 'Hinzufügen'}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {Math.round((product.kcal ?? 0) * (grams / 100))} kcal für {grams} g
            </p>
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-white/10 p-3">
          <p className="mb-2 text-xs text-white/70">Barcode manuell eingeben</p>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 4008400402222"
              className="flex-1 rounded-lg bg-white/90 px-3 py-2 text-ink"
            />
            <button
              onClick={() => manual.replace(/[^0-9]/g, '').length >= 6 && void loadProduct(manual.replace(/[^0-9]/g, ''))}
              className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-ink"
            >
              Suchen
            </button>
          </div>
        </div>

        {message && <p className="mt-2 text-sm text-amber-300">{message}</p>}
      </div>
    </div>
  );
}
