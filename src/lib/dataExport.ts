/**
 * Export von Profil-, Workout- und Ernährungsdaten (JSON / CSV) — rein clientseitig.
 */

import type { Nutrition, UserProfile, Workout } from '@/src/types';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';

export interface VrtxExportBundle {
  exportedAt: string;
  app: 'VRTX';
  version: 1;
  profile: UserProfile;
  workouts: Workout[];
  nutrition: Nutrition[];
}

export function buildExportBundle(
  profile: UserProfile,
  workouts: Workout[],
  nutrition: Nutrition[],
): VrtxExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    app: 'VRTX',
    version: 1,
    profile,
    workouts: [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    nutrition: [...nutrition].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonExport(bundle: VrtxExportBundle, filename = 'vrtx-export.json'): void {
  const json = JSON.stringify(bundle, null, 2);
  downloadBlob(filename, new Blob([json], { type: 'application/json;charset=utf-8' }));
}

function csvEscape(val: string | number | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function workoutsToCsv(workouts: Workout[]): string {
  const header = ['workout_id', 'date', 'name', 'type', 'duration_min', 'calories', 'exercise', 'set_index', 'set_type', 'weight_kg', 'reps', 'rpe', 'completed'];
  const rows: string[] = [header.join(',')];
  for (const w of workouts) {
    const date = typeof w.date === 'string' ? w.date.split('T')[0] : w.date;
    for (const ex of w.exercises || []) {
      const sets = ex.sets;
      if (Array.isArray(sets) && sets.length > 0 && typeof sets[0] === 'object' && sets[0] != null && 'reps' in sets[0]) {
        (sets as { reps: number; weight: number; completed?: boolean; type?: string; rpe?: number }[]).forEach((s, i) => {
          rows.push(
            [
              w.id,
              date,
              w.name,
              w.type,
              w.duration ?? '',
              w.caloriesBurned ?? '',
              ex.name,
              i + 1,
              s.type ?? '',
              s.weight ?? '',
              s.reps ?? '',
              s.rpe ?? '',
              s.completed ? '1' : '0',
            ]
              .map(csvEscape)
              .join(','),
          );
        });
      } else {
        rows.push(
          [w.id, date, w.name, w.type, w.duration ?? '', w.caloriesBurned ?? '', ex.name, '', '', '', '', '', '', '']
            .map(csvEscape)
            .join(','),
        );
      }
    }
    if (!w.exercises?.length) {
      rows.push([w.id, date, w.name, w.type, w.duration ?? '', w.caloriesBurned ?? '', '', '', '', '', '', '', '', ''].map(csvEscape).join(','));
    }
  }
  return rows.join('\n');
}

export function nutritionToCsv(entries: Nutrition[]): string {
  const header = ['date', 'meal', 'category', 'calories', 'protein_g', 'carbs_g', 'fat_g'];
  const rows = [header.join(',')];
  for (const e of entries) {
    const date = typeof e.date === 'string' ? e.date.split('T')[0] : e.date;
    const t = effectiveNutritionTotals(e);
    rows.push(
      [date, e.meal, e.category ?? '', Math.round(t.calories), Math.round(t.protein), Math.round(t.carbs), Math.round(t.fat)]
        .map(csvEscape)
        .join(','),
    );
  }
  return rows.join('\n');
}

export function downloadCsvExport(bundle: VrtxExportBundle, datePrefix?: string): void {
  const prefix = datePrefix ?? bundle.exportedAt.split('T')[0];
  const wCsv = workoutsToCsv(bundle.workouts);
  downloadBlob(`${prefix}-workouts.csv`, new Blob([wCsv], { type: 'text/csv;charset=utf-8' }));
  const nCsv = nutritionToCsv(bundle.nutrition);
  downloadBlob(`${prefix}-nutrition.csv`, new Blob([nCsv], { type: 'text/csv;charset=utf-8' }));
}
