import { Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  MEAL_ANALYZE_PHASES_TEXT,
  type MealAnalyzePhase,
} from '@/src/lib/mealAnalyzeProgress';
import { useI18n } from '@/src/lib/i18n';

const PHASE_TARGET_PCT: Record<MealAnalyzePhase, number> = {
  interpret: 22,
  off_search: 46,
  match: 74,
  alternatives: 90,
  finalize: 100,
};

type Props = {
  progressPct: number;
  activePhase: MealAnalyzePhase | null;
  /** z. B. „KI arbeitet…“ */
  title: string;
  onCancel: () => void;
  className?: string;
};

export default function AiMealAnalyzeProgressPanel({
  progressPct,
  activePhase,
  title,
  onCancel,
  className,
}: Props) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.max(0, progressPct));

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-4 space-y-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin text-brand shrink-0" size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            {title}
          </p>
          <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5 truncate">
            {activePhase
              ? t(`nut.foodLog.aiPhase.${activePhase}` as 'nut.foodLog.aiPhase.interpret')
              : t('nut.foodLog.aiPhase.start')}
          </p>
        </div>
        <span className="text-sm font-black tabular-nums text-brand shrink-0">{Math.round(pct)}%</span>
      </div>
      <div
        className="h-2.5 w-full rounded-full bg-[var(--border-muted)] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {MEAL_ANALYZE_PHASES_TEXT.map(phase => {
          const target = PHASE_TARGET_PCT[phase];
          const done = pct >= target;
          const active = activePhase === phase;
          return (
            <li
              key={phase}
              className={cn(
                'flex items-center gap-2 text-[9px] font-black uppercase tracking-widest',
                done
                  ? 'text-brand'
                  : active
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] opacity-50',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  done ? 'bg-brand' : active ? 'bg-brand animate-pulse' : 'bg-[var(--border-muted)]',
                )}
              />
              {t(`nut.foodLog.aiPhase.${phase}` as 'nut.foodLog.aiPhase.interpret')}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        className="w-full min-h-[44px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-red-500/40 hover:text-red-500 touch-manipulation"
      >
        {t('nut.foodLog.cancel')}
      </button>
    </div>
  );
}
