import { Play, Dumbbell, Bike } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  formatCoachDayTitle,
  formatCoachSessionSlot,
  formatCoachSessionType,
} from '@/src/lib/coachScheduleDisplay';
import { coachSessionCardClasses, coachSessionKind } from '@/src/lib/coachScheduleGrouping';
import { coachRowHasExercises } from '@/src/lib/coachTemplateMappers';

type Props = {
  session: Record<string, unknown>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isToday?: boolean;
  onStart?: () => void;
  compact?: boolean;
};

function getTrainingTypeIcons(session: Record<string, unknown>) {
  const sessionType = String(session.sessionType || '').toLowerCase();
  const hasWorkout = coachRowHasExercises(session);
  const hasCardio =
    !!session.cardio ||
    /cardio|interval|run|ride|bike|swim|row|aerobic|tempo|endurance|hiit/.test(sessionType);

  return { hasWorkout, hasCardio };
}

export default function CoachSessionCard({ session, t, isToday, onStart, compact }: Props) {
  const kind = coachSessionKind(session);
  const title = formatCoachDayTitle(
    session as { isRest?: boolean; title?: string; sessionType?: string },
    t,
  );
  const slot = formatCoachSessionSlot(String(session.sessionSlot || ''), t);
  const typeLabel = formatCoachSessionType(String(session.sessionType || ''), t);
  const { hasWorkout, hasCardio } = getTrainingTypeIcons(session);

  return (
    <div
      className={cn(
        'rounded-xl border transition-colors w-full',
        coachSessionCardClasses(kind),
        compact ? 'p-2.5' : 'p-3',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {slot ? (
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">
              {slot}
            </p>
          ) : null}
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-black uppercase tracking-tight text-sm text-[var(--text-primary)] truncate">
              {title}
            </p>
            {/* Training type icons */}
            <div className="flex gap-0.5 flex-shrink-0">
              {hasWorkout && (
                <div
                  className="w-4 h-4 rounded-sm bg-violet-500/20 flex items-center justify-center flex-shrink-0"
                  title="Krafttraining"
                >
                  <Dumbbell size={10} className="text-violet-600 dark:text-violet-400" />
                </div>
              )}
              {hasCardio && (
                <div
                  className="w-4 h-4 rounded-sm bg-cyan-500/20 flex items-center justify-center flex-shrink-0"
                  title="Ausdauer"
                >
                  <Bike size={10} className="text-cyan-600 dark:text-cyan-400" />
                </div>
              )}
            </div>
          </div>
          {typeLabel ? (
            <p
              className={cn(
                'text-[9px] font-black uppercase tracking-widest mt-0.5',
                kind === 'cardio' ? 'text-cyan-600 dark:text-cyan-400' : 'text-violet-600 dark:text-violet-400',
              )}
            >
              {typeLabel}
            </p>
          ) : null}
        </div>
        {isToday && onStart ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onStart();
            }}
            className="flex shrink-0 items-center gap-1 ui-btn-brand-sm px-2 py-1 text-[8px]"
          >
            <Play size={9} className="fill-white" /> {t('coach.day.start')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
