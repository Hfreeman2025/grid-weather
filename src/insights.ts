import { bestWindow, interpolate } from './core.ts';
import type { Frame, Region } from './core.ts';
export function regionalExtremes(regions: Region[]): {
    low: Region;
    high: Region;
} | null {
    if (!regions.length)
        return null;
    const sorted = [...regions].sort((a, b) => a.intensity - b.intensity || a.id - b.id);
    const low = sorted[0], high = sorted.at(-1);
    return low && high ? { low, high } : null;
}
export function windowComparison(frames: Frame[], id: number, now: number): {
    window: NonNullable<ReturnType<typeof bestWindow>>;
    baseline: number;
    percentLower: number | null;
} | null {
    const window = bestWindow(frames, id, now);
    const baseline = interpolate(frames, now).find(r => r.id === id)?.intensity;
    if (!window || baseline === undefined)
        return null;
    return { window, baseline, percentLower: baseline > 0 ? (baseline - window.intensity) / baseline * 100 : null };
}
