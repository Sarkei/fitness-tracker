/**
 * Offline-Warteschlange für Workouts, wenn POST fehlschlägt.
 */

import type { Workout } from '@/src/types';

const QUEUE_KEY = 'vrtx_workout_offline_queue';

export type QueuedWorkout = Omit<Workout, 'id'> & { queuedAt: string; localId: string };

export function loadOfflineWorkoutQueue(): QueuedWorkout[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedWorkout[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedWorkout[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueueOfflineWorkout(workout: Omit<Workout, 'id'>): string {
  const localId = `local-${Date.now()}`;
  const q = loadOfflineWorkoutQueue();
  q.push({ ...workout, localId, queuedAt: new Date().toISOString() });
  saveQueue(q);
  return localId;
}

export function dequeueOfflineWorkout(localId: string) {
  saveQueue(loadOfflineWorkoutQueue().filter(w => w.localId !== localId));
}
