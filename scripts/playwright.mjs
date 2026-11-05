import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Use repo-local builds when installed here; otherwise let the SDK resolve its normal cache.
if (
  existsSync('.cache/browsers') &&
  (await readdir('.cache/browsers')).some((name) => /^(chromium|firefox|webkit)-/.test(name))
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.cache/browsers');
}
export const browsers = await import('playwright');
