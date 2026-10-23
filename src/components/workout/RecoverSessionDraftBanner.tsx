import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/lib/AuthContext';
import { useWorkouts, useCoachPlans } from '@/src/lib/AppDataContext';
import { useI18n } from '@/src/lib/i18n';
import {
  findRecoverableSessionDraft,
  recoverSessionDraftToWorkout,
  type RecoverableSessionDraft,
} from '@/src/lib/sessionDraftRecovery';
import { SESSION_DRAFT_CHANGED_EVENT } from '@/src/lib/sessionDraft';

export default function RecoverSessionDraftBanner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { workouts, addWorkout, refetch } = useWorkouts();
  const { coachPlans } = useCoachPlans();
  const [recovery, setRecovery] = useState<RecoverableSessionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setRecovery(null);
      return;
    }
    const found = await findRecoverableSessionDraft(workouts);
    setRecovery(found);
  }, [user?.uid, workouts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onDraft = () => void refresh();
    window.addEventListener(SESSION_DRAFT_CHANGED_EVENT, onDraft);
    return () => window.removeEventListener(SESSION_DRAFT_CHANGED_EVENT, onDraft);
  }, [refresh]);

  const handleRecover = async () => {
    if (!recovery || !user?.uid) return;
    setBusy(true);
    setError('');
    try {
      const activeCoach = coachPlans.find(
        p => p.type === 'workout' && (p.status === 'active' || p.status === 'paused'),
      );
      await recoverSessionDraftToWorkout(recovery, user.uid, addWorkout, {
        coachPlanId: activeCoach?.id,
        weekNumber:
          typeof activeCoach?.current_week === 'number' ? activeCoach.current_week : undefined,
      });
      setRecovery(null);
      setDismissed(true);
      await refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (dismissed || !recovery) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:px-5 sm:py-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
              {t('work.recover.badge')}
            </p>
            <p className="text-sm font-bold text-[var(--text-primary)] mt-1">
              {t('work.recover.title', { name: recovery.label })}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
              {t('work.recover.hint', {
                sets: recovery.completedSetCount,
                min: recovery.durationMinutes,
                day: recovery.dayKey,
              })}
            </p>
            {error ? (
              <p className="text-[11px] text-red-600 dark:text-red-400 font-bold mt-2">{error}</p>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDismissed(true)}
              className="min-h-[44px] px-4 rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {t('work.recover.dismiss')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRecover()}
              className="min-h-[44px] px-4 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {t('work.recover.action')}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
