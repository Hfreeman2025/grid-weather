import type { Dataset } from './data.ts';
import { interpolate } from './core.ts';
import { chartSeries } from './chart.ts';
import { html, svg } from './dom.ts';
import { shortWhen } from './format.ts';
export function showTimeTooltip(
  range: HTMLInputElement,
  data: Dataset | undefined,
  at: number,
  start: number,
  end: number,
  clientX?: number,
): void {
  if (!data) return;
  const box = range.getBoundingClientRect();
  const ratio =
    clientX === undefined
      ? (at - start) / (end - start)
      : Math.max(0, Math.min(1, (clientX - box.left) / box.width));
  const when = start + ratio * (end - start),
    id = Number(svg('sparkline').dataset.region);
  const r = interpolate(chartSeries(data.frames, id), when).find((r) => r.id === id),
    tip = html('time-tooltip');
  tip.textContent = `${shortWhen(when)} · ${id === 18 ? 'GB · ' : ''}${Math.round(r?.intensity ?? 0)} gCO₂/kWh`;
  tip.hidden = false;
  tip.style.left = `${Math.max(0, Math.min(box.width - tip.offsetWidth, ratio * box.width - tip.offsetWidth / 2))}px`;
}
