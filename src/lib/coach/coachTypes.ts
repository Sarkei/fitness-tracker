import type { WeeklyReportPayload } from '../coachScheduleZod';

export type CoachRecommendation = WeeklyReportPayload['recommendation'];

export interface SessionAdherenceRow {
  plannedDay: string;
  plannedDate: string;
  title: string;
  sessionType: string;
  sessionKey?: string;
  status: 'completed' | 'partial' | 'missed' | 'extra';
  matchedWorkoutId?: string;
  matchedWorkoutName?: string;
  matchedDurationMin?: number;
  matchScore?: number;
  matchMethod?: 'id' | 'scored' | 'override';
  matchUncertain?: boolean;
}

export interface NutritionSlotAdherenceRow {
  day: string;
  date: string;
  slot: string;
  status: 'logged' | 'missed' | 'partial';
  calories?: number;
  targetCalories?: number;
}

export interface AthleteWeekSnapshot {
  weekNumber: number;
  windowStart: string;
  windowEnd: string;
  planType: 'workout' | 'nutrition';
  adherence: {
    plannedUnits: number;
    completedUnits: number;
    completionRate: number;
    workoutRows?: SessionAdherenceRow[];
    nutritionRows?: NutritionSlotAdherenceRow[];
  };
  training?: {
    totalVolumeKg: number;
    volumeWoWDeltaPct: number | null;
    avgRpe: number | null;
    fatigueScore: number;
    fatigueLabelKey: string;
    sessionsLogged: number;
    topPrs: Array<{ exercise: string; e1rmKg: number }>;
  };
  nutrition?: {
    entriesLogged: number;
    daysWithLogs: number;
    avgCalories: number;
    avgProtein: number;
    targetCalories: number | null;
    targetProtein: number | null;
    calorieAdherencePct: number | null;
  };
  flags: string[];
}

export type CoachSessionFeedbackRating = 'easy' | 'ok' | 'hard';

export interface CoachSessionFeedbackEntry {
  sessionKey: string;
  rating: CoachSessionFeedbackRating;
  at: string;
}

export interface CoachPlanState {
  phase: 'baseline' | 'accumulation' | 'intensification' | 'deload' | 'taper' | 'maintain';
  weekInBlock: number;
  blockLength: number;
  volumeMultiplier: number;
  intensityTargetRpe: number;
  deloadNextWeek: boolean;
  nutritionMacroMultiplier: number;
  lastRecommendation?: CoachRecommendation;
  updatedAt?: string;
  /** planned sessionKey → workout id */
  sessionMatchOverrides?: Record<string, string>;
  sessionFeedback?: CoachSessionFeedbackEntry[];
}

export interface WeekDirective {
  recommendation: CoachRecommendation;
  completionRate: number;
  volumeMultiplier: number;
  intensityTargetRpe: number;
  deloadWeek: boolean;
  taperWeek: boolean;
  overallRating: number;
  coachDirectiveBullets: string[];
  progressionNotes: string[];
}

export interface WeeklyReportFacts {
  overallRating: number;
  completionRate: number;
  recommendation: CoachRecommendation;
  snapshot: AthleteWeekSnapshot;
  directive: WeekDirective;
  planState: CoachPlanState;
}

export type WeeklyReportWithFacts = WeeklyReportPayload & {
  factsSnapshot?: AthleteWeekSnapshot;
  weekDirective?: WeekDirective;
};
