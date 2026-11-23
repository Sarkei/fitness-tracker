import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 *
 * **Warum das vorher schwarz war:** Das `<video>`-Element wurde nur gerendert,
 * wenn `status === 'scanning'` galt. Der Stream wurde aber zugewiesen, solange
 * `status` noch `'starting'` war — da gab es kein `<video>`, also lief
 * `videoRef.current` ins Leere. Die Kamera war an, das Bild kam nie an, und
 * danach blieb das Feld schwarz.
 *
 * Jetzt ist das Video **immer** im DOM; es wird nur unsichtbar geschaltet,
 * solange die Kamera noch startet. Der Stream wird nach dem Statuswechsel
 * zugewiesen und `play()` erneut versucht.
 *
 * Kein manuelles Eingabefeld mehr: Wer den Barcode nicht scannen kann, bekommt
 * eine klare Meldung statt eines Eingabefelds.
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
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(100);
  const [saving, setSaving] = useState(false);

  /** Stream an das Video hängen — mehrfach aufrufbar, bis es greift. */
  const streamAnhaengen = () => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return false;
    if (v.srcObject !== s) v.srcObject = s;
    v.play().catch(() => undefined);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    let takt: number | undefined;

    async function start() {
      if (!('BarcodeDetector' in window)) {
        setStatus('error');
        setMessage(
          'Dieser Browser kann keine Barcodes scannen. Nutze Chrome auf Android oder trage das Produkt über die Suche ein.',
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Exakte Rückkamera, hohe Auflösung: kleine EAN-Codes brauchen Schärfe.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStatus('scanning');

        // Erst nach dem Statuswechsel existiert ein sichtbares Video. Das
        // Zuweisen wird mehrfach versucht, bis das Element da ist.
        let versuche = 0;
        const anhaengen = window.setInterval(() => {
          versuche += 1;
          if (streamAnhaengen() || versuche > 40) window.clearInterval(anhaengen);
        }, 50);

        const detector = new (window as unknown as {
          BarcodeDetector: new (o: { formats: string[] }) => {
            detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        }).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
        });

        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          // Erst scannen, wenn wirklich Bild da ist.
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            try {
              const codes = await detector.detect(v);
              const code = codes?.[0]?.rawValue ? String(codes[0].rawValue).replace(/[^0-9]/g, '') : '';
              if (code.length >= 6) {
                stopCamera();
                await loadProduct(code);
                return;
              }
            } catch {
              /* weiter scannen */
            }
          }
          takt = window.setTimeout(tick, 300);
        };
        takt = window.setTimeout(tick, 700);
      } catch (e) {
        const name = (e as { name?: string }).name;
        setStatus('error');
        setMessage(
          name === 'NotAllowedError'
            ? 'Kamera-Zugriff wurde abgelehnt. In den Android-Einstellungen unter Chrome → Berechtigungen → Kamera erlauben.'
            : name === 'NotFoundError'
              ? 'Keine Kamera gefunden.'
              : 'Kamera konnte nicht gestartet werden.',
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (takt) window.clearTimeout(takt);
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

  /* Nach dem Fund ist die Kamera aus — der Stream wird freigegeben. */
  const kameraAktiv = status === 'scanning' || status === 'starting';

  const inhalt = (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Kopf */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ScanBarcode className="h-5 w-5" /> Barcode scannen
        </h2>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-2"
          aria-label="Schließen"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {kameraAktiv && (
        /*
         * Das Video füllt den ganzen Bereich und ist **immer** im DOM — auch
         * während die Kamera noch startet. Nur so kann der Stream ankommen.
         * Das Zielrechteck sitzt mittig im Bild.
         */
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Abdunkelung außerhalb des Zielrahmens */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative">
              {/* Zielrahmen für den Barcode */}
              <div className="h-[26vh] w-[78vw] max-w-md rounded-2xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
              {/* Führungslinie, die von links nach rechts wandert */}
              <div className="barcode-linie absolute left-2 right-2 top-1/2 h-0.5 bg-emerald-400/90" />
            </div>
          </div>

          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Kamera wird gestartet …
            </div>
          )}

          <p className="absolute inset-x-0 bottom-4 text-center text-[12px] text-white/80">
            Barcode mittig in den Rahmen halten
          </p>
        </div>
      )}

      {/* Gefundenes Produkt */}
      {status === 'found' && product && (
        <div className="flex-1 overflow-y-auto bg-black/90 p-4">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-surface p-4 text-ink">
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
                className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
              >
                {saving ? 'Speichert …' : 'Hinzufügen'}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {Math.round((product.kcal ?? 0) * (grams / 100))} kcal für {grams} g
            </p>
          </div>
        </div>
      )}

      {/* Fehler: klarer Text statt Eingabefeld */}
      {status === 'error' && (
        <div className="flex-1 p-5">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white/10 p-4">
            <p className="text-[13px] leading-relaxed text-white/90">{message}</p>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-lg bg-white/15 px-4 py-2.5 text-[12.5px] font-semibold"
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Portal statt Inline: der Sheet haengt an <body> und kann die Seite nicht mehr
  // verschieben, wenn nach dem Eintragen neue Werte dazukommen.
  return typeof document === 'undefined' ? inhalt : createPortal(inhalt, document.body);
}
