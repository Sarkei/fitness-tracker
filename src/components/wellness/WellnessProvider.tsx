/**
 * Gemeinsame Basis fuer den Wellness-Bereich.
 *
 * Laedt die Wellness-Daten einmal zentral und stellt sie allen
 * Unterseiten zur Verfuegung. Jede Unterseite zeigt nur ein Thema
 * (Schlaf, Aktivitaet, Koerper, Form) - nichts wird gemischt.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/src/lib/api';
import { Card } from '@/src/simple/ui';
import type { WellnessAktivitaet, WellnessTag } from '@/src/lib/wellness';

export type WellnessDaten = {
  fetchedAt: string | null;
  tage: WellnessTag[];
  aktivitaeten: WellnessAktivitaet[];
  verfuegbar: {
    schlaf: boolean;
    schritte: boolean;
    etagen: boolean;
    hrv: boolean;
    ruhepuls: boolean;
    fitness: boolean;
  };
  nichtVerfuegbar: string[];
  /** Was Garmin selbst nicht liefert (z. B. wenn die Uhr kein SpO2 misst). */
  garminNichtVerfuegbar?: string[];
  /** Woher die Tageswerte kommen. */
  quelle?: 'garmin' | 'intervals';
  lastError: string | null;
};

type Kontext = {
  daten: WellnessDaten;
  zeitraum: number;
  setZeitraum: (n: number) => void;
  neuLaden: () => void;
  laedt: boolean;
  syncJetzt: () => void;
  synct: boolean;
  /** Fortschritt des laufenden Garmin-Abgleichs, null wenn fertig. */
  fortschritt: { schritt: number; gesamt: number } | null;
};

const WellnessKontext = createContext<Kontext | null>(null);

const ZEITRAEUME = [
  /*
   * "Heute" zeigt ausschliesslich die reellen Werte der letzten Nacht bzw. des
   * aktuellen Tages — ohne Durchschnittswerte daneben. Tims Vorgabe: die
   * gemischte Ansicht aus Tageswert und Mehrtages-Schnitt war verwirrend.
   */
  { tage: 1, label: 'Heute' },
  { tage: 7, label: '7 Tage' },
  { tage: 14, label: '14 Tage' },
  { tage: 30, label: '30 Tage' },
  { tage: 90, label: '90 Tage' },
];

export function WellnessProvider({ children }: { children: ReactNode }) {
  const [daten, setDaten] = useState<WellnessDaten | null>(null);
  const [zeitraum, setZeitraum] = useState(1);  // Standard: nur heute
  const [laedt, setLaedt] = useState(true);
  const [synct, setSynct] = useState(false);
  const [fortschritt, setFortschritt] = useState<{ schritt: number; gesamt: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);

    /*
     * Bis zu drei Versuche mit kurzer Pause.
     *
     * Der Endpunkt holt bei veraltetem Stand einmal live bei Garmin nach — das
     * dauert manchmal ein paar Sekunden. Ein einzelner Timeout (oder ein
     * Neustart des Containers im Hintergrund) reichte bisher, um die ganze
     * Seite in eine rote Fehlerwand zu verwandeln. Erst danach kam man durch
     * einen Wechsel in einen anderen Bereich wieder hinein — der Remount lud
     * neu. Ein zweiter Versuch loest das ohne Zutun.
     */
    const tageApi = Math.max(7, zeitraum);
    let letzterFehler: unknown = null;

    for (let versuch = 1; versuch <= 3; versuch++) {
      try {
        const res = await api<WellnessDaten>(`/api/integrations/intervals/wellness?days=${tageApi}`);
        setDaten(zeitraum === 1 ? { ...res, tage: res.tage.slice(-1) } : res);
        setFehler(null);
        setLaedt(false);
        return;
      } catch (e) {
        letzterFehler = e;
        if (versuch < 3) {
          await new Promise((r) => setTimeout(r, versuch * 1200));
        }
      }
    }

    /*
     * Alle Versuche gescheitert: liegen bereits Daten vor, bleiben sie stehen.
     * Eine kurze Notiz sagt, dass der letzte Abruf nicht durchkam — besser als
     * eine leere Seite, die den Anschein erweckt, es gaebe keine Werte.
     */
    setFehler(
      letzterFehler instanceof Error
        ? letzterFehler.message
        : 'Wellness-Daten konnten nicht geladen werden.',
    );
    setLaedt(false);
  }, [zeitraum]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /**
   * Holt die Daten frisch bei Intervals.icu. Aktualisiert nur still - die Werte in
   * der App aendern sich dadurch, eine Meldung braucht es dafuer nicht.
   */
  /*
   * Aktualisieren holt ALLES neu: Garmin-Tageswerte (alle 27 Felder),
   * Aktivitaeten und die Historie — nicht mehr nur den Intervals-Sync.
   * Vorher passierte bei Garmin als Quelle gar nichts.
   */
  const syncJetzt = useCallback(async () => {
    setSynct(true);
    setFehler(null);
    setFortschritt(null);
    // Waehrend des Abgleichs alle 1,5 s nachfragen, damit man den Fortschritt sieht.
    const takt = window.setInterval(() => {
      void api<{ laufend: { schritt: number; gesamt: number } | null }>(
        '/api/integrations/garmin',
      )
        .then((r) => setFortschritt(r.laufend))
        .catch(() => {});
    }, 700);
    try {
      const r = await api<{ ok: boolean; garmin?: { fehler?: string }; ms?: number }>(
        '/api/integrations/refresh',
        { method: 'POST', body: JSON.stringify({ days: zeitraum }) },
      );
      if (r.garmin?.fehler) {
        setFehler(r.garmin.fehler);
      }
      // Still nachladen: die Ansicht zeigt danach die frischen Werte.
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abgleich fehlgeschlagen.');
    } finally {
      window.clearInterval(takt);
      setFortschritt(null);
      setSynct(false);
    }
  }, [zeitraum, laden]);

  const wert = useMemo<Kontext | null>(
    () =>
      daten
        ? { daten, zeitraum, setZeitraum, neuLaden: () => void laden(), laedt, syncJetzt: () => void syncJetzt(), synct, fortschritt }
        : null,
    [daten, zeitraum, laden, laedt, syncJetzt, synct, fortschritt],
  );

  /*
   * Nur wenn wirklich NICHTS vorliegt, gibt es die ganze Seite als Hinweis.
   * Kommt ein Fehler, obwohl schon Daten geladen waren, bleibt die Ansicht
   * stehen und traegt nur oben eine schmale Notiz — frueher verschwand die
   * gesamte Seite hinter einer roten Wand, bis man den Bereich wechselte.
   */
  if (!daten) {
    if (laedt) {
      return (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Wellness-Daten werden geladen …
        </div>
      );
    }
    return (
      <Card className="space-y-2 p-5">
        <p className="text-sm font-semibold text-[var(--foreground)]">Keine Wellness-Daten</p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {fehler ?? 'Noch keine Werte vorhanden.'} Verbinde unter „Daten & Sync“ eine Quelle —
          Garmin per Login ist der vollständigste Weg.
        </p>
      </Card>
    );
  }

  /*
   * Daten sind da, aber der letzte Abruf kam nicht durch: schmale Notiz ueber
   * der Ansicht statt einer Fehlerseite. Die Werte sind ja vorhanden — nur
   * eben nicht frisch.
   */
  const hinweis = fehler;

  return (
    <WellnessKontext.Provider value={wert}>
      {hinweis && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[11px]"
          style={{
            background: 'color-mix(in srgb, #dc5a4a 12%, transparent)',
            color: 'var(--foreground)',
          }}
          role="status"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: '#dc5a4a' }} />
          <span>
            Die Werte sind vom letzten erfolgreichen Abruf — gerade kam keine Verbindung durch.
            <button
              type="button"
              onClick={() => void laden()}
              className="ml-1 font-semibold underline"
              style={{ color: 'var(--simple-accent)' }}
            >
              Nochmal versuchen
            </button>
          </span>
        </div>
      )}
      {children}
    </WellnessKontext.Provider>
  );
}

export function useWellness(): Kontext {
  const ctx = useContext(WellnessKontext);
  if (!ctx) throw new Error('useWellness muss innerhalb von WellnessProvider stehen.');
  return ctx;
}

/** Zeitraum-Umschalter + Aktualisieren, auf jeder Unterseite oben. */
/**
 * Aktualisieren-Knopf mit Zeitstempel.
 *
 * Steht in der Kopfzeile der Übersicht rechts auf Höhe der Kachel-Überschriften.
 * Eine Zeitraum-Auswahl gibt es hier nicht mehr: die Übersicht zeigt die Tageslage,
 * die Zeiträume gehören in die einzelnen Bereiche.
 */
export function WellnessAktualisieren() {
  const { laedt, daten, syncJetzt, synct, fortschritt } = useWellness();
  return (
    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
      {daten.fetchedAt && (
        <span>
          Stand{' '}
          {new Date(daten.fetchedAt).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
      <button
        type="button"
        onClick={() => void syncJetzt()}
        disabled={laedt || synct}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-2.5 py-1.5 font-semibold transition hover:border-[var(--simple-accent)] hover:text-[var(--simple-accent)] disabled:opacity-50"
        title="Alle Garmin-Werte, Aktivitäten und den Verlauf jetzt neu abrufen"
      >
        {synct ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {synct
          ? fortschritt
            ? `Aktualisiert … ${fortschritt.schritt}/${fortschritt.gesamt}`
            : 'Aktualisiert …'
          : 'Aktualisieren'}
      </button>
    </div>
  );
}

/**
 * Zeitraum-Auswahl plus Aktualisieren — für die Unterseiten (Schlaf, Bewegung …).
 * Die Übersicht nutzt nur `WellnessAktualisieren`, weil sie die Tageslage zeigt.
 */
export function WellnessToolbar() {
  const { zeitraum, setZeitraum, laedt, daten, syncJetzt, synct, fortschritt } = useWellness();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1.5">
        {ZEITRAEUME.map((z) => (
          <button
            key={z.tage}
            type="button"
            onClick={() => setZeitraum(z.tage)}
            className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
              zeitraum === z.tage
                ? 'border-[var(--simple-accent)] bg-[var(--simple-accent)] text-white'
                : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-[var(--simple-accent)]'
            }`}
          >
            {z.label}
          </button>
        ))}
      </div>
      <WellnessAktualisieren />
    </div>
  );
}
