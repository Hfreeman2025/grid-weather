import { array, finite, record, text } from './core.ts';
import type { RegionFit, Prediction, TestPoint } from './forecaster.ts';
import type { Ridge } from './ridge.ts';
export type VisibleFit = Omit<RegionFit, 'model'> & {
    model?: Ridge;
};
const numbers = (v: unknown) => array(v).map(n => finite(n, -1e7, 1e7));
function model(v: unknown): Ridge {
    const r = record(v), means = numbers(r.means), scales = numbers(r.scales), coefficients = numbers(r.coefficients);
    if (means.length !== 10 || scales.length !== 10 || coefficients.length !== 10 || scales.some(n => n <= 0))
        throw new Error('Invalid model coefficients');
    return { means, scales, coefficients, lambda: finite(r.lambda, .01, 1000), intercept: finite(r.intercept, 0, 2000) };
}
function predictions(v: unknown): Prediction[] {
    const rows = array(v).map(item => {
        const r = record(item), terms = numbers(r.terms);
        if (terms.length !== 10)
            throw new Error('Invalid contribution vector');
        return { at: finite(r.at, 0), value: finite(r.value, 0, 2000), terms };
    });
    if (rows.length > 48)
        throw new Error('Oversized prediction horizon');
    return rows;
}
export function parseResults(value: unknown): VisibleFit[] {
    const results = array(value).map(item => {
        const r = record(item), id = finite(r.id, 1, 18);
        if (!Number.isInteger(id) || (id > 14 && id !== 18))
            throw new Error('Invalid result region');
        const correlation = (v: unknown) => { const c = record(v); return { r: c.r === null ? null : finite(c.r, -1, 1), n: finite(c.n, 0, 1000) }; };
        const score = (v: unknown) => v === null ? null : finite(v, 0, 2000);
        const test: TestPoint[] = array(r.test).map(item => { const t = record(item); return { at: finite(t.at, 0), target: finite(t.target, 0, 2000), predicted: finite(t.predicted, 0, 2000), neso: finite(t.neso, 0, 2000), persistence: finite(t.persistence, 0, 2000) }; });
        if (test.length !== r.testN || test.length > 72)
            throw new Error('Invalid score sample count');
        return { id, name: text(r.name), training: finite(r.training, 1, 1000), testN: test.length, mae: score(r.mae), nesoMAE: score(r.nesoMAE), persistenceMAE: score(r.persistenceMAE), lambda: finite(r.lambda, .01, 1000), forecast: predictions(r.forecast), test, windShare: correlation(r.windShare), intensity: correlation(r.intensity), ...(r.model ? { model: model(r.model) } : {}) };
    });
    if (results.length > 15 || new Set(results.map(r => r.id)).size !== results.length)
        throw new Error('Invalid model result set');
    return results;
}
