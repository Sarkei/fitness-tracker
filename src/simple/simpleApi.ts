import { api } from '../lib/api';

export type Macro = { kcal: number; protein: number; carbs: number; fat: number };

export type FoodEntry = {
  id: string;
  meal: string;
  category?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string;
  ingredients?: string[];
  inputType?: string;
};

export type PlanExercise = {
  name: string;
  sets?: number | string;
  reps?: number | string;
  weight?: string;
  rest?: string;
  notes?: string;
};

export type PlanDay = {
  day: string;
  isRest?: boolean;
  title?: string;
  description?: string;
  estimatedDuration?: number;
  exercises?: PlanExercise[];
  cardio?: { type?: string; duration?: number; details?: string };
  sessionSlot?: string;
};

export type CoachWeek = {
  weekFocus?: string;
  schedule?: PlanDay[];
} | null;

export type CoachPlan = {
  id: string;
  type: 'workout' | 'nutrition';
  status: string;
  current_week: number;
  current_schedule?: { week_number: number; schedule: CoachWeek } | null;
};

export type WorkoutEntry = {
  id: string;
  name: string;
  type?: string;
  duration: number;
  date: string;
  exercises?: Array<{ name: string; sets?: unknown }>;
};

export const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_LABELS: Record<string, string> = {
  Monday: 'Montag',
  Tuesday: 'Dienstag',
  Wednesday: 'Mittwoch',
  Thursday: 'Donnerstag',
  Friday: 'Freitag',
  Saturday: 'Samstag',
  Sunday: 'Sonntag',
};

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayKeyOf(ymd: string): string {
  return DAY_KEYS[new Date(`${ymd}T12:00:00`).getDay()];
}

export function formatDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export async function fetchDay(date: string): Promise<FoodEntry[]> {
  const rows = await api<FoodEntry[]>(`/api/nutrition?date=${date}`);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Alle Einträge der letzten 30 Tage in EINEM Aufruf.
 * Ohne `date`-Parameter liefert /api/nutrition genau das — vorher wurden
 * 30 einzelne Anfragen gestellt, was die Seite spuerbar verzoegerte.
 */
export async function fetchMonth(): Promise<FoodEntry[]> {
  const rows = await api<FoodEntry[]>('/api/nutrition');
  return Array.isArray(rows) ? rows : [];
}

export async function fetchWorkouts(): Promise<WorkoutEntry[]> {
  const rows = await api<WorkoutEntry[]>('/api/workouts');
  return Array.isArray(rows) ? rows : [];
}

export type PlanWeek = {
  week_number: number;
  /** Montag dieser Planwoche als YYYY-MM-DD. */
  start_date: string;
  schedule: CoachWeek;
};

export async function fetchActivePlan(): Promise<{
  plan: CoachPlan;
  week: CoachWeek;
  /** Alle vorhandenen Planwochen — die Wochenansicht darf keine erfundenen Wochen zeigen. */
  weeks: PlanWeek[];
} | null> {
  const plans = await api<CoachPlan[]>('/api/coach/plans');
  const plan = (plans ?? []).find((p) => p.type === 'workout' && p.status === 'active');
  if (!plan) return null;

  const current = plan.current_schedule;
  let weeks: PlanWeek[] = current
    ? [
        {
          week_number: Number(current.week_number ?? plan.current_week ?? 1),
          start_date: String((current as { start_date?: string }).start_date ?? '').slice(0, 10),
          schedule: (current.schedule ?? null) as CoachWeek,
        },
      ]
    : [];

  // Alle Wochen nachladen: sonst zeigt die Wochenansicht für jede Woche denselben Plan.
  try {
    const detail = await api<{ schedules?: Array<{ week_number: number; start_date: string; schedule: CoachWeek }> }>(
      `/api/coach/plans/${plan.id}`,
    );
    if (Array.isArray(detail?.schedules) && detail.schedules.length) {
      weeks = detail.schedules.map((s) => ({
        week_number: Number(s.week_number),
        start_date: String(s.start_date ?? '').slice(0, 10),
        schedule: (s.schedule ?? null) as CoachWeek,
      }));
    }
  } catch {
    /* Detailabruf ist optional — die aktuelle Woche reicht als Rückfallebene. */
  }

  return { plan, week: (current?.schedule ?? null) as CoachWeek, weeks };
}

export function totals(entries: FoodEntry[]): Macro {
  return entries.reduce<Macro>(
    (sum, e) => ({
      kcal: sum.kcal + (Number(e.calories) || 0),
      protein: sum.protein + (Number(e.protein) || 0),
      carbs: sum.carbs + (Number(e.carbs) || 0),
      fat: sum.fat + (Number(e.fat) || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export type SaveExercise = { name: string; sets: number; reps: number; weight: number };

export async function saveWorkout(input: {
  name: string;
  date: string;
  duration: number;
  exercises: SaveExercise[];
  notes?: string;
}): Promise<void> {
  await api('/api/workouts', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      type: 'Strength',
      date: input.date,
      duration: Math.max(0, Math.round(input.duration)),
      caloriesBurned: 0,
      notes: input.notes ?? '',
      exercises: input.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({
          name: e.name,
          sets: Array.from({ length: Math.max(1, Math.min(12, e.sets)) }, () => ({
            reps: Math.max(0, Math.round(e.reps)),
            weight: Math.max(0, e.weight),
            completed: true,
            type: 'normal',
          })),
      })),
    }),
  });
}

export async function deleteWorkout(id: string): Promise<void> {
  await api(`/api/workouts/${id}`, { method: 'DELETE' });
}

export async function deleteFood(id: string): Promise<void> {
  await api(`/api/nutrition/${id}`, { method: 'DELETE' });
}

export async function updateFood(
  id: string,
  patch: Partial<Pick<FoodEntry, 'meal' | 'category' | 'calories' | 'protein' | 'carbs' | 'fat'>>,
): Promise<void> {
  await api(`/api/nutrition/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

/* ---------- Foto-Erkennung ---------- */

export type V3Component = {
  component_id: string;
  component_name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type V3Result = {
  state: string;
  analysis: {
    meal_name: string;
    meal_category?: string;
    confidence_overall?: string;
    components: Array<{ id: string; name: string; role?: string; estimated_grams: number }>;
  };
  components: V3Component[];
  totals: Macro;
  user_review_required?: boolean;
};

export function fileToDataUrl(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeFood(input: { imageDataUrl?: string; text?: string }): Promise<V3Result> {
  return api<V3Result>('/api/nutrition/v3/process', { method: 'POST', body: JSON.stringify(input) });
}

export async function saveAnalyzedMeal(input: {
  result: V3Result;
  grams: Record<string, number>;
  date: string;
  category: string;
}): Promise<void> {
  const reviewed = input.result.components.map((c) => ({
    component_id: c.component_id,
    grams: Math.max(1, Math.round(input.grams[c.component_id] ?? c.grams)),
  }));
  await api('/api/nutrition/v3/finalize', {
    method: 'POST',
    body: JSON.stringify({
    result: input.result,
    reviewedComponents: reviewed,
    originalInput: { text: '' },
    date: input.date,
    category: input.category,
    }),
  });
}
