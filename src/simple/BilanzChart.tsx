import { useMemo } from 'react';
import { wochentagKurz, type BilanzTag } from './serien';

/** Defizit: Balken wächst nach unten. */
const DEFIZIT = '#2f7d5a';
/** Überschuss: Balken wächst nach oben. */
const UEBERSCHUSS = '#d9534f';

/** Runde Obergrenze für die Y-Achse, damit die Beschriftung glatte Zahlen zeigt. */
function rundeGrenze(wert: number): number {
  if (wert <= 0) return 500;
  const stufen = [500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000];
  return stufen.find((s) => s >= wert) ?? Math.ceil(wert / 1000) * 1000;
}

function fmtZahl(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

function fmtDatum(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

const HOEHE = 220;
const ACHSE_BREITE = 54;

/**
 * Kalorienbilanz der letzten Tage als ein Balken je Tag.
 *
 * Der Balken zeigt die Bilanz (Gegessen − Verbrauch):
 *
 *  - Er hängt an der Nulllinie und wächst nach unten, solange das Defizit offen
 *    ist. Je mehr die Uhr im Lauf des Tages verbraucht, desto länger wird er —
 *    heute also dynamisch.
 *  - Mit jedem erfassten Essen wird er kürzer: Gegessenes gleicht das Defizit aus.
 *  - Isst man mehr als man verbraucht, rutscht er über die Nulllinie nach oben ins
 *    Positive — Kalorienüberschuss.
 *
 * Langer Balken nach unten = großes Defizit, kurzer Balken = knapp am Budget,
 * Balken oben = Überschuss.
 */
export default function BilanzChart({
  bilanz,
  heute,
  hoechstens = 14,
}: {
  bilanz: BilanzTag[];
  heute: string;
  hoechstens?: number;
}) {
  const tage = useMemo(() => bilanz.slice(-hoechstens), [bilanz, hoechstens]);

  /*
   * Maßstab: die größte Bilanz eines Tages, nach oben wie nach unten.
   * Ein Tag ohne Erfassung hat die volle Bilanz (= Verbrauch) — der Balken darf
   * nicht abgeschnitten werden, sonst sieht er aus wie ein erfasster Tag.
   */
  const maxWert = useMemo(() => {
    const werte = tage.map((t) => Math.abs(t.bilanz));
    return rundeGrenze(Math.max(500, ...werte));
  }, [tage]);

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
        {/* Y-Achse: oben Überschuss, unten Defizit */}
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

          {/* Ein Balken je Tag, an der Nulllinie */}
          <div className="absolute inset-0 flex items-stretch gap-1.5">
            {tage.map((tag) => {
              const istHeute = tag.ymd === heute;
              const wert = Math.round(tag.bilanz);
              const ueberschuss = wert > 0;
              const hoehe = Math.min(mitte, Math.abs(wert) * skala);
              /* Nur zeichnen, wenn es einen Wert gibt — kein Strich bei 0. */
              const sichtbar = hoehe >= 1;

              return (
                <div
                  key={tag.ymd}
                  className="group relative flex-1"
                  title={[
                    fmtDatum(tag.ymd),
                    `gegessen ${fmtZahl(tag.kcal)} kcal`,
                    `verbraucht ${fmtZahl(tag.verbrannt)} kcal`,
                    `${ueberschuss ? 'Überschuss' : 'Defizit'} ${fmtZahl(Math.abs(wert))} kcal`,
                    tag.kcal === 0 ? 'nichts erfasst' : tag.vollstaendig ? '' : 'unvollständig erfasst',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {sichtbar && (
                    <div
                      className="absolute inset-x-0 transition-all duration-500 group-hover:brightness-110"
                      style={{
                        height: hoehe,
                        top: ueberschuss ? mitte - hoehe : mitte,
                        background: ueberschuss ? UEBERSCHUSS : DEFIZIT,
                        borderRadius: ueberschuss ? '3px 3px 0 0' : '0 0 3px 3px',
                      }}
                    />
                  )}

                  {/* Heute: feiner Rahmen um die Tagesspalte */}
                  {istHeute && (
                    <div
                      className="pointer-events-none absolute inset-0 rounded-sm"
                      style={{
                        border: '1px dashed color-mix(in srgb, var(--simple-accent) 55%, transparent)',
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

      {/* Achsen-Titel */}
      <div
        className="mt-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]"
        style={{ paddingLeft: ACHSE_BREITE }}
      >
        <span>kcal</span>
        <span>Tag</span>
      </div>

      {/* Zahlen zum Ablesen */}
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
              {[...tage].reverse().map((t) => (
                <tr key={`z-${t.ymd}`}>
                  <td className="py-1 text-[var(--text-muted)]">{fmtDatum(t.ymd)}</td>
                  <td className="py-1 text-right tabular-nums">{t.kcal > 0 ? fmtZahl(t.kcal) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{t.verbrannt > 0 ? fmtZahl(t.verbrannt) : '—'}</td>
                  <td
                    className="py-1 text-right font-semibold tabular-nums"
                    style={{ color: t.bilanz > 0 ? UEBERSCHUSS : DEFIZIT }}
                  >
                    {`${t.bilanz > 0 ? '+' : ''}${fmtZahl(t.bilanz)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Legende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-muted)] pt-2.5 text-[10.5px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: DEFIZIT }} />
          Defizit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: UEBERSCHUSS }} />
          Überschuss
        </span>
        <span className="ml-auto text-[10px]">Balken kürzer, sobald du isst</span>
      </div>
    </div>
  );
}
