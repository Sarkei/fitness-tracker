import { useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

const WORKOUT_CHIPS = [
  'coach.refine.chip.lessVolume',
  'coach.refine.chip.noKnee',
  'coach.refine.chip.moreCardio',
  'coach.refine.chip.deload',
  'coach.refine.chip.swapExercise',
] as const;

const NUTRITION_CHIPS = [
  'coach.refine.chip.lessSnacks',
  'coach.refine.chip.moreProtein',
  'coach.refine.chip.simplerMeals',
  'coach.refine.chip.lowerCalories',
] as const;

type Props = {
  open: boolean;
  planType: 'workout' | 'nutrition';
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { userRefinement: string; refineScope?: string; day?: string }) => void;
};

export default function CoachRefineSheet({ open, planType, busy, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'full_week' | 'single_day'>('full_week');
  const [day, setDay] = useState('Monday');

  if (!open) return null;

  const chips = planType === 'nutrition' ? NUTRITION_CHIPS : WORKOUT_CHIPS;

  const appendChip = (key: string) => {
    const label = t(key);
    setText((prev) => (prev.trim() ? `${prev.trim()}. ${label}` : label));
  };

  const handleSubmit = () => {
    const userRefinement = text.trim();
    if (!userRefinement) return;
    onSubmit({
      userRefinement,
      refineScope: scope,
      day: scope === 'single_day' ? day : undefined,
    });
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass('bg-black/50')}>
      <div
        data-testid="coach-refine-sheet"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-[var(--card-bg)] shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-muted)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand" />
            <p className="text-sm font-black uppercase tracking-widest">{t('coach.refine.sheetTitle')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-[var(--background)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-xs font-medium text-[var(--text-muted)]">{t('coach.refine.hint')}</p>

          <div className="flex flex-wrap gap-2">
            {chips.map((key) => (
              <button
                key={key}
                type="button"
                data-testid={key === 'coach.refine.chip.lessVolume' ? 'coach-refine-chip-less-volume' : undefined}
                onClick={() => appendChip(key)}
                className="rounded-full border border-[var(--border-muted)] bg-[var(--background)] px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-brand/40"
              >
                {t(key)}
              </button>
            ))}
          </div>

          {planType === 'workout' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope('full_week')}
                className={cn(
                  'flex-1 rounded-xl py-2 text-[9px] font-black uppercase tracking-widest',
                  scope === 'full_week' ? 'ui-mark-selected' : 'bg-[var(--background)] text-[var(--text-muted)]',
                )}
              >
                {t('coach.refine.scopeWeek')}
              </button>
              <button
                type="button"
                onClick={() => setScope('single_day')}
                className={cn(
                  'flex-1 rounded-xl py-2 text-[9px] font-black uppercase tracking-widest',
                  scope === 'single_day' ? 'ui-mark-selected' : 'bg-[var(--background)] text-[var(--text-muted)]',
                )}
              >
                {t('coach.refine.scopeDay')}
              </button>
            </div>
          )}

          {planType === 'workout' && scope === 'single_day' && (
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-bold"
            >
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={t('coach.refine.prompt')}
            className="w-full resize-none rounded-2xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-medium leading-relaxed"
          />
        </div>

        <div className="border-t border-[var(--border-muted)] p-4">
          <button
            type="button"
            data-testid="coach-refine-apply"
            disabled={busy || !text.trim()}
            onClick={handleSubmit}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 ui-btn-brand rounded-2xl text-[10px] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {t('coach.refine.apply')}
          </button>
        </div>
      </div>
    </div>,
  );
}
