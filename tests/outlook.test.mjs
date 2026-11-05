import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linePath } from '../src/outlook.ts';
const frame = (from, to, n) => ({ from, to, regions: [{ id: 1, intensity: n }] });
test('sparkline uses a shared scale, aligned endpoints, and separate moves across missing intervals', () => {
  const p = linePath([frame(0, 1, 0), frame(1, 2, 200), frame(3, 4, 400)], 1, 0, 4, 400, 100, 48);
  assert.equal(p, 'M0.00,45.00 L25.00,24.50 M75.00,4.00 L100.00,4.00');
});
test('an absent region or empty forecast produces no invented line', () => {
  assert.equal(linePath([], 1, 0, 1, 400), '');
  assert.equal(linePath([frame(0, 1, 40)], 2, 0, 1, 400), '');
});
test('the outlook includes the full last known half-hour, so a final two-hour band is not clipped', () => {
  const p = linePath([frame(0, 1, 100), frame(1, 2, 200)], 1, 0, 2, 400, 100, 48);
  assert.equal(p, 'M0.00,34.75 L50.00,24.50 L100.00,24.50');
});
