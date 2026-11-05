const shotRoot =
  process.argv.find((a) => a.startsWith('--shots='))?.split('=')[1] ?? 'test-results';
if (!/^test-results(?:\/[A-Za-z0-9/_-]+)?$/.test(shotRoot))
  throw new Error('Invalid screenshot root');
import { referenceGPU } from './gpu-reference.mjs';
import { launch, session, archive } from './browser-kit.mjs';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { parseArchive } from '../src/data.ts';
import { buildTour } from '../src/presenter.ts';
import { readFileSync } from 'node:fs';
import { parseWeather } from '../src/weather.ts';
import { parseBoundaries } from '../src/geometry.ts';
import { areaWeather } from '../src/area-weather.ts';
import { weatherStories } from '../src/weather-stories.ts';
import { checkEvidence } from './evidence-check.mjs';
const only = process.argv.find((a) => a.startsWith('--browser='))?.split('=')[1];
if (only && !['chromium', 'webkit', 'firefox'].includes(only)) throw new Error('Unknown browser');
await mkdir(`${shotRoot}/browsers`, { recursive: true });
const model = parseArchive(archive, 'offline'),
  grid = parseWeather(JSON.parse(readFileSync('public/weather.json'))),
  weather = areaWeather(
    grid,
    parseBoundaries(JSON.parse(readFileSync('public/boundaries.json'))),
  ).rows;
const expectedModels = JSON.parse(readFileSync('public/model-recording.json')).results;
const report = {
  measuredAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(await readFile('node_modules/playwright/package.json', 'utf8')).version,
  },
  fixtureCapturedAt: archive.fetchedAt,
  method:
    'Silent sequential engines. Genuine API replay; browser worker fits compared with same-code recording. Date alone fixed; native timers unchanged. All engines use their normal graphics path; designed SVG and reduced-motion fallbacks are exercised separately.',
  browsers: [],
  jsGzipBytes: 0,
};
for (const f of await readdir('dist/src'))
  if (f.endsWith('.js')) report.jsGzipBytes += gzipSync(await readFile('dist/src/' + f)).length;
// ICU versions differ in spelling the same zero-offset London time.
const canonicalTimeLabel = (label) => label.replace(/\bGMT\+0\b/g, 'GMT');

function percentile(values, p) {
  const a = [...values].sort((a, b) => a - b);
  return a[Math.floor((a.length - 1) * p)] ?? null;
}

try {
  for (const name of only ? [only] : ['chromium', 'webkit', 'firefox']) {
    const b = await launch(name, { gpu: true }),
      result = { name, checks: [], views: [], errors: [], warnings: [] };
    report.browsers.push(result);
    try {
      for (const width of [1440, 390]) {
        const s = await session(b, { width, height: width === 1440 ? 900 : 844 }),
          p = s.page;
        const passed = (label) => result.checks.push(`${width}: ${label}`);
        await p.waitForFunction(
          () => window.gridWeatherMetrics.meaningfulMs !== null,
          {},
          { polling: 50 },
        );
        assert.equal(await p.locator('#map path[role="button"]').count(), 14);
        assert.equal(await p.locator('#outlook-list .outlook-row').count(), 14);
        passed('14 regions and 14 forecast sparklines');
        const rect = await p.locator('#controls').boundingBox();
        assert.ok(rect.y + rect.height <= (width === 1440 ? 900 : 844) + 1);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        passed('map, presenter and timeline fit first screen');
        if ((await p.locator('#tour-toggle').textContent()) === 'Pause tour')
          await p.locator('#tour-toggle').click();
        await p.waitForFunction(() => !!window.gridWeatherModel, {}, { timeout: 18000 });
        const expectedTour = [
          ...buildTour(model.frames, Date.parse(archive.fetchedAt)),
          ...weatherStories(model.frames, weather, Date.parse(archive.fetchedAt)),
        ].sort((a, b) => a.at - b.at);
        await p.waitForFunction(
          (n) => document.querySelector('#tour-label').textContent.endsWith(`of ${n}`),
          expectedTour.length,
        );
        const nation = expectedTour.findIndex((s) => s.kind === 'band' || s.kind === 'window');
        for (let i = 0; i < nation; i++) await p.locator('#tour-next').click();
        assert.equal(await p.locator('#sparkline').getAttribute('data-region'), '18');
        await p.locator('#now').click();
        assert.equal(
          await p.locator('#sparkline').getAttribute('data-region'),
          await p.locator('#region-select').inputValue(),
        );
        assert.notEqual(await p.locator('#station-name').textContent(), 'Great Britain');
        passed('leaving a national story restores the selected regional trace and readout');
        await p.locator('#tour-toggle').click();
        await p.locator('#tour-toggle').click();
        let windows = 0,
          slides = 0;
        for (let i = 0; i < expectedTour.length; i++) {
          const facts = await p.locator('#evidence [role="listitem"]').evaluateAll((es) =>
            es.map((e) => ({
              field: e.dataset.field,
              value: Number(e.dataset.value),
              at: Number(e.dataset.at),
              region: Number(e.dataset.region),
            })),
          );
          checkEvidence(model, facts);
          if (facts.some((f) => f.field === 'mean')) windows++;
          slides++;
          assert.equal(
            await p.locator('#engine').getAttribute('data-layer'),
            expectedTour[i].kind === 'weather-sun' ? 'sun' : 'wind',
          );
          assert.match(await p.locator('#frame-type').textContent(), /Forecast/);
          assert.equal(
            Date.parse(await p.locator('#frame-time').getAttribute('datetime')),
            expectedTour[i].at,
          );
          assert.equal(
            canonicalTimeLabel(await p.locator('#caption').textContent()),
            canonicalTimeLabel(expectedTour[i].caption),
          );
          assert.deepEqual(
            (
              await p
                .locator('#map path.presented')
                .evaluateAll((es) => es.map((e) => Number(e.dataset.id)))
            ).sort((a, b) => a - b),
            [...expectedTour[i].highlights].sort((a, b) => a - b),
          );
          assert.ok(
            !/spreads|sweeps|because|causes|flows/i.test(await p.locator('#caption').textContent()),
          );
          const at = Date.parse(await p.locator('#frame-time').getAttribute('datetime')),
            selected = await p.locator('#map path[aria-pressed="true"]').getAttribute('data-id'),
            frame = model.frames.find((f) => f.from === at),
            expected = ['band', 'window'].includes(expectedTour[i].kind)
              ? frame?.gb
              : frame?.regions.find((r) => r.id === Number(selected));
          assert.ok(expected);
          assert.equal(
            Number(await p.locator('#intensity').textContent()),
            Math.round(expected.intensity),
          );
          assert.equal(
            await p.locator('#sparkline').getAttribute('data-region'),
            String(expected.id),
          );
          assert.ok(
            (await p.locator('#scrubber').getAttribute('aria-valuetext')).includes(
              `${Math.round(expected.intensity)} grams`,
            ),
          );
          if (i === nation) {
            await p.locator('#scrubber').focus();
            assert.ok(
              (await p.locator('#time-tooltip').textContent()).includes(
                `GB · ${Math.round(expected.intensity)} g`,
              ),
            );
          }
          if (await p.locator('#tour-next').isDisabled()) break;
          await p.locator('#tour-next').click();
        }
        assert.ok(slides >= 8 && windows >= 1);
        passed(
          'entire presented forecast: source receipts, named-region highlights and synchronized map time',
        );
        if (width === 1440) {
          await p.locator('#tour-toggle').click();
          await p.waitForFunction(
            () => document.querySelector('#tour-label').textContent.includes('2 of'),
            {},
            { timeout: 8000 },
          );
          assert.equal(
            Date.parse(await p.locator('#frame-time').getAttribute('datetime')),
            expectedTour[1].at,
          );
          await p.locator('#tour-toggle').click();
          passed('automatic presenter advances map time to its next forecast stop');
        }
        await p.locator('#tour-toggle').click();
        await p.locator('#sources-open').click();
        assert.equal(await p.locator('#tour-toggle').textContent(), 'Play tour');
        const held = await p.locator('#tour-label').textContent();
        if (width === 1440) await p.waitForTimeout(5700);
        assert.equal(await p.locator('#tour-label').textContent(), held);
        await p.keyboard.press('Escape');
        await p.locator('#sources-dialog').waitFor({ state: 'hidden' });
        await p.waitForFunction(
          () => document.activeElement === document.querySelector('#sources-open'),
        );
        assert.equal(
          await p.locator('#sources-open').evaluate((e) => e === document.activeElement),
          true,
        );
        passed('source dialog pauses the tour and returns focus');
        await p.locator('#scrubber').focus();
        await p.keyboard.press('Home');
        assert.match(await p.locator('#frame-type').textContent(), /Historical estimate/);
        await p.keyboard.press('End');
        assert.match(await p.locator('#frame-type').textContent(), /Forecast/);
        const old = Date.parse(await p.locator('#frame-time').getAttribute('datetime'));
        await p.keyboard.press('ArrowLeft');
        assert.equal(
          Date.parse(await p.locator('#frame-time').getAttribute('datetime')),
          old - 1800000,
        );
        passed('keyboard scrubbing and history/forecast distinction');
        await p.locator('#map path[data-id="6"]').focus();
        await p.keyboard.press('Enter');
        if (width === 390) {
          await p.locator('#region-dialog').waitFor({ state: 'visible' });
          await p.locator('#details-close').click();
        }
        assert.match(await p.locator('#station-name').textContent(), /Wales/);
        assert.equal(await p.locator('#region-select').inputValue(), '6');
        passed('keyboard map selection and mobile details');
        await p.locator('#show-values').click();
        assert.equal(await p.locator('#map-labels text:visible').count(), 0);
        await p.locator('#show-values').click();
        assert.equal(await p.locator('#map-labels text:visible').count(), 14);
        passed('value labels toggle independently of region buttons');
        await p.locator('#accessible-regions summary').click();
        assert.equal(await p.locator('#region-table tr').count(), 14);
        await p.waitForFunction(
          () => document.querySelector('#region-table td').textContent !== '',
        );
        await p.locator('#accessible-regions summary').click();
        passed('accessible regional table');
        await p.locator('#outlook').scrollIntoViewIfNeeded();
        const outlook = await p.locator('.outlook-row').evaluateAll((rows) =>
          rows.map((row) => {
            const value = row.querySelector('.outlook-value'),
              g = row.querySelector('svg');
            return {
              text: value.textContent,
              nowrap: getComputedStyle(value).whiteSpace,
              fits: value.scrollWidth <= value.clientWidth + 1,
              height: value.getBoundingClientRect().height,
              font: parseFloat(getComputedStyle(value).fontSize),
              graph: g.getBoundingClientRect().toJSON(),
              scale: g.dataset.scaleMax,
              references: g.querySelectorAll('.outlook-reference').length,
            };
          }),
        );
        assert.ok(
          outlook.every(
            (r) =>
              /^\d+ g$/.test(r.text) &&
              r.nowrap === 'nowrap' &&
              r.fits &&
              r.height < r.font * 1.5 &&
              r.graph.width > 300 &&
              r.graph.height >= 70 &&
              r.references === 3,
          ),
        );
        assert.equal(new Set(outlook.map((r) => r.scale)).size, 1);
        passed(
          'whole-gram values never wrap; enlarged outlook charts share visible scale references',
        );
        const trained = await p.evaluate(() => ({
          ms: window.gridWeatherModel.milliseconds,
          results: window.gridWeatherModel.results.map((r) => ({
            id: r.id,
            mae: r.mae,
            neso: r.nesoMAE,
            n: r.testN,
            length: r.forecast.length,
          })),
        }));
        for (const f of trained.results) {
          const expected = expectedModels.find((e) => e.id === f.id);
          assert.ok(expected);
          assert.equal(f.n, expected.testN);
          assert.ok(Math.abs(f.mae - expected.mae) < 1e-7);
          assert.ok(Math.abs(f.neso - expected.nesoMAE) < 1e-7);
          assert.equal(f.length, 48);
        }
        assert.equal(trained.results.length, 15);
        passed('browser worker actually trains all 15 ridge models and reproduces held-out scores');
        await p.locator('#model-region').selectOption('18');
        await p.locator('#model-replay').click();
        assert.match(await p.locator('#score-target').textContent(), /national actual/);
        assert.equal(await p.locator('#model-plot .model-line').count(), 3);
        assert.equal(await p.locator('#wind-hypothesis').isDisabled(), true);
        await p.locator('#model-forward').click();
        assert.equal(await p.locator('#model-plot .model-line').count(), 2);
        const base = await p.locator('#model-plot .ridge').getAttribute('d');
        await p.locator('#wind-hypothesis').focus();
        await p.keyboard.press('Home');
        await p.waitForFunction(() =>
          document.querySelector('#hypothesis-value').textContent.includes('0.50'),
        );
        assert.notEqual(await p.locator('#model-plot .ridge').getAttribute('d'), base);
        assert.equal(await p.locator('#score-model').textContent(), '49.4');
        for (let k = 0; k < 10; k++) await p.keyboard.press('ArrowRight');
        await p.waitForFunction(
          () => document.querySelector('#hypothesis-value').textContent === 'Forecast weather',
        );
        assert.equal(await p.locator('#model-plot .ridge').getAttribute('d'), base);
        passed('hypothetical wind changes forward predictions, never NESO or measured scores');
        assert.equal(await p.locator('#correlation-rows tr').count(), 14);
        passed('14 measured regional correlations retain real sample counts and undefined cases');
        for (const layer of ['sun', 'carbon', 'wind']) {
          if (width === 390) await p.locator('#weather-layer').selectOption(layer);
          else await p.locator(`#layer-${layer}`).click();
          assert.equal(await p.locator('#engine').getAttribute('data-layer'), layer);
        }
        passed('wind, sunlight and carbon layers remain keyboard-native and usable');
        await p.locator('#controls').scrollIntoViewIfNeeded();
        await p.locator('#now').click();
        await p.waitForFunction(
          () => window.gridWeatherMetrics.graphics !== 'warming',
          {},
          { polling: 100, timeout: 12000 },
        );
        await p.locator('#play').click();
        await p.waitForTimeout(1000);
        await p.evaluate(() => {
          const m = window.gridWeatherMetrics;
          m.frameIntervals = [];
          m.paintIntervals = [];

          m.gpuIntervals.length = 0;
        });
        await p.waitForTimeout(6000);
        const perf = await p.evaluate(() => {
          const m = window.gridWeatherMetrics;
          return { ...m, frameIntervals: [...m.frameIntervals], gpuIntervals: [...m.gpuIntervals] };
        });
        await p.locator('#play').click();
        const navigation = await p.evaluate(() =>
          performance.getEntriesByType('navigation').map((e) => ({
            responseEnd: e.responseEnd,
            interactive: e.domInteractive,
            load: e.loadEventEnd,
          })),
        );
        const measurement = {
          width,
          navigation,
          meaningfulPaintMs: perf.meaningfulMs,
          renderer: perf.renderer,
          frameP50Ms: percentile(perf.frameIntervals, 0.5),
          frameP95Ms: percentile(perf.frameIntervals, 0.95),
          gpuPaintP95Ms: percentile(perf.gpuIntervals, 0.95),
          gpuWorkerP95Ms: percentile(perf.windGpuTimes, 0.95),
          particles: perf.windParticles,
          trainingMs: trained.ms,
          samples: perf.frameIntervals.length,
        };
        result.views.push(measurement);
        assert.ok(
          perf.meaningfulMs < 2000,
          `${name} ${width} meaningful paint ${perf.meaningfulMs}`,
        );
        assert.ok(
          measurement.frameP95Ms < 55,
          `${name} ${width} frame p95 ${measurement.frameP95Ms}`,
        );
        passed('measured meaningful paint <2s and heavy-loop p95 <55ms');
        const numericGPU = await referenceGPU(p);
        console.log('GPU reference', numericGPU);
        if (numericGPU.available) {
          assert.ok(Math.abs(numericGPU.midpoint[0] - 0.61) < 1e-6);
          assert.ok(Math.abs(numericGPU.midpoint[1] - 0.55) < 1e-6);
          assert.ok(Math.abs(numericGPU.constant[0] - 0.71) < 1e-6);
          assert.equal(numericGPU.error, 0);
        }
        result.gpuReference = numericGPU;
        passed(
          'GPU transform feedback reproduces physical units and midpoint integration where available',
        );
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({ path: `${shotRoot}/browsers/${name}-${width}.png` });
        result.errors.push(...s.errors);
        result.warnings.push(...s.warnings);
        await s.context.close();
        const reduced = await session(b, {
          width,
          height: width === 1440 ? 900 : 844,
          reduced: true,
        });
        assert.equal(await reduced.page.locator('#tour-toggle').textContent(), 'Play tour');
        await reduced.page.waitForFunction(
          () => window.gridWeatherMetrics.graphics !== 'warming',
          {},
          { polling: 100, timeout: 12000 },
        );
        const a = await reduced.page.locator('#map-wrap').screenshot();
        await reduced.page.waitForTimeout(250);
        const z = await reduced.page.locator('#map-wrap').screenshot();
        assert.ok(a.equals(z), 'Reduced-motion pixels must remain stable');
        await reduced.page.locator('#tour-next').click();
        assert.match(await reduced.page.locator('#tour-label').textContent(), /2 of/);
        result.checks.push(
          `${width}: reduced motion pauses auto-tour, freezes texture, and permits stepping`,
        );
        result.errors.push(...reduced.errors);
        result.warnings.push(...reduced.warnings);
        await reduced.context.close();
        const failure = await session(b, {
          width,
          height: width === 1440 ? 900 : 844,
          state: 'error',
        });
        assert.equal(await failure.page.locator('#engine').getAttribute('aria-busy'), 'false');
        assert.equal(await failure.page.locator('#tour-toggle').isDisabled(), true);
        assert.equal(await failure.page.locator('#intensity').textContent(), '—');
        result.checks.push(
          `${width}: fatal state ends loading, disables forecasts and offers retry`,
        );
        result.errors.push(...failure.errors);
        result.warnings.push(...failure.warnings);
        await failure.context.close();
        const fallback = await session(b, {
          width,
          height: width === 1440 ? 900 : 844,
          state: 'svg',
        });
        assert.match(
          await fallback.page.locator('#render-mode').textContent(),
          /SVG field fallback/,
        );
        assert.match(
          await fallback.page.locator('#map path').first().getAttribute('style'),
          /fill/,
        );
        result.checks.push(`${width}: explicit SVG fallback retains the forecast`);
        result.errors.push(...fallback.errors);
        result.warnings.push(...fallback.warnings);
        await fallback.context.close();
      }
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.warnings, []);
      console.log(name, result.checks.length, 'checks passed', result.views);
    } finally {
      await b.close();
    }
  }
} finally {
  await writeFile(
    only ? `${shotRoot}/browser-report-${only}.json` : `${shotRoot}/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
}
assert.ok(
  report.browsers.some((b) => b.views.some((v) => v.renderer === 'WebGL2')),
  'An accelerated graphics path must be exercised',
);
console.log('All browser checks passed. Gzipped JavaScript:', report.jsGzipBytes, 'bytes.');
