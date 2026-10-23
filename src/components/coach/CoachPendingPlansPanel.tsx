import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';
import { cn } from '@/src/lib/utils';
import { abortCoachPlanCreation } from '@/src/lib/coachPlanCreation';
import {
  waitForCoachPlanGeneration,
  type CoachPlanGenerationPhase,
} from '@/src/services/coachPlanService';

export type PendingCoachPlan = {
  id: string;
  type: 'workout' | 'nutrition';
  discipline?: string;
  generation_status?: 'generating' | 'failed';
  generation_error?: string | null;
};

type Props = {
  plans: PendingCoachPlan[];
  onRefresh: () => void;
  onReady: (planId: string) => void;
  onRetry: () => void;
};

export default function CoachPendingPlansPanel({ plans, onRefresh, onReady, onRetry }: Props) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumePhase, setResumePhase] = useState<CoachPlanGenerationPhase | null>(null);

  const generating = plans.filter(p => p.generation_status === 'generating');
  const failed = plans.filter(p => p.generation_status === 'failed');

  useEffect(() => {
    if (generating.length === 0 || resumeId) return;
    const plan = generating[0];
    if (!plan) return;
    setResumeId(plan.id);
    setResumePhase('queued');
    let cancelled = false;
    void (async () => {
      try {
        await waitForCoachPlanGeneration(plan.id, {
          onTick: state => {
            if (!cancelled && state.phase) setResumePhase(state.phase);
          },
        });
        if (!cancelled) {
          onReady(plan.id);
          setResumeId(null);
          onRefresh();
        }
      } catch {
        if (!cancelled) {
          onRefresh();
          setResumeId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generating.length, generating[0]?.id, resumeId, onReady, onRefresh]);

  if (plans.length === 0) return null;

  const removePlan = async (id: string) => {
    setBusyId(id);
    try {
      await abortCoachPlanCreation(id);
      onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {generating.map(p => (
        <div
          key={p.id}
          className="rounded-2xl border border-brand/30 bg-brand/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Loader2 size={20} className="animate-spin text-brand shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand">
                {t('coach.gen.stillGenerating')}
              </p>
              <p className="text-xs font-medium text-[var(--text-muted)] mt-1">
                {p.type === 'workout' ? t('coach.onb.brand.workout') : t('coach.onb.brand.nutrition')}
                {p.discipline ? ` · ${p.discipline}` : ''}
              </p>
              {resumeId === p.id && resumePhase && (
                <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-1">
                  {t(`coach.gen.phase.${resumePhase}` as 'coach.gen.phase.ai')}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={busyId === p.id}
            onClick={() => void removePlan(p.id)}
            className="shrink-0 min-h-[40px] px-3 rounded-xl border border-[var(--border-muted)] text-[9px] font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 disabled:opacity-50"
          >
            {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : t('coach.gen.cancel')}
          </button>
        </div>
      ))}

      {failed.map(p => (
        <div
          key={p.id}
          className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-400">
                {t('coach.gen.failedCardTitle')}
              </p>
              <p className="text-xs font-medium text-red-800/90 dark:text-red-200/90 mt-1 leading-relaxed">
                {p.generation_error?.trim() || t('coach.gen.failedCardGeneric')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void removePlan(p.id).then(() => onRetry())}
              className="flex min-h-[40px] items-center gap-2 ui-btn-brand px-4 text-[9px] disabled:opacity-50"
            >
              <RefreshCw size={12} /> {t('coach.gen.retry')}
            </button>
            <button
              type="button"
              disabled={busyId === p.id}
              onClick={() => void removePlan(p.id)}
              className="flex min-h-[40px] items-center gap-2 rounded-xl border border-red-200 px-4 text-[9px] font-black uppercase tracking-widest text-red-700 disabled:opacity-50"
            >
              {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('coach.gen.deleteFailed')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
