/**
 * Selftest: Körpergewicht vs. gewichtete Übungen (Kreuzheben, Liegestütze).
 */
import assert from 'node:assert/strict';
import {
  isBodyweightByNameOrEquipment,
  isClearlyWeightedStrengthExercise,
} from '../src/lib/exerciseLibrarySwap';
import {
  isBodyweightDefault,
  isBodyweightExercise,
  hasLoggedWeightOnExercise,
} from '../src/lib/sessionPrescription';
import type { Exercise } from '../src/types';

assert.equal(isClearlyWeightedStrengthExercise('Kreuzheben'), true);
assert.equal(isBodyweightByNameOrEquipment('Kreuzheben', undefined), false);
assert.equal(isBodyweightByNameOrEquipment('Liegestütze', undefined), true);

const bwEx: Exercise = {
  name: 'Liegestütze',
  sets: [{ type: 'normal', reps: 10, weight: 0, completed: false }],
};
assert.equal(isBodyweightDefault(bwEx), true);
assert.equal(isBodyweightExercise(bwEx), true);

const weightedOverride: Exercise = {
  name: 'Liegestütze',
  sets: [{ type: 'normal', reps: 8, weight: 10, completed: false }],
};
assert.equal(hasLoggedWeightOnExercise(weightedOverride), true);
assert.equal(isBodyweightExercise(weightedOverride), false);

console.log('bodyweight-classify-selftest: ok');
