import { useMemo } from 'react';
import { bilanzImZiel, wochentagKurz, type BilanzTag, type ZielTyp } from './serien';

const GRUEN = '#22c55e';
const ROT = '#ef4444';

/** Runde Obergrenze für die Y-Achse, damit die Beschriftung glatte Zahlen zeigt. */
function rundeGrenze(wert: number): number {
  if (wert <= 0) return 500;
  const stufen = [250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000];
  return stufen.find((s) => s >= wert) ?? Math.ceil(wert / 1000) * 1000;
}

function fmtZahl(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

function fmtDatum(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

const HOEHE = 200;
const ACHSE_BREITE = 54;

/**
 * Kalorienbilanz der letzten Tage als Balken an der Nulllinie.
 *
 * Jeder Balken hängt am Tagesanfang in voller Höhe unter der Linie (= offenes Budget)
 * und schrumpft mit jedem erfassten Essen. Ist das Budget überschritten, wächst er rot
 * über die Linie. Die Farbe folgt dem Profilziel: grün = im Ziel, rot = daneben.
 * Es gibt keine eingefärbten Hintergrundflächen, nur die Balken tragen Farbe.
 */
export default function BilanzChart({
  bilanz,
  zielTyp,
  heute,
  hoechstens = 14,
}: {
  bilanz: BilanzTag[];
  zielTyp: ZielTyp;
  heute: string;
  hoechstens?: number;
}) {
  const tage = useMemo(() => bilanz.slice(-hoechstens), [bilanz, hoechstens]);

  const maxWert = useMemo(() => {
    // Maßstab ist das Tagesbudget (Ziel + Aktivität), damit der volle Balken passt.
    const budgets = tage.map((t) => t.ziel + t.verbrannt);
    const ueberzogen = tage.filter((t) => t.hatDaten).map((t) => Math.abs(t.bilanz));
    return rundeGrenze(Math.max(500, ...budgets, ...ueberzogen));
  }, [tage]);

  // Nulllinie in der Mitte: oben Platz für Überschuss, unten für offenes Budget.
  const mitte = HOEHE / 2;
  const skala = mitte / maxWert;

  const ticksY = useMemo(() => {
    const schritt = maxWert / 2;
    return [maxWert, schritt, 0, -schritt, -maxWert];
  }, [maxWert]);

  /** y-Position (px von oben) für einen kcal-Wert. */
  const y = (wert: number) => mitte - wert * skala;

  return (
    <div>
      <div className="flex">
        {/* Y-Achse */}
        <div className="relative shrink-0" style={{ width: ACHSE_BREITE, height: HOEHE }}>
          {ticksY.map((tick) => (
            <div
              key={`y-${tick}`}
              className="absolute inset-x-0 flex items-center justify-end pr-2.5"
              style={{ top: y(tick), transform: 'translateY(-50%)' }}
            >
              <span
                className="text-[10.5px] font-semibold leading-none tabular-nums"
                style={{ color: tick === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {tick === 0 ? '0' : fmtZahl(tick)}
              </span>
            </div>
          ))}
        </div>

        {/* Diagrammfläche */}
        <div className="relative min-w-0 flex-1" style={{ height: HOEHE }}>
          {/* Gitterlinien — dezent, ohne Flächenfüllung */}
          {ticksY.map((tick) => (
            <div
              key={`g-${tick}`}
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: y(tick),
                borderTop: `1px ${tick === 0 ? 'solid' : 'dotted'} ${
                  tick === 0
                    ? 'color-mix(in srgb, var(--text-primary) 40%, transparent)'
                    : 'color-mix(in srgb, var(--border-muted) 65%, transparent)'
                }`,
              }}
            />
          ))}

          {/* Balken */}
          <div className="absolute inset-0 flex items-stretch gap-1.5">
            {tage.map((tag) => {
              const budget = tag.ziel + tag.verbrannt;
              const offen = budget - tag.kcal;
              const ueberzogen = tag.hatDaten && offen < 0;
              const imZiel = bilanzImZiel(tag.bilanz, zielTyp);
              // Jeder Balken ist grün oder rot — nie grau.
              const farbe = imZiel ? GRUEN : ROT;
              const istHeute = tag.ymd === heute;
              // Heute immer zeichnen (am Tagesanfang volles Budget),
              // vergangene Tage nur, wenn etwas erfasst wurde.
              const sichtbar = tag.hatDaten || istHeute;
              const hoehe = Math.min(mitte, Math.max(3, Math.abs(offen) * skala));

              return (
                <div
                  key={tag.ymd}
                  className="group relative flex-1"
                  title={
                    tag.hatDaten
                      ? `${fmtDatum(tag.ymd)}: ${fmtZahl(tag.kcal)} kcal gegessen · Budget ${fmtZahl(
                          budget,
                        )} kcal · ${offen >= 0 ? `${fmtZahl(offen)} kcal offen` : `${fmtZahl(-offen)} kcal über`}${
                          tag.vollstaendig ? '' : ' (unvollständig erfasst)'
                        }`
                      : `${fmtDatum(tag.ymd)}: nichts erfasst`
                  }
                >
                  {sichtbar && (
                    <div
                      className="absolute inset-x-0 transition-all duration-500 group-hover:brightness-110"
                      style={{
                        height: hoehe,
                        top: ueberzogen ? mitte - hoehe : mitte,
                        background: farbe,
                        borderRadius: ueberzogen ? '3px 3px 0 0' : '0 0 3px 3px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-Achse */}
      <div className="mt-2 flex" style={{ paddingLeft: ACHSE_BREITE }}>
        <div className="flex min-w-0 flex-1 gap-1.5">
          {tage.map((tag) => {
            const aktiv = tag.ymd === heute;
            return (
              <div key={`x-${tag.ymd}`} className="min-w-0 flex-1 text-center">
                <p
                  className="text-[9.5px] font-bold uppercase leading-tight tracking-wide"
                  style={{ color: aktiv ? 'var(--simple-accent)' : 'var(--text-muted)' }}
                >
                  {wochentagKurz(tag.ymd)}
                </p>
                <p
                  className="text-[9px] leading-tight tabular-nums"
                  style={{
                    color: aktiv
                      ? 'var(--simple-accent)'
                      : 'color-mix(in srgb, var(--text-muted) 70%, transparent)',
                  }}
                >
                  {tag.ymd.slice(8, 10)}.
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Achsen-Titel: links die Einheit, rechts die Achse */}
      <div
        className="mt-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]"
        style={{ paddingLeft: ACHSE_BREITE }}
      >
        <span>kcal</span>
        <span>Tag</span>
      </div>

      {/*
        Zahlen zum Ablesen. Die Balken zeigen die Richtung, aber nicht den Wert —
        Tim wollte die Kalorien auch als Zahl sehen, gerade fuer vergangene Tage.
      */}
      <details className="mt-3 border-t border-[var(--border-muted)] pt-2.5">
        <summary className="cursor-pointer list-none text-[10.5px] font-semibold text-[var(--simple-accent)]">
          Zahlen je Tag anzeigen
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <th className="py-1 text-left font-semibold">Tag</th>
                <th className="py-1 text-right font-semibold">Gegessen</th>
                <th className="py-1 text-right font-semibold">Verbraucht</th>
                <th className="py-1 text-right font-semibold">Bilanz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {[...tage].reverse().map((t) => {
                const verbraucht = Math.round(t.ziel + t.verbrannt);
                return (
                  <tr key={`z-${t.ymd}`}>
                    <td className="py-1 text-[var(--text-muted)]">{fmtDatum(t.ymd)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {t.hatDaten ? fmtZahl(t.kcal) : '—'}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmtZahl(verbraucht)}</td>
                    <td
                      className="py-1 text-right font-semibold tabular-nums"
                      style={{ color: t.hatDaten ? (t.bilanz < 0 ? GRUEN : ROT) : 'var(--text-muted)' }}
                    >
                      {t.hatDaten ? `${t.bilanz > 0 ? '+' : ''}${fmtZahl(t.bilanz)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      {/* Legende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-muted)] pt-2.5 text-[10.5px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: GRUEN }} />
          im Ziel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: ROT }} />
          daneben
        </span>
        <span className="ml-auto text-[10px]">unter 0 = noch offen · über 0 = über dem Budget</span>
      </div>
    </div>
  );
}
