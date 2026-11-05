import { launch, session } from './browser-kit.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results/model-fallback', { recursive: true });
const b = await launch('chromium', { gpu: true }),
  report = [];
try {
  for (const width of [1440, 390]) {
    const s = await session(b, { width, height: width === 1440 ? 900 : 844, state: 'model-error' }),
      p = s.page;
    await p.waitForFunction(() =>
      document.querySelector('#model-status').textContent.includes('Training unavailable'),
    );
    const provenance = await p.locator('#model-provenance').textContent(),
      caveat = await p.locator('#model-validation').textContent();
    assert.match(provenance, /2 Nov 2026 14:50 UTC/);
    assert.match(provenance, /1 Nov 2026 16:02 UTC/);
    assert.match(caveat, /48-hour seasonal persistence/);
    assert.match(caveat, /vintages were not preserved/);
    assert.equal(await p.locator('#wind-hypothesis').isDisabled(), true);
    const path = `test-results/model-fallback/${width}-model-error.png`;
    await p.locator('#model-lab').screenshot({ path });
    report.push({ width, path, provenance, caveat, errors: s.errors, warnings: s.warnings });
    await s.context.close();
    assert.deepEqual(s.errors, []);
    assert.deepEqual(s.warnings, []);
  }
  console.log('Recorded fallback provenance passed at both sizes.');
} finally {
  await b.close();
  await writeFile('test-results/model-fallback-report.json', JSON.stringify(report, null, 2));
}
