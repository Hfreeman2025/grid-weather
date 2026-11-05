import type { WeatherGrid } from './weather.ts';
export interface WindRenderer {
  ready: boolean;
  failure: string;
  intervals: number[];
  gpuTimes: number[];
  count: number;
  update(field: number[], at: number): void;
  draw(seconds: number, paused: boolean, layer: string): void;
  dispose(): void;
}
export function makeWindRenderer(
  canvas: HTMLCanvasElement,
  map: HTMLElement,
  grid: WeatherGrid,
): WindRenderer | null {
  if (
    new URLSearchParams(location.search).has('svg') ||
    !canvas.transferControlToOffscreen ||
    typeof Worker === 'undefined'
  )
    return null;
  const count = matchMedia('(max-width:700px)').matches ? 32768 : 131072;
  const offscreen = canvas.transferControlToOffscreen(),
    worker = new Worker(new URL('./wind-worker.js', import.meta.url), { type: 'module' });
  let ready = false,
    painted = false,
    busy = false,
    failure = '',
    latest: Float32Array | undefined,
    lastAt = -1,
    reset = true,
    lastPaint = 0;
  const intervals: number[] = [],
    gpuTimes: number[] = [];
  const timer = setTimeout(() => {
    if (!painted) {
      failure = 'GPU wind startup timed out; sampled wind vectors remain';
      worker.terminate();
    }
  }, 10000);
  worker.addEventListener('message', (e: MessageEvent<unknown>) => {
    if (typeof e.data !== 'object' || !e.data || !('kind' in e.data)) return;
    if (e.data.kind === 'ready') ready = true;
    if (e.data.kind === 'painted') {
      clearTimeout(timer);
      painted = true;
      busy = false;
      const now = performance.now();
      if (lastPaint) intervals.push(now - lastPaint);
      lastPaint = now;
      if ('gpuMs' in e.data && typeof e.data.gpuMs === 'number') gpuTimes.push(e.data.gpuMs);
      if (intervals.length > 600) intervals.shift();
      if (gpuTimes.length > 600) gpuTimes.shift();
    }
    if (e.data.kind === 'unavailable') {
      clearTimeout(timer);
      failure =
        'reason' in e.data && typeof e.data.reason === 'string'
          ? e.data.reason
          : 'Wind graphics unavailable';
      worker.terminate();
    }
  });
  worker.addEventListener('error', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    failure = 'Wind worker unavailable; sampled vectors remain';
    worker.terminate();
  });
  worker.postMessage(
    {
      kind: 'init',
      canvas: offscreen,
      domain: { nx: grid.nx, ny: grid.ny, x0: grid.x0, y0: grid.y0, step: grid.step },
      count,
    },
    [offscreen],
  );
  return {
    get ready() {
      return painted && !failure;
    },
    get failure() {
      return failure;
    },
    count,
    intervals,
    gpuTimes,
    update(field, at) {
      if (at === lastAt) return;
      reset = Math.abs(at - lastAt) > 2 * 3600000;
      lastAt = at;
      latest = new Float32Array(grid.nx * grid.ny * 4);
      for (let i = 0; i < grid.nx * grid.ny; i++)
        latest.set(
          [
            field[i * 6 + 1] ?? 0,
            field[i * 6 + 2] ?? 0,
            field[i * 6 + 4] ?? 0,
            (field[i * 6 + 3] ?? 0) / 100,
          ],
          i * 4,
        );
    },
    draw(seconds, paused, layer) {
      if (!ready || busy || failure || (!latest && !painted)) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const box = parent.getBoundingClientRect(),
        land = map.getBoundingClientRect(),
        ratio = Math.min(devicePixelRatio || 1, 1.25),
        scale = (land.width / 690) * ratio;
      const field = latest;
      latest = undefined;
      busy = true;
      worker.postMessage(
        {
          kind: 'frame',
          width: Math.max(1, Math.round(box.width * ratio)),
          height: Math.max(1, Math.round(box.height * ratio)),
          camera: [
            (land.left - box.left) * ratio + 10 * scale,
            (land.top - box.top) * ratio + 1240 * scale,
            scale,
          ],
          seconds,
          paused,
          layer,
          reset,
          ...(field ? { field } : {}),
        },
        field ? [field.buffer] : [],
      );
      reset = false;
    },
    dispose() {
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
