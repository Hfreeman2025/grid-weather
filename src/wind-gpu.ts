import {
  updateVertex,
  emptyFragment,
  particleVertex,
  particleFragment,
  quadVertex,
  fadeFragment,
  compositeFragment,
} from './wind-shaders.ts';
export interface WindDomain {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  step: number;
}
function requireGL<T>(value: T | null): T {
  if (value === null) throw new Error('GPU allocation failed');
  return value;
}
export function createWindGPU(
  gl: WebGL2RenderingContext,
  count: number,
  domain: WindDomain,
  initial?: Float32Array,
) {
  if (!Number.isInteger(count) || count < 1 || count > 262144)
    throw new Error('Invalid particle budget');
  const compile = (type: number, source: string) => {
    const s = requireGL(gl.createShader(type));
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? 'Wind shader failed');
    return s;
  };
  const program = (vs: string, fs: string, feedback = false) => {
    const p = requireGL(gl.createProgram()),
      v = compile(gl.VERTEX_SHADER, vs),
      f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    if (feedback) gl.transformFeedbackVaryings(p, ['nextState'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) ?? 'Wind link failed');
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  };
  const update = program(updateVertex, emptyFragment, true),
    particles = program(particleVertex, particleFragment),
    fade = program(quadVertex, fadeFragment),
    composite = program(quadVertex, compositeFragment);
  // A real attribute zero avoids Firefox/macOS's emulated no-attribute draw path.
  const quad = requireGL(gl.createVertexArray()),
    quadBuffer = requireGL(gl.createBuffer());
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const states = initial ?? new Float32Array(count * 4);
  if (states.length !== count * 4) throw new Error('Invalid initial particles');
  let seed = 20261102;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  if (!initial)
    for (let i = 0; i < count; i++)
      states.set([random(), random(), random() * 12, random()], i * 4);
  const buffers = [0, 1].map(() => {
    const buffer = requireGL(gl.createBuffer()),
      vao = requireGL(gl.createVertexArray()),
      tf = requireGL(gl.createTransformFeedback());
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, states, gl.DYNAMIC_COPY);
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    return { buffer, vao, tf };
  });
  const field = requireGL(gl.createTexture());
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, field);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    domain.nx,
    domain.ny,
    0,
    gl.RGBA,
    gl.FLOAT,
    new Float32Array(domain.nx * domain.ny * 4),
  );
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
    [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    if (key !== undefined && value !== undefined) gl.texParameteri(gl.TEXTURE_2D, key, value);
  const span: [number, number] = [(domain.nx - 1) * domain.step, (domain.ny - 1) * domain.step];
  for (const p of [update, particles, composite]) {
    gl.useProgram(p);
    gl.uniform1i(gl.getUniformLocation(p, 'field'), 0);
    gl.uniform2i(gl.getUniformLocation(p, 'fieldSize'), domain.nx, domain.ny);
    gl.uniform2f(gl.getUniformLocation(p, 'span'), ...span);
    gl.uniform2f(gl.getUniformLocation(p, 'origin'), domain.x0, domain.y0);
  }
  for (const p of [fade, composite]) {
    gl.useProgram(p);
    gl.uniform1i(gl.getUniformLocation(p, 'trails'), 1);
  }
  let width = 0,
    height = 0,
    current = 0,
    frameIndex = 0,
    trailIndex = 0;
  const trails = [0, 1].map(() => ({
    texture: requireGL(gl.createTexture()),
    fbo: requireGL(gl.createFramebuffer()),
  }));
  function size(w: number, h: number) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    for (const t of trails) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Wind trail framebuffer unavailable');
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, field);
  }
  function step(dt: number, ageDelta: number) {
    const source = buffers[current],
      target = buffers[1 - current];
    if (!source || !target) throw new Error('Missing particle buffer');
    gl.useProgram(update);
    gl.uniform1f(gl.getUniformLocation(update, 'dt'), dt);
    gl.uniform1f(gl.getUniformLocation(update, 'ageDelta'), ageDelta);
    gl.uniform1f(gl.getUniformLocation(update, 'frameIndex'), frameIndex++);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, field);
    // Transform-feedback outputs cannot also remain bound as ARRAY_BUFFER.
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(source.vao);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, target.tf);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    current = 1 - current;
  }
  return {
    count,
    step,
    field(values: Float32Array) {
      if (values.length !== domain.nx * domain.ny * 4 || values.some((v) => !Number.isFinite(v)))
        throw new Error('Invalid GPU wind field');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, domain.nx, domain.ny, gl.RGBA, gl.FLOAT, values);
    },
    async inspect(samples = 1) {
      const b = buffers[current];
      if (!b) throw new Error('No state');
      const result = new Float32Array(Math.min(samples, count) * 4);
      const readback = requireGL(gl.createBuffer());
      gl.bindBuffer(gl.COPY_READ_BUFFER, b.buffer);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, readback);
      gl.bufferData(gl.COPY_WRITE_BUFFER, result.byteLength, gl.STREAM_READ);
      gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, result.byteLength);
      const fence = requireGL(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));
      gl.flush();
      await new Promise<void>((resolve, reject) => {
        const poll = () => {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.WAIT_FAILED) {
            reject(new Error('GPU readback fence failed'));
            return;
          }
          if (status === gl.TIMEOUT_EXPIRED) {
            setTimeout(poll, 2);
            return;
          }
          resolve();
        };
        poll();
      });
      gl.deleteSync(fence);
      gl.getBufferSubData(gl.COPY_WRITE_BUFFER, 0, result);
      gl.bindBuffer(gl.COPY_READ_BUFFER, null);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
      gl.deleteBuffer(readback);
      return [...result];
    },
    draw(
      dt: number,
      w: number,
      h: number,
      camera: [number, number, number],
      layer: number,
      reset = false,
    ) {
      size(w, h);
      gl.viewport(0, 0, w, h);
      if (reset)
        for (const t of trails) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      if (dt > 0) step(dt * 1200, dt);
      const previous = trails[trailIndex],
        target = trails[1 - trailIndex],
        state = buffers[current];
      if (!previous || !target || !state) throw new Error('No wind render state');
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quad);
      gl.useProgram(fade);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, previous.texture);
      gl.uniform1f(
        gl.getUniformLocation(fade, 'decay'),
        Math.pow(0.985, Math.max(dt, 0.016) / 0.016),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(particles);
      gl.uniform3f(gl.getUniformLocation(particles, 'camera'), ...camera);
      gl.uniform2f(gl.getUniformLocation(particles, 'resolution'), w, h);
      gl.uniform1f(gl.getUniformLocation(particles, 'pointSize'), 1.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.bindVertexArray(state.vao);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quad);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(composite);
      gl.uniform3f(gl.getUniformLocation(composite, 'camera'), ...camera);
      gl.uniform2f(gl.getUniformLocation(composite, 'resolution'), w, h);
      gl.uniform1i(gl.getUniformLocation(composite, 'layer'), layer);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      trailIndex = 1 - trailIndex;
      gl.flush();
    },
  };
}
