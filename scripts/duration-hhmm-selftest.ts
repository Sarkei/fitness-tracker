import assert from 'node:assert/strict';
import { normalizeHhMmInput, formatHhMmFromDigits } from '../src/lib/durationHhMmInput.ts';

assert.equal(normalizeHhMmInput(''), '');
assert.equal(normalizeHhMmInput('0'), '0');
assert.equal(normalizeHhMmInput('01'), '01');
assert.equal(normalizeHhMmInput('013'), '01:3');
assert.equal(normalizeHhMmInput('0130'), '01:30');
assert.equal(normalizeHhMmInput('01:30'), '01:30');
assert.equal(normalizeHhMmInput('01:3045'), '01:30');
assert.equal(formatHhMmFromDigits('12345'), '12:34');

console.log('duration-hhmm-selftest: ok');
