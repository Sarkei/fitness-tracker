/**
 * Selbsttest für die Heute-Auswertungen: Fasten-Serie, Trainings-Serie, kcal-Bilanz.
 *
 * Die Trainings-Serie zählt nur *geplante* Tage — Ruhetage und planlose Wochen dürfen
 * sie nicht unterbrechen. Genau da lag die Fehlergefahr.
 */
import { bilanzDurchschnitt, fastenSerie, kcalBilanz, trainingsSerie, wochentagKurz } from '../src/simple/serien';
import type { PlanWeek, WorkoutEntry } from '../src/simple/simpleApi';

let fehler = 0;
function ok(name: string, bedingung: boolean, detail?: string) {
  console.log(`${bedingung ? 'ok    ' : 'FEHLER'} ${name}${detail && !bedingung ? ` -> ${detail}` : ''}`);
  if (!bedingung) fehler += 1;
}

function woche(week_number: number, start: string, trainingstage: string[]): PlanWeek {
  const alle = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return {
    week_number,
    start_date: start,
    schedule: {
      weekFocus: `W${week_number}`,
      schedule: alle.map((day) => ({
        day,
        isRest: !trainingstage.includes(day),
        title: trainingstage.includes(day) ? 'Training' : 'Ruhetag',
        exercises: [],
      })),
    },
  };
}

function workout(date: string): WorkoutEntry {
  return { id: date, name: 'Einheit', date, duration: 60, exercises: [] } as unknown as WorkoutEntry;
}

// ── Trainings-Serie ────────────────────────────────────────────────────────────
// Plan: Mo/Mi/Fr, Woche ab 16.11. und ab 23.11. Heute = Montag 23.11.
const plan: PlanWeek[] = [
  woche(17, '2026-11-16', ['Monday', 'Wednesday', 'Friday']),
  woche(18, '2026-11-23', ['Monday', 'Wednesday', 'Friday']),
];

// Alles absolviert bis einschließlich Freitag 20.11., heute (23.11.) noch offen.
const alleAbsolviert = [
  workout('2026-11-16'),
  workout('2026-11-18'),
  workout('2026-11-20'),
];

const s1 = trainingsSerie(alleAbsolviert, plan, '2026-11-23');
ok('drei geplante Einheiten am Stück', s1.aktuell === 3, `aktuell=${s1.aktuell}`);
ok('Serie bricht bei offenem heutigen Tag nicht ab', s1.aktuell === 3);
ok('geplante Tage gezählt', s1.geplant === 4, `geplant=${s1.geplant} (Mo 16., Mi 18., Fr 20., Mo 23.)`);
ok('absolvierte Tage gezählt', s1.absolviert === 3, `absolviert=${s1.absolviert}`);
ok('beste Serie = 3', s1.laengste === 3, `laengste=${s1.laengste}`);

// Ein geplanter Tag wurde ausgelassen (Mittwoch 18.11. fehlt) -> Serie reißt.
const mitLuecke = [workout('2026-11-16'), workout('2026-11-20')];
const s2 = trainingsSerie(mitLuecke, plan, '2026-11-23');
ok('Lücke unterbricht die Serie', s2.aktuell === 1, `aktuell=${s2.aktuell} (nur Freitag 20.11.)`);

// Ruhetage zählen nicht mit: Samstag/Sonntag dürfen nichts kaputt machen.
const bisFreitag = [workout('2026-11-16'), workout('2026-11-18'), workout('2026-11-20')];
const s3 = trainingsSerie(bisFreitag, plan, '2026-11-22'); // Sonntag
ok('Ruhetage unterbrechen nicht', s3.aktuell === 3, `aktuell=${s3.aktuell}`);

// Heute (Montag) trainiert -> zählt mit.
const mitHeute = [...alleAbsolviert, workout('2026-11-23')];
const s4 = trainingsSerie(mitHeute, plan, '2026-11-23');
ok('heutiges Training zählt', s4.aktuell === 4, `aktuell=${s4.aktuell}`);

// Ohne Plan: Rückfall auf Trainingstage-Serie.
const s5 = trainingsSerie([workout('2026-11-22'), workout('2026-11-23')], [], '2026-11-23');
ok('ohne Plan jeder Tag zählt', s5.aktuell === 2, `aktuell=${s5.aktuell}`);

// ── Fasten-Serie ───────────────────────────────────────────────────────────────
ok('Fasten heute begonnen = 1 Tag', fastenSerie('2026-11-23', '2026-11-23').tage === 1);
ok('Fasten seit 20.11. = 4 Tage', fastenSerie('2026-11-20', '2026-11-23').tage === 4);
ok('Fasten ohne Startdatum = 0', fastenSerie(null, '2026-11-23').tage === 0);
ok('Fasten mit Unsinn = 0', fastenSerie('kaputt', '2026-11-23').tage === 0);
ok('Fasten Zukunft = 0', fastenSerie('2026-12-01', '2026-11-23').tage === 0);
ok('Fasten liefert Startdatum', fastenSerie('2026-11-20', '2026-11-23').seit === '2026-11-20');

// ── Kalorienbilanz ─────────────────────────────────────────────────────────────
const essen = [
  { id: '1', meal: 'A', date: '2026-11-22', calories: 2600, protein: 100, carbs: 200, fat: 80, category: 'lunch' },
  { id: '2', meal: 'B', date: '2026-11-23', calories: 2000, protein: 100, carbs: 200, fat: 80, category: 'lunch' },
] as never;

const reihe = kcalBilanz(essen, [workout('2026-11-23')], 2400, 14, '2026-11-23', 80);
ok('14 Tage', reihe.length === 14);
const gestern = reihe[reihe.length - 2];
const heute = reihe[reihe.length - 1];
ok('gestern: 2600 - 2400 = +200', gestern.bilanz === 200, `bilanz=${gestern.bilanz}`);
ok('heute: Training 60min = 420 kcal verbrannt', heute.verbrannt === 420, `verbrannt=${heute.verbrannt}`);
ok('heute: 2000 - 2400 - 420 = -820', heute.bilanz === -820, `bilanz=${heute.bilanz}`);
ok('Tage ohne Essen haben keine Daten', reihe[0].hatDaten === false);
ok('Durchschnitt nur über Tage mit Daten', bilanzDurchschnitt(reihe) === Math.round((200 + -820) / 2), `avg=${bilanzDurchschnitt(reihe)}`);
ok('ohne Daten null', bilanzDurchschnitt(kcalBilanz([], [], 2400, 14, '2026-11-23')) === null);

// Körpergewicht skaliert den Verbrauch.
const schwer = kcalBilanz(essen, [workout('2026-11-23')], 2400, 14, '2026-11-23', 120);
ok('120 kg verbrennt mehr als 80 kg', schwer[schwer.length - 1].verbrannt > heute.verbrannt, `${schwer[schwer.length - 1].verbrannt}`);

// ── Wochentagskürzel ───────────────────────────────────────────────────────────
ok('23.11.2026 ist Montag → Mo', wochentagKurz('2026-11-23') === 'Mo', wochentagKurz('2026-11-23'));
ok('22.11.2026 ist Sonntag → So', wochentagKurz('2026-11-22') === 'So', wochentagKurz('2026-11-22'));

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler > 0) process.exit(1);
