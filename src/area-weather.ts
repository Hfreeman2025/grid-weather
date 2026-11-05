import type { Boundary, Point } from './geometry.ts';
import { bilinear, WEATHER_FIELDS } from './weather.ts';
import type { WeatherGrid, RegionalWeather } from './weather.ts';
export function contains(rings: Point[][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a &&
        b &&
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
  return inside;
}
export function areaWeather(
  grid: WeatherGrid,
  boundaries: Boundary[],
  spacing = 10,
): {
  rows: RegionalWeather[];
  cells: Record<number, number>;
} {
  if (spacing <= 0 || !Number.isFinite(spacing)) throw new Error('Invalid quadrature spacing');
  const cells: Record<number, number> = {},
    weights = new Map<number, Map<number, number>>();
  for (const b of boundaries) {
    const points = b.rings.flat(),
      minX = Math.min(...points.map((p) => p[0])),
      maxX = Math.max(...points.map((p) => p[0])),
      minY = Math.min(...points.map((p) => p[1])),
      maxY = Math.max(...points.map((p) => p[1]));
    const w = new Map<number, number>();
    let count = 0;
    for (let y = Math.floor(minY / spacing) * spacing + spacing / 2; y < maxY; y += spacing)
      for (let x = Math.floor(minX / spacing) * spacing + spacing / 2; x < maxX; x += spacing) {
        if (!contains(b.rings, x, y)) continue;
        const bs = bilinear(grid, x - 10, 1240 - y);
        if (!bs.length) throw new Error(`Weather coverage missing for region ${b.id}`);
        for (const v of bs) w.set(v.index, (w.get(v.index) ?? 0) + v.weight);
        count++;
      }
    if (!count) throw new Error(`No quadrature coverage for region ${b.id}`);
    cells[b.id] = count;
    weights.set(b.id, new Map([...w].map(([i, v]) => [i, v / count])));
  }
  const rows = grid.times.map((at, i) => ({
    at,
    regions: boundaries.map((b) => ({
      id: b.id,
      values: Array.from({ length: WEATHER_FIELDS }, (_, field) =>
        [...(weights.get(b.id) ?? [])].reduce(
          (sum, [node, w]) => sum + (grid.frames[i]?.[node * WEATHER_FIELDS + field] ?? 0) * w,
          0,
        ),
      ),
    })),
  }));
  return { rows, cells };
}
