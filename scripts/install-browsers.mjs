import { checkDisk } from './disk-guard.mjs';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Prefer the SDK's matching installed builds; a missing build is installed only in this repo.
const { browsers } = await import('./playwright.mjs');
const names = ['chromium', 'webkit', 'firefox'];
if (names.every((name) => existsSync(browsers[name].executablePath()))) {
  console.log('Matching browser builds already installed; no download.');
} else {
  await checkDisk(2 * 1024 ** 3);
  await mkdir('.cache/browser', { recursive: true });
  execFileSync(process.execPath, ['node_modules/playwright/cli.js', 'install', ...names], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TMPDIR: resolve('.cache/browser'),
      PLAYWRIGHT_BROWSERS_PATH: resolve('.cache/browsers'),
    },
  });
}
