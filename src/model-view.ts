import { html, element, button, svg, input } from './dom.ts';
import { record, finite, text, timestamp } from './core.ts';
import { parseExperiment } from './experiment.ts';
import type { Experiment } from './experiment.ts';
import { parseResults } from './model-results.ts';
import type { VisibleFit } from './model-results.ts';
import { FEATURE_NAMES } from './forecaster.ts';
import { shortWhen, number, time, fullDate } from './format.ts';
import type { Dataset } from './data.ts';
declare global {
  interface Window {
    gridWeatherData?: Dataset;
    gridWeatherModel?: {
      milliseconds: number;
      results: VisibleFit[];
      mode: string;
    };
  }
}
const ns = 'http://www.w3.org/2000/svg';
function line(
  values: {
    at: number;
    value: number;
  }[],
  from: number,
  to: number,
  max: number,
  width = 1000,
): string {
  const left = width === 400 ? 35 : 52;
  return values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${(left + ((v.at - from) / (to - from)) * (width - left - 36)).toFixed(2)},${(226 - (v.value / max) * 192).toFixed(2)}`,
    )
    .join(' ');
}
export function createModelView() {
  let training = false;
  let trainingTimer: ReturnType<typeof setTimeout> | undefined;
  let fits: VisibleFit[] = [],
    experiment: Experiment | undefined,
    worker: Worker | undefined,
    selected = 18,
    replay = false,
    mode = 'Recorded calculation',
    trainMs = 0,
    hypothetical = 1;
  const select = element('model-region', HTMLSelectElement),
    plot = svg('model-plot');
  function draw() {
    const f = fits.find((r) => r.id === selected) ?? fits[0];
    if (!f) return;
    selected = f.id;
    select.value = String(selected);
    html('score-target').textContent =
      selected === 18
        ? 'Held-out target: NESO national actual intensity.'
        : 'Held-out target: NESO regional historical estimates. This is revision error, not measured emissions.';
    html('score-model').textContent = f.mae === null ? '—' : number(f.mae);
    html('score-neso').textContent = f.nesoMAE === null ? '—' : number(f.nesoMAE);
    html('score-persistence').textContent =
      f.persistenceMAE === null ? '—' : number(f.persistenceMAE);
    html('score-samples').textContent =
      `${f.testN} paired hours · MAE in gCO₂/kWh · same held-out times for all three`;
    html('model-status').textContent =
      `${mode}${trainMs ? ` · ${Math.round(trainMs)} ms` : ''} · λ ${f.lambda} · ${f.training} pre-issue training hours`;
    html('hypothesis-value').textContent = replay
      ? 'Held-out replay: inputs fixed'
      : hypothetical === 1
        ? 'Forecast weather'
        : `Hypothetical wind ×${hypothetical.toFixed(2)}`;
    const own = replay ? f.test.map((p) => ({ at: p.at, value: p.predicted })) : f.forecast;
    const neso = replay ? f.test.map((p) => ({ at: p.at, value: p.neso })) : [];
    if (!replay) {
      const current = window.gridWeatherData;
      for (const p of own) {
        const frame = current?.frames.find((t) => t.from === p.at),
          r = selected === 18 ? frame?.gb : frame?.regions.find((r) => r.id === selected);
        if (r) neso.push({ at: p.at, value: r.intensity });
      }
    }
    const actual = replay ? f.test.map((p) => ({ at: p.at, value: p.target })) : [];
    const first = own[0],
      last = own.at(-1),
      mobile = matchMedia('(max-width:700px)').matches,
      width = mobile ? 400 : 1000,
      left = mobile ? 35 : 52,
      right = width - 36;
    plot.setAttribute('viewBox', `0 0 ${width} 266`);
    plot.replaceChildren();
    html('actual-key').hidden = !replay;
    if (first && last) {
      const max = Math.max(100, ...[...own, ...neso, ...actual].map((v) => v.value)) * 1.1,
        from = first.at,
        to = Math.max(from + 3600000, last.at);
      for (const v of [0, max / 2, max]) {
        const y = 226 - (v / max) * 192,
          l = document.createElementNS(ns, 'line'),
          t = document.createElementNS(ns, 'text');
        l.setAttribute('x1', String(left));
        l.setAttribute('x2', String(right));
        l.setAttribute('y1', String(y));
        l.setAttribute('y2', String(y));
        l.setAttribute('class', 'model-grid');
        t.setAttribute('x', String(left - 10));
        t.setAttribute('y', String(y + 4));
        t.setAttribute('text-anchor', 'end');
        t.textContent = String(Math.round(v));
        plot.append(l, t);
      }
      for (const [values, kind] of [
        [neso, 'neso'],
        [actual, 'actual'],
        [own, 'ridge'],
      ] as const) {
        if (!values.length) continue;
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', line(values, from, to, max, width));
        p.setAttribute('class', `model-line ${kind}`);
        plot.append(p);
      }
      for (let i = 0; i <= 4; i++) {
        if (mobile && i % 2) continue;
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', String(left + (i * (right - left)) / 4));
        t.setAttribute('y', '252');
        t.setAttribute('text-anchor', i === 0 ? 'start' : i === 4 ? 'end' : 'middle');
        t.textContent = shortWhen(from + ((to - from) * i) / 4);
        plot.append(t);
      }
      html('model-range').textContent =
        `${replay ? 'Held-out replay' : 'Next available 48 hours'} · ${shortWhen(from)} to ${shortWhen(to)}${hypothetical !== 1 && !replay ? ' · hypothetical input' : ''}`;
    }
    input('wind-hypothesis').disabled = training || !f.model || replay;
    html('model-terms').replaceChildren();
    const terms = f.forecast[0]?.terms ?? [],
      largest = FEATURE_NAMES.map((name, i) => ({ name, value: terms[i] ?? 0 }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 5),
      range = Math.max(1, ...largest.map((t) => Math.abs(t.value)));
    for (const t of largest) {
      const row = document.createElement('div'),
        name = document.createElement('span'),
        bar = document.createElement('i'),
        value = document.createElement('b');
      name.textContent = t.name;
      bar.style.width = `${(Math.abs(t.value) / range) * 100}%`;
      bar.className = t.value < 0 ? 'negative' : 'positive';
      value.textContent = `${t.value >= 0 ? '+' : ''}${number(t.value)} g`;
      row.append(name, bar, value);
      html('model-terms').append(row);
    }
    html('terms-note').textContent =
      `First forecast hour: ${f.model ? `intercept ${number(f.model.intercept)} g; full linear sum ${number(f.model.intercept + terms.reduce((s, v) => s + v, 0))} g; displayed ${number(f.forecast[0]?.value ?? 0)} g (bounded 0–2000). ` : ''}Contributions are associations, not causal effects.${hypothetical !== 1 ? ' Hypothetical wind input; NESO is unchanged.' : ''}`;
  }
  function install(results: VisibleFit[]) {
    fits = results;
    select.replaceChildren();
    for (const f of fits) {
      const o = document.createElement('option');
      o.value = String(f.id);
      o.textContent = f.name;
      select.append(o);
    }
    if (!fits.some((f) => f.id === selected)) selected = fits[0]?.id ?? 1;
    draw();
    const tbody = html('correlation-rows');
    tbody.replaceChildren();
    for (const f of fits.filter((f) => f.id <= 14)) {
      const row = document.createElement('tr');
      for (const v of [
        f.name,
        f.windShare.r === null ? 'Undefined' : f.windShare.r.toFixed(2),
        f.intensity.r === null ? 'Undefined' : f.intensity.r.toFixed(2),
        String(f.windShare.n),
      ]) {
        const td = document.createElement('td');
        td.textContent = v;
        row.append(td);
      }
      tbody.append(row);
    }
  }
  async function train() {
    button('train-model').disabled = true;
    training = true;
    input('wind-hypothesis').disabled = true;
    html('model-status').textContent = 'Loading dated public training inputs…';
    try {
      if (!experiment) {
        const r = await fetch('./experiment.json', { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error('Recorded training data unavailable');
        const v: unknown = await r.json();
        experiment = parseExperiment(v);
        html('model-provenance').textContent =
          `Source capture ${fullDate(Date.parse(experiment.capturedAt))} · ${time(Date.parse(experiment.capturedAt))} UTC. NESO comparison frozen ${shortWhen(experiment.cutoff)}. Training ends two hours before issue.`;
        html('model-validation').textContent =
          `Backtest weather: ${experiment.backtestWeather}. Forward forecasts use current weather in this source capture. Training data vintages were not preserved; this is a retrospective holdout, not an operational accuracy guarantee.`;
      }
      if (trainingTimer) clearTimeout(trainingTimer);
      worker?.terminate();
      worker = new Worker(new URL('./model-worker.js', import.meta.url), { type: 'module' });
      trainingTimer = setTimeout(() => {
        worker?.terminate();
        training = false;
        html('model-status').textContent =
          'Browser training timed out; recorded calculation retained.';
        button('train-model').disabled = false;
      }, 15000);
      worker.addEventListener('error', (e) => {
        e.preventDefault();
        if (trainingTimer) clearTimeout(trainingTimer);
        training = false;
        html('model-status').textContent =
          'Browser training unavailable; recorded calculation retained.';
        button('train-model').disabled = false;
      });
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        try {
          const m = record(event.data);
          if (m.kind === 'progress')
            html('model-status').textContent =
              `Training here · ${finite(m.done, 0, 15)} / ${finite(m.total, 1, 15)} regional ridge fits`;
          if (m.kind === 'trained') {
            if (trainingTimer) clearTimeout(trainingTimer);
            const results = parseResults(m.results);
            trainMs = finite(m.ms, 0);
            training = false;
            hypothetical = 1;
            input('wind-hypothesis').value = '1';
            mode = 'Trained in this browser on dated public inputs';
            install(results);
            button('train-model').disabled = false;
            button('train-model').textContent = 'Train again';
            window.gridWeatherModel = { milliseconds: trainMs, results: fits, mode };
          }
          if (m.kind === 'error') {
            if (trainingTimer) clearTimeout(trainingTimer);
            training = false;
            html('model-status').textContent =
              `Training failed: ${text(m.message)}. Recorded calculation retained.`;
            button('train-model').disabled = false;
          }
          if (m.kind === 'hypothesis') {
            const id = finite(m.id, 1, 18),
              f = fits.find((f) => f.id === id);
            if (!f || id !== selected) return;
            const checked = parseResults([{ ...f, forecast: m.forecast }])[0];
            if (checked) {
              f.forecast = checked.forecast;
              hypothetical = finite(m.scale, 0.25, 2);
              draw();
            }
          }
        } catch (e) {
          training = false;
          if (trainingTimer) clearTimeout(trainingTimer);
          html('model-status').textContent =
            `Model result rejected: ${e instanceof Error ? e.message : 'invalid output'}`;
          button('train-model').disabled = false;
        }
      });
      worker.postMessage({ kind: 'train', input: experiment });
    } catch (e) {
      training = false;
      html('model-status').textContent =
        `Training unavailable: ${e instanceof Error ? e.message : 'public inputs unavailable'}.`;
      button('train-model').disabled = false;
    }
  }
  select.addEventListener('change', () => {
    selected = Number(select.value);
    hypothetical = 1;
    input('wind-hypothesis').value = '1';
    draw();
    worker?.postMessage({ kind: 'hypothesis', id: selected, scale: 1 });
  });
  button('train-model').addEventListener('click', () => {
    void train();
  });
  button('model-forward').addEventListener('click', () => {
    replay = false;
    button('model-forward').setAttribute('aria-pressed', 'true');
    button('model-replay').setAttribute('aria-pressed', 'false');
    draw();
  });
  button('model-replay').addEventListener('click', () => {
    replay = true;
    button('model-forward').setAttribute('aria-pressed', 'false');
    button('model-replay').setAttribute('aria-pressed', 'true');
    draw();
  });
  input('wind-hypothesis').addEventListener('input', () => {
    hypothetical = Number(input('wind-hypothesis').value);
    worker?.postMessage({ kind: 'hypothesis', id: selected, scale: hypothetical });
  });
  return {
    async load() {
      try {
        const r = await fetch('./model-recording.json', { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error('Recorded result unavailable');
        const raw: unknown = await r.json(),
          a = record(raw);
        const captured = timestamp(a.sourceCapturedAt),
          issued = timestamp(a.comparisonIssuedAt),
          weatherNote = text(a.backtestWeather),
          results = parseResults(a.results);
        install(results);
        html('model-provenance').textContent =
          `Recorded source capture ${fullDate(captured)} ${time(captured)} UTC. NESO comparison frozen ${fullDate(issued)} ${time(issued)} UTC.`;
        html('model-validation').textContent =
          `Backtest weather: ${weatherNote}. Historical training-data vintages were not preserved; this is a retrospective holdout, not an operational accuracy guarantee.`;
        html('model-status').textContent =
          `Recorded calculation · source ${text(a.sourceCapturedAt)}`;
      } catch (e) {
        html('model-status').textContent =
          `No recorded result: ${e instanceof Error ? e.message : 'unavailable'}`;
      }
      await train();
    },
    select(id: number) {
      selected = id;
      draw();
    },
  };
}
