/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { SleepLogEntry } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import { MobileOverlayRoot, mobileSheetOverlayClass } from '@/src/lib/mobileViewport';

function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function ManualStepsModal({
  open,
  onClose,
  defaultDate,
  initialSteps,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  initialSteps: number;
  onSave: (date: string, steps: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(defaultDate);
  const [steps, setSteps] = useState(String(initialSteps || 0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    setSteps(String(initialSteps || 0));
  }, [open, defaultDate, initialSteps]);

  const submit = async () => {
    const n = Math.max(0, Math.round(parseNum(steps, 0)));
    setBusy(true);
    try {
      await onSave(date, n);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileOverlayRoot open={open}>
        <motion.div
          className={mobileSheetOverlayClass()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label={t('dash.log.close')} onClick={onClose} />
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-none lg:rounded-3xl"
          >
            <div className="max-h-full min-h-0 flex flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] p-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <h3 className="text-sm font-black uppercase italic tracking-tighter text-[var(--text-primary)]">{t('dash.log.steps.title')}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 hover:bg-[var(--background)] active:opacity-90"
                  aria-label={t('dash.log.close')}
                >
                  <X size={20} />
                </button>
              </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pb-2 [-webkit-overflow-scrolling:touch]">
              <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.log.date')}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-base font-bold text-[var(--text-primary)]"
            />
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest block mt-4">{t('dash.log.steps.field')}</label>
            <input
              type="number"
              min={0}
              step={1}
              value={steps}
              onChange={e => setSteps(e.target.value)}
              className="mt-1 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-base font-bold text-[var(--text-primary)]"
            />
            </div>
            <div className="shrink-0 border-t border-[var(--border-muted)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="flex w-full min-h-[52px] touch-manipulation items-center justify-center ui-btn-brand text-[10px] disabled:opacity-50 active:opacity-90"
              >
                {busy ? t('dash.log.saving') : t('dash.log.save')}
              </button>
            </div>
            </div>
          </motion.div>
        </motion.div>
    </MobileOverlayRoot>
  );
}

export function ManualSleepModal({
  open,
  onClose,
  defaultDate,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  initial?: SleepLogEntry;
  onSave: (date: string, entry: SleepLogEntry) => Promise<void>;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(defaultDate);
  const [bedTime, setBedTime] = useState(initial?.bedTime || '');
  const [wakeTime, setWakeTime] = useState(initial?.wakeTime || '');
  const [manualHours, setManualHours] = useState(() =>
    initial?.totalMinutes != null ? String(Math.floor(initial.totalMinutes / 60)) : '7',
  );
  const [manualMins, setManualMins] = useState(() =>
    initial?.totalMinutes != null ? String(initial.totalMinutes % 60) : '30',
  );
  const [deepTime, setDeepTime] = useState(() =>
    initial?.phases?.deep != null ? `${String(Math.floor(initial.phases.deep / 60)).padStart(2, '0')}:${String(initial.phases.deep % 60).padStart(2, '0')}` : '',
  );
  const [lightTime, setLightTime] = useState(() =>
    initial?.phases?.light != null ? `${String(Math.floor(initial.phases.light / 60)).padStart(2, '0')}:${String(initial.phases.light % 60).padStart(2, '0')}` : '',
  );
  const [remTime, setRemTime] = useState(() =>
    initial?.phases?.rem != null ? `${String(Math.floor(initial.phases.rem / 60)).padStart(2, '0')}:${String(initial.phases.rem % 60).padStart(2, '0')}` : '',
  );
  const [awakeTime, setAwakeTime] = useState(() =>
    initial?.phases?.awake != null ? `${String(Math.floor(initial.phases.awake / 60)).padStart(2, '0')}:${String(initial.phases.awake % 60).padStart(2, '0')}` : '',
  );
  const [busy, setBusy] = useState(false);

  // Berechne Gesamtschlaf aus bedTime und wakeTime, abzüglich Wachzeit
  const calculateSleepFromTimes = () => {
    if (!bedTime || !wakeTime) return null;
    const [bedH, bedM] = bedTime.split(':').map(Number);
    const [wakeH, wakeM] = wakeTime.split(':').map(Number);
    const bedMinutes = bedH * 60 + bedM;
    let wakeMinutes = wakeH * 60 + wakeM;
    
    // Falls Aufwachzeit kleiner ist, wurde nächsten Tag aufgewacht
    if (wakeMinutes <= bedMinutes) {
      wakeMinutes += 24 * 60;
    }
    
    let totalMinutes = wakeMinutes - bedMinutes;
    
    // Wachzeit abziehen, falls eingetragen
    const awakeMinutes = rawPhaseNums[3]; // Index 3 = Wachzeit
    if (Number.isFinite(awakeMinutes) && awakeMinutes > 0) {
      totalMinutes = Math.max(0, totalMinutes - awakeMinutes);
    }
    
    return totalMinutes;
  };

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    const ini = initial;
    setBedTime(ini?.bedTime || '');
    setWakeTime(ini?.wakeTime || '');
    setManualHours(ini?.totalMinutes != null ? String(Math.floor(ini.totalMinutes / 60)) : '7');
    setManualMins(ini?.totalMinutes != null ? String(ini.totalMinutes % 60) : '30');
    setDeepTime(ini?.phases?.deep != null ? `${String(Math.floor(ini.phases.deep / 60)).padStart(2, '0')}:${String(ini.phases.deep % 60).padStart(2, '0')}` : '');
    setLightTime(ini?.phases?.light != null ? `${String(Math.floor(ini.phases.light / 60)).padStart(2, '0')}:${String(ini.phases.light % 60).padStart(2, '0')}` : '');
    setRemTime(ini?.phases?.rem != null ? `${String(Math.floor(ini.phases.rem / 60)).padStart(2, '0')}:${String(ini.phases.rem % 60).padStart(2, '0')}` : '');
    setAwakeTime(ini?.phases?.awake != null ? `${String(Math.floor(ini.phases.awake / 60)).padStart(2, '0')}:${String(ini.phases.awake % 60).padStart(2, '0')}` : '');
  }, [open, defaultDate, initial]);

  // Nutze berechnete Zeit wenn Start und Endzeit gesetzt sind
  const calculatedMinutes = calculateSleepFromTimes();
  const effectiveManualHours = calculatedMinutes != null ? String(Math.floor(calculatedMinutes / 60)) : manualHours;
  const effectiveManualMins = calculatedMinutes != null ? String(calculatedMinutes % 60) : manualMins;

  // Konvertiere Phasen von hh:mm zu Minuten
  const phaseValues = [
    deepTime,
    lightTime,
    remTime,
    awakeTime,
  ];
  
  const rawPhaseNums = phaseValues.map(time => {
    if (!time) return NaN;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  });
  
  const hasPhase = rawPhaseNums.some(Number.isFinite);
  const phaseSum = rawPhaseNums.filter(Number.isFinite).reduce((a, b) => a + b, 0);

  const manualTotal = Math.max(0, parseNum(effectiveManualHours, 0) * 60 + parseNum(effectiveManualMins, 0));
  const previewTotal = hasPhase && phaseSum > 0 ? Math.round(phaseSum) : manualTotal;

  const submit = async () => {
    const totalMinutes = Math.max(1, previewTotal || manualTotal || 1);
    const phases =
      hasPhase && phaseSum > 0
        ? {
            deep: Number.isFinite(rawPhaseNums[0]) ? Math.round(rawPhaseNums[0]) : 0,
            light: Number.isFinite(rawPhaseNums[1]) ? Math.round(rawPhaseNums[1]) : 0,
            rem: Number.isFinite(rawPhaseNums[2]) ? Math.round(rawPhaseNums[2]) : 0,
            awake: Number.isFinite(rawPhaseNums[3]) ? Math.round(rawPhaseNums[3]) : 0,
          }
        : undefined;
    const entry: SleepLogEntry = {
      totalMinutes,
      bedTime: bedTime || undefined,
      wakeTime: wakeTime || undefined,
      phases,
    };
    setBusy(true);
    try {
      await onSave(date, entry);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileOverlayRoot open={open}>
        <motion.div
          className={mobileSheetOverlayClass()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label={t('dash.log.close')} onClick={onClose} />
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-none lg:rounded-3xl"
          >
            <div className="flex max-h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] px-6 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
                <h3 className="text-sm font-black uppercase italic tracking-tighter text-[var(--text-primary)]">
                  {t('dash.log.sleep.title')}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 hover:bg-[var(--background)] active:opacity-90"
                  aria-label={t('dash.log.close')}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4 [-webkit-overflow-scrolling:touch]">
            <p className="text-[10px] text-[var(--text-muted)] mb-4">
              {t('dash.log.sleep.help')}
            </p>
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest">{t('dash.log.date')}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 text-base font-bold text-[var(--text-primary)]"
            />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('dash.log.sleep.bed')}</label>
                <input
                  type="time"
                  value={bedTime}
                  onChange={e => setBedTime(e.target.value)}
                  className="mt-1 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-2 text-base font-bold text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)]">{t('dash.log.sleep.wake')}</label>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={e => setWakeTime(e.target.value)}
                  className="mt-1 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-2 text-base font-bold text-[var(--text-primary)]"
                />
              </div>
            </div>
            {calculatedMinutes != null && (
              <p className="text-[9px] text-[var(--text-success)] mt-2 font-semibold">
                {t('dash.log.sleep.calcOk', {
                  h: Math.floor(calculatedMinutes / 60),
                  m: calculatedMinutes % 60,
                })}
              </p>
            )}

            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mt-5 mb-2">{t('dash.log.sleep.phases')}</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'deep' as const, value: deepTime, setValue: setDeepTime },
                  { id: 'light' as const, value: lightTime, setValue: setLightTime },
                  { id: 'rem' as const, value: remTime, setValue: setRemTime },
                  { id: 'awake' as const, value: awakeTime, setValue: setAwakeTime },
                ] as const
              ).map(row => (
                <div key={row.id} className="space-y-1">
                  <label className="text-[8px] uppercase text-[var(--text-muted)] block">{t(`dash.log.sleep.phase.${row.id}`)}</label>
                  <input
                    type="time"
                    value={row.value}
                    onChange={e => row.setValue(e.target.value)}
                    className="w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-lg px-2 text-base font-bold text-[var(--text-primary)]"
                  />
                </div>
              ))}
            </div>

            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mt-5 mb-2">
              {t('dash.log.sleep.totalDur')}
              {calculatedMinutes != null && ` ${t('dash.log.sleep.auto')}`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] uppercase text-[var(--text-muted)]">{t('dash.log.hours')}</label>
                <input
                  type="number"
                  min={0}
                  value={effectiveManualHours}
                  onChange={e => calculatedMinutes == null && setManualHours(e.target.value)}
                  disabled={calculatedMinutes != null}
                  className="mt-0.5 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-lg px-2 text-base font-bold text-[var(--text-primary)] disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-[8px] uppercase text-[var(--text-muted)]">{t('dash.log.minutes')}</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={effectiveManualMins}
                  onChange={e => calculatedMinutes == null && setManualMins(e.target.value)}
                  disabled={calculatedMinutes != null}
                  className="mt-0.5 w-full min-h-[48px] touch-manipulation bg-[var(--background)] border border-[var(--border-muted)] rounded-lg px-2 text-base font-bold text-[var(--text-primary)] disabled:opacity-60"
                />
              </div>
            </div>

            <p className="mt-4 text-xs font-black text-[var(--text-primary)]">
              {t('dash.log.sleep.totalLine', { h: Math.floor(previewTotal / 60), m: previewTotal % 60 })}
            </p>
              </div>
              <div className="shrink-0 border-t border-[var(--border-muted)] bg-[var(--card-bg)] px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="flex w-full min-h-[52px] touch-manipulation items-center justify-center ui-btn-brand text-[10px] disabled:opacity-50 active:opacity-90"
                >
                  {busy ? t('dash.log.saving') : t('dash.log.save')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
    </MobileOverlayRoot>
  );
}
