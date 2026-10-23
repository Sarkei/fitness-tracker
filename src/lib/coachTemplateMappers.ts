/**
 * Mapper: Coach-KI-Wochenpläne → Workout-/Mahlzeit-Vorlagen (bestehende Modelle).
 */

import { format } from 'date-fns';
import { displayCoachExerciseName } from '@/src/lib/coachExerciseDisplay';
import { isExerciseDbCatalogKey } from '@/src/lib/exerciseDb';
import { resolveCoachPhaseExerciseRows } from '@/src/lib/coachWarmupCooldown';
import {
  finalizeExerciseForLiveSession,
  normalizeCoachPhaseRow,
  scrubMisalignedExerciseNotes,
} from '@/src/lib/coachSessionSets';
import { getLibraryExercise } from '@/src/lib/exerciseLibrary';
import type { UiLocale } from '@/src/lib/i18n';
import {
  buildCardioPrescriptionFromDay,
  buildCoachPrescriptionFromRow,
  parseCoachRestSec,
} from '@/src/lib/coachPrescriptionParse';
import { isBodyweightByNameOrEquipment, isClearlyWeightedStrengthExercise } from '@/src/lib/exerciseLibrarySwap';
import { isBodyweightLabel } from '@/src/lib/sessionPrescription';
import { normalizeSetType } from '@/src/lib/workoutSessionUtils';
import type {
  Exercise,
  Ingredient,
  MealCategory,
  MealTemplate,
  Nutrition,
  SetDetail,
  TemplateDayPlan,
  UserProfile,
  WorkoutTemplate,
} from '@/src/types';

export const COACH_TEMPLATE_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const satisfies readonly TemplateDayPlan['day'][];

/** Rohliste der Trainingstage aus verschiedenen Coach-JSON-Formen (schedule / sessions / Array / Doppel-Nesting). */
export function resolveCoachScheduleDayList(envelope: Record<string, unknown> | unknown): Record<string, unknown>[] {
  if (!envelope) return [];
  if (Array.isArray(envelope)) return envelope as Record<string, unknown>[];
  if (typeof envelope !== 'object') return [];
  const o = envelope as Record<string, unknown>;
  let a: unknown = o.schedule ?? o.sessions ?? o.days ?? o.mealPlan;
  if (a && typeof a === 'object' && !Array.isArray(a) && 'schedule' in (a as object)) {
    a = (a as { schedule?: unknown }).schedule;
  }
  return Array.isArray(a) ? (a as Record<string, unknown>[]) : [];
}

/** Sichere Übungsliste pro Coach-Tag (KI liefert exercises teils als Nicht-Array). */
export function coachRowExercises(row: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!row) return [];
  return Array.isArray(row.exercises) ? (row.exercises as Record<string, unknown>[]) : [];
}

export function coachRowHasExercises(row: Record<string, unknown> | null | undefined): boolean {
  return coachRowExercises(row).length > 0;
}

function randomExerciseId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Erste ganze Zahl aus String, sonst Fallback (für KI-Reps wie "8-10"). */
export function parseCoachReps(value: unknown, fallback = 10): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (typeof value === 'string') {
    const nums = value.match(/\d+/g);
    if (nums?.length) {
      if (nums.length >= 2) {
        const a = parseInt(nums[0], 10);
        const b = parseInt(nums[1], 10);
        if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(1, Math.round((a + b) / 2));
      }
      const n = parseInt(nums[0], 10);
      if (Number.isFinite(n)) return Math.max(1, n);
    }
  }
  return fallback;
}

export function parseCoachSets(value: unknown, fallback = 3): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return Math.max(1, n);
  }
  return fallback;
}

/** Coach-Session-Titel/Typ → Workout-Template-Typ (Kraft / Cardio / Hybrid). */
export function coachSessionToWorkoutType(sessionType?: string, title?: string): 'Strength' | 'Cardio' | 'Hybrid' {
  const hay = `${sessionType || ''} ${title || ''}`.toLowerCase();
  const cardio =
    /\b(run|ride|bike|swim|row|cardio|interval|easy|tempo|z2|zone)\b/i.test(hay);
  const strength = /\b(strength|lift|gym|hypertrophy|squat|press|dead|pull)\b/i.test(hay);
  if (cardio && strength) return 'Hybrid';
  if (cardio) return 'Cardio';
  return 'Strength';
}

export function coachExerciseToExercise(
  ex: Record<string, unknown>,
  locale: UiLocale = 'de',
  profile?: Pick<UserProfile, 'measurements'>,
): Exercise {
  const rawName = typeof ex.name === 'string' ? ex.name : 'Übung';
  const name = displayCoachExerciseName(
    { name: rawName, exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined },
    locale,
  );
  const sets = parseCoachSets(ex.sets);
  const exerciseKeyForBw =
    typeof ex.exerciseKey === 'string' && isExerciseDbCatalogKey(ex.exerciseKey.trim())
      ? ex.exerciseKey.trim()
      : undefined;
  const bodyweight = isBodyweightByNameOrEquipment(rawName, exerciseKeyForBw);
  const prescription = buildCoachPrescriptionFromRow(ex, profile);
  const reps = prescription?.targetReps ?? parseCoachReps(ex.reps);
  const w = ex.weight;
  let weightKg = bodyweight
    ? 0
    : typeof w === 'number' && Number.isFinite(w)
      ? w
      : prescription?.targetWeightKg;
  if (!bodyweight && prescription?.weightLabel && isBodyweightLabel(prescription.weightLabel)) {
    weightKg = 0;
  } else if (
    !bodyweight &&
    typeof w === 'string' &&
    isBodyweightLabel(w) &&
    !isClearlyWeightedStrengthExercise(rawName)
  ) {
    weightKg = 0;
  }
  const restParsed = parseCoachRestSec(ex.rest) ?? prescription?.targetRestSec;
  const restStr =
    typeof ex.rest === 'string' && ex.rest.trim()
      ? ex.rest
      : restParsed != null
        ? restParsed >= 60
          ? `${Math.round(restParsed / 60)}m`
          : `${restParsed}s`
        : undefined;
  const noteParts = [
    !bodyweight &&
    prescription?.weightLabel &&
    !weightKg &&
    !isBodyweightLabel(prescription.weightLabel)
      ? `Gewicht: ${prescription.weightLabel}`
      : '',
    !bodyweight && typeof w === 'string' && w && !prescription?.weightLabel && !isBodyweightLabel(w)
      ? `Gewicht: ${w}`
      : '',
    typeof ex.rest === 'string' && ex.rest && !restStr ? `Pause: ${ex.rest}` : '',
    typeof ex.notes === 'string' && ex.notes ? ex.notes : '',
    prescription?.coachNote && !ex.notes ? prescription.coachNote : '',
  ].filter(Boolean);

  const rawKey = typeof ex.exerciseKey === 'string' ? ex.exerciseKey.trim() : '';
  const libFromKey = rawKey && isExerciseDbCatalogKey(rawKey) ? getLibraryExercise(rawKey) : undefined;
  const categoryHint = `${name} ${noteParts.join(' ')}`.toLowerCase();
  const exerciseCategory: 'strength' | 'cardio' =
    libFromKey?.category ??
    (/\b(run|bike|row|ski|swim|jog|cycling|cardio|interval|tempo)\b/i.test(categoryHint) ? 'cardio' : 'strength');

  const exerciseKey = rawKey && isExerciseDbCatalogKey(rawKey) ? rawKey : undefined;
  const setType = normalizeSetType(ex.setType);

  // Optional: Coach liefert structured setRows [{reps, weight, type}]
  const structuredSets = parseCoachStructuredSets(ex);

  const built: Exercise = {
    id: randomExerciseId(),
    name,
    exerciseKey,
    exerciseCategory,
    sets: structuredSets ?? sets,
    reps,
    setType,
    ...(weightKg != null ? { weight: weightKg } : {}),
    ...(restStr ? { rest: restStr } : {}),
    ...(noteParts.length ? { notes: noteParts.join(' · ') } : {}),
    ...(prescription ? { coachPrescription: prescription } : {}),
    blockFormat: 'normal',
  };
  return scrubMisalignedExerciseNotes(built);
}

/** Optional structured set list from coach JSON (passthrough fields). */
function parseCoachStructuredSets(ex: Record<string, unknown>): SetDetail[] | null {
  const raw = ex.setRows ?? ex.set_rows ?? ex.workingSets;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SetDetail[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const reps =
      typeof r.reps === 'number'
        ? r.reps
        : parseCoachReps(r.reps, 10);
    let weight = 0;
    if (typeof r.weight === 'number' && Number.isFinite(r.weight)) weight = r.weight;
    else if (typeof r.weight === 'string') {
      const m = r.weight.match(/(\d+(?:[.,]\d+)?)/);
      if (m) weight = Number(m[1].replace(',', '.'));
    }
    out.push({
      reps,
      weight,
      completed: false,
      type: normalizeSetType(r.type ?? r.setType ?? 'normal'),
    });
  }
  return out.length ? out : null;
}

/** Cardio aus Coach-Tag als strukturierte Pseudo-Übung (wie Session-Player-Konverter). */
function coachCardioToExercise(day: Record<string, unknown>): Exercise | null {
  const cardio = day.cardio as Record<string, unknown> | undefined;
  if (!cardio || typeof cardio !== 'object') return null;
  const typeRaw = cardio.type != null ? String(cardio.type).trim() : '';
  const details = cardio.details != null ? String(cardio.details).trim() : '';
  if (!typeRaw && !details) return null;
  const type = typeRaw || 'work';
  const prescription = buildCardioPrescriptionFromDay(day, cardio);
  const durMin = prescription?.targetDurationMin;
  const distance = cardio.distance != null ? String(cardio.distance) : '';
  const pace = prescription?.targetPace ?? (cardio.pace != null ? String(cardio.pace) : '');
  const zones = prescription?.targetZones ?? (cardio.zones != null ? String(cardio.zones) : '');
  const label = `${String(type).toUpperCase()}${distance ? ` — ${distance}` : durMin ? ` — ${durMin} min` : details ? ` — ${details.slice(0, 80)}${details.length > 80 ? '…' : ''}` : ''}`;
  const notes = [
    details || undefined,
    pace ? `Tempo/Ziel: ${pace}` : '',
    zones ? `Zonen: ${zones}` : '',
    prescription?.coachNote,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: randomExerciseId(),
    name: label,
    exerciseCategory: 'cardio',
    sets: 1,
    reps: durMin ?? 1,
    ...(prescription?.targetDistanceKm != null ? { distanceKm: prescription.targetDistanceKm } : {}),
    ...(durMin != null ? { durationSec: durMin * 60 } : {}),
    notes: notes || undefined,
    ...(prescription ? { coachPrescription: prescription } : {}),
    blockFormat: 'normal',
  };
}

/** Coach-Tag hat startbaren Inhalt (Kraft, Cardio, Warmup/Cooldown). */
export function coachDayHasWorkoutContent(day: Record<string, unknown>): boolean {
  if (day.isRest) return false;
  if (Array.isArray(day.exercises) && day.exercises.length > 0) return true;
  const cardio = day.cardio as Record<string, unknown> | undefined;
  if (cardio && typeof cardio === 'object' && (cardio.type || cardio.details || cardio.duration || cardio.distance)) {
    return true;
  }
  if (resolveCoachPhaseExerciseRows(day, 'warmup').length > 0) return true;
  if (resolveCoachPhaseExerciseRows(day, 'cooldown').length > 0) return true;
  const desc = typeof day.description === 'string' ? day.description.trim() : '';
  const title = typeof day.title === 'string' ? day.title : '';
  if (desc || /\b(cardio|run|ride|swim|row|interval)\b/i.test(`${day.sessionType || ''} ${title}`)) return true;
  return false;
}

export function coachDayToDayExercises(
  day: Record<string, unknown>,
  locale: UiLocale = 'de',
  profile?: Pick<UserProfile, 'measurements'>,
): Exercise[] {
  const raw = Array.isArray(day.exercises) ? day.exercises : [];
  const mapped = raw.map(e => coachExerciseToExercise(e as Record<string, unknown>, locale, profile));
  const cardioEx = coachCardioToExercise(day);
  if (cardioEx) return [...mapped, cardioEx];
  if (mapped.length > 0) return mapped;
  const title = typeof day.title === 'string' ? day.title : 'Cardio';
  const desc = typeof day.description === 'string' ? day.description.trim() : '';
  const est = typeof day.estimatedDuration === 'number' ? day.estimatedDuration : 30;
  if (desc || /\b(cardio|run|ride|swim|row|interval)\b/i.test(`${day.sessionType || ''} ${title}`)) {
    return [
      {
        id: randomExerciseId(),
        name: title,
        exerciseCategory: 'cardio',
        sets: 1,
        reps: Math.max(1, est),
        notes: desc || undefined,
        blockFormat: 'normal',
      },
    ];
  }
  return mapped;
}

/** Aufwärmen → Hauptteil → Abkühlen für den Session-Player. */
export function coachDayToSessionExerciseList(
  day: Record<string, unknown>,
  locale: UiLocale = 'de',
  profile?: Pick<UserProfile, 'measurements'>,
): Exercise[] {
  const warmupRows = resolveCoachPhaseExerciseRows(day, 'warmup');
  const cooldownRows = resolveCoachPhaseExerciseRows(day, 'cooldown');

  const main = coachDayToDayExercises(day, locale, profile).map(ex =>
    finalizeExerciseForLiveSession(
      {
        ...ex,
        sessionPhase: 'main' as const,
      },
      [],
    ),
  );

  const warmup = warmupRows.map(rawRow => {
    const row = normalizeCoachPhaseRow(rawRow, 'warmup');
    const ex = coachExerciseToExercise(row, locale, profile);
    return finalizeExerciseForLiveSession(
      {
        ...ex,
        sessionPhase: 'warmup' as const,
        setType: 'warmup' as const,
        sets: typeof row.sets === 'number' ? row.sets : 1,
        reps: parseCoachReps(row.reps, 10),
      },
      main,
    );
  });

  const cooldown = cooldownRows.map(rawRow => {
    const row = normalizeCoachPhaseRow(rawRow, 'cooldown');
    const ex = coachExerciseToExercise(row, locale, profile);
    return finalizeExerciseForLiveSession(
      {
        ...ex,
        sessionPhase: 'cooldown' as const,
        sets: typeof row.sets === 'number' ? row.sets : 1,
        reps: parseCoachReps(row.reps, 10),
      },
      main,
    );
  });

  return [...warmup, ...main, ...cooldown];
}

/** Einzelnen Coach-Wochentag → TemplateDayPlan (inkl. Ruhetag). */
export function coachScheduleEntryToTemplateDay(day: Record<string, unknown>): TemplateDayPlan {
  const dayName = day.day as TemplateDayPlan['day'];
  if (!COACH_TEMPLATE_WEEKDAYS.includes(dayName)) {
    return { day: 'Monday', isRest: true, exercises: [] };
  }
  const isRest = Boolean(day.isRest);
  const type = coachSessionToWorkoutType(
    typeof day.sessionType === 'string' ? day.sessionType : undefined,
    typeof day.title === 'string' ? day.title : undefined,
  );
  if (isRest) {
    return { day: dayName, isRest: true, name: typeof day.title === 'string' ? day.title : 'Ruhetag', type, exercises: [] };
  }
  return {
    day: dayName,
    isRest: false,
    name: typeof day.title === 'string' ? day.title : undefined,
    type,
    exercises: coachDayToDayExercises(day),
  };
}

/** Mehrere Coach-Einträge am selben Wochentag (Two-a-day) zu einem Template-Tag zusammenführen. */
function mergeCoachDayEntries(entries: Record<string, unknown>[]): Record<string, unknown> {
  if (entries.length === 1) return entries[0];
  const nonRest = entries.filter(e => !e.isRest);
  const base = { ...entries[0] };
  if (nonRest.length === 0) {
    base.isRest = true;
    base.title = typeof base.title === 'string' ? base.title : 'Ruhetag';
    base.exercises = [];
    return base;
  }
  const titles = nonRest.map(e => (typeof e.title === 'string' ? e.title : '')).filter(Boolean);
  const slots = nonRest.map(e => (typeof e.sessionSlot === 'string' ? e.sessionSlot.trim() : '')).filter(Boolean);
  base.isRest = false;
  base.title = titles.length ? titles.join(' · ') : (typeof base.title === 'string' ? base.title : '');
  base.sessionSlot = slots.length ? slots.join(' · ') : base.sessionSlot;
  const exAll: unknown[] = [];
  for (const e of nonRest) {
    if (Array.isArray(e.exercises)) exAll.push(...e.exercises);
  }
  base.exercises = exAll;
  const cardios = nonRest.map(e => e.cardio).filter(c => c && typeof c === 'object') as Record<string, unknown>[];
  if (cardios.length === 1) base.cardio = cardios[0];
  else if (cardios.length > 1) {
    base.cardio = {
      type: String(cardios[0].type || 'run'),
      details: cardios
        .map((c, i) => {
          const lines = [
            nonRest[i]?.sessionSlot ? `Slot: ${nonRest[i].sessionSlot}` : `Teil ${i + 1}`,
            c.duration ? `Dauer: ${c.duration}` : '',
            c.distance ? `Distanz: ${c.distance}` : '',
            c.pace ? `Tempo: ${c.pace}` : '',
            c.zones ? `Zonen: ${c.zones}` : '',
            c.details ? String(c.details) : '',
          ].filter(Boolean);
          return lines.join(' — ');
        })
        .join('\n\n'),
    };
  }
  const descs = nonRest.map(e => String(e.description || '').trim()).filter(Boolean);
  if (descs.length) base.description = descs.join('\n\n');
  const warm = nonRest.map(e => String(e.warmup || '').trim()).filter(Boolean);
  if (warm.length) base.warmup = warm.join('\n\n');
  const cool = nonRest.map(e => String(e.cooldown || '').trim()).filter(Boolean);
  if (cool.length) base.cooldown = cool.join('\n\n');
  const notes = nonRest.map(e => String(e.notes || '').trim()).filter(Boolean);
  if (notes.length) base.notes = notes.join('\n\n');
  const durs = nonRest.map(e => Number(e.estimatedDuration)).filter(n => Number.isFinite(n) && n > 0);
  if (durs.length) base.estimatedDuration = Math.round(durs.reduce((a, b) => a + b, 0));
  return base;
}

/** Volle Coach-Woche ({ schedule: [...] } oder Rohtabellen) → 7 TemplateDayPlans Mon–So. */
export function coachWeeklyScheduleToTemplateWeek(scheduleEnvelope: Record<string, unknown> | undefined | null): TemplateDayPlan[] {
  const arr = resolveCoachScheduleDayList(scheduleEnvelope ?? undefined);
  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const d of arr) {
    const dn = String(d.day || '');
    if (!COACH_TEMPLATE_WEEKDAYS.includes(dn as TemplateDayPlan['day'])) continue;
    if (!byDay.has(dn)) byDay.set(dn, []);
    byDay.get(dn)!.push(d as Record<string, unknown>);
  }
  return COACH_TEMPLATE_WEEKDAYS.map(dn => {
    const list = byDay.get(dn);
    if (!list?.length) return { day: dn, isRest: true, exercises: [] };
    const merged = mergeCoachDayEntries(list);
    return coachScheduleEntryToTemplateDay(merged);
  });
}

function derivePlanTemplateTypeFromWeek(week: TemplateDayPlan[]): 'Strength' | 'Cardio' | 'Hybrid' {
  const active = week.filter(d => !d.isRest);
  if (active.length === 0) return 'Strength';
  const types = new Set(active.map(d => d.type || 'Strength'));
  if (types.has('Hybrid')) return 'Hybrid';
  if (types.has('Strength') && types.has('Cardio')) return 'Hybrid';
  if (types.has('Cardio')) return 'Cardio';
  return 'Strength';
}

export function buildCoachWeekWorkoutPlanTemplatePayload(
  scheduleEnvelope: Record<string, unknown> | unknown,
  opts: { name: string },
): Omit<WorkoutTemplate, 'id' | 'userId'> {
  const weekPlan = coachWeeklyScheduleToTemplateWeek(
    (Array.isArray(scheduleEnvelope) ? { schedule: scheduleEnvelope } : scheduleEnvelope) as Record<string, unknown>,
  );
  return {
    name: opts.name.trim() || `Coach-Woche`,
    type: derivePlanTemplateTypeFromWeek(weekPlan),
    templateMode: 'plan',
    exercises: [],
    weekPlan,
  };
}

export function buildCoachDayWorkoutTemplatePayload(
  day: Record<string, unknown>,
  opts: { name: string },
): Omit<WorkoutTemplate, 'id' | 'userId'> {
  const plan = coachScheduleEntryToTemplateDay(day);
  const type =
    plan.isRest ? 'Strength' : plan.type || coachSessionToWorkoutType(day.sessionType as string, day.title as string);
  return {
    name: opts.name.trim() || (typeof day.title === 'string' ? day.title : 'Coach-Workout'),
    type,
    templateMode: 'workout',
    exercises: plan.isRest ? [] : coachDayToDayExercises(day),
    weekPlan: undefined,
  };
}

function normalizeMealCategory(raw: unknown): MealCategory {
  const t = String(raw || 'snack').toLowerCase();
  if (t === 'breakfast' || t === 'lunch' || t === 'dinner' || t === 'snack') return t;
  return 'snack';
}

export function coachMealCookServings(meal: Record<string, unknown>): number {
  return Math.max(1, Math.min(12, Math.round(Number(meal.servings) || 1)));
}

/** Makros pro Person / Portion (Coach-JSON). */
export function coachMealPerServingMacros(meal: Record<string, unknown>): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return {
    calories: Math.round(Number(meal.calories) || 0),
    protein: Math.round((Number(meal.protein) || 0) * 10) / 10,
    carbs: Math.round((Number(meal.carbs) || 0) * 10) / 10,
    fat: Math.round((Number(meal.fat) || 0) * 10) / 10,
  };
}

export function coachMealIngredientLines(
  meal: Record<string, unknown>,
): Array<{ name: string; amount?: number | string; unit?: string }> {
  const rawIng = meal.ingredients;
  if (!Array.isArray(rawIng)) return [];
  const out: Array<{ name: string; amount?: number | string; unit?: string }> = [];
  for (const row of rawIng) {
    if (typeof row === 'string') {
      const s = row.trim();
      if (s) out.push({ name: s });
      continue;
    }
    if (row && typeof row === 'object') {
      const o = row as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) continue;
      out.push({
        name,
        amount: o.amount != null ? (typeof o.amount === 'number' ? o.amount : String(o.amount)) : undefined,
        unit: typeof o.unit === 'string' ? o.unit : undefined,
      });
    }
  }
  return out;
}

function coachMealIngredientsForTemplate(
  meal: Record<string, unknown>,
  title: string,
  batchTotals: { calories: number; protein: number; carbs: number; fat: number },
): Ingredient[] {
  const lines = coachMealIngredientLines(meal);
  if (lines.length === 0) {
    return [
      {
        name: title,
        amount: 1,
        unit: 'Port.',
        calories: Math.round(batchTotals.calories),
        protein: Math.round(batchTotals.protein * 10) / 10,
        carbs: Math.round(batchTotals.carbs * 10) / 10,
        fat: Math.round(batchTotals.fat * 10) / 10,
        nutrientSource: 'model_estimate',
      },
    ];
  }
  const n = lines.length;
  return lines.map(line => ({
    name: line.name,
    amount: typeof line.amount === 'number' ? line.amount : Number(line.amount) || 100,
    unit: line.unit || 'g',
    calories: Math.round(batchTotals.calories / n),
    protein: Math.round((batchTotals.protein / n) * 10) / 10,
    carbs: Math.round((batchTotals.carbs / n) * 10) / 10,
    fat: Math.round((batchTotals.fat / n) * 10) / 10,
    nutrientSource: 'model_estimate' as const,
  }));
}

/** Coach-Nährungsmahlzeit (KI-JSON) → Payload für `/api/meal-templates`. */
export function coachMealToMealTemplatePayload(
  meal: Record<string, unknown>,
  opts?: { templateName?: string; dayLabel?: string },
): Pick<MealTemplate, 'name' | 'category' | 'ingredients' | 'totalCalories' | 'totalProtein' | 'totalCarbs' | 'totalFat' | 'yieldsPortions'> {
  const category = normalizeMealCategory(meal.type);
  const title = typeof meal.title === 'string' ? meal.title.trim() : 'Mahlzeit';
  const suggestion =
    opts?.templateName?.trim() ||
    [opts?.dayLabel, title].filter(Boolean).join(' · ') ||
    title;

  const per = coachMealPerServingMacros(meal);
  const yields = coachMealCookServings(meal);
  const batchTotals = {
    calories: per.calories * yields,
    protein: per.protein * yields,
    carbs: per.carbs * yields,
    fat: per.fat * yields,
  };
  const ingredients = coachMealIngredientsForTemplate(meal, title, batchTotals);

  return {
    name: suggestion.slice(0, 200),
    category,
    ingredients,
    totalCalories: Math.round(batchTotals.calories),
    totalProtein: Math.round(batchTotals.protein * 10) / 10,
    totalCarbs: Math.round(batchTotals.carbs * 10) / 10,
    totalFat: Math.round(batchTotals.fat * 10) / 10,
    yieldsPortions: yields,
  };
}

/** Coach-Mahlzeit → Eintrag im Ernährungstracker (heute). */
export function coachMealToNutritionEntry(
  meal: Record<string, unknown>,
  opts: { portionsEaten: number; category?: MealCategory; dayLabel?: string },
): Partial<Nutrition> {
  const category = opts.category ?? normalizeMealCategory(meal.type);
  const title = typeof meal.title === 'string' ? meal.title.trim() : 'Coach-Mahlzeit';
  const name = [opts.dayLabel, title].filter(Boolean).join(' · ') || title;
  const per = coachMealPerServingMacros(meal);
  const portions = Math.max(0.25, opts.portionsEaten);
  const tpl = coachMealToMealTemplatePayload(meal, { dayLabel: opts.dayLabel });
  const yields = Math.max(1, tpl.yieldsPortions ?? 1);
  const f = portions / yields;

  return {
    meal: name.slice(0, 200),
    category,
    calories: Math.round(per.calories * portions),
    protein: Math.round(per.protein * portions * 10) / 10,
    carbs: Math.round(per.carbs * portions * 10) / 10,
    fat: Math.round(per.fat * portions * 10) / 10,
    ingredients: (tpl.ingredients || []).map(ing => ({
      ...ing,
      amount: Math.round(ing.amount * f * 10) / 10,
      calories: Math.round(ing.calories * f),
      protein: Math.round(ing.protein * f * 10) / 10,
      carbs: Math.round(ing.carbs * f * 10) / 10,
      fat: Math.round(ing.fat * f * 10) / 10,
    })),
    ...(portions !== 1 || yields > 1 ? { quantity: portions, unit: 'Port.' } : {}),
    date: format(new Date(), 'yyyy-MM-dd'),
  };
}

export function iterateCoachNutritionWeekMeals(
  scheduleEnvelope: Record<string, unknown>,
): Array<{ meal: Record<string, unknown>; dayLabel: string }> {
  const mp = scheduleEnvelope.mealPlan;
  const days = Array.isArray(mp) ? (mp as Record<string, unknown>[]) : [];
  const out: Array<{ meal: Record<string, unknown>; dayLabel: string }> = [];
  for (const d of days) {
    const dayLabel = typeof d.day === 'string' ? d.day : '';
    const meals = Array.isArray(d.meals) ? (d.meals as Record<string, unknown>[]) : [];
    for (const m of meals) {
      if (typeof m.title !== 'string' || !m.title.trim()) continue;
      out.push({ meal: m, dayLabel });
    }
  }
  return out;
}
