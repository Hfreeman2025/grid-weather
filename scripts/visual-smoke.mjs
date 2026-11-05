import { launch, session } from './browser-kit.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results/final-smoke', { recursive: true });
const report = [];
try {
  for (const name of ['chromium', 'webkit', 'firefox']) {
    const b = await launch(name, { gpu: true });
    try {
      for (const width of [1440, 390]) {
        const s = await session(b, { width, height: width === 1440 ? 900 : 844 }),
          p = s.page;
        await p.waitForFunction(
          () => window.gridWeatherMetrics.graphics === 'webgl' && !!window.gridWeatherModel,
        );
        if ((await p.locator('#tour-toggle').textContent()) === 'Pause tour')
          await p.locator('#tour-toggle').click();
        if (width === 390) await p.locator('#weather-layer').selectOption('sun');
        else await p.locator('#layer-sun').click();
        await p.waitForFunction(
          () =>
            document.querySelector('#wind-status').textContent === 'Surface sunlight field · GPU',
        );
        assert.equal(await p.locator('#render-mode').textContent(), 'Weather · WebGL2');
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.equal(
          Number(
            await p
              .locator('#map path')
              .first()
              .evaluate((e) => getComputedStyle(e).fillOpacity),
          ),
          0.65,
        );
        await p.screenshot({ path: `test-results/final-smoke/${name}-${width}-sun.png` });
        report.push({ name, width, state: 'sun', errors: s.errors, warnings: s.warnings });
        await s.context.close();
        assert.deepEqual(s.errors, []);
        assert.deepEqual(s.warnings, []);
        const f = await session(b, { width, height: width === 1440 ? 900 : 844, state: 'svg' });
        assert.equal(
          await f.page.locator('#render-mode').textContent(),
          'Weather · SVG field fallback',
        );
        report.push({ name, width, state: 'svg', errors: f.errors, warnings: f.warnings });
        await f.context.close();
        assert.deepEqual(f.errors, []);
        assert.deepEqual(f.warnings, []);
      }
    } finally {
      await b.close();
    }
  }
  console.log(
    'Final sunlight contrast/caption, browser training and SVG smoke passed in all3 engines, both sizes.',
  );
} finally {
  await writeFile('test-results/final-smoke/report.json', JSON.stringify(report, null, 2));
}
