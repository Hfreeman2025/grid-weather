import type { Frame } from './core.ts';
import type { Stop, Evidence } from './presenter.ts';
import type { RegionalWeather } from './weather.ts';
import { number, shortWhen } from './format.ts';
export function regionalAt(rows: RegionalWeather[], at: number, id: number): number[] | null {
  if (at < (rows[0]?.at ?? Infinity) || at > (rows.at(-1)?.at ?? -Infinity)) return null;
  const i = rows.findIndex((r) => r.at <= at && r.at + 3600000 > at),
    a = rows[i],
    b = rows[i + 1],
    r = a?.regions.find((r) => r.id === id);
  if (!a || !r) return null;
  const next = b?.regions.find((r) => r.id === id);
  if (!b || !next || b.at !== a.at + 3600000) return r.values;
  const t = (at - a.at) / 3600000;
  return r.values.map((v, j) => v + ((next.values[j] ?? v) - v) * t);
}
export function weatherStories(frames: Frame[], rows: RegionalWeather[], after: number): Stop[] {
  const future = frames.filter((f) => f.from > after && f.from < after + 48 * 3600000),
    first = future[0];
  if (!first) return [];
  const candidates = first.regions
    .flatMap((r) => {
      const w = regionalAt(rows, first.from, r.id);
      return w ? [{ r, w }] : [];
    })
    .sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0));
  const wind = candidates[0];
  const result: Stop[] = [];
  if (wind) {
    const speed = wind.w[0] ?? 0,
      u = wind.w[1] ?? 0,
      v = wind.w[2] ?? 0,
      from = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360,
      west = from >= 225 && from <= 315;
    const evidence: Evidence[] = [
      {
        label: '100 m wind · m/s',
        value: speed,
        unit: 'm/s',
        at: first.from,
        region: wind.r.id,
        field: 'windSpeed',
      },
      {
        label: 'Wind generation · %',
        value: wind.r.mix.wind,
        unit: '%',
        at: first.from,
        region: wind.r.id,
        field: 'wind',
      },
    ];
    result.push({
      at: first.from,
      region: wind.r.id,
      highlights: [wind.r.id],
      kind: 'weather-wind',
      caption: `${wind.r.name}: ${west ? 'westerlies' : 'winds'} ${number(speed)} m/s at 100 m; wind share ${number(wind.r.mix.wind)}%.`,
      units: 'Wind: 10 km area quadrature · generation share: NESO · association, not cause',
      evidence,
    });
  }
  const sun = future
    .flatMap((f) =>
      f.regions.flatMap((r) => {
        const w = regionalAt(rows, f.from, r.id);
        return w ? [{ r, w, at: f.from }] : [];
      }),
    )
    .sort((a, b) => (b.w[4] ?? 0) - (a.w[4] ?? 0) || a.at - b.at)[0];
  if (sun && (sun.w[4] ?? 0) > 20)
    result.push({
      at: sun.at,
      region: sun.r.id,
      highlights: [sun.r.id],
      kind: 'weather-sun',
      caption: `${shortWhen(sun.at)}: ${sun.r.name} has ${Math.round(sun.w[4] ?? 0)} W/m² surface sunlight; solar share ${number(sun.r.mix.solar)}%.`,
      units: 'Sunlight: preceding-hour mean, 10 km area quadrature · solar generation: NESO',
      evidence: [
        {
          label: 'Surface sunlight · W/m²',
          value: sun.w[4] ?? 0,
          unit: 'W/m²',
          at: sun.at,
          region: sun.r.id,
          field: 'sunlight',
        },
        {
          label: 'Solar generation · %',
          value: sun.r.mix.solar,
          unit: '%',
          at: sun.at,
          region: sun.r.id,
          field: 'solar',
        },
      ],
    });
  return result;
}
