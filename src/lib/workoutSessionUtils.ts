/**
 * Session-Player: Supersatz-Gruppierung, Satztypen, Speichern für Statistik.
 */

import type { Exercise, SetDetail } from '@/src/types';

export const SET_TYPE_CYCLE: SetDetail['type'][] = ['normal', 'warmup', 'dropset', 'failure'];

/** Coach-Prompt nutzt oft „drop-set“ — auf App-Enum normalisieren. */
export function normalizeSetType(raw: unknown): SetDetail['type'] {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (s === 'warmup' || s === 'warm-up' || s === 'wu') return 'warmup';
  if (s === 'dropset' || s === 'drop-set' || s === 'drop') return 'dropset';
  if (s === 'failure' || s === 'amrap-failure' || s === 'to-failure') return 'failure';
  return 'normal';
}

export function cycleSetType(current: SetDetail['type']): SetDetail['type'] {
  const i = SET_TYPE_CYCLE.indexOf(current);
  return SET_TYPE_CYCLE[(i + 1) % SET_TYPE_CYCLE.length];
}

export function isSetDetailArray(sets: Exercise['sets']): sets is SetDetail[] {
  return (
    Array.isArray(sets) &&
    sets.length > 0 &&
    typeof sets[0] === 'object' &&
    sets[0] != null &&
    'reps' in sets[0]
  );
}

export function isBlockMetaExercise(ex: Exercise | undefined): boolean {
  return !!ex?.blockFormat && ex.blockFormat !== 'normal';
}

export function isCardioExercise(ex: Exercise): boolean {
  return ex.exerciseCategory === 'cardio';
}

export type SessionDisplayItem =
  | { kind: 'single'; exIdx: number }
  | { kind: 'superset'; group: string; exIndices: number[] }
  | { kind: 'circuit'; blockExIdx: number; childExIndices: number[] };

export function isCircuitBlock(ex: Exercise): boolean {
  if (!isBlockMetaExercise(ex)) return false;
  const f = ex.blockFormat;
  return f === 'circuit' || f === 'hiit_tabata' || f === 'intervals' || f === 'emom' || f === 'amrap';
}

function collectBlockChildren(exercises: Exercise[], blockId: string, from: number): number[] {
  const out: number[] = [];
  for (let j = from; j < exercises.length; j++) {
    if (exercises[j].structureParentId === blockId) out.push(j);
    else if (out.length > 0) break;
  }
  return out;
}

/** Reihenfolge beibehalten: Supersätze, Zirkel-Blöcke, Einzelübungen. */
/** Flache Übungs-Indizes für die Session-Leiste (ohne Zirkel-Kinder doppelt). */
export function getRailExerciseIndices(exercises: Exercise[]): number[] {
  const out: number[] = [];
  const used = new Set<number>();
  let i = 0;
  while (i < exercises.length) {
    if (used.has(i)) {
      i++;
      continue;
    }
    const ex = exercises[i];
    if (isBlockMetaExercise(ex) && ex.id && isCircuitBlock(ex)) {
      const children: number[] = [];
      for (let j = i + 1; j < exercises.length; j++) {
        if (exercises[j].structureParentId === ex.id) children.push(j);
        else if (children.length > 0) break;
      }
      if (children.length) {
        out.push(...children);
        used.add(i);
        for (const c of children) used.add(c);
        i = Math.max(...children) + 1;
        continue;
      }
    }
    if (!ex.structureParentId) {
      out.push(i);
      used.add(i);
    }
    i++;
  }
  return out;
}

export function buildSessionDisplayItems(exercises: Exercise[]): SessionDisplayItem[] {
  const items: SessionDisplayItem[] = [];
  const used = new Set<number>();
  let i = 0;
  while (i < exercises.length) {
    if (used.has(i)) {
      i++;
      continue;
    }
    const ex = exercises[i];

    if (isBlockMetaExercise(ex) && ex.id) {
      const children = collectBlockChildren(exercises, ex.id, i + 1);
      if (children.length && isCircuitBlock(ex)) {
        items.push({ kind: 'circuit', blockExIdx: i, childExIndices: children });
        used.add(i);
        for (const c of children) used.add(c);
        i = Math.max(...children) + 1;
        continue;
      }
    }

    const group = ex.supersetGroup?.trim();
    if (group && !ex.structureParentId) {
      const exIndices = [i];
      let j = i + 1;
      while (j < exercises.length && exercises[j].supersetGroup?.trim() === group && !used.has(j)) {
        exIndices.push(j);
        j++;
      }
      items.push({ kind: 'superset', group, exIndices });
      for (const idx of exIndices) used.add(idx);
      i = j;
      continue;
    }

    if (!ex.structureParentId) {
      items.push({ kind: 'single', exIdx: i });
      used.add(i);
    }
    i++;
  }
  return items;
}

/** Nur abgeschlossene Sätze pro Übung; Übungen ohne abgeschlossenen Satz entfallen. */
export function sanitizeExercisesForSave(exercises: Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  for (const ex of exercises) {
    if (!isSetDetailArray(ex.sets)) continue;
    const completed = ex.sets.filter(s => s.completed);
    if (completed.length === 0) continue;
    out.push({ ...ex, sets: completed.map(s => ({ ...s, completed: true })) });
  }
  return out;
}

export function exerciseIsFullyCompleted(ex: Exercise): boolean {
  if (!isSetDetailArray(ex.sets) || ex.sets.length === 0) return false;
  return ex.sets.every(s => s.completed);
}

/** Nächster Fokus im Supersatz: gleicher Satzindex bei Partner-Übung, dann nächste Satz-Runde. */
export function nextSupersetFocus(
  exercises: Exercise[],
  exIdx: number,
  setIdx: number,
): { exIdx: number; setIdx: number } | null {
  const group = exercises[exIdx]?.supersetGroup?.trim();
  if (!group) return null;

  const indices: number[] = [];
  for (let i = 0; i < exercises.length; i++) {
    if (exercises[i].supersetGroup?.trim() === group) indices.push(i);
  }
  if (indices.length < 2) return null;

  const pos = indices.indexOf(exIdx);
  if (pos < 0) return null;

  for (let k = 1; k < indices.length; k++) {
    const ni = indices[(pos + k) % indices.length];
    const sets = exercises[ni].sets;
    if (!Array.isArray(sets) || !sets.length) continue;
    const row = sets as SetDetail[];
    if (setIdx < row.length && !row[setIdx].completed) return { exIdx: ni, setIdx };
  }

  const maxSets = Math.max(
    ...indices.map(i => (Array.isArray(exercises[i].sets) ? (exercises[i].sets as SetDetail[]).length : 0)),
  );
  if (setIdx + 1 < maxSets) {
    for (const ni of indices) {
      const row = exercises[ni].sets as SetDetail[];
      if (setIdx + 1 < row.length && !row[setIdx + 1].completed) {
        return { exIdx: ni, setIdx: setIdx + 1 };
      }
    }
  }
  return null;
}

/** Supersatz-Runde für setIdx auf allen Partnern abgeschlossen? */
export function supersetRoundComplete(
  exercises: Exercise[],
  exIdx: number,
  setIdx: number,
): boolean {
  const group = exercises[exIdx]?.supersetGroup?.trim();
  if (!group) return true;
  for (let i = 0; i < exercises.length; i++) {
    if (exercises[i].supersetGroup?.trim() !== group) continue;
    const sets = exercises[i].sets;
    if (!Array.isArray(sets) || setIdx >= sets.length) continue;
    if (!(sets as SetDetail[])[setIdx].completed) return false;
  }
  return true;
}

/** Nächster Übungsindex (global) nach exIdx — optional innerhalb Supersatz. */
export function findNextExerciseIndex(
  exercises: Exercise[],
  fromExIdx: number,
  opts?: { supersetGroup?: string },
): number | null {
  const group = opts?.supersetGroup?.trim();
  if (group) {
    for (let i = fromExIdx + 1; i < exercises.length; i++) {
      if (exercises[i].supersetGroup?.trim() === group) return i;
    }
  }
  for (let i = fromExIdx + 1; i < exercises.length; i++) {
    if (!exerciseIsFullyCompleted(exercises[i])) return i;
  }
  return null;
}

export function inputId(
  exIdx: number,
  setIdx: number,
  field: 'weight' | 'reps' | 'duration' | 'distance' | 'rpe',
): string {
  return `session-${exIdx}-${setIdx}-${field}`;
}
