import { alignFrames, parseResponse, record, timestamp, HALF_HOUR } from './core.ts';
import type { Frame } from './core.ts';
export interface Dataset {
    frames: Frame[];
    anchor: number;
    fetchedAt: number;
    mode: 'connected' | 'cached' | 'offline';
    issue: string;
}
const BASE = 'https://api.carbonintensity.org.uk';
const CACHE = 'grid-weather-v1';
export function parseArchive(value: unknown, mode: Dataset['mode'], issue = ''): Dataset {
    const a = record(value), anchor = timestamp(a.anchor), fetchedAt = timestamp(a.fetchedAt);
    const frames = alignFrames(parseResponse(a.history), parseResponse(a.forecast), parseResponse(a.current));
    const first = frames[0], last = frames.at(-1);
    if (!first || !last || first.from > anchor - 23 * 3600000 || last.to < anchor + 47 * 3600000)
        throw new Error('Incomplete 72-hour series');
    if (frames.some((f, i) => i > 0 && frames[i - 1]?.to !== f.from))
        throw new Error('Missing half-hour frames');
    return { frames, anchor, fetchedAt, mode, issue };
}
async function get(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: AbortSignal.timeout(18000), cache: 'no-cache' });
    if (!response.ok)
        throw new Error(`Data service returned HTTP ${response.status}`);
    const value: unknown = await response.json();
    return value;
}
export async function loadData(force = false): Promise<Dataset> {
    let cached: unknown;
    let cacheIssue = '';
    try {
        const stored = localStorage.getItem(CACHE);
        if (stored)
            cached = JSON.parse(stored);
    }
    catch (e) {
        cacheIssue = `Browser cache unavailable: ${e instanceof Error ? e.message : 'storage denied'}`;
    }
    if (cached && !force) {
        try {
            const data = parseArchive(cached, 'cached');
            if (Date.now() - data.fetchedAt < 15 * 60000 && Math.abs(Date.now() - data.anchor) < 2 * HALF_HOUR)
                return data;
        }
        catch (e) {
            cacheIssue = `Invalid browser cache: ${e instanceof Error ? e.message : 'invalid data'}`;
        }
    }
    try {
        const current = await get(`${BASE}/regional`), frames = parseResponse(current), anchor = frames[0]?.from;
        if (anchor === undefined || Math.abs(Date.now() - anchor) > 2 * HALF_HOUR)
            throw new Error('The API’s latest interval is out of date');
        const from = new Date(anchor).toISOString().replace(':00.000Z', 'Z');
        const [history, forecast] = await Promise.all([get(`${BASE}/regional/intensity/${from}/pt24h`), get(`${BASE}/regional/intensity/${from}/fw48h`)]);
        const archive = { current, history, forecast, anchor: new Date(anchor).toISOString(), fetchedAt: new Date().toISOString() };
        const result = parseArchive(archive, 'connected');
        try {
            localStorage.setItem(CACHE, JSON.stringify(archive));
        }
        catch (e) {
            cacheIssue = `Browser cache unavailable: ${e instanceof Error ? e.message : 'storage denied'}`;
        }
        result.issue = cacheIssue;
        return result;
    }
    catch (e) {
        const issue = e instanceof Error ? e.message : 'Data service unavailable';
        cacheIssue = issue;
        if (cached) {
            try {
                return parseArchive(cached, 'offline', issue);
            }
            catch (e) {
                cacheIssue += `; invalid saved cache: ${e instanceof Error ? e.message : 'invalid data'}`;
            }
        }
        return parseArchive(await get('./snapshot.json'), 'offline', cacheIssue);
    }
}
