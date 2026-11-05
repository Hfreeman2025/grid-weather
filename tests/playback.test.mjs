import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceTime } from '../src/playback.ts';
test('elapsed time drives a 36-second cycle, even when frames take several seconds', () => {
  assert.equal(advanceTime(0, 18000, 0, 72), 36);
  assert.equal(advanceTime(0, 36000, 0, 72), 0);
  let fast = 0,
    slow = 0;
  for (let i = 0; i < 180; i++) fast = advanceTime(fast, 100, 0, 72);
  for (let i = 0; i < 6; i++) slow = advanceTime(slow, 3000, 0, 72);
  assert.ok(Math.abs(fast - 36) < 1e-9);
  assert.ok(Math.abs(slow - 36) < 1e-9);
});
test('speed, wraparound and zero elapsed time keep the same temporal contract', () => {
  assert.equal(advanceTime(24, 18000, 0, 72), 60);
  assert.equal(advanceTime(60, 12000, 0, 72), 12);
  assert.equal(advanceTime(0, 9000, 0, 72, 2), 36);
  assert.equal(advanceTime(0, 36000, 0, 72, 0.5), 36);
  assert.equal(advanceTime(24, 0, 0, 72), 24);
});
test('invalid playback bounds, speeds and elapsed time fail explicitly', () => {
  for (const args of [
    [0, -1, 0, 72],
    [0, 1, 0, 0],
    [0, 1, 72, 0],
    [0, 1, 0, 72, 0],
    [0, 1, 0, 72, NaN],
  ])
    assert.throws(() => advanceTime(...args));
});
