import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
};

export default function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] p-10 md:p-12 text-center space-y-4',
        className,
      )}
    >
      {Icon && (
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--background)] border border-[var(--border-muted)] flex items-center justify-center">
          <Icon size={28} className="text-[var(--text-muted)]" />
        </div>
      )}
      <div className="space-y-2">
        <p className="text-lg font-black italic uppercase tracking-tighter text-[var(--text-primary)]">{title}</p>
        {description && (
          <p className="text-sm text-[var(--text-muted)] font-medium max-w-md mx-auto leading-relaxed">{description}</p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-[44px] items-center gap-2 ui-btn-brand px-6 rounded-xl text-[10px] font-black uppercase tracking-widest"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
