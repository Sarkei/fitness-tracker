import type { CSSProperties, ReactNode } from 'react';

/** Ruhige Karte im Stil des Meal-Planners: weisse Flaeche, feine Kante, kaum Schatten. */
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
        <span className="text-[11px] text-[var(--text-muted)]">von {Math.round(max)} {unit}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}

export function MacroBar({ label, value, max, unit = 'g' }: { label: string; value: number; max: number; unit?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
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
          style={{ width: `${ratio * 100}%`, background: 'var(--simple-accent)' }}
        />
      </div>
    </div>
  );
}

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
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
