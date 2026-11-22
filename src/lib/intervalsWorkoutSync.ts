/**
 * Trainings aus der App nach Intervals.icu übertragen (und dort aktuell halten).
 *
 * Ziel: Wer seine Einheit in der App baut, sieht sie anschließend auf der Uhr — und
 * beim Löschen oder Bearbeiten bleibt bei Intervals kein alter Eintrag zurück.
 *
 * Zuordnung: Jedes Workout merkt sich die Intervals-Event-ID (`intervalsEventId`).
 * Erst dadurch ist Löschen/Aktualisieren eindeutig; ohne gemerkte ID würde jede
 * Änderung ein neues Event erzeugen und die Uhr vollmüllen.
 *
 * Die HTTP-Aufrufe werden übergeben (`call`), damit dieses Modul ohne Netz testbar ist
 * (siehe scripts/intervals-workout-sync-selftest.ts).
 */

export type SyncCall = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
) => Promise<unknown>;

export type AppWorkout = {
  id: string | number;
  name?: string | null;
  type?: string | null;
  duration?: number | null;
  caloriesBurned?: number | null;
  date?: string | null;
  notes?: string | null;
  exercises?: unknown;
};

export type SyncState = {
  intervalsEventId?: string | null;
  intervalsHash?: string | null;
};

export type SyncPlan = {
  action: 'create' | 'update' | 'skip';
  /** Warum nichts passiert (nur bei skip gesetzt). */
  reason?: string;
  hash: string;
  eventId?: string;
};

const BASE = '/athlete';

/** Datum als YYYY-MM-DD — akzeptiert Date (aus der DB), ISO-String oder Timestamp. */
function ymd(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value ?? '');
  const match = /^\d{4}-\d{2}-\d{2}/.exec(s);
  return match ? match[0] : '';
}

/** Sportart der App auf Intervals-Typen abbilden. */
export function intervalsTypeFor(workoutType: string | null | undefined): string {
  const t = (workoutType || '').toLowerCase();
  if (['kraft', 'strength', 'weights', 'weight', 'weighttraining'].includes(t)) return 'WeightTraining';
  if (['cardio', 'laufen', 'run', 'running'].includes(t)) return 'Run';
  if (['rad', 'bike', 'cycling', 'fahrrad'].includes(t)) return 'Ride';
  if (['schwimmen', 'swim', 'swimming'].includes(t)) return 'Swim';
  if (['yoga'].includes(t)) return 'Yoga';
  if (['rudern', 'row', 'rowing'].includes(t)) return 'Rowing';
  if (['hiit'].includes(t)) return 'HIIT';
  if (['gehen', 'walk', 'walking'].includes(t)) return 'Walk';
  return 'Other';
}

/** Übungen als lesbaren Beschreibungstext (Intervals zeigt ihn am Event). */
export function beschreibungFuer(workout: AppWorkout): string {
  const exercises = Array.isArray(workout.exercises) ? (workout.exercises as Record<string, unknown>[]) : [];
  const zeilen: string[] = [];
  for (const ex of exercises.slice(0, 40)) {
    const name = String(ex?.name ?? ex?.exerciseName ?? '').trim();
    if (!name) continue;
    const sets = Number(ex?.sets ?? ex?.setCount ?? 0);
    const reps = ex?.reps ?? ex?.repetitions ?? '';
    const weight = ex?.weight ?? ex?.kg ?? '';
    const teile = [name];
    if (sets > 0) teile.push(`${sets}×`);
    if (reps !== '' && reps != null) teile.push(`${reps}`);
    const zeile = teile.join(' ');
    zeilen.push(weight !== '' && weight != null ? `${zeile} @ ${weight} kg` : zeile);
  }
  const extra = workout.notes?.trim() ? `\n\n${workout.notes.trim()}` : '';
  return zeilen.length ? `${zeilen.join('\n')}${extra}` : (workout.notes?.trim() || '');
}

/**
 * Stabiler Fingerabdruck des Workouts: alles, was nach Intervals geht.
 * Ändert sich nur, wenn sich Inhalt oder Datum ändert — nicht durch bloßes Speichern.
 */
export function workoutHash(workout: AppWorkout): string {
  const payload = {
    name: (workout.name ?? '').trim(),
    date: ymd(workout.date),
    type: intervalsTypeFor(workout.type),
    duration: Number(workout.duration ?? 0) || 0,
    description: beschreibungFuer(workout),
  };
  return JSON.stringify(payload);
}

/** Event-Körper für Intervals.icu. */
export function eventBody(workout: AppWorkout, athleteId: string): Record<string, unknown> {
  const date = ymd(workout.date);
  const beschreibung = beschreibungFuer(workout);
  const dauer = Number(workout.duration ?? 0) || 0;
  return {
    category: 'WORKOUT',
    start_date_local: `${date}T00:00:00`,
    name: (workout.name ?? 'Training').slice(0, 120),
    description: beschreibung,
    type: intervalsTypeFor(workout.type),
    // Garmin/Vorschau: Dauer als Zeitvorgabe, damit die Uhr die Einheit anzeigt
    ...(dauer > 0
      ? { moving_time: Math.round(dauer * 60), time_target: Math.round(dauer * 60) }
      : {}),
    // Kalorien nur als Notiz – Intervals kennt kein kcal-Ziel am Event
    external_id: `vrtx-${workout.id}`,
    athlete_id: athleteId,
  };
}

/**
 * Entscheidet ohne Netz, was zu tun ist:
 *  - kein Event gemerkt, noch nie gesendet  -> create
 *  - Event gemerkt, Inhalt gleich           -> skip (nichts hochladen)
 *  - Event gemerkt, Inhalt geändert         -> update
 */
export function planSync(workout: AppWorkout, state: SyncState | null | undefined): SyncPlan {
  const hash = workoutHash(workout);
  const eventId = state?.intervalsEventId ?? '';
  const alterHash = state?.intervalsHash ?? '';
  if (!eventId) return { action: 'create', hash };
  if (alterHash && alterHash === hash) return { action: 'skip', reason: 'unveraendert', hash, eventId };
  return { action: 'update', hash, eventId };
}

/** Termin bei Intervals anlegen und Event-ID zurückgeben. */
export async function createEvent(
  call: SyncCall,
  workout: AppWorkout,
  athleteId: string,
): Promise<{ eventId: string; hash: string }> {
  const created = (await call('POST', `${BASE}/${encodeURIComponent(athleteId || '0')}/events`, eventBody(workout, athleteId))) as
    | { id?: string | number }
    | null;
  const id = created?.id != null ? String(created.id) : '';
  if (!id) throw new Error('Intervals.icu hat keine Event-ID zurückgegeben.');
  return { eventId: id, hash: workoutHash(workout) };
}

/** Bestehenden Termin überschreiben (gleiche ID, kein Duplikat). */
export async function updateEvent(
  call: SyncCall,
  workout: AppWorkout,
  athleteId: string,
  eventId: string,
): Promise<{ eventId: string; hash: string }> {
  await call(
    'PUT',
    `${BASE}/${encodeURIComponent(athleteId || '0')}/events/${encodeURIComponent(eventId)}`,
    eventBody(workout, athleteId),
  );
  return { eventId, hash: workoutHash(workout) };
}

/** Termin entfernen. 404 gilt als „schon weg". */
export async function deleteEvent(call: SyncCall, athleteId: string, eventId: string): Promise<void> {
  try {
    await call('DELETE', `${BASE}/${encodeURIComponent(athleteId || '0')}/events/${encodeURIComponent(eventId)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|not found/i.test(msg)) return;
    throw e;
  }
}

/** Führt den geplanten Schritt aus (oder tut nichts). */
export async function syncWorkout(
  call: SyncCall,
  workout: AppWorkout,
  athleteId: string,
  state: SyncState | null | undefined,
): Promise<{ action: SyncPlan['action']; eventId?: string; hash: string; reason?: string }> {
  const plan = planSync(workout, state);
  if (plan.action === 'skip') return { action: 'skip', eventId: plan.eventId, hash: plan.hash, reason: plan.reason };
  if (plan.action === 'create') {
    const r = await createEvent(call, workout, athleteId);
    return { action: 'create', ...r };
  }
  const r = await updateEvent(call, workout, athleteId, plan.eventId!);
  return { action: 'update', ...r };
}
