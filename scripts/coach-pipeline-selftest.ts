/**
 * Lokaler Sanity-Check für Coach-/Meal-Pipeline (ohne DB, ohne API-Keys).
 */
import { coachWeekInclusiveEnd, addDaysYmd } from "../src/lib/coachWeekWindow";
import { coachWorkoutWeekSchema } from "../src/lib/coachScheduleZod";
import {
  validateWorkoutConstraints,
  repairUnknownExerciseKeys,
  repairWorkoutScheduleConstraints,
  repairEquipmentViolations,
  workoutConstraintsFromOnboarding,
} from "../src/lib/coachConstraints";
import {
  effectiveCoachEquipmentIds,
  exerciseBlockedByEquipment,
} from "../src/lib/coachEquipment";
import { buildCoachBenchmarkProfile } from "../src/lib/coachBenchmarkProfile";
import {
  computeTrainingSlotPlan,
  pickEvenlySpacedIndices,
} from "../src/lib/coachSessionDistribution";
import {
  computeTrainingSlotPlanFromCustom,
  type CustomWeekPlan,
} from "../src/lib/coachCustomWeekPlan";
import {
  buildVolumeAssignmentsFromOnboarding,
  capVolumeForPartialWeek,
} from "../src/lib/coachSessionVolume";
import { normalizeCoachWorkoutWeekPayload } from "../src/lib/coachGeneratePipeline";
import { finalizeCoachWorkoutWeek } from "../src/lib/coachSchedulePostprocess";
import {
  COACH_WEEKDAY_ORDER,
  coachScheduleRowsForCalendarDate,
  coachWeeklySessionCountForDisplay,
  countCoachWeekTrainingSessions,
  parseCoachStartYmd,
} from "../src/lib/coachWeekDisplay";
import { parseLocalYmd } from "../src/lib/coachWeekWindow";
import { computeMealTemplateNutritionForRecipe } from "../src/lib/mealTemplateComputedNutrition";
import { mealRecipeAiSchema } from "../src/lib/mealRecipeZod";
import type { Food } from "../src/lib/foodDatabase";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const end = coachWeekInclusiveEnd("2026-05-04");
assert(end === "2026-05-10", `coachWeekInclusiveEnd expected 2026-05-10 got ${end}`);
assert(addDaysYmd("2026-05-04", 7) === "2026-05-11", "addDaysYmd +7");

const sampleWeek = {
  weekFocus: "Test",
  coachNotes: "Notes",
  assumptions: ["a"],
  applied_constraints: ["b"],
  schedule: [
    {
      day: "Monday",
      isRest: false,
      exercises: [{ name: "Back Squat", exerciseKey: "edb_0001", sets: 3, reps: "5" }],
    },
  ],
};
const parsed = coachWorkoutWeekSchema.parse(sampleWeek);
let repaired = repairUnknownExerciseKeys(parsed);
repaired = {
  ...repaired,
  schedule: repaired.schedule.map((d) =>
    d.day === "Monday"
      ? {
          ...d,
          exercises: [{ name: "Fake", exerciseKey: "definitely_not_a_real_key" }],
        }
      : d,
  ),
};
const repaired2 = repairUnknownExerciseKeys(repaired);
assert(
  !JSON.stringify(repaired2).includes("definitely_not_a_real_key"),
  "unknown key should be stripped",
);

const badDay = {
  ...parsed,
  schedule: [{ day: "Monday", isRest: false, exercises: [{ name: "Temp", exerciseKey: "edb_0002" }] }],
};
const v = validateWorkoutConstraints(badDay, {
  availableTrainingDays: ["Tuesday"],
  allowDoubleSessions: false,
  injuriesPlain: "",
});
const repairedDay = repairWorkoutScheduleConstraints(badDay, {
  availableTrainingDays: ["Tuesday"],
  allowDoubleSessions: false,
  injuriesPlain: "",
});
const v2 = validateWorkoutConstraints(repairedDay, {
  availableTrainingDays: ["Tuesday"],
  allowDoubleSessions: false,
  injuriesPlain: "",
});
assert(v2.ok === true, "repair should fix day_not_allowed");

const loose = normalizeCoachWorkoutWeekPayload({ schedule: [{ day: "Tuesday", isRest: true }] });
const parsedLoose = coachWorkoutWeekSchema.parse(loose);
assert(parsedLoose.weekFocus === "Training week", "normalize weekFocus default");

const withNulls = normalizeCoachWorkoutWeekPayload({
  weekFocus: "W",
  coachNotes: "N",
  schedule: [
    { day: "Monday", isRest: false, sessionType: "Strength", cardio: null, exercises: [{ name: "Squat", exerciseKey: null }] },
    { day: "Tuesday", isRest: true, cardio: null },
  ],
});
coachWorkoutWeekSchema.parse(withNulls);

const mockOffFood: Food = {
  id: "off_4000000000000",
  name: "Test Hähnchen",
  category: "protein",
  nutrients: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  servings: [{ name: "100g", grams: 100 }],
};
mealRecipeAiSchema.parse({
  name: "Test dish",
  yields_portions: 2,
  ingredients: [{ name: mockOffFood.name, amount: 200, unit: "g", foodId: mockOffFood.id }],
  prep_steps: [{ order: 1, body: "a" }, { order: 2, body: "b" }],
});

const nut = computeMealTemplateNutritionForRecipe(
  [{ name: mockOffFood.name, amount: 100, unit: "g", foodId: mockOffFood.id }],
  (id) => (id === mockOffFood.id ? mockOffFood : null),
);
assert(nut.computed.calories > 0, "computed calories");
assert(nut.rowCoverage === 1, "full row coverage");

const partial = finalizeCoachWorkoutWeek(
  coachWorkoutWeekSchema.parse({
    weekFocus: "P",
    coachNotes: "N",
    assumptions: [],
    applied_constraints: [],
    schedule: [
      { day: "Monday", isRest: false, sessionType: "Run", exercises: [] },
      { day: "Tuesday", isRest: false, sessionType: "Run", exercises: [] },
      { day: "Wednesday", isRest: false, sessionType: "Strength", exercises: [{ name: "Squat", exerciseKey: "edb_0001" }] },
    ],
  }),
  { partialFirstActiveDay: "Wednesday" },
);
assert(partial.schedule[0].day === "Monday", "monday first");
const monBefore = partial.schedule.find((d) => d.day === "Monday");
assert(monBefore?.isRest === true, "days before wednesday are rest");
assert(partial.schedule.length === COACH_WEEKDAY_ORDER.length, "full week length");

const avail5 = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const plan4 = computeTrainingSlotPlan(avail5, 4, true);
assert(plan4?.workoutDays.length === 4, "4 sessions on 5 days");
assert(plan4?.workoutDays.length !== avail5.length, "not all 5 days are workouts");

const fiveWorkouts = coachWorkoutWeekSchema.parse({
  weekFocus: "Vol",
  coachNotes: "N",
  assumptions: [],
  applied_constraints: [],
  schedule: avail5.map((day) => ({
    day,
    isRest: false,
    sessionType: "Strength",
    exercises: [{ name: "Squat" }],
  })),
});
const constraints4 = workoutConstraintsFromOnboarding({
  trainingDays: 4,
  availableTrainingDays: avail5,
  allowDoubleSessions: true,
});
const repairedVol = repairWorkoutScheduleConstraints(fiveWorkouts, constraints4);
const vVol = validateWorkoutConstraints(repairedVol, constraints4);
assert(vVol.ok === true, "4 sessions after repair from 5");
assert(
  repairedVol.schedule.filter((d) => d.isRest !== true).length === 4,
  "exactly 4 non-rest days",
);

assert(pickEvenlySpacedIndices(5, 4).length === 4, "even spacing indices");

const customPlan: CustomWeekPlan = {};
for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
  customPlan[day] = [
    { type: "strength", sessionSlot: "Morning" },
    { type: "cardio", sessionSlot: "Evening" },
  ];
}
const customSlot = computeTrainingSlotPlanFromCustom(customPlan);
assert(customSlot?.targetSessions === 10, "custom Mo-Fr double = 10 sessions");
const fiveOnly = coachWorkoutWeekSchema.parse({
  weekFocus: "Custom",
  coachNotes: "N",
  assumptions: [],
  applied_constraints: [],
  schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
    day,
    isRest: false,
    sessionType: "Strength",
    exercises: [{ name: "Squat" }],
  })),
});
const constraintsCustom = workoutConstraintsFromOnboarding({
  scheduleMode: "custom",
  customWeekPlan: customPlan,
});
const repairedCustom = repairWorkoutScheduleConstraints(fiveOnly, constraintsCustom);
const vCustom = validateWorkoutConstraints(repairedCustom, constraintsCustom);
assert(vCustom.ok === true, "custom 5 rows repaired to 10 assignments");
assert(
  repairedCustom.schedule.filter((d) => d.isRest !== true).length === 10,
  "10 non-rest after custom align",
);
assert(
  repairedCustom.schedule.filter((d) => d.sessionSlot === "Evening").length === 5,
  "evening slots present",
);

const planStart = "2026-05-25";
const schedule = [
  { day: "Monday", isRest: false, title: "W1 Mon" },
  { day: "Tuesday", isRest: false, title: "W1 Tue" },
];
const thisWeekMon = parseLocalYmd("2026-05-18");
const nextWeekMon = parseLocalYmd("2026-05-25");
assert(
  coachScheduleRowsForCalendarDate(planStart, thisWeekMon, schedule).length === 0,
  "coach plan must not map to calendar week before start_date",
);
assert(
  coachScheduleRowsForCalendarDate(planStart, nextWeekMon, schedule).length === 1,
  "coach Monday maps to start_date Monday",
);
assert(parseCoachStartYmd("2026-05-25T00:00:00.000Z") === "2026-05-25", "parseCoachStartYmd");

const miscountedWeek = [
  { day: "Monday", isRest: false, sessionType: "Strength" },
  { day: "Tuesday", isRest: false, sessionType: "Strength" },
  { day: "Wednesday", isRest: false, sessionType: "Strength" },
  { day: "Thursday", isRest: false, sessionType: "Strength" },
  { day: "Friday", isRest: false, sessionType: "Strength" },
  { day: "Saturday", isRest: false, sessionType: "Recovery", title: "Rest day" },
];
assert(countCoachWeekTrainingSessions(miscountedWeek) === 5, "recovery row not a session");
assert(
  coachWeeklySessionCountForDisplay(miscountedWeek, { trainingDays: 5 }) === 5,
  "display uses onboarding trainingDays",
);

const hybridAuto = buildVolumeAssignmentsFromOnboarding({
  trainingStyle: "hybrid",
  scheduleMode: "auto",
  strengthSessionsPerWeek: 3,
  cardioSessionsPerWeek: 2,
  strengthSessionDurationMin: 60,
  cardioSessionDurationMin: 45,
  availableTrainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  allowDoubleSessions: true,
});
assert(hybridAuto?.length === 5, "hybrid auto: 3 strength + 2 cardio assignments");
assert(
  hybridAuto!.filter((a) => a.sessionTypeHint === "strength").length === 3,
  "hybrid auto: 3 strength typed",
);
assert(
  hybridAuto!.filter((a) => a.sessionTypeHint === "cardio").length === 2,
  "hybrid auto: 2 cardio typed",
);

const partialHybrid = buildVolumeAssignmentsFromOnboarding(
  {
    trainingStyle: "hybrid",
    scheduleMode: "auto",
    strengthSessionsPerWeek: 3,
    cardioSessionsPerWeek: 2,
    strengthSessionDurationMin: 60,
    cardioSessionDurationMin: 45,
    availableTrainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    allowDoubleSessions: true,
  },
  { partialWeekStartDay: "Wednesday" },
);
assert(
  partialHybrid!.length <= 5 && (partialHybrid?.length ?? 0) >= 3,
  "partial Wed: capped session count",
);
assert(
  !partialHybrid!.some((a) => a.day === "Monday" || a.day === "Tuesday"),
  "partial Wed: no Mon/Tue slots",
);

const capped = capVolumeForPartialWeek(3, 2, ["Wednesday", "Thursday", "Friday"], true);
assert(capped.strength + capped.cardio <= 6, "partial cap respects max slots");

const partialCustom = workoutConstraintsFromOnboarding(
  { scheduleMode: "custom", customWeekPlan: customPlan },
  { partialWeekStartDay: "Wednesday" },
);
assert(
  partialCustom.targetSessionsPerWeek === 6,
  "custom Mo-Fr double from Wed = 6 sessions",
);
assert(
  partialCustom.expectedStrengthSessions === 3 && partialCustom.expectedCardioSessions === 3,
  "partial custom keeps strength/cardio split",
);

const wrongTypeWeek = coachWorkoutWeekSchema.parse({
  weekFocus: "T",
  coachNotes: "N",
  assumptions: [],
  applied_constraints: [],
  schedule: [
    {
      day: "Monday",
      sessionSlot: "Morning",
      isRest: false,
      sessionType: "Cardio",
      exercises: [],
      cardio: { duration: "45", details: "easy" },
    },
  ],
});
const constraintsMono = workoutConstraintsFromOnboarding({
  trainingStyle: "strength",
  scheduleMode: "auto",
  strengthSessionsPerWeek: 1,
  strengthSessionDurationMin: 60,
  availableTrainingDays: ["Monday"],
  allowDoubleSessions: false,
});
const vType = validateWorkoutConstraints(wrongTypeWeek, constraintsMono);
assert(vType.ok === false, "cardio row fails strength assignment");

const bwOnly = effectiveCoachEquipmentIds(["bodyweight", "dumbbells"]);
assert(
  exerciseBlockedByEquipment("Pull Up", "", bwOnly) === "pull_up_bar",
  "pull-ups require bar",
);

const pullWeek = coachWorkoutWeekSchema.parse({
  weekFocus: "T",
  coachNotes: "N",
  assumptions: [],
  applied_constraints: [],
  schedule: [
    {
      day: "Monday",
      isRest: false,
      sessionType: "Strength",
      exercises: [
        { name: "Pull Up", exerciseKey: "edb_0001", sets: 3, reps: "8" },
        { name: "Push Up", exerciseKey: "edb_0002", sets: 3, reps: "12" },
      ],
    },
  ],
});
const eqConstraints = workoutConstraintsFromOnboarding({
  equipment: ["bodyweight", "dumbbells"],
  trainingStyle: "hybrid",
  weekNumber: 1,
});
const vPull = validateWorkoutConstraints(pullWeek, eqConstraints);
assert(vPull.ok === false, "pull-up should violate equipment");
const pullFixed = repairEquipmentViolations(pullWeek, eqConstraints);
assert(
  pullFixed.schedule[0].exercises?.some((e) => /inverted row/i.test(String(e.name))) === true,
  "repair substitutes pull-up with inverted row",
);
assert(
  !pullFixed.schedule[0].exercises?.some((e) => /^Pull Up$/i.test(String(e.name))),
  "original pull-up removed",
);

const discoveryProfile = buildCoachBenchmarkProfile({
  benchmarks: {},
  equipment: ["bodyweight"],
  trainingStyle: "hybrid",
  weekNumber: 1,
});
assert(discoveryProfile.cardioDiscoveryWeek === true, "week1 cardio discovery");
assert(discoveryProfile.strengthDiscoveryWeek === true, "week1 strength discovery");

const fastCardioWeek = coachWorkoutWeekSchema.parse({
  weekFocus: "T",
  coachNotes: "N",
  assumptions: [],
  applied_constraints: [],
  schedule: [
    {
      day: "Monday",
      isRest: false,
      sessionType: "Cardio",
      exercises: [],
      cardio: { duration: "45m", distance: "8km", pace: "5:30/km", zones: "Zone 2" },
    },
  ],
});
const vFast = validateWorkoutConstraints(fastCardioWeek, eqConstraints);
assert(vFast.ok === false, "discovery week blocks fixed pace");

console.log("coach-pipeline-selftest: OK");
