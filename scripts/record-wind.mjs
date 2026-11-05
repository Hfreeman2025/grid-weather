import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseWeather, weatherAt, sampleWeather } from '../src/weather.ts';
import { midpoint } from '../src/advection.ts';
const raw = JSON.parse(await readFile('public/weather.json', 'utf8')),
  grid = parseWeather(raw),
  carbon = JSON.parse(await readFile('public/snapshot.json', 'utf8')),
  at = Math.ceil(Date.parse(carbon.fetchedAt) / 3600000) * 3600000,
  field = weatherAt(grid, at);
if (!field) throw new Error('No real wind field for recording');
let seed = 113;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const traces = [];
const began = performance.now();
for (let i = 0; i < 480; i++) {
  let p = [
    grid.x0 + random() * (grid.nx - 1) * grid.step,
    grid.y0 + random() * (grid.ny - 1) * grid.step,
  ];
  const positions = [p];
  for (let step = 0; step < 24; step++) {
    const next = midpoint(p, 300, (x, y) => {
      const w = sampleWeather(grid, field, x, y);
      return w ? [w[1], w[2]] : null;
    });
    if (!next) break;
    p = next;
    positions.push(p);
  }
  if (positions.length < 3) continue;
  const start = positions[0],
    w = sampleWeather(grid, field, ...start),
    speed = w?.[0] ?? 0,
    color = speed > 18 ? '#f1c077' : speed > 10 ? '#c9e5df' : '#6ca7b5',
    points = positions.map((p) => [p[0] + 10, 1240 - p[1]]);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    dur = (((points.length - 1) * 300) / 1200).toFixed(2),
    begin = (-random() * Number(dur)).toFixed(2);
  traces.push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width=".7" opacity=".24"/>${i < 192 ? `<circle r="1.3" fill="${color}"><animate attributeName="cx" values="${points.map((p) => p[0].toFixed(1)).join(';')}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="cy" values="${points.map((p) => p[1].toFixed(1)).join(';')}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>` : ''}`,
  );
}
const fragment = `<g data-source="Recorded CPU midpoint integration of real ECMWF forecast" data-at="${new Date(at).toISOString()}" data-traces="${traces.length}">${traces.join('')}</g>`;
await writeFile('public/wind-recorded.svg', fragment);
await writeFile(
  'data/wind-recording.json',
  JSON.stringify(
    {
      computedAt: new Date().toISOString(),
      sourceCapturedAt: raw.capturedAt,
      fieldAt: new Date(at).toISOString(),
      traces: traces.length,
      animatedTracers: (fragment.match(/<circle/g) || []).length,
      method:
        'CPU explicit midpoint reference, 300-second steps in one fixed forecast field; recorded playback at 1200×. Live GPU uses the same method.',
      milliseconds: performance.now() - began,
      sourceSHA256: createHash('sha256')
        .update(await readFile('src/advection.ts'))
        .digest('hex'),
    },
    null,
    2,
  ),
);
console.log('Recorded real wind:', traces.length, 'paths;', Buffer.byteLength(fragment), 'bytes');
