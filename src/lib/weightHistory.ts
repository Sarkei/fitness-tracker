/**
 * Gewichtsverlauf aus Profil — inkl. Onboarding-Gewicht in measurements.weight.
 */

import { format } from 'date-fns';
import type { UserProfile } from '@/src/types';

export type WeightHistoryEntry = { date: string; value: number };

function dayKey(date: string): string {
  return date.split('T')[0];
}

/** Vereinigt weightHistory + measurements.weight; fällt auf aktuelles Gewicht zurück. */
export function resolveWeightHistoryForProfile(
  profile: UserProfile | null | undefined,
): WeightHistoryEntry[] {
  if (!profile) return [];

  const merged: WeightHistoryEntry[] = [
    ...(profile.weightHistory ?? []),
    ...(profile.measurements?.weightHistory ?? []),
  ];

  const byDate = new Map<string, number>();
  for (const e of merged) {
    if (!e?.date || !Number.isFinite(e.value) || e.value <= 0) continue;
    byDate.set(dayKey(e.date), e.value);
  }

  if (byDate.size === 0) {
    const w = profile.measurements?.weight;
    if (w != null && Number.isFinite(w) && w > 0) {
      const d = profile.accountCreatedAt
        ? dayKey(profile.accountCreatedAt)
        : format(new Date(), 'yyyy-MM-dd');
      byDate.set(d, w);
    }
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
