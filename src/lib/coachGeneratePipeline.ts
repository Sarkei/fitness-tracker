import { parseJsonLoose } from './parseCoachJson';
import {
  coachNutritionWeekSchema,
  coachWorkoutWeekSchema,
  type CoachNutritionWeek,
  type CoachWorkoutWeek,
} from './coachScheduleZod';
import { alignScheduleToCustomAssignments } from './coachCustomScheduleAlign';
import {
  repairUnknownExerciseKeys,
  repairWorkoutScheduleConstraints,
  validateWorkoutConstraints,
  type WorkoutConstraintInput,
} from './coachConstraints';
import { finalizeCoachNutritionWeek } from './coachNutritionPostprocess';
import {
  annotatePriorExerciseContinuity,
  annotateMuscleGroupBalance,
  applyCoachVolumeMultiplier,
  applyCoachWeekLoadProgression,
  normalizeCardioSportRails,
} from './coachWeekPostprocess';
import type { Workout } from '@/src/types';

function omitNullFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null) out[k] = v;
  }
  return out;
}

function sanitizeCoachScheduleDay(day: unknown): unknown {
  if (!day || typeof day !== 'object') return day;
  const d = omitNullFields(day as Record<string, unknown>);

  const normalizeExerciseRow = (rowIn: Record<string, unknown>): Record<string, unknown> => {
    const row = omitNullFields(rowIn);
    if (row.exerciseKey === null || row.exerciseKey === '') delete row.exerciseKey;
    if (typeof row.rest === 'number' && Number.isFinite(row.rest)) {
      row.rest = `${Math.max(0, Math.round(row.rest))}s`;
    }
    if (typeof row.reps === 'number' && Number.isFinite(row.reps)) {
      row.reps = String(Math.max(0, Math.round(row.reps)));
    }
    if (typeof row.weight === 'number' && Number.isFinite(row.weight)) {
      row.weight = `${Math.round(row.weight)} kg`;
    }
    return row;
  };

  if (d.isRest === true) {
    d.exercises = [];
    delete d.cardio;
  }

  if (Array.isArray(d.exercises)) {
    d.exercises = d.exercises.map((ex) => {
      if (!ex || typeof ex !== 'object') return ex;
      return normalizeExerciseRow(ex as Record<string, unknown>);
    });
  }

  if (Array.isArray(d.warmupExercises)) {
    d.warmupExercises = d.warmupExercises.map((ex) => {
      if (!ex || typeof ex !== 'object') return ex;
      return normalizeExerciseRow(ex as Record<string, unknown>);
    });
  }

  if (Array.isArray(d.cooldownExercises)) {
    d.cooldownExercises = d.cooldownExercises.map((ex) => {
      if (!ex || typeof ex !== 'object') return ex;
      return normalizeExerciseRow(ex as Record<string, unknown>);
    });
  }

  if (d.cardio === null) {
    delete d.cardio;
  } else if (d.cardio && typeof d.cardio === 'object') {
    d.cardio = omitNullFields(d.cardio as Record<string, unknown>);
  }

  return d;
}

/** Modell-JSON robuster für Zod (fehlende Pflichtfelder, snake_case, null → weg). */
export function normalizeCoachWorkoutWeekPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const o = parsed as Record<string, unknown>;
  const scheduleRaw = o.schedule;
  const schedule = Array.isArray(scheduleRaw)
    ? scheduleRaw.map(sanitizeCoachScheduleDay)
    : [];
  return {
    ...o,
    weekFocus: String(o.weekFocus ?? o.week_focus ?? 'Training week').trim() || 'Training week',
    coachNotes: String(o.coachNotes ?? o.coach_notes ?? '').trim() || 'See schedule.',
    assumptions: Array.isArray(o.assumptions)
      ? o.assumptions.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [],
    applied_constraints: Array.isArray(o.applied_constraints)
      ? o.applied_constraints.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
      : [],
    schedule,
  };
}

export function formatCoachGenerationErrorMessage(err: CoachGenerationError): string {
  const parts: string[] = [err.message];
  const lastZod = err.detail.zodErrors.filter(Boolean).at(-1);
  const lastCon = err.detail.constraintViolations.filter(Boolean).at(-1);
  if (lastZod) parts.push(lastZod.slice(0, 280));
  if (lastCon) parts.push(lastCon.slice(0, 280));
  return parts.join(' — ');
}

export class CoachGenerationError extends Error {
  constructor(
    message: string,
    public readonly detail: {
      zodErrors: string[];
      constraintViolations: string[];
      lastRaw: string;
    },
  ) {
    super(message);
  }
}

/** Workout-Woche: JSON → Zod → Constraint; Retry mit strukturierter repairHint. */
export async function generateCoachWorkoutWeekWithPipeline(args: {
  buildPrompt: (repairHint?: string) => string;
  callAi: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  constraints: WorkoutConstraintInput;
  normalizeEnvelope: (parsed: unknown) => unknown;
  maxRetries?: number;
  /** Optional: Last-Progression aus geloggten Workouts. */
  recentWorkouts?: Workout[];
  /** volumeMultiplier aus Periodisierungs-Directive. */
  volumeMultiplier?: number;
  /** Prior-Week exerciseKeys für Continuity. */
  priorExerciseKeys?: string[];
  /** Onboarding sports für Cardio-Rails. */
  sports?: string[];
}): Promise<{
  week: CoachWorkoutWeek;
  rawLast: string;
  retries: number;
  zodErrors: string[];
  constraintViolations: string[];
}> {
  const max = args.maxRetries ?? 5;
  let repairHint = '';
  let lastRaw = '';
  const zodErrors: string[] = [];
  const constraintViolations: string[] = [];

  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: 'user', content: prompt }]);
    let parsed: unknown;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein gültiges JSON. ${msg}`;
      continue;
    }
    const normalized = args.normalizeEnvelope(normalizeCoachWorkoutWeekPayload(parsed));
    const z = coachWorkoutWeekSchema.safeParse(normalized);
    if (!z.success) {
      const msg = z.error.issues.map((er) => `${er.path.join('.')}: ${er.message}`).join('; ');
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    let week = z.data;
    week = repairUnknownExerciseKeys(week);
    week = repairWorkoutScheduleConstraints(week, args.constraints);
    if (args.constraints.sessionAssignments?.length) {
      week = alignScheduleToCustomAssignments(week, args.constraints.sessionAssignments);
    }
    const v = validateWorkoutConstraints(week, args.constraints);
    if (v.ok === false) {
      const msgs = v.violations.map((vi) => `${vi.code}: ${vi.message}`).join('; ');
      constraintViolations.push(msgs);
      const assignHint =
        args.constraints.sessionAssignments?.length
          ? ` REQUIRED: output exactly ${args.constraints.sessionAssignments.length} separate non-rest schedule objects — one per line: ${args.constraints.sessionAssignments.map((a) => `${a.day} (${a.sessionSlot}) ${a.sessionTypeHint}`).join('; ')}. Duplicate weekdays MUST use distinct sessionSlot (Morning vs Evening).`
          : '';
      repairHint = `Hard constraints violated — repair the schedule: ${msgs}${assignHint}`;
      continue;
    }

    if (args.volumeMultiplier != null) {
      week = applyCoachVolumeMultiplier(week, args.volumeMultiplier);
    }
    if (args.recentWorkouts?.length) {
      week = applyCoachWeekLoadProgression(week, args.recentWorkouts, {
        volumeMultiplier: args.volumeMultiplier,
      });
    }
    if (args.priorExerciseKeys?.length) {
      week = annotatePriorExerciseContinuity(week, args.priorExerciseKeys);
    }
    if (args.sports?.length) {
      week = normalizeCardioSportRails(week, args.sports);
    }
    week = annotateMuscleGroupBalance(week);

    return { week, rawLast: lastRaw, retries: attempt, zodErrors, constraintViolations };
  }
  throw new CoachGenerationError(
    `Coach workout generation failed after ${max} attempts`,
    { zodErrors, constraintViolations, lastRaw },
  );
}

export async function generateCoachNutritionWeekWithPipeline(args: {
  buildPrompt: (repairHint?: string) => string;
  callAi: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  maxRetries?: number;
}): Promise<{
  week: CoachNutritionWeek;
  rawLast: string;
  retries: number;
  zodErrors: string[];
}> {
  const max = args.maxRetries ?? 3;
  let repairHint = '';
  let lastRaw = '';
  const zodErrors: string[] = [];

  for (let attempt = 0; attempt < max; attempt++) {
    const prompt = args.buildPrompt(repairHint);
    lastRaw = await args.callAi([{ role: 'user', content: prompt }]);
    let parsed: unknown;
    try {
      parsed = parseJsonLoose(lastRaw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      zodErrors.push(`json_parse: ${msg}`);
      repairHint = `Die vorherige Antwort war kein gültiges JSON. ${msg}`;
      continue;
    }
    const z = coachNutritionWeekSchema.safeParse(parsed);
    if (!z.success) {
      const msg = z.error.issues.map((er) => `${er.path.join('.')}: ${er.message}`).join('; ');
      zodErrors.push(msg);
      repairHint = `Schema validation failed. Fix exactly: ${msg}`;
      continue;
    }
    const week = finalizeCoachNutritionWeek(z.data);
    return { week, rawLast: lastRaw, retries: attempt, zodErrors };
  }
  throw new CoachGenerationError(`Coach nutrition generation failed after ${max} attempts`, {
    zodErrors,
    constraintViolations: [],
    lastRaw,
  });
}
