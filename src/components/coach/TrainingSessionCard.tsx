/**
 * Einzelne Trainingseinheit — farbiger Rahmen (Kraft/Cardio/Hybrid), klappbar für Details.
 */

import { ChevronDown, ChevronUp, Play, Dumbbell, Bike, Activity, Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  formatCoachDayTitle,
  formatCoachSessionSlot,
  formatCoachSessionType,
} from '@/src/lib/coachScheduleDisplay';
import {
  coachSessionCardClasses,
  coachSessionKind,
  type CoachSessionKind,
} from '@/src/lib/coachScheduleGrouping';
import { coachRowHasExercises } from '@/src/lib/coachTemplateMappers';

type Props = {
  session: Record<string, unknown>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isToday?: boolean;
  onStart?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
};

function getTrainingTypeIcons(session: Record<string, unknown>) {
  const sessionType = String(session.sessionType || '').toLowerCase();
  const hasWorkout = coachRowHasExercises(session);
  const hasCardio =
    !!session.cardio ||
    /cardio|interval|run|ride|bike|swim|row|aerobic|tempo|endurance|hiit/.test(sessionType);

  return { hasWorkout, hasCardio };
}

function kindLabelColor(kind: CoachSessionKind): string {
  if (kind === 'cardio') return 'text-cyan-600 dark:text-cyan-400';
  if (kind === 'hybrid') return 'text-teal-600 dark:text-teal-400';
  if (kind === 'strength') return 'text-violet-600 dark:text-violet-400';
  return 'text-[var(--text-muted)]';
}

export default function TrainingSessionCard({
  session,
  t,
  isToday,
  onStart,
  expanded,
  onExpand,
  children,
}: Props) {
  const kind = coachSessionKind(session);
  const title = formatCoachDayTitle(
    session as { isRest?: boolean; title?: string; sessionType?: string },
    t,
  );
  const slot = formatCoachSessionSlot(String(session.sessionSlot || ''), t);
  const typeLabel = formatCoachSessionType(String(session.sessionType || ''), t);
  const { hasWorkout, hasCardio } = getTrainingTypeIcons(session);
  const isExpanded = expanded ?? false;
  const canExpand = Boolean(children);
  const duration =
    session.estimatedDuration != null && Number.isFinite(Number(session.estimatedDuration))
      ? Number(session.estimatedDuration)
      : null;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all w-full',
        isExpanded ? 'ring-1 ring-brand/40' : '',
        coachSessionCardClasses(kind),
      )}
    >
      <div className="flex items-start gap-2 p-3 sm:p-3.5">
        <button
          type="button"
          disabled={!canExpand}
          onClick={canExpand ? onExpand : undefined}
          className={cn(
            'flex-1 min-w-0 text-left',
            canExpand && 'hover:opacity-90 transition-opacity',
            !canExpand && 'cursor-default',
          )}
        >
          {slot ? (
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">
              {slot}
            </p>
          ) : null}
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-black uppercase tracking-tight text-sm text-[var(--text-primary)]">{title}</p>
            <div className="flex gap-1 flex-shrink-0">
              {hasWorkout ? (
                <div
                  className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center"
                  title={t('work.type.strength')}
                >
                  <Dumbbell size={12} className="text-violet-600 dark:text-violet-400" />
                </div>
              ) : null}
              {hasCardio ? (
                <div
                  className="w-5 h-5 rounded-md bg-cyan-500/15 flex items-center justify-center"
                  title={t('work.type.cardio')}
                >
                  <Bike size={12} className="text-cyan-600 dark:text-cyan-400" />
                </div>
              ) : null}
              {kind === 'hybrid' ? (
                <div
                  className="w-5 h-5 rounded-md bg-teal-500/15 flex items-center justify-center"
                  title={t('work.type.hybrid')}
                >
                  <Activity size={12} className="text-teal-600 dark:text-teal-400" />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {typeLabel ? (
              <p className={cn('text-[9px] font-black uppercase tracking-widest', kindLabelColor(kind))}>
                {typeLabel}
              </p>
            ) : null}
            {duration != null ? (
              <span className="text-[9px] font-black text-[var(--text-muted)] uppercase inline-flex items-center gap-0.5">
                <Clock size={9} /> {duration}m
              </span>
            ) : null}
          </div>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          {isToday && onStart ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onStart();
              }}
              className="flex shrink-0 items-center gap-1 ui-btn-brand-sm px-2.5 py-1.5 text-[8px] min-h-[36px]"
            >
              <Play size={10} className="fill-white" /> {t('work.start')}
            </button>
          ) : null}
          {canExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? t('profile.cancel') : t('exercise.action.info')}
            >
              {isExpanded ? (
                <ChevronUp size={18} className="text-[var(--text-muted)]" />
              ) : (
                <ChevronDown size={18} className="text-[var(--text-muted)]" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {isExpanded && children ? (
        <div className="px-3 sm:px-3.5 pb-3.5 border-t border-black/5 dark:border-white/5">{children}</div>
      ) : null}
    </div>
  );
}
