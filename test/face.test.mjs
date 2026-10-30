import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontRatios, analyzeProfile, maskContours, profileFacing, guessHair, updateParam, medianColor, LM } from '../src/face/measure.js';
import { modelProfile } from '../src/face/modelProfile.js';

function fakeLandmarks(over = {}) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i, x, y) => { lm[i] = { x, y, z: 0 }; };
  // a symmetric face in a 1000x1000 image (coordinates in px / 1000)
  const P = {
    irisR: [0.468, 0.4], irisL: [0.532, 0.4], eyeOutR: [0.45, 0.4], eyeInR: [0.485, 0.4], eyeOutL: [0.55, 0.4], eyeInL: [0.515, 0.4],
    nasion: [0.5, 0.395], noseTip: [0.5, 0.45], subnasale: [0.5, 0.46], alarR: [0.483, 0.455], alarL: [0.517, 0.455],
    mouthR: [0.475, 0.49], mouthL: [0.525, 0.49], lipTop: [0.5, 0.48], lipInTop: [0.5, 0.488], lipInBottom: [0.5, 0.492], lipBottom: [0.5, 0.502],
    chin: [0.5, 0.54], zygR: [0.43, 0.42], zygL: [0.57, 0.42], jawR: [0.448, 0.5], jawL: [0.552, 0.5], ...over,
  };
  for (const [k, [x, y]] of Object.entries(P)) set(LM[k], x, y);
  return lm;
}

test('front ratios are scale-invariant and track the feature they describe', () => {
  const a = frontRatios(fakeLandmarks(), 1000, 1000).ratios;
  const b = frontRatios(fakeLandmarks(), 2000, 2000).ratios;
  for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
  const wide = frontRatios(fakeLandmarks({ alarR: [0.478, 0.455], alarL: [0.522, 0.455] }), 1000, 1000).ratios;
  assert.ok(wide.noseWidth > a.noseWidth);
  assert.ok(Math.abs(wide.mouthWidth - a.mouthWidth) < 1e-9);
  assert.ok(Math.abs(a.eyeSpacing - 0.064 / 0.14) < 1e-6);
});

test('a turned head is flagged by the yaw skew', () => {
  const straight = frontRatios(fakeLandmarks(), 1000, 1000).yawSkew;
  const turned = frontRatios(fakeLandmarks({ noseTip: [0.535, 0.45] }), 1000, 1000).yawSkew;
  assert.ok(Math.abs(straight) < 0.01 && Math.abs(turned) > 0.12);
});

// synthetic profile: forehead, nasion dip, nose, lips, labiomental fold, chin
function syntheticProfile({ nose = 20, chin = -4 } = {}) {
  const front = [];
  for (let y = 0; y < 240; y++) {
    let v = null;
    if (y >= 10 && y < 230) {
      v = 80 - 0.004 * (y - 70) ** 2;                                                          // forehead/cranium arc
      if (y >= 60) v = 80 - 3 * Math.sin(Math.min(1, (y - 60) / 15) * Math.PI / 2);            // nasion dip
      if (y >= 75 && y <= 120) v = 77 + nose * Math.sin(((y - 75) / 45) * Math.PI / 2);        // nose bridge to tip
      if (y > 120 && y <= 130) v = 77 + nose * Math.cos(((y - 120) / 10) * Math.PI / 2);       // under the nose
      if (y > 130 && y <= 160) v = 77 + 3 * Math.sin(((y - 130) / 30) * Math.PI);              // lips
      if (y > 160 && y <= 175) v = 77 - 5 * Math.sin(((y - 160) / 15) * Math.PI / 2);          // labiomental fold
      if (y > 175 && y <= 215) v = 72 + (77 + chin - 72) * Math.sin(((y - 175) / 40) * Math.PI); // chin
      if (y > 215) v = 72 - (y - 215);
    }
    front.push(v);
  }
  return front;
}

test('profile landmarks land on the nasion, nose tip and chin', () => {
  const a = analyzeProfile(syntheticProfile());
  assert.ok(Math.abs(a.landmarks.pronasale - 120) <= 3, `tip ${a.landmarks.pronasale}`);
  assert.ok(a.landmarks.nasion >= 66 && a.landmarks.nasion <= 82, `nasion ${a.landmarks.nasion}`);
  assert.ok(a.landmarks.pogonion >= 185 && a.landmarks.pogonion <= 205, `pogonion ${a.landmarks.pogonion}`);
  const big = analyzeProfile(syntheticProfile({ nose: 28 })).ratios.noseProjection;
  assert.ok(big > a.ratios.noseProjection);
  const strongChin = analyzeProfile(syntheticProfile({ chin: 2 })).ratios.chinProjection;
  assert.ok(strongChin > a.ratios.chinProjection);
});

test('mask contours and facing direction', () => {
  const w = 10, h = 3, mask = new Uint8Array(w * h);
  // hair on the left, face skin on the right
  for (let y = 0; y < h; y++) { mask[y * w + 2] = 1; mask[y * w + 3] = 1; mask[y * w + 6] = 3; mask[y * w + 7] = 3; }
  assert.equal(profileFacing(mask, w, h, 3, 1), 1);
  const c = maskContours(mask, w, h, [3], [1, 3], 1);
  assert.deepEqual(c.front, [7, 7, 7]);
  assert.deepEqual(c.back, [2, 2, 2]);
});

test('hair guess and colors', () => {
  const w = 20, h = 40, mask = new Uint8Array(w * h);
  for (let y = 0; y < 36; y++) for (let x = 5; x < 15; x++) mask[y * w + x] = 1;
  assert.equal(guessHair(mask, w, h, 1).style, 'long');
  const rgba = new Uint8ClampedArray(w * h * 4).fill(0);
  for (let i = 0; i < w * h; i++) if (mask[i] === 1) rgba.set([120, 60, 30, 255], i * 4);
  assert.equal(medianColor(rgba, mask, [1], 1), '#783c1e');
});

test('multiplicative update moves toward the target', () => {
  assert.ok(updateParam(1, 1.2, 1.0) > 1 && updateParam(1, 0.8, 1.0) < 1);
  assert.equal(updateParam(1.1, 0.5, 0.5), 1.1);
});

test('model profile responds to its sliders in the right direction', () => {
  const m = (face) => { const p = modelProfile({ face }); return analyzeProfile(p.front, p.back).ratios; };
  const base = m({});
  assert.ok(m({ noseProjection: 1.3 }).noseProjection > base.noseProjection);
  assert.ok(m({ chinProjection: 1.35 }).chinProjection > base.chinProjection);
  assert.ok(m({ headDepth: 1.12 }).headDepth > base.headDepth);
  assert.ok(base.noseProjection > 0.3 && base.noseProjection < 0.8, `nose ${base.noseProjection}`);
});
