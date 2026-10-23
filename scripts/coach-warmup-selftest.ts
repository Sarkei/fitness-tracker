import assert from 'node:assert/strict';
import { parseCoachWarmupCooldownText } from '../src/lib/coachWarmupCooldown';
import { coachDayToSessionExerciseList } from '../src/lib/coachTemplateMappers';
import { translateExerciseNameToGerman } from '../src/lib/coachExerciseDisplay';
import { buildMobilityPhaseGuidance, isGenericMobilityNotes } from '../src/lib/coachSessionSets';
import { isBodyweightExercise, normalizeSetWeightKg } from '../src/lib/sessionPrescription';
import type { Exercise } from '../src/types';

const parsed = parseCoachWarmupCooldownText(
  '10 Min Mobilisation. + 2 Runden: 10 Liegestütze, 10 Suspended Rows (edb_exr_41n2hdkBpqwoDmVq), 10 Jump Squats (edb_exr_41n2hbLX4XH8XgN7).',
);
assert.equal(parsed.length, 2, 'two edb exercises');
assert.equal(parsed[0].exerciseKey, 'edb_exr_41n2hdkBpqwoDmVq');

const session = coachDayToSessionExerciseList(
  {
    warmup:
      'Mobilisation + 10 Push Ups (edb_exr_abc123def456789012345) und 5 Squats (edb_exr_def456abc789012345678)',
    exercises: [{ name: 'Bench Press', exerciseKey: 'edb_0001', sets: 3, reps: '8' }],
    cooldown: 'Dehnen Brust 30s',
  },
  'de',
);
assert.ok(session[0].sessionPhase === 'warmup', 'first is warmup');
assert.ok(session.some(e => e.sessionPhase === 'main'), 'has main');
assert.ok(session[session.length - 1].sessionPhase === 'cooldown', 'last is cooldown');

assert.equal(translateExerciseNameToGerman('chin-ups'), 'Klimmzüge');

assert.ok(isGenericMobilityNotes('10 Minuten Stretching und Atemübungen'));
const guidance = buildMobilityPhaseGuidance('warmup', [{ name: 'Bankdrücken' } as Exercise], 'de');
assert.ok(guidance.includes('Pull-apart') || guidance.includes('Liegestütz'));

const bw: Exercise = {
  name: 'Side Toe Touching',
  coachPrescription: { weightLabel: 'Körpergewicht', targetReps: 7 },
  sets: 3,
  reps: 7,
};
assert.ok(isBodyweightExercise(bw));
assert.equal(normalizeSetWeightKg(bw, 'Körpergewicht'), 0);

const mobSession = coachDayToSessionExerciseList(
  {
    warmupExercises: [{ name: 'Mobilisation', notes: '10 Minuten Stretching', sets: 1, reps: 10 }],
    exercises: [{ name: 'Bankdrücken', exerciseKey: 'edb_0001', sets: 3, reps: '8', weight: '60 kg' }],
    cooldownExercises: [{ name: 'Cooldown', notes: 'Dehnen', sets: 1, reps: 8 }],
  },
  'de',
);
const mob = mobSession.find(e => e.mobilityTimer);
assert.ok(mob?.notes && mob.notes.length > 40, 'mobility notes enriched');
assert.ok(!mob.notes.includes('10 Minuten Stretching und Atemübungen'), 'generic text replaced');

console.log('coach-warmup-selftest: ok');
