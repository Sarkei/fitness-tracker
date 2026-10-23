import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type Props = {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export default function ErrorBanner({ message, onRetry, retryLabel, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm font-bold text-red-700 dark:text-red-300 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 flex min-h-[40px] items-center gap-2 ui-btn-brand px-4 text-[9px]"
        >
          <RefreshCw size={12} />
          {retryLabel ?? 'Retry'}
        </button>
      )}
    </div>
  );
}
