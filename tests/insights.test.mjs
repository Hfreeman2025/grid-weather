import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowComparison } from '../src/insights.ts';
import { HALF_HOUR } from '../src/core.ts';
const mix = {
  biomass: 0,
  coal: 0,
  imports: 0,
  gas: 50,
  nuclear: 0,
  other: 0,
  hydro: 0,
  solar: 0,
  wind: 50,
};
const region = (id, intensity) => ({ id, name: `Region ${id}`, intensity, mix });
const frame = (i, intensity) => ({
  from: i * HALF_HOUR,
  to: (i + 1) * HALF_HOUR,
  regions: [region(1, intensity)],
});
test('window comparison uses current interpolated baseline, not the selected forecast frame', () => {
  const frames = [200, 100, 50, 50, 50, 50].map((n, i) => frame(i, n));
  const result = windowComparison(frames, 1, HALF_HOUR / 2);
  assert.equal(result.baseline, 150);
  assert.equal(result.window.intensity, 50);
  assert.ok(Math.abs(result.percentLower - 66.6666667) < 0.0001);
});
test('zero baseline cannot invent a saving; worse windows have negative reductions', () => {
  assert.equal(
    windowComparison(
      [0, 20, 20, 20, 20].map((n, i) => frame(i, n)),
      1,
      0,
    ).percentLower,
    null,
  );
  assert.equal(
    windowComparison(
      [10, 20, 20, 20, 20].map((n, i) => frame(i, n)),
      1,
      1,
    ).percentLower < 0,
    true,
  );
  assert.equal(
    windowComparison(
      [1, 1, 1].map((n, i) => frame(i, n)),
      1,
      0,
    ),
    null,
  );
});
