import type { Workout } from '@/src/types';
import { strengthVolumeForWorkout } from '@/src/lib/workoutAnalytics';

export function buildWorkoutShareText(workout: Partial<Workout>, locale: 'de' | 'en' = 'de'): string {
  const vol = strengthVolumeForWorkout(workout as Workout);
  const mins = workout.duration ?? 0;
  const kcal = workout.caloriesBurned ?? 0;
  const exCount = workout.exercises?.length ?? 0;
  if (locale === 'en') {
    return `💪 ${workout.name || 'Workout'} — ${mins} min, ${exCount} exercises, ${vol > 0 ? `${vol.toLocaleString()} kg×reps volume` : ''}${kcal ? `, ~${kcal} kcal` : ''}`.trim();
  }
  return `💪 ${workout.name || 'Training'} — ${mins} Min., ${exCount} Übungen${vol > 0 ? `, ${vol.toLocaleString()} kg×Wdh. Volumen` : ''}${kcal ? `, ~${kcal} kcal` : ''}`.trim();
}
