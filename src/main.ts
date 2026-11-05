import { metrics } from './metrics.ts';
import { renderPresentation } from './presentation.ts';
import { showTimeTooltip } from './time-tooltip.ts';
import { parseArchive, loadData } from './data.ts';
import type { Dataset } from './data.ts';
import { parseBoundaries } from './geometry.ts';
import type { Boundary } from './geometry.ts';
import { setupMap } from './renderer.ts';
import { createWeatherExperience } from './weather-experience.ts';
import { createModelView } from './model-view.ts';
import { interpolate, cssColour, HALF_HOUR, bestWindow } from './core.ts';
import type { Region } from './core.ts';
import { advanceTime } from './playback.ts';
import { buildTour } from './presenter.ts';
import type { Stop } from './presenter.ts';
import { createView } from './view.ts';
import { drawChart, chartCursor } from './chart.ts';
import { buildOutlook, updateOutlook } from './outlook.ts';
import { html, element, button, input, svg } from './dom.ts';
import { time, shortWhen, fullDate, zone } from './format.ts';
const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
  range = input('scrubber');
let data: Dataset | undefined,
  boundaries: Boundary[] = [],
  regions: Region[] = [],
  paths = new Map<number, SVGPathElement>(),
  weather: ReturnType<typeof createWeatherExperience> | undefined,
  modelView: ReturnType<typeof createModelView> | undefined,
  view: ReturnType<typeof createView> | undefined;
let selected = 12,
  at = 0,
  start = 0,
  end = 0,
  speed = 1,
  looping = false,
  mode: 'manual' | 'presenter' = 'presenter',
  tour: Stop[] = [],
  step = 0,
  touring = false,
  stepStarted = 0,
  lastTick = 0,
  lastPaint = 0,
  lastUI = 0,
  ready = false,
  pending = false,
  dirty = true;
const reference = () => (data?.mode === 'offline' ? data.anchor : Date.now());
function stopLoop(): void {
  looping = false;
  button('play').textContent = 'Play loop';
}
function manual(): void {
  mode = 'manual';
  touring = false;
  stopLoop();
  html('tour-progress').style.width = '0%';
}
function status(): void {
  if (!data) return;
  if (data.mode !== 'offline' && Date.now() - data.fetchedAt > 30 * 60000) {
    data.mode = 'offline';
    data.issue = 'The saved response is more than 30 minutes old.';
  }
  html('connection').textContent =
    data.mode === 'offline'
      ? `${pending ? 'Saved preview' : 'Offline · saved'} ${fullDate(data.fetchedAt)} ${time(data.fetchedAt)} ${zone(data.fetchedAt)}`
      : `Updated ${time(data.fetchedAt)} ${zone(data.fetchedAt)} · regional estimates`;
  html('connection').parentElement?.setAttribute('data-mode', data.mode);
  html('status-action').textContent = pending
    ? 'Checking the public NESO API'
    : 'NESO Carbon Intensity API · CC BY 4.0 · Supported by National Energy SO Open Data';
  html('source-detail').textContent =
    `${data.mode === 'offline' ? 'Saved data captured' : 'Response fetched'} ${fullDate(data.fetchedAt)}, ${time(data.fetchedAt)} ${zone(data.fetchedAt)}. Reference interval: ${shortWhen(data.anchor)}. ${data.frames.length} validated half-hours, 14 regions. ${data.mode === 'offline' ? 'All forecast captions and windows refer to that saved reference date.' : 'Forecasts are estimates and may change.'}`;
  html('source-issue').textContent = data.issue || 'No data-service issue reported.';
}
function caption(): void {
  renderPresentation({ mode, looping, tour, step, touring, regions, selected, at, data });
}
function paint(seconds: number): void {
  if (!data) return;
  const drawRegions = looping ? interpolate(data.frames, at) : regions;
  weather?.draw(seconds);
  metrics.graphics = weather?.ready ? 'webgl' : weather?.warming ? 'warming' : 'svg';
  metrics.renderer = weather?.ready ? 'WebGL2' : 'SVG';
  metrics.gpuIntervals = weather?.intervals ?? [];
  metrics.windParticles = weather?.count ?? 0;
  metrics.windGpuTimes = weather?.gpuTimes ?? [];
  html('render-mode').textContent = weather?.ready
    ? 'Weather · WebGL2'
    : weather?.warming
      ? 'Weather · GPU preparing'
      : 'Weather · SVG field fallback';
  for (const r of drawRegions) {
    const path = paths.get(r.id),
      colour = cssColour(r.intensity);
    if (path) {
      if (path.dataset.fill !== colour || !path.style.fill) {
        path.style.fill = colour;
        path.dataset.fill = colour;
      }
    }
  }
  dirty = false;
}
function update(rechart = false): void {
  if (!data) return;
  regions = interpolate(data.frames, at);
  const national =
    mode === 'presenter' && (tour[step]?.kind === 'band' || tour[step]?.kind === 'window');
  view?.update(regions, selected, at, data, mode === 'presenter', national);
  for (const r of regions) {
    const p = paths.get(r.id);
    if (!p) continue;
    p.classList.toggle('selected', r.id === selected);
    p.classList.toggle(
      'presented',
      mode === 'presenter' && !!tour[step]?.highlights.includes(r.id),
    );
    p.setAttribute('aria-pressed', String(r.id === selected));
    p.setAttribute(
      'aria-label',
      `${r.name}: ${Math.round(r.intensity)} grams CO₂ per kilowatt-hour. Select region.`,
    );
  }
  weather?.update(at, selected, regions, national);
  chartCursor(at, start, end);
  const displayed = national
    ? data.frames.find((f) => f.from === at)?.gb
    : regions.find((r) => r.id === selected);
  range.setAttribute(
    'aria-valuetext',
    `${shortWhen(at)}, ${national ? 'GB, ' : ''}${Math.round(displayed?.intensity ?? 0)} grams CO₂ per kWh${data.mode === 'offline' ? ', saved data' : ''}`,
  );
  updateOutlook(regions, selected, at);
  caption();
  if (rechart || svg('sparkline').dataset.region !== String(national ? 18 : selected)) {
    drawChart(
      data.frames,
      national ? 18 : selected,
      start,
      end,
      reference(),
      data.mode === 'offline',
    );
    view?.best(data, selected, reference());
  }
  dirty = true;
  paint(performance.now() / 1000);
}
function choose(id: number, open = false): void {
  manual();
  selected = id;
  update(true);
  if (open) view?.open();
}
function showStop(index: number, run = touring): void {
  const stop = tour[index];
  if (!stop) return;
  mode = 'presenter';
  stopLoop();
  step = index;
  selected = stop.region;
  at = stop.at;
  weather?.present(stop.kind);
  touring = run;
  stepStarted = performance.now();
  html('tour-progress').style.width = '0%';
  update(true);
}
function startTour(): void {
  if (!tour.length) return;
  showStop(0, true);
}
function jump(value: number): void {
  manual();
  at = Math.max(start, Math.min(end, value));
  update();
}
function configure(d: Dataset): void {
  const resume = ready ? touring : !reduced.matches;
  data = d;
  window.gridWeatherData = d;
  const first = d.frames[0],
    last = d.frames.at(-1);
  if (!first || !last) throw new Error('No regional intervals available');
  start = first.from;
  end = last.from;
  tour = [
    ...buildTour(d.frames, reference()),
    ...(weather?.stories(d.frames, reference()) ?? []),
  ].sort((a, b) => a.at - b.at);
  buildOutlook(d.frames, reference(), (id) => {
    choose(id, true);
    if (innerWidth > 1000) {
      html('engine').scrollIntoView();
      element('region-select', HTMLSelectElement).focus({ preventScroll: true });
    }
  });
  if (mode === 'presenter' && tour.length) {
    showStop(0, resume);
  } else {
    mode = 'manual';
    at = Math.max(start, Math.min(end, at || reference()));
    update(true);
  }
  status();
}
async function refresh(force = true): Promise<void> {
  if (!ready) {
    location.reload();
    return;
  }
  pending = true;
  button('refresh').disabled = true;
  status();
  try {
    configure(await loadData(force));
  } catch (e) {
    if (data) {
      data.mode = 'offline';
      data.issue = e instanceof Error ? e.message : 'Data unavailable';
    }
    status();
  } finally {
    pending = false;
    button('refresh').disabled = false;
    status();
  }
}
function tick(ms: number): void {
  const delta = lastTick ? Math.max(0, ms - lastTick) : 0;
  if ((looping || touring) && lastTick && !document.hidden) {
    metrics.frameIntervals.push(delta);
    if (metrics.frameIntervals.length > 600) metrics.frameIntervals.shift();
  }
  lastTick = ms;
  if (data && !document.hidden) {
    if (touring && ms - stepStarted >= 5500) {
      if (step < tour.length - 1) showStop(step + 1, true);
      else {
        touring = false;
        caption();
      }
    }
    if (touring)
      html('tour-progress').style.width = `${Math.min(100, ((ms - stepStarted) / 5500) * 100)}%`;
    if (looping) {
      if (reduced.matches) {
        if (ms - lastUI >= 750 / speed) {
          at = at + HALF_HOUR > end ? start : at + HALF_HOUR;
          update();
          lastUI = ms;
        }
      } else {
        at = advanceTime(at, delta, start, end, speed);
        if (ms - lastUI >= 80) {
          update();
          lastUI = ms;
        }
      }
    }
    if (
      weather &&
      ((weather.ready && metrics.graphics !== 'webgl') ||
        (weather.failure && metrics.graphics === 'warming'))
    )
      dirty = true;
    if (dirty || (!reduced.matches && ms - lastPaint >= 30)) {
      if (lastPaint) {
        metrics.paintIntervals.push(ms - lastPaint);
        if (metrics.paintIntervals.length > 600) metrics.paintIntervals.shift();
      }
      paint(ms / 1000);
      lastPaint = ms;
    }
  }
  requestAnimationFrame(tick);
}
function startGraphics(): void {
  void weather?.load();
  void modelView?.load();
  dirty = true;
}

async function init(): Promise<void> {
  try {
    const [g, s] = await Promise.all([fetch('./boundaries.json'), fetch('./snapshot.json')]);
    if (!g.ok || !s.ok) throw new Error('The saved map or regional data could not be loaded.');
    const geometry: unknown = await g.json(),
      snapshot: unknown = await s.json();
    boundaries = parseBoundaries(geometry);
    paths = setupMap(svg('map'), boundaries, (id) => {
      choose(id, true);
      if (innerWidth > 1000) {
        html('engine').scrollIntoView();
        element('region-select', HTMLSelectElement).focus({ preventScroll: true });
      }
    });
    view = createView(
      boundaries,
      (id) => {
        choose(id);
        if (innerWidth > 1000) {
          html('engine').scrollIntoView();
          element('region-select', HTMLSelectElement).focus({ preventScroll: true });
        }
      },
      () => {
        touring = false;
        stopLoop();
        update();
      },
    );
    let storiesLoaded = false;
    weather = createWeatherExperience(boundaries, () => {
      dirty = true;
      if (weather?.available && !storiesLoaded && data) {
        storiesLoaded = true;
        configure(data);
      }
    });
    modelView = createModelView();
    configure(parseArchive(snapshot, 'offline', 'Checking the public API.'));
    ready = true;
    for (const id of ['now', 'tomorrow', 'details-open', 'show-values'])
      button(id).disabled = false;
    element('region-select', HTMLSelectElement).disabled = false;
    pending = true;
    button('refresh').disabled = true;
    status();
    html('loading-screen').hidden = true;
    html('engine').setAttribute('aria-busy', 'false');
    button('play').disabled = false;
    range.disabled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        metrics.meaningfulMs = performance.now();
        performance.mark('grid-meaningful');
        setTimeout(() => {
          startGraphics();
          void refresh(false);
        }, 0);
      });
    });
    requestAnimationFrame(tick);
  } catch (e) {
    html('engine').setAttribute('aria-busy', 'false');
    html('source-detail').textContent =
      'No regional dataset is available in this view. No forecast values are shown.';
    html('loading-screen').replaceChildren();
    const title = document.createElement('strong'),
      detail = document.createElement('span'),
      retry = document.createElement('button');
    title.textContent = 'Regional data unavailable';
    detail.textContent = e instanceof Error ? e.message : 'Please retry.';
    retry.textContent = 'Retry loading';
    retry.addEventListener('click', () => location.reload());
    html('loading-screen').append(title, detail, retry);
    html('connection').textContent = 'Data unavailable · no values shown';
    html('status-action').textContent = 'Retry the saved data';
    html('source-issue').textContent = detail.textContent;
    html('caption').textContent =
      'The presentation needs validated regional data. Retry loading to continue.';
    html('tour-label').textContent = 'Data unavailable';
    html('evidence-unit').textContent = 'No values shown';
    for (const id of ['tour-prev', 'tour-next', 'tour-toggle']) button(id).disabled = true;
    button('play').disabled = true;
    button('presenter-start').disabled = true;
  }
}
button('presenter-start').addEventListener('click', startTour);
button('tour-toggle').addEventListener('click', () => {
  if (mode !== 'presenter' || step === tour.length - 1) {
    startTour();
    return;
  }
  touring = !touring;
  stepStarted = performance.now();
  caption();
});
button('tour-next').addEventListener('click', () =>
  showStop(Math.min(tour.length - 1, step + 1), false),
);
button('tour-prev').addEventListener('click', () => showStop(Math.max(0, step - 1), false));
function toggleLoop(): void {
  if (!data) return;
  if (looping) {
    stopLoop();
    update();
  } else {
    manual();
    looping = true;
    button('play').textContent = 'Pause loop';
    caption();
  }
}
button('play').disabled = true;
button('play').addEventListener('click', toggleLoop);
button('now').addEventListener('click', () => jump(reference()));
button('tomorrow').addEventListener('click', () => jump(reference() + 24 * 3600000));
range.addEventListener('input', () => {
  const value = Number(range.value);
  jump(start + value * (end - start));
});
range.addEventListener('keydown', (e) => {
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    jump(e.key === 'Home' ? start : end);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    jump(at + (e.key === 'ArrowLeft' ? -HALF_HOUR : HALF_HOUR));
  }
});
element('region-select', HTMLSelectElement).addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement) choose(Number(e.target.value));
});
element('speed', HTMLSelectElement).addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement) speed = Number(e.target.value);
});
button('jump-window').addEventListener('click', () => {
  if (data) {
    const best = bestWindow(data.frames, selected, reference());
    if (best) jump(best.from);
  }
});
button('refresh').addEventListener('click', () => {
  void refresh();
});
const sources = element('sources-dialog', HTMLDialogElement);
button('sources-open').addEventListener('click', () => {
  touring = false;
  stopLoop();
  update();
  button('sources-open').focus({ preventScroll: true });
  sources.showModal();
});
button('sources-close').addEventListener('click', () => sources.close());
function tooltip(clientX?: number): void {
  showTimeTooltip(range, data, at, start, end, clientX);
}
range.addEventListener('pointermove', (e) => tooltip(e.clientX));
range.addEventListener('pointerleave', () => {
  html('time-tooltip').hidden = true;
});
range.addEventListener('focus', () => tooltip());
range.addEventListener('blur', () => {
  html('time-tooltip').hidden = true;
});
range.addEventListener('keydown', () => {
  requestAnimationFrame(() => tooltip());
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.defaultPrevented && e.target === document.body) {
    e.preventDefault();
    toggleLoop();
  }
  if (e.key === 'Escape') html('time-tooltip').hidden = true;
});
reduced.addEventListener('change', () => {
  touring = false;
  stopLoop();
  update();
});
document.addEventListener('visibilitychange', () => {
  lastTick = 0;
  stepStarted = performance.now();
});
window.addEventListener('resize', () => {
  dirty = true;
});
setInterval(() => {
  if (data) {
    status();
    view?.best(data, selected, reference());
  }
}, 60000);
setInterval(() => {
  void refresh();
}, 15 * 60000);
void init();
