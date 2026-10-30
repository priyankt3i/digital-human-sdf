// The model's own profile, traced on the CPU from the distance field:
// for every row, march along the head's midline from the front (and from the
// back) until the surface is hit. Same shape of data as maskContours() gives
// for a photo, so analyzeProfile() can measure both the same way.

import { buildHuman } from '../core/compiler.js';
import { makeField } from '../core/field.js';
import { toWorld } from '../core/vec.js';
import { headPoint } from '../core/anatomy.js';

/** Neutral head pose so the profile is a true side view. */
export function neutralHeadDesign(design) {
  return {
    ...design,
    pose: { ...(design.pose || {}), headYaw: 0, headPitch: 0, weightShift: 0 },
  };
}

function march(f, start, dir, maxDist) {
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const p = [start[0] + dir[0] * t, start[1] + dir[1] * t, start[2] + dir[2] * t];
    const d = f(p);
    if (d < 2e-4) return t;
    t += Math.max(d * 0.95, 4e-4);
    if (t > maxDist) return null;
  }
  return null;
}

export function modelProfile(design, { stepMm = 1 } = {}) {
  const h = buildHuman(neutralHeadDesign(design));
  const head = h.parts.filter((p) => p.region === 'head');
  const faceField = makeField(head, h.frames, ['body', 'eyes']);
  const headField = makeField(head, h.frames, ['body', 'eyes', 'hair']);
  const s = h.rig.s * (design.body?.headSize ?? 1);
  const crown = toWorld(h.rig.head, headPoint(h.rig, 0, 1.79, 0))[1];
  const chin = toWorld(h.rig.head, headPoint(h.rig, 0, 1.45, 0))[1];
  const cx = h.rig.head.origin[0];
  const step = (stepMm / 1000) * s;
  const front = [], back = [];
  for (let y = crown; y >= chin; y -= step) {
    const tf = march(faceField, [cx, y, -0.3], [0, 0, 1], 0.6);
    const tb = march(headField, [cx, y, 0.3], [0, 0, -1], 0.6);
    // "forward" coordinate: larger = further toward the face (-Z), in mm
    front.push(tf === null ? null : (0.3 - tf) * 1000);
    back.push(tb === null ? null : (tb - 0.3) * 1000);
  }
  return { front, back, rows: front.length };
}
