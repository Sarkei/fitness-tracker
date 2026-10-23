import { useEffect, useMemo, useState } from 'react';
import { Brain, Loader2, XCircle } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileDialogOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import { cn } from '@/src/lib/utils';
import type { CoachPlanGenerationPhase } from '@/src/services/coachPlanService';

const PHASE_ORDER: CoachPlanGenerationPhase[] = [
  'queued',
  'context',
  'ai',
  'validation',
  'saving',
  'ready',
];

type Props = {
  open: boolean;
  planLabel?: string;
  queueHint?: string;
  phase?: CoachPlanGenerationPhase | null;
  message?: string;
  error?: string | null;
  onCancel: () => void;
  cancelling?: boolean;
};

export default function CoachPlanGenerationModal({
  open,
  planLabel,
  queueHint,
  phase,
  message,
  error,
  onCancel,
  cancelling,
}: Props) {
  const { t } = useI18n();
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const activePhase = phase && phase !== 'failed' ? phase : 'ai';
  const phaseBase =
    typeof activePhase === 'string' && activePhase.startsWith('ai:') ? 'ai' : activePhase;
  const aiAttempt =
    typeof activePhase === 'string' && activePhase.startsWith('ai:')
      ? Math.max(1, parseInt(activePhase.slice(3), 10) || 1)
      : 0;
  const phaseIndex = Math.max(0, PHASE_ORDER.indexOf(phaseBase as (typeof PHASE_ORDER)[number]));

  const steps = useMemo(
    () =>
      PHASE_ORDER.filter(p => p !== 'ready' && p !== 'failed').map((p, i) => ({
        id: p,
        label:
          p === 'ai' && aiAttempt > 0
            ? t('coach.gen.phase.aiAttempt', { n: String(aiAttempt) })
            : t(`coach.gen.phase.${p}` as 'coach.gen.phase.ai'),
        done: phaseIndex > i || activePhase === 'ready',
        active: phaseIndex === i && !error,
      })),
    [phaseIndex, activePhase, aiAttempt, error, t],
  );

  useMobileOverlaySheet(open);
  if (!open) return null;

  return overlayPortal(
    <div
      className={mobileDialogOverlayClass()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-gen-title"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" aria-hidden />
      <div
        className="relative z-10 mx-4 w-full max-w-md rounded-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] p-6 shadow-2xl sm:mx-6 sm:p-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand">
            {error ? <XCircle size={28} /> : <Brain size={28} className={!error ? 'animate-pulse' : ''} />}
          </div>
          <div className="min-w-0 flex-1">
            <p id="coach-gen-title" className="text-lg font-black uppercase italic tracking-tight text-[var(--text-primary)]">
              {error ? t('coach.gen.failedTitle') : t('coach.gen.title')}
            </p>
            {planLabel ? (
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-brand">{planLabel}</p>
            ) : null}
            {queueHint ? (
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{queueHint}</p>
            ) : null}
          </div>
          {!error ? <Loader2 size={22} className="shrink-0 animate-spin text-brand" /> : null}
        </div>

        <p className={cn('mt-4 text-sm font-medium leading-relaxed', error ? 'text-red-600' : 'text-[var(--text-muted)]')}>
          {error || message || t('coach.gen.pollWait')}
        </p>

        {!error && (
          <ul className="mt-5 space-y-2">
            {steps.map(step => (
              <li
                key={step.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
                  step.active
                    ? 'border-brand bg-brand/10 text-brand'
                    : step.done
                      ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400'
                      : 'border-[var(--border-muted)] text-[var(--text-muted)]',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px]',
                    step.done ? 'bg-green-500 text-white' : step.active ? 'border border-brand bg-brand/20 text-brand' : 'bg-[var(--border-muted)]',
                  )}
                >
                  {step.done ? '✓' : step.active ? '…' : ''}
                </span>
                {step.label}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-center text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('coach.gen.elapsed', { sec: elapsedSec })}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={cancelling}
            onClick={onCancel}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-red-300 hover:text-red-600 disabled:opacity-50"
          >
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : null}
            {error ? t('coach.gen.close') : t('coach.gen.cancel')}
          </button>
          {!error && (
            <p className="text-center text-[9px] font-medium text-[var(--text-muted)]">{t('coach.gen.noDismiss')}</p>
          )}
        </div>
      </div>
    </div>,
  );
}
