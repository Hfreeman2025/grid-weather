import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRegion, features, predictSequence } from '../src/forecaster.ts';
import { fitRidge } from '../src/ridge.ts';
const H = 3600000;
function input() {
  const rows = Array.from({ length: 192 }, (_, i) => ({
    at: i * H,
    id: 1,
    value: 100 + Math.sin((i / 24) * Math.PI * 2) * 20,
    wind: 30,
    weather: [10, 10, 0, 50, 100, 12],
  }));
  return {
    cutoff: 168 * H,
    asOf: 191 * H,
    rows,
    regions: [{ id: 1, name: 'Test' }],
    forecastWeather: Array.from({ length: 48 }, (_, i) => ({
      at: (192 + i) * H,
      id: 1,
      weather: [10, 10, 0, 50, 100, 12],
    })),
    published: rows
      .filter((r) => r.at > 168 * H)
      .map((r) => ({ at: r.at, id: 1, value: r.value + 5 })),
    capturedAt: '2026-11-02T00:00Z',
    baselineIssuedAt: 168 * H,
    backtestWeather: '48-hour persistence',
    target: 'synthetic',
  };
}
test('held-out truth never enters scaling, tuning or predictions; published forecasts remain separate', () => {
  const a = input(),
    before = fitRegion(a, 1);
  for (const row of a.rows) if (row.at > a.cutoff) row.value += 100;
  const after = fitRegion(a, 1);
  assert.deepEqual(
    before.test.map((p) => p.predicted),
    after.test.map((p) => p.predicted),
  );
  assert.equal(before.nesoMAE, 5);
  assert.ok(before.mae < 2);
  assert.ok(after.mae > 90);
  assert.equal(before.testN, 23);
  assert.equal(before.forecast.length, 48);
});
test('recursive forecast uses its own first-day predictions and never future target values', () => {
  const a = input(),
    fit = fitRegion(a, 1),
    future = a.forecastWeather.filter((f) => f.at < 216 * H);
  const first = predictSequence(fit.model, future, a.rows);
  const all = predictSequence(fit.model, a.forecastWeather, a.rows);
  assert.deepEqual(all.slice(0, 24), first);
  assert.ok(all.every((p) => p.value >= 0 && Number.isFinite(p.value)));
  assert.throws(() => features(0, [NaN], 1));
  assert.throws(() => predictSequence(fit.model, [], [], 0));
});
test('constant time series gets an undefined correlation with its true sample count', () => {
  const a = input();
  for (const r of a.rows) {
    r.value = 40;
    r.wind = 10;
  }
  const f = fitRegion(a, 1);
  assert.equal(f.intensity.r, null);
  assert.equal(f.intensity.n, 192);
  assert.equal(f.windShare.r, null);
});
