/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Schlaf pro Nacht, zugeordnet zum Kalendertag (typisch: Aufwachtag). */
export interface SleepLogEntry {
  totalMinutes: number;
  bedTime?: string;
  wakeTime?: string;
  phases?: {
    deep: number;
    light: number;
    rem: number;
    awake: number;
  };
}

export interface DailyActivityLog {
  stepsByDate?: Record<string, number>;
  sleepByDate?: Record<string, SleepLogEntry>;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  photoURL?: string;
  bio?: string;
  accountCreatedAt?: string;
  onboarded: boolean;
  /** UI-Sprache; bei fehlendem Wert gilt localStorage/Gast-Default aus `I18nProvider`. */
  uiLocale?: 'de' | 'en';
  /** Primäre Tabs in der Navigation; Standard für Bestandskonten: `hybrid`. */
  navigationFocus?: 'workout' | 'nutrition' | 'hybrid';
  /**
   * Erweiterte Coach-Pipeline (Zod/Retry, Refine-Schedule). Persistiert in `profile_extras`; Standard true.
   */
  /** 2 = ExerciseDB + OFF-Migration abgeschlossen */
  dataMigrationVersion?: number;
  migrationRequired?: boolean;
  themePreference?: 'light' | 'dark';
  coachingActive?: boolean;
  measurements?: {
    weight: number; // kg
    height: number; // cm
    age: number;
    gender: 'male' | 'female' | 'other';
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
    weightHistory?: { date: string; value: number }[];
  };
  bodyMeasurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    arms?: number;
    thighs?: number;
    updatedAt?: string;
  };
  dailyWaterLog?: Record<string, number>; // yyyy-MM-dd -> ml consumed
  /** Manuelle Schritte & Schlaf (pro Kalendertag); server: profile_extras */
  dailyActivityLog?: DailyActivityLog;
  checkIns?: {
    id: string;
    date: string;
    weight?: number;
    photoURL?: string;
    note?: string;
    bodySnapshot?: {
      chest?: number;
      waist?: number;
      hips?: number;
      arms?: number;
      thighs?: number;
    };
  }[];
  favoriteMealTemplateIds?: string[];
  goals: {
    type: 'lose' | 'maintain' | 'gain';
    weight?: number;         // target weight in kg (null/undefined = maintain mode)
    targetWeight?: number;   // alias kept for backward compat
    dailySteps?: number;
    /** Tägliches Wasserziel in ml (Standard 2500) */
    dailyWaterMl?: number;
    dailyCalories?: number;
    macros?: {
      protein: number;
      carbs: number;
      fat: number;
    };
  };
  freeWorkoutSchedule?: Record<number, { type: 'rest' | 'template'; templateId?: string; templateName?: string } | null>;
  /**
   * Spontane Übungstausche im manuellen Plan: nur für die Kalenderwoche (Montag yyyy-MM-dd),
   * nicht für `workoutPlan` / Vorlagen — dauerhafte Änderungen nur über Plan-Einstellungen.
   */
  manualPlanWeekOverrides?: ManualPlanWeekOverrides;
  weightHistory?: { date: string; value: number }[];
  coachPreferences?: CoachConstraints;
  /** May be partial while coach is building / patching the plan */
  workoutPlan?: Partial<WorkoutPlan>;
  /** Standard-Pausenzeit pro Übung (normalisierter Name → Sekunden); server: profile_extras */
  exerciseRestSeconds?: Record<string, number>;
}

export interface TrainingPlanTemplate {
  id: string;
  userId: string;
  name: string;
  description: string;
  schedule: PlannedSession[];
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId?: string; // If null, it's a group message or global
  groupId?: string;
  text: string;
  createdAt: any;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  createdAt: any;
}

export type ManualPlanExerciseSwap = {
  exerciseKey: string;
  name: string;
  exerciseCategory?: string;
  id?: string;
};

/** Montag yyyy-MM-dd → Wochentag 1–7 → Übungsindex → Tausch */
export type ManualPlanWeekOverrides = Record<
  string,
  Record<number, Record<number, ManualPlanExerciseSwap>>
>;

export interface CoachConstraints {
  trainingFrequency: number; // days per week
  sessionDuration: number; // minutes
  equipment: string[]; // e.g., 'dumbbell', 'bodyweight', 'full_gym'
  specificGoals?: string;
  hybridBalance?: number; // 0-100 (0 = pure strength, 100 = pure endurance)
  focusZones?: string[];
  ignoredZones?: string[];
  lastAdjusted?: string;
}

export interface WorkoutPlan {
  id: string;
  generatedAt: string;
  title: string;
  name?: string;
  description: string;
  discipline: string;
  daysPerWeek: number;
  schedule: PlannedSession[];
}

export interface PlannedSession {
  day: number; // 1-7 (1 = Monday)
  title: string;
  activity: string;
  exercises: Exercise[];
  isRestDay: boolean;
}

export interface Workout {
  id: string;
  userId: string;
  name: string;
  type: 'Strength' | 'Cardio' | 'Hybrid' | 'Other';
  subtype?: string; 
  duration: number; // actual duration in minutes
  caloriesBurned: number;
  date: string;
  exercises: Exercise[];
  notes?: string;
  shared?: boolean;
  /** Session-Gesamtanstrengung (1-10) nach Abschluss. */
  sessionRpe?: number;
  isPlanned?: boolean;
  planId?: string;
  feedback?: string;
  completedAt?: string;
  /** Set when logged from AI Coach session start */
  coachSessionMeta?: {
    planId: string;
    weekNumber: number;
    sessionKey: string;
    plannedDay: string;
    sessionSlot?: string;
    title?: string;
  };
  cardioSessionFeedback?: CardioSessionFeedback;
  /** Laufende Live-Session (nicht persistiert als Workout-Feld). */
  sessionInstanceId?: string;
  /** This-Week / Template – für Resume-Button-Zuordnung. */
  sessionSourceKey?: string;
}

export interface TemplateDayPlan {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  isRest: boolean;
  name?: string;
  type?: 'Strength' | 'Cardio' | 'Hybrid';
  exercises: Exercise[];
}

export interface WorkoutTemplate {
  id: string;
  userId: string;
  name: string;
  type: 'Strength' | 'Cardio' | 'Hybrid';
  templateMode?: 'workout' | 'plan';
  exercises: Exercise[];
  weekPlan?: TemplateDayPlan[];
}

/** Coach- oder Verlaufs-Vorgabe für Live-Session (Platzhalter & Prefill). */
export interface CoachPrescription {
  targetWeightKg?: number;
  targetReps?: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetRestSec?: number;
  targetSets?: number;
  targetPace?: string;
  targetDistanceKm?: number;
  targetDurationMin?: number;
  targetZones?: string;
  targetRpe?: number;
  coachNote?: string;
  /** Anzeige z. B. „70% 1RM“ wenn kein kg parsebar */
  weightLabel?: string;
}

export interface Exercise {
  id?: string;
  /** Referenz in `exerciseLibrary.ts` — Anzeigename kommt aus der Bibliothek. */
  exerciseKey?: string;
  name: string;
  /** Pro-Übung: Kraft vs. Cardio (wichtig für Hybrid). */
  exerciseCategory?: 'strength' | 'cardio';
  /**
   * Optional: diese Zeile gehört zu einem Struktur-Block (`id` des Eltern-Blocks).
   * Persistiert flach in derselben Liste wie Wurzel-Bausteine.
   */
  structureParentId?: string;
  /**
   * Trainingsstruktur: nur erste Zeile eines Blocks oder Meta-Zeile.
   * `normal` = klassische Übung.
   */
  blockFormat?: 'normal' | 'emom' | 'amrap' | 'circuit' | 'hiit_tabata' | 'intervals';
  /** z. B. EMOM-Minuten, AMRAP-Zeitlimit, Zirkel-Runden */
  structureMinutes?: number;
  structureRounds?: number;
  intervalWorkSec?: number;
  intervalRestSec?: number;
  /** gesamte Intervall-Sequenz × n wiederholen */
  intervalRepeat?: number;
  durationSec?: number;
  distanceKm?: number;
  sets: number | SetDetail[];
  reps?: number;
  weight?: number;
  notes?: string;
  supersetGroup?: string;
  setType?: 'normal' | 'warmup' | 'dropset' | 'failure';
  /** Ruhepause zwischen Sätzen, z. B. "90s" oder "1.5m" */
  rest?: string;
  /** Coach-Session: Aufwärmen → Hauptteil → Abkühlen */
  sessionPhase?: 'warmup' | 'main' | 'cooldown';
  /** Mobilisation / Stretch: Countdown statt Satz-Tabelle */
  mobilityTimer?: boolean;
  /** Vorgaben aus Coach-Plan (Priorität vor Verlauf beim Prefill) */
  coachPrescription?: CoachPrescription;
  /** ExerciseDB-GIF-URL (Anzeige im Session-Player) */
  gifUrl?: string;
  /** GPS-Route [lat, lng] für Cardio-Einheiten */
  routeData?: [number, number][];
}

/** Nach Cardio-Session: für Coach-Anpassung nächste Woche */
export interface CardioSessionFeedback {
  perceivedEffort?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  notes?: string;
}

export interface SetDetail {
  reps: number;
  weight: number;
  completed: boolean;
  type: 'normal' | 'warmup' | 'dropset' | 'failure';
  /** Rate of perceived exertion 1–10 */
  rpe?: number;
  note?: string;
}

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Nutrition {
  id: string;
  userId: string;
  meal: string;
  category: MealCategory;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  date: string;
  ingredients?: Ingredient[];
  quantity?: number;
  unit?: string;
  foodId?: string;
  inputType?: 'text' | 'image';
  originalInput?: string;
  mealCategory?: string;
  cuisine?: string;
  totalFiber?: number;
  aiModelUsed?: string;
  pipelineVersion?: string;
  userReviewed?: boolean;
}

export interface Ingredient {
  /** Food-Datenbank-ID (optional, für Templates / Logging) */
  id?: string;
  name: string;
  amount: number; // grams or units
  unit: string;
  servingName?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  /** Herkunft der Nährwerte (KI-Schätzung vs. lokale Datenbank) */
  nutrientSource?: 'database' | 'model_estimate';
  /** Match-Konfidenz aus v2-Resolve (0–1), optional persistiert */
  matchScore?: number;
  /** Datenquelle beim Match: openfoodfacts | generic_baseline | app */
  matchSource?: string;
}

/** KI-Vorschlag für ein neues Lebensmittel (noch nicht in der Datenbank); Nutzer bestätigt Persistenz gesondert. */
export interface ProposedDbFood {
  /** Stabile UI-Key (Normalisierung + Index) */
  key: string;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category?: string;
  disclaimer: string;
}

/** Von der KI vorgeschlagenes Nutzer-Lebensmittel (pro 100 g), noch bearbeit- und zu bestätigen. */
export interface CustomFoodDraft {
  name: string;
  category: string;
  nutrientsPer100g: { calories: number; protein: number; carbs: number; fat: number };
  servings: Array<{ name: string; grams: number }>;
  defaultAmount: number;
  defaultUnit: string;
  /** Optional Gramm/Stück wenn defaultUnit stk/ml typisch nicht 100 */
  gramsPerPiece?: number;
  disclaimer?: string;
}

/** Kombi-Lebensmittel: ein Eintrag in der Suche, beim Loggen Aufspaltung in mehrere Zutaten. */
export interface CompositeCustomFoodPayload {
  name: string;
  category: string;
  nutrientsPer100g: { calories: number; protein: number; carbs: number; fat: number };
  servings: Array<{ name: string; grams: number }>;
  defaultAmount: number;
  defaultUnit: string;
  gramsPerPiece?: number;
  ingredientsReference: Ingredient[];
}

export interface MealTemplate {
  id: string;
  userId: string;
  name: string;
  category: MealCategory;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  /** Ganze Rezeptmenge entspricht dieser Anzahl Portionen (z. B. Lasagne = 8). */
  yieldsPortions?: number;
  prepSteps?: string[];
  llmEstimateNutrients?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  nutrientsComputedCoverage?: number;
  source?: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  participants: string[];
  type: 'steps' | 'workout' | 'nutrition';
}
