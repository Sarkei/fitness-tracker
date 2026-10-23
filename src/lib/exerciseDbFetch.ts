/**
 * Server-seitige ExerciseDB (RapidAPI) Abfragen mit einfachem In-Memory-Cache.
 */

import {
  ascendFetchBrowse,
  ascendFetchByBodyPart,
  ascendFetchByTarget,
  ascendFetchExerciseById,
  ascendFetchFilterLists,
  ascendSearchByName,
} from './exerciseDbAscendFetch';
import {
  ExerciseDbFetchError,
  exerciseDbApiKey,
  exerciseDbHost,
  isAscendExerciseDbHost,
  isExerciseDbConfigured,
  mapExerciseDbToCatalog,
  muscleFilterToBodyPart,
  muscleFilterToBodyParts,
  type ExerciseDbRaw,
} from './exerciseDb';
import type { LibraryExercise, LibraryMuscleFilterId } from './exerciseLibrary';
import { rankSimilarExercises } from './exerciseSimilar';

export { ExerciseDbFetchError };

/** Namenssuche, wenn Körperregion-Filter leer liefert (Ascend-Stammdaten). */
const MUSCLE_FILTER_FALLBACK_SEARCH: Partial<Record<LibraryMuscleFilterId, string[]>> = {
  beine: ['squat', 'leg press', 'lunge', 'leg curl', 'deadlift', 'calf raise'],
  arme: ['bicep curl', 'tricep extension', 'curl'],
  brust: ['bench press', 'push-up', 'fly'],
  rücken: ['row', 'pull-up', 'lat pulldown'],
  schulter: ['shoulder press', 'lateral raise'],
  core: ['plank', 'crunch', 'abs'],
  ganzkörper: ['burpee', 'clean'],
};

const MUSCLE_FILTER_FALLBACK_TARGETS: Partial<Record<LibraryMuscleFilterId, string[]>> = {
  beine: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors'],
  arme: ['biceps', 'triceps', 'forearms'],
  brust: ['pectorals', 'chest'],
  rücken: ['lats', 'traps', 'upper back'],
  schulter: ['delts', 'shoulders'],
  core: ['abs', 'obliques'],
};

const TTL_MS = 1000 * 60 * 60 * 12;
const cache = new Map<string, { at: number; data: unknown }>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown): void {
  cache.set(key, { at: Date.now(), data });
}

function headers(): HeadersInit {
  const key = exerciseDbApiKey();
  if (!key) throw new ExerciseDbFetchError('ExerciseDB API key missing', 'not_configured');
  return {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': exerciseDbHost(),
    Accept: 'application/json',
  };
}

async function parseJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError('ExerciseDB rate limit', 'rate_limited');
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, 'unavailable');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ExerciseDbFetchError('Invalid JSON from ExerciseDB', 'unavailable');
  }
}

async function fetchPath<T>(path: string): Promise<T> {
  const url = `https://${exerciseDbHost()}${path.startsWith('/') ? path : `/${path}`}`;
  const cacheKey = url;
  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers() });
  const data = await parseJson<T>(r);
  cacheSet(cacheKey, data);
  return data;
}

function mapList(raw: unknown): LibraryExercise[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LibraryExercise[] = [];
  for (const row of raw) {
    const ex = mapExerciseDbToCatalog(row as ExerciseDbRaw);
    if (!ex || seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}

export async function fetchExerciseDbById(id: string): Promise<LibraryExercise | null> {
  if (!isExerciseDbConfigured()) return null;
  const clean = id.replace(/^edb_/, '').trim();
  if (!clean) return null;
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchExerciseById(clean);
    }
    const raw = await fetchPath<ExerciseDbRaw>(`/exercises/exercise/${encodeURIComponent(clean)}`);
    return mapExerciseDbToCatalog(raw);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), 'network');
  }
}

export async function searchExerciseDbByName(query: string, limit = 25): Promise<LibraryExercise[]> {
  if (!isExerciseDbConfigured()) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendSearchByName(q, limit);
    }
    const raw = await fetchPath<ExerciseDbRaw[]>(
      `/exercises/name/${encodeURIComponent(q)}`,
    );
    return mapList(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), 'network');
  }
}

export async function fetchExerciseDbByBodyPart(
  bodyPart: string,
  limit = 30,
): Promise<LibraryExercise[]> {
  if (!isExerciseDbConfigured()) return [];
  const bp = bodyPart.trim().toLowerCase();
  if (!bp) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByBodyPart(bp, limit);
    }
    const raw = await fetchPath<ExerciseDbRaw[]>(
      `/exercises/bodyPart/${encodeURIComponent(bp)}`,
    );
    return mapList(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), 'network');
  }
}

/** Mehrere Körperregionen parallel (z. B. Beine = upper + lower legs). */
export async function fetchExerciseDbByBodyParts(
  bodyParts: string[],
  limit = 40,
): Promise<LibraryExercise[]> {
  const parts = bodyParts.map(p => p.trim().toLowerCase()).filter(Boolean);
  if (!isExerciseDbConfigured() || parts.length === 0) return [];
  const perPart = Math.max(10, Math.ceil(limit / parts.length));
  const seen = new Set<string>();
  const out: LibraryExercise[] = [];

  const batches = await Promise.all(
    parts.map(bp =>
      fetchExerciseDbByBodyPart(bp, perPart).catch(() => [] as LibraryExercise[]),
    ),
  );
  for (const batch of batches) {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  }
  return out.slice(0, limit);
}

export async function fetchExerciseDbByTarget(target: string, limit = 30): Promise<LibraryExercise[]> {
  if (!isExerciseDbConfigured()) return [];
  const t = target.trim().toLowerCase();
  if (!t) return [];
  try {
    if (isAscendExerciseDbHost()) {
      return await ascendFetchByTarget(t, limit);
    }
    const raw = await fetchPath<ExerciseDbRaw[]>(
      `/exercises/target/${encodeURIComponent(t)}`,
    );
    return mapList(raw).slice(0, limit);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError(String(e), 'network');
  }
}

export async function searchExerciseDbCatalog(opts: {
  query?: string;
  muscle?: LibraryMuscleFilterId;
  limit?: number;
}): Promise<LibraryExercise[]> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const q = (opts.query || '').trim();
  const muscle = opts.muscle ?? 'all';

  if (muscle !== 'all' && muscle !== 'cardio_art' && q.length < 2) {
    const parts = muscleFilterToBodyParts(muscle);
    if (parts.length > 0) {
      return fetchExercisesForMuscleFilter(muscle, limit);
    }
  }

  if (q.length >= 2) {
    let list = await searchExerciseDbByName(q, limit);
    if (muscle !== 'all') {
      list = list.filter(e => {
        if (muscle === 'cardio_art') return e.category === 'cardio';
        return e.tags?.includes(muscle) ?? false;
      });
    }
    return list.slice(0, limit);
  }

  if (muscle === 'cardio_art') {
    return fetchExerciseDbByBodyPart('cardio', limit);
  }

  const parts = muscleFilterToBodyParts(muscle);
  if (parts.length > 0) return fetchExercisesForMuscleFilter(muscle, limit);

  if (isAscendExerciseDbHost() && isExerciseDbConfigured()) {
    return ascendFetchBrowse(limit);
  }

  return [];
}

/** Muskel-Chip: Body-Parts, Target-Muscles, Namenssuche, Browse-Filter. */
async function fetchExercisesForMuscleFilter(
  muscle: LibraryMuscleFilterId,
  limit: number,
): Promise<LibraryExercise[]> {
  const parts = muscleFilterToBodyParts(muscle);
  const seen = new Set<string>();
  const out: LibraryExercise[] = [];
  const merge = (batch: LibraryExercise[]) => {
    for (const ex of batch) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        out.push(ex);
      }
    }
  };

  merge(await fetchExerciseDbByBodyParts(parts, limit));

  if (out.length < limit) {
    for (const target of MUSCLE_FILTER_FALLBACK_TARGETS[muscle] ?? []) {
      merge(await fetchExerciseDbByTarget(target, 14).catch(() => []));
      if (out.length >= limit) break;
    }
  }

  if (out.length < limit) {
    for (const term of MUSCLE_FILTER_FALLBACK_SEARCH[muscle] ?? []) {
      const batch = await searchExerciseDbByName(term, 12).catch(() => []);
      for (const ex of batch) {
        if (!seen.has(ex.key) && (ex.tags?.includes(muscle) ?? true)) {
          seen.add(ex.key);
          out.push(ex);
        }
      }
      if (out.length >= limit) break;
    }
  }

  if (out.length === 0 && isAscendExerciseDbHost()) {
    const browse = await ascendFetchBrowse(Math.min(80, limit * 3)).catch(() => []);
    for (const ex of browse) {
      if (ex.tags?.includes(muscle)) merge([ex]);
      if (out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}

export async function fetchExerciseDbFilterLists(): Promise<{
  bodyParts: string[];
  targets: string[];
  equipments: string[];
}> {
  if (!isExerciseDbConfigured()) {
    return { bodyParts: [], targets: [], equipments: [] };
  }
  if (isAscendExerciseDbHost()) {
    return ascendFetchFilterLists();
  }
  const [bodyParts, targets, equipments] = await Promise.all([
    fetchPath<string[]>('/exercises/bodyPartList'),
    fetchPath<string[]>('/exercises/targetList'),
    fetchPath<string[]>('/exercises/equipmentList'),
  ]);
  return { bodyParts, targets, equipments };
}

/** Ähnliche Übungen (gleicher Target / Body Part, anderes Gerät möglich). */
export async function findSimilarExercises(
  exerciseKey: string,
  limit = 12,
): Promise<LibraryExercise[]> {
  if (!isExerciseDbConfigured()) return [];
  const id = exerciseKey.replace(/^edb_/, '').trim();
  if (!id) return [];

  let source = await fetchExerciseDbById(id);
  if (!source) return [];

  const pool: LibraryExercise[] = [];
  const seen = new Set<string>([source.key]);

  const addList = (list: LibraryExercise[]) => {
    for (const ex of list) {
      if (!seen.has(ex.key)) {
        seen.add(ex.key);
        pool.push(ex);
      }
    }
  };

  if (source.targetMuscle) {
    addList(await fetchExerciseDbByTarget(source.targetMuscle, 35));
  }
  if (source.bodyPart) {
    addList(await fetchExerciseDbByBodyPart(source.bodyPart, 25));
  }
  if (pool.length < 8 && source.name.length >= 3) {
    const words = source.name.split(/\s+/).filter(w => w.length > 3);
    const q = words[0] || source.name.slice(0, 8);
    addList(await searchExerciseDbByName(q, 20));
  }

  return rankSimilarExercises(source, pool, limit);
}

const COACH_CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
let coachCatalogCache: { at: number; maxPerGroup: number; text: string } | null = null;

async function fetchCoachCatalogGroup(
  g: { label: string; bodyPart: string; target?: string },
  maxPerGroup: number,
): Promise<string[]> {
  try {
    let items: LibraryExercise[] = [];
    if (g.target) {
      try {
        items = await fetchExerciseDbByTarget(g.target, maxPerGroup);
      } catch {
        items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
      }
    } else {
      items = await fetchExerciseDbByBodyPart(g.bodyPart, maxPerGroup);
    }
    return items.map(ex => {
      const meta = [
        g.label,
        ex.targetMuscle ? `target:${ex.targetMuscle}` : '',
        ex.bodyPart ? `body:${ex.bodyPart}` : '',
        ex.equipment ? `equip:${ex.equipment}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `${ex.key} | ${ex.name} | ${meta}`;
    });
  } catch {
    return [];
  }
}

/** Kompakter Katalog für Coach-Prompt — parallel pro Muskelgruppe, gecacht. */
export async function formatExerciseDbCatalogForCoach(maxPerGroup = 12): Promise<string> {
  if (!isExerciseDbConfigured()) return '';
  const cap = Math.max(6, Math.min(20, Math.round(maxPerGroup)));
  if (
    coachCatalogCache &&
    coachCatalogCache.maxPerGroup === cap &&
    Date.now() - coachCatalogCache.at < COACH_CATALOG_CACHE_TTL_MS
  ) {
    return coachCatalogCache.text;
  }

  const groups: { label: string; bodyPart: string; target?: string }[] = [
    { label: 'push_chest', bodyPart: 'chest', target: 'pectorals' },
    { label: 'pull_back', bodyPart: 'back', target: 'lats' },
    { label: 'legs', bodyPart: 'upper legs', target: 'quads' },
    { label: 'glutes_hams', bodyPart: 'upper legs', target: 'glutes' },
    { label: 'shoulders', bodyPart: 'shoulders', target: 'deltoids' },
    { label: 'arms', bodyPart: 'upper arms', target: 'biceps' },
    { label: 'core', bodyPart: 'waist', target: 'abs' },
    { label: 'cardio', bodyPart: 'cardio' },
  ];

  const groupLines = await Promise.all(groups.map(g => fetchCoachCatalogGroup(g, cap)));
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const batch of groupLines) {
    for (const line of batch) {
      const key = line.split('|')[0]?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }

  const text = lines.join('\n');
  coachCatalogCache = { at: Date.now(), maxPerGroup: cap, text };
  return text;
}
