import { fitRidge, predictRidge, contributions } from './ridge.ts';
import type { Ridge } from './ridge.ts';
import type { Experiment, Observation, Forcing } from './experiment.ts';
import { pearson } from './weather.ts';
const HOUR = 3600000;
export const FEATURE_NAMES = ['Wind speed', 'Wind speed cubed', 'Cloud cover', 'Surface sunlight', 'Air temperature', 'Hour: sine', 'Hour: cosine', 'Half-day: sine', 'Half-day: cosine', 'Intensity 24h ago'];
export interface Prediction {
    at: number;
    value: number;
    terms: number[];
}
export interface TestPoint {
    at: number;
    target: number;
    predicted: number;
    neso: number;
    persistence: number;
}
export interface RegionFit {
    id: number;
    name: string;
    training: number;
    testN: number;
    mae: number | null;
    nesoMAE: number | null;
    persistenceMAE: number | null;
    lambda: number;
    model: Ridge;
    forecast: Prediction[];
    test: TestPoint[];
    windShare: {
        r: number | null;
        n: number;
    };
    intensity: {
        r: number | null;
        n: number;
    };
}
export function features(at: number, weather: number[], lag: number): number[] {
    if (weather.length !== 6 || weather.some(v => !Number.isFinite(v)) || !Number.isFinite(lag))
        throw new Error('Invalid feature input');
    const phase = (at % (24 * HOUR)) / (24 * HOUR) * Math.PI * 2, speed = weather[0] ?? 0;
    return [speed, Math.min(speed, 25) ** 3 / 1000, weather[3] ?? 0, weather[4] ?? 0, weather[5] ?? 0, Math.sin(phase), Math.cos(phase), Math.sin(phase * 2), Math.cos(phase * 2), lag];
}
function examples(rows: Observation[]): {
    x: number[][];
    y: number[];
    at: number[];
} {
    const values = new Map(rows.map(r => [r.at, r.value])), x: number[][] = [], y: number[] = [], at: number[] = [];
    for (const row of rows) {
        const lag = values.get(row.at - 24 * HOUR);
        if (lag === undefined)
            continue;
        x.push(features(row.at, row.weather, lag));
        y.push(row.value);
        at.push(row.at);
    }
    return { x, y, at };
}
export function predictSequence(model: Ridge, forcing: Forcing[], history: Observation[], windScale = 1): Prediction[] {
    if (!Number.isFinite(windScale) || windScale < .25 || windScale > 2)
        throw new Error('Invalid hypothetical wind scale');
    const known = new Map(history.map(r => [r.at, r.value])), result: Prediction[] = [];
    for (const f of [...forcing].sort((a, b) => a.at - b.at)) {
        const lag = known.get(f.at - 24 * HOUR);
        if (lag === undefined)
            continue;
        const w = f.weather.map((v, i) => i <= 2 ? v * windScale : v), x = features(f.at, w, lag), value = Math.max(0, Math.min(2000, predictRidge(model, x)));
        result.push({ at: f.at, value, terms: contributions(model, x) });
        known.set(f.at, value);
    }
    return result;
}
function tune(rows: Observation[]): {
    model: Ridge;
    n: number;
} {
    const e = examples(rows);
    if (e.x.length < 36)
        throw new Error('At least 36 complete lagged training hours are needed');
    const cut = Math.max(12, e.x.length - 24);
    let best = 10, error = Infinity;
    for (const lambda of [.1, 1, 10, 100]) {
        const model = fitRidge(e.x.slice(0, cut), e.y.slice(0, cut), lambda);
        const loss = e.x.slice(cut).reduce((s, x, i) => s + Math.abs(predictRidge(model, x) - (e.y[cut + i] ?? 0)), 0) / (e.x.length - cut);
        if (loss < error) {
            error = loss;
            best = lambda;
        }
    }
    return { model: fitRidge(e.x, e.y, best), n: e.x.length };
}
export function fitRegion(input: Experiment, id: number): RegionFit {
    const all = input.rows.filter(r => r.id === id).sort((a, b) => a.at - b.at);
    // A two-hour availability buffer precedes the frozen NESO issue time.
    const history = all.filter(r => r.at + 2 * HOUR <= input.cutoff), fitted = tune(history);
    const forcing = all.filter(r => r.at > (history.at(-1)?.at ?? input.cutoff)).flatMap(r => { const prior = all.find(p => p.at === r.at - 48 * HOUR); return prior ? [{ at: r.at, id, weather: prior.weather }] : []; });
    const predictions = predictSequence(fitted.model, forcing, history), published = new Map(input.published.filter(r => r.id === id).map(r => [r.at, r.value]));
    const persistenceValues = new Map(history.map(r => [r.at, r.value]));
    for (const f of forcing) {
        const lag = persistenceValues.get(f.at - 24 * HOUR);
        if (lag !== undefined)
            persistenceValues.set(f.at, lag);
    }
    const test = predictions.flatMap(p => { const truth = all.find(r => r.at === p.at), neso = published.get(p.at), persistence = persistenceValues.get(p.at); return truth && neso !== undefined && persistence !== undefined ? [{ at: p.at, target: truth.value, predicted: p.value, neso, persistence }] : []; });
    const current = tune(all), warmup = (input.warmupWeather ?? []).filter(r => r.id === id && r.at > (all.at(-1)?.at ?? 0)), forecast = predictSequence(current.model, [...warmup, ...input.forecastWeather.filter(r => r.id === id)], all).filter(r => r.at > input.asOf);
    const mae = (field: 'predicted' | 'neso' | 'persistence') => test.length ? test.reduce((s, r) => s + Math.abs(r[field] - r.target), 0) / test.length : null;
    return { id, name: input.regions.find(r => r.id === id)?.name ?? String(id), training: fitted.n, testN: test.length, mae: mae('predicted'), nesoMAE: mae('neso'), persistenceMAE: mae('persistence'), lambda: current.model.lambda, model: current.model, forecast, test,
        windShare: pearson(all.map(r => [r.weather[0] ?? 0, r.wind])), intensity: pearson(all.map(r => [r.weather[0] ?? 0, r.value])) };
}
export function fitAll(input: Experiment, progress: (done: number, total: number) => void = () => { }): RegionFit[] {
    const results: RegionFit[] = [];
    for (const region of input.regions) {
        if (input.rows.filter(r => r.id === region.id).length < 72)
            continue;
        results.push(fitRegion(input, region.id));
        progress(results.length, input.regions.length);
    }
    return results;
}
