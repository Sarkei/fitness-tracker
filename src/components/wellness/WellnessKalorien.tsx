/**
 * Wellness: Kalorien.
 *
 * Tims Vorgabe: Verbrauch und Gegessenes je Tag auch rückwirkend sehen — nicht
 * nur die Startseite. Quelle fuer den Verbrauch ist Garmin (Grundumsatz plus
 * Aktivitaet), fuer die Nahrung die erfassten Mahlzeiten.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flame, Utensils } from 'lucide-react';
import { api } from '@/src/lib/api';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { StatTile } from '@/src/simple/ui';
import { mittel } from '@/src/lib/wellness';

/** Ein Tag Kalorienbilanz. */
type Tag = {
  datum: string;
  verbraucht: number;
  gegessen: number;
  bilanz: number;
};

const alsZahl = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export default function WellnessKalorien() {
  const { daten, zeitraum } = useWellness();
  const tage = daten.tage;
  const nurHeute = zeitraum === 1;

  /*
   * Gegessene Kalorien je Tag. Der Wellness-Endpunkt liefert nur Garmin-Werte —
   * die Mahlzeiten kommen aus /api/food und werden hier auf Datum abgebildet.
   */
  const [gegessen, setGegessen] = useState<Map<string, number>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    api<Array<{ date?: string; calories?: number }> | { entries?: Array<{ date?: string; calories?: number }> }>(
      '/api/nutrition',
    )
      .then((r) => {
        if (abgebrochen) return;
        const liste = Array.isArray(r) ? r : Array.isArray(r?.entries) ? r.entries : [];
        const m = new Map<string, number>();
        for (const e of liste) {
          const d = String(e.date ?? '').slice(0, 10);
          if (!d) continue;
          m.set(d, (m.get(d) ?? 0) + alsZahl(e.calories));
        }
        setGegessen(m);
        setFehler(null);
      })
      .catch((e) => {
        if (!abgebrochen) setFehler(e instanceof Error ? e.message : 'Mahlzeiten konnten nicht geladen werden.');
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  const reihe = useMemo<Tag[]>(
    () =>
      tage.map((t) => {
        const verbraucht = alsZahl(t.totalCalories);
        const kcal = gegessen.get(String(t.date).slice(0, 10)) ?? 0;
        return { datum: t.date, verbraucht, gegessen: kcal, bilanz: kcal - verbraucht };
      }),
    [tage, gegessen],
  );

  const mitDaten = reihe.filter((t) => t.verbraucht > 0);
  const schnittVerbrauch = mittel(mitDaten.map((t) => t.verbraucht));
  const schnittGegessen = mittel(mitDaten.filter((t) => t.gegessen > 0).map((t) => t.gegessen));
  /** Durchschnittliche Tagesbilanz — negativ heisst Defizit. */
  const schnittBilanz = mittel(mitDaten.filter((t) => t.gegessen > 0).map((t) => t.bilanz));

  const heute = reihe[reihe.length - 1];
  const aktiveKcal = alsZahl(tage[tage.length - 1]?.activeCalories);
  const passivKcal = heute && heute.verbraucht > 0 ? Math.max(0, heute.verbraucht - aktiveKcal) : 0;

  if (!daten.verfuegbar.schlaf && mitDaten.length === 0) {
    return (
      <div className="space-y-4">
        <WellnessToolbar />
        <Card className="p-5">
          <p className="text-sm text-[var(--text-muted)]">Für diesen Zeitraum liegen keine Kaloriendaten vor.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      {fehler && (
        <p className="rounded-lg bg-[var(--danger-soft,_#3a1d1d)] px-3 py-2 text-[11.5px] text-[var(--danger,_#f08a7a)]">
          {fehler}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={nurHeute ? 'Verbrauch heute' : 'Verbrauch im Schnitt'}
          value={
            nurHeute
              ? (heute?.verbraucht ?? 0).toLocaleString('de-DE')
              : schnittVerbrauch != null
                ? Math.round(schnittVerbrauch).toLocaleString('de-DE')
                : '—'
          }
          unit="kcal"
          hint={nurHeute && passivKcal > 0 ? `${passivKcal} + ${aktiveKcal} aktiv` : `${mitDaten.length} Tage`}
        />
        <StatTile
          label={nurHeute ? 'Gegessen heute' : 'Gegessen im Schnitt'}
          value={
            nurHeute
              ? (heute?.gegessen ?? 0).toLocaleString('de-DE')
              : schnittGegessen != null
                ? Math.round(schnittGegessen).toLocaleString('de-DE')
                : '—'
          }
          unit="kcal"
          hint={nurHeute ? 'aus Mahlzeiten' : 'nur Tage mit Erfassung'}
        />
        <StatTile
          label="Bilanz"
          value={
            nurHeute
              ? (heute?.bilanz ?? 0).toLocaleString('de-DE')
              : schnittBilanz != null
                ? Math.round(schnittBilanz).toLocaleString('de-DE')
                : '—'
          }
          unit="kcal"
          hint="negativ = Defizit"
          tone="accent"
        />
        <StatTile
          label="Aktiv verbrannt"
          value={(nurHeute ? aktiveKcal : Math.round(mittel(mitDaten.map(() => aktiveKcal)) ?? aktiveKcal)).toLocaleString('de-DE')}
          unit="kcal"
          hint="durch Bewegung"
        />
      </div>

      {!nurHeute && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold">Verbrauch im Verlauf</p>
          </div>
          <Sparkline
            values={reihe.map((t) => t.verbraucht)}
            height={80}
            einheit="kcal"
            minY={0}
          />
        </Card>
      )}

      {!nurHeute && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Utensils className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            <p className="text-[12.5px] font-semibold">Gegessen im Verlauf</p>
          </div>
          <Sparkline
            values={reihe.map((t) => t.gegessen)}
            height={80}
            einheit="kcal"
            minY={0}
            color="#d98a2b"
          />
        </Card>
      )}

      {/*
        Bilanz im Verlauf: Gegessen minus Verbraucht je Tag.
        Negativ ist Defizit (gruen), positiv Ueberschuss (rot).
      */}
      {!nurHeute && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold">Bilanz im Verlauf</p>
            <span className="text-[10px] text-[var(--text-muted)]">Gegessen − Verbraucht</span>
          </div>
          <Sparkline
            values={reihe.map((t) => (t.verbraucht > 0 && t.gegessen > 0 ? t.bilanz : 0))}
            height={90}
            einheit="kcal"
          />
          <div className="flex gap-4 text-[10px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--success, #5cb98d)' }} />
              Defizit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#f08a7a' }} />
              Überschuss
            </span>
            <span className="text-[var(--text-muted)]">Tage ohne Mahlzeiten zählen als 0</span>
          </div>
          {/* Balken je Tag — Richtung zeigt Defizit oder Ueberschuss */}
          <div className="space-y-1 pt-1">
            {[...reihe]
              .reverse()
              .filter((t) => t.verbraucht > 0 && t.gegessen > 0)
              .slice(0, 14)
              .map((t) => {
                const max = Math.max(...reihe.map((x) => Math.abs(x.bilanz)), 1);
                const anteil = Math.min(1, Math.abs(t.bilanz) / max);
                return (
                  <div key={t.datum} className="flex items-center gap-2 text-[10px]">
                    <span className="w-12 shrink-0 tabular-nums text-[var(--text-muted)]">
                      {t.datum.slice(8, 10)}.{t.datum.slice(5, 7)}.
                    </span>
                    <div className="relative h-2.5 flex-1 rounded-sm bg-[var(--border-muted)]/40">
                      <div
                        className="absolute top-0 h-full rounded-sm"
                        style={{
                          width: `${anteil * 50}%`,
                          left: t.bilanz < 0 ? `${50 - anteil * 50}%` : '50%',
                          background: t.bilanz < 0 ? 'var(--success, #5cb98d)' : 'var(--danger, #f08a7a)',
                        }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--text-muted)]/40" />
                    </div>
                    <span
                      className="w-14 shrink-0 text-right font-semibold tabular-nums"
                      style={{ color: t.bilanz < 0 ? 'var(--success, #5cb98d)' : 'var(--danger, #f08a7a)' }}
                    >
                      {t.bilanz > 0 ? '+' : ''}
                      {t.bilanz.toLocaleString('de-DE')}
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Tagesliste — vergangene Tage zum Nachlesen */}
      <Card className="space-y-2 p-5">
        <p className="text-[12.5px] font-semibold">Tag für Tag</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <th className="py-1 text-left font-semibold">Datum</th>
                <th className="py-1 text-right font-semibold">Verbraucht</th>
                <th className="py-1 text-right font-semibold">Gegessen</th>
                <th className="py-1 text-right font-semibold">Bilanz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...reihe].reverse().map((t) => (
                <tr key={t.datum}>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.datum}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.verbraucht > 0 ? t.verbraucht.toLocaleString('de-DE') : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.gegessen > 0 ? t.gegessen.toLocaleString('de-DE') : '—'}
                  </td>
                  <td
                    className="py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: t.bilanz < 0 ? 'var(--success, #5cb98d)' : 'var(--danger, #f08a7a)' }}
                  >
                    {t.verbraucht > 0 && t.gegessen > 0
                      ? `${t.bilanz > 0 ? '+' : ''}${t.bilanz.toLocaleString('de-DE')}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
          Verbrauch von Garmin (Grundumsatz plus Aktivität). Gegessen aus den erfassten Mahlzeiten.
          Bilanz = Gegessen − Verbraucht; negativ ist ein Defizit.
        </p>
      </Card>
    </div>
  );
}
