import { mobileSheetOverlayClass, useMobileOverlaySheet } from '@/src/lib/mobileViewport';
import type { SetDetail } from '@/src/types';
import { SET_TYPE_CYCLE } from '@/src/lib/workoutSessionUtils';

type Props = {
  open: boolean;
  current: SetDetail['type'];
  setNumber: number;
  onClose: () => void;
  onPick: (type: SetDetail['type']) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function labelFor(type: SetDetail['type'], t: (k: string) => string): string {
  if (type === 'warmup') return t('workout.session.type.warmup');
  if (type === 'dropset') return t('workout.session.type.dropset');
  if (type === 'failure') return t('workout.session.type.failure');
  return t('workout.session.type.normal');
}

function hintFor(type: SetDetail['type'], t: (k: string) => string): string {
  if (type === 'warmup') return t('workout.session.typeHint.warmup');
  if (type === 'dropset') return t('workout.session.typeHint.dropset');
  if (type === 'failure') return t('workout.session.typeHint.failure');
  return t('workout.session.typeHint.normal');
}

export default function SetTypePickerSheet({ open, current, setNumber, onClose, onPick, t }: Props) {
  useMobileOverlaySheet(open);
  if (!open) return null;

  return (
    <div className={mobileSheetOverlayClass()} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-2 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-neutral-500">
          {t('workout.session.setTypePicker.title', { n: String(setNumber) })}
        </p>
        {SET_TYPE_CYCLE.map(type => (
          <button
            key={type}
            type="button"
            onClick={() => {
              onPick(type);
              onClose();
            }}
            className={`w-full min-h-[52px] px-4 rounded-xl text-left flex flex-col justify-center gap-0.5 touch-manipulation ${
              current === type ? 'bg-brand/15 ring-1 ring-brand/40' : 'hover:bg-neutral-800'
            }`}
          >
            <span className="text-sm font-black text-white">{labelFor(type, t)}</span>
            <span className="text-[11px] text-neutral-500">{hintFor(type, t)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] mt-1 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-800"
        >
          {t('workout.session.resume')}
        </button>
      </div>
    </div>
  );
}
