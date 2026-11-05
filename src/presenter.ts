import { bestWindow } from './core.ts';
import type { Frame, Region } from './core.ts';
import { number, shortWhen, time } from './format.ts';
export interface Evidence {
  label: string;
  value: number;
  unit: string;
  at: number;
  region: number;
  field: 'intensity' | 'wind' | 'solar' | 'gas' | 'windSpeed' | 'sunlight' | 'mean';
}
export interface Stop {
  at: number;
  region: number;
  highlights: number[];
  kind: 'change' | 'wind' | 'solar' | 'gas' | 'window' | 'band' | 'weather-wind' | 'weather-sun';
  caption: string;
  units: string;
  evidence: Evidence[];
}
const unit = 'gCO₂/kWh';
const briefClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const hourClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: 'numeric',
  hourCycle: 'h23',
});
const when = (at: number): string => briefClock.format(at).replace(',', '');
function fact(
  r: Region,
  at: number,
  field: 'intensity' | 'wind' | 'solar' | 'gas',
  label = shortWhen(at),
): Evidence {
  return {
    label,
    value: field === 'intensity' ? r.intensity : r.mix[field],
    unit: field === 'intensity' ? unit : '%',
    at,
    region: r.id,
    field,
  };
}
function pairs(base: Frame, frame: Frame) {
  return frame.regions.flatMap((r) => {
    const prior = base.regions.find((p) => p.id === r.id);
    return prior ? [{ r, prior, delta: r.intensity - prior.intensity }] : [];
  });
}
function change(base: Frame, frame: Frame, improvement: boolean): Stop | null {
  const ranked = pairs(base, frame).sort((a, b) =>
    improvement ? a.delta - b.delta || a.r.id - b.r.id : b.delta - a.delta || a.r.id - b.r.id,
  );
  const positive = ranked.find((p) => (improvement ? p.delta < 0 : p.delta > 0));
  const choice =
    positive ?? ranked.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.r.id - b.r.id)[0];
  if (!choice) return null;
  const { r, prior, delta } = choice;
  return {
    at: frame.from,
    region: r.id,
    highlights: [r.id],
    kind: 'change',
    caption:
      delta === 0
        ? `By ${when(frame.from)}, every region holds its intensity from now.`
        : `By ${when(frame.from)}, ${r.name} ${delta < 0 ? 'improves most' : 'worsens most'}: ${delta < 0 ? 'down' : 'up'} ${number(Math.abs(delta))} g from now.`,
    units: `${unit} · now versus forecast · named region outlined`,
    evidence: [
      fact(prior, base.from, 'intensity', `Now · ${shortWhen(base.from)}`),
      fact(r, frame.from, 'intensity'),
    ],
  };
}
function shares(base: Frame, future: Frame[], fuel: 'wind' | 'solar' | 'gas'): Stop | null {
  const choices = future.flatMap((frame) =>
    pairs(base, frame).map((p) => ({
      ...p,
      at: frame.from,
      share: p.r.mix[fuel] - p.prior.mix[fuel],
    })),
  );
  const choice = choices.sort(
    (a, b) => Math.abs(b.share) - Math.abs(a.share) || a.at - b.at || a.r.id - b.r.id,
  )[0];
  if (!choice || Math.abs(choice.share) < 0.1) return null;
  const { r, prior, at, share } = choice;
  return {
    at,
    region: r.id,
    highlights: [r.id],
    kind: fuel,
    caption: `By ${when(at)}, ${r.name}’s ${fuel} share ${share < 0 ? 'falls' : 'rises'} ${number(Math.abs(share))} percentage points.`,
    units: `% generation share · now versus forecast · no causal claim`,
    evidence: [fact(prior, base.from, fuel, `Now · ${shortWhen(base.from)}`), fact(r, at, fuel)],
  };
}
function cleanerBand(base: Frame, future: Frame[]): Stop | null {
  let previous = base;
  for (const frame of future) {
    if (
      frame.gb &&
      previous.gb &&
      previous.to === frame.from &&
      Math.min(3, Math.floor(frame.gb.intensity / 100)) <
        Math.min(3, Math.floor(previous.gb.intensity / 100))
    ) {
      const threshold = Math.min(300, Math.floor(previous.gb.intensity / 100) * 100);
      if (threshold < 100) {
        previous = frame;
        continue;
      }
      const selected = change(base, frame, true);
      if (!selected) return null;
      return {
        at: frame.from,
        region: selected.region,
        highlights: frame.regions.map((r) => r.id),
        kind: 'band',
        caption: `GB first falls below ${threshold} ${unit} at ${when(frame.from)}.`,
        units: `${unit} · API’s GB aggregate · before / at crossing`,
        evidence: [
          fact(previous.gb, previous.from, 'intensity'),
          fact(frame.gb, frame.from, 'intensity'),
        ],
      };
    }
    previous = frame;
  }
  return null;
}
function overnight(base: Frame, future: Frame[], after: number): Stop | null {
  const nights = future.filter((f) => {
    const h = Number(hourClock.format(f.from));
    return f.gb && (h >= 22 || h < 7);
  });
  const national = nights.map((f) => ({ ...f, regions: f.gb ? [f.gb] : [] }));
  const window = bestWindow(national, 18, after);
  if (!window) return null;
  const raw = national
    .filter((f) => f.from >= window.from && f.to <= window.to)
    .flatMap((f) => (f.gb ? [fact(f.gb, f.from, 'intensity', time(f.from))] : []));
  const frame = future.find((f) => f.from === window.from),
    selected = frame && change(base, frame, true);
  if (raw.length !== 4 || !frame || !selected) return null;
  return {
    at: window.from,
    region: selected.region,
    highlights: frame.regions.map((r) => r.id),
    kind: 'window',
    caption: `GB’s cleanest overnight window: ${when(window.from)}–${time(window.to)}.`,
    units: `${unit} · GB · four half-hours and mean · overnight 22:00–07:00`,
    evidence: [
      ...raw,
      {
        label: '2h mean',
        value: window.intensity,
        unit,
        at: window.from,
        region: 18,
        field: 'mean',
      },
    ],
  };
}
export function buildTour(frames: Frame[], after: number): Stop[] {
  const ordered = [...frames].sort((a, b) => a.from - b.from);
  const base =
    ordered.find((f) => f.from <= after && f.to > after) ?? ordered.find((f) => f.from >= after);
  const future = ordered.filter((f) => f.from > after && f.from < after + 48 * 3600000);
  const last = future.at(-1);
  if (!base || !last || !base.regions.length) return [];
  const stops: Stop[] = [];
  const used = new Set<number>();
  for (let i = 1; i <= 8; i++) {
    const target = base.from + ((last.from - base.from) * i) / 8;
    const frame = future.reduce(
      (best, f) => (Math.abs(f.from - target) < Math.abs(best.from - target) ? f : best),
      last,
    );
    if (used.has(frame.from)) continue;
    used.add(frame.from);
    const stop = change(base, frame, i % 2 === 1);
    if (stop) stops.push(stop);
  }
  for (const fuel of ['wind', 'solar', 'gas'] as const) {
    const stop = shares(base, future, fuel);
    if (stop) stops.push(stop);
  }
  const crossing = cleanerBand(
    base,
    ordered.filter((f) => f.from > base.from && f.from <= last.from),
  );
  const window = overnight(base, future, after);
  if (crossing && crossing.at > after) stops.push(crossing);
  if (window) stops.push(window);
  return stops.sort((a, b) => a.at - b.at);
}
