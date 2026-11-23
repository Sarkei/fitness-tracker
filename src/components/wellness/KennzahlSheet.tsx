/**
 * Kennzahl-Detailansicht: öffnet sich per Klick auf eine Kachel.
 *
 * Zeigt Verlauf, Kennzahlen (Schnitt, Min, Max, Trend) und die Tagesliste.
 * Bewusst generisch: dieselbe Ansicht dient für Schlaf, Schritte, HRV, Puls,
 * Etagen, Form und alles, was später dazukommt.
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from '@/src/simple/ui';

export type KennzahlPunkt = { datum: string; wert: number | null };

export type KennzahlDef = {
  key: string;
  titel: string;
  einheit?: string;
  /** Wie der Wert angezeigt wird (z. B. 7.2 statt 7.2000001). */
  format?: (v: number) => string;
  /** Höher ist besser? Für die Trendfarbe. */
  hoeherBesser?: boolean;
  hinweis?: string;
};

function datumKurz(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}.${m}.`;
}

function datumLang(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function KennzahlSheet({
  def,
  punkte,
  onClose,
  onTag,
}: {
  def: KennzahlDef;
  punkte: KennzahlPunkt[];
  onClose: () => void;
  /** Wenn gesetzt, ist jeder Tag anklickbar und oeffnet die Tagesansicht. */
  onTag?: (datum: string) => void;
}): React.ReactElement {
  const { werte, mitWert } = useMemo(() => {
    const w = punkte.map((p) => p.wert).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return { werte: w, mitWert: punkte.filter((p) => typeof p.wert === 'number') };
  }, [punkte]);

  const fmt = def.format ?? ((v: number) => String(Math.round(v)));

  const statistik = useMemo(() => {
    if (werte.length === 0) return null;
    const summe = werte.reduce((a, b) => a + b, 0);
    const schnitt = summe / werte.length;
    const min = Math.min(...werte);
    const max = Math.max(...werte);

    // Trend: letzte 7 gegen die 7 davor
    let trend: number | null = null;
    if (mitWert.length >= 8) {
      const hinten = mitWert.slice(-7).map((p) => p.wert as number);
      const davor = mitWert.slice(-14, -7).map((p) => p.wert as number);
      if (davor.length > 0) {
        const a = davor.reduce((x, y) => x + y, 0) / davor.length;
        const b = hinten.reduce((x, y) => x + y, 0) / hinten.length;
        trend = b - a;
      }
    }
    return { schnitt, min, max, trend, anzahl: werte.length };
  }, [werte, mitWert]);

  const trendPfeil = (() => {
    if (!statistik || statistik.trend == null) return null;
    const t = statistik.trend;
    if (Math.abs(t) < 0.01) return { icon: Minus, farbe: 'var(--text-muted)', text: 'unverändert' };
    const besser = def.hoeherBesser === false ? t < 0 : t > 0;
    return {
      icon: t > 0 ? TrendingUp : TrendingDown,
      farbe: besser ? 'var(--simple-accent)' : '#dc5a4a',
      text: `${t > 0 ? '+' : ''}${fmt(t)} ${def.einheit ?? ''} zur Vorwoche`,
    };
  })();

  const reihe = punkte.map((p) => p.wert ?? 0);

  const inhalt = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[var(--vv-height,92dvh)] w-full max-w-2xl overflow-hidden rounded-t-[1.75rem] bg-[var(--card-bg)] shadow-2xl sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-muted)] p-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{def.titel}</h2>
            {def.hinweis && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{def.hinweis}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92dvh-4rem)] overflow-y-auto p-4">
          {!statistik ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              Für diesen Zeitraum liegen keine Werte vor.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Schnitt', wert: fmt(statistik.schnitt) },
                  { label: 'Niedrigster', wert: fmt(statistik.min) },
                  { label: 'Höchster', wert: fmt(statistik.max) },
                  { label: 'Tage mit Wert', wert: String(statistik.anzahl) },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-[var(--surface-gray)] px-3 py-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {s.label}
                    </p>
                    <p className="text-[15px] font-semibold tabular-nums text-[var(--foreground)]">
                      {s.wert}
                      {def.einheit ? (
                        <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">{def.einheit}</span>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>

              {trendPfeil && (
                <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: trendPfeil.farbe }}>
                  <trendPfeil.icon className="h-3.5 w-3.5" />
                  {trendPfeil.text}
                </p>
              )}

              <div className="rounded-xl border border-[var(--border-muted)] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Verlauf
                </p>
                <Sparkline values={reihe} height={110} einheit={def.einheit} />
                <div className="mt-1 flex justify-between text-[9.5px] text-[var(--text-muted)]">
                  <span>{datumKurz(punkte[0].datum)}</span>
                  <span>{datumKurz(punkte[punkte.length - 1].datum)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-muted)]">
                <table className="w-full text-[12px]">
                  <thead className="text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Tag</th>
                      <th className="px-3 py-2 text-right font-semibold">{def.titel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-muted)]">
                    {[...punkte].reverse().map((p) => (
                      <tr
                        key={p.datum}
                        onClick={onTag ? () => onTag(p.datum) : undefined}
                        className={onTag ? 'cursor-pointer transition hover:bg-[var(--surface-gray)]' : undefined}
                      >
                        <td className="px-3 py-1.5 text-[var(--text-muted)]">{datumLang(p.datum)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                          {p.wert == null ? '—' : `${fmt(p.wert)}${def.einheit ? ` ${def.einheit}` : ''}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Portal statt Inline: der Sheet haengt an <body> und kann die Seite nicht mehr
  // verschieben, wenn nach dem Eintragen neue Werte dazukommen.
  return typeof document === "undefined" ? inhalt : createPortal(inhalt, document.body);
}

/** Klickbare Kachel: gleiche Optik wie StatTile, aber als Button. */
export function KlickKachel({
  label,
  value,
  unit,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-left transition hover:border-[var(--simple-accent)]"
    >
      <p className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
        <TrendingUp className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-100" />
      </p>
      <p className="mt-1 text-[20px] font-semibold leading-none tabular-nums text-[var(--foreground)]">
        {value}
        {unit ? <span className="ml-1 text-[10.5px] font-normal text-[var(--text-muted)]">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">{hint}</p> : null}
    </button>
  );
}
