import { launch, session } from './browser-kit.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results/weather-states', { recursive: true });
const b = await launch('chromium', { gpu: true }),
  report = [];
try {
  for (const width of [1440, 390]) {
    const s = await session(b, { width, height: width === 1440 ? 900 : 844 });
    const p = s.page;
    await p.waitForFunction(() => !!window.gridWeatherModel);
    if ((await p.locator('#tour-toggle').textContent()) === 'Pause tour')
      await p.locator('#tour-toggle').click();
    await p.locator('#refresh-weather').click();
    await p.waitForFunction(
      () =>
        document
          .querySelector('#weather-network')
          .textContent.startsWith('Public weather refreshed'),
      {},
      { timeout: 15000 },
    );
    assert.equal(s.requests.filter((u) => u.startsWith('api.open-meteo.com')).length, 36);
    await p.locator('#refresh-weather').click();
    await p.waitForFunction(() =>
      document.querySelector('#weather-network').textContent.includes('no new source download'),
    );
    assert.equal(s.requests.filter((u) => u.startsWith('api.open-meteo.com')).length, 36);
    await p
      .locator('#weather-notes')
      .screenshot({ path: `test-results/weather-states/${width}-cache.png` });
    report.push({
      width,
      state: 'refresh-cache',
      requests: 36,
      status: await p.locator('#weather-network').textContent(),
      errors: s.errors,
      warnings: s.warnings,
    });
    await s.context.close();
    const c = await session(b, {
      width,
      height: width === 1440 ? 900 : 844,
      state: 'weather-pending',
    });
    await c.page.locator('#refresh-weather').click();
    await c.page.waitForFunction(
      () => document.querySelector('#refresh-weather').textContent === 'Cancel weather',
    );
    await c.page
      .locator('#weather-notes')
      .screenshot({ path: `test-results/weather-states/${width}-pending.png` });
    await c.page.locator('#refresh-weather').click();
    await c.page.waitForFunction(() =>
      document.querySelector('#weather-network').textContent.includes('cancelled'),
    );
    await c.page
      .locator('#weather-notes')
      .screenshot({ path: `test-results/weather-states/${width}-cancelled.png` });
    report.push({
      width,
      state: 'cancel',
      status: await c.page.locator('#weather-network').textContent(),
      errors: c.errors,
      warnings: c.warnings,
    });
    await c.context.close();
    const f = await session(b, {
      width,
      height: width === 1440 ? 900 : 844,
      state: 'weather-error',
    });
    await f.page.waitForFunction(() =>
      document
        .querySelector('#weather-source')
        .textContent.includes('interactive data unavailable'),
    );
    for (const layer of ['wind', 'sun', 'carbon']) {
      if (width === 390) await f.page.locator('#weather-layer').selectOption(layer);
      else await f.page.locator('#layer-' + layer).click();
      await f.page.waitForFunction(
        (expected) =>
          (getComputedStyle(document.querySelector('#recorded-wind')).display !== 'none') ===
          expected,
        layer === 'wind',
        { timeout: 1000 },
      );
    }
    report.push({ width, state: 'weather-failure', errors: f.errors, warnings: f.warnings });
    await f.context.close();
  }
  assert.ok(report.every((r) => r.errors.length === 0 && r.warnings.length === 0));
  console.log(
    'Weather refresh assembly, 30-minute cache, cancel and missing-source layer checks passed at both sizes.',
  );
} finally {
  await b.close();
  await writeFile('test-results/weather-states/report.json', JSON.stringify(report, null, 2));
}
