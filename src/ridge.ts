export interface Ridge {
    means: number[];
    scales: number[];
    coefficients: number[];
    intercept: number;
    lambda: number;
}
export function fitRidge(x: number[][], y: number[], lambda: number): Ridge {
    const p = x[0]?.length ?? 0, n = x.length;
    if (n < 2 || !p || p > 40 || y.length !== n || !Number.isFinite(lambda) || lambda <= 0 || y.some(v => !Number.isFinite(v)) || x.some(row => row.length !== p || row.some(v => !Number.isFinite(v))))
        throw new Error('Invalid ridge training data');
    const means = Array.from({ length: p }, (_, j) => x.reduce((s, row) => s + (row[j] ?? 0), 0) / n);
    const scales = means.map((mean, j) => Math.sqrt(x.reduce((s, row) => s + ((row[j] ?? 0) - mean) ** 2, 0) / n) || 1);
    const intercept = y.reduce((s, v) => s + v, 0) / n;
    const z = x.map(row => row.map((v, j) => (v - (means[j] ?? 0)) / (scales[j] ?? 1)));
    const a = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => z.reduce((s, row) => s + (row[i] ?? 0) * (row[j] ?? 0), 0) + (i === j ? lambda : 0)));
    const rhs = Array.from({ length: p }, (_, i) => z.reduce((s, row, k) => s + (row[i] ?? 0) * ((y[k] ?? 0) - intercept), 0));
    const l = Array.from({ length: p }, () => Array<number>(p).fill(0));
    for (let i = 0; i < p; i++)
        for (let j = 0; j <= i; j++) {
            let v = a[i]?.[j] ?? 0;
            for (let k = 0; k < j; k++)
                v -= (l[i]?.[k] ?? 0) * (l[j]?.[k] ?? 0);
            const row = l[i];
            if (!row)
                throw new Error('Invalid matrix');
            if (i === j) {
                if (v <= 0)
                    throw new Error('Ridge factorization failed');
                row[j] = Math.sqrt(v);
            }
            else
                row[j] = v / (l[j]?.[j] ?? 1);
        }
    const intermediate = Array<number>(p).fill(0), coefficients = Array<number>(p).fill(0);
    for (let i = 0; i < p; i++)
        intermediate[i] = ((rhs[i] ?? 0) - intermediate.slice(0, i).reduce((s, v, k) => s + v * (l[i]?.[k] ?? 0), 0)) / (l[i]?.[i] ?? 1);
    for (let i = p - 1; i >= 0; i--)
        coefficients[i] = ((intermediate[i] ?? 0) - coefficients.slice(i + 1).reduce((s, v, k) => s + v * (l[i + k + 1]?.[i] ?? 0), 0)) / (l[i]?.[i] ?? 1);
    return { means, scales, coefficients, intercept, lambda };
}
export function contributions(model: Ridge, x: number[]): number[] {
    if (x.length !== model.coefficients.length || x.some(v => !Number.isFinite(v)))
        throw new Error('Invalid ridge features');
    return x.map((v, i) => (v - (model.means[i] ?? 0)) / (model.scales[i] ?? 1) * (model.coefficients[i] ?? 0));
}
export function predictRidge(model: Ridge, x: number[]): number { return model.intercept + contributions(model, x).reduce((s, v) => s + v, 0); }
