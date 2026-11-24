import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { api } from '@/src/lib/api';

/**
 * Aktualisieren mit Fortschritt.
 *
 * Tims Vorgabe: ein Knopf auf der Startseite, der nach und nach zeigt, ob neue
 * Daten da sind, sie direkt zieht und danach alle Werte in der App auffrischt.
 *
 * Ablauf:
 *   1. `/api/integrations/refresh` anstossen (laeuft im Hintergrund).
 *   2. Waehrend es laeuft alle 1,5 s `/api/integrations/garmin` fragen und den
 *      Fortschritt anzeigen (Schritt/Gesamt).
 *   3. Am Ende die Startseite neu laden lassen — der Aufrufer gibt `onFertig`.
 *
 * Warum nicht einfach warten: Ein voller Abgleich ueber 7 Tage dauert ein paar
 * Sekunden, ueber 30 deutlich laenger. Ohne Rueckmeldung weiss man nicht, ob
 * der Klick angekommen ist.
 */

type Schritt = { schritt: number; gesamt: number } | null;

export default function AktualisierenKnopf({ onFertig }: { onFertig?: () => void }) {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [schritt, setSchritt] = useState<Schritt>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  /** Verhindert, dass ein zweiter Klick einen zweiten Lauf startet. */
  const laeuftRef = useRef(false);

  /* Fortschritt abfragen, solange der Abgleich laeuft. */
  useEffect(() => {
    if (!laeuft) return;
    const takt = window.setInterval(() => {
      void api<{ laufend: Schritt }>('/api/integrations/garmin')
        .then((r) => setSchritt(r.laufend ?? null))
        .catch(() => {
          /* Ein Aussetzer bei der Abfrage darf den Lauf nicht stoppen. */
        });
    }, 1500);
    return () => window.clearInterval(takt);
  }, [laeuft]);

  const starten = useCallback(async () => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setOffen(true);
    setLaeuft(true);
    setFertig(false);
    setFehler(null);
    setMeldung('Neue Daten werden gesucht …');
    setSchritt(null);

    try {
      /*
       * 7 Tage reichen fuer den Alltag: heute, die Nacht und der Vortag.
       * Die ganze Historie hat ihren eigenen Weg im Profil — hier soll es
       * schnell gehen.
       */
      const r = await api<{
        garmin?: { tage?: number; aktivitaeten?: number; fehler?: string; nichtVerbunden?: boolean };
        intervals?: { neu?: number };
      }>('/api/integrations/refresh', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      });

      if (r.garmin?.fehler) {
        setFehler(r.garmin.fehler);
        setMeldung(null);
      } else if (r.garmin?.nichtVerbunden) {
        setFehler('Garmin ist nicht verbunden.');
        setMeldung(null);
      } else {
        const tage = r.garmin?.tage ?? 0;
        const einheiten = r.garmin?.aktivitaeten ?? 0;
        setMeldung(
          tage
            ? `${tage} ${tage === 1 ? 'Tag' : 'Tage'} abgeglichen` +
                (einheiten ? ` · ${einheiten} ${einheiten === 1 ? 'Einheit' : 'Einheiten'}` : '')
            : 'Abgeglichen',
        );
        setFertig(true);
        /* Alle Ansichten in der App neu laden — der Aufrufer kennt seine Abfragen. */
        onFertig?.();
        window.dispatchEvent(new CustomEvent('fitness:aktualisiert'));
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abgleich fehlgeschlagen.');
      setMeldung(null);
    } finally {
      setLaeuft(false);
      laeuftRef.current = false;
    }
  }, [onFertig]);

  const prozent =
    schritt && schritt.gesamt > 0
      ? Math.min(100, Math.round((schritt.schritt / schritt.gesamt) * 100))
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void starten()}
        disabled={laeuft}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)] disabled:opacity-60"
        title="Daten von der Uhr holen"
        style={{ minHeight: 36 }}
      >
        {laeuft ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {laeuft ? 'Holt …' : 'Aktualisieren'}
      </button>

      {offen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          style={{ background: 'color-mix(in srgb, #000 55%, transparent)' }}
          role="dialog"
          aria-modal="true"
          onClick={() => {
            /* Schliessen erst, wenn nichts laeuft — sonst bricht der Lauf ab, ohne dass man es merkt. */
            if (!laeuft) setOffen(false);
          }}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl border border-[var(--border-muted)] p-4"
            style={{ background: 'var(--card-bg)' }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
                {laeuft ? 'Daten werden geholt' : fertig ? 'Alles aktuell' : 'Abgleich'}
              </p>
              {!laeuft && (
                <button
                  type="button"
                  onClick={() => setOffen(false)}
                  className="rounded-lg p-1 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
                  aria-label="Schliessen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Fortschrittsbalken — nur wenn der Server einen Stand meldet. */}
            {laeuft && (
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{ background: 'color-mix(in srgb, var(--text-muted) 20%, transparent)' }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: prozent != null ? `${prozent}%` : '35%',
                    background: 'var(--simple-accent)',
                    /* Ohne Stand: unbestimmter Balken, damit man sieht, dass etwas laeuft. */
                    animation: prozent == null ? 'pulse 1.4s ease-in-out infinite' : undefined,
                  }}
                />
              </div>
            )}

            {laeuft && schritt && schritt.gesamt > 0 && (
              <p className="text-[10.5px] text-[var(--text-muted)]">
                Tag {schritt.schritt} von {schritt.gesamt}
              </p>
            )}

            {meldung && (
              <p className="flex items-start gap-1.5 text-[11px] text-[var(--foreground)]">
                {fertig ? (
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: 'var(--simple-accent)' }} />
                ) : (
                  <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {meldung}
              </p>
            )}

            {fehler && (
              <p className="flex items-start gap-1.5 text-[11px]" style={{ color: '#dc5a4a' }}>
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                {fehler}
              </p>
            )}

            {!laeuft && (
              <button
                type="button"
                onClick={() => setOffen(false)}
                className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
                style={{ background: 'var(--simple-accent)', minHeight: 38 }}
              >
                Schliessen
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
