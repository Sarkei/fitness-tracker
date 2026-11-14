import type { Exercise, WorkoutTemplate } from '@/src/types';

function csvEscape(s: string): string {
  const t = s.replace(/"/g, '""');
  return `"${t}"`;
}

function flattenSets(ex: Exercise): string {
  const sets = ex.sets;
  if (typeof sets === 'number') return String(sets);
  if (Array.isArray(sets) && sets.length && typeof sets[0] === 'object' && sets[0] !== null && 'reps' in sets[0]) {
    return (sets as { reps: number; weight: number; type?: string }[])
      .map(s => `${s.reps}x@${s.weight}${s.type && s.type !== 'normal' ? `(${s.type})` : ''}`)
      .join('; ');
  }
  return '';
}

/** CSV-Export für ein Workout-Template oder einen Wochenplan (nur Vorlagen). */
export function workoutTemplateToCsv(template: WorkoutTemplate): string {
  const lines: string[] = ['type,day,name,exerciseCategory,blockFormat,sets,reps,weightKg,notes'];

  if (template.templateMode === 'plan' && template.weekPlan?.length) {
    for (const day of template.weekPlan) {
      const dayLabel = day.day;
      if (day.isRest) {
        lines.push(['plan', dayLabel, csvEscape(day.name || 'Rest'), '', '', '', '', '', ''].join(','));
        continue;
      }
      for (const ex of day.exercises || []) {
        const reps = typeof ex.reps === 'number' ? String(ex.reps) : '';
        const w = typeof ex.weight === 'number' ? String(ex.weight) : '';
        lines.push(
          [
            'plan',
            dayLabel,
            csvEscape(ex.name || ''),
            ex.exerciseCategory || '',
            ex.blockFormat || '',
            typeof ex.sets === 'number' ? String(ex.sets) : '',
            reps,
            w,
            csvEscape(ex.notes || ''),
          ].join(',')
        );
      }
    }
    return lines.join('\n');
  }

  for (const ex of template.exercises || []) {
    lines.push(
      [
        'workout',
        '',
        csvEscape(ex.name || ''),
        ex.exerciseCategory || '',
        ex.blockFormat || '',
        flattenSets(ex) || (typeof ex.sets === 'number' ? String(ex.sets) : ''),
        typeof ex.reps === 'number' ? String(ex.reps) : '',
        typeof ex.weight === 'number' ? String(ex.weight) : '',
        csvEscape(ex.notes || ''),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
