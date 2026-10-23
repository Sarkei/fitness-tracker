/**
 * In-App-Bestätigung (ersetzt window.confirm).
 */

import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileDialogOverlayClass,
  MOBILE_OVERLAY_Z_CLASS,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  onCancel: () => void;
  onConfirm: () => void;
  zIndexClass?: string;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel,
  confirmLabel,
  variant = 'default',
  onCancel,
  onConfirm,
  zIndexClass = 'z-[110]',
}: ConfirmDialogProps) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const cancel = cancelLabel ?? t('profile.cancel');
  const confirm = confirmLabel ?? t('common.confirm');

  if (!open) return null;

  return overlayPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(mobileDialogOverlayClass('bg-black/70 backdrop-blur-sm'), zIndexClass)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[var(--card-bg)] border border-[var(--border-muted)] p-6 sm:p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl"
          >
            <h3
              id="confirm-dialog-title"
              className="text-lg sm:text-xl font-black uppercase tracking-tight text-[var(--text-primary)] mb-2"
            >
              {title}
            </h3>
            {message ? (
              <p className="text-[var(--text-muted)] text-sm mb-8 leading-relaxed">{message}</p>
            ) : (
              <div className="mb-6" />
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)] font-black uppercase tracking-widest text-[10px] rounded-xl hover:border-brand transition-colors touch-manipulation"
              >
                {cancel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  'flex-1 min-h-[48px] font-black uppercase tracking-widest text-[10px] rounded-xl touch-manipulation transition-colors',
                  variant === 'danger'
                    ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20'
                    : 'ui-btn-brand',
                )}
              >
                {confirm}
              </button>
            </div>
          </motion.div>
        </motion.div>,
  );
}
