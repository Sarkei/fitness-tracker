import { useMemo } from 'react';
import {
  HALTEN_TOLERANZ_KCAL,
  bilanzImZiel,
  zielZone,
  type BilanzTag,
  type ZielTyp,
} from './serien';
import { wochentagKurz } from './serien';

const GRUEN = '#22c55e';
const ROT = '#ef4444';
const GRAU = '#94a3b8';

/** Runde Obergrenze für die Y-Achse, damit die Beschriftung glatte Zahlen zeigt. */
function rundeGrenze(wert: number): number {
  if (wert <= 0) return 500;
  const stufen = [250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000];
  return stufen.find((s) => s >= wert) ?? Math.ceil(wert / 1000) * 1000;
}

function fmtKcal(v: number): string {
  const gerundet = Math.round(v);
  const zeichen = gerundet > 0 ? '+' : '';
  return `${zeichen}${gerundet.toLocaleString('de-DE')}`;
}

function fmtDatum(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Kalorienbilanz der letzten Tage als Balken um die Nulllinie.
 *
 * Über der Linie = Überschuss, darunter = Defizit. Welcher Bereich grün ist,
 * hängt am Profilziel: abnehmen will Defizit, zunehmen Überschuss, halten eine
 * Toleranz von ±500 kcal um die Nulllinie. Alles andere ist rot.
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
    const roh = Math.max(1, ...tage.map((t) => Math.abs(t.bilanz)));
    // Bei „halten" muss die Toleranzzone immer sichtbar bleiben.
    const mitZone = zielTyp === 'maintain' ? Math.max(roh, HALTEN_TOLERANZ_KCAL * 1.15) : roh;
    return rundeGrenze(mitZone);
  }, [tage, zielTyp]);

  const zone = zielZone(zielTyp);

  // Höhe in Prozent der Gesamthöhe; die Nulllinie sitzt mittig, wenn oben und unten
  // gleich viel Platz ist — sonst verschiebt sie sich anteilig.
  const HOEHE = 190;
  const mitte = HOEHE / 2;
  const skala = mitte / maxWert;

  const ticksY = useMemo(() => {
    const schritt = maxWert / 2;
    return [maxWert, schritt, 0, -schritt, -maxWert];
  }, [maxWert]);

  const zonenTexte: Record<ZielTyp, string> = {
    lose: `Zielführend: Defizit (unter 0)`,
    maintain: `Zielführend: ±${HALTEN_TOLERANZ_KCAL} kcal um 0`,
    gain: `Zielführend: Überschuss (über 0)`,
  };

  /** y-Position (px von oben) für einen kcal-Wert. */
  const y = (wert: number) => mitte - wert * skala;

  /** Rechteck für die grüne Zone. */
  const zoneRechteck = () => {
    if (zielTyp === 'lose') {
      const oben = mitte; // 0-Linie
      return { top: oben, height: mitte };
    }
    if (zielTyp === 'gain') {
      return { top: 0, height: mitte };
    }
    const vonY = y(zone.von ?? -HALTEN_TOLERANZ_KCAL);
    const bisY = y(zone.bis ?? HALTEN_TOLERANZ_KCAL);
    return { top: bisY, height: Math.max(2, vonY - bisY) };
  };

  const zr = zoneRechteck();

  return (
    <div className="relative pl-12 pr-1">
      {/* Grüne Zielzone im Hintergrund */}
      <div
        className="pointer-events-none absolute rounded-[3px]"
        style={{
          left: 44,
          right: 4,
          top: zr.top,
          height: zr.height,
          background: `color-mix(in srgb, ${GRUEN} 12%, transparent)`,
        }}
      />

      {/* Y-Achse mit Beschriftung */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-11">
        {ticksY.map((tick) => (
          <span
            key={tick}
            className="absolute right-1 -translate-y-1/2 text-[9px] font-semibold tabular-nums text-[var(--text-muted)]"
            style={{ top: y(tick) }}
          >
            {tick === 0 ? '0' : fmtKcal(tick)}
          </span>
        ))}
      </div>

      {/* Achsenbeschriftung */}
      <span className="pointer-events-none absolute -left-1 top-1/2 -translate-y-[calc(100%+6px)] -rotate-90 origin-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        Bilanz
      </span>

      <div className="relative" style={{ height: HOEHE }}>
        {/* Gitterlinien */}
        {ticksY.map((tick) => (
          <div
            key={`g-${tick}`}
            className="pointer-events-none absolute inset-x-0"
            style={{
              top: y(tick),
              borderTop: `1px ${tick === 0 ? 'solid' : 'dotted'} ${
                tick === 0 ? 'var(--border-muted)' : 'color-mix(in srgb, var(--border-muted) 55%, transparent)'
              }`,
            }}
          />
        ))}

        {/* Balken */}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {tage.map((tag) => {
            const imZiel = bilanzImZiel(tag.bilanz, zielTyp);
            const farbe = !tag.hatDaten ? GRAU : imZiel ? GRUEN : ROT;
            const hoehePx = tag.hatDaten ? Math.max(2, Math.abs(tag.bilanz) * skala) : 0;
            const positiv = tag.bilanz >= 0;
            return (
              <div
                key={tag.ymd}
                className="relative flex-1"
                title={
                  tag.hatDaten
                    ? `${fmtDatum(tag.ymd)}: ${tag.kcal} kcal gegessen · ${tag.verbrannt} kcal Training · Bilanz ${fmtKcal(
                        tag.bilanz,
                      )} kcal${tag.vollstaendig ? '' : ' (unvollständig erfasst)'}`
                    : `${fmtDatum(tag.ymd)}: nichts erfasst`
                }
              >
                {tag.hatDaten ? (
                  <div
                    className="absolute inset-x-[1px] rounded-[2px] transition-all duration-500"
                    style={{
                      height: hoehePx,
                      top: positiv ? mitte - hoehePx : mitte,
                      background: `color-mix(in srgb, ${farbe} 82%, transparent)`,
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-x-[1px]"
                    style={{ top: mitte - 1, height: 2, background: `color-mix(in srgb, ${GRAU} 40%, transparent)` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* X-Achse */}
      <div className="mt-1 flex gap-[2px] border-t border-[var(--border-muted)] pt-1">
        {tage.map((tag) => (
          <span
            key={tag.ymd}
            className="flex-1 text-center text-[9px] font-semibold uppercase tracking-[0.06em]"
            style={{
              color: tag.ymd === heute ? 'var(--simple-accent)' : 'var(--text-muted)',
              fontWeight: tag.ymd === heute ? 800 : 600,
            }}
          >
            {wochentagKurz(tag.ymd)}
          </span>
        ))}
      </div>
      <div className="mt-0.5 flex gap-[2px]">
        {tage.map((tag) => (
          <span
            key={`d-${tag.ymd}`}
            className="flex-1 text-center text-[8px] tabular-nums text-[var(--text-muted)]"
          >
            {tag.ymd.slice(8, 10)}.
          </span>
        ))}
      </div>

      {/* X-Achsen-Titel + Legende */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--border-muted)] pt-2 text-[10px] text-[var(--text-muted)]">
        <span className="font-bold uppercase tracking-wider">Tag</span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: GRUEN }} /> {zonenTexte[zielTyp]}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: ROT }} /> daneben
          </span>
        </span>
      </div>
    </div>
  );
}
