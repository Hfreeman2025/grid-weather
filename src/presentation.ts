import type { Dataset } from './data.ts';
import type { Region } from './core.ts';
import type { Stop, Evidence } from './presenter.ts';
import { html, button } from './dom.ts';
import { number, shortWhen } from './format.ts';
interface PresentationState {
  mode: 'manual' | 'presenter';
  looping: boolean;
  tour: Stop[];
  step: number;
  touring: boolean;
  regions: Region[];
  selected: number;
  at: number;
  data: Dataset | undefined;
}
function receipts(facts: Evidence[], unitText: string): void {
  const list = html('evidence');
  if (list.children.length !== facts.length) {
    list.replaceChildren();
    for (let i = 0; i < facts.length; i++) {
      const item = document.createElement('div');
      item.setAttribute('role', 'listitem');
      item.append(document.createElement('span'), document.createElement('strong'));
      list.append(item);
    }
  }
  list.style.setProperty('--facts', String(facts.length));
  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i],
      item = list.children[i];
    if (!fact || !(item instanceof HTMLElement)) continue;
    item.dataset.value = String(fact.value);
    item.dataset.at = String(fact.at);
    item.dataset.region = String(fact.region);
    item.dataset.field = fact.field;
    const label = item.querySelector('span'),
      value = item.querySelector('strong');
    if (label && label.textContent !== fact.label) label.textContent = fact.label;
    const printed = number(fact.value);
    if (value && value.textContent !== printed) value.textContent = printed;
  }
  html('evidence-unit').textContent = unitText;
}
export function renderPresentation(state: PresentationState): void {
  const { mode, looping, tour, step, touring, regions, selected, at, data } = state;
  html('presenter').dataset.mode = mode;
  html('caption').setAttribute('aria-live', looping ? 'off' : 'polite');
  if (mode === 'presenter' && tour[step]) {
    const stop = tour[step];
    if (!stop) return;
    html('tour-label').textContent = `Forecast tour · ${step + 1} of ${tour.length}`;
    html('caption').textContent = stop.caption;
    html('presenter').dataset.kind = stop.kind;
    receipts(stop.evidence, stop.units);
    button('tour-toggle').textContent = touring
      ? 'Pause tour'
      : step === tour.length - 1
        ? 'Replay tour'
        : 'Play tour';
  } else {
    const r = regions.find((r) => r.id === selected);
    html('presenter').dataset.kind = 'manual';
    html('tour-label').textContent = tour.length ? 'Manual view' : 'No upcoming forecast';
    button('tour-toggle').textContent = 'Present forecast';
    html('caption').textContent = r
      ? `${r.name}: ${number(r.intensity)} gCO₂/kWh at ${shortWhen(at)}.`
      : 'No regional values are available.';
    receipts(
      r
        ? [
            {
              label: r.name,
              value: r.intensity,
              unit: 'gCO₂/kWh',
              at,
              region: r.id,
              field: 'intensity',
            },
          ]
        : [],
      data?.mode === 'offline'
        ? 'gCO₂/kWh · saved regional estimate'
        : 'gCO₂/kWh · regional estimate',
    );
  }
  button('tour-prev').disabled = !tour.length || step === 0;
  button('tour-next').disabled = !tour.length || step === tour.length - 1;
  button('tour-toggle').disabled = !tour.length;
  button('presenter-start').disabled = !tour.length;
}
