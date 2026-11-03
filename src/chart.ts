import { bestWindow } from './core.ts';
import type { Frame } from './core.ts';
import { html, input, svg } from './dom.ts';
import { shortWhen } from './format.ts';
import { linePath } from './outlook.ts';
export function chartSeries(frames: Frame[], selected: number): Frame[] {
    return selected === 18 ? frames.map(f => ({ ...f, regions: f.gb ? [f.gb] : [] })) : frames;
}
export function drawChart(frames: Frame[], selected: number, start: number, end: number, reference: number, saved: boolean): void {
    frames = chartSeries(frames, selected);
    svg('sparkline').dataset.region = String(selected);
    html('timeline-description').textContent = `${selected === 18 ? 'GB' : 'Regional'} intensity · 24 hours back · up to 48 hours ahead`;
    const maximum = Math.max(400, ...frames.map(f => f.regions.find(r => r.id === selected)?.intensity ?? 0)), now = Math.max(0, Math.min(1000, (reference - start) / (end - start) * 1000));
    const path = linePath(frames, selected, start, end, maximum, 1000, 60);
    svg('sparkline').innerHTML = `<defs><pattern id="future-lines" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 8L8 0M6 10L10 6" stroke="#91b7b3" stroke-opacity=".45" stroke-width=".7"/></pattern></defs><path d="${path} L1000,60 L0,60Z" fill="#25565c"/><rect x="${now}" y="0" width="${1000 - now}" height="60" fill="url(#future-lines)"/><path d="${path}" fill="none" stroke="#c0e5cc" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    html('now-marker').style.left = `${now / 10}%`;
    html('now-marker').querySelector('span')?.replaceChildren(saved ? 'Saved now' : 'Now');
    const best = bestWindow(frames, selected, reference), band = html('window-band');
    band.hidden = !best;
    if (best) {
        const left = (best.from - start) / (end - start), right = Math.min(1, (best.to - start) / (end - start));
        band.style.left = `${left * 100}%`;
        band.style.width = `${(right - left) * 100}%`;
    }
    html('ticks').replaceChildren();
    for (let i = 0; i <= 4; i++) {
        const tick = document.createElement('span');
        tick.textContent = shortWhen(start + (end - start) * i / 4);
        html('ticks').append(tick);
    }
    input('scrubber').disabled = false;
}
export function chartCursor(at: number, start: number, end: number): void { const ratio = (at - start) / (end - start); input('scrubber').value = String(ratio); html('cursor').style.left = `${ratio * 100}%`; }
