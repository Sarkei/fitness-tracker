/**
 * Übung durch Katalog-Eintrag ersetzen (Tausch): keine alten Coach-Gewichte / Sätze übernehmen.
 */

import type { Exercise, SetDetail } from '@/src/types';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import { getLibraryExercise } from '@/src/lib/exerciseLibrary';

const BODYWEIGHT_NAME_RE =
  /push[\s-]?up|liegestütz|liegestutze|pull[\s-]?up|klimmzug|chin[\s-]?up|muscle[\s-]?up|\bdips?\b|plank|burpee|sit[\s-]?up|air squat|bodyweight|mountain climber|pike push|inverted row|hanging|leg raise|glute bridge|step[\s-]?up/i;

/** Langhantel-/Maschinenübungen — nie als reines Körpergewicht behandeln (auch bei falschem Coach-Text). */
const WEIGHTED_STRENGTH_NAME_RE =
  /kreuzheb|deadlift|\brdl\b|rumänisch|bankdrück|bench\s*press|kniebeug|\bsquat\b|hip\s*thrust|langhantel|barbell|overhead\s*press|military\s*press|schulterdrück|beinpress|leg\s*press|hacksquat|hip\s*thrust|kabelzug|cable\s*row|lat\s*pulldown|schrägbank/i;

const PURE_BODYWEIGHT_EQUIP_RE = /^(body\s*weight|bodyweight|eigengewicht|assisted body weight)$/i;

function equipmentIsPureBodyweight(equipment: string): boolean {
  const parts = equipment
    .split(/[,;/]/)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(p => PURE_BODYWEIGHT_EQUIP_RE.test(p));
}

export function isClearlyWeightedStrengthExercise(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return WEIGHTED_STRENGTH_NAME_RE.test(n);
}

/** Körpergewicht anhand Name / ExerciseDB-Equipment (vor veralteter Coach-Vorgabe). */
export function isBodyweightByNameOrEquipment(name: string, exerciseKey?: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (isClearlyWeightedStrengthExercise(n)) return false;
  if (BODYWEIGHT_NAME_RE.test(n)) return true;
  if (/körpergewicht|body\s*weight|eigengewicht/i.test(n)) return true;
  const lib = exerciseKey ? getLibraryExercise(exerciseKey) : undefined;
  if (!lib?.equipment) return false;
  const eq = lib.equipment.trim().toLowerCase();
  if (!eq) return false;
  if (equipmentIsPureBodyweight(eq)) return true;
  return false;
}

function defaultSetCount(prev: Exercise | undefined, cardio: boolean): number {
  if (cardio) return 1;
  if (typeof prev?.sets === 'number') return Math.max(1, prev.sets);
  if (Array.isArray(prev?.sets)) return Math.max(1, prev.sets.length);
  return 3;
}

function freshStrengthSets(count: number, reps: number): SetDetail[] {
  return Array.from({ length: count }, () => ({
    reps,
    weight: 0,
    completed: false,
    type: 'normal' as const,
  }));
}

export type BuildSwappedExerciseOpts = {
  keepId?: string;
  sessionPhase?: Exercise['sessionPhase'];
  blockFormat?: Exercise['blockFormat'];
};

/** Neue Übung für Live-Session / Editor — ohne coachPrescription der Vorgänger-Übung. */
/** Gewichtszeile in Coach-/Plan-Übersicht (ohne falsche kg bei Liegestützen & Co.). */
export function formatCoachRowWeightDisplay(ex: Record<string, unknown>): string | null {
  const name = String(ex.name ?? '');
  const key = typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined;
  if (isBodyweightByNameOrEquipment(name, key)) return null;
  const w = ex.weight;
  if (w == null || w === '') return null;
  if (typeof w === 'number') {
    if (!Number.isFinite(w) || w <= 0) return null;
    return `${w}kg`;
  }
  const s = String(w).trim();
  if (!s || s === '0' || /^0\s*kg$/i.test(s)) return null;
  if (/körpergewicht|body\s*weight|eigengewicht/i.test(s)) return null;
  return s;
}

export function buildSwappedExercise(
  prev: Exercise | undefined,
  repl: LibraryExercise,
  opts: BuildSwappedExerciseOpts = {},
): Exercise {
  const cardio = repl.category === 'cardio';
  const setCount = defaultSetCount(prev, cardio);
  const reps = cardio ? 30 : (prev?.reps && prev.reps > 0 ? prev.reps : 10);
  const bodyweight = isBodyweightByNameOrEquipment(repl.name, repl.key);

  const base: Exercise = {
    id: opts.keepId || prev?.id || `ex-${Date.now()}`,
    exerciseKey: repl.key,
    name: repl.name,
    exerciseCategory: repl.category,
    gifUrl: repl.gifUrl,
    blockFormat: opts.blockFormat ?? prev?.blockFormat ?? 'normal',
    sessionPhase: opts.sessionPhase ?? prev?.sessionPhase,
    reps,
    weight: 0,
    sets: cardio
      ? 1
      : bodyweight
        ? freshStrengthSets(setCount, reps)
        : setCount,
    coachPrescription: undefined,
    notes: undefined,
  };

  if (cardio) {
    return {
      ...base,
      sets: [{ reps, weight: 0, completed: false, type: 'normal' }],
    };
  }

  if (bodyweight) {
    return {
      ...base,
      weight: 0,
      coachPrescription: {
        weightLabel: 'Körpergewicht',
        targetReps: reps,
        targetSets: setCount,
      },
      sets: freshStrengthSets(setCount, reps),
    };
  }

  return base;
}
