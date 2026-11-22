/**
 * Selbsttest für den Intervals-Workout-Sync (ohne Netz – `call` ist ein Fake):
 *   npx tsx scripts/intervals-workout-sync-selftest.ts
 */
import {
  deleteEvent,
  intervalsTypeFor,
  planSync,
  syncWorkout,
  workoutHash,
  type SyncCall,
} from '../src/lib/intervalsWorkoutSync';

let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) {
    fehler += 1;
    console.error(`FEHLER ${name}: ist=${JSON.stringify(ist)} soll=${JSON.stringify(soll)}`);
  } else {
    console.log(`ok     ${name}`);
  }
}

const workout = {
  id: 'w-1',
  name: 'GK-Zirkel',
  type: 'strength',
  duration: 45,
  date: '2026-11-24',
  exercises: [
    { name: 'Kniebeuge', sets: 4, reps: 8, weight: 60 },
    { name: 'Bankdrücken', sets: 3, reps: 10, weight: 40 },
  ],
  notes: 'Fokus Technik',
};

// Sportart-Zuordnung
pruefe('strength -> WeightTraining', intervalsTypeFor('strength'), 'WeightTraining');
pruefe('Kraft -> WeightTraining', intervalsTypeFor('Kraft'), 'WeightTraining');
pruefe('cardio -> Run', intervalsTypeFor('cardio'), 'Run');
pruefe('unbekannt -> Other', intervalsTypeFor('irgendwas'), 'Other');

// Hash: stabil bei gleichen Daten, anders bei Änderung
const h1 = workoutHash(workout);
const h2 = workoutHash({ ...workout });
pruefe('Hash stabil', h1 === h2, true);
pruefe('Hash ändert sich bei neuer Übung', workoutHash({ ...workout, name: 'GK-Zirkel B' }) !== h1, true);
pruefe('Hash ignoriert Reihenfolge-fremde Felder', workoutHash({ ...workout, caloriesBurned: 999 }) === h1, true);

// planSync-Logik
pruefe('ohne Event -> create', planSync(workout, null).action, 'create');
pruefe('gleicher Hash -> skip', planSync(workout, { intervalsEventId: '42', intervalsHash: h1 }).action, 'skip');
pruefe('geänderter Hash -> update', planSync({ ...workout, duration: 60 }, { intervalsEventId: '42', intervalsHash: h1 }).action, 'update');
pruefe('Event ohne Hash -> update', planSync(workout, { intervalsEventId: '42', intervalsHash: '' }).action, 'update');

// Fake-API: zeichnet Aufrufe auf
function fakeApi(antwort: unknown = { id: 777 }): { call: SyncCall; aufrufe: string[] } {
  const aufrufe: string[] = [];
  const call: SyncCall = async (method, path) => {
    aufrufe.push(`${method} ${path}`);
    return antwort;
  };
  return { call, aufrufe };
}

(async () => {
  // Anlegen
  const a = fakeApi({ id: 777 });
  const r1 = await syncWorkout(a.call, workout, '0', null);
  pruefe('create: Aktion', r1.action, 'create');
  pruefe('create: Event-ID übernommen', r1.eventId, '777');
  pruefe('create: ein POST', a.aufrufe, ['POST /athlete/0/events']);

  // Unverändert -> kein Aufruf
  const b = fakeApi();
  const r2 = await syncWorkout(b.call, workout, '0', { intervalsEventId: '777', intervalsHash: r1.hash });
  pruefe('skip: keine Anfrage', [r2.action, b.aufrufe.length], ['skip', 0]);

  // Geändert -> PUT auf dieselbe Event-ID
  const c = fakeApi({});
  const r3 = await syncWorkout(c.call, { ...workout, duration: 60 }, '0', { intervalsEventId: '777', intervalsHash: r1.hash });
  pruefe('update: Aktion + Pfad', [r3.action, c.aufrufe[0]], ['update', 'PUT /athlete/0/events/777']);

  // Löschen
  const d = fakeApi({});
  await deleteEvent(d.call, '0', '777');
  pruefe('delete: Pfad', d.aufrufe, ['DELETE /athlete/0/events/777']);

  // Löschen, wenn schon weg (404) -> kein Fehler
  const e: SyncCall = async () => {
    throw new Error('Intervals.icu antwortete mit HTTP 404.');
  };
  let ok = true;
  try {
    await deleteEvent(e, '0', '999');
  } catch {
    ok = false;
  }
  pruefe('delete: 404 wird geschluckt', ok, true);

  console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
  if (fehler > 0) process.exitCode = 1;
})();
