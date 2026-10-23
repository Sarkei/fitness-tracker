import { AlertCircle, RefreshCw } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';

type Props = {
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export default function CoachStaleReportBanner({ onRegenerate, regenerating }: Props) {
  const { t } = useI18n();
  return (
    <div
      data-testid="coach-stale-banner"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex gap-2 flex-1">
        <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-amber-900 leading-relaxed">{t('coach.report.staleHint')}</p>
      </div>
      {onRegenerate && (
        <button
          type="button"
          data-testid="coach-regenerate-report"
          disabled={regenerating}
          onClick={onRegenerate}
          className="flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
          {t('coach.report.regenerate')}
        </button>
      )}
    </div>
  );
}
