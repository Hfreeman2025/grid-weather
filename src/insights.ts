import { bestWindow, interpolate } from './core.ts';
import type { Frame } from './core.ts';
export function windowComparison(
  frames: Frame[],
  id: number,
  now: number,
): {
  window: NonNullable<ReturnType<typeof bestWindow>>;
  baseline: number;
  percentLower: number | null;
} | null {
  const window = bestWindow(frames, id, now);
  const baseline = interpolate(frames, now).find((r) => r.id === id)?.intensity;
  if (!window || baseline === undefined) return null;
  return {
    window,
    baseline,
    percentLower: baseline > 0 ? ((baseline - window.intensity) / baseline) * 100 : null,
  };
}
