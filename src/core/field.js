// CPU evaluation of a part list: the same math the shader runs.
// Used to snap markers and seams onto the surface and by the tests.

import { sub, dot, len, toLocal, add, mul, norm } from './vec.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function partDistance(part, pw, frames) {
  const p = part.frame ? toLocal(frames[part.frame], pw) : pw;
  let d;
  switch (part.kind) {
    case 'sphere': d = len(sub(p, part.c)) - part.r; break;
    case 'ellipsoid': {
      const q = sub(p, part.c), r = part.size;
      const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
      const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
      d = (k0 * (k0 - 1)) / Math.max(k1, 1e-4);
      break;
    }
    case 'capsule':
    case 'limb': {
      const pa = sub(p, part.a), ba = sub(part.b, part.a);
      const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
      d = len(sub(pa, mul(ba, h))) - (part.r + (part.r2 - part.r) * h);
      break;
    }
    case 'box': {
      const q = sub(p, part.c).map((v, i) => Math.abs(v) - part.size[i]);
      const o = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
      d = o + Math.min(Math.max(q[0], q[1], q[2]), 0) - part.r;
      break;
    }
    case 'torus': {
      const q = sub(p, part.c);
      d = Math.hypot(Math.hypot(q[0], q[2]) - part.size[0], q[1]) - part.size[1];
      break;
    }
    default: d = 1e5;
  }
  if (part.clip) for (const c of part.clip) d = Math.max(d, c.h - dot(c.n, p));
  return d;
}

export function layerDistance(parts, p, frames, layers) {
  let d = 1e5;
  for (const part of parts) {
    if (layers && !layers.includes(part.layer)) continue;
    const x = partDistance(part, p, frames);
    if (part.op === 'subtract') d = smax(d, -x, part.blend);
    else if (part.op === 'intersect') d = smax(d, x, part.blend);
    else d = smin(d, x, part.blend);
  }
  return d;
}

export function makeField(parts, frames, layers) {
  // Pre-group by layer so blends never cross layers (same as the shader).
  const groups = {};
  for (const p of parts) if (!layers || layers.includes(p.layer)) (groups[p.layer] ||= []).push(p);
  const list = Object.values(groups);
  return (p) => {
    let d = 1e5;
    for (const g of list) d = Math.min(d, layerDistance(g, p, frames));
    return d;
  };
}

export function gradient(f, p, e = 1e-4) {
  return norm([
    f(add(p, [e, 0, 0])) - f(sub(p, [e, 0, 0])),
    f(add(p, [0, e, 0])) - f(sub(p, [0, e, 0])),
    f(add(p, [0, 0, e])) - f(sub(p, [0, 0, e])),
  ]);
}

/**
 * Find the surface by marching from `anchor + dir*reach` back toward the anchor.
 * Returns { point, normal } or null.
 */
export function projectToSurface(f, anchor, dir, reach = 0.35) {
  const d = norm(dir);
  const start = add(anchor, mul(d, reach));
  const back = mul(d, -1);
  if (f(start) <= 0) return null; // started inside some other part: no clean hit
  let t = 0;
  for (let i = 0; i < 96; i++) {
    const p = add(start, mul(back, t));
    const h = f(p);
    if (h < 2e-4) return { point: p, normal: gradient(f, p) };
    t += Math.max(h * 0.9, 2e-4);
    if (t > reach * 2) break;
  }
  return null;
}
