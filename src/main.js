import { SCHEMA } from './core/schema.js';
import { compileDesign, toShadertoy } from './core/compiler.js';
import { evaluateSource, setSourceValue } from './core/source.js';
import { headPoint } from './core/anatomy.js';
import { toWorld, cross, norm, sub, dot } from './core/vec.js';
import { Renderer } from './render/renderer.js';
import { buildControls } from './ui/controls.js';

const PRESETS = [
  { id: 'performer', label: 'Mocap Performer' },
  { id: 't-pose', label: 'Calibration T-Pose' },
  { id: 'facial-capture', label: 'Facial Capture' },
  { id: 'figure-study', label: 'Figure Study' },
  { id: 'dancer', label: 'Dancer' },
  { id: 'mannequin', label: 'Sculpt Base' },
];
const STORE_KEY = 'dhsdf:v1';
const $ = (s) => document.querySelector(s);

const app = {
  source: '',
  presetId: 'performer',
  presetSource: '',
  compiled: null,
  sceneKey: '',
  showing: 'design',
  shaderMs: 0,
  sample: 0,
};

// ------------------------------------------------------------------ helpers
const storage = {
  get() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
};
const b64 = {
  enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
};
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'human';

// ------------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new Renderer($('#gl'));
} catch (e) {
  $('#fail').hidden = false;
  $('#fail').textContent = `${e.message} The studio needs WebGL to draw the figure; the design code and exports still work from the command line (see README).`;
}

// ------------------------------------------------------------------ camera
const cam = { yaw: 0, pitch: 0.06, dist: 4.5, ty: 0.93, turntable: false, view: 'front' };
function viewPreset(name) {
  const c = app.compiled;
  const s = c ? c.rig.s : 1;
  const P = {
    front: { yaw: 0, pitch: 0.06, dist: 4.5 * s, ty: 0.93 * s },
    three: { yaw: -0.62, pitch: 0.1, dist: 4.4 * s, ty: 0.93 * s },
    side: { yaw: -Math.PI / 2, pitch: 0.06, dist: 4.5 * s, ty: 0.93 * s },
    back: { yaw: Math.PI, pitch: 0.06, dist: 4.5 * s, ty: 0.93 * s },
  }[name];
  if (P) Object.assign(cam, P);
  if (name === 'face' && c) {
    const h = toWorld(c.rig.head, headPoint(c.rig, 0, 1.62, 0));
    Object.assign(cam, { yaw: -0.35, pitch: 0.05, dist: 0.62 * s, ty: h[1] });
  }
  if (name === 'hands' && c) {
    const w = toWorld(c.rig.arms[1].hand, [0, 0.06 * s, 0]);
    Object.assign(cam, { yaw: 0.9, pitch: 0.1, dist: 0.6 * s, ty: w[1] });
    cam.tx = w[0]; cam.tz = w[2];
  } else {
    cam.tx = 0; cam.tz = 0;
  }
  cam.view = name;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  pushCamera();
}
function pushCamera() {
  if (!renderer) return;
  renderer.set({ yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, target: [cam.tx || 0, cam.ty, cam.tz || 0] });
  drawRuler();
}

const canvas = $('#gl');
const pointers = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 });
  if (renderer) renderer.interacting = true;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) cam.dist = Math.min(9, Math.max(0.35, cam.dist * (pinch / d)));
    pinch = d;
  } else if (p.pan) {
    cam.ty += dy * 0.0025 * cam.dist * 0.4;
  } else {
    cam.yaw -= dx * 0.008;
    cam.pitch = Math.max(-1.2, Math.min(1.25, cam.pitch + dy * 0.006));
  }
  markCustomView();
  pushCamera();
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  pinch = 0;
  if (!pointers.size && renderer) { renderer.interacting = false; renderer.invalidate(); }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let wheelTimer;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = Math.min(9, Math.max(0.35, cam.dist * Math.exp(e.deltaY * 0.0012)));
  if (renderer) {
    renderer.interacting = true;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { renderer.interacting = false; renderer.invalidate(); }, 140);
  }
  markCustomView();
  pushCamera();
}, { passive: false });
canvas.addEventListener('dblclick', () => viewPreset('front'));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewPreset(b.dataset.view)));
function markCustomView() {
  if (cam.view !== 'custom') {
    cam.view = 'custom';
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }
}

function tick() {
  requestAnimationFrame(tick);
  if (cam.turntable && renderer) {
    cam.yaw += 0.004;
    renderer.state.yaw = cam.yaw;
    drawRuler();
  }
}
requestAnimationFrame(tick);

// ------------------------------------------------------------------ ruler
const ruler = $('#ruler');
let showRuler = true;
function project(pw) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const t = [cam.tx || 0, cam.ty, cam.tz || 0];
  const ro = [t[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw), t[1] + cam.dist * Math.sin(cam.pitch), t[2] - cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)];
  const ww = norm(sub(t, ro));
  const uu = norm(cross(ww, [0, 1, 0]));
  const vv = cross(uu, ww);
  const d = sub(pw, ro);
  const z = dot(d, ww);
  if (z <= 0.01) return null;
  return { x: w / 2 + (dot(d, uu) / z) * 2.1 * h, y: h / 2 - (dot(d, vv) / z) * 2.1 * h, uu };
}
function drawRuler() {
  const c = app.compiled;
  if (!c || !showRuler || cam.dist < 1.4) { ruler.innerHTML = ''; return; }
  const s = c.rig.s;
  const top = toWorld(c.rig.head, headPoint(c.rig, 0, 1.743, 0.012))[1];
  const probe = project([0, 0, 0]);
  if (!probe) { ruler.innerHTML = ''; return; }
  const off = probe.uu.map((v) => -v * 0.5 * s);
  const at = (y) => project([off[0], y, off[2]]);
  const a = at(0), b = at(top);
  if (!a || !b) { ruler.innerHTML = ''; return; }
  const parts = [`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`];
  for (let y = 0.1, i = 1; y < top - 0.02; y += 0.1, i++) {
    const p = at(y);
    const major = i % 5 === 0;
    const len = major ? 10 : 5;
    parts.push(`<line class="${major ? 'major' : ''}" x1="${p.x - len}" y1="${p.y}" x2="${p.x}" y2="${p.y}"/>`);
    if (major) parts.push(`<text x="${p.x - 14}" y="${p.y + 4}" text-anchor="end">${(i / 10).toFixed(1)}</text>`);
  }
  parts.push(`<line class="cap" x1="${b.x - 14}" y1="${b.y}" x2="${b.x + 26}" y2="${b.y}"/>`);
  parts.push(`<line class="cap" x1="${a.x - 14}" y1="${a.y}" x2="${a.x + 6}" y2="${a.y}"/>`);
  parts.push(`<text class="total" x="${b.x - 16}" y="${b.y + 4}" text-anchor="end">${top.toFixed(2)} m</text>`);
  ruler.innerHTML = parts.join('');
}
window.addEventListener('resize', drawRuler);

// ------------------------------------------------------------------ render controls
const RENDER = {
  view: {
    label: 'Viewport',
    fields: {
      mode: { type: 'enum', default: 'lit', options: ['lit', 'clay', 'normals', 'materials', 'cost'], label: 'Shading' },
      light: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Light intensity' },
      scan: { type: 'bool', default: false, label: 'Scanner sweep' },
      turntable: { type: 'bool', default: false, label: 'Turntable' },
      floor: { type: 'bool', default: true, label: 'Studio floor' },
      ruler: { type: 'bool', default: true, label: 'Height ruler' },
    },
  },
  quality: {
    label: 'Quality',
    fields: {
      steps: { type: 'number', default: 160, min: 60, max: 320, step: 10, label: 'Raymarch steps' },
      scale: { type: 'number', default: 1, min: 0.4, max: 1.5, step: 0.05, label: 'Resolution scale' },
      samples: { type: 'number', default: 8, min: 1, max: 8, step: 1, label: 'Still-frame samples' },
    },
  },
};
const renderValues = { view: { mode: 'lit', light: 1, scan: false, turntable: false, floor: true, ruler: true }, quality: { steps: 160, scale: 1, samples: 8 } };
const renderUI = buildControls($('#renderControls'), RENDER, (sec, key, value) => {
  renderValues[sec][key] = value;
  applyRender();
  renderUI.update(renderValues);
}, { idPrefix: 'r' });
for (const g of document.querySelectorAll('#renderControls details')) g.open = true;
function applyRender() {
  const v = renderValues.view, q = renderValues.quality;
  cam.turntable = v.turntable;
  showRuler = v.ruler;
  drawRuler();
  if (!renderer) return;
  renderer.maxSamples = q.samples;
  renderer.set({ debug: ['lit', 'clay', 'normals', 'materials', 'cost'].indexOf(v.mode), light: v.light, scan: v.scan, floor: v.floor, steps: q.steps, scale: q.scale });
  renderer.animating = v.turntable;
}
renderUI.update(renderValues);

// ------------------------------------------------------------------ design controls
const designUI = buildControls($('#controls'), SCHEMA, (section, key, value, { final }) => {
  const next = setSourceValue(app.source, section, key, value);
  setSource(next, { fromControls: true, quick: !final });
});

// ------------------------------------------------------------------ editor
const src = $('#source'), gutter = $('#gutter'), con = $('#console');
function renderGutter() {
  const n = src.value.split('\n').length;
  let out = '';
  for (let i = 1; i <= n; i++) out += i + '\n';
  gutter.textContent = out;
  gutter.scrollTop = src.scrollTop;
}
src.addEventListener('scroll', () => { gutter.scrollTop = src.scrollTop; });
let typingTimer;
src.addEventListener('input', () => {
  renderGutter();
  if (app.showing !== 'design') return;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setSource(src.value, { fromEditor: true }), 650);
});
src.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !src.readOnly) {
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = src;
    src.setRangeText('  ', a, b, 'end');
    src.dispatchEvent(new Event('input'));
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    clearTimeout(typingTimer);
    setSource(src.value, { fromEditor: true });
  }
});
$('#run').addEventListener('click', () => { clearTimeout(typingTimer); setSource(src.value, { fromEditor: true }); });
function showSource(which) {
  app.showing = which;
  $('#showDesign').setAttribute('aria-pressed', String(which === 'design'));
  $('#showGlsl').setAttribute('aria-pressed', String(which === 'glsl'));
  src.readOnly = which === 'glsl';
  $('#run').hidden = which === 'glsl';
  src.value = which === 'glsl' ? (app.compiled ? app.compiled.fragment : '') : app.source;
  src.scrollTop = 0;
  renderGutter();
}
$('#showDesign').addEventListener('click', () => showSource('design'));
$('#showGlsl').addEventListener('click', () => showSource('glsl'));
function log(msg, kind = '') {
  con.textContent = msg;
  con.className = `console ${kind}`;
}

// ------------------------------------------------------------------ tabs
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('[role=tab]').forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  if (tab.id === 'tab-code') showSource(app.showing);
}));

// ------------------------------------------------------------------ compile pipeline
let queued = null, busy = false;
function setSource(text, opts = {}) {
  app.source = text;
  if (!opts.fromEditor && app.showing === 'design' && src.value !== text) {
    const pos = src.scrollTop;
    src.value = text;
    src.scrollTop = pos;
    renderGutter();
  }
  queued = { text, opts };
  if (!busy) setTimeout(flush, 0);
}

async function flush() {
  if (!queued) return;
  const { text, opts } = queued;
  queued = null;
  busy = true;
  try {
    const design = evaluateSource(text);
    const compiled = compileDesign(design);
    app.compiled = compiled;
    if (!opts.fromControls) designUI.update(compiled.design);
    $('#designName').textContent = compiled.design.name;
    const L = compiled.design.look;
    const suit = { mocap: 'mocap suit', bodysuit: 'bodysuit', none: 'no suit' }[L.suit];
    const top = toWorld(compiled.rig.head, headPoint(compiled.rig, 0, 1.743, 0.012))[1];
    $('#designMeta').textContent = `${top.toFixed(2)} m tall, ${suit}, ${compiled.markers.length ? `${compiled.markers.length} markers` : 'no markers'}`;
    if (renderer) {
      renderer.set({ materials: new Float32Array(compiled.materials) });
      if (compiled.sceneSource !== app.sceneKey) {
        app.sceneKey = compiled.sceneSource;
        setStatus(`Compiling shader (${compiled.stats.parts} parts)…`, true);
        const slow = setTimeout(() => setStatus('Still compiling: the first compile can take a while on some GPUs…', true), 6000);
        const res = await renderer.setFragment(compiled.fragment).finally(() => clearTimeout(slow));
        $('#fail').hidden = true;
        if (res) app.shaderMs = res.ms;
      }
    }
    if (cam.view !== 'custom' && cam.view !== 'face' && cam.view !== 'hands') {
      const s = compiled.rig.s;
      cam.ty = 0.93 * s;
      pushCamera();
    } else drawRuler();
    if (app.showing === 'glsl') showSource('glsl');
    log(`Built ${compiled.stats.parts} parts (${Object.entries(compiled.stats.byLayer).map(([k, v]) => `${v} ${k}`).join(', ')}) in ${compiled.stats.buildMs.toFixed(0)} ms.`, 'ok');
    storage.set({ source: text, preset: app.presetId });
    updateStatus();
  } catch (e) {
    const msg = String(e.message || e);
    log(msg, 'error');
    const shaderError = /ERROR|compile|link/i.test(msg) && !/export default|Unexpected|is not defined/.test(msg);
    setStatus(shaderError ? 'Shader failed to compile on this GPU.' : 'Design has an error; see the Code tab.', true);
    if (shaderError && renderer && !renderer.program) {
      $('#fail').hidden = false;
      $('#fail').textContent = `The shader failed to compile on this GPU/browser. Please open an issue with this message:\n\n${msg.slice(0, 600)}`;
    }
    console.error(e);
  } finally {
    busy = false;
    if (queued) setTimeout(flush, 0);
  }
}

function setStatus(text, hot = false) {
  const s = $('#status');
  s.textContent = text;
  s.classList.toggle('busy', hot);
}
function updateStatus() {
  const c = app.compiled;
  if (!c) return;
  const refine = renderer && renderer.frame < renderer.maxSamples && !renderer.animating ? `Refining ${renderer.frame}/${renderer.maxSamples}` : 'Sharp';
  setStatus(`${c.stats.parts} parts, shader ${app.shaderMs.toFixed(0)} ms. ${refine}`);
}
if (renderer) {
  let last = 0;
  renderer.onStats = () => {
    const now = performance.now();
    if (now - last > 150 || renderer.frame >= renderer.maxSamples) { last = now; if (!busy) updateStatus(); }
  };
}

// ------------------------------------------------------------------ presets
const presetSel = $('#preset');
for (const p of PRESETS) presetSel.append(new Option(p.label, p.id));
presetSel.append(new Option('Custom (from link or edits)', 'custom'));
async function loadPreset(id) {
  const res = await fetch(`designs/${id}.js`);
  if (!res.ok) throw new Error(`Could not load designs/${id}.js (${res.status}).`);
  const text = await res.text();
  app.presetId = id;
  app.presetSource = text;
  presetSel.value = id;
  setSource(text);
}
presetSel.addEventListener('change', () => {
  if (presetSel.value === 'custom') return;
  loadPreset(presetSel.value).then(() => setTimeout(() => viewPreset('front'), 50)).catch((e) => log(e.message, 'error'));
});
$('#resetDesign').addEventListener('click', () => {
  if (app.presetSource) setSource(app.presetSource);
});

// ------------------------------------------------------------------ share + export
$('#share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#d=${b64.enc(app.source)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Share link copied'); } catch { toast('Share link is in the address bar'); }
});
const menuBtn = $('#exportBtn'), menuList = document.querySelector('#exportMenu .menu-list');
const closeMenu = () => { menuList.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuList.hidden = !menuList.hidden;
  menuBtn.setAttribute('aria-expanded', String(!menuList.hidden));
  if (!menuList.hidden) menuList.querySelector('button').focus();
});
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
menuList.addEventListener('click', async (e) => {
  const kind = e.target.dataset.export;
  if (!kind || !app.compiled) return;
  const c = app.compiled, name = slug(c.design.name);
  if (kind === 'design') download(`${name}.js`, app.source, 'text/javascript');
  if (kind === 'glsl') download(`${name}.frag.glsl`, c.fragment);
  if (kind === 'shadertoy') {
    const st = toShadertoy(c, { light: renderValues.view.light, scan: renderValues.view.scan });
    try { await navigator.clipboard.writeText(st); toast('Shadertoy code copied'); } catch { download(`${name}.shadertoy.glsl`, st); }
  }
  if (kind === 'markers') {
    const rows = ['name,x,y,z,nx,ny,nz', ...c.markers.map((m) => [m.name, ...m.position.map((v) => v.toFixed(5)), ...m.normal.map((v) => v.toFixed(4))].join(','))];
    download(`${name}-markers.csv`, rows.join('\n'), 'text/csv');
  }
  if (kind === 'png' && renderer) download(`${name}.png`, await renderer.snapshot());
  closeMenu();
});

// ------------------------------------------------------------------ boot
(async function boot() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const saved = storage.get();
  try {
    if (hash.get('d')) {
      await loadPreset('performer').catch(() => {});
      presetSel.value = 'custom';
      app.presetId = 'custom';
      setSource(b64.dec(hash.get('d')));
    } else if (saved && saved.source) {
      await loadPreset(PRESETS.some((p) => p.id === saved.preset) ? saved.preset : 'performer');
      if (saved.source !== app.presetSource) { presetSel.value = 'custom'; setSource(saved.source); }
    } else {
      await loadPreset('performer');
    }
  } catch (e) {
    log(e.message, 'error');
    setStatus('Could not load the design files. Serve this folder over HTTP (see README).', true);
  }
  setTimeout(() => viewPreset('front'), 0);
})();

// Expose for console tinkering
window.studio = { app, renderer, cam, compileDesign };
