/**
 * Ranking für „ähnliche Übungen“ (gleiche Muskelgruppe / Equipment / Kategorie).
 */

import type { LibraryExercise } from './exerciseLibrary';

function norm(s?: string): string {
  return (s || '').trim().toLowerCase();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n += 1;
  return n;
}

export function rankSimilarExercises(
  source: LibraryExercise,
  candidates: LibraryExercise[],
  limit = 12,
): LibraryExercise[] {
  const srcTarget = norm(source.targetMuscle);
  const srcBody = norm(source.bodyPart);
  const srcEquip = norm(source.equipment);
  const srcCat = source.category;
  const srcName = source.name;

  const scored = candidates
    .filter(c => c.key !== source.key)
    .map(c => {
      let score = 0;
      const t = norm(c.targetMuscle);
      const bp = norm(c.bodyPart);
      const eq = norm(c.equipment);

      if (srcTarget && t === srcTarget) score += 40;
      else if (srcTarget && t && (t.includes(srcTarget) || srcTarget.includes(t))) score += 22;
      if (srcBody && bp === srcBody) score += 25;
      if (srcEquip && eq === srcEquip) score += 18;
      else if (srcEquip && eq && (eq.includes('body weight') || srcEquip.includes('body weight'))) score += 8;
      if (c.category === srcCat) score += 12;

      const tagOverlap = (source.tags || []).filter(tag => c.tags?.includes(tag)).length;
      score += tagOverlap * 6;

      score += tokenOverlap(srcName, c.name) * 4;

      for (const v of source.variations || []) {
        if (tokenOverlap(v, c.name) >= 2) score += 10;
      }

      return { ex: c, score };
    })
    .filter(x => x.score > 8)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: LibraryExercise[] = [];
  for (const { ex } of scored) {
    if (seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
    if (out.length >= limit) break;
  }
  return out;
}
