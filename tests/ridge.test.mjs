import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRidge, predictRidge } from '../src/ridge.ts';
test('standardized ridge recovers the analytical regularized slope with an unpenalized intercept', () => {
  const m = fitRidge([[0], [1], [2]], [1, 3, 5], 3);
  assert.ok(Math.abs(m.intercept - 3) < 1e-12);
  assert.ok(Math.abs(predictRidge(m, [2]) - 4) < 1e-10);
  assert.ok(Math.abs(predictRidge(m, [0]) - 2) < 1e-10);
});
test('training-only scaling handles constant and collinear features without NaN', () => {
  const m = fitRidge(
    [
      [1, 4, 2],
      [2, 4, 4],
      [3, 4, 6],
    ],
    [2, 4, 6],
    0.1,
  );
  assert.ok(Number.isFinite(predictRidge(m, [4, 4, 8])));
  assert.equal(m.means[0], 2);
  assert.equal(m.means[1], 4);
  assert.equal(m.coefficients[1], 0);
  assert.ok(predictRidge(m, [4, 4, 8]) > 7.8);
});
test('invalid shapes, non-finite values and unregularized/small samples fail explicitly', () => {
  assert.throws(() => fitRidge([[1], [2]], [1], 1));
  assert.throws(() => fitRidge([[1], [2]], [1, 2], 0));
  assert.throws(() => fitRidge([[1], [NaN]], [1, 2], 1));
  assert.throws(() => predictRidge(fitRidge([[1], [2]], [1, 2], 1), [1, 2]));
});
