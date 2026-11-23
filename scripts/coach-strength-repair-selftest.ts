/**
 * Selbsttest: Kraft-Einheiten mit zu wenigen Hauptübungen werden aufgefüllt,
 * statt die KI-Antwort zu verwerfen (Ursache für leere Pläne).
 *
 * Reproduziert genau den Fehler aus der Live-Datenbank:
 *   strength_exercise_count_low: schedule[0] Strength 60min needs at least 4 main exercises, found 3
 */
import { repairStrengthExerciseCount, validateWorkoutConstraints } from '../src/lib/coachConstraints';
import type { CoachWorkoutWeek } from '../src/lib/coachScheduleZod';
import type { WorkoutConstraintInput } from '../src/lib/coachConstraints';

let fehler = 0;
function ok(name: string, bedingung: boolean, detail?: string) {
  console.log(`${bedingung ? 'ok    ' : 'FEHLER'} ${name}${detail && !bedingung ? ` -> ${detail}` : ''}`);
  if (!bedingung) fehler += 1;
}

function woche(exercises: Array<{ name: string }>): CoachWorkoutWeek {
  return {
    weekFocus: 'Kraftaufbau',
    coachNotes: 'Test',
    assumptions: [],
    applied_constraints: [],
    schedule: [
      {
        day: 'Montag',
        isRest: false,
        sessionType: 'Strength',
        title: 'Ganzkörper',
        estimatedDuration: 60,
        exercises,
      },
      {
        day: 'Dienstag',
        isRest: true,
        sessionType: 'Recovery',
        title: 'Rest day',
        exercises: [],
      },
    ],
  } as CoachWorkoutWeek;
}

const basisInput: WorkoutConstraintInput = {
  availableTrainingDays: ['Montag'],
  allowDoubleSessions: false,
  injuriesPlain: '',
  equipmentIds: ['bodyweight'],
  weekNumber: 2,
};

// 1) Der Live-Fall: 60 Minuten, 3 Übungen, Woche 2 → mindestens 5.
const dreiUebungen = woche([
  { name: 'Bodyweight Squat' },
  { name: 'Push-Up' },
  { name: 'Inverted Row' },
]);

const vorher = validateWorkoutConstraints(dreiUebungen, basisInput);
ok('vorher: Validierung schlaegt fehl', vorher.ok === false);

const repariert = repairStrengthExerciseCount(dreiUebungen, basisInput);
const kraftTag = repariert.schedule[0];
const anzahl = Array.isArray(kraftTag.exercises) ? kraftTag.exercises.length : 0;
ok('nachher: mindestens 5 Uebungen', anzahl >= 5, `gefunden ${anzahl}`);

const nachher = validateWorkoutConstraints(repariert, basisInput);
ok('nachher: Validierung besteht', nachher.ok === true,
  nachher.ok === false ? nachher.violations.map(v => v.code).join(', ') : '');

ok('Hinweis in applied_constraints', (repariert.applied_constraints || []).some(c => c.startsWith('repaired:added_strength_exercises')));
ok('Ruhetag unveraendert', repariert.schedule[1].isRest === true);
ok('Ruhetag ohne Uebungen', (repariert.schedule[1].exercises || []).length === 0);

// 2) Keine Dubletten: vorhandene Uebungen bleiben, nichts doppelt.
const namen = (kraftTag.exercises || []).map(e => String(e.name).toLowerCase());
ok('keine doppelten Uebungen', new Set(namen).size === namen.length, namen.join(', '));
ok('urspruengliche Uebung erhalten', namen.includes('bodyweight squat'));
ok('urspruengliche Uebung erhalten (push)', namen.includes('push-up'));

// 3) Woche 1 (Discovery) braucht weniger.
const woche1: WorkoutConstraintInput = { ...basisInput, weekNumber: 1 };
const r1 = repairStrengthExerciseCount(dreiUebungen, woche1);
const a1 = (r1.schedule[0].exercises || []).length;
ok('Woche 1: mindestens 4 Uebungen', a1 >= 4, `gefunden ${a1}`);

// 4) Genug Uebungen -> unveraendert (kein unnoetiger Eingriff).
const genug = woche([
  { name: 'Bodyweight Squat' },
  { name: 'Glute Bridge' },
  { name: 'Push-Up' },
  { name: 'Inverted Row' },
  { name: 'Plank' },
]);
const r4 = repairStrengthExerciseCount(genug, basisInput);
ok('genug Uebungen: keine Aenderung', JSON.stringify(r4) === JSON.stringify(genug));

// 5) Verletzung: Knie -> keine Knie-belastende Auffuellung.
// Ausgangswoche ist bereits kniekonform (das Injury-Repair laeuft in der Pipeline davor).
const knieWoche = woche([
  { name: 'Glute Bridge' },
  { name: 'Push-Up' },
  { name: 'Inverted Row' },
]);
const knieInput: WorkoutConstraintInput = { ...basisInput, injuriesPlain: '[knee]' };
const r5 = repairStrengthExerciseCount(knieWoche, knieInput);
const namen5 = (r5.schedule[0].exercises || []).map(e => String(e.name).toLowerCase());
const neu5 = namen5.filter(n => !['glute bridge', 'push-up', 'inverted row'].includes(n));
ok('Knie: etwas ergaenzt', namen5.length > 3, namen5.join(', '));
ok('Knie: keine Squat/Lunge ergaenzt', !neu5.some(n => /squat|lunge|step.?up|jump/.test(n)), neu5.join(', '));
const v5 = validateWorkoutConstraints(r5, knieInput);
ok('Knie: Validierung besteht', v5.ok === true,
  v5.ok === false ? v5.violations.map(v => v.code).join(', ') : '');

// 6) Nur Koerpergewicht: keine Kurzhantel-Auffuellung.
const namen6 = (repariert.schedule[0].exercises || []).map(e => String(e.name).toLowerCase());
ok('bodyweight: keine Kurzhantel-Uebung', !namen6.some(n => /dumbbell|kettlebell|barbell/.test(n)), namen6.join(', '));

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler > 0) process.exit(1);
