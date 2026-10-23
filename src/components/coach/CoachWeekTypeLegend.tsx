/**
 * Legende: nur Kraft (violett) und Cardio (cyan) für die Wochenübersicht.
 */

import { cn } from '@/src/lib/utils';
import { coachDisplayCardClasses } from '@/src/lib/coachScheduleGrouping';

type Props = {
  strengthLabel: string;
  cardioLabel: string;
  className?: string;
};

export default function CoachWeekTypeLegend({ strengthLabel, cardioLabel, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 text-[9px] font-black uppercase tracking-widest',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-violet-700 dark:text-violet-300">
        <span className={cn('w-4 h-4 rounded-md border', coachDisplayCardClasses('strength'))} aria-hidden />
        {strengthLabel}
      </span>
      <span className="inline-flex items-center gap-2 text-cyan-700 dark:text-cyan-300">
        <span className={cn('w-4 h-4 rounded-md border', coachDisplayCardClasses('cardio'))} aria-hidden />
        {cardioLabel}
      </span>
    </div>
  );
}
