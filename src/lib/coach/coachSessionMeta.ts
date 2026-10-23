export interface CoachSessionMeta {
  planId: string;
  weekNumber: number;
  sessionKey: string;
  plannedDay: string;
  sessionSlot?: string;
  title?: string;
}

export function buildPlannedSessionKey(
  plannedDay: string,
  title: string,
  sessionSlot?: string,
): string {
  const slot = (sessionSlot || 'default').toLowerCase();
  const t = title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'session';
  return `${plannedDay}::${slot}::${t}`;
}

export function parseCoachSessionMeta(raw: unknown): CoachSessionMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const planId = String(o.planId ?? '');
  const sessionKey = String(o.sessionKey ?? '');
  const plannedDay = String(o.plannedDay ?? '');
  if (!planId || !sessionKey || !plannedDay) return null;
  return {
    planId,
    weekNumber: Math.max(1, Number(o.weekNumber) || 1),
    sessionKey,
    plannedDay,
    sessionSlot: o.sessionSlot != null ? String(o.sessionSlot) : undefined,
    title: o.title != null ? String(o.title) : undefined,
  };
}
