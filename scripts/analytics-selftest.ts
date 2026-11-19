/**
 * Selbsttest der Auswertungen (analytics.ts) mit Beispieldaten.
 * Aufruf: npx tsx scripts/analytics-selftest.ts
 */
import {
  dayLabelShort,
  durchschnittsdauer,
  erfassteTage,
  gesamtzahlen,
  kcalByDay,
  kcalDurchschnitt,
  muskelbalance,
  muskelgruppe,
  shiftYmdLocal,
  tageSeitLetztemTraining,
  toYmd,
  todayYmdLocal,
  volumen,
  workoutStreak,
  workoutsInLastDays,
  workoutsThisMonth,
} from '../src/simple/analytics';
import type { FoodEntry, WorkoutEntry } from '../src/simple/simpleApi';

let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) {
    console.log(`  FEHLER ${name}: ist=${JSON.stringify(ist)} soll=${JSON.stringify(soll)}`);
    fehler += 1;
  } else {
    console.log(`  ok    ${name} = ${JSON.stringify(ist)}`);
  }
}

const heute = todayYmdLocal();

function w(id: string, tageZurueck: number, uebungen: Array<{ name: string; sets: unknown[] }>, dauer = 60): WorkoutEntry {
  return {
    id,
    name: `Training ${id}`,
    duration: dauer,
    date: `${shiftYmdLocal(heute, -tageZurueck)}T10:00:00.000Z`,
    exercises: uebungen,
  };
}

const satz = (reps: number, weight: number) => ({ reps, weight, completed: true, type: 'normal' });

console.log('=== Datums-Helfer ===');
pruefe('toYmd ISO', toYmd('2026-11-19T10:30:00.000Z'), '2026-11-19');
pruefe('toYmd nur Datum', toYmd('2026-11-19'), '2026-11-19');
pruefe('toYmd leer', toYmd(''), '');
pruefe('shiftYmdLocal -1', shiftYmdLocal('2026-11-19', -1), '2026-11-18');
pruefe('shiftYmdLocal über Monat', shiftYmdLocal('2026-11-01', -1), '2026-10-31');
pruefe('dayLabelShort Montag', dayLabelShort('2026-11-16'), 'Mo');
pruefe('dayLabelShort Sonntag', dayLabelShort('2026-11-22'), 'So');

console.log('\n=== Muskelgruppen ===');
pruefe('Bench Press', muskelgruppe('Bench Press'), 'Brust');
pruefe('Kniebeuge', muskelgruppe('Kniebeuge'), 'Beine');
pruefe('Barbell Row', muskelgruppe('Barbell Row'), 'Rücken');
pruefe('Bizeps Curl', muskelgruppe('Bizeps Curl'), 'Arme');
pruefe('Plank', muskelgruppe('Plank'), 'Core');
pruefe('Laufband', muskelgruppe('Laufband'), 'Cardio');
pruefe('Seitheben', muskelgruppe('Seitheben'), 'Schultern');
pruefe('unbekannt', muskelgruppe('Zauberei'), 'Sonstiges');

console.log('\n=== Streak ===');
const mitHeute = [
  w('a', 0, [{ name: 'Bench Press', sets: [satz(10, 80)] }]),
  w('b', 1, [{ name: 'Kniebeuge', sets: [satz(8, 100)] }]),
  w('c', 2, [{ name: 'Row', sets: [satz(10, 60)] }]),
];
pruefe('3 Tage in Folge', workoutStreak(mitHeute).aktuell, 3);
pruefe('Rekord 3', workoutStreak(mitHeute).laengste, 3);

const mitLuecke = [
  w('a', 0, []),
  w('b', 2, []), // gestern fehlt -> Serie bricht
];
pruefe('Lücke bricht Serie', workoutStreak(mitLuecke).aktuell, 1);
pruefe('Rekord bei Lücke', workoutStreak(mitLuecke).laengste, 1);

const nurGestern = [w('a', 1, []), w('b', 2, [])];
pruefe('gestern zählt weiter', workoutStreak(nurGestern).aktuell, 2);

const leer: WorkoutEntry[] = [];
pruefe('keine Trainings', workoutStreak(leer).aktuell, 0);
pruefe('kein Rekord', workoutStreak(leer).laengste, 0);

console.log('\n=== Zahlen ===');
const mitDaten = [
  w('a', 0, [
    { name: 'Bench Press', sets: [satz(10, 80), satz(8, 85)] },
    { name: 'Kniebeuge', sets: [satz(5, 120)] },
  ], 60),
  w('b', 3, [{ name: 'Row', sets: [satz(10, 60), satz(10, 60), satz(10, 60)] }], 45),
];
pruefe('Sätze gesamt', gesamtzahlen(mitDaten).saetze, 6);
pruefe('Übungen gesamt', gesamtzahlen(mitDaten).uebungen, 3);
pruefe('Volumen (800+680+600+1800)', volumen(mitDaten, 30), 3880);
pruefe('Ø Dauer (60+45)/2', durchschnittsdauer(mitDaten), 53);
pruefe('in letzten 7 Tagen', workoutsInLastDays(mitDaten, 7).length, 2);
pruefe('in letzten 2 Tagen', workoutsInLastDays(mitDaten, 2).length, 1);
pruefe('seit letztem Training', tageSeitLetztemTraining(mitDaten), 0);
pruefe('Monat', workoutsThisMonth(mitDaten) >= 1, true);

console.log('\n=== Muskelbalance ===');
const balance = muskelbalance(mitDaten, 30);
const brust = balance.find((b) => b.gruppe === 'Brust');
const beine = balance.find((b) => b.gruppe === 'Beine');
pruefe('Brust 2 Sätze', brust?.saetze, 2);
pruefe('Beine 1 Satz', beine?.saetze, 1);
pruefe('absteigend sortiert', balance[0].saetze >= balance[balance.length - 1].saetze, true);

console.log('\n=== Ernährung ===');
const essen: FoodEntry[] = [
  { id: '1', meal: 'Frühstück', calories: 500, protein: 30, carbs: 50, fat: 15, date: `${heute}T07:00:00Z` },
  { id: '2', meal: 'Mittag', calories: 700, protein: 45, carbs: 70, fat: 25, date: `${heute}T12:00:00Z` },
  { id: '3', meal: 'Abend', calories: 600, protein: 40, carbs: 40, fat: 20, date: `${shiftYmdLocal(heute, -1)}T19:00:00Z` },
];
const map = kcalByDay(essen);
pruefe('kcal heute', map.get(heute), 1200);
pruefe('kcal gestern', map.get(shiftYmdLocal(heute, -1)), 600);
pruefe('Ø über 7 Tage (nur erfasste)', kcalDurchschnitt(essen, 7), 900);
pruefe('erfasste Tage 7', erfassteTage(essen, 7), 2);
pruefe('leere Liste Ø', kcalDurchschnitt([], 7), 0);

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
process.exit(fehler > 0 ? 1 : 0);
