/**
 * Auswertungen über Workout- und Ernährungsdaten.
 * Reine Funktionen, keine API-Aufrufe — dadurch leicht testbar.
 */

import type { FoodEntry, WorkoutEntry } from './simpleApi';
import { gruppeAusTabelle } from './uebungen';

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
  if (!n.trim()) return 'Sonstiges';

  // Erst die genaue Tabelle (kennt auch deutsche Namen und Mehrdeutiges),
  // dann die einfache Wortsuche als Rueckfall.
  const genau = gruppeAusTabelle(exerciseName);
  if (genau) return genau;

  let beste: { gruppe: Muskelgruppe; laenge: number } | null = null;
  for (const { gruppe, woerter } of MUSKEL_MUSTER) {
    for (const w of woerter) {
      if (w.length > 2 && n.includes(w) && (!beste || w.length > beste.laenge)) {
        beste = { gruppe, laenge: w.length };
      }
    }
  }
  return beste?.gruppe ?? 'Sonstiges';
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

// ============================================================ Gewicht

export type Gewichtspunkt = { ymd: Ymd; weight: number };

/** Gewichtsverlauf aus `weight_history` sortiert und auf N Tage begrenzt. */
export function gewichtsverlauf(history: unknown, tage = 90): Gewichtspunkt[] {
  if (!Array.isArray(history)) return [];
  const punkte: Gewichtspunkt[] = [];
  for (const roh of history) {
    const e = roh as { date?: unknown; weight?: unknown };
    const ymd = toYmd(e?.date);
    const weight = Number(e?.weight);
    if (!ymd || !Number.isFinite(weight) || weight <= 0) continue;
    punkte.push({ ymd, weight });
  }
  punkte.sort((a, b) => a.ymd.localeCompare(b.ymd));

  // Duplikate pro Tag: der letzte Eintrag gewinnt
  const proTag = new Map<Ymd, number>();
  for (const p of punkte) proTag.set(p.ymd, p.weight);

  const grenze = shiftYmdLocal(todayYmdLocal(), -tage + 1);
  return [...proTag.entries()]
    .filter(([ymd]) => ymd >= grenze)
    .map(([ymd, weight]) => ({ ymd, weight }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd));
}

/** Veraenderung ueber den ganzen Verlauf. */
export function gewichtsTrend(punkte: Gewichtspunkt[]): {
  aktuell: number | null;
  start: number | null;
  delta: number | null;
  proWoche: number | null;
} {
  if (!punkte.length) return { aktuell: null, start: null, delta: null, proWoche: null };
  const start = punkte[0].weight;
  const aktuell = punkte[punkte.length - 1].weight;
  const delta = Math.round((aktuell - start) * 10) / 10;

  let proWoche: number | null = null;
  if (punkte.length > 1) {
    const tage = Math.max(1, daysBetween(punkte[0].ymd, punkte[punkte.length - 1].ymd));
    proWoche = Math.round((delta / (tage / 7)) * 100) / 100;
  }
  return { aktuell, start, delta, proWoche };
}

/** Gleitender Durchschnitt, da Tagesgewicht stark schwankt. */
export function geglaettet(punkte: Gewichtspunkt[], fenster = 7): number[] {
  if (!punkte.length) return [];
  const out: number[] = [];
  for (let i = 0; i < punkte.length; i += 1) {
    const von = Math.max(0, i - fenster + 1);
    const teil = punkte.slice(von, i + 1);
    out.push(teil.reduce((s, p) => s + p.weight, 0) / teil.length);
  }
  return out;
}

// ============================================================ Wochenrueckblick

export type Wochenvergleich = {
  einheiten: { jetzt: number; vorher: number };
  volumen: { jetzt: number; vorher: number };
  minuten: { jetzt: number; vorher: number };
  kcalSchnitt: { jetzt: number; vorher: number };
  proteinTreffer: { jetzt: number; vorher: number };
};

function imZeitraum(ymd: Ymd, von: Ymd, bis: Ymd): boolean {
  return ymd >= von && ymd <= bis;
}

/** Diese Woche (Mo–So) gegen die Vorwoche. */
export function wochenvergleich(
  workouts: WorkoutEntry[],
  entries: FoodEntry[],
  proteinZiel: number,
  trainingsTage = 7,
): Wochenvergleich {
  const heute = todayYmdLocal();
  const wochentag = (new Date().getDay() + 6) % 7; // Mo=0
  const dieserMo = shiftYmdLocal(heute, -wochentag);
  const letzterMo = shiftYmdLocal(dieserMo, -7);
  const letzterSo = shiftYmdLocal(dieserMo, -1);

  const zeit = { jetzt: [dieserMo, heute], vorher: [letzterMo, letzterSo] } as const;

  const zaehle = (von: Ymd, bis: Ymd) => {
    const w = workouts.filter((x) => imZeitraum(toYmd(x.date), von, bis));
    const minuten = w.reduce((s, x) => s + (Number(x.duration) || 0), 0);
    return { w, minuten };
  };

  const jetzt = zaehle(...zeit.jetzt);
  const vorher = zaehle(...zeit.vorher);

  const kcalMap = kcalByDay(entries);
  const schnitt = ([von, bis]: readonly [Ymd, Ymd]) => {
    let summe = 0;
    let n = 0;
    let cur = von;
    while (cur <= bis) {
      const v = kcalMap.get(cur);
      if (v && v > 0) {
        summe += v;
        n += 1;
      }
      cur = shiftYmdLocal(cur, 1);
    }
    return n ? Math.round(summe / n) : 0;
  };

  // Proteintreffer: Tage, an denen das Proteinziel erreicht wurde
  const proteinMap = new Map<Ymd, number>();
  for (const e of entries) {
    const ymd = toYmd(e.date);
    if (!ymd) continue;
    proteinMap.set(ymd, (proteinMap.get(ymd) ?? 0) + (Number(e.protein) || 0));
  }
  const treffer = ([von, bis]: readonly [Ymd, Ymd]) => {
    let n = 0;
    let cur = von;
    while (cur <= bis) {
      if ((proteinMap.get(cur) ?? 0) >= proteinZiel) n += 1;
      cur = shiftYmdLocal(cur, 1);
    }
    return n;
  };

  return {
    einheiten: { jetzt: jetzt.w.length, vorher: vorher.w.length },
    volumen: {
      jetzt: jetzt.w.reduce((s, x) => s + volumen([x], 400), 0),
      vorher: vorher.w.reduce((s, x) => s + volumen([x], 400), 0),
    },
    minuten: { jetzt: jetzt.minuten, vorher: vorher.minuten },
    kcalSchnitt: { jetzt: schnitt(zeit.jetzt), vorher: schnitt(zeit.vorher) },
    proteinTreffer: { jetzt: treffer(zeit.jetzt), vorher: treffer(zeit.vorher) },
  };
}

// ============================================================ Bestleistungen

export type Bestleistung = { uebung: string; gewicht: number; reps: number; datum: Ymd };

/** Hoechstes Gewicht pro Uebung (aus allen Saetzen). */
export function bestleistungen(workouts: WorkoutEntry[], limit = 8): Bestleistung[] {
  const map = new Map<string, Bestleistung>();

  for (const w of workouts) {
    const ex = w.exercises;
    if (!Array.isArray(ex)) continue;
    const ymd = toYmd(w.date);
    for (const e of ex) {
      const name = String((e as { name?: unknown })?.name ?? '').trim();
      if (!name) continue;
      const sets = (e as { sets?: unknown })?.sets;
      if (!Array.isArray(sets)) continue;

      for (const satz of sets) {
        const s = satz as { reps?: unknown; weight?: unknown };
        const gewicht = Number(s?.weight) || 0;
        const reps = Number(s?.reps) || 0;
        if (gewicht <= 0) continue;

        const alt = map.get(name);
        if (!alt || gewicht > alt.gewicht) {
          map.set(name, { uebung: name, gewicht, reps, datum: ymd });
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => b.gewicht - a.gewicht).slice(0, limit);
}
