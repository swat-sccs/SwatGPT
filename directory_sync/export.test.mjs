import test from 'node:test';
import assert from 'node:assert/strict';
import { flag, buildSnapshot, assertOverlayPresent } from './export.mjs';

const student = (uid, dorm = 'Willets') => ({
  USER_ID: uid,
  FIRST_NAME: 'First',
  LAST_NAME: 'Last',
  GRAD_YEAR: 2027,
  DORM: dorm,
  DORM_ROOM: '214',
});

const overlayRow = (uid, showProfile, showDorm) => ({
  uid,
  firstName: null,
  lastName: null,
  showProfile,
  showDorm,
});

test('refuses to export when the overlay returned no rows', () => {
  assert.throws(() => buildSnapshot([student('jdoe1')], []), /refusing to export without privacy/);
});

test('refuses to export when the overlay result is missing', () => {
  assert.throws(() => assertOverlayPresent(undefined), /no rows/);
  assert.throws(() => buildSnapshot([student('jdoe1')], undefined), /no rows/);
});

test('still refuses a housing reload before looking at the overlay', () => {
  assert.throws(
    () => buildSnapshot([student('jdoe1', null)], [overlayRow('jdoe1', 1, 1)]),
    /no dorm assignments/,
  );
});

test('applies opt-outs from the overlay and defaults students without a row to visible', () => {
  const { snapshot, overlaySize } = buildSnapshot(
    [student('JDoe1 '), student('asmith2'), student('bnew3')],
    [overlayRow('jdoe1', 0, 1), overlayRow('ASmith2', 1, 0)],
  );
  assert.equal(overlaySize, 2);
  const byUid = new Map(snapshot.map((row) => [row.uid, row]));
  assert.deepEqual(
    [...byUid.entries()].map(([uid, row]) => [uid, row.showProfile, row.showDorm]),
    [
      ['jdoe1', false, true],
      ['asmith2', true, false],
      ['bnew3', true, true],
    ],
  );
});

test('flag only treats an explicit 1 as visible', () => {
  assert.equal(flag(1), true);
  assert.equal(flag(true), true);
  assert.equal(flag('1'), true);
  assert.equal(flag(Buffer.from([1])), true);
  assert.equal(flag(0), false);
  assert.equal(flag(false), false);
  assert.equal(flag(null), false);
  assert.equal(flag(undefined), false);
  assert.equal(flag('0'), false);
  assert.equal(flag('false'), false);
  assert.equal(flag(Buffer.from([0])), false);
  assert.equal(flag(Buffer.alloc(0)), false);
});
