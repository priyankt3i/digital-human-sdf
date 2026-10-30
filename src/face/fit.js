// Fit the design's face to photos.
//
// Front:   measure ratios on the photo, then photograph the model with the
//          same landmark detector and nudge each face parameter until the
//          model's ratios match (3 rounds of damped multiplicative updates).
//          Measuring the model with the same detector cancels out any
//          systematic difference between our sculpt and MediaPipe's mesh.
// Profile: same idea on the side contour; the model's contour is traced on
//          the CPU, and each parameter is solved with a secant step.
// Colors:  medians of segmented skin and hair pixels, iris ring, lip centers.

import { compileDesign } from '../core/compiler.js';
import { normalizeDesign, SCHEMA } from '../core/schema.js';
import { toWorld } from '../core/vec.js';
import { headPoint } from '../core/anatomy.js';
import { Renderer } from '../render/renderer.js';
import {
  frontRatios, FRONT_PARAMS, analyzeProfile, maskContours, profileFacing,
  updateParam, guessHair, medianColor, LM,
} from './measure.js';
import { detectFace, segment, maskToSize, SEG } from './vision.js';
import { modelProfile, neutralHeadDesign } from './modelProfile.js';

const clampFace = (k, v) => {
  const f = SCHEMA.face.fields[k];
  return f ? Math.min(f.max, Math.max(f.min, v)) : v;
};

// ------------------------------------------------------------------ photos
export function analyzeFront(vision, canvas) {
  const det = detectFace(vision, canvas);
  if (!det) return { ok: false, warnings: ['No face found. Use a clear, well-lit photo looking straight at the camera.'] };
  const fr = frontRatios(det.landmarks, canvas.width, canvas.height);
  const warnings = [];
  if (Math.abs(fr.yawSkew) > 0.12 || (det.yaw !== null && Math.abs(det.yaw) > 12)) warnings.push('Head looks turned. Face the camera squarely for accurate widths.');
  if (fr.ipdPx < 40) warnings.push('Face is small in the photo. Move closer or crop tighter.');
  const seg = segment(vision, canvas);
  const mask = maskToSize(seg, canvas.width, canvas.height);
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = { skin: medianColor(px, mask, [SEG.faceSkin]), hair: medianColor(px, mask, [SEG.hair]) };
  colors.iris = sampleIris(px, canvas.width, det.landmarks, canvas.width, canvas.height);
  colors.lip = sampleLips(px, canvas.width, det.landmarks, canvas.width, canvas.height);
  return { ok: true, ratios: fr.ratios, landmarks: det.landmarks, yaw: det.yaw, warnings, colors, mask };
}

export function analyzeProfilePhoto(vision, canvas) {
  const seg = segment(vision, canvas);
  const w = canvas.width, h = canvas.height;
  const mask = maskToSize(seg, w, h);
  const facing = profileFacing(mask, w, h, SEG.faceSkin, SEG.hair);
  if (!facing) return { ok: false, warnings: ['Could not find a face and hair in this side view.'] };
  const { front, back } = maskContours(mask, w, h, [SEG.faceSkin], [SEG.faceSkin, SEG.hair, SEG.bodySkin], facing);
  const warnings = [];
  const det = detectFace(vision, canvas);
  if (det && det.yaw !== null && Math.abs(det.yaw) < 55) warnings.push('This looks more like a three-quarter view than a full profile.');
  try {
    const a = analyzeProfile(front, back);
    return { ok: true, ratios: a.ratios, landmarks: a.landmarks, facing, front, mask, warnings };
  } catch (e) {
    return { ok: false, warnings: [e.message], facing, front, mask };
  }
}

export function analyzeBack(vision, canvas) {
  const seg = segment(vision, canvas);
  const mask = maskToSize(seg, canvas.width, canvas.height);
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const hair = guessHair(mask, canvas.width, canvas.height, SEG.hair);
  return { ok: true, hair, colors: { hair: medianColor(px, mask, [SEG.hair]) }, mask, warnings: [] };
}

function sampleAt(px, stride, x, y, r = 1) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const j = ((Math.round(y) + dy) * stride + Math.round(x) + dx) * 4;
    if (j >= 0 && j + 2 < px.length) out.push([px[j], px[j + 1], px[j + 2]]);
  }
  return out;
}
function hexMedian(samples) {
  if (!samples.length) return null;
  const med = (i) => samples.map((s) => s[i]).sort((a, b) => a - b)[samples.length >> 1];
  return '#' + [0, 1, 2].map((i) => med(i).toString(16).padStart(2, '0')).join('');
}
function sampleIris(px, stride, lm, w, h) {
  if (lm.length < 478) return null;
  const samples = [];
  for (const [c, a, b] of [[468, 469, 471], [473, 474, 476]]) {
    const cx = lm[c].x * w, cy = lm[c].y * h;
    const r = (Math.hypot((lm[a].x - lm[b].x) * w, (lm[a].y - lm[b].y) * h) / 2) * 0.6;
    for (let k = 0; k < 10; k++) {
      const t = (k / 10) * Math.PI * 2;
      samples.push(...sampleAt(px, stride, cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.6, 0));
    }
  }
  return hexMedian(samples);
}
function sampleLips(px, stride, lm, w, h) {
  const m = (a, b) => [((lm[a].x + lm[b].x) / 2) * w, ((lm[a].y + lm[b].y) / 2) * h];
  const [ux, uy] = m(LM.lipTop, LM.lipInTop), [lx, ly] = m(LM.lipInBottom, LM.lipBottom);
  return hexMedian([...sampleAt(px, stride, ux, uy, 2), ...sampleAt(px, stride, lx, ly, 2)]);
}

// ------------------------------------------------------------------ model camera
export class ModelCamera {
  constructor(size = 640) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.renderer = new Renderer(this.canvas, { manual: true });
    this.key = '';
  }

  /** Render the design's head straight-on, bald and unposed, for landmark detection. */
  async shoot(design) {
    const d = neutralHeadDesign(design);
    d.look = { ...(d.look || {}), hair: 'none', markers: 'none' };
    const c = compileDesign(d);
    if (c.sceneSource !== this.key) {
      await this.renderer.setFragment(c.fragment);
      this.key = c.sceneSource;
    }
    const target = toWorld(c.rig.head, headPoint(c.rig, 0, 1.6, -0.02));
    Object.assign(this.renderer.state, {
      yaw: 0, pitch: 0, dist: 0.62 * c.rig.headScale, target,
      materials: new Float32Array(c.materials), floor: false, scan: false, debug: 0, steps: 220, light: 1.15,
    });
    this.renderer.frame = 0;
    this.renderer.draw();
    return this.canvas;
  }
}

// ------------------------------------------------------------------ fitting
function average(list, key) {
  const v = list.map((r) => r && r.ok && r.ratios && r.ratios[key]).filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

/**
 * results: { front, left, right, back } from the analyze* functions.
 * Returns { face, materials, look, log } with the fitted values.
 */
export async function fitFace(vision, camera, designInput, results, onProgress = () => {}) {
  const base = normalizeDesign(designInput);
  const face = { ...base.face };
  const log = [];
  const withFace = () => ({ ...designInput, face: { ...face } });

  // ---- front: render-and-measure loop
  if (results.front?.ok) {
    const target = results.front.ratios;
    for (let it = 0; it < 3; it++) {
      onProgress(`Matching front view, pass ${it + 1} of 3…`);
      const img = await camera.shoot(withFace());
      const det = detectFace(vision, img);
      if (!det) { log.push('Could not find landmarks on the model render; front fit skipped.'); break; }
      const m = frontRatios(det.landmarks, img.width, img.height).ratios;
      for (const k of FRONT_PARAMS) face[k] = clampFace(k, updateParam(face[k], target[k], m[k], 0.85));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ---- profiles: secant steps on the CPU-traced contour
  const sides = [results.left, results.right].filter((r) => r && r.ok);
  if (sides.length) {
    const target = {};
    for (const k of ['noseProjection', 'chinProjection', 'headDepth']) target[k] = average(sides, k);
    const measure = () => {
      const p = modelProfile(withFace());
      return analyzeProfile(p.front, p.back).ratios;
    };
    for (let it = 0; it < 3; it++) {
      onProgress(`Matching side profile, pass ${it + 1} of 3…`);
      for (const k of Object.keys(target)) {
        if (target[k] === undefined) continue;
        const m0 = measure()[k];
        const h = 0.06;
        const save = face[k];
        face[k] = clampFace(k, save + h);
        const m1 = measure()[k];
        face[k] = save;
        const slope = (m1 - m0) / h;
        if (!Number.isFinite(slope) || Math.abs(slope) < 1e-3) continue;
        // head depth is diluted by hair volume in photos: take half steps
        const damp = k === 'headDepth' ? 0.5 : 0.9;
        face[k] = clampFace(k, face[k] + damp * (target[k] - m0) / slope);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (sides.length === 2) {
      const a = sides[0].ratios, b = sides[1].ratios;
      const asym = Math.abs(a.noseProjection - b.noseProjection) / ((a.noseProjection + b.noseProjection) / 2);
      if (asym > 0.2) log.push('Left and right profiles disagree a lot; check that both are true side views.');
    }
  }

  // ---- colors and hair
  const materials = {};
  const fc = results.front?.colors || {};
  if (fc.skin) materials.skin = fc.skin;
  if (fc.iris) materials.iris = fc.iris;
  if (fc.lip) materials.lip = fc.lip;
  const hairColor = results.back?.colors?.hair || fc.hair;
  if (hairColor) materials.hair = hairColor;
  const look = {};
  if (results.back?.ok && results.back.hair) look.hair = results.back.hair.style;

  for (const k of Object.keys(face)) face[k] = Math.round(face[k] * 100) / 100;
  return { face, materials, look, log };
}
