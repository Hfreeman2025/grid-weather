import { mkdir, cp, rm, rename, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseBoundaries, pathData, simplify } from '../src/geometry.ts';
execFileSync(process.execPath, ['scripts/prepare-boundaries.mjs'], { stdio: 'inherit' });
const boundaries = parseBoundaries(JSON.parse(await readFile('public/boundaries.json', 'utf8')));
await writeFile(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0b292f"/><svg x="14" y="2" width="36" height="60" viewBox="0 0 690 1260">${boundaries
    .map(
      (b) =>
        `<path d="${pathData({
          ...b,
          rings: b.rings
            .map((r) => simplify(r, 8))
            .filter((r) => r.length >= 4)
            .map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)])),
        })}" fill="#c4e2bd"/>`,
    )
    .join('')}</svg></svg>`,
);
await rm('.cache/build', { recursive: true, force: true });
await mkdir('.cache/build', { recursive: true });
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '--outDir', '.cache/build/src'],
  { stdio: 'inherit' },
);
await cp('public', '.cache/build', { recursive: true });
// Concatenate in cascade order so modular styles retain a single render-blocking request.
const styles = (await readdir('styles')).filter((name) => name.endsWith('.css')).sort();
await writeFile(
  '.cache/build/style.css',
  (await Promise.all(styles.map((name) => readFile('styles/' + name, 'utf8')))).join('\n'),
);
let page = await readFile('index.html', 'utf8');
let recording = '';
try {
  recording = await readFile('public/wind-recorded.svg', 'utf8');
} catch (e) {
  if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e;
}
page = page.replace('<!-- WIND_RECORDING -->', recording);
const recordedAt = recording.match(/data-at="([^"]+)"/)?.[1];
page = page.replace(
  '<!-- WIND_LABEL -->',
  recordedAt
    ? 'Recorded field ' + recordedAt.replace('T', ' ').replace(':00.000Z', ' UTC')
    : 'Recorded field unavailable',
);
await writeFile('.cache/build/index.html', page);
await rm('.cache/previous-build', { recursive: true, force: true });
try {
  await rename('dist', '.cache/previous-build');
} catch (e) {
  if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e;
}
await rename('.cache/build', 'dist');
await rm('.cache/previous-build', { recursive: true, force: true });
console.log('Static build ready in dist/ (fresh module output, no network)');
