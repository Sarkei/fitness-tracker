/**
 * Intervallfasten — reine Rechenlogik für die Startseite.
 *
 * Ein Plan besteht aus Startzeit und Fasten-/Essensdauer (z. B. 16:8 = 16 h fasten,
 * 8 h Essensfenster). Aus der Uhrzeit ergibt sich, ob gerade gefastet wird oder das
 * Essensfenster läuft, und wie lange die jeweilige Phase noch dauert.
 *
 * Alles hier ist zustandslos und testbar: `fastingStatus(plan, now)` liefert nur Zahlen.
 */

export type FastingPlan = {
  /** Stunden Fasten (1–23) */
  fastHours: number;
  /** Stunden Essensfenster (1–23) */
  eatHours: number;
  /** Beginn des Fastens als "HH:MM" (lokale Zeit des Geräts) */
  startTime: string;
  /** Anzeigename, z. B. "16:8" */
  label?: string;
};

export type FastingPhase = 'fasting' | 'eating';

export type FastingStatus = {
  phase: FastingPhase;
  /** Minuten bis zum Phasenwechsel */
  remainingMinutes: number;
  /** Fortschritt der aktuellen Phase 0…1 */
  progress: number;
  phaseStart: Date;
  phaseEnd: Date;
  phaseMinutes: number;
};

export const FASTING_PRESETS: FastingPlan[] = [
  { label: '16:8', fastHours: 16, eatHours: 8, startTime: '20:00' },
  { label: '14:10', fastHours: 14, eatHours: 10, startTime: '20:00' },
  { label: '18:6', fastHours: 18, eatHours: 6, startTime: '19:00' },
  { label: '20:4', fastHours: 20, eatHours: 4, startTime: '18:00' },
  { label: '12:12', fastHours: 12, eatHours: 12, startTime: '20:00' },
];

export function planLabel(plan: FastingPlan): string {
  return plan.label ?? `${plan.fastHours}:${plan.eatHours}`;
}

/** "20:00" -> Minuten seit Mitternacht; ungültige Werte -> null. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isValidPlan(plan: Partial<FastingPlan> | null | undefined): plan is FastingPlan {
  if (!plan) return false;
  const fast = Number(plan.fastHours);
  const eat = Number(plan.eatHours);
  return (
    Number.isFinite(fast) &&
    Number.isFinite(eat) &&
    fast > 0 &&
    fast < 24 &&
    eat > 0 &&
    eat < 24 &&
    fast + eat === 24 &&
    parseClock(String(plan.startTime ?? '')) !== null
  );
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function atMinuteOfDay(base: Date, minuteOfDay: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minuteOfDay);
  return d;
}

/**
 * Aktuelle Phase bestimmen. `startTime` ist der Beginn des Fastens
 * (= Ende des Essensfensters).
 */
export function fastingStatus(plan: FastingPlan, now: Date = new Date()): FastingStatus {
  const fastMinutes = Math.round(Number(plan.fastHours) * 60);
  const eatMinutes = Math.round(Number(plan.eatHours) * 60);
  const start = parseClock(plan.startTime) ?? 20 * 60;

  const nowMinutes = minutesOfDay(now);
  const fastStart =
    nowMinutes >= start ? atMinuteOfDay(now, start) : atMinuteOfDay(now, start - 24 * 60);
  const fastEnd = new Date(fastStart.getTime() + fastMinutes * 60000);

  if (now < fastEnd) {
    const remaining = Math.max(0, fastEnd.getTime() - now.getTime()) / 60000;
    return {
      phase: 'fasting',
      remainingMinutes: remaining,
      progress: Math.min(1, Math.max(0, 1 - remaining / fastMinutes)),
      phaseStart: fastStart,
      phaseEnd: fastEnd,
      phaseMinutes: fastMinutes,
    };
  }

  const eatEnd = new Date(fastEnd.getTime() + eatMinutes * 60000);
  const remaining = Math.max(0, eatEnd.getTime() - now.getTime()) / 60000;
  return {
    phase: 'eating',
    remainingMinutes: remaining,
    progress: Math.min(1, Math.max(0, 1 - remaining / eatMinutes)),
    phaseStart: fastEnd,
    phaseEnd: eatEnd,
    phaseMinutes: eatMinutes,
  };
}

/** 493 -> "8:13" (Stunden:Minuten) wie eine Restzeit-Uhr. */
export function formatRemaining(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Nächster Essensbeginn ab `now` (Ende der Fastenzeit) — für das Etikett „Essen ab HH:MM".
 *
 * Das Essensfenster beginnt am Ende der Fastenzeit. Läuft es gerade oder kommt es heute
 * noch, ist es der heutige Termin; sonst der von morgen. Verglichen wird gegen das
 * laufende Essensfenster (Fastenbeginn + Fastendauer), nicht gegen den Fastenbeginn.
 */
export function nextEatingStart(plan: FastingPlan, now: Date = new Date()): Date {
  const start = parseClock(plan.startTime) ?? 20 * 60;
  const fastMinutes = Math.round(Number(plan.fastHours) * 60);
  const eatMinutes = Math.round(Number(plan.eatHours) * 60);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Essensfenster, das um Mitternacht herum begonnen hat (Fastenstart gestern)
  const prevStart = new Date(base.getTime() + (start - 24 * 60) * 60000);
  const prevEat = new Date(prevStart.getTime() + fastMinutes * 60000);
  const prevEatEnd = new Date(prevEat.getTime() + eatMinutes * 60000);
  if (prevEat <= now && now < prevEatEnd) return prevEat;

  const todayStart = new Date(base.getTime() + start * 60000);
  const todayEat = new Date(todayStart.getTime() + fastMinutes * 60000);
  const todayEatEnd = new Date(todayEat.getTime() + eatMinutes * 60000);
  if (now < todayEatEnd) return todayEat;
  return new Date(todayEat.getTime() + 24 * 60 * 60000);
}
