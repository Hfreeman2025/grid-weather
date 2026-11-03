import { html, element, button, svg } from './dom.ts';
import type { Boundary } from './geometry.ts';
import type { Region } from './core.ts';
import { parseWeather, weatherAt } from './weather.ts';
import type { WeatherGrid } from './weather.ts';
import { makeWindRenderer } from './wind-renderer.ts';
import type { WindRenderer } from './wind-renderer.ts';
import { fetchWeather } from './meteo-api.ts';
import { fullDate, time, number } from './format.ts';
import { areaWeather } from './area-weather.ts';
import { weatherStories, regionalAt } from './weather-stories.ts';
import type { RegionalWeather } from './weather.ts';
import type { Frame } from './core.ts';
import { bngToWgs84 } from './projection.ts';
const ns = 'http://www.w3.org/2000/svg';
export function createWeatherExperience(boundaries: Boundary[], changed: () => void) {
    let grid: WeatherGrid | undefined, renderer: WindRenderer | null = null, layer = 'wind', at = 0, selected = 1, national = false, areaRows: RegionalWeather[] = [], current: Region[] = [], lastField: number[] | null = null, controller: AbortController | undefined, pending = false, live = false, lastVectors = -1;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)'), scene = html('engine'), map = html('map-wrap');
    let canvas = element('wind-canvas', HTMLCanvasElement);
    function vectorField(field: number[]) {
        const target = svg('wind-vectors');
        target.replaceChildren();
        if (!grid)
            return;
        if (layer === 'sun') {
            for (let y = 0; y < grid.ny - 1; y++)
                for (let x = 0; x < grid.nx - 1; x++) {
                    const nodes = [y * grid.nx + x, y * grid.nx + x + 1, (y + 1) * grid.nx + x, (y + 1) * grid.nx + x + 1], sun = nodes.reduce((s, i) => s + (field[i * 6 + 4] ?? 0), 0) / 4, t = Math.sqrt(Math.min(1, sun / 800)), r = document.createElementNS(ns, 'rect');
                    r.setAttribute('x', String(grid.x0 + x * grid.step + 10));
                    r.setAttribute('y', String(1240 - grid.y0 - (y + 1) * grid.step));
                    r.setAttribute('width', String(grid.step));
                    r.setAttribute('height', String(grid.step));
                    r.setAttribute('fill', `rgb(${Math.round(8 + 234 * t)} ${Math.round(28 + 148 * t)} ${Math.round(38 + 38 * t)})`);
                    r.setAttribute('opacity', '.85');
                    target.append(r);
                }
            return;
        }
        for (let y = 1; y < grid.ny - 1; y += 2)
            for (let x = 1; x < grid.nx - 1; x += 2) {
                const i = y * grid.nx + x, u = field[i * 6 + 1] ?? 0, v = field[i * 6 + 2] ?? 0, speed = field[i * 6] ?? 0, px = grid.x0 + x * grid.step + 10, py = 1240 - grid.y0 - y * grid.step, length = 12 + Math.min(speed, 25) * 1.8, d = Math.hypot(u, v) || 1, dx = u / d * length, dy = -v / d * length, p = document.createElementNS(ns, 'path');
                p.setAttribute('d', `M${px - dx / 2},${py - dy / 2}l${dx},${dy}m${-dx * .24 + dy * .2},${-dy * .24 - dx * .2}l${dx * .24 - dy * .2},${dy * .24 + dx * .2}l${-dx * .24 - dy * .2},${-dy * .24 + dx * .2}`);
                p.setAttribute('class', speed > 15 ? 'wind-fast' : 'wind-vector');
                target.append(p);
            }
    }
    function update() {
        if (!grid) {
            html('weather-reading-label').textContent = layer === 'sun' ? 'Surface sunlight' : '100 m wind';
            html('weather-reading').textContent = layer === 'sun' ? 'Sunlight data unavailable' : 'Recorded wind replay';
            return;
        }
        const field = weatherAt(grid, at);
        lastField = field;
        if (!field) {
            html('weather-reading').textContent = 'No weather field at this time';
            html('weather-caption').textContent = 'Weather source does not cover this interval.';
            return;
        }
        renderer?.update(field, at);
        if (Math.abs(at - lastVectors) >= 30 * 60000 || lastVectors < 0) {
            vectorField(field);
            lastVectors = at;
        }
        const b = boundaries.find(b => b.id === selected), sample = regionalAt(areaRows, at, national ? 18 : selected);
        if (sample && b) {
            const r = current.find(r => r.id === selected), speed = sample[0] ?? 0, ll = bngToWgs84((b.label[0] - 10) * 1000, (1240 - b.label[1]) * 1000), gamma = (ll[1] + 2) * Math.PI / 180 * Math.sin(ll[0] * Math.PI / 180), east = (sample[1] ?? 0) * Math.cos(gamma) + (sample[2] ?? 0) * Math.sin(gamma), north = -(sample[1] ?? 0) * Math.sin(gamma) + (sample[2] ?? 0) * Math.cos(gamma), windFrom = (Math.atan2(-east, -north) * 180 / Math.PI + 360) % 360, sectors = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'], direction = sectors[Math.round(windFrom / 22.5) % 16];
            html('weather-reading-label').textContent = layer === 'sun' ? 'Surface sunlight · area mean' : '100 m wind · area mean';
            html('weather-reading').textContent = layer === 'sun' ? `${Math.round(sample[4] ?? 0)} W/m² · ${Math.round(sample[3] ?? 0)}% cloud` : `${direction} ${number(speed)} m/s`;
            html('weather-caption').textContent = `${national ? 'GB land mean' : r?.name ?? 'Regional mean'}: ${direction} ${number(speed)} m/s at 100 m · sunlight ${Math.round(sample[4] ?? 0)} W/m². Area mean.`;
        }
        html('weather-source').textContent = `${live ? 'Refreshed' : 'Recorded'} ${fullDate(grid.capturedAt)} ${time(grid.capturedAt)} UTC · ECMWF IFS · 100 m`;
    }
    function setLayer(next: string) {
        layer = next;
        lastVectors = -1;
        scene.dataset.layer = layer;
        element('weather-layer', HTMLSelectElement).value = layer;
        for (const name of ['wind', 'sun', 'carbon'])
            button(`layer-${name}`).setAttribute('aria-pressed', String(layer === name));
        html('weather-key').hidden = layer === 'carbon';
        html('weather-key-label').textContent = layer === 'sun' ? 'Sunlight · W/m²' : '100 m wind · m/s';
        html('weather-key-high').textContent = layer === 'sun' ? '800+' : '25+';
        html('weather-legend').textContent = layer === 'sun' ? 'Surface sunlight · 0–800+ W/m²' : layer === 'carbon' ? 'Carbon only · gCO₂/kWh' : 'Wind colour · 0–25+ m/s · 1 second = 20 minutes';
        update();
        changed();
    }
    async function install(value: WeatherGrid, isLive: boolean) {
        grid = value;
        live = isLive;
        const averaged = areaWeather(grid, boundaries), total = Object.values(averaged.cells).reduce((s, n) => s + n, 0);
        areaRows = averaged.rows.map(row => ({ ...row, regions: [...row.regions, { id: 18, values: Array.from({ length: 6 }, (_, j) => row.regions.reduce((s, r) => s + (r.values[j] ?? 0) * (averaged.cells[r.id] ?? 0) / total, 0)) }] }));
        if (renderer) {
            renderer.dispose();
            const replacement = document.createElement('canvas');
            replacement.id = 'wind-canvas';
            replacement.setAttribute('aria-hidden', 'true');
            canvas.replaceWith(replacement);
            canvas = replacement;
        }
        try {
            renderer = reduced.matches ? null : makeWindRenderer(canvas, map, grid);
        }
        catch (e) {
            renderer = null;
            html('wind-status').textContent = `Sampled vectors · ${e instanceof Error ? e.message : 'GPU unavailable'}`;
        }
        update();
        changed();
    }
    async function cachedWeather(): Promise<WeatherGrid | undefined> {
        try {
            const cache = await caches.open('grid-weather-meteo-v3'), response = await cache.match('./weather-cache');
            if (response) {
                const raw: unknown = await response.json(), parsed = parseWeather(raw), age = Date.now() - parsed.capturedAt;
                if (age >= -60000 && age < 30 * 60000)
                    return parsed;
            }
        }
        catch (e) {
            html('weather-network').textContent = `Weather cache unavailable: ${e instanceof Error ? e.message : 'storage denied'}`;
        }
        return undefined;
    }
    async function refresh() {
        if (pending) {
            controller?.abort();
            return;
        }
        pending = true;
        controller = new AbortController();
        button('refresh-weather').textContent = 'Cancel weather';
        html('weather-network').textContent = 'Requesting 288 grid points · approximately 3 MB · source cached for 30 minutes';
        try {
            const stored = await cachedWeather();
            if (stored) {
                await install(stored, true);
                html('weather-network').textContent = 'Using validated weather cache (30 minutes); no new source download.';
                return;
            }
            const response = await fetch(location.href, { method: 'HEAD' }), csp = response.headers.get('content-security-policy') ?? '';
            if (csp && !csp.includes('api.open-meteo.com'))
                throw new Error('This preview’s security policy has not enabled the weather source yet');
            const data = await fetchWeather(controller.signal, (done, total) => { html('weather-network').textContent = `Downloading weather · ${done}/${total} batches`; });
            let cacheIssue = '';
            try {
                const cache = await caches.open('grid-weather-meteo-v3');
                await cache.put('./weather-cache', new Response(JSON.stringify({ ...data, capturedAt: new Date(data.capturedAt).toISOString() })));
            }
            catch (e) {
                cacheIssue = ` Cache unavailable: ${e instanceof Error ? e.message : 'storage unavailable'}.`;
            }
            if (controller.signal.aborted)
                throw new Error('Weather download cancelled');
            await install(data, true);
            html('weather-network').textContent = 'Public weather refreshed. Model training inputs retain their separately labelled capture date.' + cacheIssue;
        }
        catch (e) {
            html('weather-network').textContent = `${controller.signal.aborted ? 'Weather download cancelled' : e instanceof Error ? e.message : 'Weather unavailable'}. Recorded source retained.`;
        }
        finally {
            pending = false;
            button('refresh-weather').textContent = 'Refresh weather';
        }
    }
    for (const name of ['wind', 'sun', 'carbon'])
        button(`layer-${name}`).addEventListener('click', () => setLayer(name));
    element('weather-layer', HTMLSelectElement).addEventListener('change', () => setLayer(element('weather-layer', HTMLSelectElement).value));
    button('refresh-weather').addEventListener('click', () => { void refresh(); });
    reduced.addEventListener('change', () => changed());
    setLayer('wind');
    return { present(kind: string) { const next = kind === 'weather-sun' ? 'sun' : 'wind'; if (next !== layer) setLayer(next); }, stories(frames: Frame[], after: number) { return weatherStories(frames, areaRows, after); }, get available() { return !!grid; }, get warming() { return !!renderer && !renderer.ready && !renderer.failure; }, get ready() { return !!renderer?.ready; }, get failure() { return renderer?.failure ?? ''; }, get intervals() { return renderer?.intervals ?? []; }, get gpuTimes() { return renderer?.gpuTimes ?? []; }, get count() { return renderer?.ready && !!lastField && layer === 'wind' && !reduced.matches ? renderer.count : 0; },
        async load() {
            try {
                const saved = await cachedWeather();
                if (saved) {
                    await install(saved, true);
                    return;
                }
                const r = await fetch('./weather.json', { signal: AbortSignal.timeout(12000) });
                if (!r.ok)
                    throw new Error('Recorded weather snapshot unavailable');
                const raw: unknown = await r.json();
                await install(parseWeather(raw), false);
            }
            catch (e) {
                html('weather-reading').textContent = 'Recorded wind replay';
                const recorded = svg('recorded-wind').querySelector('g[data-at]')?.getAttribute('data-at');
                html('weather-source').textContent = recorded ? `Recorded field ${fullDate(Date.parse(recorded))} ${time(Date.parse(recorded))} UTC · interactive data unavailable` : e instanceof Error ? e.message : 'No weather source';
                html('wind-status').textContent = 'Recorded playback · not live GPU';
                html('weather-caption').textContent = 'Recorded wind replay is fixed at its labelled time. Carbon estimates still follow the timeline.';
            }
        },
        update(nextAt: number, id: number, regions: Region[], gb = false) { at = nextAt; selected = id; current = regions; national = gb; update(); },
        draw(seconds: number) {
            if (!grid || !lastField) {
                canvas.hidden = true;
                svg('wind-vectors').classList.add('vectors-hidden');
                svg('recorded-wind').classList.toggle('recorded-hidden', !!grid || layer !== 'wind');
                if (grid && !lastField) html('wind-status').textContent = 'No weather field at this time · carbon remains available';
                if (!grid && layer !== 'wind') html('wind-status').textContent = layer === 'carbon' ? 'Carbon only · weather hidden' : 'Sunlight field unavailable · recorded wind hidden';
                return;
            }
            if (!reduced.matches && layer !== 'carbon')
                renderer?.draw(seconds, layer === 'carbon', layer);
            const ready = !!renderer?.ready && !reduced.matches && layer !== 'carbon';
            canvas.hidden = !ready;
            svg('wind-vectors').classList.toggle('vectors-hidden', ready || layer === 'carbon');
            svg('recorded-wind').classList.toggle('recorded-hidden', !!lastField);
            html('wind-status').textContent = layer === 'carbon' ? 'Carbon only · weather hidden' : ready ? (layer === 'sun' ? 'Surface sunlight field · GPU' : `${renderer?.count.toLocaleString('en-GB')} GPU particles · RK2 transform feedback`) : reduced.matches ? 'Reduced motion · sampled wind vectors' : renderer?.failure ? 'Sampled vectors · GPU unavailable' : 'Sampled vectors · GPU preparing';
        }
    };
}
