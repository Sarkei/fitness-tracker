/**
 * Namensauflösung für ExerciseDB (DE/EN, Coach-Labels ohne exerciseKey).
 */

import type { LibraryExercise } from './exerciseLibrary';

/** Häufige deutsche Gym-Bezeichnungen → englische Suchbegriffe (ExerciseDB). */
export const DE_EXERCISE_ALIASES: Record<string, string> = {
  bankdrücken: 'bench press',
  bankdruecken: 'bench press',
  bankdruck: 'bench press',
  schrägbankdrücken: 'incline bench press',
  schraegbankdruecken: 'incline bench press',
  kniebeuge: 'barbell squat',
  kniebeugen: 'barbell squat',
  frontkniebeuge: 'front squat',
  kreuzheben: 'barbell deadlift',
  'rumänisches kreuzheben': 'romanian deadlift',
  rumänisches: 'romanian deadlift',
  klimmzug: 'pull up',
  klimmzüge: 'pull up',
  latzug: 'lat pulldown',
  rudern: 'barbell row',
  langhantelrudern: 'barbell row',
  kurzhantelrudern: 'dumbbell row',
  schulterdrücken: 'shoulder press',
  schulterdruecken: 'shoulder press',
  'seitliches heben': 'lateral raise',
  frontheben: 'front raise',
  bizepscurl: 'dumbbell biceps curl',
  'bizeps curl': 'dumbbell biceps curl',
  hammercurl: 'hammer curl',
  trizepsdrücken: 'triceps pushdown',
  trizepsdruecken: 'triceps pushdown',
  dips: 'triceps dip',
  liegestütz: 'push up',
  liegestutze: 'push up',
  beinpresse: 'leg press',
  beinstrecker: 'leg extension',
  beinbeuger: 'leg curl',
  wadenheben: 'calf raise',
  ausfallschritt: 'lunge',
  ausfallschritte: 'lunge',
  'hip thrust': 'hip thrust',
  plank: 'front plank',
  planka: 'front plank',
  crunch: 'crunch',
  bauchpresse: 'crunch',
  butterfly: 'chest fly',
  fliegende: 'dumbbell fly',
  'face pull': 'face pull',
  kabelzug: 'cable crossover',
  'hip abduction': 'hip abduction',
  'hip adduction': 'hip adduction',
};

export function normalizeExerciseSearchText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasForNormalized(n: string): string | undefined {
  if (DE_EXERCISE_ALIASES[n]) return DE_EXERCISE_ALIASES[n];
  for (const [de, en] of Object.entries(DE_EXERCISE_ALIASES)) {
    const d = normalizeExerciseSearchText(de);
    if (n === d || n.includes(d) || d.includes(n)) return en;
  }
  return undefined;
}

/** Suchanfragen in sinnvoller Reihenfolge (spezifisch → alias → gekürzt). */
export function buildExerciseSearchQueries(name: string): string[] {
  const raw = name.trim();
  const n = normalizeExerciseSearchText(raw);
  const out: string[] = [];
  const add = (q: string) => {
    const t = q.trim();
    if (t.length >= 2 && !out.some(x => normalizeExerciseSearchText(x) === normalizeExerciseSearchText(t))) {
      out.push(t);
    }
  };

  add(raw);
  if (n && n !== raw.toLowerCase()) add(n);

  const alias = aliasForNormalized(n);
  if (alias) add(alias);

  const noParen = raw.replace(/\([^)]*\)/g, '').trim();
  if (noParen.length >= 2 && noParen !== raw) add(noParen);

  const noDash = raw.split(/[–—-]/)[0]?.trim();
  if (noDash && noDash.length >= 2 && noDash !== raw) add(noDash);

  return out.slice(0, 8);
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(t => t.length > 2));
  const tb = new Set(b.split(/\s+/).filter(t => t.length > 2));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n += 1;
  return n;
}

/** Beste Treffer aus einer ExerciseDB-Suchliste wählen. */
export function pickBestExerciseNameMatch(
  query: string,
  candidates: LibraryExercise[],
): LibraryExercise | null {
  if (!candidates.length) return null;
  const q = normalizeExerciseSearchText(query);
  const altQueries = buildExerciseSearchQueries(query).map(normalizeExerciseSearchText);

  let best: LibraryExercise | null = null;
  let bestScore = 0;

  for (const ex of candidates) {
    const n = normalizeExerciseSearchText(ex.name);
    let score = 0;
    if (n === q) score += 100;
    else if (q.length >= 4 && (n.includes(q) || q.includes(n))) score += 48;
    score += tokenOverlap(q, n) * 14;

    for (const alt of altQueries) {
      if (!alt) continue;
      if (n === alt) score += 85;
      else if (alt.length >= 4 && (n.includes(alt) || alt.includes(n))) score += 38;
      score += tokenOverlap(alt, n) * 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = ex;
    }
  }

  return bestScore >= 20 ? best : null;
}
