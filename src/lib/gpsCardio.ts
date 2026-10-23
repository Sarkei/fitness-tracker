import type { Exercise } from '@/src/types';
import { getLibraryExercise } from '@/src/lib/exerciseLibrary';

export type GpsActivityType = 'running' | 'cycling' | 'swimming' | 'rowing' | 'cardio';

export function inferGpsActivityType(ex: Exercise): GpsActivityType {
  const lib = ex.exerciseKey ? getLibraryExercise(ex.exerciseKey) : undefined;
  const hay = `${ex.name} ${lib?.tags?.join(' ') || ''}`.toLowerCase();
  if (/\b(run|jog|lauf|tempo|5k|10k)\b/.test(hay) || lib?.tags?.includes('laufen')) return 'running';
  if (/\b(bike|cycl|rad|ride)\b/.test(hay) || lib?.tags?.includes('bike')) return 'cycling';
  if (/\b(swim|schwimm)\b/.test(hay) || lib?.tags?.includes('schwimmen')) return 'swimming';
  if (/\b(row|ruder|ski)\b/.test(hay) || lib?.tags?.includes('rudern')) return 'rowing';
  return 'cardio';
}

export function exerciseSupportsGpsTracking(ex: Exercise): boolean {
  if (ex.exerciseCategory === 'cardio') {
    const t = inferGpsActivityType(ex);
    return t === 'running' || t === 'cycling';
  }
  return false;
}

/** Lauf/Rad/Schwimmen mit Distanz — nicht Mobilisation oder reines Zeit-Cardio. */
export function isDistanceCardioExercise(ex: Exercise): boolean {
  if (ex.mobilityTimer) return false;
  if (ex.sessionPhase === 'warmup' || ex.sessionPhase === 'cooldown') {
    const hay = `${ex.name || ''} ${ex.notes || ''}`.toLowerCase();
    if (/\bmobilis|stretch|dehnen|foam|yoga|aufwärm|warm.?up\b/.test(hay)) return false;
  }
  if (exerciseSupportsGpsTracking(ex)) return true;
  const cp = ex.coachPrescription;
  if (cp?.targetDistanceKm != null && cp.targetDistanceKm > 0) return true;
  if (ex.distanceKm != null && ex.distanceKm > 0) return true;
  const hay = `${ex.name || ''} ${ex.notes || ''}`.toLowerCase();
  if (/\b\d+([.,]\d+)?\s*km\b/.test(hay)) return true;
  if (/\b(run|lauf|jog|jogging|ride|bike|rad|cycling|rowing|ruder|swim|schwimm)\b/.test(hay)) {
    return !/\bmobilis|stretch|dehnen|foam\b/.test(hay);
  }
  return false;
}

export function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
