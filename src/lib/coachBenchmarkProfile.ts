/**
 * Benchmarks aus Coach-Onboarding für Prompts und Woche-1-Erkennungsphase.
 */

function parseDecimal(raw: unknown): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type CoachBenchmarkProfile = {
  filled: Record<string, string>;
  hasRunBenchmarks: boolean;
  hasStrengthBenchmarks: boolean;
  runBestPaceSecPerKm: number | null;
  runLongestKm: number | null;
  strengthDiscoveryWeek: boolean;
  cardioDiscoveryWeek: boolean;
};

const RUN_KEYS = ['run_5k', 'run_10k', 'run_half', 'run_longest', 'run_weekly_km'] as const;
const STRENGTH_BAR_KEYS = ['squat_1rm', 'bench_1rm', 'deadlift_1rm', 'ohp_1rm'] as const;
const STRENGTH_BW_KEYS = ['pullups_max', 'pushups_max'] as const;
const STRENGTH_DB_KEYS = ['db_bench', 'db_row'] as const;
const STRENGTH_KB_KEYS = ['kb_swing', 'tgu'] as const;

function parseHhMmToSeconds(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < 0 || b >= 60) return null;
  if (a <= 4) return a * 60 + b;
  return a * 3600 + b * 60;
}

function deriveRunBestPaceSecPerKm(bm: Record<string, string>): number | null {
  const candidates: number[] = [];
  const t5k = parseHhMmToSeconds(bm.run_5k);
  if (t5k != null) candidates.push(t5k / 5);
  const t10k = parseHhMmToSeconds(bm.run_10k);
  if (t10k != null) candidates.push(t10k / 10);
  const tHalf = parseHhMmToSeconds(bm.run_half);
  if (tHalf != null) candidates.push(tHalf / 21.0975);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function hasAnyFilled(bm: Record<string, string>, keys: readonly string[]): boolean {
  return keys.some(k => String(bm[k] || '').trim().length > 0);
}

function relevantStrengthKeys(equipment: string[]): string[] {
  const eq = new Set(equipment);
  const keys: string[] = [];
  const hasBar =
    eq.has('barbell') || eq.has('commercial_gym') || eq.has('full_home_gym') || eq.has('squat_rack');
  const hasDb = eq.has('dumbbells') || eq.has('commercial_gym') || eq.has('full_home_gym');
  const hasKb = eq.has('kettlebells') || eq.has('commercial_gym') || eq.has('full_home_gym');
  const hasBw = eq.has('bodyweight') || eq.has('pull_up_bar') || eq.has('dip_station');

  if (hasBar) keys.push(...STRENGTH_BAR_KEYS);
  if (hasDb) keys.push(...STRENGTH_DB_KEYS);
  if (hasKb) keys.push(...STRENGTH_KB_KEYS);
  if (hasBw) keys.push(...STRENGTH_BW_KEYS);
  if (!keys.length) keys.push(...STRENGTH_BAR_KEYS, ...STRENGTH_BW_KEYS);
  return [...new Set(keys)];
}

export function buildCoachBenchmarkProfile(args: {
  benchmarks?: Record<string, string>;
  equipment?: string[];
  trainingStyle?: string;
  sports?: string[];
  weekNumber?: number;
}): CoachBenchmarkProfile {
  const bmRaw = args.benchmarks || {};
  const filled: Record<string, string> = {};
  for (const [k, v] of Object.entries(bmRaw)) {
    const t = String(v || '').trim();
    if (t) filled[k] = t;
  }

  const trainingStyle = String(args.trainingStyle || 'hybrid');
  const needsRun = trainingStyle === 'endurance' || trainingStyle === 'hybrid';
  const needsStrength = trainingStyle === 'strength' || trainingStyle === 'hybrid';
  const equipment = args.equipment || [];

  const hasRunBenchmarks = needsRun ? hasAnyFilled(filled, RUN_KEYS) : false;
  const strengthKeys = relevantStrengthKeys(equipment);
  const hasStrengthBenchmarks = needsStrength
    ? hasAnyFilled(filled, strengthKeys)
    : false;

  const weekNumber = args.weekNumber ?? 1;
  const cardioDiscoveryWeek = weekNumber === 1 && needsRun && !hasRunBenchmarks;
  const strengthDiscoveryWeek = weekNumber === 1 && needsStrength && !hasStrengthBenchmarks;

  return {
    filled,
    hasRunBenchmarks,
    hasStrengthBenchmarks,
    runBestPaceSecPerKm: deriveRunBestPaceSecPerKm(filled),
    runLongestKm: parseDecimal(filled.run_longest),
    strengthDiscoveryWeek,
    cardioDiscoveryWeek,
  };
}

const BM_LABELS_DE: Record<string, string> = {
  squat_1rm: 'Kniebeuge 1RM',
  bench_1rm: 'Bankdrücken 1RM',
  deadlift_1rm: 'Kreuzheben 1RM',
  ohp_1rm: 'Schulterdrücken 1RM',
  pullups_max: 'Klimmzüge max',
  pushups_max: 'Liegestütze max',
  db_bench: 'KH Bankdrücken',
  db_row: 'KH Rudern',
  kb_swing: 'KB Swing',
  tgu: 'Turkish Get-Up',
  run_5k: '5 km',
  run_10k: '10 km',
  run_half: 'Halbmarathon',
  run_longest: 'Längster Lauf',
  run_weekly_km: 'Wochen-km',
};

const BM_LABELS_EN: Record<string, string> = {
  squat_1rm: 'Back squat 1RM',
  bench_1rm: 'Bench press 1RM',
  deadlift_1rm: 'Deadlift 1RM',
  ohp_1rm: 'Overhead press 1RM',
  pullups_max: 'Pull-ups max',
  pushups_max: 'Push-ups max',
  db_bench: 'DB bench',
  db_row: 'DB row',
  kb_swing: 'KB swing',
  tgu: 'Turkish get-up',
  run_5k: '5 km',
  run_10k: '10 km',
  run_half: 'Half marathon',
  run_longest: 'Longest run',
  run_weekly_km: 'Weekly km',
};

export function formatBenchmarksForCoachPrompt(args: {
  benchmarks?: Record<string, string>;
  equipment?: string[];
  trainingStyle?: string;
  fitnessLevel?: string;
  weekNumber?: number;
  locale?: 'de' | 'en';
}): string {
  const profile = buildCoachBenchmarkProfile({
    benchmarks: args.benchmarks,
    equipment: args.equipment,
    trainingStyle: args.trainingStyle,
    weekNumber: args.weekNumber,
  });
  const labels = args.locale === 'en' ? BM_LABELS_EN : BM_LABELS_DE;
  const lines: string[] = [];
  const level = String(args.fitnessLevel || 'intermediate');

  if (Object.keys(profile.filled).length) {
    lines.push('Recorded benchmarks (MUST use for load/pace prescription when present):');
    for (const [k, v] of Object.entries(profile.filled)) {
      lines.push(`- ${labels[k] || k}: ${v}`);
    }
    if (profile.runBestPaceSecPerKm != null) {
      const mm = Math.floor(profile.runBestPaceSecPerKm / 60);
      const ss = Math.round(profile.runBestPaceSecPerKm % 60);
      lines.push(
        `- Derived best pace baseline: ${mm}:${String(ss).padStart(2, '0')}/km (Zone 2 must be clearly slower)`,
      );
    }
    lines.push(
      `- Athlete self-reported level: ${level} — respect this for exercise complexity, but loads must follow benchmarks above (not generic beginner loads).`,
    );
  } else {
    lines.push('No benchmarks recorded.');
  }

  if (profile.strengthDiscoveryWeek) {
    lines.push(
      'STRENGTH WEEK-1 DISCOVERY: No strength benchmarks — use submaximal RPE 6–7 sets, estimated loads as % bodyweight or “RPE 7–8 guess”, and clear logging instructions. No heavy singles, no aggressive %1RM prescriptions.',
    );
  }
  if (profile.cardioDiscoveryWeek) {
    lines.push(
      'CARDIO WEEK-1 DISCOVERY: No run benchmarks — use conversational easy runs (20–40 min), optional short strides only if athlete feels good. NO fixed race paces; athlete records time, distance, and average HR/RPE for next week calibration.',
    );
  }

  return lines.join('\n');
}
