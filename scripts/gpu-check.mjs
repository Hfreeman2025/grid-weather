import { referenceGPU } from './gpu-reference.mjs';
import { launch, session } from './browser-kit.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const report = [];
try {
  for (const name of ['chromium', 'webkit', 'firefox']) {
    const b = await launch(name, {
      gpu: true,
      angle: name === 'chromium' && process.platform === 'darwin' ? 'metal' : null,
    });
    try {
      const s = await session(b);
      const result = await referenceGPU(s.page);
      console.log(name, result);
      assert.equal(result.available, true);
      assert.ok(Math.abs(result.midpoint[0] - 0.61) < 1e-6);
      assert.ok(Math.abs(result.midpoint[1] - 0.55) < 1e-6);
      assert.ok(Math.abs(result.constant[0] - 0.71) < 1e-6);
      assert.equal(result.error, 0);
      await s.page.waitForFunction(() => window.gridWeatherMetrics.graphics !== 'warming');
      report.push({ name, result, errors: s.errors, warnings: s.warnings });
      await s.context.close();
      assert.deepEqual(s.errors, []);
      assert.deepEqual(s.warnings, []);
    } finally {
      await b.close();
    }
  }
} finally {
  await writeFile('test-results/gpu-reference.json', JSON.stringify(report, null, 2));
}
