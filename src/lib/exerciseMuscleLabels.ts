/** Deutsche Anzeige für ExerciseDB bodyPart / target (UI). */

const BODY_PART_DE: Record<string, string> = {
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  'upper arms': 'Oberarme',
  'lower arms': 'Unterarme',
  'upper legs': 'Oberschenkel',
  'lower legs': 'Unterschenkel',
  legs: 'Beine',
  waist: 'Core / Taille',
  cardio: 'Cardio',
  'full body': 'Ganzkörper',
  neck: 'Nacken',
};

const TARGET_DE: Record<string, string> = {
  pectorals: 'Brustmuskel',
  lats: 'Latissimus',
  glutes: 'Gesäß',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  calves: 'Waden',
  deltoids: 'Deltamuskel',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  abs: 'Bauch',
  obliques: 'Schräge Bauchmuskeln',
  traps: 'Trapez',
  forearms: 'Unterarme',
  abductors: 'Abduktoren',
  adductors: 'Adduktoren',
  cardiovascular: 'Herz-Kreislauf',
  spine: 'Rücken / Wirbelsäule',
  serratus: 'Serratus',
  levator: 'Schulterheber',
};

export function labelBodyPart(raw?: string): string {
  if (!raw?.trim()) return '';
  const k = raw.trim().toLowerCase();
  return BODY_PART_DE[k] ?? raw;
}

export function labelTargetMuscle(raw?: string): string {
  if (!raw?.trim()) return '';
  const k = raw.trim().toLowerCase();
  return TARGET_DE[k] ?? raw;
}

export function formatMuscleSummary(ex: {
  bodyPart?: string;
  targetMuscle?: string;
  secondaryMuscles?: string[];
}): string {
  const parts: string[] = [];
  if (ex.targetMuscle) parts.push(labelTargetMuscle(ex.targetMuscle));
  else if (ex.bodyPart) parts.push(labelBodyPart(ex.bodyPart));
  if (ex.secondaryMuscles?.length) {
    parts.push(
      ...ex.secondaryMuscles.slice(0, 3).map(m => labelTargetMuscle(m) || m),
    );
  }
  return [...new Set(parts.filter(Boolean))].join(' · ');
}
