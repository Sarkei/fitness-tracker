import { api } from '@/src/lib/api';
import { cacheCatalogExercise } from '@/src/lib/exerciseCatalogCache';
import { isExerciseDbCatalogKey } from '@/src/lib/exerciseDb';
import type { LibraryExercise, LibraryMuscleFilterId } from '@/src/lib/exerciseLibrary';
import {
  buildExerciseSearchQueries,
  pickBestExerciseNameMatch,
} from '@/src/lib/exerciseResolve';

export { buildExerciseSearchQueries, pickBestExerciseNameMatch } from '@/src/lib/exerciseResolve';

export async function fetchExerciseDbStatus(): Promise<{ configured: boolean }> {
  return api<{ configured: boolean }>('/api/exercises/status');
}

function mapExerciseSearchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('exercisedb-not-configured') || m.includes('not_configured')) {
    return 'ExerciseDB ist auf dem Server nicht konfiguriert. EXERCISEDB_RAPIDAPI_KEY in .env prüfen und Container neu starten.';
  }
  if (m.includes('rate_limited') || m.includes('rate limit')) {
    return 'ExerciseDB Rate-Limit erreicht — bitte kurz warten und erneut versuchen.';
  }
  if (m.includes('exercisedb-fetch-failed') || m.includes('unavailable')) {
    return 'ExerciseDB-Anfrage fehlgeschlagen — Host EXERCISEDB_RAPIDAPI_HOST und RapidAPI-Abo prüfen.';
  }
  return message || 'Übungen konnten nicht geladen werden.';
}

export async function searchExercisesCatalog(opts: {
  q?: string;
  muscle?: LibraryMuscleFilterId;
  limit?: number;
}): Promise<LibraryExercise[]> {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.muscle && opts.muscle !== 'all') params.set('muscle', opts.muscle);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  try {
    const data = await api<{ exercises: LibraryExercise[]; error?: string }>(
      `/api/exercises/search${qs ? `?${qs}` : ''}`,
    );
    const list = data.exercises ?? [];
    for (const ex of list) cacheCatalogExercise(ex);
    return list;
  } catch (e) {
    throw new Error(mapExerciseSearchError(e instanceof Error ? e.message : String(e)));
  }
}

export async function fetchExerciseById(id: string): Promise<LibraryExercise> {
  const clean = id.replace(/^edb_/, '').trim();
  const data = await api<{ exercise: LibraryExercise }>(
    `/api/exercises/${encodeURIComponent(clean)}`,
  );
  if (data.exercise) cacheCatalogExercise(data.exercise);
  return data.exercise;
}

export async function fetchExerciseFilterLists(): Promise<{
  bodyParts: string[];
  targets: string[];
  equipments: string[];
}> {
  return api('/api/exercises/filters');
}

export async function fetchSimilarExercises(
  exerciseKey: string,
  limit = 12,
): Promise<LibraryExercise[]> {
  const params = new URLSearchParams({ key: exerciseKey, limit: String(limit) });
  const data = await api<{ exercises: LibraryExercise[] }>(
    `/api/exercises/similar?${params}`,
  );
  const list = data.exercises ?? [];
  for (const ex of list) cacheCatalogExercise(ex);
  return list;
}

export class ExerciseResolveError extends Error {
  readonly code: 'not-configured' | 'not-found' | 'fetch-failed';

  constructor(message: string, code: ExerciseResolveError['code']) {
    super(message);
    this.name = 'ExerciseResolveError';
    this.code = code;
  }
}

function hasExerciseMedia(ex: LibraryExercise): boolean {
  return Boolean(ex.videoUrl?.trim() || ex.gifUrl?.trim() || ex.imageUrl?.trim());
}

function hasExerciseInstructions(ex: LibraryExercise): boolean {
  return (ex.instructions?.length ?? 0) > 0;
}

/**
 * Lädt vollständige ExerciseDB-Details per Key und/oder Namenssuche (Coach-Übungen ohne edb_*).
 */
export async function resolveExerciseForDetail(opts: {
  exercise?: LibraryExercise | null;
  exerciseKey?: string;
  name?: string;
}): Promise<LibraryExercise> {
  const name = (opts.name || opts.exercise?.name || '').trim();
  const key = (opts.exerciseKey || opts.exercise?.key || '').trim();

  const tryFetchByKey = async (catalogKey: string): Promise<LibraryExercise | null> => {
    if (!isExerciseDbCatalogKey(catalogKey)) return null;
    try {
      const full = await fetchExerciseById(catalogKey);
      if (hasExerciseMedia(full) || hasExerciseInstructions(full)) return full;
      return full;
    } catch {
      return null;
    }
  };

  if (key) {
    const byKey = await tryFetchByKey(key);
    if (byKey) return byKey;
  }

  const stubId = opts.exercise?.exerciseId?.trim();
  if (stubId && (!key || key !== `edb_${stubId}`)) {
    const byId = await tryFetchByKey(`edb_${stubId.replace(/^edb_/, '')}`);
    if (byId) return byId;
  }

  if (name.length >= 2) {
    let configuredError: string | null = null;
    for (const q of buildExerciseSearchQueries(name)) {
      let list: LibraryExercise[];
      try {
        list = await searchExercisesCatalog({ q, limit: 24 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('nicht konfiguriert') || msg.includes('not-configured')) {
          configuredError = msg;
        }
        continue;
      }
      const hit = pickBestExerciseNameMatch(name, list);
      if (!hit) continue;
      const id = hit.exerciseId || hit.key.replace(/^edb_/, '');
      try {
        return await fetchExerciseById(id);
      } catch {
        if (hasExerciseMedia(hit) || hasExerciseInstructions(hit)) return hit;
      }
    }
    if (configuredError) {
      throw new ExerciseResolveError(configuredError, 'not-configured');
    }
  }

  if (opts.exercise && (hasExerciseMedia(opts.exercise) || hasExerciseInstructions(opts.exercise))) {
    return opts.exercise;
  }

  if (name) {
    throw new ExerciseResolveError(
      `Keine Übung zu „${name}" in ExerciseDB gefunden.`,
      'not-found',
    );
  }
  throw new ExerciseResolveError('Übung konnte nicht aufgelöst werden.', 'not-found');
}
