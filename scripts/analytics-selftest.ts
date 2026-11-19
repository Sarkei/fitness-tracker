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
import {
  bestleistungen,
  geglaettet,
  gewichtsTrend,
  gewichtsverlauf,
  wochenvergleich,
} from '../src/simple/analytics';
import { gruppeAusTabelle, uebungVorschlaege } from '../src/simple/uebungen';
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


console.log('\n=== Gewichtsverlauf ===');
const roheHistorie = [
  { date: '2026-11-01', weight: 82.4 },
  { date: '2026-11-08', weight: 81.9 },
  { date: '2026-11-15', weight: 81.2 },
  { date: '2026-10-01', weight: 84.0 },
  { date: 'kaputt', weight: 80 },
  { date: '2026-11-15', weight: 81.0 },
];
const verlauf = gewichtsverlauf(roheHistorie, 90);
pruefe('sortiert nach Datum', verlauf.map((p) => p.ymd), [
  '2026-10-01',
  '2026-11-01',
  '2026-11-08',
  '2026-11-15',
]);
pruefe('Duplikat: letzter Wert gewinnt', verlauf.find((p) => p.ymd === '2026-11-15')?.weight, 81.0);
pruefe('ungueltige Zeilen verworfen', verlauf.length, 4);
pruefe('leere Historie', gewichtsverlauf(null, 90).length, 0);
pruefe('kein Array', gewichtsverlauf('quatsch', 90).length, 0);

const trend = gewichtsTrend(verlauf);
pruefe('aktuell 81.0', trend.aktuell, 81);
pruefe('start 84.0', trend.start, 84);
pruefe('delta -3.0', trend.delta, -3);
const trendLeer = gewichtsTrend([]);
pruefe('leer: aktuell null', trendLeer.aktuell, null);

const gl = geglaettet(verlauf, 2);
pruefe('glaettung: Laenge', gl.length, 4);
pruefe('glaettung: Mittel der letzten zwei (81.9+81)/2', Math.round(gl[gl.length - 1] * 100) / 100, 81.45);

console.log('\n=== Wochenvergleich ===');
const heuteW = todayYmdLocal();
const dieseWoche: WorkoutEntry[] = [
  w('x1', 0, [{ name: 'Bankdrücken', sets: [satz(10, 80)] }], 60),
];
const vergl = wochenvergleich(dieseWoche, essen, 180);
pruefe('Einheiten jetzt >= 1', vergl.einheiten.jetzt >= 1, true);
pruefe('Minuten jetzt', vergl.minuten.jetzt, 60);
pruefe('Volumen jetzt (10*80)', vergl.volumen.jetzt, 800);

console.log('\n=== Bestleistungen ===');
const rek = bestleistungen(mitDaten, 5);
pruefe('Anzahl Rekorde', rek.length, 3);
pruefe('hoechstes Gewicht zuerst', rek[0].gewicht, 120);
pruefe('Rekord-Uebung', rek[0].uebung, 'Kniebeuge');
pruefe('Rekord-Wdh', rek[0].reps, 5);

console.log('\n=== Uebungsbibliothek ===');
pruefe('Face Pull', gruppeAusTabelle('Face Pull'), 'Schultern');
pruefe('Cable Crossover', gruppeAusTabelle('Cable Crossover'), 'Brust');
pruefe('Rumaenisches Kreuzheben', gruppeAusTabelle('Rumänisches Kreuzheben'), 'Beine');
pruefe('Laufband', gruppeAusTabelle('Laufband'), 'Cardio');
pruefe('Seitheben', gruppeAusTabelle('Seitheben'), 'Schultern');
pruefe('Engbankdruecken', gruppeAusTabelle('Engbankdrücken'), 'Arme');
pruefe('Unbekannt -> null', gruppeAusTabelle('Zauberei'), null);
pruefe('Vorschlaege fuer "bank"', uebungVorschlaege('bank', 3).length > 0, true);
pruefe('Vorschlaege fuer "xyz"', uebungVorschlaege('xyz', 3).length, 0);
pruefe('leere Suche', uebungVorschlaege('', 3).length, 0);

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
process.exit(fehler > 0 ? 1 : 0);

