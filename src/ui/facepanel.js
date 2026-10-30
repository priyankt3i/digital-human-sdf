// "Face from photos" panel: four photo slots, overlays, fit + undo.

import { loadVision, toCanvas } from '../face/vision.js';
import { analyzeFront, analyzeProfilePhoto, analyzeBack, fitFace, ModelCamera } from '../face/fit.js';
import { evaluateSource, setSourceValue } from '../core/source.js';

const SLOTS = [
  { id: 'front', label: 'Front', hint: 'Look straight at the camera, neutral face' },
  { id: 'left', label: 'Left side', hint: 'Full profile, your left side to the camera' },
  { id: 'right', label: 'Right side', hint: 'Full profile, your right side to the camera' },
  { id: 'back', label: 'Back', hint: 'Back of the head, for hair shape and color' },
];
const SAMPLES = { front: 'assets/samples/face-front.jpg', left: 'assets/samples/face-left.jpg', right: 'assets/samples/face-right.jpg', back: 'assets/samples/face-back.jpg' };

export function initFacePanel(root, api) {
  const state = { canvases: {}, results: {}, undo: null, vision: null, camera: null, busy: false };

  root.innerHTML = `
    <details class="group face-group" open>
      <summary>Face from photos</summary>
      <div class="rows">
        <p class="hint">Add up to four photos. They are measured on this device and never uploaded; only the resulting numbers are written into your design.</p>
        <div class="slots">${SLOTS.map((s) => `
          <label class="slot" data-slot="${s.id}" title="${s.hint}">
            <input type="file" accept="image/*" data-file="${s.id}">
            <canvas width="160" height="160" aria-hidden="true"></canvas>
            <span class="slot-name">${s.label}</span>
            <span class="slot-state" aria-live="polite">Add photo</span>
          </label>`).join('')}
        </div>
        <div class="face-actions">
          <button type="button" class="primary small" id="faceFit" disabled>Fit face to photos</button>
          <button type="button" class="ghost small" id="faceSamples">Try sample photos</button>
          <button type="button" class="ghost small" id="faceUndo" hidden>Undo fit</button>
        </div>
        <div class="face-log" id="faceLog" role="status"></div>
      </div>
    </details>`;

  const $ = (sel) => root.querySelector(sel);
  const log = (msg, kind = '') => { const el = $('#faceLog'); el.textContent = msg; el.className = `face-log ${kind}`; };
  const fitBtn = $('#faceFit');
  const refreshFit = () => { fitBtn.disabled = state.busy || !Object.values(state.results).some((r) => r && r.ok); };

  async function vision() {
    if (!state.vision) state.vision = await loadVision((m) => log(m));
    return state.vision;
  }

  function drawSlot(id) {
    const slot = root.querySelector(`[data-slot="${id}"]`);
    const c = slot.querySelector('canvas'), g = c.getContext('2d');
    const img = state.canvases[id], res = state.results[id];
    g.clearRect(0, 0, c.width, c.height);
    if (!img) return;
    const k = Math.min(c.width / img.width, c.height / img.height);
    const w = img.width * k, h = img.height * k, ox = (c.width - w) / 2, oy = (c.height - h) / 2;
    g.drawImage(img, ox, oy, w, h);
    if (!res) return;
    g.save();
    g.translate(ox, oy);
    if (id === 'front' && res.landmarks) {
      g.fillStyle = '#f2b33d';
      for (const p of res.landmarks) g.fillRect(p.x * w - 0.5, p.y * h - 0.5, 1.2, 1.2);
    }
    if ((id === 'left' || id === 'right') && res.front) {
      g.strokeStyle = '#f2b33d'; g.lineWidth = 1.5; g.beginPath();
      let started = false;
      res.front.forEach((v, y) => {
        if (v === null) { started = false; return; }
        const x = res.facing > 0 ? v : img.width - 1 - v;
        if (!started) { g.moveTo(x * k, y * k); started = true; } else g.lineTo(x * k, y * k);
      });
      g.stroke();
      if (res.landmarks) {
        g.fillStyle = '#e8eef2';
        for (const key of ['nasion', 'pronasale', 'subnasale', 'pogonion']) {
          const y = res.landmarks[key];
          const v = res.front[y];
          if (v === null || v === undefined) continue;
          const x = res.facing > 0 ? v : img.width - 1 - v;
          g.beginPath(); g.arc(x * k, y * k, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }
    g.restore();
  }

  function setSlotState(id, text, kind = '') {
    const el = root.querySelector(`[data-slot="${id}"] .slot-state`);
    el.textContent = text;
    el.className = `slot-state ${kind}`;
  }

  async function analyze(id, source) {
    state.busy = true; refreshFit();
    setSlotState(id, 'Measuring…');
    try {
      const canvas = await toCanvas(source, 1024);
      state.canvases[id] = canvas;
      drawSlot(id);
      const v = await vision();
      const res = id === 'front' ? analyzeFront(v, canvas) : id === 'back' ? analyzeBack(v, canvas) : analyzeProfilePhoto(v, canvas);
      state.results[id] = res;
      drawSlot(id);
      if (!res.ok) setSlotState(id, res.warnings[0] || 'Could not measure', 'bad');
      else if (res.warnings.length) setSlotState(id, res.warnings[0], 'warn');
      else setSlotState(id, id === 'back' ? `Hair: ${res.hair.style}` : 'Measured', 'good');
      log('');
    } catch (e) {
      console.error(e);
      setSlotState(id, 'Could not read this photo', 'bad');
      log(`Face models could not load: ${e.message}. Check your connection; the models come from cdn.jsdelivr.net and storage.googleapis.com.`, 'error');
    } finally {
      state.busy = false; refreshFit();
    }
  }

  root.querySelectorAll('[data-file]').forEach((input) => input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) analyze(input.dataset.file, file);
    input.value = '';
  }));

  $('#faceSamples').addEventListener('click', async () => {
    for (const s of SLOTS) await analyze(s.id, new URL(SAMPLES[s.id], location.href).href);
  });

  fitBtn.addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true; refreshFit();
    const before = api.getSource();
    try {
      const v = await vision();
      state.camera ||= new ModelCamera(640);
      const design = evaluateSource(before);
      const out = await fitFace(v, state.camera, design, state.results, (m) => log(m));
      let src = before;
      for (const [k, val] of Object.entries(out.face)) src = setSourceValue(src, 'face', k, val);
      for (const [k, val] of Object.entries(out.materials)) src = setSourceValue(src, 'materials', k, val);
      for (const [k, val] of Object.entries(out.look)) src = setSourceValue(src, 'look', k, val);
      state.undo = before;
      $('#faceUndo').hidden = false;
      api.setSource(src);
      const changed = Object.entries(out.face).filter(([k, v]) => Math.abs(v - (design.face?.[k] ?? 1)) >= 0.01).map(([k, v]) => `${k} ${v.toFixed(2)}`);
      log(['Fitted. ' + (changed.length ? changed.join(', ') + '.' : 'No face changes needed.'), ...out.log].join(' '), 'ok');
      api.showFace();
    } catch (e) {
      console.error(e);
      log(`Fit failed: ${e.message}`, 'error');
    } finally {
      state.busy = false; refreshFit();
    }
  });

  $('#faceUndo').addEventListener('click', () => {
    if (!state.undo) return;
    api.setSource(state.undo);
    state.undo = null;
    $('#faceUndo').hidden = true;
    log('Restored the design from before the fit.');
  });
}
