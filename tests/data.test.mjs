import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArchive, loadData } from '../src/data.ts';
import { timestamp } from '../src/core.ts';
const archive = JSON.parse(readFileSync(new URL('../public/snapshot.json', import.meta.url)));
test('genuine archive aligns all 145 half-hours and retains 14 regions', () => {
  const d = parseArchive(archive, 'offline', 'Test outage');
  assert.equal(d.frames.length, 145);
  assert.equal(d.mode, 'offline');
  assert.equal(d.issue, 'Test outage');
  assert.equal(d.frames[0].regions.length, 14);
});
test('archive rejects missing half-hours, shortened forecasts and invalid calendar dates', () => {
  const a = structuredClone(archive);
  a.forecast.data.splice(10, 1);
  assert.throws(() => parseArchive(a, 'offline'), /Missing half-hour/);
  const b = structuredClone(archive);
  b.forecast.data = b.forecast.data.slice(0, 20);
  assert.throws(() => parseArchive(b, 'offline'), /Incomplete/);
  assert.throws(() => timestamp('2026-02-30T11:00Z'));
  assert.throws(() => timestamp('2026-11-01T25:00Z'));
});
test('API failure returns explicitly offline bundled data, never live success', async () => {
  const originalFetch = globalThis.fetch,
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let calls = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error('not expected');
      },
    },
  });
  globalThis.fetch = async (url) => {
    calls++;
    if (String(url).includes('api.carbonintensity')) throw new Error('Simulated network outage');
    return new Response(JSON.stringify(archive));
  };
  try {
    const d = await loadData();
    assert.equal(d.mode, 'offline');
    assert.match(d.issue, /Simulated network outage/);
    assert.equal(d.anchor, Date.parse(archive.anchor));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});
test('malformed live data is rejected before explicit offline fallback', async () => {
  const originalFetch = globalThis.fetch,
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error('not expected');
      },
    },
  });
  globalThis.fetch = async (url) =>
    new Response(
      JSON.stringify(String(url).includes('api.carbonintensity') ? { data: [] } : archive),
    );
  try {
    const d = await loadData(true);
    assert.equal(d.mode, 'offline');
    assert.match(d.issue, /No data/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});
test('archive retains the validated GB aggregate separately from the 14 map regions', () => {
  const d = parseArchive(archive, 'offline');
  const raw = archive.current.data[0].regions.find((r) => r.regionid === 18);
  const f = d.frames.find((f) => f.from === Date.parse(archive.current.data[0].from));
  assert.ok(f.gb);
  assert.equal(f.gb.id, 18);
  assert.equal(f.gb.intensity, raw.intensity.forecast);
  assert.equal(f.gb.mix.gas, raw.generationmix.find((f) => f.fuel === 'gas').perc);
  assert.equal(f.regions.length, 14);
});
