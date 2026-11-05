import { record, finite } from './core.ts';
import { parseExperiment } from './experiment.ts';
import { fitRegion, predictSequence } from './forecaster.ts';
import type { RegionFit } from './forecaster.ts';
import type { Experiment } from './experiment.ts';
let input: Experiment | undefined;
let fits: RegionFit[] = [];
globalThis.addEventListener('message', async (event: MessageEvent<unknown>) => {
  try {
    const m = record(event.data);
    if (m.kind === 'train') {
      input = parseExperiment(m.input);
      const began = performance.now();
      fits = [];
      for (const r of input.regions) {
        if (input.rows.filter((v) => v.id === r.id).length < 72) continue;
        fits.push(fitRegion(input, r.id));
        globalThis.postMessage(
          { kind: 'progress', done: fits.length, total: input.regions.length },
          {},
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      globalThis.postMessage({ kind: 'trained', results: fits, ms: performance.now() - began }, {});
    } else if (m.kind === 'hypothesis') {
      if (!input) throw new Error('Train before changing weather');
      const id = finite(m.id, 1, 18),
        scale = finite(m.scale, 0.25, 2),
        fit = fits.find((f) => f.id === id);
      if (!fit) throw new Error('No model for this region');
      const forecast = predictSequence(
        fit.model,
        input.forecastWeather.filter((f) => f.id === id),
        input.rows.filter((r) => r.id === id),
        scale,
      );
      globalThis.postMessage({ kind: 'hypothesis', id, scale, forecast }, {});
    }
  } catch (e) {
    globalThis.postMessage(
      { kind: 'error', message: e instanceof Error ? e.message : 'Model calculation failed' },
      {},
    );
  }
});
