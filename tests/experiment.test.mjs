import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExperiment } from '../src/experiment.ts';
const raw = () => JSON.parse(readFileSync(new URL('../public/experiment.json', import.meta.url)));
test('validated experiments remain valid across the worker structured-clone boundary', () => {
  const once = parseExperiment(raw());
  assert.deepEqual(parseExperiment(structuredClone(once)), once);
});
