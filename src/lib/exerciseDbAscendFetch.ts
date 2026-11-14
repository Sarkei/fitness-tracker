/**
 * AscendAPI ExerciseDB (RapidAPI) — /api/v1/* Pfade.
 * @see https://docs.ascendapi.com/quickstart/overview
 */

import {
  ExerciseDbFetchError,
  exerciseDbApiKey,
  exerciseDbHost,
  legacyBodyPartToAscendLabel,
  mapExerciseDbToCatalog,
  type ExerciseDbRaw,
} from './exerciseDb';
import type { LibraryExercise } from './exerciseLibrary';

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
  const host = exerciseDbHost();
  return {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': host,
    Accept: 'application/json',
  };
}

type AscendEnvelope<T> = { success?: boolean; data?: T };

function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in (body as AscendEnvelope<T>)) {
    const env = body as AscendEnvelope<T>;
    if (env.success === false) {
      throw new ExerciseDbFetchError('ExerciseDB API returned success=false', 'unavailable');
    }
    return env.data as T;
  }
  return body as T;
}

async function parseAscendJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (r.status === 429) {
    throw new ExerciseDbFetchError('ExerciseDB rate limit', 'rate_limited');
  }
  if (!r.ok) {
    throw new ExerciseDbFetchError(`ExerciseDB HTTP ${r.status}: ${text.slice(0, 200)}`, 'unavailable');
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return unwrapData<T>(parsed);
  } catch (e) {
    if (e instanceof ExerciseDbFetchError) throw e;
    throw new ExerciseDbFetchError('Invalid JSON from ExerciseDB', 'unavailable');
  }
}

async function fetchAscend<T>(pathWithQuery: string): Promise<T> {
  const host = exerciseDbHost();
  const url = `https://${host}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
  const cached = cacheGet<T>(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: headers() });
  const data = await parseAscendJson<T>(r);
  cacheSet(url, data);
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

function queryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function ascendFetchExerciseById(id: string): Promise<LibraryExercise | null> {
  const clean = id.replace(/^edb_/, '').trim();
  if (!clean) return null;
  const raw = await fetchAscend<ExerciseDbRaw>(
    `/api/v1/exercises/${encodeURIComponent(clean)}`,
  );
  return mapExerciseDbToCatalog(raw);
}

export async function ascendSearchByName(query: string, limit = 25): Promise<LibraryExercise[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const raw = await fetchAscend<ExerciseDbRaw[]>(
    `/api/v1/exercises/search${queryString({ search: q, limit: Math.min(25, limit) })}`,
  );
  return mapList(raw).slice(0, limit);
}

let cachedBodyPartNames: string[] | null = null;

async function resolveAscendBodyPartLabel(bodyPartSlug: string): Promise<string> {
  const slug = bodyPartSlug.trim().toLowerCase();
  const fallback = legacyBodyPartToAscendLabel(bodyPartSlug);
  try {
    if (!cachedBodyPartNames) {
      const lists = await ascendFetchFilterLists();
      cachedBodyPartNames = lists.bodyParts ?? [];
    }
    const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const want = fold(slug);
    const hit = cachedBodyPartNames.find(n => fold(n) === want || fold(n).includes(want) || want.includes(fold(n)));
    if (hit) return hit;
  } catch {
    /* use fallback label */
  }
  return fallback;
}

export async function ascendFetchByBodyPart(bodyPart: string, limit = 30): Promise<LibraryExercise[]> {
  const label = await resolveAscendBodyPartLabel(bodyPart);
  const lim = Math.min(50, Math.max(1, limit));
  const attempts = [
    queryString({ bodyParts: label, limit: lim }),
    queryString({ bodyPart: label, limit: lim }),
  ];
  for (const qs of attempts) {
    try {
      const raw = await fetchAscend<ExerciseDbRaw[]>(`/api/v1/exercises${qs}`);
      const list = mapList(raw);
      if (list.length > 0) return list.slice(0, limit);
    } catch {
      /* next attempt */
    }
  }
  try {
    const raw = await fetchAscend<ExerciseDbRaw[]>(
      `/api/v1/exercises/search${queryString({ search: bodyPart.replace(/\s+/g, ' '), limit: lim })}`,
    );
    return mapList(raw).slice(0, limit);
  } catch {
    return [];
  }
}

/** Startliste ohne Suchbegriff (AscendAPI Advanced Filter). */
export async function ascendFetchBrowse(limit = 25): Promise<LibraryExercise[]> {
  const raw = await fetchAscend<ExerciseDbRaw[]>(
    `/api/v1/exercises${queryString({ limit: Math.min(25, limit) })}`,
  );
  return mapList(raw);
}

export async function ascendFetchByTarget(target: string, limit = 30): Promise<LibraryExercise[]> {
  const t = target.trim();
  if (!t) return [];
  const raw = await fetchAscend<ExerciseDbRaw[]>(
    `/api/v1/exercises${queryString({
      targetMuscles: t,
      limit: Math.min(25, limit),
    })}`,
  );
  return mapList(raw).slice(0, limit);
}

export async function ascendFetchFilterLists(): Promise<{
  bodyParts: string[];
  targets: string[];
  equipments: string[];
}> {
  const [bodyPartsRaw, musclesRaw, equipmentsRaw] = await Promise.all([
    fetchAscend<{ name: string }[]>('/api/v1/bodyparts'),
    fetchAscend<{ name: string }[]>('/api/v1/muscles'),
    fetchAscend<{ name: string }[]>('/api/v1/equipments'),
  ]);
  return {
    bodyParts: (bodyPartsRaw || []).map(x => x.name).filter(Boolean),
    targets: (musclesRaw || []).map(x => x.name).filter(Boolean),
    equipments: (equipmentsRaw || []).map(x => x.name).filter(Boolean),
  };
}
