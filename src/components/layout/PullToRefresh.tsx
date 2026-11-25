import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { syncStarten, syncProzent, useSyncStatus } from '@/src/lib/syncStatus';

/**
 * Herunterziehen zum Aktualisieren — wie in einer nativen App.
 *
 * Tims Vorgabe: In der mobilen Ansicht nach unten ziehen → die App lädt neu und
 * der Garmin-Login holt die Daten. Auf dem Desktop gibt es dafür den
 * Aktualisieren-Knopf; hier bleibt der Bereich unverändert.
 *
 * Warum eigenes Touch-Handling statt einer Bibliothek:
 *  - Die App hat bereits `overscroll-behavior: none`, der Browser-Gummiband-
 *    Effekt ist also aus — den Zug nach unten müssen wir selbst abfangen.
 *  - Eine Abhängigkeit für ~120 Zeilen wäre unverhältnismäßig.
 *
 * Verhalten:
 *  - Nur ab Scrollposition 0 (sonst würde man beim Scrollen auslösen).
 *  - Ab ~72 px wird ausgelöst; darunter federt die Anzeige zurück.
 *  - Während des Ladens bleibt die Leiste sichtbar und zeigt den Fortschritt
 *    (X/Y wie bei der Garmin-API), damit man den Lauf auch nach einem
 *    Bereichswechsel wiedererkennt.
 */

const SCHWELLE = 72;
/** Ab hier wird mitgezogen; davor ist es totes Gewicht. */
const START = 6;
/** Optisches Maximum, damit die Anzeige nicht ins Unendliche wächst. */
const MAX = 110;

type Props = {
  children: ReactNode;
  /** Wird nach erfolgreichem Abgleich gerufen — die Seite lädt ihre Daten neu. */
  onAktualisiert?: () => void;
};

export default function PullToRefresh({ children, onAktualisiert }: Props) {
  const [zug, setZug] = useState(0);
  const [zieht, setZieht] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const startY = useRef<number | null>(null);
  const status = useSyncStatus();
  const laeuft = laedt || status.laeuft;
  const prozent = syncProzent(status);

  /** Nur starten, wenn die Seite ganz oben steht. */
  const darfZiehen = useCallback(() => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    return y <= 0;
  }, []);

  const aktualisieren = useCallback(async () => {
    if (laeuft) return;
    setLaedt(true);
    setZug(MAX * 0.55);
    try {
      await syncStarten(7);
      onAktualisiert?.();
      window.dispatchEvent(new CustomEvent('fitness:aktualisiert'));
    } catch {
      /* Fehler zeigt die Statusleiste; die Seite behält ihren Stand. */
    } finally {
      setLaedt(false);
      setZieht(false);
      setZug(0);
    }
  }, [laeuft, onAktualisiert]);

  useEffect(() => {
    const onStart = (ev: TouchEvent) => {
      if (!darfZiehen() || laeuft) {
        startY.current = null;
        return;
      }
      startY.current = ev.touches[0]?.clientY ?? null;
      setZieht(false);
    };

    const onMove = (ev: TouchEvent) => {
      if (startY.current == null) return;
      const y = ev.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;

      /* Nach oben gezogen oder nicht mehr am Anfang: abbrechen. */
      if (delta <= 0 || !darfZiehen()) {
        startY.current = null;
        setZug(0);
        setZieht(false);
        return;
      }

      if (delta > START) {
        /*
         * Widerstand: der Zug wächst gedämpft, damit es sich „echt" anfühlt.
         * Ohne Dämpfung springt die Anzeige dem Finger 1:1 hinterher.
         */
        const gedaempft = Math.min(MAX, (delta - START) * 0.5);
        setZug(gedaempft);
        setZieht(true);
        /* Verhindert, dass die Seite während des Ziehens mitscrollt. */
        if (ev.cancelable) ev.preventDefault();
      }
    };

    const onEnd = () => {
      const ausloesen = zug >= SCHWELLE && !laeuft;
      startY.current = null;
      if (ausloesen) void aktualisieren();
      else {
        setZug(0);
        setZieht(false);
      }
    };

    /* passive: false, weil wir preventDefault brauchen. */
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [darfZiehen, laeuft, zug, aktualisieren]);

  /** Beim Laden oben halten, sonst dem Finger folgen. */
  const hoehe = laeuft ? 52 : zug;
  const bereit = zug >= SCHWELLE;

  return (
    <div className="relative">
      {/*
       * Anzeige über dem Inhalt — ein vollflächiger Streifen, kein Oval.
       *
       * Tims Vorgabe: „der ganze bereich vom runter ziehen die farbe hat von dem
       * aktuellen oval sodass es kein oval mehr gibt quasi."
       *
       * Vorher war es eine kleine Pille in der Mitte. Jetzt füllt der Streifen
       * die volle Breite in derselben Farbe (--card-bg) und wächst mit dem Zug.
       * Der Inhalt darunter wird um genau diese Höhe nach unten geschoben, damit
       * sich nichts überlagert.
       */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center justify-end overflow-hidden lg:hidden"
        style={{
          height: hoehe,
          opacity: hoehe > 2 ? 1 : 0,
          background: 'var(--card-bg)',
          /* Nur unten eine feine Linie — der Streifen soll sich vom Inhalt
             absetzen, ohne wie ein eigener Kasten zu wirken. */
          borderBottom: hoehe > 2 ? '1px solid var(--border-muted)' : undefined,
          transition: zieht ? 'none' : 'height 220ms ease, opacity 180ms ease',
          /* Beim Ziehen sichtbar über dem Inhalt, die Kante wandert mit. */
          boxShadow: bereit ? '0 1px 0 color-mix(in srgb, var(--simple-accent) 45%, transparent)' : undefined,
        }}
        aria-live="polite"
      >
        <div
          className="inline-flex items-center justify-center gap-2 px-4 pb-2 text-[11px] font-semibold text-[var(--text-muted)]"
        >
          {laeuft ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--simple-accent)' }} />
              {status.gesamt > 0 ? `${status.schritt} / ${status.gesamt}` : 'Holt Daten …'}
            </>
          ) : (
            <>
              <RefreshCw
                className="h-3.5 w-3.5"
                style={{
                  color: bereit ? 'var(--simple-accent)' : 'var(--text-muted)',
                  transform: bereit ? 'rotate(180deg)' : `rotate(${Math.round((zug / SCHWELLE) * 180)}deg)`,
                  transition: 'transform 120ms ease',
                }}
              />
              {bereit ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}
            </>
          )}
        </div>

        {/*
         * Fortschrittsbalken am unteren Rand des Streifens — er zeigt beim
         * Laden, wie weit der Abgleich ist, ohne eigene Fläche zu belegen.
         */}
        {laeuft && (
          <div
            className="absolute inset-x-0 bottom-0 h-0.5"
            style={{ background: 'color-mix(in srgb, var(--text-muted) 18%, transparent)' }}
          >
            <div
              className="h-full transition-[width] duration-500"
              style={{
                width: prozent != null ? `${prozent}%` : '35%',
                background: 'var(--simple-accent)',
                animation: prozent == null ? 'pulse 1.4s ease-in-out infinite' : undefined,
              }}
            />
          </div>
        )}
      </div>

      {/* Inhalt: beim Ziehen leicht nach unten, damit die Anzeige Platz hat. */}
      <div
        style={{
          /* Kein transform bei 0 — ein dauerhaftes transform würde
             `position: fixed` und `sticky` der Kinder auf diesen Block beziehen. */
          transform: hoehe > 0.5 ? `translateY(${hoehe}px)` : undefined,
          transition: zieht ? 'none' : 'transform 220ms ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
