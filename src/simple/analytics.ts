/**
 * Auswertungen über Workout- und Ernährungsdaten.
 * Reine Funktionen, keine API-Aufrufe — dadurch leicht testbar.
 */

import type { FoodEntry, WorkoutEntry } from './simpleApi';

export type Ymd = string; // YYYY-MM-DD

/** Tagesschlüssel aus einem beliebigen Datumsfeld. */
export function toYmd(value: unknown): Ymd {
  const s = String(value ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayYmdLocal(): Ymd {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftYmdLocal(ymd: Ymd, days: number): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a: Ymd, b: Ymd): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86_400_000);
}

/** Übungen pro Training (robust gegen verschiedene Formen). */
function exerciseCount(w: WorkoutEntry): number {
  const ex = w.exercises;
  return Array.isArray(ex) ? ex.length : 0;
}

/** Sätze pro Training — zählt `sets`-Arrays oder die Zahl. */
function setCount(w: WorkoutEntry): number {
  const ex = w.exercises;
  if (!Array.isArray(ex)) return 0;
  let n = 0;
  for (const e of ex) {
    const s = (e as { sets?: unknown })?.sets;
    if (Array.isArray(s)) n += s.length;
    else if (typeof s === 'number') n += s;
    else if (typeof s === 'string') n += Number(s) || 0;
  }
  return n;
}

/** Trainings pro Tag. */
export function workoutsByDay(workouts: WorkoutEntry[]): Map<Ymd, WorkoutEntry[]> {
  const map = new Map<Ymd, WorkoutEntry[]>();
  for (const w of workouts) {
    const ymd = toYmd(w.date);
    if (!ymd) continue;
    const arr = map.get(ymd) ?? [];
    arr.push(w);
    map.set(ymd, arr);
  }
  return map;
}

/** Kalorien pro Tag aus Mahlzeiten. */
export function kcalByDay(entries: FoodEntry[]): Map<Ymd, number> {
  const map = new Map<Ymd, number>();
  for (const e of entries) {
    const ymd = toYmd(e.date);
    if (!ymd) continue;
    map.set(ymd, (map.get(ymd) ?? 0) + (Number(e.calories) || 0));
  }
  return map;
}

/** Aktuelle Serie aufeinanderfolgender Trainingstage (heute oder gestern zählt als Start). */
export function workoutStreak(workouts: WorkoutEntry[]): { aktuell: number; laengste: number } {
  const tage = new Set(workouts.map((w) => toYmd(w.date)).filter(Boolean));
  if (!tage.size) return { aktuell: 0, laengste: 0 };

  const heute = todayYmdLocal();
  let start = heute;
  if (!tage.has(heute)) {
    const gestern = shiftYmdLocal(heute, -1);
    if (!tage.has(gestern)) return { aktuell: 0, laengste: laengsteSerie(tage) };
    start = gestern;
  }

  let aktuell = 0;
  let cur = start;
  while (tage.has(cur)) {
    aktuell += 1;
    cur = shiftYmdLocal(cur, -1);
  }
  return { aktuell, laengste: laengsteSerie(tage) };
}

function laengsteSerie(tage: Set<Ymd>): number {
  const sortiert = [...tage].sort();
  let beste = 1;
  let lauf = 1;
  for (let i = 1; i < sortiert.length; i += 1) {
    if (daysBetween(sortiert[i - 1], sortiert[i]) === 1) {
      lauf += 1;
      beste = Math.max(beste, lauf);
    } else {
      lauf = 1;
    }
  }
  return sortiert.length ? beste : 0;
}

/** Trainings in diesem Monat. */
export function workoutsThisMonth(workouts: WorkoutEntry[]): number {
  const heute = new Date();
  const praefix = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}`;
  return workouts.filter((w) => toYmd(w.date).startsWith(praefix)).length;
}

/** Trainings der letzten N Tage. */
export function workoutsInLastDays(workouts: WorkoutEntry[], tage: number): WorkoutEntry[] {
  const grenze = shiftYmdLocal(todayYmdLocal(), -tage + 1);
  return workouts.filter((w) => {
    const ymd = toYmd(w.date);
    return ymd && ymd >= grenze;
  });
}

export type Muskelgruppe =
  | 'Brust'
  | 'Rücken'
  | 'Beine'
  | 'Schultern'
  | 'Arme'
  | 'Core'
  | 'Cardio'
  | 'Sonstiges';

const MUSKEL_MUSTER: Array<{ gruppe: Muskelgruppe; woerter: string[] }> = [
  { gruppe: 'Brust', woerter: ['bench', 'bank', 'press', 'chest', 'brust', 'fly', 'flye', 'push-up', 'pushup', 'liegestütz', 'dip'] },
  { gruppe: 'Rücken', woerter: ['row', 'rudern', 'pull-up', 'pullup', 'klimmzug', 'lat', 'deadlift', 'kreuzheben', 'back', 'rücken', 'zug'] },
  { gruppe: 'Beine', woerter: ['squat', 'kniebeuge', 'leg', 'bein', 'lunge', 'ausfall', 'calf', 'wade', 'hip', 'hüfte', 'rdl', 'romanian'] },
  { gruppe: 'Schultern', woerter: ['shoulder', 'schulter', 'lateral', 'seitheben', 'overhead', 'military', 'shrug', 'nacken'] },
  { gruppe: 'Arme', woerter: ['curl', 'trizeps', 'triceps', 'bizeps', 'biceps', 'arm', 'hammer', 'pushdown', 'extension'] },
  { gruppe: 'Core', woerter: ['plank', 'crunch', 'sit-up', 'situp', 'core', 'bauch', 'ab ', 'russian', 'hollow'] },
  { gruppe: 'Cardio', woerter: ['run', 'lauf', 'bike', 'rad', 'row erg', 'ergometer', 'cardio', 'hiit', 'sprint', 'jump', 'seil', 'swim', 'schwimm'] },
];

export function muskelgruppe(exerciseName: string): Muskelgruppe {
  const n = String(exerciseName ?? '').toLowerCase();
  for (const { gruppe, woerter } of MUSKEL_MUSTER) {
    if (woerter.some((w) => n.includes(w))) return gruppe;
  }
  return 'Sonstiges';
}

/** Sätze pro Muskelgruppe in den letzten N Tagen. */
export function muskelbalance(
  workouts: WorkoutEntry[],
  tage = 30,
): Array<{ gruppe: Muskelgruppe; saetze: number }> {
  const relevant = workoutsInLastDays(workouts, tage);
  const zaehler = new Map<Muskelgruppe, number>();

  for (const w of relevant) {
    const ex = w.exercises;
    if (!Array.isArray(ex)) continue;
    for (const e of ex) {
      const name = (e as { name?: string })?.name ?? '';
      const s = (e as { sets?: unknown })?.sets;
      const n = Array.isArray(s) ? s.length : Number(s) || 1;
      const g = muskelgruppe(name);
      zaehler.set(g, (zaehler.get(g) ?? 0) + n);
    }
  }

  return [...zaehler.entries()]
    .map(([gruppe, saetze]) => ({ gruppe, saetze }))
    .sort((a, b) => b.saetze - a.saetze);
}

/** Trainingsvolumen: Sätze × Wiederholungen × Gewicht. */
export function volumen(workouts: WorkoutEntry[], tage = 30): number {
  const relevant = workoutsInLastDays(workouts, tage);
  let summe = 0;
  for (const w of relevant) {
    const ex = w.exercises;
    if (!Array.isArray(ex)) continue;
    for (const e of ex) {
      const s = (e as { sets?: unknown })?.sets;
      if (!Array.isArray(s)) continue;
      for (const satz of s) {
        const reps = Number((satz as { reps?: unknown })?.reps) || 0;
        const gewicht = Number((satz as { weight?: unknown })?.weight) || 0;
        summe += reps * gewicht;
      }
    }
  }
  return Math.round(summe);
}

/** Gesamtzahl Sätze und Übungen. */
export function gesamtzahlen(workouts: WorkoutEntry[]): { saetze: number; uebungen: number } {
  let saetze = 0;
  let uebungen = 0;
  for (const w of workouts) {
    saetze += setCount(w);
    uebungen += exerciseCount(w);
  }
  return { saetze, uebungen };
}

/** Durchschnittliche Trainingsdauer in Minuten. */
export function durchschnittsdauer(workouts: WorkoutEntry[]): number {
  const mit = workouts.filter((w) => Number(w.duration) > 0);
  if (!mit.length) return 0;
  const summe = mit.reduce((s, w) => s + Number(w.duration), 0);
  return Math.round(summe / mit.length);
}

/** Tage seit dem letzten Training. */
export function tageSeitLetztemTraining(workouts: WorkoutEntry[]): number | null {
  if (!workouts.length) return null;
  const sortiert = workouts
    .map((w) => toYmd(w.date))
    .filter(Boolean)
    .sort()
    .reverse();
  if (!sortiert.length) return null;
  return Math.max(0, daysBetween(sortiert[0], todayYmdLocal()));
}

/** Kalorien-Durchschnitt der letzten N Tage (nur Tage mit Einträgen). */
export function kcalDurchschnitt(entries: FoodEntry[], tage = 7): number {
  const map = kcalByDay(entries);
  const heute = todayYmdLocal();
  let summe = 0;
  let zaehler = 0;
  for (let i = 0; i < tage; i += 1) {
    const ymd = shiftYmdLocal(heute, -i);
    const v = map.get(ymd);
    if (v && v > 0) {
      summe += v;
      zaehler += 1;
    }
  }
  return zaehler ? Math.round(summe / zaehler) : 0;
}

/** Wie viele der letzten N Tage hatten Einträge? */
export function erfassteTage(entries: FoodEntry[], tage = 7): number {
  const map = kcalByDay(entries);
  const heute = todayYmdLocal();
  let zaehler = 0;
  for (let i = 0; i < tage; i += 1) {
    if ((map.get(shiftYmdLocal(heute, -i)) ?? 0) > 0) zaehler += 1;
  }
  return zaehler;
}

/** Kurzes Wochentagskürzel für ein Datum, z. B. "Mo". */
export function dayLabelShort(ymd: Ymd): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2);
}
