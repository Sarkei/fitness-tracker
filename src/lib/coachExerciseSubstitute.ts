/**
 * Deterministische Ersatzübungen bei Equipment-/Verletzungs-Konflikten
 * (gleiche grobe Muskelgruppe, weniger Equipment).
 */

export type ExerciseSubstitute = {
  name: string;
  exerciseKey?: string;
  notes?: string;
};

/** Pattern → bevorzugte BW/DB-Alternativen (erste passende, die Equipment erlaubt). */
const SUBSTITUTE_RULES: Array<{
  id: string;
  pattern: RegExp;
  options: ExerciseSubstitute[];
}> = [
  {
    id: 'barbell_squat',
    pattern: /back squat|front squat|barbell squat|langhantel.?kniebeuge/i,
    options: [
      { name: 'Goblet Squat', notes: 'Ersatz: Langhantel-Kniebeuge → Kurzhantel' },
      { name: 'Bodyweight Squat', notes: 'Ersatz: Kniebeuge ohne Langhantel' },
    ],
  },
  {
    id: 'deadlift',
    pattern: /deadlift|kreuzheben(?!.*dumbbell|.*kurzhantel)/i,
    options: [
      { name: 'Dumbbell Romanian Deadlift', notes: 'Ersatz: Kreuzheben → Kurzhantel' },
      { name: 'Hip Hinge Bodyweight', notes: 'Ersatz: Hüftbeuge ohne Hantel' },
    ],
  },
  {
    id: 'bench_press',
    pattern: /bench press|bankdrück/i,
    options: [
      { name: 'Dumbbell Bench Press', notes: 'Ersatz: Bankdrücken → Kurzhantel' },
      { name: 'Push-Up', notes: 'Ersatz: Bankdrücken → Liegestütz' },
    ],
  },
  {
    id: 'barbell_row',
    pattern: /barbell row|langhantel.?rudern|bent.?over row/i,
    options: [
      { name: 'Dumbbell Row', notes: 'Ersatz: Langhantel-Rudern → Kurzhantel' },
      { name: 'Inverted Row', notes: 'Ersatz: Rudern als Bodyweight' },
    ],
  },
  {
    id: 'ohp',
    pattern: /overhead press|military press|shoulder press|ohp/i,
    options: [
      { name: 'Dumbbell Shoulder Press', notes: 'Ersatz: Schulterdrücken → Kurzhantel' },
      { name: 'Pike Push-Up', notes: 'Ersatz: Schulterdrücken → Pike Push-Up' },
    ],
  },
  {
    id: 'pull_up',
    pattern: /pull[-\s]?up|chin[-\s]?up|klimmzug/i,
    options: [
      { name: 'Inverted Row', notes: 'Ersatz: Klimmzug → Rudern unter Tisch/TRX' },
      { name: 'Band-Assisted Pull-Up', notes: 'Ersatz: Klimmzug mit Band' },
    ],
  },
  {
    id: 'dip',
    pattern: /\bdips?\b|barren/i,
    options: [
      { name: 'Bench Dip', notes: 'Ersatz: Dip an Bank' },
      { name: 'Close-Grip Push-Up', notes: 'Ersatz: Dip → enger Liegestütz' },
    ],
  },
  {
    id: 'leg_press',
    pattern: /leg press|beinpresse/i,
    options: [
      { name: 'Goblet Squat', notes: 'Ersatz: Beinpresse → Goblet Squat' },
      { name: 'Walking Lunge', notes: 'Ersatz: Beinpresse → Ausfallschritte' },
    ],
  },
  {
    id: 'cable',
    pattern: /cable|seilzug|face pull|tricep pushdown|lat pulldown/i,
    options: [
      { name: 'Band Pull-Apart', notes: 'Ersatz: Cable → Band' },
      { name: 'Dumbbell Fly', notes: 'Ersatz: Cable-Bewegung → Kurzhantel' },
    ],
  },
  {
    id: 'knee_squat_lunge',
    pattern: /squat|lunge|bulgarian|leg press|jump|box jump/i,
    options: [
      { name: 'Glute Bridge', notes: 'Knie-schonend: Hüftstreckung statt Kniebeuge' },
      { name: 'Seated Leg Curl (machine or band)', notes: 'Knie-schonend: Isolation hinten' },
      { name: 'Step-Up low box', notes: 'Knie-schonend: kontrollierter Step-Up' },
    ],
  },
  {
    id: 'shoulder_overhead',
    pattern: /overhead|ohp|military press|shoulder press|push press|handstand|kettlebell snatch|kettlebell swing|dip\b/i,
    options: [
      { name: 'Lateral Raise', notes: 'Schulter-schonend: seitliches Heben' },
      { name: 'Face Pull / Band Pull-Apart', notes: 'Schulter-schonend: Außenrotation/Upper back' },
      { name: 'Chest-Supported Row', notes: 'Schulter-schonend: Rudern gestützt' },
    ],
  },
  {
    id: 'lower_back_hinge',
    pattern: /deadlift|good morning|back extension|roman.?ian|rdl|bent.?over.?row|superman/i,
    options: [
      { name: 'Glute Bridge', notes: 'Rücken-schonend: Hüftstreckung liegend' },
      { name: 'Chest-Supported Row', notes: 'Rücken-schonend: Rudern gestützt' },
      { name: 'Cable Pull-Through', notes: 'Rücken-schonend: Hip hinge leicht' },
    ],
  },
  {
    id: 'wrist_load',
    pattern: /handstand|planche|wrist.?curl|front.?lever|push.?up|liegestütz|burpee/i,
    options: [
      { name: 'Dumbbell Floor Press', notes: 'Handgelenk-schonend: neutrale Griffe' },
      { name: 'Band Chest Press', notes: 'Handgelenk-schonend: Band-Druck' },
      { name: 'Machine Chest Press', notes: 'Handgelenk-schonend: geführte Presse' },
    ],
  },
  {
    id: 'ankle_impact',
    pattern: /jump|box jump|calf raise|running|sprint|plyo/i,
    options: [
      { name: 'Bike / Assault Bike', notes: 'Knöchel-schonend: Cardio ohne Impact' },
      { name: 'Seated Leg Curl', notes: 'Knöchel-schonend: Isolation' },
      { name: 'Glute Bridge', notes: 'Knöchel-schonend: Hüfte liegend' },
    ],
  },
  {
    id: 'hip_deep',
    pattern: /deep.?squat|pistol|hip.?thrust|sumo|butterfly|pigeon/i,
    options: [
      { name: 'Glute Bridge', notes: 'Hüft-schonend: begrenzte Flexion' },
      { name: 'Seated Leg Curl', notes: 'Hüft-schonend: Isolation hinten' },
      { name: 'Step-Up low box', notes: 'Hüft-schonend: kontrollierter Step-Up' },
    ],
  },
  {
    id: 'elbow_pull_push',
    pattern: /skull.?crusher|tricep.?extension|curl|chin.?up|pull.?up|klimmzug/i,
    options: [
      { name: 'Face Pull / Band Pull-Apart', notes: 'Ellenbogen-schonend: Band' },
      { name: 'Machine Row', notes: 'Ellenbogen-schonend: geführtes Rudern' },
      { name: 'Dumbbell Floor Press', notes: 'Ellenbogen-schonend: begrenzte ROM' },
    ],
  },
];

export function getEquipmentSubstituteOptions(
  name: string,
  exerciseKey: string,
): ExerciseSubstitute[] {
  const hay = `${name} ${exerciseKey}`;
  for (const rule of SUBSTITUTE_RULES) {
    if (
      /^(knee|shoulder|lower_back|wrist|ankle|hip|elbow)_/.test(rule.id)
    ) {
      continue;
    }
    if (!rule.pattern.test(hay)) continue;
    return rule.options;
  }
  return [];
}

export function findEquipmentSubstitute(
  name: string,
  exerciseKey: string,
): ExerciseSubstitute | null {
  return getEquipmentSubstituteOptions(name, exerciseKey)[0] ?? null;
}

export type InjurySubstituteKind =
  | 'knee'
  | 'shoulder'
  | 'lower_back'
  | 'wrist'
  | 'ankle'
  | 'hip'
  | 'elbow';

export function findInjurySubstitute(
  name: string,
  exerciseKey: string,
  kind: InjurySubstituteKind,
): ExerciseSubstitute | null {
  const hay = `${name} ${exerciseKey}`;
  const prefix = `${kind}_`;
  for (const rule of SUBSTITUTE_RULES) {
    if (!rule.id.startsWith(prefix)) continue;
    if (!rule.pattern.test(hay)) continue;
    return rule.options[0] ?? null;
  }
  return null;
}
