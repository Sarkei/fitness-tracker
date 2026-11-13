/**
 * ActiveWorkoutBar: Schmale Leiste oben, die während laufendem Workout angezeigt wird.
 * - Zeigt Timer (MM:SS) und Workout-Name
 * - Resume / Minimize / Discard
 * - Versteckt sich während dem Live-Session-Player (html.workout-session-active)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, Play, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useActiveWorkoutSessionOptional } from '@/src/lib/ActiveWorkoutSessionContext';
import { useI18n } from '@/src/lib/i18n';
import {
  clearSessionDraft,
  isSessionDraftAged,
  useSessionDraft,
} from '@/src/lib/sessionDraft';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog';

export default function ActiveWorkoutBar() {
  const ctx = useActiveWorkoutSessionOptional();
  const draft = useSessionDraft();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [sessionUiActive, setSessionUiActive] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const session = ctx?.session ?? null;
  const isActive = ctx?.isActive ?? false;
  /** Nach 24h: Bar aus — Stale-Banner / Recover übernimmt. */
  const draftAged = Boolean(draft && isSessionDraftAged(draft));

  useEffect(() => {
    const sync = () => {
      setSessionUiActive(document.documentElement.classList.contains('workout-session-active'));
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!ctx || !isActive || !session) return;

    const tick = () => {
      const anchor = session.lastSavedAt ?? session.startedAt;
      const sinceAnchor = Math.floor((Date.now() - new Date(anchor).getTime()) / 1000);
      setElapsed((session.elapsedSeconds || 0) + Math.max(0, sinceAnchor));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ctx, isActive, session]);

  useEffect(() => {
    setMinimized(false);
  }, [session?.workoutId, session?.startedAt]);

  useEffect(() => {
    const barActive = Boolean(ctx && isActive && session && !sessionUiActive && !draftAged);
    const expanded = barActive && !minimized;
    const collapsed = barActive && minimized;
    document.documentElement.classList.toggle('active-workout-bar-visible', expanded);
    document.documentElement.classList.toggle('active-workout-bar-minimized', collapsed);
    return () => {
      document.documentElement.classList.remove('active-workout-bar-visible');
      document.documentElement.classList.remove('active-workout-bar-minimized');
    };
  }, [ctx, isActive, session, sessionUiActive, minimized, draftAged]);

  if (!ctx || !isActive || !session || sessionUiActive || draftAged) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleNavigateToWorkout = () => {
    navigate('/workouts', { state: { resumeWorkout: true } });
  };

  const handleDiscard = () => {
    clearSessionDraft();
    ctx.clearSession();
    setDiscardOpen(false);
  };

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label={t('nav.activeWorkout.expand')}
          className="app-workout-bar app-workout-bar--min min-h-[44px] min-w-[72px] px-3 rounded-b-xl bg-brand text-[var(--on-accent)] text-[10px] font-black uppercase tracking-widest touch-manipulation flex items-center justify-center"
        >
          {timeStr}
        </button>
        <ConfirmDialog
          open={discardOpen}
          title={t('nav.activeWorkout.discardConfirmTitle')}
          message={t('nav.activeWorkout.discardConfirmBody')}
          confirmLabel={t('nav.activeWorkout.discard')}
          variant="danger"
          onCancel={() => setDiscardOpen(false)}
          onConfirm={handleDiscard}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={cn('app-workout-bar bg-brand')}
      >
        <div className="h-14 px-2 sm:px-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/15 text-[var(--on-accent)]/90 touch-manipulation"
            aria-label={t('nav.activeWorkout.minimize')}
          >
            <ChevronUp size={20} />
          </button>

          <button
            type="button"
            onClick={handleNavigateToWorkout}
            className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-left touch-manipulation min-h-[44px]"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 shrink-0 text-[var(--on-accent)]">
              <Play size={16} className="fill-current" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[var(--on-accent)] font-black uppercase tracking-tight text-xs truncate">
                {session.workoutName || t('work.today.resume')}
              </p>
              <p className="text-[var(--on-accent)]/85 text-[11px] font-bold tracking-wide tabular-nums">{timeStr}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="shrink-0 min-h-[44px] min-w-[44px] px-2 rounded-xl hover:bg-white/15 text-[var(--on-accent)]/90 touch-manipulation flex items-center justify-center"
            aria-label={t('nav.activeWorkout.discard')}
          >
            <X size={18} />
          </button>

          <button
            type="button"
            onClick={handleNavigateToWorkout}
            className="shrink-0 min-h-[44px] px-3 rounded-xl bg-white/20 hover:bg-white/30 text-[var(--on-accent)] font-black uppercase text-[10px] tracking-widest transition-colors touch-manipulation"
          >
            {t('work.resume')}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={discardOpen}
        title={t('nav.activeWorkout.discardConfirmTitle')}
        message={t('nav.activeWorkout.discardConfirmBody')}
        confirmLabel={t('nav.activeWorkout.discard')}
        variant="danger"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={handleDiscard}
      />
    </>
  );
}
