import { useState } from 'react';
import { motion } from 'motion/react';
import { Heart, Activity } from 'lucide-react';
import type { CardioSessionFeedback } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

interface Props {
  open: boolean;
  onSubmit: (feedback: CardioSessionFeedback) => void;
  onSkip: () => void;
  hasCardio?: boolean;
}

export default function CardioSessionFeedbackModal({ open, onSubmit, onSkip, hasCardio = true }: Props) {
  const { t } = useI18n();
  const [rpe, setRpe] = useState<number | ''>('');
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [maxHr, setMaxHr] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  useMobileOverlaySheet(open);

  if (!open) return null;

  const parseHr = (v: number | '') => (typeof v === 'number' && v > 0 ? v : undefined);

  return overlayPortal(
    <div className={mobileSheetOverlayClass()}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onSkip}
      />
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface-2 p-6 space-y-5 shadow-2xl"
      >
        <div className="text-center space-y-1">
          <Activity className="mx-auto text-brand" size={28} />
          <h3 className="text-lg font-black uppercase tracking-tight">{t('workout.cardioFeedback.title')}</h3>
          <p className="text-[10px] font-bold text-muted uppercase tracking-widest leading-relaxed">
            {t('workout.cardioFeedback.subtitle')}
          </p>
        </div>

        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 block">
            {t('workout.cardioFeedback.rpe')}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(n)}
                className={`min-h-[44px] rounded-xl text-sm font-black ${
                  rpe === n ? 'ui-mark-selected' : 'bg-surface text-muted border border-line'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {hasCardio ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 flex items-center gap-1">
                <Heart size={12} /> {t('workout.cardioFeedback.hrAvg')}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={40}
                max={220}
                placeholder="145"
                value={avgHr}
                onChange={e => setAvgHr(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                className="w-full min-h-[48px] text-center text-xl font-black bg-surface border border-line rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 flex items-center gap-1">
                <Heart size={12} /> {t('workout.cardioFeedback.hrMax')}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={40}
                max={230}
                placeholder="168"
                value={maxHr}
                onChange={e => setMaxHr(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                className="w-full min-h-[48px] text-center text-xl font-black bg-surface border border-line rounded-xl text-[var(--ink)] focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 block">
            {t('workout.cardioFeedback.notes')}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-surface border border-line text-sm text-[var(--ink)] p-3 focus:ring-2 focus:ring-brand focus:outline-none resize-none"
            placeholder={t('workout.cardioFeedback.notesPlaceholder')}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 min-h-[48px] rounded-xl bg-surface text-[10px] font-black uppercase tracking-widest text-muted"
          >
            {t('workout.cardioFeedback.skip')}
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                perceivedEffort: typeof rpe === 'number' ? rpe : undefined,
                avgHeartRate: hasCardio ? parseHr(avgHr) : undefined,
                maxHeartRate: hasCardio ? parseHr(maxHr) : undefined,
                notes: notes.trim() || undefined,
              })
            }
            className="flex-1 min-h-[48px] rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
          >
            {t('workout.cardioFeedback.save')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
