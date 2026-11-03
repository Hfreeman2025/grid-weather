export const HALF_HOUR = 1800000;
export const FUELS = ['biomass', 'coal', 'imports', 'gas', 'nuclear', 'other', 'hydro', 'solar', 'wind'] as const;
export type Fuel = typeof FUELS[number];
export type Mix = Record<Fuel, number>;
export interface Region {
    id: number;
    name: string;
    intensity: number;
    mix: Mix;
}
export interface Frame {
    from: number;
    to: number;
    regions: Region[];
    gb?: Region;
}
export function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('Expected an object');
    return Object.fromEntries(Object.entries(value));
}
export function array(value: unknown): unknown[] {
    if (!Array.isArray(value))
        throw new Error('Expected an array');
    return value;
}
export function finite(value: unknown, min = 0, max = Infinity): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw new Error('Invalid numeric value');
    return value;
}
export function text(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200)
        throw new Error('Invalid text');
    return value;
}
export function timestamp(value: unknown): number {
    const s = text(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(s))
        throw new Error('Expected UTC timestamp');
    const n = Date.parse(s);
    if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 16) !== s.slice(0, 16))
        throw new Error('Invalid timestamp');
    return n;
}
export function parseResponse(value: unknown): Frame[] {
    const data = array(record(value).data);
    if (data.length === 0 || data.length > 200)
        throw new Error('No data or oversized response');
    return data.map(item => {
        const row = record(item), from = timestamp(row.from), to = timestamp(row.to);
        if (to - from !== HALF_HOUR || from % HALF_HOUR !== 0)
            throw new Error('Expected aligned half-hour interval');
        const seen = new Set<number>();
        const regions = array(row.regions).map(item => {
            const r = record(item), id = finite(r.regionid, 1, 18);
            if (!Number.isInteger(id) || seen.has(id))
                throw new Error('Invalid or duplicate region');
            seen.add(id);
            const mix: Mix = { biomass: 0, coal: 0, imports: 0, gas: 0, nuclear: 0, other: 0, hydro: 0, solar: 0, wind: 0 };
            const fuels = new Set<string>();
            for (const item of array(r.generationmix)) {
                const f = record(item), name = text(f.fuel);
                const fuel = FUELS.find(f => f === name);
                if (!fuel || fuels.has(fuel))
                    throw new Error('Invalid or duplicate fuel');
                fuels.add(fuel);
                mix[fuel] = finite(f.perc, 0, 100);
            }
            const total = Object.values(mix).reduce((a, b) => a + b, 0);
            if (fuels.size !== FUELS.length || Math.abs(total - 100) > 1)
                throw new Error('Incomplete fuel mix');
            const intensity = record(r.intensity);
            text(intensity.index);
            return { id, name: text(r.shortname), intensity: finite(intensity.forecast, 0, 2000), mix };
        }).sort((a, b) => a.id - b.id);
        const gb = regions.find(r => r.id === 18), local = regions.filter(r => r.id <= 14);
        if (local.length !== 14)
            throw new Error('Expected all 14 DNO regions');
        return { from, to, regions: local, ...(gb ? { gb } : {}) };
    });
}
export function alignFrames(...groups: Frame[][]): Frame[] {
    const byTime = new Map<number, Frame>();
    let ids: string | undefined;
    for (const frame of groups.flat()) {
        const signature = frame.regions.map(r => r.id).sort((a, b) => a - b).join(',');
        if (ids !== undefined && ids !== signature)
            throw new Error('Region sets do not match');
        ids = signature;
        byTime.set(frame.from, frame);
    }
    return [...byTime.values()].sort((a, b) => a.from - b.from);
}
export function interpolate(frames: Frame[], time: number): Region[] {
    const i = frames.findIndex(f => time >= f.from && time < f.to);
    const a = frames[i];
    if (!a)
        return [];
    const b = frames[i + 1];
    if (!b || b.from !== a.to)
        return a.regions;
    const t = (time - a.from) / HALF_HOUR;
    return a.regions.map(r => {
        const next = b.regions.find(n => n.id === r.id);
        if (!next)
            return r;
        const mix = { ...r.mix };
        for (const fuel of FUELS)
            mix[fuel] += (next.mix[fuel] - mix[fuel]) * t;
        return { ...r, intensity: r.intensity + (next.intensity - r.intensity) * t, mix };
    });
}
export function bestWindow(frames: Frame[], id: number, after: number): {
    from: number;
    to: number;
    intensity: number;
} | null {
    let best: {
        from: number;
        to: number;
        intensity: number;
    } | null = null;
    for (let i = 0; i <= frames.length - 4; i++) {
        const window = frames.slice(i, i + 4), first = window[0], last = window[3];
        if (!first || !last || first.from < after || window.some((f, j) => f.from !== first.from + j * HALF_HOUR))
            continue;
        const values = window.map(f => f.regions.find(r => r.id === id)?.intensity);
        if (values.some(n => n === undefined))
            continue;
        const intensity = values.reduce<number>((sum, n) => sum + (n ?? 0), 0) / 4;
        if (!best || intensity < best.intensity)
            best = { from: first.from, to: last.to, intensity };
    }
    return best;
}
export function colour(value: number): [
    number,
    number,
    number
] {
    const low = [135, 198, 165], mid = [239, 195, 112], high = [219, 115, 88];
    const v = Math.max(0, Math.min(400, value)), a = v <= 200 ? low : mid, b = v <= 200 ? mid : high;
    const t = v <= 200 ? v / 200 : (v - 200) / 200;
    const channel = (i: number) => Math.round((a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t);
    return [channel(0), channel(1), channel(2)];
}
export function cssColour(value: number): string { return `rgb(${colour(value).join(' ')})`; }
