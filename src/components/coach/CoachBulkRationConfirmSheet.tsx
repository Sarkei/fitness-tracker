import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import { X, Save, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  mealCount: number;
  busy?: boolean;
  progress?: { current: number; total: number } | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function CoachBulkRationConfirmSheet({
  open,
  mealCount,
  busy,
  progress,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  if (!open) return null;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : busy
        ? 5
        : 0;

  return overlayPortal(
    <div className={mobileSheetOverlayClass('bg-black/50')}>
      <div className="w-full max-w-md rounded-t-[2rem] bg-[var(--card-bg)] p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-black uppercase tracking-widest">{t('coach.bulkRation.title')}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 hover:bg-[var(--background)] disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm font-medium leading-relaxed text-[var(--text-muted)]">
          {t('coach.prompt.saveMeals', { n: mealCount })}
        </p>

        {busy && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              <span>
                {progress
                  ? t('coach.bulkRation.progress', { current: progress.current, total: progress.total })
                  : t('coach.bulkRation.starting')}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border-muted)]">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest"
          >
            {busy ? t('coach.bulkRation.cancel') : t('coach.wk.reorderCancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 min-h-[44px] ui-btn-brand text-[10px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('coach.bulkRation.confirm')}
          </button>
        </div>
      </div>
    </div>,
  );
}
