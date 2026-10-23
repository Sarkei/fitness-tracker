import { useState } from 'react';
import { X, Loader2, MapPin, Clock } from 'lucide-react';
import { useI18n } from '@/src/lib/i18n';
import { cn } from '@/src/lib/utils';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

const EQUIPMENT_IDS = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'kettlebells',
  'pull_up_bar',
  'resistance_bands',
  'full_home_gym',
  'commercial_gym',
] as const;

type Props = {
  open: boolean;
  busy: boolean;
  defaultDuration?: number;
  defaultEquipment?: string[];
  onClose: () => void;
  onSubmit: (payload: { equipment: string[]; sessionDuration: number; note?: string }) => void;
};

export default function CoachSpontaneousTodaySheet({
  open,
  busy,
  defaultDuration = 60,
  defaultEquipment = [],
  onClose,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const [equipment, setEquipment] = useState<string[]>(defaultEquipment);
  const [duration, setDuration] = useState(defaultDuration);
  const [note, setNote] = useState('');

  if (!open) return null;

  const toggle = (id: string) => {
    setEquipment(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return overlayPortal(
    <div className={mobileSheetOverlayClass('bg-black/50')}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-[var(--card-bg)] shadow-2xl sm:rounded-[2rem]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-muted)] px-6 py-4">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-brand" />
            <p className="text-sm font-black uppercase tracking-widest">{t('coach.spontaneous.title')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full p-2 hover:bg-[var(--background)] disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-xs font-medium leading-relaxed text-[var(--text-muted)]">{t('coach.spontaneous.hint')}</p>

          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('coach.spontaneous.equipment')}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EQUIPMENT_IDS.map(eid => {
                const sel = equipment.includes(eid);
                return (
                  <button
                    key={eid}
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(eid)}
                    className={cn(
                      'min-h-[52px] rounded-2xl border-2 px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest transition-all',
                      sel
                        ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                        : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)] hover:border-brand/50',
                    )}
                  >
                    {t(`coach.onb.equip.${eid}` as 'coach.onb.equip.bodyweight')}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              <Clock size={12} /> {t('coach.spontaneous.duration')}
            </p>
            <div className="flex flex-wrap gap-2">
              {[30, 45, 60, 75, 90].map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => setDuration(n)}
                  className={cn(
                    'min-h-[44px] flex-1 min-w-[4rem] rounded-xl border-2 text-sm font-black transition-all',
                    duration === n
                      ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                      : 'border-[var(--border-muted)] hover:border-brand/50',
                  )}
                >
                  {n}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {t('coach.spontaneous.noteOptional')}
            </p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder={t('coach.spontaneous.notePh')}
              className="w-full resize-none rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        <div className="border-t border-[var(--border-muted)] p-6">
          <button
            type="button"
            disabled={busy || equipment.length === 0}
            onClick={() => onSubmit({ equipment, sessionDuration: duration, note: note.trim() || undefined })}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 ui-btn-brand text-[10px] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('coach.spontaneous.apply')}
          </button>
        </div>
      </div>
    </div>,
  );
}
