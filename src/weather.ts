import { array, finite, record, text, timestamp } from './core.ts';
export const WEATHER_FIELDS = 6;
export interface WeatherGrid {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  step: number;
  times: number[];
  frames: number[][];
  capturedAt: number;
  height: number;
  source: string;
}
export interface RegionalWeather {
  at: number;
  regions: {
    id: number;
    values: number[];
  }[];
}
export function parseWeather(value: unknown): WeatherGrid {
  const a = record(value),
    nx = finite(a.nx, 2, 60),
    ny = finite(a.ny, 2, 60),
    step = finite(a.step, 1, 300);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx * ny > 600)
    throw new Error('Invalid weather grid');
  const times = array(a.times).map((n) => finite(n, 0));
  if (
    !times.length ||
    times.length > 400 ||
    times.some((n, i) => n % 3600000 !== 0 || (i > 0 && n !== (times[i - 1] ?? 0) + 3600000))
  )
    throw new Error('Weather hours must be contiguous UTC');
  const frames = array(a.frames).map((row) =>
    array(row).map((n, i) =>
      finite(
        n,
        i % 6 === 5 ? -90 : i % 6 === 1 || i % 6 === 2 ? -100 : 0,
        i % 6 === 4 ? 1600 : 100,
      ),
    ),
  );
  if (frames.length !== times.length || frames.some((f) => f.length !== nx * ny * WEATHER_FIELDS))
    throw new Error('Incomplete weather field');
  return {
    nx,
    ny,
    step,
    x0: finite(a.x0, -2000, 1000),
    y0: finite(a.y0, -1000, 2000),
    times,
    frames,
    capturedAt: timestamp(a.capturedAt),
    height: finite(a.height, 10, 250),
    source: text(a.source),
  };
}
export function components(speed: number, fromDegrees: number, convergence = 0): [number, number] {
  const direction = (fromDegrees * Math.PI) / 180;
  const east = -speed * Math.sin(direction),
    north = -speed * Math.cos(direction);
  return [
    east * Math.cos(convergence) - north * Math.sin(convergence),
    east * Math.sin(convergence) + north * Math.cos(convergence),
  ];
}
export function bilinear(
  grid: Pick<WeatherGrid, 'nx' | 'ny' | 'x0' | 'y0' | 'step'>,
  x: number,
  y: number,
): {
  index: number;
  weight: number;
}[] {
  const gx = (x - grid.x0) / grid.step,
    gy = (y - grid.y0) / grid.step;
  if (gx < 0 || gy < 0 || gx > grid.nx - 1 || gy > grid.ny - 1) return [];
  const ix = Math.min(grid.nx - 2, Math.floor(gx)),
    iy = Math.min(grid.ny - 2, Math.floor(gy)),
    u = gx - ix,
    v = gy - iy;
  return [
    { index: iy * grid.nx + ix, weight: (1 - u) * (1 - v) },
    { index: iy * grid.nx + ix + 1, weight: u * (1 - v) },
    { index: (iy + 1) * grid.nx + ix, weight: (1 - u) * v },
    { index: (iy + 1) * grid.nx + ix + 1, weight: u * v },
  ];
}
export function weatherAt(grid: WeatherGrid, at: number): number[] | null {
  if (at < (grid.times[0] ?? Infinity) || at > (grid.times.at(-1) ?? -Infinity)) return null;
  const i = Math.floor((at - (grid.times[0] ?? 0)) / 3600000),
    a = grid.frames[i],
    b = grid.frames[i + 1];
  if (!a) return null;
  if (!b) return a;
  const t = (at - (grid.times[i] ?? at)) / 3600000;
  return a.map((v, j) => v + ((b[j] ?? v) - v) * t);
}
export function sampleWeather(
  grid: WeatherGrid,
  frame: number[],
  x: number,
  y: number,
): number[] | null {
  const weights = bilinear(grid, x, y);
  return weights.length
    ? Array.from({ length: WEATHER_FIELDS }, (_, field) =>
        weights.reduce(
          (sum, w) => sum + (frame[w.index * WEATHER_FIELDS + field] ?? 0) * w.weight,
          0,
        ),
      )
    : null;
}
export function pearson(pairs: [number, number][]): {
  r: number | null;
  n: number;
} {
  if (pairs.some((p) => !p.every(Number.isFinite))) throw new Error('Invalid correlation sample');
  const n = pairs.length;
  if (n < 3) return { r: null, n };
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n,
    my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const [x, y] of pairs) {
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
    xy += (x - mx) * (y - my);
  }
  return {
    r: xx > 1e-12 && yy > 1e-12 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null,
    n,
  };
}
