import { array, finite, record } from './core.ts';
import { bngToWgs84 } from './projection.ts';
import { components, parseWeather } from './weather.ts';
import type { WeatherGrid } from './weather.ts';
export const DOMAIN = { nx: 18, ny: 16, x0: -650, y0: -100, step: 100 };
const fields = [
  'wind_speed_100m',
  'wind_direction_100m',
  'cloud_cover',
  'shortwave_radiation',
  'temperature_2m',
];
export function locations(shape = DOMAIN): {
  lat: number;
  lon: number;
}[] {
  const result = [];
  for (let y = 0; y < shape.ny; y++)
    for (let x = 0; x < shape.nx; x++) {
      const [lat, lon] = bngToWgs84(
        (shape.x0 + x * shape.step) * 1000,
        (shape.y0 + y * shape.step) * 1000,
      );
      result.push({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) });
    }
  return result;
}
export function weatherURLs(pastDays = 7, shape = DOMAIN): string[] {
  const nodes = locations(shape),
    urls = [];
  for (let i = 0; i < nodes.length; i += 8) {
    const part = nodes.slice(i, i + 8),
      url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: part.map((n) => n.lat).join(','),
      longitude: part.map((n) => n.lon).join(','),
      hourly: fields.join(','),
      models: 'ecmwf_ifs025',
      wind_speed_unit: 'ms',
      past_days: String(pastDays),
      forecast_days: '3',
      timeformat: 'unixtime',
      cell_selection: 'nearest',
    }).toString();
    urls.push(url.href);
  }
  return urls;
}
export function assembleWeather(
  points: unknown[],
  capturedAt: string,
  shape = DOMAIN,
): WeatherGrid {
  const nodes = locations(shape);
  if (points.length !== nodes.length) throw new Error('Missing weather grid points');
  let times: number[] = [];
  const frames: number[][] = [];
  for (let p = 0; p < points.length; p++) {
    const r = record(points[p]),
      units = record(r.hourly_units),
      h = record(r.hourly),
      node = nodes[p];
    if (!node) throw new Error('Missing sampling location');
    if (
      units.wind_speed_100m !== 'm/s' ||
      units.wind_direction_100m !== '°' ||
      units.cloud_cover !== '%' ||
      units.shortwave_radiation !== 'W/m²' ||
      units.temperature_2m !== '°C'
    )
      throw new Error('Weather units rejected');
    const t = array(h.time).map((n) => finite(n) * 1000);
    if (p === 0) {
      times = t;
      for (let i = 0; i < t.length; i++) frames.push([]);
    } else if (t.join(',') !== times.join(',')) throw new Error('Weather grid hours do not align');
    const values = fields.map((f) => array(h[f]));
    if (values.some((v) => v.length !== times.length))
      throw new Error('Incomplete weather variable');
    for (let i = 0; i < t.length; i++) {
      const speed = finite(values[0]?.[i], 0, 100),
        direction = finite(values[1]?.[i], 0, 360),
        cloud = finite(values[2]?.[i], 0, 100),
        sun = finite(values[3]?.[i], 0, 1600),
        temperature = finite(values[4]?.[i], -90, 60),
        gamma = (((node.lon + 2) * Math.PI) / 180) * Math.sin((node.lat * Math.PI) / 180),
        [u, v] = components(speed, direction, gamma);
      frames[i]?.push(
        ...[speed, u, v, cloud, sun, temperature].map((v) => Math.round(v * 1000) / 1000),
      );
    }
  }
  return parseWeather({
    ...shape,
    times,
    frames,
    capturedAt,
    height: 100,
    source: 'Open-Meteo · ECMWF IFS 0.25°',
  });
}
export async function fetchWeather(
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<WeatherGrid> {
  const urls = weatherURLs(),
    points: unknown[] = [];
  for (let i = 0; i < urls.length; i++) {
    const response = await fetch(urls[i] ?? '', { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
    const raw: unknown = await response.json();
    points.push(...array(raw));
    progress(i + 1, urls.length);
  }
  return assembleWeather(points, new Date().toISOString());
}
