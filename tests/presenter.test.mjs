import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTour } from '../src/presenter.ts';
import { parseArchive } from '../src/data.ts';
import { HALF_HOUR } from '../src/core.ts';
const data = parseArchive(JSON.parse(readFileSync(new URL('../public/snapshot.json', import.meta.url))), 'offline');
const mix = { biomass: 0, coal: 0, imports: 0, gas: 50, nuclear: 0, other: 0, hydro: 0, solar: 0, wind: 50 };
const origin = Date.parse('2026-11-01T16:00Z');
const f = (i, n, wind = 50) => ({ from: origin + i * HALF_HOUR, to: origin + (i + 1) * HALF_HOUR, regions: [{ id: 1, name: 'North Scotland', intensity: n, mix: { ...mix, wind, gas: 100 - wind } }] });
function synthetic() {
 return Array.from({ length: 97 }, (_, i) => {
  const frame = f(i, 300 - i, 10 + i / 2);
  frame.regions.push({ id: 2, name: 'South Scotland', intensity: 20 + i, mix: { ...mix, solar: i < 24 ? 0 : 20, gas: i < 24 ? 80 : 60, wind: 20 } });
  frame.gb = { id: 18, name: 'GB', intensity: i < 12 ? 220 : i < 30 ? 180 : 80, mix: { ...mix } };
  return frame;
 });
}
test('tour opens with a temporal story and reaches the end of the available 48-hour forecast', () => {
 const tour = buildTour(data.frames, data.anchor + 1);
 assert.ok(tour.length >= 8 && tour.length <= 14);
 assert.ok(tour.every((s, i) => s.at > data.anchor + 1 && (!i || s.at >= tour[i - 1].at)));
 assert.equal(tour.at(-1).at, data.frames.at(-1).from);
 assert.ok(tour.every(s => !/A range|across 14 regions/.test(s.caption)));
});
test('every raw receipt matches its source; named regions are highlighted; means have four contiguous inputs', () => {
 const tour = buildTour(data.frames, data.anchor);
 assert.ok(tour.some(s => s.kind === 'window'));
 for (const s of tour) {
  assert.ok(!/spreads|flows|because|causes|sweeps/i.test(s.caption));
  const raw = s.evidence.filter(e => e.field !== 'mean');
  for (const e of raw) {
   const frame = data.frames.find(f => f.from === e.at);
   const region = e.region === 18 ? frame?.gb : frame?.regions.find(r => r.id === e.region);
   assert.ok(region);
   assert.equal(e.value, e.field === 'intensity' ? region.intensity : region.mix[e.field]);
   if (e.region <= 14) assert.ok(s.highlights.includes(e.region));
  }
  const mean = s.evidence.find(e => e.field === 'mean');
  if (mean) {
   assert.equal(raw.length, 4);
   assert.ok(raw.every((e, i) => e.at === raw[0].at + i * HALF_HOUR));
   assert.equal(mean.value, raw.reduce((a, e) => a + e.value, 0) / 4);
  }
 }
});
test('improvers and worseners compare with now, never the previous tour stop', () => {
 const frames = synthetic(), tour = buildTour(frames, origin);
 const fall = tour.find(s => s.kind === 'change' && s.caption.includes('improves most'));
 const rise = tour.find(s => s.kind === 'change' && s.caption.includes('worsens most'));
 assert.ok(fall); assert.ok(rise);
 assert.equal(fall.region, 1); assert.equal(rise.region, 2);
 assert.equal(fall.evidence[0].at, origin); assert.equal(fall.evidence[0].value, 300);
 assert.equal(rise.evidence[0].at, origin); assert.equal(rise.evidence[0].value, 20);
 assert.ok(tour.filter(s => s.kind === 'change').every(s => s.evidence[0].at === origin && s.evidence[1].at === s.at));
});
test('GB crossing uses the actual aggregate, not an average of regional intensities', () => {
 const tour = buildTour(synthetic(), origin), crossing = tour.find(s => s.kind === 'band');
 assert.ok(crossing); assert.equal(crossing.at, origin + 12 * HALF_HOUR);
 assert.match(crossing.caption, /GB.*below 200/);
 assert.deepEqual(crossing.evidence.map(e => [e.region, e.value]), [[18, 220], [18, 180]]);
 const withoutGB = synthetic().map(({ gb, ...f }) => f);
 assert.equal(buildTour(withoutGB, origin).some(s => s.kind === 'band'), false);
});
test('cleanest overnight window excludes daytime minima and never bridges missing intervals', () => {
 const frames = synthetic();
 for (const frame of frames) {
  const hour = new Date(frame.from).getUTCHours();
  frame.gb.intensity = hour >= 10 && hour < 14 ? 0 : hour >= 2 && hour < 4 ? 20 : 100;
 }
 const stop = buildTour(frames, origin).find(s => s.kind === 'window');
 assert.ok(stop); assert.match(stop.caption, /overnight/);
 assert.equal(new Date(stop.at).getUTCHours(), 2); assert.equal(stop.evidence.at(-1).value, 20);
 const sparse = frames.filter((_, i) => i % 2 === 0);
 assert.equal(buildTour(sparse, origin).some(s => s.kind === 'window'), false);
});
test('wind, solar and gas stories state observed shares with both source intervals', () => {
 const tour = buildTour(synthetic(), origin);
 for (const fuel of ['wind', 'solar', 'gas']) {
  const stop = tour.find(s => s.kind === fuel); assert.ok(stop, fuel);
  assert.match(stop.caption, new RegExp(`${fuel} share.*percentage points`));
  assert.equal(stop.evidence[0].at, origin); assert.equal(stop.evidence[1].at, stop.at);
  assert.ok(stop.evidence.every(e => e.field === fuel && e.unit === '%'));
 }
});
test('empty, sparse and unchanged series never invent a change, band crossing or complete window', () => {
 assert.deepEqual(buildTour([], origin), []);
 assert.deepEqual(buildTour([f(0, 0)], origin + HALF_HOUR), []);
 const sparse = [f(0, 0), f(2, 40), f(4, 30), f(6, 20)];
 assert.equal(buildTour(sparse, origin).some(s => s.kind === 'window'), false);
 const flat = buildTour(Array.from({ length: 97 }, (_, i) => f(i, 0)), origin);
 assert.ok(flat.every(s => !/improves|worsens|below|NaN|Infinity/.test(s.caption)));
});
