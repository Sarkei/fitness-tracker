/**
 * Kompakter farbiger Kasten pro Einheit (nur Kraft oder Cardio), mit Uhrzeit-Slot.
 */

import { ChevronDown, ChevronUp, Play, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  coachDisplayCardClasses,
  coachSessionDisplayKind,
} from '@/src/lib/coachScheduleGrouping';
import {
  formatCoachDayTitle,
  formatCoachSessionSlot,
} from '@/src/lib/coachScheduleDisplay';

type Props = {
  session: Record<string, unknown>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isToday?: boolean;
  /** Start vs. Fortsetzen (laufender Draft für diese Einheit). */
  startMode?: 'start' | 'resume';
  onStart?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
  children?: React.ReactNode;
};

export default function CoachWeekSessionChip({
  session,
  t,
  isToday,
  startMode = 'start',
  onStart,
  expanded = false,
  onExpand,
  children,
}: Props) {
  const displayKind = coachSessionDisplayKind(session);
  const title = formatCoachDayTitle(
    session as { isRest?: boolean; title?: string; sessionType?: string },
    t,
  );
  const slotRaw = String(session.sessionSlot || '').trim();
  const slot = slotRaw ? formatCoachSessionSlot(slotRaw, t) : '';
  const duration =
    session.estimatedDuration != null && Number.isFinite(Number(session.estimatedDuration))
      ? Number(session.estimatedDuration)
      : null;
  const canExpand = Boolean(children && onExpand);

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          'rounded-xl border transition-all w-full overflow-hidden',
          coachDisplayCardClasses(displayKind),
          expanded && 'ring-1 ring-brand/35',
        )}
      >
        <div className="flex items-stretch gap-2 p-2.5 sm:p-3">
          <button
            type="button"
            disabled={!canExpand}
            onClick={canExpand ? onExpand : undefined}
            className={cn(
              'flex-1 min-w-0 text-left',
              canExpand && 'hover:opacity-90 transition-opacity',
            )}
          >
            {slot ? (
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] mb-0.5">
                {slot}
              </p>
            ) : null}
            <p className="font-black uppercase tracking-tight text-sm text-[var(--text-primary)] leading-snug line-clamp-2">
              {title}
            </p>
            {duration != null ? (
              <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5 inline-flex items-center gap-0.5">
                <Clock size={9} aria-hidden />
                {duration} min
              </p>
            ) : null}
          </button>

          <div className="flex flex-col justify-center gap-1 flex-shrink-0">
            {onStart ? (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onStart();
                }}
                className={cn(
                  'flex items-center justify-center gap-1 px-2 py-1.5 text-[8px] min-h-[32px] min-w-[32px]',
                  startMode === 'resume'
                    ? 'rounded-lg border-2 border-brand bg-brand/15 text-brand font-black uppercase'
                    : 'ui-btn-brand-sm',
                )}
                title={t(startMode === 'resume' ? 'work.resume' : 'work.start')}
              >
                {startMode === 'resume' ? (
                  <RotateCcw size={11} className="shrink-0" />
                ) : (
                  <Play size={11} className="fill-white shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {t(startMode === 'resume' ? 'work.resume' : 'work.start')}
                </span>
              </button>
            ) : null}
            {canExpand ? (
              <button
                type="button"
                onClick={onExpand}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 mx-auto"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronUp size={16} className="text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown size={16} className="text-[var(--text-muted)]" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        {expanded && children ? (
          <div className="px-2.5 sm:px-3 pb-3 border-t border-black/5 dark:border-white/10 bg-[var(--card-bg)]/40">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
