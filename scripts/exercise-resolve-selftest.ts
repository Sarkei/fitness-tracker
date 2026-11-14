/**
 * Unit-Tests für Exercise-Namensauflösung (ohne API).
 */
import assert from 'node:assert/strict';
import {
  buildExerciseSearchQueries,
  pickBestExerciseNameMatch,
} from '../src/lib/exerciseResolve';
import type { LibraryExercise } from '../src/lib/exerciseLibrary';

function ex(name: string, key: string): LibraryExercise {
  return { key, name, category: 'strength', source: 'exercisedb', exerciseId: key.replace(/^edb_/, '') };
}

const benchList = [
  ex('barbell bench press', 'edb_1'),
  ex('dumbbell bench press', 'edb_2'),
  ex('push-up', 'edb_3'),
];

const qDe = buildExerciseSearchQueries('Bankdrücken');
assert.ok(qDe.some(s => s.toLowerCase().includes('bench press')), `alias missing: ${qDe.join(', ')}`);

const hitDe = pickBestExerciseNameMatch('Bankdrücken', benchList);
assert.equal(hitDe?.name, 'barbell bench press');

const hitEn = pickBestExerciseNameMatch('bench press', benchList);
assert.equal(hitEn?.name, 'barbell bench press');

const miss = pickBestExerciseNameMatch('xyz unknown', benchList);
assert.equal(miss, null);

console.log('exercise-resolve-selftest: ok');
