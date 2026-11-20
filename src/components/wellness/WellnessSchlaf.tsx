/**
 * Wellness: Schlaf. Nur Schlaf: Dauer, Score, Verlauf, Tagesliste.
 */

import { Moon } from 'lucide-react';
import { Card, Sparkline, StatTile } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { mittel, schlafBewertung, schlafStunden } from '@/src/lib/wellness';

export default function WellnessSchlaf() {
  const { daten } = useWellness();
  const tage = daten.tage;

  const naechte = tage.map((t) => t.sleepSecs);
  const reihe = naechte.map((s) => schlafStunden(s) ?? 0);
  const schnitt = mittel(reihe.filter((v) => v > 0));
  const letzteNacht = [...reihe].reverse().find((v) => v > 0) ?? null;
  const scores = tage.map((t) => t.sleepScore).filter((s): s is number => s != null);
  const scoreSchnitt = mittel(scores);

  const gut = reihe.filter((v) => v >= 7 && v > 0).length;
  const mittelWert = reihe.filter((v) => v >= 6 && v < 7).length;
  const schlecht = reihe.filter((v) => v > 0 && v < 6).length;

  if (!daten.verfuegbar.schlaf) {
    return (
      <div className="space-y-4">
        <WellnessToolbar />
        <Card className="p-5">
          <p className="text-sm text-[var(--text-muted)]">Für diesen Zeitraum liegen keine Schlafdaten vor.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WellnessToolbar />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Letzte Nacht" value={letzteNacht ?? '—'} unit="h" hint="geschlafen" />
        <StatTile
          label="Nächte im Schnitt"
          value={schnitt != null ? schnitt.toFixed(1) : '—'}
          unit="h"
          hint={`${naechte.filter((s) => s).length} Nächte`}
        />
        <StatTile
          label="Schlafscore"
          value={scoreSchnitt != null ? Math.round(scoreSchnitt) : '—'}
          hint={scoreSchnitt != null ? schlafBewertung(scoreSchnitt) : 'kein Score'}
          tone={scoreSchnitt != null && scoreSchnitt >= 70 ? 'accent' : 'default'}
        />
        <StatTile label="Nächte ≥ 7 h" value={gut} unit={`von ${reihe.filter((v) => v > 0).length}`} hint="ausreichend" />
      </div>

      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <Moon className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Schlafdauer</p>
        </div>
        <Sparkline values={reihe} height={90} />
      </Card>

      <Card className="space-y-2 p-5">
        <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Verteilung</p>
        <div className="space-y-1.5">
          {[
            { label: '≥ 7 h ausreichend', wert: gut, farbe: 'var(--simple-accent)' },
            { label: '6–7 h knapp', wert: mittelWert, farbe: '#d98a2b' },
            { label: '< 6 h zu kurz', wert: schlecht, farbe: '#dc5a4a' },
          ].map((z) => {
            const gesamt = gut + mittelWert + schlecht || 1;
            return (
              <div key={z.label} className="space-y-1">
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[var(--text-muted)]">{z.label}</span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">{z.wert}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(z.wert / gesamt) * 100}%`, background: z.farbe }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Nacht für Nacht
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--card-bg)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 text-left font-semibold">Datum</th>
                <th className="py-1.5 text-right font-semibold">Dauer</th>
                <th className="py-1.5 text-right font-semibold">Score</th>
                <th className="py-1.5 text-right font-semibold">Bewertung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...tage].reverse().map((t) => {
                const h = schlafStunden(t.sleepSecs);
                if (h == null) return null;
                return (
                  <tr key={t.date}>
                    <td className="py-1.5 text-[var(--text-muted)]">{t.date}</td>
                    <td className="py-1.5 text-right tabular-nums">{h.toFixed(1)} h</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {t.sleepScore != null ? Math.round(t.sleepScore) : '—'}
                    </td>
                    <td className="py-1.5 text-right text-[11px] text-[var(--text-muted)]">
                      {schlafBewertung(t.sleepScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
