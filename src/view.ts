import { cssColour } from './core.ts';
import type { Region } from './core.ts';
import type { Dataset } from './data.ts';
import type { Boundary } from './geometry.ts';
import { html, element, button, svg } from './dom.ts';
import { day, time, number, shortWhen, zone } from './format.ts';
import { windowComparison } from './insights.ts';
const FUELS = [['wind', 'Wind', '#7ebfaa'], ['nuclear', 'Nuclear', '#c6d1a7'], ['solar', 'Solar', '#efd06f'], ['hydro', 'Hydro', '#80bbc8'], ['gas', 'Gas', '#d48965'], ['imports', 'Imports', '#b6af9b'], ['biomass', 'Biomass', '#adb66e'], ['coal', 'Coal', '#727f80'], ['other', 'Other', '#9aa9a6']] as const;
function setText(node: Element, value: string): void { if (node.textContent !== value)
    node.textContent = value; }
export function createView(boundaries: Boundary[], choose: (id: number) => void, inspect: () => void) {
    const select = element('region-select', HTMLSelectElement), panel = html('region-panel'), dialog = element('region-dialog', HTMLDialogElement), dock = html('sidebar-dock'), mobile = matchMedia('(max-width:1000px)');
    let current: Region[] = [], reference = 0, values = true;
    const rows = new Map<number, {
        intensity: HTMLElement;
        renew: HTMLElement;
    }>(), percent = new Map<string, HTMLElement>(), bars = new Map<string, HTMLElement>();
    const move = () => { if (mobile.matches) {
        dialog.append(panel);
    }
    else {
        if (dialog.open)
            dialog.close();
        dock.append(panel);
    } };
    move();
    mobile.addEventListener('change', move);
    let returnFocus: HTMLElement | SVGElement = button('details-open');
    const open = () => { const active = document.activeElement; returnFocus = active instanceof SVGElement || (active instanceof HTMLButtonElement && active.classList.contains('outlook-row')) ? active : button('details-open'); inspect(); if (mobile.matches && !dialog.open) {
        if (returnFocus.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
        dialog.showModal();
    } };
    button('details-open').addEventListener('click', open);
    button('details-close').addEventListener('click', () => dialog.close());
    select.replaceChildren();
    for (const b of boundaries) {
        const option = document.createElement('option');
        option.value = String(b.id);
        option.textContent = b.name;
        select.append(option);
        const row = document.createElement('tr'), name = document.createElement('th'), a = document.createElement('td'), r = document.createElement('td'), cell = document.createElement('td'), control = document.createElement('button');
        name.scope = 'row';
        name.textContent = b.name;
        control.textContent = 'Select';
        control.setAttribute('aria-label', `Select ${b.name}`);
        control.addEventListener('click', () => { choose(b.id); open(); });
        cell.append(control);
        row.append(name, a, r, cell);
        html('region-table').append(row);
        rows.set(b.id, { intensity: a, renew: r });
    }
    for (const [fuel, label, color] of FUELS) {
        const bar = document.createElement('span');
        bar.style.background = color;
        bars.set(fuel, bar);
        html('mix-bar').append(bar);
        const item = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        item.className = 'mix-item';
        dt.textContent = label;
        dt.style.setProperty('--fuel', color);
        item.append(dt, dd);
        html('mix-list').append(item);
        percent.set(fuel, dd);
    }
    const labels = svg('map-labels');
    labels.replaceChildren();
    for (const b of boundaries) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(b.label[0]));
        text.setAttribute('y', String(b.label[1]));
        text.dataset.id = String(b.id);
        labels.append(text);
    }
    button('show-values').addEventListener('click', () => { values = !values; button('show-values').setAttribute('aria-pressed', String(values)); button('show-values').textContent = values ? 'Hide values' : 'Show values'; labels.classList.toggle('no-values', !values); });
    const scene = document.querySelector('.map-scene'), tip = html('map-tooltip');
    let tipId = 0;
    function showTip(id: number, x: number, y: number) { if (!(scene instanceof HTMLElement))
        return; const r = current.find(r => r.id === id); if (!r)
        return; tipId = id; tip.textContent = `${r.name}\n${Math.round(r.intensity)} gCO₂/kWh\n${number(r.mix.wind + r.mix.solar + r.mix.hydro)}% wind + solar + hydro`; tip.hidden = false; const rect = scene.getBoundingClientRect(); tip.style.left = `${Math.max(6, Math.min(rect.width - 218, x - rect.left + 12))}px`; tip.style.top = `${Math.max(6, Math.min(rect.height - 105, y - rect.top + 12))}px`; }
    for (const path of document.querySelectorAll('#map path')) {
        if (!(path instanceof SVGPathElement))
            continue;
        const id = Number(path.dataset.id);
        path.addEventListener('pointermove', e => { if (e.pointerType !== 'touch')
            showTip(id, e.clientX, e.clientY); });
        path.addEventListener('pointerleave', () => { tip.hidden = true; tipId = 0; });
        path.addEventListener('focus', () => { const b = boundaries.find(b => b.id === id); if (b) {
            const box = svg('map').getBoundingClientRect();
            showTip(id, box.left + b.label[0] / 690 * box.width, box.top + b.label[1] / 1260 * box.height);
        } });
        path.addEventListener('blur', () => { tip.hidden = true; tipId = 0; });
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape')
        tip.hidden = true; });
    function table() { for (const r of current) {
        const row = rows.get(r.id);
        if (row) {
            row.intensity.textContent = String(Math.round(r.intensity));
            row.renew.textContent = `${number(r.mix.wind + r.mix.solar + r.mix.hydro)}%`;
        }
    } }
    element('accessible-regions', HTMLDetailsElement).addEventListener('toggle', table);
    return { open, update(regions: Region[], selected: number, at: number, data: Dataset, presented: boolean, national = false) {
            current = regions;
            for (const r of regions) {
                const option = select.querySelector(`option[value="${r.id}"]`);
                if (option)
                    setText(option, r.name);
                const row = html('region-table').children[r.id - 1];
                const name = row?.querySelector('th');
                if (name)
                    setText(name, r.name);
            }
            reference = data.mode === 'offline' ? data.anchor : Date.now();
            const r = current.find(r => r.id === selected);
            if (!r)
                return;
            const display = national ? data.frames.find(f => f.from === at)?.gb ?? r : r;
            const phase = presented || at > reference + 60000 ? 'Forecast' : at < reference - 60000 ? 'Historical estimate' : 'Current estimate';
            setText(html('station-name'), display.id === 18 ? 'Great Britain' : display.name);
            setText(html('intensity'), String(Math.round(display.intensity)));
            html('intensity').style.color = cssColour(display.intensity);
            setText(html('intensity-description'), `${display.intensity < 100 ? 'Lower' : display.intensity < 200 ? 'Moderate' : display.intensity < 300 ? 'Higher' : 'Very high'} carbon`);
            setText(html('frame-type'), `${data.mode === 'offline' ? 'Saved · ' : ''}${phase}`);
            setText(html('frame-time'), `${day(at)} · ${time(at)} ${zone(at)}`);
            element('frame-time', HTMLTimeElement).dateTime = new Date(at).toISOString();
            html('map-wrap').classList.toggle('forecasting', phase === 'Forecast');
            setText(html('region-name'), r.name);
            if (select.value !== String(r.id))
                select.value = String(r.id);
            setText(html('mix-time'), shortWhen(at));
            for (const [fuel] of FUELS) {
                const b = bars.get(fuel), p = percent.get(fuel);
                if (b)
                    b.style.width = `${r.mix[fuel]}%`;
                if (p)
                    p.textContent = `${number(r.mix[fuel])}%`;
            }
            for (const label of labels.querySelectorAll('text')) {
                const value = regions.find(r => r.id === Number(label.dataset.id));
                if (value)
                    setText(label, String(Math.round(value.intensity)));
            }
            if (element('accessible-regions', HTMLDetailsElement).open)
                table();
            setText(html('table-caption'), `${phase}, ${shortWhen(at)}. gCO₂/kWh.${data.mode === 'offline' ? ' Saved data.' : ''}`);
            if (tipId) {
                const hovered = regions.find(r => r.id === tipId);
                if (hovered)
                    tip.textContent = `${hovered.name}\n${Math.round(hovered.intensity)} gCO₂/kWh\n${number(hovered.mix.wind + hovered.mix.solar + hovered.mix.hydro)}% wind + solar + hydro`;
            }
        }, best(data: Dataset, selected: number, now: number) {
            const c = windowComparison(data.frames, selected, now);
            button('jump-window').disabled = !c;
            if (!c) {
                setText(html('window-time'), 'Unavailable');
                setText(html('window-detail'), 'Four consecutive future intervals are needed.');
                setText(html('window-comparison'), '');
                return;
            }
            setText(html('window-heading'), data.mode === 'offline' ? 'Cleanest saved two hours' : 'Cleanest two hours ahead');
            setText(html('window-time'), `${time(c.window.from)}–${time(c.window.to)}`);
            setText(html('window-detail'), `${day(c.window.from)} · ${number(c.window.intensity)} gCO₂/kWh mean`);
            setText(html('window-comparison'), c.percentLower === null ? 'The reference estimate is already zero.' : `${number(Math.abs(c.percentLower))}% ${c.percentLower >= 0 ? 'lower' : 'higher'} intensity than ${data.mode === 'offline' ? 'the saved reference' : 'now'}.`);
        } };
}
