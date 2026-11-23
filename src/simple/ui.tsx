import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Ruhige Karte: weisse Flaeche, feine Kante, kaum Schatten. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow}</p>
        )}
        <h1
          className="mt-0.5 text-[26px] leading-tight text-[var(--foreground)] sm:text-3xl"
          style={{ fontFamily: 'var(--simple-serif)' }}
        >
          {title}
        </h1>
        {hint && <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{children}</h2>
      {action}
    </div>
  );
}

export function Ring({
  value,
  max,
  label,
  unit,
  size = 132,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  size?: number;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const style: CSSProperties = { width: size, height: size };
  return (
    <div className="relative shrink-0" style={style}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--simple-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums tracking-tight">{Math.round(value)}</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          von {Math.round(max)} {unit}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Makro-Balken: jede Kennzahl hat ihre eigene Farbe, damit die drei auf einen Blick trennbar sind. */
export function MacroBar({
  label,
  value,
  max,
  unit = 'g',
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  /** Füllfarbe; ohne Angabe die Akzentfarbe. */
  color?: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max && max > 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-medium">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular-nums">
          {Math.round(value)}
          <span className="text-[var(--text-muted)]">
            /{Math.round(max)}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${ratio * 100}%`, background: over ? '#f87171' : (color ?? 'var(--simple-accent)') }}
        />
      </div>
    </div>
  );
}

/** Farben der drei Makros in der Heute-Ansicht (Amber / Blau / Violett). */
export const MAKRO_FARBEN = {
  protein: '#c2831f',
  carbs: '#3d7fb8',
  fat: '#8a6bb5',
} as const;

export function PrimaryButton({
  children,
  onClick,
  disabled,
  full,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${full ? 'w-full' : ''} ${className}`}
      style={{ background: 'var(--simple-accent)', color: 'var(--simple-accent-ink)' }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        active
          ? 'border-[var(--simple-accent)] text-[var(--foreground)]'
          : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
      }`}
      style={active ? { background: 'color-mix(in srgb, var(--simple-accent) 12%, transparent)' } : undefined}
    >
      {children}
    </button>
  );
}

/** Kennzahl-Kachel: grosser Wert, kleines Label, optionaler Zusatz. */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'warn' | 'muted';
  icon?: ReactNode;
}) {
  const toneColor =
    tone === 'accent'
      ? 'var(--simple-accent)'
      : tone === 'warn'
        ? '#f87171'
        : tone === 'muted'
          ? 'var(--text-muted)'
          : 'var(--foreground)';

  return (
    <div className="rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: toneColor }}>
          {value}
        </span>
        {unit && <span className="text-[11px] font-medium text-[var(--text-muted)]">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/** Balkenreihe für Verteilungen (z. B. Muskelbalance). */
export function BarRow({
  label,
  value,
  max,
  caption,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-[11.5px] text-[var(--text-muted)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-muted)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${ratio * 100}%`, background: 'var(--simple-accent)' }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums">{caption ?? Math.round(value)}</span>
    </div>
  );
}

/** Aktivitäts-Heatmap: Wochen als Zeilen, Tage als Spalten. */
export function Heatmap({
  days,
  weeks = 12,
  weeksMobil = 6,
}: {
  days: Array<{ ymd: string; value: number }>;
  weeks?: number;
  weeksMobil?: number;
}) {
  // Auf kleinen Bildschirmen sind 12 Wochen zu eng — dort die Haelfte zeigen.
  const [mobil, setMobil] = useState(false);
  useEffect(() => {
    const abfrage = () => setMobil(window.innerWidth < 640);
    abfrage();
    window.addEventListener('resize', abfrage);
    return () => window.removeEventListener('resize', abfrage);
  }, []);

  const sichtbar = mobil ? Math.min(weeksMobil, weeks) : weeks;
  const byDate = new Map(days.map((d) => [d.ymd, d.value]));
  const max = Math.max(1, ...days.map((d) => d.value));

  // Die letzten `weeks` Wochen, Montag als Wochenstart
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Mo=0
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (sichtbar - 1) * 7);

  const grid: Array<Array<{ ymd: string; value: number }>> = [];
  for (let w = 0; w < sichtbar; w += 1) {
    const row: Array<{ ymd: string; value: number }> = [];
    for (let d = 0; d < 7; d += 1) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);
      const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      row.push({ ymd, value: byDate.get(ymd) ?? 0 });
    }
    grid.push(row);
  }

  const stufe = (v: number) => {
    if (v <= 0) return 0;
    const r = v / max;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  };

  const farbe = (s: number) => {
    if (s === 0) return 'var(--border-muted)';
    const alpha = [0, 0.28, 0.5, 0.72, 1][s];
    return `color-mix(in srgb, var(--simple-accent) ${alpha * 100}%, transparent)`;
  };

  return (
    <div>
      <div className="flex gap-1">
        <div className="mr-1 flex flex-col justify-between py-0.5 text-[9px] text-[var(--text-muted)]">
          <span>Mo</span>
          <span>Mi</span>
          <span>Fr</span>
          <span>So</span>
        </div>
        {grid.map((woche, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {woche.map((tag) => (
              <div
                key={tag.ymd}
                title={`${tag.ymd}: ${Math.round(tag.value)}`}
                className="h-3 w-3 rounded-[3px] transition-colors"
                style={{ background: farbe(stufe(tag.value)) }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-[var(--text-muted)]">
        <span>wenig</span>
        {[0, 1, 2, 3, 4].map((s) => (
          <div key={s} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: farbe(s) }} />
        ))}
        <span>viel</span>
      </div>
    </div>
  );
}

/** Kleine Verlaufslinie ohne Achsen. */
/**
 * Sparkline mit echter Skala.
 *
 * Ohne Achsen sagt eine Kurve nichts: man sieht, dass sie sich bewegt, aber nicht
 * ob das viel oder wenig ist. Deshalb hier drei horizontale Hilfslinien mit
 * beschriftetem Wertebereich und eine Datumsbeschriftung am Rand.
 */
export function Sparkline({
  values,
  height = 42,
  goal,
  color,
  einheit,
  minY,
  maxY,
}: {
  values: number[];
  height?: number;
  goal?: number;
  /** Linienfarbe (CSS-Farbe oder Variable). Standard nutzt die Akzentfarbe. */
  color?: string;
  /** Einheit für die Achsenbeschriftung, z. B. „h" oder „bpm". */
  einheit?: string;
  /** Untere Achsengrenze erzwingen (z. B. 0). */
  minY?: number;
  /** Obere Achsengrenze erzwingen. */
  maxY?: number;
}) {
  if (values.length < 2) return <div style={{ height }} />;

  const echteWerte = values.filter((v) => Number.isFinite(v));
  const datenMax = echteWerte.length ? Math.max(...echteWerte) : 1;
  const datenMin = echteWerte.length ? Math.min(...echteWerte) : 0;

  // Bei kleinen Schwankungen (z. B. HRV 20-33) nicht bei 0 starten, sonst
  // wirkt die Kurve flach. Etwas Luft nach oben und unten lassen.
  const spanne = datenMax - datenMin;
  const polster = spanne > 0 ? spanne * 0.15 : Math.max(1, datenMax * 0.1);
  const min = minY ?? Math.max(0, datenMin - polster);
  const max = maxY ?? Math.max(datenMax + polster, goal ?? 0, min + 1);

  const w = 100;
  const h = height;
  const step = w / (values.length - 1);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;

  const punkte = values.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const flaeche = `0,${h} ${punkte} ${w},${h}`;
  const zielY = goal !== undefined ? y(goal) : null;

  /** Achsenwert lesbar runden. */
  const zeige = (v: number) => {
    if (Math.abs(v) >= 100) return String(Math.round(v));
    if (Math.abs(v) >= 10) return v.toFixed(0);
    return v.toFixed(1);
  };

  // Drei Hilfslinien: oben, Mitte, unten
  const linien = [max, (max + min) / 2, min];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
        {linien.map((wert, i) => (
          <line
            key={`g${i}`}
            x1={0}
            x2={w}
            y1={y(wert)}
            y2={y(wert)}
            stroke="var(--border-muted)"
            strokeWidth={1}
            strokeDasharray={i === 1 ? '2 3' : undefined}
            opacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon points={flaeche} fill={color ?? 'var(--simple-accent)'} opacity={0.12} />
        <polyline
          points={punkte}
          fill="none"
          stroke={color ?? 'var(--simple-accent)'}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {zielY !== null && (
          <line
            x1={0}
            x2={w}
            y1={zielY}
            y2={zielY}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Beschriftung der Achse — rechts neben der Kurve, damit nichts verdeckt wird */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between pl-1 text-[9px] leading-none text-[var(--text-muted)]"
        style={{ height: h }}
      >
        <span>{zeige(max)}{einheit ? ` ${einheit}` : ''}</span>
        <span className="opacity-70">{zeige((max + min) / 2)}</span>
        <span>{zeige(min)}{einheit ? ` ${einheit}` : ''}</span>
      </div>
    </div>
  );
}

/** Fortschrittsring klein, für Karten. */
export function MiniRing({ value, max, size = 44 }: { value: number; max: number; size?: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-muted)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--simple-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * ratio} ${c}`}
        className="transition-[stroke-dasharray] duration-500"
      />
    </svg>
  );
}

/** Fortschrittsbalken mit Beschriftung. */
export function ProgressBar({
  value,
  max,
  label,
  right,
}: {
  value: number;
  max: number;
  label?: string;
  right?: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      {(label || right) && (
        <div className="mb-1 flex justify-between text-[11px] font-medium">
          <span className="text-[var(--text-muted)]">{label}</span>
          <span className="tabular-nums text-[var(--text-muted)]">{right}</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border-muted)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${ratio * 100}%`, background: 'var(--simple-accent)' }}
        />
      </div>
    </div>
  );
}

/** Leerer Zustand mit Handlungsaufforderung. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-[var(--text-muted)] opacity-60">{icon}</div>}
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] text-[var(--text-muted)]">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
