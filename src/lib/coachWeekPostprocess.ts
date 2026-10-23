/**
 * Post-AI Coach-Woche: Volume-Multiplier, Last-Progression, Continuity-Hints.
 */

import { getEquipmentSubstituteOptions, findInjurySubstitute } from './coachExerciseSubstitute';
import {
  COACH_INJURY_IDS,
  INJURY_BLOCKED_PATTERNS,
  injuryActive,
} from './coachInjuries';
import type { Workout } from '@/src/types';
import { exerciseBlockedByEquipment, effectiveCoachEquipmentIds } from './coachEquipment';
import { suggestSetForExercise } from './progressiveOverload';
import type { CoachWorkoutWeek } from './coachScheduleZod';

function parseSetsCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  return Math.max(1, parseInt(m[1], 10));
}

function parseWeightKg(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || /bw|körpergewicht|bodyweight|rpe|%/.test(s)) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*kg/);
  if (m) return Number(m[1].replace(',', '.'));
  const plain = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (plain) return Number(plain[1].replace(',', '.'));
  return null;
}

function parseOneRmPercent(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  const m = s.match(/(\d{1,3})\s*%\s*(?:1\s*)?rm/i);
  if (!m) return null;
  const pct = Number(m[1]);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : null;
}

/** Skaliert Satzzahlen gemäß volumeMultiplier (Deload/Progression). */
export function applyCoachVolumeMultiplier(
  week: CoachWorkoutWeek,
  volumeMultiplier: number,
): CoachWorkoutWeek {
  const mult = Math.max(0.5, Math.min(1.25, Number(volumeMultiplier) || 1));
  if (Math.abs(mult - 1) < 0.02) return week;

  let touched = 0;
  const schedule = week.schedule.map((day) => {
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    const exercises = day.exercises.map((ex) => {
      const row = { ...(ex as Record<string, unknown>) };
      const sets = parseSetsCount(row.sets);
      if (sets == null) return row;
      const next = Math.max(1, Math.round(sets * mult));
      if (next !== sets) {
        row.sets = next;
        touched += 1;
      }
      return row;
    });
    return { ...day, exercises };
  });

  const ac = [...(week.applied_constraints || [])];
  if (touched) ac.push(`repaired:volume_multiplier=${mult}x_sets=${touched}`);
  return { ...week, schedule: schedule as CoachWorkoutWeek['schedule'], applied_constraints: ac.slice(0, 8) };
}

export type LoadLogHint = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  e1rmKg?: number;
};

/**
 * Setzt Gewichte aus letzten Logs / e1RM-% wenn möglich.
 * Nutzt progressiveOverload-Heuristik auf Workout-Historie.
 */
export function applyCoachWeekLoadProgression(
  week: CoachWorkoutWeek,
  workouts: Workout[],
  opts?: { volumeMultiplier?: number },
): CoachWorkoutWeek {
  if (!workouts.length) return week;
  const deloadish = (opts?.volumeMultiplier ?? 1) < 0.75;
  let applied = 0;

  const schedule = week.schedule.map((day) => {
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    const exercises = day.exercises.map((ex) => {
      const row = { ...(ex as Record<string, unknown>) };
      const name = String(row.name || '').trim();
      if (!name) return row;

      const pct = parseOneRmPercent(row.weight) ?? parseOneRmPercent(row.notes);
      const suggestion = suggestSetForExercise(workouts, name, 0);
      if (!suggestion && pct == null) return row;

      let kg: number | null = suggestion?.weightKg ?? null;
      if (pct != null && suggestion) {
        // e1RM ≈ weight * (1 + reps/30) grob aus letztem Satz
        const e1 = suggestion.weightKg * (1 + suggestion.reps / 30);
        kg = Math.round(e1 * pct * 2) / 2;
      } else if (deloadish && kg != null) {
        kg = Math.round(kg * 0.9 * 2) / 2;
      }

      if (kg == null || !(kg > 0)) return row;
      const existing = parseWeightKg(row.weight);
      // Nur überschreiben wenn leer, %1RM, oder klar unter/über Vorschlag
      if (existing == null || pct != null || Math.abs(existing - kg) / Math.max(kg, 1) > 0.35) {
        row.weight = `${kg} kg`;
        if (!row.reps && suggestion?.reps) row.reps = String(suggestion.reps);
        applied += 1;
      }
      return row;
    });
    return { ...day, exercises };
  });

  const ac = [...(week.applied_constraints || [])];
  if (applied) ac.push(`repaired:load_progression_applied=${applied}`);
  return { ...week, schedule: schedule as CoachWorkoutWeek['schedule'], applied_constraints: ac.slice(0, 8) };
}

/** Prior-Week exerciseKeys als Continuity-Constraint in applied_constraints + Prompt-Hinweis. */
export function annotatePriorExerciseContinuity(
  week: CoachWorkoutWeek,
  priorKeys: string[],
): CoachWorkoutWeek {
  const keys = [...new Set(priorKeys.map((k) => k.trim()).filter(Boolean))].slice(0, 24);
  if (!keys.length) return week;
  const present = new Set<string>();
  for (const day of week.schedule) {
    if (!Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      const k = typeof (ex as any).exerciseKey === 'string' ? (ex as any).exerciseKey.trim() : '';
      if (k) present.add(k);
    }
  }
  const kept = keys.filter((k) => present.has(k)).length;
  const ac = [...(week.applied_constraints || [])];
  ac.push(`continuity:prior_keys=${keys.length},kept=${kept}`);
  return { ...week, applied_constraints: ac.slice(0, 8) };
}

/**
 * Equipment: ersetzen statt nur strippen.
 * Injury: strukturierte Chips + Keywords → kritische Übungen ersetzen.
 */
export function repairEquipmentAndInjuryWithSubstitutes(
  week: CoachWorkoutWeek,
  input: {
    equipmentIds?: string[];
    injuriesPlain?: string;
  },
): CoachWorkoutWeek {
  const equipment = effectiveCoachEquipmentIds(input.equipmentIds);
  const inj = String(input.injuriesPlain || '');
  const activeInjuries = COACH_INJURY_IDS.filter(id => injuryActive(inj, id));

  let substituted = 0;
  let stripped = 0;

  const schedule = week.schedule.map((day) => {
    if (day.isRest === true || !Array.isArray(day.exercises) || !day.exercises.length) return day;
    const nextEx: typeof day.exercises = [];
    for (const row of day.exercises) {
      const r = { ...(row as Record<string, unknown>) };
      const key = typeof r.exerciseKey === 'string' ? r.exerciseKey : '';
      const name = String(r.name || '');

      const blocked = exerciseBlockedByEquipment(name, key, equipment);
      if (blocked) {
        let replaced = false;
        for (const opt of getEquipmentSubstituteOptions(name, key)) {
          if (!exerciseBlockedByEquipment(opt.name, opt.exerciseKey || '', equipment)) {
            r.name = opt.name;
            if (opt.exerciseKey) r.exerciseKey = opt.exerciseKey;
            else delete r.exerciseKey;
            r.notes = [String(r.notes || '').trim(), opt.notes || ''].filter(Boolean).join(' · ');
            substituted += 1;
            nextEx.push(r as (typeof day.exercises)[number]);
            replaced = true;
            break;
          }
        }
        if (replaced) continue;
        stripped += 1;
        continue;
      }

      const hay = `${name} ${key}`;
      for (const injuryId of activeInjuries) {
        if (!INJURY_BLOCKED_PATTERNS[injuryId].test(hay)) continue;
        const sub = findInjurySubstitute(name, key, injuryId);
        if (!sub) continue;
        r.name = sub.name;
        delete r.exerciseKey;
        r.notes = [String(r.notes || '').trim(), sub.notes || ''].filter(Boolean).join(' · ');
        substituted += 1;
        break;
      }

      nextEx.push(r as (typeof day.exercises)[number]);
    }
    return { ...day, exercises: nextEx };
  });

  const ac = [...(week.applied_constraints || [])];
  if (substituted) ac.push(`repaired:substituted_exercises=${substituted}`);
  if (stripped) ac.push(`repaired:stripped_equipment_mismatch=${stripped}`);
  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}

/** Sport-spezifische Cardio-Rails (Bike/Swim/Row vs Run). */
export function normalizeCardioSportRails(
  week: CoachWorkoutWeek,
  sports: string[],
): CoachWorkoutWeek {
  const sportSet = new Set(sports.map((s) => s.toLowerCase()));
  const preferBike = [...sportSet].some((s) => /bike|rad|cycling|ftp/.test(s));
  const preferSwim = [...sportSet].some((s) => /swim|schwimmen/.test(s));
  const preferRow = [...sportSet].some((s) => /row|rudern/.test(s));
  if (!preferBike && !preferSwim && !preferRow) return week;

  let touched = 0;
  const schedule = week.schedule.map((day) => {
    const st = String(day.sessionType || '').toLowerCase();
    if (day.isRest || (!st.includes('cardio') && !st.includes('interval'))) return day;
    const cardio = day.cardio && typeof day.cardio === 'object' ? { ...(day.cardio as Record<string, unknown>) } : {};
    const modality = String(cardio.modality || cardio.sport || cardio.type || 'run').toLowerCase();
    if (/run|lauf|jog/.test(modality) || !modality || modality === 'cardio') {
      if (preferBike) {
        cardio.modality = 'bike';
        if (!cardio.prescription) cardio.prescription = 'Steady / FTP-based; log power or RPE';
        touched += 1;
      } else if (preferSwim) {
        cardio.modality = 'swim';
        if (!cardio.prescription) cardio.prescription = 'Pool intervals; log distance/time/RPE';
        touched += 1;
      } else if (preferRow) {
        cardio.modality = 'row';
        if (!cardio.prescription) cardio.prescription = 'Erg intervals; log split/RPE';
        touched += 1;
      }
    }
    // Strukturierte Intervalle, wenn details nur Prosa
    if (!cardio.intervals && typeof cardio.details === 'string' && /interval|wiederhol|x\s*\d/i.test(cardio.details)) {
      cardio.intervals = {
        note: String(cardio.details).slice(0, 200),
        structure: 'see_notes',
      };
      touched += 1;
    }
    return { ...day, cardio };
  });

  const ac = [...(week.applied_constraints || [])];
  if (touched) ac.push(`repaired:cardio_sport_rails=${touched}`);
  return { ...week, schedule: schedule as CoachWorkoutWeek['schedule'], applied_constraints: ac.slice(0, 8) };
}

type MuscleBucket = 'push' | 'pull' | 'legs' | 'core' | 'other';

function muscleBucketFromName(name: string, key: string): MuscleBucket {
  const hay = `${name} ${key}`.toLowerCase();
  if (/squat|lunge|leg press|bein|quad|glute|hamstring|deadlift|kreuzheb|hip thrust|calf|wade/.test(hay)) {
    return 'legs';
  }
  if (/row|rudern|pull|klimmzug|lat|chin|face pull|rear delt/.test(hay)) return 'pull';
  if (/bench|press|brust|chest|push.?up|liegestütz|overhead|shoulder|schulter|dip|tricep|trizeps/.test(hay)) {
    return 'push';
  }
  if (/plank|crunch|sit.?up|core|ab |abs|oblique|bauch|dead bug|pallof/.test(hay)) return 'core';
  return 'other';
}

/**
 * Prüft Wochen-Muskelbalance und normalisiert setType (drop-set → dropset).
 * Bei starker Schieflage: applied_constraints-Hinweis (Prompt-Retry greift beim nächsten Gen).
 */
export function annotateMuscleGroupBalance(week: CoachWorkoutWeek): CoachWorkoutWeek {
  const counts: Record<MuscleBucket, number> = {
    push: 0,
    pull: 0,
    legs: 0,
    core: 0,
    other: 0,
  };
  let setTypeNormalized = 0;
  let dropOrFailureTagged = 0;

  const schedule = week.schedule.map(day => {
    const st = String(day.sessionType || '').toLowerCase();
    if (day.isRest || !Array.isArray(day.exercises)) return day;
    if (!st.includes('strength') && !st.includes('technique') && !st.includes('cross')) return day;

    const exercises = day.exercises.map((ex, idx) => {
      const r = { ...(ex as Record<string, unknown>) };
      const name = String(r.name || '');
      const key = typeof r.exerciseKey === 'string' ? r.exerciseKey : '';
      const bucket = muscleBucketFromName(name, key);
      counts[bucket] += 1;

      const rawType = r.setType;
      if (rawType != null && String(rawType).trim()) {
        const norm = String(rawType)
          .trim()
          .toLowerCase()
          .replace(/[_\s]+/g, '-');
        const mapped =
          norm === 'drop-set' || norm === 'dropset'
            ? 'dropset'
            : norm === 'warm-up' || norm === 'warmup'
              ? 'warmup'
              : norm === 'failure'
                ? 'failure'
                : norm === 'normal'
                  ? 'normal'
                  : null;
        if (mapped && mapped !== rawType) {
          r.setType = mapped;
          setTypeNormalized += 1;
        }
        if (mapped === 'dropset' || mapped === 'failure') dropOrFailureTagged += 1;
      } else if (idx === day.exercises!.length - 1 && day.exercises!.length >= 3) {
        // Letzte Isolation: Dropset vorschlagen, wenn Coach nichts gesetzt hat
        r.setType = 'dropset';
        dropOrFailureTagged += 1;
        setTypeNormalized += 1;
      } else if (!r.setType) {
        r.setType = 'normal';
      }
      return r;
    });

    return { ...day, exercises };
  });

  const ac = [...(week.applied_constraints || [])];
  if (setTypeNormalized) ac.push(`repaired:setType_normalized=${setTypeNormalized}`);
  if (dropOrFailureTagged) ac.push(`setType:drop_or_failure=${dropOrFailureTagged}`);

  const main = counts.push + counts.pull + counts.legs + counts.core;
  if (main >= 6) {
    const missing: string[] = [];
    if (counts.push === 0) missing.push('push');
    if (counts.pull === 0) missing.push('pull');
    if (counts.legs === 0) missing.push('legs');
    if (counts.core === 0) missing.push('core');
    if (missing.length) {
      ac.push(`warn:muscle_balance_missing=${missing.join('+')}`);
    } else {
      ac.push(
        `muscle_balance:push=${counts.push},pull=${counts.pull},legs=${counts.legs},core=${counts.core}`,
      );
    }
  }

  return {
    ...week,
    schedule: schedule as CoachWorkoutWeek['schedule'],
    applied_constraints: ac.slice(0, 8),
  };
}
