import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '@/src/lib/i18n';
import { cn } from '@/src/lib/utils';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { idea: string; allergies: string; yieldsPortions?: number }) => void;
};

export default function AiRecipeDraftModal({ open, busy, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const [idea, setIdea] = useState('');
  const [allergies, setAllergies] = useState('');
  const [yields, setYields] = useState('');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = idea.trim();
    if (!trimmed || busy) return;
    let yieldsPortions: number | undefined;
    const y = yields.trim();
    if (y) {
      const n = parseInt(y, 10);
      if (!Number.isNaN(n) && n > 0) yieldsPortions = Math.min(999, n);
    }
    onSubmit({ idea: trimmed, allergies: allergies.trim(), yieldsPortions });
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass('lg:p-6')}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 w-full max-w-md bg-[var(--card-bg)] rounded-t-[2rem] lg:rounded-[2rem] border border-[var(--border-muted)] p-6 lg:p-8 shadow-2xl"
      >
        <div className="flex justify-between items-start gap-3 mb-6">
          <h3 className="text-lg font-black italic uppercase tracking-tighter">{t('nut.tmpl.aiRecipe')}</h3>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 rounded-xl hover:bg-[var(--background)]" aria-label={t('nut.mission.close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.tmpl.aiPromptIdea')}</label>
            <textarea
              required
              rows={3}
              value={idea}
              onChange={e => setIdea(e.target.value)}
              className="mt-2 w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-medium text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.tmpl.aiPromptAllergies')}</label>
            <input
              value={allergies}
              onChange={e => setAllergies(e.target.value)}
              className="mt-2 w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-sm"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('nut.tmpl.aiPromptYields')}</label>
            <input
              type="number"
              min={1}
              max={999}
              value={yields}
              onChange={e => setYields(e.target.value)}
              className="mt-2 w-full bg-[var(--background)] border border-[var(--border-muted)] rounded-xl p-4 font-bold text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !idea.trim()}
            className={cn(
              'w-full min-h-[48px] rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50',
            )}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? t('work.aiGen.generating') : t('nut.tmpl.aiRecipe')}
          </button>
        </form>
      </motion.div>
    </div>,
  );
}
