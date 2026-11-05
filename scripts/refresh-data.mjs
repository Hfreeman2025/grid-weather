import { writeFile } from 'node:fs/promises';
import { parseResponse } from '../src/core.ts';
import { parseArchive } from '../src/data.ts';
const root = 'https://api.carbonintensity.org.uk';
async function get(path) {
  const r = await fetch(root + path, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const current = await get('/regional');
const anchor = parseResponse(current)[0].from;
const from = new Date(anchor).toISOString().replace(':00.000Z', 'Z');
const [history, forecast] = await Promise.all([
  get(`/regional/intensity/${from}/pt24h`),
  get(`/regional/intensity/${from}/fw48h`),
]);
const archive = {
  current,
  history,
  forecast,
  anchor: new Date(anchor).toISOString(),
  fetchedAt: new Date().toISOString(),
};
const result = parseArchive(archive, 'offline');
await writeFile('public/snapshot.json', JSON.stringify(archive));
console.log(
  `Saved genuine API snapshot: ${result.frames.length} frames, ${new Date(anchor).toISOString()}`,
);
