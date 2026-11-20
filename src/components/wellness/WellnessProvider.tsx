/**
 * Gemeinsame Basis fuer den Wellness-Bereich.
 *
 * Laedt die Wellness-Daten einmal zentral und stellt sie allen
 * Unterseiten zur Verfuegung. Jede Unterseite zeigt nur ein Thema
 * (Schlaf, Aktivitaet, Koerper, Form) - nichts wird gemischt.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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
  lastError: string | null;
};

type Kontext = {
  daten: WellnessDaten;
  zeitraum: number;
  setZeitraum: (n: number) => void;
  neuLaden: () => void;
  laedt: boolean;
  meldung: string | null;
  syncJetzt: () => void;
  synct: boolean;
};

const WellnessKontext = createContext<Kontext | null>(null);

const ZEITRAEUME = [
  { tage: 7, label: '7 Tage' },
  { tage: 14, label: '14 Tage' },
  { tage: 30, label: '30 Tage' },
  { tage: 90, label: '90 Tage' },
];

export function WellnessProvider({ children }: { children: ReactNode }) {
  const [daten, setDaten] = useState<WellnessDaten | null>(null);
  const [zeitraum, setZeitraum] = useState(30);
  const [laedt, setLaedt] = useState(true);
  const [synct, setSynct] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await api<WellnessDaten>(`/api/integrations/intervals/wellness?days=${zeitraum}`);
      setDaten(res);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Wellness-Daten konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, [zeitraum]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /** Holt die Daten frisch bei Intervals.icu und meldet ehrlich, ob Neues kam. */
  const syncJetzt = useCallback(async () => {
    setSynct(true);
    setMeldung(null);
    setFehler(null);
    try {
      const res = await api<{
        activityCount: number;
        neuSeitLetztemSync: boolean;
        neuesteAktivitaet: string | null;
        hinweis: string | null;
      }>('/api/integrations/intervals/sync', { method: 'POST', body: JSON.stringify({ days: zeitraum }) });
      if (res.neuSeitLetztemSync) {
        setMeldung(`Neue Aktivität bis ${res.neuesteAktivitaet}.`);
      } else {
        setMeldung(
          `Aktuell — letzte Aktivität ${res.neuesteAktivitaet ?? '—'}, seither kein neues Training.`,
        );
      }
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abgleich fehlgeschlagen.');
    } finally {
      setSynct(false);
    }
  }, [zeitraum, laden]);

  const wert = useMemo<Kontext | null>(
    () =>
      daten
        ? { daten, zeitraum, setZeitraum, neuLaden: () => void laden(), laedt, meldung, syncJetzt: () => void syncJetzt(), synct }
        : null,
    [daten, zeitraum, laden, laedt, meldung, syncJetzt, synct],
  );

  if (fehler || (!laedt && !daten)) {
    return (
      <Card className="space-y-2 p-5">
        <p className="text-sm font-semibold text-[var(--foreground)]">Keine Wellness-Daten</p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {fehler ?? 'Intervals.icu ist noch nicht verbunden.'} Verbinde unter „Daten &amp; Sync“
          dein Intervals.icu-Konto — dort laufen Garmin, Polar, Suunto, Whoop und Co. als Quellen mit.
        </p>
      </Card>
    );
  }

  if (laedt && !daten) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Wellness-Daten werden geladen …
      </div>
    );
  }

  return <WellnessKontext.Provider value={wert}>{children}</WellnessKontext.Provider>;
}

export function useWellness(): Kontext {
  const ctx = useContext(WellnessKontext);
  if (!ctx) throw new Error('useWellness muss innerhalb von WellnessProvider stehen.');
  return ctx;
}

/** Zeitraum-Umschalter + Aktualisieren, auf jeder Unterseite oben. */
export function WellnessToolbar() {
  const { zeitraum, setZeitraum, laedt, daten, meldung, syncJetzt, synct } = useWellness();
  return (
    <div className="space-y-2">
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
          title="Daten jetzt neu abholen (kommen sonst automatisch)"
        >
          {synct ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Aktualisieren
        </button>
      </div>
    </div>
    {meldung && (
      <p className="rounded-xl bg-[var(--surface-gray)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">{meldung}</p>
    )}
    </div>
  );
}
