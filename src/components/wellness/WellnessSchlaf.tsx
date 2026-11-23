/**
 * Wellness: Schlaf. Nur Schlaf: Dauer, Score, Verlauf, Tagesliste.
 */

import { useState } from 'react';
import { Moon } from 'lucide-react';
import { Card, Sparkline } from '@/src/simple/ui';
import { WellnessToolbar, useWellness } from './WellnessProvider';
import { KennzahlSheet, KlickKachel } from './KennzahlSheet';
import { Tagesdetail, TagesZeile } from './Tagesdetail';
import { mittel, schlafBewertung, schlafFarben, schlafStufe, schlafStunden } from '@/src/lib/wellness';

export default function WellnessSchlaf() {
  const { daten } = useWellness();
  const tage = daten.tage;
  const [detail, setDetail] = useState<'dauer' | 'score' | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);

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
        <KlickKachel label="Letzte Nacht" value={letzteNacht ?? '—'} unit="h" hint="geschlafen" onClick={() => setDetail('dauer')} />
        <KlickKachel
          label="Nächte im Schnitt"
          value={schnitt != null ? schnitt.toFixed(1) : '—'}
          unit="h"
          hint={`${naechte.filter((s) => s).length} Nächte`}
          onClick={() => setDetail('dauer')}
        />
        <KlickKachel
          label="Schlafscore"
          value={scoreSchnitt != null ? Math.round(scoreSchnitt) : '—'}
          hint={scoreSchnitt != null ? schlafBewertung(scoreSchnitt) : 'kein Score'}
          onClick={() => setDetail('score')}
        />
        <KlickKachel label="Nächte ≥ 7 h" value={gut} unit={`von ${reihe.filter((v) => v > 0).length}`} hint="ausreichend" onClick={() => setDetail('dauer')} />
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

      {tagOffen && (() => {
        const t = tage.find((x) => x.date === tagOffen);
        return t ? (
          <Tagesdetail
            tag={t}
            aktivitaeten={daten.aktivitaeten}
            fokus="schlaf"
            onClose={() => setTagOffen(null)}
          />
        ) : null;
      })()}

      {detail === 'dauer' && (
        <KennzahlSheet
          def={{ key: 'dauer', titel: 'Schlafdauer', einheit: 'h', format: (v) => v.toFixed(1), hoeherBesser: true,
            hinweis: 'Nacht für Nacht. Unter 7 Stunden gilt als zu kurz.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: schlafStunden(t.sleepSecs) }))}
          onClose={() => setDetail(null)}
        />
      )}
      {detail === 'score' && (
        <KennzahlSheet
          def={{ key: 'score', titel: 'Schlafscore', format: (v) => String(Math.round(v)), hoeherBesser: true,
            hinweis: 'Qualität der Nacht: 80+ sehr gut, unter 40 schlecht.' }}
          punkte={tage.map((t) => ({ datum: t.date, wert: t.sleepScore ?? null }))}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Auf einen Blick: jede Nacht als farbige Box, grün = gut, rot = schlecht */}
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Letzte Nächte
          </p>
          <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
            {[3, 2, 1, 0].map((stufe) => {
              const f = schlafFarben(stufe as 0 | 1 | 2 | 3);
              return (
                <span key={stufe} className={`inline-block h-2.5 w-2.5 rounded-sm ${f.bg} border ${f.rand}`} />
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...tage]
            .reverse()
            .filter((t) => schlafStunden(t.sleepSecs) != null)
            .slice(0, 28)
            .map((t) => {
              const stufe = schlafStufe(t.sleepScore);
              const f = schlafFarben(stufe);
              const [, monat, tagNr] = t.date.split('-');
              return (
                <button
                  key={t.date}
                  type="button"
                  onClick={() => setTagOffen(t.date)}
                  title={`${tagNr}.${monat}. · ${schlafStunden(t.sleepSecs)?.toFixed(1)} h · Score ${
                    t.sleepScore != null ? Math.round(t.sleepScore) : '—'
                  }`}
                  className={`flex h-9 w-9 flex-col items-center justify-center rounded-md border text-[9.5px] font-semibold leading-none transition hover:opacity-80 ${f.bg} ${f.text} ${f.rand}`}
                >
                  <span>{tagNr}</span>
                  <span className="mt-0.5 text-[9px] tabular-nums">
                    {t.sleepScore != null ? Math.round(t.sleepScore) : '—'}
                  </span>
                </button>
              );
            })}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Nacht für Nacht
        </p>
        {/* Scrollbar unsichtbar: sie lag über der rechten Spalte (Bewertung). */}
        <div className="max-h-80 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  <TagesZeile key={t.date} onClick={() => setTagOffen(t.date)}>
                    <td className="py-1.5 text-[var(--text-muted)]">{t.date}</td>
                    <td className="py-1.5 text-right tabular-nums">{h.toFixed(1)} h</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {t.sleepScore != null ? Math.round(t.sleepScore) : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      {(() => {
                        const stufe = schlafStufe(t.sleepScore);
                        const f = schlafFarben(stufe);
                        return (
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[10.5px] font-semibold capitalize ${f.bg} ${f.text} ${f.rand}`}
                          >
                            {schlafBewertung(t.sleepScore)}
                          </span>
                        );
                      })()}
                    </td>
                  </TagesZeile>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
