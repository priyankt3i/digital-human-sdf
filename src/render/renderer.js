// WebGL renderer for compiled humans. Renders on demand and progressively
// supersamples (jittered accumulation) while the view is still.

import { VERTEX } from '../core/glsl.js';

const JITTER = [[0, 0], [0.5, 0.25], [-0.25, 0.5], [0.25, -0.5], [-0.5, -0.25], [0.375, 0.125], [-0.125, -0.375], [0.125, 0.375]];

export class Renderer {
  /**
   * opts.manual: no animation loop and no auto-resize; call draw() yourself
   * (used for offscreen renders, e.g. photographing the model for face fitting).
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.manual = !!options.manual;
    const opts = { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    this.gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!this.gl) throw new Error('WebGL is not available in this browser.');
    const gl = this.gl;
    this.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vs = this._shader(gl.VERTEX_SHADER, this._port(VERTEX, 'vertex'));
    this.program = null;
    this.pending = null;
    this.uniforms = {};
    this.state = { yaw: 0, pitch: 0.08, dist: 3.6, target: [0, 0.98, 0], light: 1, scan: false, floor: true, steps: 160, debug: 0, materials: new Float32Array(27), scale: 1 };
    this.frame = 0;          // accumulation index
    this.maxSamples = 8;
    this.animating = false;
    this.interacting = false;
    this.start = performance.now();
    this.onStats = null;
    this._loop = this._loop.bind(this);
    if (!this.manual) requestAnimationFrame(this._loop);
  }

  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  /**
   * The shaders are authored in GLSL ES 1.00. On WebGL 2 we upgrade them to
   * 3.00, which allows a non-constant loop start (uZero) so drivers keep loops
   * as loops instead of unrolling map() dozens of times. On WebGL 1 the loops
   * fall back to a constant start.
   */
  _port(src, stage) {
    if (!this.webgl2) return src.replace(/int i = uZero/g, 'int i = 0');
    if (stage === 'vertex') return `#version 300 es\n${src.replace(/\battribute\b/g, 'in')}`;
    return `#version 300 es\n${src}`
      .replace('precision highp float;', 'precision highp float;\nprecision highp int;\nout vec4 outColor;')
      .replace(/\bgl_FragColor\b/g, 'outColor');
  }

  /** Compile a fragment source asynchronously. Resolves when it is live. */
  setFragment(src) {
    const gl = this.gl;
    const fs = this._shader(gl.FRAGMENT_SHADER, this._port(src, 'fragment'));
    const p = gl.createProgram();
    gl.attachShader(p, this.vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'position');
    gl.linkProgram(p);
    const t0 = performance.now();
    if (this.pending) this.pending.cancelled = true;
    const job = { cancelled: false };
    this.pending = job;
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (job.cancelled) { gl.deleteProgram(p); gl.deleteShader(fs); return resolve(null); }
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
          const log = gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p) || 'Unknown link error';
          gl.deleteProgram(p); gl.deleteShader(fs);
          this.pending = null;
          return reject(new Error(log));
        }
        if (this.program) gl.deleteProgram(this.program);
        this.program = p;
        gl.deleteShader(fs);
        this.uniforms = {};
        for (const n of ['iResolution', 'iTime', 'uCam', 'uTarget', 'uJitter', 'uLight', 'uScan', 'uFloor', 'uMaxSteps', 'uDebug', 'uMat', 'uZero']) {
          this.uniforms[n] = gl.getUniformLocation(p, n === 'uMat' ? 'uMat[0]' : n);
        }
        this.pending = null;
        this.invalidate();
        resolve({ ms: performance.now() - t0 });
      };
      if (this.parallel) {
        const poll = () => {
          if (job.cancelled) return finish();
          if (gl.getProgramParameter(p, this.parallel.COMPLETION_STATUS_KHR)) finish();
          else setTimeout(poll, 16);
        };
        poll();
      } else {
        setTimeout(finish, 0);
      }
    });
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.invalidate();
  }

  invalidate() { this.frame = 0; }

  _resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = this.interacting ? Math.min(this.state.scale, 0.6) : this.state.scale;
    const w = Math.max(1, Math.floor(c.clientWidth * dpr * scale));
    const h = Math.max(1, Math.floor(c.clientHeight * dpr * scale));
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      this.frame = 0;
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    if (!this.program) return;
    this._resize();
    const animate = this.animating || this.state.scan;
    if (animate) this.frame = 0;
    if (this.frame >= this.maxSamples) return;
    this.draw();
  }

  draw() {
    const gl = this.gl, u = this.uniforms, st = this.state;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const n = this.frame;
    const j = this.interacting ? [0, 0] : JITTER[n % JITTER.length];
    gl.uniform2f(u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.iTime, (performance.now() - this.start) / 1000);
    gl.uniform3f(u.uCam, st.yaw, st.pitch, st.dist);
    gl.uniform3f(u.uTarget, ...st.target);
    gl.uniform2f(u.uJitter, j[0], j[1]);
    gl.uniform1f(u.uLight, st.light);
    gl.uniform1f(u.uScan, st.scan ? 1 : 0);
    gl.uniform1f(u.uFloor, st.floor ? 1 : 0);
    gl.uniform1i(u.uMaxSteps, st.steps);
    gl.uniform1i(u.uDebug, st.debug);
    gl.uniform3fv(u.uMat, st.materials);
    gl.uniform1i(u.uZero, 0);
    if (n === 0) {
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, 1 / (n + 1));
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    }
    const t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frame = this.interacting ? 0 : n + 1;
    if (this.onStats) this.onStats({ sample: this.frame, samples: this.maxSamples, cpuMs: performance.now() - t0, w: this.canvas.width, h: this.canvas.height });
  }

  snapshot() {
    return new Promise((res) => this.canvas.toBlob(res, 'image/png'));
  }
}
