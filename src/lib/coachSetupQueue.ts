/**
 * Nach App-Onboarding: KI-Coach nacheinander für Workout und/oder Nutrition öffnen.
 */

const STORAGE_KEY = 'vrtx_coach_queue';

export type CoachSetupKind = 'workout' | 'nutrition';

export function setCoachSetupQueue(queue: CoachSetupKind[]): void {
  if (!queue.length) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function peekCoachSetupQueue(): CoachSetupKind[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is CoachSetupKind => x === 'workout' || x === 'nutrition');
  } catch {
    return [];
  }
}

export function shiftCoachSetupQueue(): CoachSetupKind | null {
  const q = peekCoachSetupQueue();
  if (!q.length) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  const [next, ...rest] = q;
  setCoachSetupQueue(rest);
  return next;
}

/** Entfernt abgeschlossenen Typ und liefert den nächsten aus der Warteschlange. */
export function advanceCoachSetupQueue(completed: CoachSetupKind): CoachSetupKind | null {
  const rest = peekCoachSetupQueue().filter(k => k !== completed);
  if (!rest.length) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  setCoachSetupQueue(rest);
  return rest[0];
}

export function coachSetupPath(kind: CoachSetupKind): string {
  return `/coach?type=${kind}&coachOnboarding=1`;
}
