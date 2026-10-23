/**
 * Vier Seiten-Tabs als 2×2-Raster (alle auf Mobile sichtbar, kein Horizontal-Scroll).
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type PageTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Tab nicht wählbar (z. B. KI-Coach ohne API-Key). */
  disabled?: boolean;
  disabledTitle?: string;
};

type PageTabGridProps = {
  tabs: PageTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  layoutId?: string;
};

export default function PageTabGrid({ tabs, activeId, onChange, layoutId }: PageTabGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-[var(--border-muted)] pb-3">
      {tabs.map(tab => {
        const active = activeId === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.disabled ? tab.disabledTitle : undefined}
            disabled={tab.disabled}
            onClick={() => {
              if (tab.disabled) return;
              onChange(tab.id);
            }}
            className={cn(
              'relative min-h-[48px] px-3 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all touch-manipulation border',
              tab.disabled && 'opacity-40 cursor-not-allowed hover:border-[var(--border-muted)]',
              active
                ? 'bg-brand/10 border-brand text-[var(--text-primary)]'
                : 'bg-[var(--background)] border-[var(--border-muted)] text-[var(--text-muted)] hover:border-brand/40',
            )}
          >
            <Icon size={16} className={active ? 'text-brand' : undefined} />
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-center leading-tight">
              {tab.label}
            </span>
            {active && layoutId ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
