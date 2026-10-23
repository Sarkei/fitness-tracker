/**
 * Coach-Onboarding: Equipment-Katalog, Kategorien und Validierung gegen generierte Übungen.
 */

export type CoachEquipmentCategory =
  | 'calisthenics'
  | 'free_weights'
  | 'machines'
  | 'cardio'
  | 'bundles';

export type CoachEquipmentItem = {
  id: string;
  category: CoachEquipmentCategory;
};

/** Alle wählbaren Equipment-IDs (ohne Bundle-Implikationen). */
export const COACH_EQUIPMENT_CATALOG: CoachEquipmentItem[] = [
  { id: 'bodyweight', category: 'calisthenics' },
  { id: 'pull_up_bar', category: 'calisthenics' },
  { id: 'dip_station', category: 'calisthenics' },
  { id: 'resistance_bands', category: 'calisthenics' },
  { id: 'suspension_trainer', category: 'calisthenics' },
  { id: 'parallettes', category: 'calisthenics' },
  { id: 'gymnastic_rings', category: 'calisthenics' },
  { id: 'dumbbells', category: 'free_weights' },
  { id: 'barbell', category: 'free_weights' },
  { id: 'kettlebells', category: 'free_weights' },
  { id: 'ez_bar', category: 'free_weights' },
  { id: 'bench', category: 'free_weights' },
  { id: 'squat_rack', category: 'free_weights' },
  { id: 'cable_machine', category: 'machines' },
  { id: 'smith_machine', category: 'machines' },
  { id: 'leg_press', category: 'machines' },
  { id: 'lat_pulldown', category: 'machines' },
  { id: 'chest_press_machine', category: 'machines' },
  { id: 'leg_extension', category: 'machines' },
  { id: 'leg_curl', category: 'machines' },
  { id: 'hip_abductor', category: 'machines' },
  { id: 'rowing_machine', category: 'cardio' },
  { id: 'treadmill', category: 'cardio' },
  { id: 'exercise_bike', category: 'cardio' },
  { id: 'elliptical', category: 'cardio' },
  { id: 'stair_climber', category: 'cardio' },
  { id: 'full_home_gym', category: 'bundles' },
  { id: 'commercial_gym', category: 'bundles' },
];

export const COACH_EQUIPMENT_CATEGORY_ORDER: CoachEquipmentCategory[] = [
  'calisthenics',
  'free_weights',
  'machines',
  'cardio',
  'bundles',
];

export const COACH_MACHINE_EQUIPMENT_IDS = COACH_EQUIPMENT_CATALOG.filter(
  e => e.category === 'machines' || e.category === 'cardio',
).map(e => e.id);

export const COACH_DEFAULT_EQUIPMENT = ['bodyweight'] as const;

const FULL_HOME_GYM_IMPLIES = [
  'bodyweight',
  'pull_up_bar',
  'dip_station',
  'resistance_bands',
  'dumbbells',
  'barbell',
  'kettlebells',
  'bench',
  'squat_rack',
  'cable_machine',
  'smith_machine',
  'leg_press',
  'lat_pulldown',
] as const;

const COMMERCIAL_GYM_IMPLIES = COACH_EQUIPMENT_CATALOG.map(e => e.id);

/** Legacy IDs aus älteren Plänen → neue IDs. */
const LEGACY_EQUIPMENT_ALIASES: Record<string, string> = {
  bands: 'resistance_bands',
  pullup_bar: 'pull_up_bar',
};

export function normalizeCoachEquipmentSelection(selected: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const raw of selected || []) {
    const id = LEGACY_EQUIPMENT_ALIASES[raw] || raw;
    if (COACH_EQUIPMENT_CATALOG.some(e => e.id === id)) out.add(id);
  }
  if (!out.size) COACH_DEFAULT_EQUIPMENT.forEach(id => out.add(id));
  return [...out];
}

/** Effektiv verfügbares Equipment inkl. Bundle-Implikationen. */
export function effectiveCoachEquipmentIds(selected: string[] | undefined): Set<string> {
  const base = normalizeCoachEquipmentSelection(selected);
  const out = new Set(base);
  if (out.has('commercial_gym')) {
    COMMERCIAL_GYM_IMPLIES.forEach(id => out.add(id));
  }
  if (out.has('full_home_gym')) {
    FULL_HOME_GYM_IMPLIES.forEach(id => out.add(id));
  }
  return out;
}

/** „Nur Körpergewicht“ bleibt exklusiv, sobald gewählt. */
export function applyBodyweightOnlyEquipmentRule(selected: string[]): string[] {
  const normalized = normalizeCoachEquipmentSelection(selected);
  if (!normalized.includes('bodyweight')) return normalized;
  return ['bodyweight'];
}

export function toggleCoachEquipment(selected: string[], equipmentId: string): string[] {
  const id = LEGACY_EQUIPMENT_ALIASES[equipmentId] || equipmentId;
  if (!COACH_EQUIPMENT_CATALOG.some(e => e.id === id)) return normalizeCoachEquipmentSelection(selected);

  let next = normalizeCoachEquipmentSelection(selected);
  if (next.includes(id)) {
    next = next.filter(x => x !== id);
  } else {
    // Sobald irgendein anderes Equipment gewählt wird, ist es nicht mehr "nur Körpergewicht".
    if (id !== 'bodyweight' && next.includes('bodyweight')) {
      next = next.filter(x => x !== 'bodyweight');
    }
    next = [...next, id];
  }

  if (id === 'bodyweight') {
    next = applyBodyweightOnlyEquipmentRule(next);
  }

  if (id === 'commercial_gym') {
    next = next.filter(x => x !== 'full_home_gym');
    if (!next.includes('commercial_gym')) next.push('commercial_gym');
  }
  if (id === 'full_home_gym' && next.includes('full_home_gym')) {
    next = next.filter(x => x !== 'commercial_gym');
  }

  if (!next.length) next = [...COACH_DEFAULT_EQUIPMENT];
  return next;
}

type EquipmentRule = {
  id: string;
  pattern: RegExp;
  requiresAny: string[];
};

const EQUIPMENT_RULES: EquipmentRule[] = [
  {
    id: 'pull_up_bar',
    pattern: /pull[-\s]?up|chin[-\s]?up|klimmzug|muscle[-\s]?up/i,
    requiresAny: ['pull_up_bar', 'suspension_trainer', 'gymnastic_rings', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'dip_station',
    pattern: /\bdip\b|dips|barren|parallel bar/i,
    requiresAny: ['dip_station', 'parallettes', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'barbell',
    pattern: /barbell|langhantel|olympic|back squat|front squat|deadlift(?!.*dumbbell)/i,
    requiresAny: ['barbell', 'smith_machine', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'dumbbells',
    pattern: /dumbbell|kurzhantel|db\s/i,
    requiresAny: ['dumbbells', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'kettlebells',
    pattern: /kettlebell|kettle bell/i,
    requiresAny: ['kettlebells', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'cable_machine',
    pattern: /cable|seilzug|crossover|face pull|tricep pushdown|lat pulldown/i,
    requiresAny: ['cable_machine', 'lat_pulldown', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'leg_press',
    pattern: /leg press|beinpresse|hack squat machine/i,
    requiresAny: ['leg_press', 'smith_machine', 'commercial_gym', 'full_home_gym'],
  },
  {
    id: 'smith_machine',
    pattern: /smith machine|multipress/i,
    requiresAny: ['smith_machine', 'commercial_gym', 'full_home_gym'],
  },
  {
    id: 'bench',
    pattern: /bench press|bankdrück|incline press.*bar/i,
    requiresAny: ['bench', 'barbell', 'dumbbells', 'chest_press_machine', 'full_home_gym', 'commercial_gym'],
  },
  {
    id: 'rowing_machine',
    pattern: /rowing machine|ergometer|concept2|rudermaschine/i,
    requiresAny: ['rowing_machine', 'commercial_gym', 'full_home_gym'],
  },
  {
    id: 'treadmill',
    pattern: /treadmill|laufband/i,
    requiresAny: ['treadmill', 'commercial_gym'],
  },
];

/** Gibt fehlende Equipment-ID zurück, wenn Übung nicht erlaubt ist. */
export function exerciseBlockedByEquipment(
  exerciseName: string,
  exerciseKey: string,
  available: Set<string>,
): string | null {
  const hay = `${exerciseName || ''} ${exerciseKey || ''}`;
  for (const rule of EQUIPMENT_RULES) {
    if (!rule.pattern.test(hay)) continue;
    const ok = rule.requiresAny.some(req => available.has(req));
    if (!ok) return rule.id;
  }
  return null;
}

export function formatCoachEquipmentForPrompt(selected: string[] | undefined): string {
  const ids = normalizeCoachEquipmentSelection(selected);
  const effective = effectiveCoachEquipmentIds(ids);
  const labels = [...effective].sort();
  return `${labels.join(', ')} (ONLY prescribe exercises possible with this equipment; never require gear the athlete did not select)`;
}
