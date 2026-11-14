/**
 * Flache Template-Liste mit optionalen `structureParentId`-Verweisen:
 * Blöcke (Trainingsstruktur) können Übungen und verschachtelte Blöcke enthalten.
 */

import type { Exercise } from '@/src/types';

export function isStructureBlockExercise(ex: Exercise | undefined): boolean {
  return ex != null && ex.blockFormat != null && ex.blockFormat !== 'normal';
}

function indexById(list: Exercise[]): Map<string, number> {
  const m = new Map<string, number>();
  list.forEach((e, i) => {
    if (e.id) m.set(e.id, i);
  });
  return m;
}

function isRootInList(e: Exercise, list: Exercise[]): boolean {
  if (!e.structureParentId) return true;
  return !list.some(x => x.id === e.structureParentId);
}

/** Erste Wurzel-Reihenfolge wie in der gespeicherten Liste (ohne Kinder-Zeilen). */
export function rootsInListOrder(list: Exercise[]): Exercise[] {
  const seen = new Set<string>();
  const out: Exercise[] = [];
  for (const e of list) {
    if (!isRootInList(e, list)) continue;
    const id = e.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

export function childrenSorted(list: Exercise[], parentId: string): Exercise[] {
  const idx = indexById(list);
  return list.filter(e => e.structureParentId === parentId).sort((a, b) => {
    const ia = a.id ? idx.get(a.id) ?? 0 : 0;
    const ib = b.id ? idx.get(b.id) ?? 0 : 0;
    return ia - ib;
  });
}

function appendBlockTree(out: Exercise[], list: Exercise[], block: Exercise, visited: Set<string>) {
  const bid = block.id;
  if (!bid || visited.has(bid)) return;
  visited.add(bid);
  out.push(block);
  for (const c of childrenSorted(list, bid)) {
    if (visited.has(c.id!)) continue;
    if (isStructureBlockExercise(c)) {
      appendBlockTree(out, list, c, visited);
    } else {
      visited.add(c.id!);
      out.push(c);
    }
  }
}

/**
 * Reihenfolge für den Session-Player: Wurzeln wie in der Liste, nach jedem Struktur-Block dessen Kinder (DFS).
 */
export function flattenExercisesForSession(list: Exercise[]): Exercise[] {
  if (list.length === 0) return [];
  const roots = rootsInListOrder(list);
  const out: Exercise[] = [];
  const visited = new Set<string>();
  for (const r of roots) {
    const id = r.id;
    if (!id || visited.has(id)) continue;
    if (isStructureBlockExercise(r)) {
      appendBlockTree(out, list, r, visited);
    } else {
      visited.add(id);
      out.push(r);
    }
  }
  return out;
}

export function collectDescendantIds(list: Exercise[], rootId: string): Set<string> {
  const acc = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const pid = stack.pop()!;
    for (const e of list) {
      if (e.structureParentId === pid && e.id && !acc.has(e.id)) {
        acc.add(e.id);
        stack.push(e.id);
      }
    }
  }
  return acc;
}

export function removeExerciseWithDescendants(list: Exercise[], exerciseId: string): Exercise[] {
  const drop = collectDescendantIds(list, exerciseId);
  drop.add(exerciseId);
  return list.filter(e => e.id && !drop.has(e.id));
}
