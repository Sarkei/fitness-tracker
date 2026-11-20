/**
 * Garmin-Ansicht im Profil: Schlaf, Schritte, Etagen, HRV/Ruhepuls, Form.
 *
 * Basis sind die Wellness-Daten, die Intervals.icu aus Garmin durchreicht.
 * Was Garmin selbst nicht ueber die API freigibt (Stress, Body Battery, SpO2),
 * wird ausdruecklich als nicht verfuegbar ausgewiesen statt leer dargestellt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Moon, Footprints, Heart, Activity, Mountain, RefreshCw, Info } from 'lucide-react';
import { api } from '@/src/lib/api';
import { Card, Sparkline, StatTile } from '@/src/simple/ui';
import {
  formLabel,
  letzter,
  mittel,
  schlafBewertung,
  schlafStunden,
  summe,
  type GarminAktivitaet,
  type WellnessTag,
} from '@/src/lib/garmin';

type Antwort = {
  fetchedAt: string | null;
  tage: WellnessTag[];
  aktivitaeten: GarminAktivitaet[];
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

const ZEITRAEUME = [
  { tage: 14, label: '14 Tage' },
  { tage: 30, label: '30 Tage' },
  { tage: 90, label: '90 Tage' },
];

function datumKurz(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}.${m}.`;
}

export default function GarminView() {
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeitraum, setZeitraum] = useState(30);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await api<Antwort>(`/api/integrations/intervals/wellness?days=${zeitraum}`);
      setDaten(res);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Daten konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, [zeitraum]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const kennzahlen = useMemo(() => {
    const tage = daten?.tage ?? [];
    const schlaf = tage.map((t) => schlafStunden(t.sleepSecs));
    const schritte = tage.map((t) => t.steps);
    const hrv = tage.map((t) => t.hrv);
    const puls = tage.map((t) => t.restingHr);
    const tsb = tage.map((t) => t.tsb);

    return {
      schlafSchnitt: mittel(schlaf),
      schlafLetzte: letzter(tage, 'sleepSecs') != null ? schlafStunden(letzter(tage, 'sleepSecs')) : null,
      schlafScore: letzter(tage, 'sleepScore'),
      schritteSchnitt: mittel(schritte),
      schritteSumme: summe(schritte),
      schritteLetzte: letzter(tage, 'steps'),
      hrvSchnitt: mittel(hrv),
      hrvLetzte: letzter(tage, 'hrv'),
      pulsSchnitt: mittel(puls),
      pulsLetzte: letzter(tage, 'restingHr'),
      form: letzter(tage, 'tsb'),
      ctl: letzter(tage, 'ctl'),
      atl: letzter(tage, 'atl'),
      reihen: {
        schlaf: schlaf.map((v) => v ?? 0),
        schritte: schritte.map((v) => v ?? 0),
        hrv: hrv.map((v) => v ?? 0),
        puls: puls.map((v) => v ?? 0),
        tsb: tsb.map((v) => v ?? 0),
      },
    };
  }, [daten]);

  if (laedt) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Garmin-Daten werden geladen …
      </div>
    );
  }

  if (fehler || !daten) {
    return (
      <Card className="space-y-2 p-5">
        <p className="text-sm font-semibold text-[var(--foreground)]">Keine Garmin-Daten</p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {fehler ?? 'Intervals.icu ist noch nicht verbunden.'} Verbinde unter „Daten & Sync“ dein
          Intervals.icu-Konto — Garmin läuft dort als Quelle mit.
        </p>
      </Card>
    );
  }

  const form = formLabel(kennzahlen.form);
  const farbe =
    form.tone === 'gut'
      ? 'var(--simple-accent)'
      : form.tone === 'mittel'
        ? '#d98a2b'
        : form.tone === 'schlecht'
          ? '#dc5a4a'
          : 'var(--text-muted)';

  return (
    <div className="space-y-4">
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
        <button
          type="button"
          onClick={() => void laden()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </button>
      </div>

      {/* Kernzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Schlaf (Nacht)"
          value={kennzahlen.schlafLetzte ?? '—'}
          unit="h"
          hint={
            kennzahlen.schlafScore != null
              ? `Score ${Math.round(kennzahlen.schlafScore)} · ${schlafBewertung(kennzahlen.schlafScore)}`
              : 'kein Score'
          }
          tone={kennzahlen.schlafLetzte != null && kennzahlen.schlafLetzte >= 7 ? 'accent' : 'default'}
        />
        <StatTile
          label="Schritte (heute)"
          value={kennzahlen.schritteLetzte != null ? Math.round(kennzahlen.schritteLetzte).toLocaleString('de-DE') : '—'}
          hint={
            kennzahlen.schritteSchnitt != null
              ? `Ø ${Math.round(kennzahlen.schritteSchnitt).toLocaleString('de-DE')}`
              : 'keine Daten'
          }
        />
        <StatTile
          label="HRV"
          value={kennzahlen.hrvLetzte != null ? Math.round(kennzahlen.hrvLetzte) : '—'}
          unit="ms"
          hint={kennzahlen.hrvSchnitt != null ? `Ø ${Math.round(kennzahlen.hrvSchnitt)}` : 'keine Daten'}
        />
        <StatTile
          label="Ruhepuls"
          value={kennzahlen.pulsLetzte != null ? Math.round(kennzahlen.pulsLetzte) : '—'}
          unit="bpm"
          hint={kennzahlen.pulsSchnitt != null ? `Ø ${Math.round(kennzahlen.pulsSchnitt)}` : 'keine Daten'}
        />
      </div>

      {/* Form */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Trainingsform
            </p>
            <p className="mt-0.5 text-2xl font-semibold leading-tight" style={{ color: farbe }}>
              {form.text}
              {kennzahlen.form != null && (
                <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                  TSB {Math.round(kennzahlen.form)}
                </span>
              )}
            </p>
          </div>
          <div className="text-right text-[11.5px] text-[var(--text-muted)]">
            <p>Fitness {kennzahlen.ctl != null ? Math.round(kennzahlen.ctl) : '—'}</p>
            <p>Ermüdung {kennzahlen.atl != null ? Math.round(kennzahlen.atl) : '—'}</p>
          </div>
        </div>
        <Sparkline values={kennzahlen.reihen.tsb} height={56} />
        <p className="text-[10.5px] text-[var(--text-muted)]">
          Form = Fitness − Ermüdung. Positiv heißt frisch, stark negativ heißt überlastet.
        </p>
      </Card>

      {/* Verläufe */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Schlaf pro Nacht</p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              Ø {kennzahlen.schlafSchnitt != null ? kennzahlen.schlafSchnitt.toFixed(1) : '—'} h
            </span>
          </div>
          <Sparkline values={kennzahlen.reihen.schlaf} height={64} />
        </Card>

        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <Footprints className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Schritte pro Tag</p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              Ø {kennzahlen.schritteSchnitt != null ? Math.round(kennzahlen.schritteSchnitt).toLocaleString('de-DE') : '—'}
            </span>
          </div>
          <Sparkline values={kennzahlen.reihen.schritte} height={64} />
        </Card>

        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">HRV</p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              Ø {kennzahlen.hrvSchnitt != null ? Math.round(kennzahlen.hrvSchnitt) : '—'} ms
            </span>
          </div>
          <Sparkline values={kennzahlen.reihen.hrv} height={64} />
        </Card>

        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Ruhepuls</p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              Ø {kennzahlen.pulsSchnitt != null ? Math.round(kennzahlen.pulsSchnitt) : '—'} bpm
            </span>
          </div>
          <Sparkline values={kennzahlen.reihen.puls} height={64} />
        </Card>
      </div>

      {/* Tagesliste */}
      <Card className="p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Tagesverlauf
        </p>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--card-bg)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 text-left font-semibold">Tag</th>
                <th className="py-1.5 text-right font-semibold">Schlaf</th>
                <th className="py-1.5 text-right font-semibold">Score</th>
                <th className="py-1.5 text-right font-semibold">Schritte</th>
                <th className="py-1.5 text-right font-semibold">Etagen</th>
                <th className="py-1.5 text-right font-semibold">HRV</th>
                <th className="py-1.5 text-right font-semibold">Puls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...(daten.tage ?? [])].reverse().slice(0, 60).map((t) => (
                <tr key={t.date}>
                  <td className="py-1.5 text-[var(--text-muted)]">{datumKurz(t.date)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {schlafStunden(t.sleepSecs) != null ? `${schlafStunden(t.sleepSecs)} h` : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.sleepScore != null ? Math.round(t.sleepScore) : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.steps != null ? Math.round(t.steps).toLocaleString('de-DE') : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.floors != null ? Math.round(t.floors) : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.hrv != null ? Math.round(t.hrv) : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.restingHr != null ? Math.round(t.restingHr) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grenzen offen benennen */}
      {daten.nichtVerfuegbar.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-gray)] px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            Nicht über die Garmin-Schnittstelle verfügbar: <strong>{daten.nichtVerfuegbar.join(', ')}</strong>.
            Garmin gibt diese Werte nicht über die API frei — sie lassen sich nur in Garmin Connect selbst
            sehen, nicht hier abbilden.
          </p>
        </div>
      )}
    </div>
  );
}
