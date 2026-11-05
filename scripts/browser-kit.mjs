import { execFileSync } from 'node:child_process';
import { weatherURLs } from '../src/meteo-api.ts';
import { checkDisk } from './disk-guard.mjs';
import { gunzipSync } from 'node:zlib';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { silenceLiveAudio } from './silent.mjs';
await mkdir('.cache/browser', { recursive: true });
for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = resolve('.cache/browser');
import { browsers } from './playwright.mjs';
export const archive = JSON.parse(await readFile('public/snapshot.json', 'utf8'));
export async function launch(
  name = 'chromium',
  { gpu = false, angle = gpu && process.platform === 'darwin' ? 'metal' : null } = {},
) {
  await checkDisk();
  const active = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) =>
      /\/(?:Google Chrome for Testing|firefox|MiniBrowser|Playwright|headless_shell)$/.test(line),
    );
  if (active.length)
    throw new Error('Browser slot occupied; no browser launched: ' + active.join(', '));
  if (!['chromium', 'webkit', 'firefox'].includes(name)) throw new Error('Unknown browser engine');
  const options = { headless: true, timeout: 30000, downloadsPath: resolve('.cache/browser') };
  // The full matching Chromium build supports the native Metal path on macOS.
  if (name === 'chromium') options.executablePath = browsers.chromium.executablePath();
  if (name === 'chromium')
    options.args = [
      '--mute-audio',
      ...(gpu ? [] : ['--disable-gpu']),
      ...(angle ? ['--use-gl=angle', '--use-angle=' + angle] : []),
    ];
  if (name === 'firefox') options.firefoxUserPrefs = { 'media.volume_scale': '0.0' };

  return browsers[name].launch(options);
}
export async function session(
  browser,
  {
    width = 1440,
    height = 900,
    state = 'replay',
    reduced = false,
    scale = 1,
    glOptions = null,
    initScript = null,
    fontWait = null,
    waitUntil = 'load',
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(silenceLiveAudio);
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  if (glOptions)
    await context.addInitScript((options) => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, config) {
        return original.call(this, type, type === 'webgl2' ? { ...config, ...options } : config);
      };
    }, glOptions);
  const errors = [],
    warnings = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await context.addInitScript(
    ({ frozen }) => {
      const OriginalDate = window.Date;
      window.Date = new Proxy(OriginalDate, {
        construct(target, args) {
          return Reflect.construct(target, args.length ? args : [frozen]);
        },
        get(target, key) {
          return key === 'now' ? () => frozen : Reflect.get(target, key);
        },
      });
    },
    { frozen: Date.parse(archive.fetchedAt) },
  );
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.hostname + url.pathname);
    if (url.hostname === '127.0.0.1') {
      if (fontWait && url.pathname.endsWith('.woff2')) await fontWait;
      if (
        state === 'loading' &&
        (url.pathname.endsWith('boundaries.json') || url.pathname.endsWith('snapshot.json'))
      )
        return new Promise(() => {});
      return route.continue();
    }
    if (url.hostname === 'api.open-meteo.com') {
      const i = weatherURLs().indexOf(url.href);
      if (i < 0) throw new Error('Unexpected weather coordinates');
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        body: gunzipSync(await readFile(`tests/fixtures/meteo/weather-${i * 8}.json.gz`)).toString(
          'utf8',
        ),
        contentType: 'application/json',
      });
    }
    if (url.hostname === 'api.carbonintensity.org.uk') {
      if (state === 'pending') return new Promise(() => {});
      if (state === 'empty')
        return route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: { data: [] },
        });
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json:
          url.pathname === '/regional'
            ? archive.current
            : url.pathname.includes('pt24h')
              ? archive.history
              : archive.forecast,
      });
    }
    errors.push('Unexpected network ' + url.origin);
    return route.abort();
  });
  if (state === 'slow-graphics')
    await context.addInitScript(() => {
      window.Worker = class {
        addEventListener() {}
        postMessage() {}
        terminate() {}
      };
    });
  if (['offline', 'error', 'weather-error', 'model-error', 'weather-pending'].includes(state))
    await context.addInitScript(
      ({ state }) => {
        const fetchOriginal = window.fetch;
        window.fetch = function (resource, options) {
          const u = String(resource);
          if (state === 'weather-pending' && u.includes('api.open-meteo.com'))
            return new Promise((resolve, reject) => {
              options?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Cancelled', 'AbortError')),
              );
            });
          if (state === 'weather-error' && u.includes('weather.json'))
            return Promise.reject(new TypeError('Weather data unavailable'));
          if (state === 'model-error' && u.includes('experiment.json'))
            return Promise.reject(new TypeError('Training inputs unavailable'));
          if (state === 'offline' && u.includes('api.carbonintensity'))
            return Promise.reject(new TypeError('Public API unavailable'));
          if (state === 'error' && u.includes('boundaries.json'))
            return Promise.reject(new TypeError('Saved map unavailable'));
          return fetchOriginal.call(this, resource, options);
        };
      },
      { state },
    );
  await page.goto('http://127.0.0.1:4173' + (state === 'svg' ? '?svg' : ''), { waitUntil });
  if (state === 'loading') await page.locator('#loading-screen').waitFor({ state: 'visible' });
  else if (state === 'error')
    await page.getByText('Regional data unavailable', { exact: true }).waitFor();
  else {
    await page.waitForFunction(
      () => document.querySelector('#engine').getAttribute('aria-busy') === 'false',
      {},
      { polling: 50 },
    );
    if (state !== 'pending')
      await page.waitForFunction(
        () => !document.querySelector('#refresh').disabled,
        {},
        { polling: 50 },
      );
  }
  return { context, page, errors, warnings, requests };
}
