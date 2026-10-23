import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type Props = {
  open: boolean;
  title: string;
  label: string;
  defaultValue: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

export default function CoachNamePromptSheet({
  open,
  title,
  label,
  defaultValue,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  return overlayPortal(
    <div className={mobileSheetOverlayClass('bg-black/50')}>
      <div className="w-full max-w-md rounded-t-[2rem] bg-[var(--card-bg)] p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-black uppercase tracking-widest">{title}</p>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-[var(--background)]">
            <X size={18} />
          </button>
        </div>
        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-muted)] text-[10px] font-black uppercase tracking-widest"
          >
            {t('coach.wk.reorderCancel')}
          </button>
          <button
            type="button"
            disabled={busy || !value.trim()}
            onClick={() => onConfirm(value.trim())}
            className="flex-1 min-h-[44px] ui-btn-brand text-[10px] disabled:opacity-50"
          >
            {t('coach.namePrompt.save')}
          </button>
        </div>
      </div>
    </div>,
  );
}
