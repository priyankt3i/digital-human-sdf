#!/usr/bin/env node
// Measure a design's front silhouette (as fractions of standing height) so it
// can be compared with, or fitted to, measurements taken from a reference image.
//   node tools/fit-silhouette.mjs run
// Reference values below were measured from a photo's segmented outline:
// crown y=78, floor ~1330 (feet cropped), narrowest waist 176 px at y=490,
// widest hip 264 px at y=680, outer shoulder breadth ~290 px.
import { buildHuman } from '../src/core/compiler.js';
import { makeField } from '../src/core/field.js';
// front-silhouette width at height y (torso+legs only, arms excluded)
export function silhouette(design) {
  const h = buildHuman({ ...design, look: { suit: 'none', markers: 'none', hair: 'none' } });
  const parts = h.parts.filter((p) => !/^(arm|hand)/.test(p.region));
  const f = makeField(parts, h.frames, ['body']);
  const width = (y) => {
    let lo = null, hi = null;
    for (let x = -0.4; x <= 0.4; x += 0.003) {
      let inside = false;
      for (let z = -0.25; z <= 0.25 && !inside; z += 0.006) if (f([x, y, z]) < 0) inside = true;
      if (inside) { if (lo === null) lo = x; hi = x; }
    }
    return lo === null ? 0 : hi - lo;
  };
  const H = design.body.height;
  let waist = [9, 0], hip = [0, 0];
  for (let fy = 0.56; fy <= 0.7; fy += 0.005) { const w = width(fy * H); if (w < waist[0]) waist = [w, fy]; }
  for (let fy = 0.44; fy <= 0.56; fy += 0.005) { const w = width(fy * H); if (w > hip[0]) hip = [w, fy]; }
  // outer shoulder breadth = deltoid to deltoid (include arms here)
  const fa = makeField(h.parts.filter((p) => p.layer === 'body'), h.frames, ['body']);
  let sh = 0;
  for (let fy = 0.78; fy <= 0.84; fy += 0.005) {
    let lo = null, hi = null;
    for (let x = -0.4; x <= 0.4; x += 0.003) { let inn = false; for (let z = -0.2; z <= 0.2 && !inn; z += 0.006) if (fa([x, fy * H, z]) < 0) inn = true; if (inn) { if (lo === null) lo = x; hi = x; } }
    if (lo !== null) sh = Math.max(sh, hi - lo);
  }
  return { waist: waist[0] / H, waistY: waist[1], hip: hip[0] / H, hipY: hip[1], shoulder: sh / H };
}
if (process.argv[2] === 'run') {
  const ref = { shoulder: 290 / 1252, waist: 176 / 1252, hip: 264 / 1252, waistY: (1330 - 490) / 1252, hipY: (1330 - 680) / 1252 };
  const cur = silhouette({ body: { form: 1, softness: 0.45, height: 1.68, bust: 0.6, hips: 1.02, muscle: 0.95 }, pose: { armSpread: 14 } });
  const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(3)]));
  console.log('image   ', fmt(ref));
  console.log('ours    ', fmt(cur));
}
