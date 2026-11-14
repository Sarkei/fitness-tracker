import { isExerciseDbCatalogKey } from './exerciseDb';
import {
  computeTrainingSlotPlan,
  normalizeCoachDayName,
  type TrainingSlotPlan,
} from './coachSessionDistribution';
import { alignScheduleToCustomAssignments } from './coachCustomScheduleAlign';
import { isCoachDecidesTrainingDays, type SessionAssignment } from './coachCustomWeekPlan';
import {
  buildVolumeAssignmentsFromOnboarding,
  filterAvailableDaysFromStart,
  parseCoachSessionVolume,
  strengthExerciseRangeForDuration,
  totalWeeklySessions,
} from './coachSessionVolume';
import { COACH_WEEKDAY_ORDER, indexCoachWeekday } from './coachWeekDisplay';
import type { CoachWorkoutWeek } from './coachScheduleZod';
import { buildCoachBenchmarkProfile } from './coachBenchmarkProfile';
import {
  effectiveCoachEquipmentIds,
  exerciseBlockedByEquipment,
  normalizeCoachEquipmentSelection,
} from './coachEquipment';
import { repairEquipmentAndInjuryWithSubstitutes } from './coachWeekPostprocess';
import {
  COACH_INJURY_IDS,
  INJURY_BLOCKED_PATTERNS,
  injuryActive,
} from './coachInjuries';

function isAllowedExerciseKey(key: string): boolean {
  if (!key) return false;
  return isExerciseDbCatalogKey(key);
}

export interface WorkoutConstraintInput {
  availableTrainingDays: string[];
  allowDoubleSessions: boolean;
  injuriesPlain: string;
  bodyWeightKg?: number;
  fitnessLevel?: string;
  weekNumber?: number;
  equipmentIds?: string[];
  runBestPaceSecPerKm?: number;
  runLongestKm?: number;
  hasRunBenchmarks?: boolean;
  hasStrengthBenchmarks?: boolean;
  cardioDiscoveryWeek?: boolean;
  strengthDiscoveryWeek?: boolean;
  /** Ziel: Anzahl Trainingseinheiten pro Woche (≠ Anzahl verfügbarer Tage). */
  targetSessionsPerWeek?: number;
  /** Custom-Wochenplan: exakte Tag + Morning/Evening + Kraft/Cardio-Zuweisungen. */
  sessionAssignments?: SessionAssignment[];
  expectedStrengthSessions?: number;
  expectedCardioSessions?: number;
  partialWeekStartDay?: string;
}

function normalizeDayName(raw: string): string | null {
  return normalizeCoachDayName(raw);
}

function parseHhMmToSeconds(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < 0 || b >= 60) return null;
  // Onboarding-Felder sind HH:MM; bei Run-Benchmarks wird i.d.R. MM:SS eingegeben.
  // Heuristik: <= 4h wird als MM:SS für Laufzeiten interpretiert.
  if (a <= 4) return a * 60 + b;
  return a * 3600 + b * 60;
}

function parseDecimal(raw: unknown): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parsePaceSecPerKm(raw: unknown): number | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const mmss = s.match(/(\d{1,2}):(\d{2})\s*(?:\/\s*km|km|min\/km)?/);
  if (mmss) {
    const mm = Number(mmss[1]);
    const ss = Number(mmss[2]);
    if (Number.isFinite(mm) && Number.isFinite(ss) && ss >= 0 && ss < 60) return mm * 60 + ss;
  }
  const decimal = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:min\/km|\/km|km)/);
  if (decimal) {
    const v = Number(decimal[1].replace(',', '.'));
    if (Number.isFinite(v) && v > 0) return Math.round(v * 60);
  }
  return null;
}

function deriveRunBestPaceSecPerKm(benchmarks: Record<string, unknown>): number | null {
  const candidates: number[] = [];
  const t5k = parseHhMmToSeconds(benchmarks.run_5k);
  if (t5k != null) candidates.push(t5k / 5);
  const t10k = parseHhMmToSeconds(benchmarks.run_10k);
  if (t10k != null) candidates.push(t10k / 10);
  const tHalf = parseHhMmToSeconds(benchmarks.run_half);
  if (tHalf != null) candidates.push(tHalf / 21.0975);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function sessionTypeMatchesHint(
  row: CoachWorkoutWeek['schedule'][number],
  hint: 'strength' | 'cardio',
): boolean {
  const st = String(row.sessionType || '').toLowerCase();
  if (hint === 'cardio') return st.includes('cardio') || st.includes('interval');
  return st.includes('strength') || st.includes('technique') || st.includes('cross');
}

function baseConstraintFields(
  ob: Record<string, unknown>,
  opts?: { partialWeekStartDay?: string; weekNumber?: number },
): Pick<
  WorkoutConstraintInput,
  | 'bodyWeightKg'
  | 'fitnessLevel'
  | 'weekNumber'
  | 'equipmentIds'
  | 'runBestPaceSecPerKm'
  | 'runLongestKm'
  | 'hasRunBenchmarks'
  | 'hasStrengthBenchmarks'
  | 'cardioDiscoveryWeek'
  | 'strengthDiscoveryWeek'
> {
  const bmRecord =
    ob.benchmarks && typeof ob.benchmarks === 'object'
      ? (ob.benchmarks as Record<string, string>)
      : {};
  const profile = buildCoachBenchmarkProfile({
    benchmarks: bmRecord,
    equipment: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? (ob.equipment as string[]) : undefined,
    ),
    trainingStyle: String(ob.trainingStyle || 'hybrid'),
    sports: Array.isArray(ob.sports) ? (ob.sports as string[]) : [],
    weekNumber: opts?.weekNumber ?? 1,
  });
  return {
    bodyWeightKg: parseDecimal(ob.weight_kg ?? ob.weightKg ?? ob.weight) ?? undefined,
    fitnessLevel: String(ob.fitnessLevel || 'intermediate'),
    weekNumber: opts?.weekNumber ?? 1,
    equipmentIds: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? (ob.equipment as string[]) : undefined,
    ),
    runBestPaceSecPerKm: profile.runBestPaceSecPerKm ?? undefined,
    runLongestKm: profile.runLongestKm ?? undefined,
    hasRunBenchmarks: profile.hasRunBenchmarks,
    hasStrengthBenchmarks: profile.hasStrengthBenchmarks,
    cardioDiscoveryWeek: profile.cardioDiscoveryWeek,
    strengthDiscoveryWeek: profile.strengthDiscoveryWeek,
  };
}

export function workoutConstraintsFromOnboarding(
  ob: Record<string, unknown>,
  opts?: { partialWeekStartDay?: string; weekNumber?: number },
): WorkoutConstraintInput {
  const base = baseConstraintFields(ob, opts);

  const assignments = buildVolumeAssignmentsFromOnboarding(ob, opts);
  if (assignments?.length) {
    const strengthExpected = assignments.filter((a) => a.sessionTypeHint === 'strength').length;
    const cardioExpected = assignments.filter((a) => a.sessionTypeHint === 'cardio').length;
    const workoutDays = [...new Set(assignments.map((a) => a.day))];
    const avail = filterAvailableDaysFromStart(
      Array.isArray(ob.availableTrainingDays) ? (ob.availableTrainingDays as string[]) : workoutDays,
      opts?.partialWeekStartDay,
    );
    return {
      ...base,
      availableTrainingDays: avail.length ? avail : workoutDays,
      allowDoubleSessions:
        ob.scheduleMode === 'custom' ? true : ob.allowDoubleSessions !== false,
      injuriesPlain: String(ob.injuries || ''),
      targetSessionsPerWeek: assignments.length,
      sessionAssignments: assignments,
      expectedStrengthSessions: strengthExpected > 0 ? strengthExpected : undefined,
      expectedCardioSessions: cardioExpected > 0 ? cardioExpected : undefined,
      partialWeekStartDay: opts?.partialWeekStartDay,
    };
  }

  const vol = parseCoachSessionVolume(ob);
  const total = totalWeeklySessions(vol);
  const coachDecidesDays = isCoachDecidesTrainingDays(ob);
  const avail = filterAvailableDaysFromStart(
    Array.isArray(ob.availableTrainingDays) ? (ob.availableTrainingDays as string[]) : [],
    opts?.partialWeekStartDay,
  );
  return {
    ...base,
    availableTrainingDays: avail,
    allowDoubleSessions: ob.allowDoubleSessions !== false,
    injuriesPlain: String(ob.injuries || ''),
    targetSessionsPerWeek:
      coachDecidesDays || total == null || total <= 0 ? undefined : total,
    partialWeekStartDay: opts?.partialWeekStartDay,
  };
}

const HEAVY_PERCENT_1RM = /\d+\s*%\s*(?:of\s*)?1\s*rm|@\s*\d+\s*%\s*1\s*rm/i;

function countNonRestSessions(week: CoachWorkoutWeek): number {
  return week.schedule.filter((d) => d.isRest !== true).length;
}

function minMainExercisesForDuration(min: number): number {
  const range = strengthExerciseRangeForDuration(min);
  const m = range.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 4;
}

function expectedDurationForRow(
  d: CoachWorkoutWeek['schedule'][number],
  assignments: SessionAssignment[] | undefined,
): number | null {
  const dayName = normalizeDayName(String(d.day || ''));
  const slot = String(d.sessionSlot || 'Morning');
  const match = assignments?.find(
    (a) => normalizeDayName(a.day) === dayName && (a.sessionSlot || 'Morning') === slot,
  );
  if (match?.durationMin != null && match.durationMin > 0) return match.durationMin;
  const est = typeof d.estimatedDuration === 'number' ? d.estimatedDuration : null;
  return est != null && est > 0 ? est : null;
}

function slotPlanForInput(input: WorkoutConstraintInput): TrainingSlotPlan | null {
  const target = input.targetSessionsPerWeek;
  if (target == null || target <= 0) return null;
  if (input.sessionAssignments?.length) {
    const days = [...new Set(input.sessionAssignments.map((a) => a.day))];
    const doubleDays = days.filter(
      (d) => input.sessionAssignments!.filter((a) => a.day === d).length >= 2,
    );
    return {
      workoutDays: days,
      doubleSessionDays: doubleDays,
      targetSessions: input.sessionAssignments.length,
      availableDayCount: input.availableTrainingDays.length || days.length,
    };
  }
  return computeTrainingSlotPlan(
    input.availableTrainingDays,
    target,
    input.allowDoubleSessions !== false,
  );
}

function restDayRow(
  dayName: string,
  prev: CoachWorkoutWeek['schedule'][number],
): CoachWorkoutWeek['schedule'][number] {
  return {
    ...prev,
    day: dayName,
    isRest: true,
    sessionType: 'Recovery',
    title: 'Rest day',
    exercises: [],
    cardio: undefined,
  };
}

export interface ConstraintViolation {
  code: string;
  message: string;
}

/** Deterministische Checks für generierte Workout-Woche; Reparatur + erneute Validierung. */
export function validateWorkoutConstraints(
  week: CoachWorkoutWeek,
  input: WorkoutConstraintInput,
): { ok: true } | { ok: false; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = [];

  const allowed = new Set<string>();
  if (Array.isArray(input.availableTrainingDays) && input.availableTrainingDays.length > 0) {
    for (const d of input.availableTrainingDays) {
      const n = normalizeDayName(d);
      if (n) allowed.add(n);
    }
  }

  const enforceDays = allowed.size > 0;
  const allowDoubles = input.allowDoubleSessions !== false;
  const inj = String(input.injuriesPlain || '');
  const equipment = effectiveCoachEquipmentIds(input.equipmentIds);

  const perDayCounts = new Map<string, number>();
  const startIdx = input.partialWeekStartDay
    ? indexCoachWeekday(normalizeDayName(input.partialWeekStartDay) || '')
    : -1;

  for (let i = 0; i < week.schedule.length; i++) {
    const d = week.schedule[i];
    const dayName = normalizeDayName(String(d.day || ''));
    if (!dayName) {
      violations.push({ code: 'bad_day', message: `schedule[${i}].day invalid` });
      continue;
    }
    const rest = d.isRest === true;
    if (!rest && startIdx > 0) {
      const dayIdx = indexCoachWeekday(dayName);
      if (dayIdx >= 0 && dayIdx < startIdx) {
        violations.push({
          code: 'partial_week_early_session',
          message: `schedule[${i}] session on ${dayName} but partial week starts ${input.partialWeekStartDay}`,
        });
      }
    }
    if (!rest) {
      if (enforceDays && !allowed.has(dayName)) {
        violations.push({
          code: 'day_not_allowed',
          message: `Non-rest session on ${dayName} but only ${[...allowed].join(', ')} allowed`,
        });
      }
      perDayCounts.set(dayName, (perDayCounts.get(dayName) || 0) + 1);
    }

    const ex = Array.isArray(d.exercises) ? d.exercises : [];
    for (let j = 0; j < ex.length; j++) {
      const row = ex[j] as Record<string, unknown>;
      const key = typeof row.exerciseKey === 'string' ? row.exerciseKey.trim() : '';
      if (key && !isAllowedExerciseKey(key)) {
        violations.push({
          code: 'unknown_exercise_key',
          message: `schedule[${i}].exercises[${j}] unknown exerciseKey "${key}"`,
        });
      }
      const nameBlob = `${row.name || ''} ${key || ''}`;
      for (const injuryId of COACH_INJURY_IDS) {
        if (!injuryActive(inj, injuryId)) continue;
        if (INJURY_BLOCKED_PATTERNS[injuryId].test(String(nameBlob))) {
          violations.push({
            code: `injury_${injuryId}`,
            message: `schedule[${i}] exercise likely conflicts with ${injuryId} limitation: ${nameBlob}`,
          });
        }
      }
      const missingEquip = exerciseBlockedByEquipment(
        String(row.name || ''),
        key,
        equipment,
      );
      if (missingEquip) {
        violations.push({
          code: 'equipment_missing',
          message: `schedule[${i}].exercises[${j}] "${String(row.name || '')}" requires ${missingEquip} but athlete equipment is: ${[...equipment].join(', ')}`,
        });
      }
      if (input.strengthDiscoveryWeek) {
        const weightStr = String(row.weight || '');
        if (HEAVY_PERCENT_1RM.test(weightStr)) {
          violations.push({
            code: 'strength_discovery_no_1rm_percent',
            message: `schedule[${i}].exercises[${j}] uses %1RM without benchmarks in week-1 discovery`,
          });
        }
      }
    }

    if (!rest && String(d.sessionType || '') === 'Strength') {
      const expectedDur = expectedDurationForRow(d, input.sessionAssignments);
      if (expectedDur != null && expectedDur >= 45) {
        const minExBase = minMainExercisesForDuration(expectedDur);
        const minEx =
          input.weekNumber === 1
            ? Math.max(2, Math.min(minExBase, 4))
            : input.strengthDiscoveryWeek
              ? Math.max(3, Math.min(minExBase, 4))
              : minExBase;
        if (ex.length < minEx) {
          violations.push({
            code: 'strength_exercise_count_low',
            message: `schedule[${i}] Strength ${expectedDur}min needs at least ${minEx} main exercises, found ${ex.length}`,
          });
        }
        const est =
          typeof d.estimatedDuration === 'number' ? d.estimatedDuration : null;
        if (est != null && Math.abs(est - expectedDur) > 10) {
          violations.push({
            code: 'duration_mismatch',
            message: `schedule[${i}] estimatedDuration=${est} but assignment requires ${expectedDur}min`,
          });
        }
      }
    }

    if (!rest && (String(d.sessionType || '') === 'Cardio' || String(d.sessionType || '') === 'Intervals')) {
      const cardio = d.cardio && typeof d.cardio === 'object' ? (d.cardio as Record<string, unknown>) : null;
      const zones = String(cardio?.zones || '').toLowerCase();
      const paceRaw = String(cardio?.pace || '');
      const paceSec = parsePaceSecPerKm(paceRaw);
      const distanceRaw = String(cardio?.distance || '').toLowerCase();
      const distMatch = distanceRaw.match(/(\d+(?:[.,]\d+)?)\s*km/);
      const distanceKm = distMatch ? Number(distMatch[1].replace(',', '.')) : null;

      if (zones.includes('zone 2') && paceSec != null && input.runBestPaceSecPerKm != null) {
        // Zone-2 muss klar langsamer als Wettkampf-/Bestzeitenpace sein.
        // Zusatzaufschlag für höheres Körpergewicht, um unrealistische Vorschläge zu blocken.
        const weightPenaltySec =
          input.bodyWeightKg != null && input.bodyWeightKg > 95
            ? Math.round((input.bodyWeightKg - 95) * 2)
            : 0;
        const minZone2Sec = Math.round(input.runBestPaceSecPerKm + 50 + weightPenaltySec);
        if (paceSec < minZone2Sec) {
          violations.push({
            code: 'cardio_pace_too_fast_for_profile',
            message: `schedule[${i}] Zone-2 pace ${paceRaw} is too fast for profile (best pace baseline ${Math.round(
              input.runBestPaceSecPerKm,
            )}s/km, required >= ${minZone2Sec}s/km)`,
          });
        }
      }

      if (distanceKm != null && input.runLongestKm != null && input.runLongestKm > 0) {
        const maxSuggestedKm = Math.max(3, Math.round(input.runLongestKm * 0.85 * 10) / 10);
        if (distanceKm > maxSuggestedKm) {
          violations.push({
            code: 'cardio_distance_too_long_for_profile',
            message: `schedule[${i}] cardio distance ${distanceKm}km exceeds safe cap ${maxSuggestedKm}km from benchmark longest run ${input.runLongestKm}km`,
          });
        }
      }

      if (input.cardioDiscoveryWeek) {
        if (paceSec != null) {
          violations.push({
            code: 'cardio_discovery_fixed_pace',
            message: `schedule[${i}] week-1 cardio discovery must not use fixed race pace (${paceRaw}); use conversational effort + logging`,
          });
        }
        if (distanceKm != null && distanceKm > 6) {
          violations.push({
            code: 'cardio_discovery_distance_high',
            message: `schedule[${i}] week-1 discovery run distance ${distanceKm}km too long (cap 6km)`,
          });
        }
      }
    }
  }

  if (!allowDoubles) {
    for (const [dn, c] of perDayCounts) {
      if (c > 1) {
        violations.push({
          code: 'double_session_forbidden',
          message: `More than one non-rest session on ${dn} but two-a-days disabled`,
        });
      }
    }
  }

  const active = week.schedule.filter((d) => d.isRest !== true);

  const target = input.targetSessionsPerWeek;
  if (target != null && target > 0) {
    if (active.length !== target) {
      violations.push({
        code: 'session_count_mismatch',
        message: `Expected exactly ${target} non-rest sessions per week, found ${active.length}`,
      });
    }
  }

  if (input.expectedStrengthSessions != null && input.expectedStrengthSessions > 0) {
    const strCount = active.filter((d) => sessionTypeMatchesHint(d, 'strength')).length;
    if (strCount !== input.expectedStrengthSessions) {
      violations.push({
        code: 'strength_count_mismatch',
        message: `Expected exactly ${input.expectedStrengthSessions} Strength sessions, found ${strCount}`,
      });
    }
  }

  if (input.expectedCardioSessions != null && input.expectedCardioSessions > 0) {
    const carCount = active.filter((d) => sessionTypeMatchesHint(d, 'cardio')).length;
    if (carCount !== input.expectedCardioSessions) {
      violations.push({
        code: 'cardio_count_mismatch',
        message: `Expected exactly ${input.expectedCardioSessions} Cardio/Intervals sessions, found ${carCount}`,
      });
    }
  }

  if (input.sessionAssignments?.length) {
    for (const a of input.sessionAssignments) {
      const day = normalizeDayName(a.day);
      if (!day) continue;
      const match = active.find(
        (row) =>
          normalizeDayName(String(row.day)) === day &&
          String(row.sessionSlot || 'Morning') === a.sessionSlot,
      );
      if (!match) {
        violations.push({
          code: 'missing_assignment_slot',
          message: `Missing session for ${day} (${a.sessionSlot}) ${a.sessionTypeHint}`,
        });
        continue;
      }
      if (!sessionTypeMatchesHint(match, a.sessionTypeHint)) {
        violations.push({
          code: 'session_type_mismatch',
          message: `${day} ${a.sessionSlot} must be ${a.sessionTypeHint}, got ${match.sessionType}`,
        });
      }
    }
  }

  const slotPlan = slotPlanForInput(input);
  if (slotPlan && slotPlan.doubleSessionDays.length === 0) {
    const workoutSet = new Set(slotPlan.workoutDays);
    for (const d of week.schedule) {
      if (d.isRest === true) continue;
      const dn = normalizeDayName(String(d.day || ''));
      if (dn && !workoutSet.has(dn)) {
        violations.push({
          code: 'session_on_non_slot_day',
          message: `Non-rest session on ${dn} but only these workout days allowed: ${slotPlan.workoutDays.join(', ')}`,
        });
      }
    }
  }

  return violations.length ? { ok: false, violations } : { ok: true };
}

function repairSessionVolume(
  week: CoachWorkoutWeek,
  input: WorkoutConstraintInput,
  allowed: Set<string>,
): CoachWorkoutWeek {
  const plan = slotPlanForInput(input);
  if (!plan) return week;

  const workoutSet = new Set(plan.workoutDays);
  const ac = [...(week.applied_constraints || [])];
  let fixedExtra = 0;
  let fixedTooMany = 0;

  let schedule = week.schedule.map((raw) => {
    const dayName = normalizeDayName(String(raw.day || ''));
    if (!dayName) return raw;

    let rest = raw.isRest === true;
    if (!rest && allowed.size > 0 && !allowed.has(dayName)) rest = true;
    if (!rest && plan.doubleSessionDays.length === 0 && !workoutSet.has(dayName)) {
      rest = true;
      fixedExtra += 1;
    }
    if (rest) return restDayRow(dayName, raw);
    return { ...raw, day: dayName, isRest: false };
  });

  let nonRest = schedule.filter((d) => d.isRest !== true);
  while (nonRest.length > plan.targetSessions) {
    const dropOffSlot = nonRest.filter((d) => {
      const dn = normalizeDayName(String(d.day || ''));
      return dn && !workoutSet.has(dn);
    });
    const victim =
      dropOffSlot[0] ||
      [...nonRest].reverse().find((d) => {
        const dn = normalizeDayName(String(d.day || ''));
        return dn && workoutSet.has(dn);
      }) ||
      nonRest[nonRest.length - 1];
    const vn = normalizeDayName(String(victim.day || ''));
    if (!vn) break;
    schedule = schedule.map((row) => {
      if (normalizeDayName(String(row.day || '')) === vn && row.isRest !== true) {
        fixedTooMany += 1;
        return restDayRow(vn, row);
      }
      return row;
    });
    nonRest = schedule.filter((d) => d.isRest !== true);
  }

  if (fixedExtra) ac.push(`repaired:rest_on_unused_available_days=${fixedExtra}`);
  if (fixedTooMany) ac.push(`repaired:trimmed_excess_sessions=${fixedTooMany}`);

  return { ...week, schedule, applied_constraints: ac.slice(0, 8) };
}

/** Trainingstage / Doppel-Sessions deterministisch reparieren (vor Constraint-Check). */
export function repairWorkoutScheduleConstraints(
  week: CoachWorkoutWeek,
  input: WorkoutConstraintInput,
): CoachWorkoutWeek {
  const allowed = new Set<string>();
  if (Array.isArray(input.availableTrainingDays) && input.availableTrainingDays.length > 0) {
    for (const d of input.availableTrainingDays) {
      const n = normalizeDayName(d);
      if (n) allowed.add(n);
    }
  }
  const enforceDays = allowed.size > 0;
  const allowDoubles = input.allowDoubleSessions !== false;

  const perDayKept = new Map<string, number>();
  const ac = [...(week.applied_constraints || [])];
  let fixedDays = 0;
  let fixedDoubles = 0;

  const schedule = week.schedule.map((raw) => {
    const d = { ...raw };
    const dayName = normalizeDayName(String(d.day || ''));
    if (!dayName) return d;

    let rest = d.isRest === true;

    if (!rest && enforceDays && !allowed.has(dayName)) {
      rest = true;
      fixedDays += 1;
    }

    if (!rest && !allowDoubles) {
      const n = perDayKept.get(dayName) || 0;
      if (n >= 1) {
        rest = true;
        fixedDoubles += 1;
      } else {
        perDayKept.set(dayName, n + 1);
      }
    } else if (!rest) {
      perDayKept.set(dayName, (perDayKept.get(dayName) || 0) + 1);
    }

    if (rest) {
      return {
        ...d,
        day: dayName,
        isRest: true,
        sessionType: d.sessionType || 'Recovery',
        title: d.title || 'Rest day',
        exercises: [],
        cardio: undefined,
      };
    }

    return { ...d, day: dayName, isRest: false };
  });

  if (fixedDays) ac.push(`repaired:rest_on_disallowed_days=${fixedDays}`);
  if (fixedDoubles) ac.push(`repaired:dropped_extra_same_day_sessions=${fixedDoubles}`);

  let afterVolume = repairSessionVolume(
    { ...week, schedule, applied_constraints: ac.slice(0, 8) },
    input,
    allowed,
  );

  if (input.sessionAssignments?.length) {
    afterVolume = alignScheduleToCustomAssignments(afterVolume, input.sessionAssignments);
  }

  return repairEquipmentViolations(afterVolume, input);
}

/** Ersetzt (oder entfernt) Übungen, die nicht zum Equipment/Verletzung passen. */
export function repairEquipmentViolations(
  week: CoachWorkoutWeek,
  input: WorkoutConstraintInput,
): CoachWorkoutWeek {
  return repairEquipmentAndInjuryWithSubstitutes(week, {
    equipmentIds: input.equipmentIds,
    injuriesPlain: input.injuriesPlain,
  });
}

/** Entfernt ungültige exerciseKey; ergänzt applied_constraints-Hinweis. */
export function repairUnknownExerciseKeys(week: CoachWorkoutWeek): CoachWorkoutWeek {
  const next = { ...week, schedule: week.schedule.map((d) => ({ ...d })) };
  let stripped = 0;
  for (const day of next.schedule) {
    if (!Array.isArray(day.exercises)) continue;
    day.exercises = day.exercises.map((row) => {
      const r = { ...(row as Record<string, unknown>) };
      const key = typeof r.exerciseKey === 'string' ? r.exerciseKey.trim() : '';
      if (key && !isAllowedExerciseKey(key)) {
        stripped += 1;
        delete r.exerciseKey;
      }
      return r;
    }) as typeof day.exercises;
  }
  const ac = [...(week.applied_constraints || [])];
  if (stripped) ac.push(`repaired:stripped_unknown_exerciseKey_count=${stripped}`);
  next.applied_constraints = ac.slice(0, 8);
  return next;
}
