import { array, finite, record, text } from './core.ts';
export interface Observation {
  at: number;
  id: number;
  value: number;
  wind: number;
  weather: number[];
}
export interface Forcing {
  at: number;
  id: number;
  weather: number[];
}
export interface Published {
  at: number;
  id: number;
  value: number;
}
export interface Experiment {
  version: 1;
  capturedAt: string;
  cutoff: number;
  asOf: number;
  regions: {
    id: number;
    name: string;
  }[];
  rows: Observation[];
  forecastWeather: Forcing[];
  warmupWeather?: Forcing[];
  published: Published[];
  backtestWeather: string;
  target: string;
  baselineIssuedAt: number;
}
const hour = 3600000;
function id(value: unknown): number {
  const n = finite(value, 1, 18);
  if (!Number.isInteger(n) || (n > 14 && n !== 18)) throw new Error('Invalid experiment region');
  return n;
}
function at(value: unknown): number {
  const n = finite(value, 0);
  if (n % hour) throw new Error('Expected hourly observation');
  return n;
}
function weather(value: unknown): number[] {
  const a = array(value).map((n) => finite(n, -100, 1600));
  if (a.length !== 6) throw new Error('Expected six weather features');
  return a;
}
export function parseExperiment(value: unknown): Experiment {
  const a = record(value),
    cutoff = finite(a.cutoff, 0),
    asOf = finite(a.asOf, cutoff),
    seen = new Set<string>();
  if (a.version !== 1) throw new Error('Unsupported experiment');
  const rows = array(a.rows).map((item) => {
    const r = record(item),
      row = {
        at: at(r.at),
        id: id(r.id),
        value: finite(r.value, 0, 2000),
        wind: finite(r.wind, 0, 100),
        weather: weather(r.weather),
      };
    const key = `${row.id}:${row.at}`;
    if (seen.has(key) || row.at > asOf) throw new Error('Duplicate or future observation');
    seen.add(key);
    return row;
  });
  if (rows.length < 48 || rows.length > 10000)
    throw new Error('Incomplete or oversized experiment');
  const forecastWeather = array(a.forecastWeather).map((item) => {
    const r = record(item),
      row = { at: at(r.at), id: id(r.id), weather: weather(r.weather) };
    if (row.at <= asOf || row.at > asOf + 48 * hour) throw new Error('Invalid forward horizon');
    return row;
  });
  const warmupWeather = (a.warmupWeather === undefined ? [] : array(a.warmupWeather)).map(
    (item) => {
      const r = record(item),
        row = { at: at(r.at), id: id(r.id), weather: weather(r.weather) };
      if (row.at > asOf || row.at < asOf - 6 * hour) throw new Error('Invalid forecast warm-up');
      return row;
    },
  );
  const published = array(a.published).map((item) => {
    const r = record(item),
      row = { at: at(r.at), id: id(r.id), value: finite(r.value, 0, 2000) };
    if (row.at <= cutoff || row.at > asOf) throw new Error('Invalid held-out interval');
    return row;
  });
  const regions = array(a.regions).map((item) => {
    const r = record(item);
    return { id: id(r.id), name: text(r.name) };
  });
  if (new Set(regions.map((r) => r.id)).size !== regions.length)
    throw new Error('Duplicate experiment region');
  return {
    version: 1,
    capturedAt: text(a.capturedAt),
    cutoff,
    asOf,
    regions,
    rows,
    forecastWeather,
    warmupWeather,
    published,
    backtestWeather: text(a.backtestWeather),
    target: text(a.target),
    baselineIssuedAt: finite(a.baselineIssuedAt, 0, cutoff),
  };
}
