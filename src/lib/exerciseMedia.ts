import { getCachedCatalogExercise } from './exerciseCatalogCache';
import { getLibraryExercise } from './exerciseLibrary';
import { pickGenderMedia } from './exerciseDb';
import type { LibraryExercise } from './exerciseLibrary';

const ALLOWED_MEDIA_HOSTS = [
  'cdn.exercisedb.dev',
  'static.exercisedb.dev',
];

export function isAllowedExerciseMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_MEDIA_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Optional über Server-Proxy (Referrer/CORS-Probleme im Browser). */
export function exerciseMediaProxyUrl(url: string): string {
  if (!isAllowedExerciseMediaUrl(url)) return url;
  return `/api/exercises/media?url=${encodeURIComponent(url)}`;
}

export function resolveLibraryExercise(
  exerciseKey?: string,
  fallback?: Partial<LibraryExercise>,
): LibraryExercise | undefined {
  if (exerciseKey) {
    const hit = getLibraryExercise(exerciseKey);
    if (hit) return hit;
  }
  if (fallback?.key || fallback?.name) {
    return {
      key: fallback.key || 'unknown',
      name: fallback.name || 'Übung',
      category: fallback.category || 'strength',
      ...fallback,
    } as LibraryExercise;
  }
  return undefined;
}

/** Medien aus Übungsobjekt (Detail-API) — bevorzugt vor globalem Cache. */
export function pickExerciseDisplayMedia(
  ex: LibraryExercise,
  gender?: 'male' | 'female' | 'other',
): { videoUrl?: string; gifUrl?: string; imageUrl?: string } {
  const fromLib = ex.key ? getLibraryExercise(ex.key) : undefined;
  const g = pickGenderMedia(fromLib ?? ex, gender);

  const videoUrl = ex.videoUrl || g.videoUrl;
  const imageUrl = ex.imageUrl || g.imageUrl;
  const gifUrl = ex.gifUrl || g.gifUrl || imageUrl;
  return { videoUrl, imageUrl, gifUrl };
}

export function getExerciseGifUrl(
  exerciseKey?: string,
  gifUrl?: string,
  gender?: 'male' | 'female' | 'other',
): string | undefined {
  if (gifUrl?.trim()) return gifUrl.trim();
  const lib = exerciseKey ? getLibraryExercise(exerciseKey) : undefined;
  if (lib) {
    const m = pickGenderMedia(lib, gender);
    return m.gifUrl || m.imageUrl;
  }
  return undefined;
}

export function getExerciseVideoUrl(
  exerciseKey?: string,
  gender?: 'male' | 'female' | 'other',
  videoUrl?: string,
): string | undefined {
  if (videoUrl?.trim()) return videoUrl.trim();
  const lib = exerciseKey ? getLibraryExercise(exerciseKey) : undefined;
  if (!lib) return undefined;
  return pickGenderMedia(lib, gender).videoUrl;
}

export function getExerciseImageUrl(
  exerciseKey?: string,
  gender?: 'male' | 'female' | 'other',
  imageUrl?: string,
): string | undefined {
  if (imageUrl?.trim()) return imageUrl.trim();
  const lib = exerciseKey ? getLibraryExercise(exerciseKey) : undefined;
  if (!lib) return undefined;
  const m = pickGenderMedia(lib, gender);
  return m.imageUrl || m.gifUrl;
}
