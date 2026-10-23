/**
 * Coach-Session: Aufwärm-Sätze, Mobility-Timer, Notes bereinigen.
 */

import type { Exercise, SetDetail } from '@/src/types';
import { isDistanceCardioExercise } from '@/src/lib/gpsCardio';
import { parseCoachReps } from '@/src/lib/coachTemplateMappers';
import { isBlockMetaExercise, normalizeSetType } from '@/src/lib/workoutSessionUtils';
import { isBodyweightDefault } from '@/src/lib/sessionPrescription';

const MINUTES_IN_TEXT = /(\d{1,2})\s*(?:min(?:ute)?n?|m\b)/i;

const GENERIC_MOBILITY_RE =
  /^(?:\d+\s*(?:min(?:ute)?n?|m\b)[\s.:,-]*)?(?:mobilis|stretch|dehnen|auf(?:wärmen|waerm)|cool[\s-]?down|foam|atmen)/i;

export function isGenericMobilityNotes(notes?: string): boolean {
  if (!notes?.trim()) return true;
  const t = notes.trim();
  if (t.length < 18) return true;
  if (GENERIC_MOBILITY_RE.test(t) && t.length < 160) return true;
  const parts = t.split(/[·\n]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every(p => p === parts[0])) return true;
  return false;
}

function dedupeNoteSegments(notes: string): string {
  const parts = notes.split(/[·\n]+/).map(p => p.trim()).filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

function collectMovementHints(main: Exercise[]): {
  push: boolean;
  pull: boolean;
  squat: boolean;
  hinge: boolean;
  shoulder: boolean;
} {
  const hay = main.map(e => `${e.name} ${e.exerciseKey || ''}`).join(' ').toLowerCase();
  return {
    push: /push|drück|press|brust|bench|liegestütz|pushup|push-up/i.test(hay),
    pull: /pull|row|rudern|klimmzug|lat|chin/i.test(hay),
    squat: /squat|kniebeug|lunge|ausfallschritt|beinpress|leg press/i.test(hay),
    hinge: /deadlift|kreuzheb|rdl|hinge/i.test(hay),
    shoulder: /shoulder|schulter|overhead|military/i.test(hay),
  };
}

/** Konkrete Übungsliste für Timer-Aufwärmen/Abkühlen (Live-Session). */
export function buildMobilityPhaseGuidance(
  phase: 'warmup' | 'cooldown',
  mainExercises: Exercise[],
  locale: 'de' | 'en' = 'de',
): string {
  const h = collectMovementHints(mainExercises);
  const de = locale === 'de';
  const items: string[] = [];

  if (phase === 'warmup') {
    items.push(
      de
        ? '2–3 Min leichtes Cardio (Laufen, Rad, Seil)'
        : '2–3 min light cardio (run, bike, jump rope)',
    );
    items.push(de ? '10 Armkreise, 10 Hüftkreisen' : '10 arm circles, 10 hip circles');
    if (h.push) {
      items.push(de ? '15 Band Pull-aparts, 10 leichte Liegestütze' : '15 band pull-aparts, 10 easy push-ups');
    }
    if (h.pull) {
      items.push(de ? '10 Cat-Camel, 10 leichte Rudern' : '10 cat-camel, 10 light rows');
    }
    if (h.squat || h.hinge) {
      items.push(de ? '10 Kniebeugen, 10 Ausfallschritte' : '10 bodyweight squats, 10 lunges');
    }
    if (h.shoulder) {
      items.push(de ? '15 Schulterkreisen, Wand-Slides' : '15 shoulder circles, wall slides');
    }
    if (items.length < 4) {
      items.push(de ? '10 Kniebeugen, 10 Mountain Climbers' : '10 squats, 10 mountain climbers');
    }
  } else {
    items.push(de ? '4–4–4 Atmung (ein / halten / aus)' : '4-4-4 breathing (in / hold / out)');
    if (h.push) items.push(de ? 'Brustdehnung Wand 30s/Seite' : 'Doorway chest stretch 30s/side');
    if (h.pull || h.hinge) {
      items.push(de ? 'Lat-Dehnung, leichte Vorbeuge 30s' : 'Lat stretch, light forward fold 30s');
    }
    if (h.squat) items.push(de ? 'Quad- & Gesäßdehnung 30s/Seite' : 'Quad & glute stretch 30s/side');
    items.push(de ? 'Nacken & Schultern locker rollen' : 'Gentle neck & shoulder rolls');
  }

  return items.slice(0, 6).join(' · ');
}

export function enrichMobilityExerciseNotes(
  ex: Exercise,
  mainExercises: Exercise[],
  locale: 'de' | 'en' = 'de',
): Exercise {
  if (!shouldUseMobilityTimer(ex)) return ex;
  const phase: 'warmup' | 'cooldown' = ex.sessionPhase === 'cooldown' ? 'cooldown' : 'warmup';
  const minutes =
    parseMobilityMinutesFromText(ex.notes) ??
    parseMobilityMinutesFromText(ex.name) ??
    (ex.durationSec != null && ex.durationSec > 0 ? Math.round(ex.durationSec / 60) : null) ??
    10;

  if (ex.notes?.trim() && !isGenericMobilityNotes(ex.notes)) {
    return { ...ex, notes: dedupeNoteSegments(ex.notes) };
  }

  const guidance = buildMobilityPhaseGuidance(phase, mainExercises, locale);
  const prefix = locale === 'de' ? `${minutes} Min:` : `${minutes} min:`;
  return { ...ex, notes: `${prefix} ${guidance}` };
}

export function parseMobilityMinutesFromText(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(MINUTES_IN_TEXT);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 45 ? n : null;
}

/** Generische Mobilisation / reiner Text → Countdown statt „1 Satz“. */
export function shouldUseMobilityTimer(ex: Exercise): boolean {
  if (ex.sessionPhase !== 'warmup' && ex.sessionPhase !== 'cooldown') return false;
  if (isBlockMetaExercise(ex)) return false;
  if (ex.mobilityTimer) return true;

  const notes = ex.notes ?? '';
  const name = (ex.name || '').toLowerCase();

  /** Echtes Cardio-Aufwärmen (z. B. lockeres Laufen) behält Distanz-UI. */
  if (ex.exerciseCategory === 'cardio' && isDistanceCardioExercise(ex)) return false;

  if (parseMobilityMinutesFromText(notes) != null) return true;
  if (/\bmobilis|dynamic stretch|dehnen|stretching|foam roll|faszien\b/i.test(name)) return true;
  if (/mobilis|dehnen|stretch/i.test(notes) && !ex.exerciseKey) return true;

  const setCount = typeof ex.sets === 'number' ? ex.sets : Array.isArray(ex.sets) ? ex.sets.length : 0;
  const reps = ex.reps ?? 0;
  if (setCount <= 1 && reps <= 1 && !ex.exerciseKey) return true;

  return false;
}

export function configureMobilityTimerExercise(ex: Exercise, mainExercises: Exercise[] = []): Exercise {
  const minutes =
    parseMobilityMinutesFromText(ex.notes) ??
    (ex.durationSec != null && ex.durationSec > 0 ? Math.round(ex.durationSec / 60) : null) ??
    10;
  const sec = Math.max(60, minutes * 60);
  const withNotes = enrichMobilityExerciseNotes(ex, mainExercises);
  return {
    ...withNotes,
    mobilityTimer: true,
    durationSec: sec,
    sets: [{ reps: minutes, weight: 0, completed: false, type: ex.sessionPhase === 'cooldown' ? 'normal' : 'warmup' }],
    reps: minutes,
  };
}

/** Entfernt Coach-Texte, die offensichtlich zur falschen Übung gehören. */
export function scrubMisalignedExerciseNotes(ex: Exercise): Exercise {
  if (!ex.notes?.trim()) return ex;

  const name = (ex.name || '').toLowerCase();
  const note = ex.notes.toLowerCase();

  const rules: { note: RegExp; name: RegExp }[] = [
    { note: /kniebeug|tiefe squat|deep squat|squat/i, name: /squat|kniebeug|beinpress|leg press|lunge|ausfallschritt/i },
    { note: /bankdrück|bench press|drücken.*brust/i, name: /bankdrück|bench|press|chest|brust|liegestütz|push.?up|pushup/i },
    { note: /kreuzheb|deadlift|rdl/i, name: /deadlift|kreuzheb|rdl|hinge/i },
    { note: /liegestütz|push.?up|pushup/i, name: /liegestütz|push|press|brust|bench/i },
    { note: /klimmzug|pull.?up|latzug/i, name: /pull|klimmzug|lat|row|rudern/i },
  ];

  for (const r of rules) {
    if (r.note.test(note) && !r.name.test(name)) {
      const parts = ex.notes.split('·').map(p => p.trim()).filter(p => !r.note.test(p.toLowerCase()));
      const cleaned = parts.join(' · ').trim();
      return { ...ex, notes: cleaned || undefined };
    }
  }

  return ex;
}

function workSetCount(ex: Exercise): number {
  if (typeof ex.sets === 'number') return Math.max(1, ex.sets);
  if (Array.isArray(ex.sets)) {
    const work = (ex.sets as SetDetail[]).filter(s => s.type === 'normal' || !s.type);
    return Math.max(1, work.length || ex.sets.length);
  }
  return ex.coachPrescription?.targetSets ?? 3;
}

function hasStructuredSetTypes(ex: Exercise): boolean {
  if (!Array.isArray(ex.sets) || ex.sets.length === 0) return false;
  const first = ex.sets[0];
  if (!first || typeof first !== 'object' || !('reps' in first)) return false;
  const types = new Set((ex.sets as SetDetail[]).map(s => s.type || 'normal'));
  if (types.size > 1) return true;
  if (types.has('dropset') || types.has('failure') || types.has('warmup')) return true;
  return false;
}

/**
 * Kraft-Hauptübungen: Warmups vor Arbeitssätzen, wenn noch keine strukturierten Satztypen
 * vom Coach/Template kommen. Dropset/Failure am letzten Arbeitssatz wenn exercise.setType gesetzt.
 */
export function expandStrengthExerciseWithWarmupSets(ex: Exercise): Exercise {
  if (ex.sessionPhase !== 'main') return ex;
  if (ex.exerciseCategory === 'cardio') return ex;
  if (isBlockMetaExercise(ex)) return ex;
  if (ex.mobilityTimer) return ex;
  if (isBodyweightDefault(ex)) return ex;

  // Coach/Template hat bereits gemischte oder spezielle Satztypen → nicht überschreiben
  if (hasStructuredSetTypes(ex)) return ex;

  const coach = ex.coachPrescription;
  const workWeight = coach?.targetWeightKg ?? (typeof ex.weight === 'number' ? ex.weight : 0);
  const workReps = coach?.targetReps ?? ex.reps ?? 10;
  const workSets = workSetCount(ex);
  const workType = normalizeSetType(ex.setType);

  if (workWeight < 15 && workType === 'normal') return ex;

  const warmupSets: SetDetail[] = [];
  if (workWeight >= 15) {
    warmupSets.push({
      reps: Math.min(workReps, 12),
      weight: Math.round(workWeight * 0.4),
      completed: false,
      type: 'warmup',
    });
    if (workWeight >= 40) {
      warmupSets.push({
        reps: Math.min(Math.max(5, workReps - 2), workReps),
        weight: Math.round(workWeight * 0.6),
        completed: false,
        type: 'warmup',
      });
    }
  }

  const work: SetDetail[] = Array.from({ length: workSets }, (_, i) => {
    const isLast = i === workSets - 1;
    let type: SetDetail['type'] = 'normal';
    if (workType === 'dropset' || workType === 'failure') {
      type = isLast ? workType : 'normal';
    } else if (workType === 'warmup') {
      type = 'warmup';
    }
    return {
      reps: type === 'dropset' ? Math.max(4, workReps - 2) : workReps,
      weight:
        type === 'dropset' && workWeight > 0
          ? Math.round(workWeight * 0.75 * 2) / 2
          : workWeight,
      completed: false,
      type,
      ...(coach?.targetRpe != null ? { rpe: coach.targetRpe } : {}),
    };
  });

  return { ...ex, sets: [...warmupSets, ...work] };
}

/** Warmup-Zeilen mit echten Wiederholungen statt 1 Dummy-Satz. */
export function normalizeCoachPhaseRow(row: Record<string, unknown>, phase: 'warmup' | 'cooldown'): Record<string, unknown> {
  const name = String(row.name || '').trim();
  const notes = typeof row.notes === 'string' ? row.notes : '';
  const minutes = parseMobilityMinutesFromText(notes);

  if (minutes != null && !row.exerciseKey) {
    return { ...row, sets: 1, reps: minutes, notes };
  }

  const reps = parseCoachReps(row.reps, 10);
  const sets = typeof row.sets === 'number' ? row.sets : 1;
  if (sets <= 1 && reps <= 1 && notes.length > 20 && /mobilis|dehnen|stretch|aufwärm/i.test(`${name} ${notes}`)) {
    const m = parseMobilityMinutesFromText(notes) ?? 10;
    return { ...row, sets: 1, reps: m, notes };
  }

  if (phase === 'warmup' && reps >= 3 && sets >= 1) {
    return { ...row, setType: row.setType || 'warmup' };
  }

  return row;
}

export function finalizeExerciseForLiveSession(ex: Exercise, mainExercises: Exercise[] = []): Exercise {
  let out = scrubMisalignedExerciseNotes(ex);

  if (shouldUseMobilityTimer(out)) {
    out = configureMobilityTimerExercise(out, mainExercises);
    return out;
  }

  if (out.sessionPhase === 'main' && out.exerciseCategory !== 'cardio') {
    out = expandStrengthExerciseWithWarmupSets(out);
  }

  return out;
}
