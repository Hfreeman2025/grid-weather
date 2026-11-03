import { record, finite } from './core.ts';
import { createWindGPU } from './wind-gpu.ts';
let canvas: OffscreenCanvas | undefined, gl: WebGL2RenderingContext | undefined, gpu: ReturnType<typeof createWindGPU> | undefined;
let last = 0;
const reply = (data: object) => globalThis.postMessage(data, {});
globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
    try {
        const m = record(event.data);
        if (m.kind === 'init') {
            if (!(m.canvas instanceof OffscreenCanvas))
                throw new Error('Missing wind canvas');
            const d = record(m.domain), domain = { nx: finite(d.nx, 2, 60), ny: finite(d.ny, 2, 60), x0: finite(d.x0, -2000, 1000), y0: finite(d.y0, -1000, 2000), step: finite(d.step, 1, 300) };
            canvas = m.canvas;
            canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); reply({ kind: 'unavailable', reason: 'Wind graphics context lost' }); });
            const context = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false, failIfMajorPerformanceCaveat: true });
            if (!context) {
                reply({ kind: 'unavailable', reason: 'WebGL2 unavailable; sampled wind vectors remain' });
                return;
            }
            gl = context;
            gpu = createWindGPU(gl, finite(m.count, 1, 262144), domain);
            reply({ kind: 'ready' });
        }
        else if (m.kind === 'frame') {
            if (!canvas || !gpu || !gl)
                throw new Error('Wind renderer not initialized');
            const width = finite(m.width, 1, 4096), height = finite(m.height, 1, 4096), seconds = finite(m.seconds, 0), camera = m.camera;
            if (!Array.isArray(camera) || camera.length !== 3)
                throw new Error('Invalid wind camera');
            const cam: [
                number,
                number,
                number
            ] = [finite(camera[0], -10000, 10000), finite(camera[1], -10000, 10000), finite(camera[2], .01, 10)];
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            if (m.field instanceof Float32Array)
                gpu.field(m.field);
            const first = !last;
            const dt = m.paused === true || !last ? 0 : Math.min(.25, Math.max(0, seconds - last));
            last = seconds;
            const began = performance.now();
            // Prime a second of genuine advection before promoting the first GPU frame.
            if (first && m.layer !== 'sun') for (let i = 0; i < 20; i++) gpu.draw(.05, width, height, cam, 0, i === 0);
            gpu.draw(dt, width, height, cam, m.layer === 'sun' ? 1 : 0, !first && m.reset === true);
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            if (!fence)
                throw new Error('Wind GPU fence unavailable');
            const poll = () => {
                if (!gl)
                    return;
                const status = gl.clientWaitSync(fence, 0, 0);
                if (status === gl.WAIT_FAILED || gl.isContextLost()) {
                    reply({ kind: 'unavailable', reason: 'Wind GPU interrupted' });
                    return;
                }
                if (status === gl.TIMEOUT_EXPIRED) {
                    setTimeout(poll, 2);
                    return;
                }
                gl.deleteSync(fence);
                reply({ kind: 'painted', gpuMs: performance.now() - began, count: gpu?.count ?? 0 });
            };
            poll();
        }
    }
    catch (e) {
        reply({ kind: 'unavailable', reason: e instanceof Error ? e.message : 'Wind renderer unavailable' });
        globalThis.close?.();
    }
});
