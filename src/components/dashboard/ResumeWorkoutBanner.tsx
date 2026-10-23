/**
 * Dashboard: laufendes Workout aus Session-Draft fortsetzen oder verwerfen.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';
import { Dumbbell, RotateCcw, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { useWorkouts } from '@/src/lib/AppDataContext';
import { useActiveWorkoutSessionOptional } from '@/src/lib/ActiveWorkoutSessionContext';
import {
  clearSessionDraft,
  fetchSessionDraftFromServer,
  hasResumableSessionDraft,
  isSessionDraftAged,
  isSessionDraftStale,
  reconcileSessionDraft,
  useSessionDraft,
} from '@/src/lib/sessionDraft';

export default function ResumeWorkoutBanner({ className }: { className?: string }) {
  const draft = useSessionDraft();
  const { workouts } = useWorkouts();
  const activeSession = useActiveWorkoutSessionOptional();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const dfLocale = locale === 'de' ? dfDe : dfEnUS;
  const [reconciled, setReconciled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reconcileSessionDraft(workouts);
      if (!cancelled) setReconciled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workouts]);

  useEffect(() => {
    if (!reconciled) return;
    void fetchSessionDraftFromServer(workouts);
  }, [reconciled, workouts]);

  // ActiveWorkoutBar deckt frische Drafts ab — Banner für aged/stale (Dismiss + optional Resume)
  if (!reconciled || !hasResumableSessionDraft(draft)) return null;

  const name = draft!.workoutMeta.name?.trim() || t('workout.new');
  const dateIso = draft!.workoutMeta.date ?? draft!.startedAt ?? draft!.savedAt;
  const dateLabel = format(new Date(dateIso), 'PP', { locale: dfLocale });
  const aged = isSessionDraftAged(draft!);
  const stale = aged || isSessionDraftStale(draft!, workouts);

  if (!stale && activeSession?.isActive) return null;

  const handleDismiss = () => {
    clearSessionDraft();
    activeSession?.clearSession();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-[var(--card-bg)] rounded-2xl md:rounded-[2rem] border-2 shadow-sm',
        stale ? 'border-amber-500/40 shadow-amber-500/10' : 'border-brand/40 shadow-brand/10',
        'p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4',
        className,
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
        <div
          className={cn(
            'h-11 w-11 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center flex-shrink-0',
            stale ? 'bg-amber-500/15 text-amber-500' : 'bg-brand/15 text-brand',
          )}
        >
          <Dumbbell size={20} aria-hidden />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-[9px] font-black uppercase tracking-[0.2em] mb-0.5',
              stale ? 'text-amber-600 dark:text-amber-400' : 'text-brand',
            )}
          >
            {stale ? t('dash.resume.staleLabel') : t('dash.resume.label')}
          </p>
          <p className="font-black italic uppercase tracking-tight text-sm sm:text-base truncate">{name}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5 truncate">
            {dateLabel}
          </p>
          {stale ? (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
              {t('dash.resume.staleHint')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto sm:min-w-[140px] shrink-0">
        {!stale ? (
          <button
            type="button"
            onClick={() => navigate('/workouts', { state: { resumeWorkout: true } })}
            className="flex-1 sm:flex-none min-h-[44px] px-3 sm:px-4 py-2.5 rounded-xl border-2 border-brand bg-brand/10 text-brand font-black uppercase tracking-widest text-[9px] sm:text-[10px] flex items-center justify-center gap-1.5 hover:bg-brand/20 transition-colors touch-manipulation"
          >
            <RotateCcw size={14} className="shrink-0" />
            <span>{t('work.resume')}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          className={cn(
            'flex-1 sm:flex-none min-h-[44px] px-3 sm:px-4 py-2.5 rounded-xl border-2 font-black uppercase tracking-widest text-[9px] sm:text-[10px] flex items-center justify-center gap-1.5 transition-colors touch-manipulation',
            stale
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
              : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-muted)] hover:border-red-500/40 hover:text-red-500',
          )}
        >
          <X size={14} className="shrink-0" />
          <span>{t('dash.resume.dismiss')}</span>
        </button>
      </div>
    </motion.div>
  );
}
