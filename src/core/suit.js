// Optical markers and suit seams, snapped onto the generated surface.
// Marker names follow the Vicon Plug-in Gait convention (L/R + landmark).

import { add, mul, lerp, toWorld, dirToWorld } from './vec.js';
import { makeField, projectToSurface } from './field.js';
import { headPoint, sideName } from './anatomy.js';

function markerAnchors(rig, density) {
  const { s, P } = rig;
  const out = [];
  const m = (name, anchor, dir, tier = 1) => out.push({ name, anchor, dir, tier });
  const head = rig.head;
  const Hw = (x, y, z) => toWorld(head, headPoint(rig, x, y, z));
  const Hd = (v) => dirToWorld(head, v);

  for (const side of rig.sides) {
    const n = sideName(side), A = rig.arms[side], L = rig.legs[side];
    m(`${n}FHD`, Hw(side * 0.045, 1.69, -0.04), Hd([side * 0.5, 0.35, -1]), 0);
    m(`${n}BHD`, Hw(side * 0.045, 1.69, 0.06), Hd([side * 0.5, 0.35, 1]), 0);
    m(`${n}SHO`, A.shoulder, [side * 0.25, 1, 0], 0);
    m(`${n}UPA`, lerp(A.shoulder, A.elbow, 0.5), [side, 0, 0.35], 1);
    m(`${n}ELB`, A.elbow, [side, 0, 0.25], 0);
    m(`${n}FRA`, lerp(A.elbow, A.wrist, 0.5), [side, 0, -0.25], 1);
    m(`${n}WRA`, A.wrist, A.hand.Z, 0);
    m(`${n}WRB`, A.wrist, mul(A.hand.Z, -1), 1);
    m(`${n}FIN`, toWorld(A.hand, [0, 0.07 * s, 0]), A.hand.X, 1);
    m(`${n}ASI`, P(side * 0.1, 0.98, 0), [side * 0.3, 0.15, -1], 0);
    m(`${n}PSI`, P(side * 0.05, 0.99, 0), [side * 0.2, 0.15, 1], 0);
    m(`${n}THI`, lerp(L.hip, L.knee, 0.55), [side, 0, -0.35], 1);
    m(`${n}KNE`, L.knee, [side, 0, 0], 0);
    m(`${n}TIB`, lerp(L.knee, L.ankle, 0.55), [side, 0, -0.35], 1);
    m(`${n}ANK`, L.ankle, [side, 0, 0], 0);
    m(`${n}HEE`, add(L.ankle, [0, -0.035 * s, 0]), [0, 0, 1], 1);
    m(`${n}TOE`, [L.ankle[0] + side * 0.006 * s, 0.03 * s, L.ankle[2] - 0.13 * s], [0, 1, -0.3], 0);
    // dense extras
    m(`${n}UPA2`, lerp(A.shoulder, A.elbow, 0.3), [side * 0.3, 0, -1], 2);
    m(`${n}FRA2`, lerp(A.elbow, A.wrist, 0.7), [side * 0.3, 0, 1], 2);
    m(`${n}THI2`, lerp(L.hip, L.knee, 0.35), [side * 0.2, 0, 1], 2);
    m(`${n}TIB2`, lerp(L.knee, L.ankle, 0.35), [side * 0.2, 0, -1], 2);
    m(`${n}CHST`, P(side * 0.09, 1.33, 0), [0, 0, -1], 2);
    m(`${n}BACK`, P(side * 0.09, 1.15, 0), [0, 0, 1], 2);
  }
  m('C7', P(0, 1.45, 0.02), [0, 0.35, 1], 0);
  m('T10', P(0, 1.2, 0), [0, 0, 1], 1);
  m('CLAV', P(0, 1.42, 0), [0, 0.25, -1], 0);
  m('STRN', P(0, 1.27, 0), [0, 0, -1], 1);
  m('RBAK', P(0.08, 1.3, 0), [0.3, 0, 1], 1);

  const maxTier = { sparse: 0, standard: 1, dense: 2 }[density] ?? 1;
  return out.filter((a) => a.tier <= maxTier);
}

export function buildMarkers(h, rig, d, frames) {
  if (d.look.markers === 'none') return [];
  const field = makeField(h.parts, frames, ['body', 'hair', 'extra']);
  const r = 0.0075 * rig.s * d.look.markerSize;
  const placed = [];
  h.with({ layer: 'markers', material: 'marker', frame: null }, () => {
    for (const a of markerAnchors(rig, d.look.markers)) {
      const hit = projectToSurface(field, a.anchor, a.dir);
      if (!hit) continue;
      const c = add(hit.point, mul(hit.normal, r * 0.8));
      h.sphere(c, r, { region: regionOf(a.name), name: a.name });
      placed.push({ name: a.name, position: c, normal: hit.normal });
    }
  });
  return placed;
}

function regionOf(name) {
  if (/HD$/.test(name)) return 'head';
  const side = name[0] === 'L' || name[0] === 'R' ? name[0] : '';
  if (/SHO|UPA|ELB|FRA|WR|FIN/.test(name)) return `arm${side}`;
  if (/THI|KNE|TIB/.test(name)) return `leg${side}`;
  if (/ANK|HEE|TOE/.test(name)) return `foot${side}`;
  return 'torso';
}

export function buildSeams(h, rig, d, frames) {
  if (d.look.suit === 'none' || !d.look.seams) return;
  const field = makeField(h.parts, frames, ['body']);
  const { s, P } = rig;
  const r = 0.0022 * s;
  const paths = [];
  const path = (region, samples) => paths.push({ region, samples });
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));

  if (d.look.suit === 'mocap') path('torso', range(9, (t) => [P(0, 1.405 - t * 0.47, 0), [0, 0, -1]]));
  for (const side of rig.sides) {
    const n = sideName(side), A = rig.arms[side], L = rig.legs[side];
    path('torso', range(8, (t) => [P(side * 0.05, 1.31 - t * 0.33, 0), [side, 0, 0.05]]));
    path('torso', range(5, (t) => [lerp(P(side * 0.07, 1.44, 0.01), A.shoulder, 0.1 + t * 0.85), [0, 1, 0.1]]));
    path(`arm${n}`, range(9, (t) => {
      const p = t < 0.5 ? lerp(A.shoulder, A.elbow, t * 2) : lerp(A.elbow, A.wrist, (t - 0.5) * 2);
      return [p, [side, 0.15, 0]];
    }));
    path(`leg${n}`, range(10, (t) => {
      const u = 0.06 + t * 0.9;
      const p = u < 0.5 ? lerp(L.hip, L.knee, u * 2) : lerp(L.knee, L.ankle, (u - 0.5) * 2);
      return [p, [side, 0, 0]];
    }));
  }

  h.with({ layer: 'seams', material: 'seam', frame: null }, () => {
    for (const p of paths) {
      const pts = p.samples
        .map(([a, dir]) => projectToSurface(field, a, dir, 0.13))
        .filter(Boolean)
        .map((hit) => add(hit.point, mul(hit.normal, r * 0.35)));
      for (let i = 0; i + 1 < pts.length; i++) h.capsule(pts[i], pts[i + 1], r, { region: p.region });
    }
    // collar ring
    const neckBase = P(0, 1.452, 0.012);
    h.torus(neckBase, 0.057 * s, 0.0045 * s, { region: 'torso', name: 'collar' });
  });
}
