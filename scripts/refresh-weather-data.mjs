import { readFile, writeFile, mkdir, copyFile, statfs, stat } from 'node:fs/promises';
import { parseResponse, alignFrames, record, array, finite, timestamp } from '../src/core.ts';
import { parseArchive } from '../src/data.ts';
import { parseBoundaries } from '../src/geometry.ts';
import { bngToWgs84 } from '../src/projection.ts';
import { components, parseWeather } from '../src/weather.ts';
import { areaWeather } from '../src/area-weather.ts';
const disk = await statfs('/');
if (disk.bavail * disk.bsize < 11 * 1024 ** 3)
  throw new Error('Stop: insufficient disk headroom above 10 GiB');
await mkdir('.cache/v3-data', { recursive: true });
const manifest = {
  capturedAt: new Date().toISOString(),
  requests: [],
  weatherModel: 'ecmwf_ifs025',
  height: 100,
  weatherGridKm: 100,
  quadratureKm: 10,
};
async function get(url, key) {
  try {
    const body = await readFile(`.cache/v3-data/${key}.json`, 'utf8'),
      info = await stat(`.cache/v3-data/${key}.json`);
    if (
      (['current', 'history', 'forecast', 'national'].includes(key) &&
        Date.now() - info.mtimeMs > 5 * 60000) ||
      (key.startsWith('weather-') && Date.now() - info.mtimeMs > 30 * 60000)
    )
      throw Object.assign(new Error('Refresh stale source'), { code: 'ENOENT' });
    manifest.requests.push({
      url,
      bytes: Buffer.byteLength(body),
      capturedAt: info.mtime.toISOString(),
      cached: true,
    });
    return JSON.parse(body);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`${r.status}: ${url.split('?')[0]}`);
  const body = await r.text();
  const result = JSON.parse(body);
  manifest.requests.push({
    url,
    bytes: Buffer.byteLength(body),
    capturedAt: new Date().toISOString(),
  });
  await writeFile(`.cache/v3-data/${key}.json`, body);
  console.log(key, Buffer.byteLength(body), 'bytes');
  return result;
}
try {
  await readFile('public/backtest-neso.json');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  await copyFile('public/snapshot.json', 'public/backtest-neso.json');
}
const baseline = parseArchive(
  JSON.parse(await readFile('public/backtest-neso.json', 'utf8')),
  'offline',
);
const current = await get('https://api.carbonintensity.org.uk/regional', 'current'),
  anchor = parseResponse(current)[0].from;
const iso = (n) => new Date(n).toISOString().replace(':00.000Z', 'Z');
const history = await get(
  `https://api.carbonintensity.org.uk/regional/intensity/${iso(anchor)}/pt24h`,
  'history',
);
const forecast = await get(
  `https://api.carbonintensity.org.uk/regional/intensity/${iso(anchor)}/fw48h`,
  'forecast',
);
const archive = {
  current,
  history,
  forecast,
  anchor: new Date(anchor).toISOString(),
  fetchedAt: new Date().toISOString(),
};
parseArchive(archive, 'offline');
const daily = [parseResponse(history)];
for (let day = 1; day <= 7; day++)
  daily.push(
    parseResponse(
      await get(
        `https://api.carbonintensity.org.uk/regional/intensity/${iso(anchor - day * 86400000)}/pt24h`,
        `history-${day}-${anchor}`,
      ),
    ),
  );
const carbon = alignFrames(...daily, parseResponse(current));
const shape = { nx: 18, ny: 16, x0: -650, y0: -100, step: 100 },
  nodes = [];
for (let y = 0; y < shape.ny; y++)
  for (let x = 0; x < shape.nx; x++) {
    const [lat, lon] = bngToWgs84(
      (shape.x0 + x * shape.step) * 1000,
      (shape.y0 + y * shape.step) * 1000,
    );
    nodes.push({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) });
  }
const points = [];
const fields = [
  'wind_speed_100m',
  'wind_direction_100m',
  'cloud_cover',
  'shortwave_radiation',
  'temperature_2m',
];
for (let start = 0; start < nodes.length; start += 8) {
  const chunk = nodes.slice(start, start + 8),
    url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: chunk.map((n) => n.lat).join(','),
    longitude: chunk.map((n) => n.lon).join(','),
    hourly: fields.join(','),
    models: 'ecmwf_ifs025',
    wind_speed_unit: 'ms',
    past_days: '7',
    forecast_days: '3',
    timeformat: 'unixtime',
    cell_selection: 'nearest',
  }).toString();
  const raw = await get(url.href, `weather-${start}`);
  points.push(...array(raw));
}
if (points.length !== nodes.length) throw new Error('Missing grid points');
let times = [];
const frameRows = [];
for (let p = 0; p < points.length; p++) {
  const row = record(points[p]),
    units = record(row.hourly_units),
    h = record(row.hourly);
  if (
    units.wind_speed_100m !== 'm/s' ||
    units.shortwave_radiation !== 'W/m²' ||
    units.cloud_cover !== '%'
  )
    throw new Error('Unexpected weather units');
  const t = array(h.time).map((n) => finite(n) * 1000);
  if (p === 0) {
    times = t;
    for (let i = 0; i < t.length; i++) frameRows.push([]);
  } else if (t.join(',') !== times.join(',')) throw new Error('Grid time mismatch');
  const values = fields.map((f) => array(h[f]));
  for (let i = 0; i < times.length; i++) {
    const speed = finite(values[0][i], 0, 100),
      direction = finite(values[1][i], 0, 360),
      cloud = finite(values[2][i], 0, 100),
      sun = finite(values[3][i], 0, 1600),
      temp = finite(values[4][i], -90, 60);
    const node = nodes[p],
      gamma = (((node.lon + 2) * Math.PI) / 180) * Math.sin((node.lat * Math.PI) / 180),
      [u, v] = components(speed, direction, gamma);
    frameRows[i].push(...[speed, u, v, cloud, sun, temp].map((n) => Math.round(n * 1000) / 1000));
  }
}
const weatherCaptured = new Date(
  Math.max(
    ...manifest.requests
      .filter((r) => new URL(r.url).hostname === 'api.open-meteo.com')
      .map((r) => Date.parse(r.capturedAt)),
  ),
).toISOString();
const full = {
  ...shape,
  times,
  frames: frameRows,
  capturedAt: weatherCaptured,
  height: 100,
  source: 'Open-Meteo · ECMWF IFS 0.25°',
};
const validated = parseWeather(full),
  boundaries = parseBoundaries(JSON.parse(await readFile('public/boundaries.json', 'utf8'))),
  aggregate = areaWeather(validated, boundaries);
let national = [];
try {
  const j = await get(
    `https://api.carbonintensity.org.uk/intensity/${iso(anchor - 8 * 86400000)}/${iso(anchor)}`,
    'national',
  );
  national = array(record(j).data).flatMap((item) => {
    const r = record(item),
      i = record(r.intensity);
    return i.actual === null ? [] : [{ at: timestamp(r.from), value: finite(i.actual, 0, 2000) }];
  });
} catch (e) {
  console.log('National actual unavailable:', e.message);
}
const weatherByTime = new Map(aggregate.rows.map((r) => [r.at, r]));
const rows = [];
for (const frame of carbon) {
  if (frame.from % 3600000 !== 0 || frame.from > anchor) continue;
  const w = weatherByTime.get(frame.from);
  if (!w) continue;
  for (const r of frame.regions) {
    const v = w.regions.find((v) => v.id === r.id);
    if (v)
      rows.push({
        at: frame.from,
        id: r.id,
        value: r.intensity,
        wind: r.mix.wind,
        weather: v.values,
      });
  }
  const actual = national.find((n) => n.at === frame.from);
  if (actual) {
    const count = Object.values(aggregate.cells).reduce((s, n) => s + n, 0),
      values = Array.from({ length: 6 }, (_, j) =>
        w.regions.reduce((s, r) => s + (r.values[j] * aggregate.cells[r.id]) / count, 0),
      );
    rows.push({
      at: frame.from,
      id: 18,
      value: actual.value,
      wind: frame.gb?.mix.wind ?? 0,
      weather: values,
    });
  }
}
const allForcing = aggregate.rows.flatMap((w) => {
  const count = Object.values(aggregate.cells).reduce((s, n) => s + n, 0);
  return [
    ...w.regions.map((r) => ({ at: w.at, id: r.id, weather: r.values })),
    {
      at: w.at,
      id: 18,
      weather: Array.from({ length: 6 }, (_, j) =>
        w.regions.reduce((s, r) => s + (r.values[j] * aggregate.cells[r.id]) / count, 0),
      ),
    },
  ];
});
const forecastWeather = allForcing.filter((r) => r.at > anchor && r.at <= anchor + 48 * 3600000),
  warmupWeather = allForcing.filter((r) => r.at <= anchor && r.at >= anchor - 6 * 3600000);
const published = baseline.frames
  .filter((f) => f.from >= baseline.fetchedAt && f.from <= anchor && f.from % 3600000 === 0)
  .flatMap((f) =>
    [...f.regions, ...(f.gb ? [f.gb] : [])].map((r) => ({
      at: f.from,
      id: r.id,
      value: r.intensity,
    })),
  );
archive.fetchedAt = new Date(
  Math.max(
    ...manifest.requests
      .filter((r) =>
        [
          `${'https://api.carbonintensity.org.uk'}/regional`,
          `${'https://api.carbonintensity.org.uk'}/regional/intensity/${iso(anchor)}/pt24h`,
          `${'https://api.carbonintensity.org.uk'}/regional/intensity/${iso(anchor)}/fw48h`,
        ].includes(r.url),
      )
      .map((r) => Date.parse(r.capturedAt)),
  ),
).toISOString();
const input = {
  version: 1,
  capturedAt: new Date(
    Math.max(...manifest.requests.map((r) => Date.parse(r.capturedAt))),
  ).toISOString(),
  cutoff: baseline.fetchedAt,
  asOf: anchor,
  regions: [
    ...boundaries.map((b) => ({
      id: b.id,
      name: rows.find((r) => r.id === b.id)?.id
        ? carbon.at(-1).regions.find((r) => r.id === b.id).name
        : b.name,
    })),
    { id: 18, name: 'Great Britain' },
  ],
  rows,
  forecastWeather,
  warmupWeather,
  published,
  cells: aggregate.cells,
  backtestWeather: '48-hour seasonal persistence; as-issued weather archive unavailable',
  target: 'Regions: NESO historical estimates (revision error). GB: national actual intensity.',
  baselineIssuedAt: baseline.fetchedAt,
};
const visibleTimes = full.times
  .map((at, i) => ({ at, i }))
  .filter((t) => t.at >= anchor - 24 * 3600000 && t.at <= anchor + 50 * 3600000);
const display = {
  ...full,
  times: visibleTimes.map((t) => t.at),
  frames: visibleTimes.map((t) => full.frames[t.i]),
};
parseWeather(display);
await writeFile('public/weather.json', JSON.stringify(display));
await writeFile('public/experiment.json', JSON.stringify(input));
await writeFile('public/snapshot.json', JSON.stringify(archive));
await writeFile('data/v3-sources.json', JSON.stringify(manifest, null, 2));
await writeFile('.cache/v3-data/full-weather.json', JSON.stringify(full));
console.log(
  'Prepared',
  rows.length,
  'historical region-hours;',
  published.length,
  'held-out forecast values;',
  forecastWeather.length,
  'forward region-hours. Quadrature cells:',
  aggregate.cells,
);
