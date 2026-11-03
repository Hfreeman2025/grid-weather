import { bestWindow, cssColour } from './core.ts';
import type { Frame, Region } from './core.ts';
import { html } from './dom.ts';
import { shortWhen, time } from './format.ts';
const WIDTH = 520, HEIGHT = 76;
export function linePath(frames: Frame[], id: number, from: number, to: number, max: number, width = 260, height = 48): string {
    let prior = -Infinity;
    const point = (at: number, value: number) => `${((at - from) / (to - from) * width).toFixed(2)},${(height - 3 - value / max * (height - 7)).toFixed(2)}`;
    const pieces = frames.flatMap(f => { const r = f.regions.find(r => r.id === id); if (!r)
        return []; const prefix = f.from === prior ? 'L' : 'M'; prior = f.to; return [`${prefix}${point(f.from, r.intensity)}`]; });
    const last = frames.at(-1), value = last?.regions.find(r => r.id === id);
    if (last && value && last.to <= to && last.to > last.from)
        pieces.push(`L${point(last.to, value.intensity)}`);
    return pieces.join(' ');
}
export function buildOutlook(frames: Frame[], after: number, onSelect: (id: number) => void): void {
    if (!visibility) {
        visibility = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible)
            updateOutlook(lastRegions, lastSelected, lastAt); });
        visibility.observe(html('outlook-list'));
    }
    const forecast = frames.filter(f => f.from >= after), first = forecast[0], last = forecast.at(-1), list = html('outlook-list');
    list.replaceChildren();
    html('outlook-empty').hidden = !!first;
    if (!first || !last) {
        html('outlook-range').textContent = 'No upcoming forecast';
        return;
    }
    const end = Math.max(first.from + 1, last.to), max = Math.ceil(Math.max(400, ...forecast.flatMap(f => f.regions.map(r => r.intensity))) / 100) * 100;
    html('outlook-range').textContent = `Forecast · ${shortWhen(first.from)} to ${shortWhen(last.to)} · shared scale 0–${max} gCO₂/kWh`;
    for (const r of first.regions) {
        const best = bestWindow(forecast, r.id, after), row = document.createElement('button');
        row.className = 'outlook-row';
        row.dataset.id = String(r.id);
        const name = document.createElement('strong');
        name.textContent = r.name;
        const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        graph.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
        graph.setAttribute('preserveAspectRatio', 'none');
        graph.dataset.scaleMax = String(max);
        graph.setAttribute('aria-hidden', 'true');
        const band = best ? `<rect class="outlook-window" x="${Math.max(0, (best.from - first.from) / (end - first.from) * WIDTH)}" width="${(best.to - best.from) / (end - first.from) * WIDTH}" y="0" height="${HEIGHT}"/>` : '';
        const grid = [0, max / 2, max].map(value => { const y = HEIGHT - 3 - value / max * (HEIGHT - 7); return `<line class="outlook-reference" x1="0" x2="${WIDTH}" y1="${y}" y2="${y}"/><text class="outlook-scale" x="${WIDTH - 3}" y="${Math.max(11, y - 4)}" text-anchor="end">${value}</text>`; }).join('');
        graph.innerHTML = `${grid}${band}<path d="${linePath(forecast, r.id, first.from, end, max, WIDTH, HEIGHT)}" fill="none" stroke="${cssColour(r.intensity)}" stroke-width="1.5" vector-effect="non-scaling-stroke"/><line class="outlook-cursor" x1="0" x2="0" y1="0" y2="${HEIGHT}"/>`;
        const detail = document.createElement('span');
        if (best) {
            const windowTime = document.createElement('span'), value = document.createElement('b');
            windowTime.textContent = `${shortWhen(best.from)}–${time(best.to)}`;
            value.className = 'outlook-value';
            value.textContent = `${Math.round(best.intensity)} g`;
            detail.append(windowTime, value);
        } else detail.textContent = 'No complete 2h window';
        row.setAttribute('aria-label', `${r.name}. ${best ? `Cleanest forecast: ${shortWhen(best.from)}, ${Math.round(best.intensity)} gCO₂ per kWh average, rounded to whole grams.` : 'No complete forecast window.'} Select region.`);
        row.append(name, graph, detail);
        row.addEventListener('click', () => onSelect(r.id));
        list.append(row);
    }
    list.dataset.from = String(first.from);
    list.dataset.to = String(end);
}
let visible = false, lastRegions: Region[] = [], lastSelected = 0, lastAt = 0;
let visibility: IntersectionObserver | undefined;
export function updateOutlook(regions: Region[], selected: number, at: number): void {
    lastRegions = regions;
    lastSelected = selected;
    lastAt = at;
    if (!visible)
        return;
    const list = html('outlook-list'), from = Number(list.dataset.from), to = Number(list.dataset.to), x = (at - from) / (to - from) * WIDTH;
    for (const row of list.querySelectorAll('button')) {
        row.classList.toggle('selected', Number(row.dataset.id) === selected);
        const r = regions.find(r => r.id === Number(row.dataset.id));
        row.style.setProperty('--regional-colour', r ? cssColour(r.intensity) : '#94b9b0');
        const cursor = row.querySelector('.outlook-cursor');
        if (cursor) {
            cursor.setAttribute('x1', String(x));
            cursor.setAttribute('x2', String(x));
            cursor.setAttribute('visibility', x >= 0 && x <= WIDTH ? 'visible' : 'hidden');
        }
    }
}
