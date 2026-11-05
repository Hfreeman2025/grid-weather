import { readFile, writeFile } from 'node:fs/promises';
import { prepareBoundaries } from '../src/geometry.ts';
export const url =
  'https://api.neso.energy/dataset/0e377f16-95e9-4c15-a1fc-49e06a39cfa0/resource/1c6a7dc0-1b6c-443a-bc67-5f7125649434/download/gb-dno-license-areas-20240503-as-geojson.geojson';
if (process.argv.includes('--fetch')) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Boundary HTTP ${r.status}`);
  const body = await r.text();
  prepareBoundaries(JSON.parse(body));
  await writeFile('data/boundaries-source.geojson', body);
}
const result = prepareBoundaries(
  JSON.parse(await readFile('data/boundaries-source.geojson', 'utf8')),
);
await writeFile('public/boundaries.json', JSON.stringify(result.boundaries));
await writeFile(
  'data/geometry-report.json',
  JSON.stringify(
    { source: url, toleranceMetres: 650, before: result.before, after: result.after },
    null,
    2,
  ),
);
console.log(`Boundaries: ${result.before} → ${result.after} vertices, 14 regions`);
