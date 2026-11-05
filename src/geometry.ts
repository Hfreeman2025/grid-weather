import { array, record, finite, text } from './core.ts';
export type Point = [number, number];
export interface Boundary {
  id: number;
  name: string;
  rings: Point[][];
  label: Point;
}
export const VIEW = { width: 690, height: 1260 };
const IDS: Record<string, number> = {
  _P: 1,
  _N: 2,
  _G: 3,
  _F: 4,
  _M: 5,
  _D: 6,
  _K: 7,
  _E: 8,
  _B: 9,
  _A: 10,
  _L: 11,
  _H: 12,
  _C: 13,
  _J: 14,
};
// Interior label anchors in British National Grid kilometres, never substitute geometry.
const LABELS: Record<number, Point> = {
  1: [285, 840],
  2: [285, 635],
  3: [335, 505],
  4: [410, 570],
  5: [445, 440],
  6: [270, 375],
  7: [270, 225],
  8: [380, 310],
  9: [470, 340],
  10: [575, 280],
  11: [225, 105],
  12: [420, 160],
  13: [531, 179],
  14: [565, 125],
};
function point(value: unknown): Point {
  const p = array(value);
  if (p.length !== 2) throw new Error('Expected coordinate');
  return [finite(p[0], -100000, 2000000), finite(p[1], -100000, 2000000)];
}
function distance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t =
    dx || dy
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
      : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function simplify(points: Point[], tolerance: number): Point[] {
  const first = points[0],
    last = points.at(-1);
  if (!first || !last || points.length <= 2) return points;
  let max = tolerance,
    index = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (p) {
      const d = distance(p, first, last);
      if (d > max) {
        max = d;
        index = i;
      }
    }
  }
  if (index < 0) return [first, last];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}
export function prepareBoundaries(value: unknown): {
  boundaries: Boundary[];
  before: number;
  after: number;
} {
  const geo = record(value);
  if (
    geo.type !== 'FeatureCollection' ||
    record(record(geo.crs).properties).name !== 'urn:ogc:def:crs:EPSG::27700'
  )
    throw new Error('Expected British National Grid GeoJSON');
  let before = 0,
    after = 0;
  const boundaries = array(geo.features)
    .map((item) => {
      const f = record(item),
        props = record(f.properties),
        g = record(f.geometry);
      const id = IDS[text(props.Name)],
        anchor = id === undefined ? undefined : LABELS[id];
      if (id === undefined || !anchor || g.type !== 'MultiPolygon')
        throw new Error('Unknown DNO geometry');
      const rings = array(g.coordinates).flatMap((p) =>
        array(p).map((r) => {
          const raw = array(r).map(point);
          before += raw.length;
          const start = raw[0],
            end = raw.at(-1);
          if (raw.length < 4 || !start || !end || start[0] !== end[0] || start[1] !== end[1])
            throw new Error('Unclosed ring');
          const reduced = simplify(raw, 650);
          const safe = reduced.length >= 4 ? reduced : raw;
          after += safe.length;
          return safe.map(([x, y]): Point => [
            Math.round((x / 1000 + 10) * 100) / 100,
            Math.round((1240 - y / 1000) * 100) / 100,
          ]);
        }),
      );
      return {
        id,
        name: text(props.Area),
        rings,
        label: [anchor[0] + 10, 1240 - anchor[1]] satisfies Point,
      };
    })
    .sort((a, b) => a.id - b.id);
  if (boundaries.length !== 14 || new Set(boundaries.map((r) => r.id)).size !== 14)
    throw new Error('Expected 14 distinct regions');
  return { boundaries, before, after };
}
export function parseBoundaries(value: unknown): Boundary[] {
  const rows = array(value).map((item) => {
    const r = record(item),
      id = finite(r.id, 1, 14);
    if (!Number.isInteger(id)) throw new Error('Invalid region id');
    const rings = array(r.rings).map((r) => {
      const ps = array(r).map(point),
        a = ps[0],
        b = ps.at(-1);
      if (ps.length < 4 || !a || !b || a[0] !== b[0] || a[1] !== b[1])
        throw new Error('Invalid embedded ring');
      return ps;
    });
    if (!rings.length) throw new Error('Missing rings');
    return { id, name: text(r.name), rings, label: point(r.label) };
  });
  if (rows.length !== 14 || new Set(rows.map((r) => r.id)).size !== 14)
    throw new Error('Incomplete boundaries');
  return rows;
}
export function pathData(b: Boundary): string {
  return b.rings.map((r) => 'M' + r.map((p) => p.join(',')).join('L') + 'Z').join('');
}
