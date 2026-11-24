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
  const { daten, zeitraum } = useWellness();
  const tage = daten.tage;
  /** Bei "Heute" gibt es keine Serie — dann nur reelle Werte der letzten Nacht. */
  const nurHeute = zeitraum === 1;
  const [detail, setDetail] = useState<'dauer' | 'score' | null>(null);
  const [tagOffen, setTagOffen] = useState<string | null>(null);

  const naechte = tage.map((t) => t.sleepSecs);
  const reihe = naechte.map((s) => schlafStunden(s) ?? 0);
  const schnitt = mittel(reihe.filter((v) => v > 0));
  const letzteNacht = [...reihe].reverse().find((v) => v > 0) ?? null;
  const scores = tage.map((t) => t.sleepScore).filter((s): s is number => s != null);
  const scoreSchnitt = mittel(scores);
  const scoreHeute = [...tage].reverse().find((t) => t.sleepScore != null)?.sleepScore ?? null;

  /*
   * Schlafphasen: Garmin teilt die Nacht in Tief-, REM-, Leichtschlaf und Wachzeit.
   * Intervals liefert sie nicht — fehlen sie, bleibt der Block ausgeblendet.
   */
  const phasenReihe = tage.map((t) => ({
    datum: t.date,
    tief: t.deepSecs != null ? t.deepSecs / 3600 : null,
    rem: t.remSecs != null ? t.remSecs / 3600 : null,
    leicht: t.lightSecs != null ? t.lightSecs / 3600 : null,
    wach: t.awakeSecs != null ? t.awakeSecs / 60 : null,
  }));
  const letztePhasen = [...phasenReihe].reverse().find((p) => p.tief != null || p.rem != null) ?? null;
  const hatPhasen = letztePhasen != null;
  const phaseSchnitt = (feld: 'tief' | 'rem' | 'leicht') => {
    const werte = phasenReihe.map((p) => p[feld]).filter((v): v is number => v != null && v > 0);
    return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
  };

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
        {!nurHeute && (
          <KlickKachel
            label="Nächte im Schnitt"
            value={schnitt != null ? schnitt.toFixed(1) : '—'}
            unit="h"
            hint={`${naechte.filter((s) => s).length} Nächte`}
            onClick={() => setDetail('dauer')}
          />
        )}
        <KlickKachel
          label={nurHeute ? 'Schlafscore' : 'Score im Schnitt'}
          value={
            (nurHeute ? scoreHeute : scoreSchnitt) != null
              ? Math.round((nurHeute ? scoreHeute : scoreSchnitt) as number)
              : '—'
          }
          hint={
            (nurHeute ? scoreHeute : scoreSchnitt) != null
              ? schlafBewertung((nurHeute ? scoreHeute : scoreSchnitt) as number)
              : 'kein Score'
          }
          onClick={() => setDetail('score')}
        />
        {!nurHeute && (
          <KlickKachel
            label={`Nächte ≥ 7 h`}
            value={gut}
            unit={`von ${reihe.filter((v) => v > 0).length}`}
            hint="ausreichend"
            onClick={() => setDetail('dauer')}
          />
        )}
      </div>

      {/* Schlafphasen der letzten Nacht — Kacheln oben, Balken darunter */}
      {hatPhasen && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KlickKachel
              label="Tiefschlaf"
              value={letztePhasen?.tief != null ? letztePhasen.tief.toFixed(1) : '—'}
              unit="h"
              onClick={() => setDetail('dauer')}
            />
            <KlickKachel
              label="REM-Schlaf"
              value={letztePhasen?.rem != null ? letztePhasen.rem.toFixed(1) : '—'}
              unit="h"
              onClick={() => setDetail('dauer')}
            />
            <KlickKachel
              label="Leichtschlaf"
              value={letztePhasen?.leicht != null ? letztePhasen.leicht.toFixed(1) : '—'}
              unit="h"
              onClick={() => setDetail('dauer')}
            />
            <KlickKachel
              label="Wach"
              value={letztePhasen?.wach != null ? Math.round(letztePhasen.wach) : '—'}
              unit="min"
              onClick={() => setDetail('dauer')}
            />
          </div>

          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Moon className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
              <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
                Schlafphasen der letzten Nacht
              </p>
            </div>
            {(() => {
              const p = letztePhasen;
              if (!p) return null;
              const teile = [
                { label: 'Tief', wert: p.tief ?? 0, farbe: '#1f6b4a' },
                { label: 'REM', wert: p.rem ?? 0, farbe: '#4d9f6b' },
                { label: 'Leicht', wert: p.leicht ?? 0, farbe: '#9cc7ae' },
              ];
              const gesamt = teile.reduce((a, t) => a + t.wert, 0) || 1;
              return (
                <>
                  {/* Gestapelter Balken: Anteile auf einen Blick */}
                  <div className="flex h-7 w-full overflow-hidden rounded-lg">
                    {teile.map((t) => (
                      <div
                        key={t.label}
                        style={{ width: `${(t.wert / gesamt) * 100}%`, background: t.farbe }}
                        title={`${t.label}: ${t.wert.toFixed(1)} h`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    {teile.map((t) => (
                      <span key={t.label} className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: t.farbe }}
                        />
                        <span className="text-[var(--text-muted)]">{t.label}</span>
                        <span className="font-semibold tabular-nums">
                          {t.wert.toFixed(1)} h · {Math.round((t.wert / gesamt) * 100)} %
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
                    Richtwerte: Tiefschlaf 15–25 %, REM 20–25 %, Leichtschlaf 45–60 % der Nacht.
                  </p>
                </>
              );
            })()}
          </Card>

          {/* Verlauf je Phase — nur bei Mehrtaegesansicht sinnvoll */}
          {!nurHeute && (
          <Card className="space-y-3 p-5">
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
              Phasen im Verlauf
            </p>
            <div className="space-y-2">
              {[
                { label: 'Tiefschlaf', feld: 'tief' as const, farbe: '#1f6b4a' },
                { label: 'REM', feld: 'rem' as const, farbe: '#4d9f6b' },
                { label: 'Leichtschlaf', feld: 'leicht' as const, farbe: '#9cc7ae' },
              ].map(({ label, feld, farbe }) => {
                const schnittPhase = phaseSchnitt(feld);
                return (
                  <div key={feld} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[11px] text-[var(--text-muted)]">{label}</span>
                    <div className="min-w-0 flex-1">
                      <Sparkline
                        values={phasenReihe.map((p) => p[feld] ?? 0)}
                        height={36}
                        color={farbe}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums">
                      {schnittPhase != null ? `${schnittPhase.toFixed(1)} h` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              Ø über die Nächte mit Messung. Leere Nächte zählen nicht mit.
            </p>
          </Card>
          )}
        </>
      )}

      {!nurHeute && (
      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <Moon className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Schlafdauer im Verlauf</p>
        </div>
        <Sparkline values={reihe} height={90} einheit="h" />
      </Card>
      )}

      {!nurHeute && (
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
      )}

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
                  className="flex flex-col items-center gap-1 transition hover:opacity-80"
                >
                  {/* Datum ausserhalb der Box — sonst stehen zwei nackte Zahlen uebereinander. */}
                  <span className="text-[9px] tabular-nums text-[var(--text-muted)]">
                    {tagNr}.{monat}.
                  </span>
                  <span
                    className={`flex h-8 w-11 items-center justify-center rounded-md border text-[12px] font-semibold tabular-nums ${f.bg} ${f.text} ${f.rand}`}
                  >
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
