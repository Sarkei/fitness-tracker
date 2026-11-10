import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-5 ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{children}</h2>
      {action}
    </div>
  );
}

export function Ring({
  value,
  max,
  label,
  unit,
  size = 148,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  size?: number;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-muted)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tracking-tighter">{Math.round(value)}</span>
        <span className="text-[11px] font-medium text-[var(--text-muted)]">von {Math.round(max)} {unit}</span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
      </div>
    </div>
  );
}

export function MacroBar({ label, value, max, unit = 'g' }: { label: string; value: number; max: number; unit?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-semibold">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span>
          {Math.round(value)}
          <span className="text-[var(--text-muted)]">/{Math.round(max)}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-40 ${
        full ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  );
}
