/**
 * Aufwärmen/Abkühlen: strukturierte Übungslisten + Legacy-Text mit (edb_…)-Keys parsen.
 */

import { isExerciseDbCatalogKey } from './exerciseDb';

const EDB_IN_PARENS =
  /(\d+)\s*([^,(]+?)\s*\(\s*(edb_(?:exr_)?[a-zA-Z0-9_]+)\s*\)/gi;

function normalizeExerciseKey(raw: string): string {
  const k = raw.trim();
  if (!k) return '';
  if (isExerciseDbCatalogKey(k)) return k;
  if (/^edb_exr_/i.test(k)) return k;
  if (/^edb_/i.test(k)) return k;
  return k;
}

/** Legacy-Text „10 Liegestütze (edb_exr_…)“ → strukturierte Zeilen. */
export function parseCoachWarmupCooldownText(text: string): Record<string, unknown>[] {
  const src = String(text || '').trim();
  if (!src) return [];

  const rows: Record<string, unknown>[] = [];
  let firstMatchIdx = src.length;

  let m: RegExpExecArray | null;
  const re = new RegExp(EDB_IN_PARENS.source, 'gi');
  while ((m = re.exec(src)) !== null) {
    firstMatchIdx = Math.min(firstMatchIdx, m.index);
    const reps = parseInt(m[1], 10) || 10;
    const name = m[2].trim().replace(/^[,+\s]+|[,+\s]+$/g, '');
    const exerciseKey = normalizeExerciseKey(m[3]);
    rows.push({
      name: name || 'Übung',
      exerciseKey: exerciseKey || undefined,
      sets: 1,
      reps,
      setType: 'warmup',
    });
  }

  const preamble = src.slice(0, firstMatchIdx).trim().replace(/^[+,.\s]+|[+,.\s]+$/g, '');
  if (preamble.length >= 8) {
    const minFromText = preamble.match(/(\d{1,2})\s*(?:min(?:ute)?n?|m\b)/i);
    const minutes = minFromText ? Math.min(45, Math.max(1, parseInt(minFromText[1], 10))) : null;
    if (rows.length === 0) {
      rows.push({
        name: 'Mobilisation',
        notes: preamble,
        sets: 1,
        reps: minutes ?? 10,
        setType: 'warmup',
      });
    } else {
      const prev = rows[0].notes;
      rows[0] = {
        ...rows[0],
        notes: [preamble, typeof prev === 'string' ? prev : ''].filter(Boolean).join(' · '),
      };
    }
  }

  return rows;
}

export function resolveCoachPhaseExerciseRows(
  day: Record<string, unknown>,
  phase: 'warmup' | 'cooldown',
): Record<string, unknown>[] {
  const arrayKey = phase === 'warmup' ? 'warmupExercises' : 'cooldownExercises';
  const rawArr = day[arrayKey];
  if (Array.isArray(rawArr) && rawArr.length > 0) {
    return rawArr
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map(row => ({
        ...row,
        setType: row.setType || (phase === 'warmup' ? 'warmup' : 'normal'),
      }));
  }

  const legacyKey = phase === 'warmup' ? 'warmup' : 'cooldown';
  const legacy = typeof day[legacyKey] === 'string' ? day[legacyKey] : '';
  return parseCoachWarmupCooldownText(legacy);
}
