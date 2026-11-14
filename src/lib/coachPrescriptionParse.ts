/**
 * Coach-Strings → numerische Vorgaben für Live-Session.
 */

import type { CoachPrescription } from '@/src/types';
import { isBodyweightByNameOrEquipment, isClearlyWeightedStrengthExercise } from '@/src/lib/exerciseLibrarySwap';
import { parseCoachReps, parseCoachSets } from '@/src/lib/coachTemplateMappers';
import { isBodyweightLabel } from '@/src/lib/sessionPrescription';

export function parseCoachRestSec(rest: unknown): number | undefined {
  if (rest == null) return undefined;
  const s = String(rest).trim().toLowerCase();
  if (!s) return undefined;
  const sec = s.match(/^(\d+(?:\.\d+)?)\s*s/);
  if (sec) return Math.round(parseFloat(sec[1]));
  const min = s.match(/^(\d+(?:\.\d+)?)\s*m/);
  if (min) return Math.round(parseFloat(min[1]) * 60);
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n > 0 && n < 600) return n;
  return undefined;
}

export function parseCoachDurationMin(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return undefined;
  const h = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/);
  if (h) {
    const hours = parseInt(h[1], 10);
    const mins = h[2] ? parseInt(h[2], 10) : 0;
    return hours * 60 + mins;
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
  if (m) return Math.max(1, Math.round(parseFloat(m[1])));
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
}

export function parseCoachDistanceKm(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw || '').trim().toLowerCase().replace(',', '.');
  const km = s.match(/(\d+(?:\.\d+)?)\s*km/);
  if (km) return parseFloat(km[1]);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?!in)/);
  if (m) return parseFloat(m[1]) / 1000;
  const n = parseFloat(s);
  if (Number.isFinite(n) && n > 0 && n < 500) return n;
  return undefined;
}

export function parseCoachWeightKg(
  weight: unknown,
  profile?: { measurements?: { weight?: number } },
): { kg?: number; label?: string } {
  if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
    return { kg: weight };
  }
  if (typeof weight !== 'string' || !weight.trim()) return {};
  const label = weight.trim();
  const direct = parseFloat(label.replace(',', '.'));
  if (Number.isFinite(direct) && direct > 0 && !label.includes('%')) return { kg: direct };
  const kgMatch = label.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kgMatch) return { kg: parseFloat(kgMatch[1]), label };
  const pct = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct && profile?.measurements?.weight) {
    const bw = profile.measurements.weight;
    const kg = Math.round(bw * (parseFloat(pct[1]) / 100) * 2) / 2;
    return { kg, label };
  }
  return { label };
}

export function parseCoachRepsRange(reps: unknown): {
  target: number;
  min?: number;
  max?: number;
} {
  if (typeof reps === 'number' && Number.isFinite(reps)) {
    return { target: Math.max(1, Math.round(reps)), min: Math.max(1, Math.round(reps)) };
  }
  if (typeof reps === 'string') {
    const nums = reps.match(/\d+/g);
    if (nums && nums.length >= 2) {
      const a = parseInt(nums[0], 10);
      const b = parseInt(nums[1], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return { min: Math.min(a, b), max: Math.max(a, b), target: Math.round((a + b) / 2) };
      }
    }
  }
  const target = parseCoachReps(reps);
  return { target, min: target, max: target };
}

export function buildCoachPrescriptionFromRow(
  ex: Record<string, unknown>,
  profile?: { measurements?: { weight?: number } },
): CoachPrescription | undefined {
  const name = String(ex.name ?? '');
  const key = typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined;
  const bodyweight = isBodyweightByNameOrEquipment(name, key);
  const repsRange = parseCoachRepsRange(ex.reps);
  let { kg, label } = bodyweight
    ? { kg: undefined as number | undefined, label: 'Körpergewicht' as string | undefined }
    : parseCoachWeightKg(ex.weight, profile);
  if (
    !bodyweight &&
    label &&
    isBodyweightLabel(label) &&
    isClearlyWeightedStrengthExercise(name)
  ) {
    label = undefined;
    kg = undefined;
  }
  const restSec = parseCoachRestSec(ex.rest);
  const sets = parseCoachSets(ex.sets);
  const noteParts = [
    !bodyweight && typeof ex.weight === 'string' && ex.weight && !kg ? `Gewicht: ${ex.weight}` : '',
    typeof ex.rest === 'string' && ex.rest ? `Pause: ${ex.rest}` : '',
    typeof ex.notes === 'string' ? ex.notes : '',
  ].filter(Boolean);

  const hasAny =
    kg != null ||
    repsRange.target > 0 ||
    restSec != null ||
    sets > 0 ||
    noteParts.length > 0;

  if (!hasAny) return undefined;

  return {
    targetWeightKg: kg,
    weightLabel: label,
    targetReps: repsRange.target,
    targetRepsMin: repsRange.min,
    targetRepsMax: repsRange.max,
    targetRestSec: restSec,
    targetSets: sets,
    coachNote: noteParts.join(' · ') || undefined,
  };
}

export function buildCardioPrescriptionFromDay(
  day: Record<string, unknown>,
  cardio?: Record<string, unknown>,
): CoachPrescription | undefined {
  const c = cardio || (day.cardio as Record<string, unknown> | undefined);
  if (!c || typeof c !== 'object') {
    const est = typeof day.estimatedDuration === 'number' ? day.estimatedDuration : undefined;
    const desc = typeof day.description === 'string' ? day.description : '';
    if (!est && !desc) return undefined;
    return {
      targetDurationMin: est,
      coachNote: desc || undefined,
    };
  }
  const durationMin = parseCoachDurationMin(c.duration) ?? parseCoachDurationMin(day.estimatedDuration);
  const distanceKm = parseCoachDistanceKm(c.distance);
  const pace = c.pace != null ? String(c.pace).trim() : undefined;
  const zones = c.zones != null ? String(c.zones).trim() : undefined;
  const details = c.details != null ? String(c.details).trim() : undefined;
  const rpe = typeof day.rpe === 'number' ? day.rpe : undefined;

  return {
    targetDurationMin: durationMin,
    targetDistanceKm: distanceKm,
    targetPace: pace,
    targetZones: zones,
    targetRpe: rpe,
    coachNote: [details, typeof day.description === 'string' ? day.description : ''].filter(Boolean).join(' · ') || undefined,
  };
}
