import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zone, time, shortWhen } from '../src/format.ts';
test('UK clock and timezone labels agree in both winter and summer', () => {
  const winter = Date.UTC(2026, 0, 1, 12),
    summer = Date.UTC(2026, 6, 1, 12);
  assert.equal(time(winter), '12:00');
  assert.equal(zone(winter), 'GMT');
  assert.equal(time(summer), '13:00');
  assert.equal(zone(summer), 'BST');
});
test('repeated local times at the autumn change remain distinguishable in receipts', () => {
  const a = Date.UTC(2026, 9, 25, 0, 30),
    b = a + 3600000;
  assert.match(shortWhen(a), /01:30 BST/);
  assert.match(shortWhen(b), /01:30 GMT/);
});
