import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { compileDesign, buildHuman, toShadertoy } from '../src/core/compiler.js';
import { normalizeDesign, SCHEMA } from '../src/core/schema.js';
import { evaluateSource, setSourceValue } from '../src/core/source.js';
import { makeField } from '../src/core/field.js';
import { toWorld } from '../src/core/vec.js';
import { headPoint } from '../src/core/anatomy.js';

test('normalizeDesign fills defaults and clamps ranges', () => {
  const d = normalizeDesign({ body: { height: 9 }, look: { hair: 'mohawk' } });
  assert.equal(d.body.height, SCHEMA.body.fields.height.max);
  assert.equal(d.look.hair, 'short');
  assert.equal(d.pose.armSpread, SCHEMA.pose.fields.armSpread.default);
});

test('every example design compiles', async () => {
  const dir = resolve('designs');
  for (const f of await readdir(dir)) {
    const mod = await import(pathToFileURL(resolve(dir, f)).href);
    const c = compileDesign(mod.default);
    assert.ok(c.stats.parts > 80, `${f}: too few parts`);
    assert.match(c.fragment, /float map\(vec3 p\)/);
    assert.match(c.fragment, /float matAt\(vec3 p\)/);
    assert.doesNotMatch(c.fragment, /NaN|Infinity/, `${f}: non-finite constant`);
  }
});

test('feet rest on the floor and stature matches the requested height', () => {
  for (const height of [1.55, 1.75, 1.95]) {
    const h = buildHuman({ body: { height } });
    const body = makeField(h.parts, h.frames, ['body']);
    const ankle = h.rig.legs[1].ankle;
    // just above the floor under the foot is inside the body, just below is outside (clipped)
    assert.ok(body([ankle[0], 0.004, ankle[2] - 0.06]) < 0, 'foot should touch floor');
    const crown = toWorld(h.rig.head, headPoint(h.rig, 0, 1.743, 0.012));
    assert.ok(Math.abs(crown[1] - height) < 0.03 * height, `crown ${crown[1].toFixed(3)} vs ${height}`);
  }
});

test('head is roughly 1/7.5 of stature (adult canon)', () => {
  const h = buildHuman({});
  const top = toWorld(h.rig.head, headPoint(h.rig, 0, 1.743, 0.012))[1];
  const chin = toWorld(h.rig.head, headPoint(h.rig, 0, 1.505, -0.06))[1];
  const ratio = top / (top - chin);
  assert.ok(ratio > 7 && ratio < 8.2, `height/head = ${ratio.toFixed(2)}`);
});

test('knee bend keeps feet planted', () => {
  const h = buildHuman({ pose: { kneeBend: 60 } });
  for (const side of [-1, 1]) assert.ok(Math.abs(h.rig.legs[side].ankle[1] - 0.08 * h.rig.s) < 1e-9);
});

test('standard marker set places all Plug-in Gait markers on the surface', () => {
  const h = buildHuman({ look: { markers: 'standard' } });
  assert.equal(h.markers.length, 39);
  const field = makeField(h.parts, h.frames, ['body', 'hair']);
  for (const m of h.markers) {
    const d = field(m.position);
    assert.ok(d > 0 && d < 0.02, `${m.name} floats ${d.toFixed(4)} m off the surface`);
  }
});

test('marker densities are ordered', () => {
  const n = (markers) => buildHuman({ look: { markers } }).markers.length;
  assert.ok(n('sparse') < n('standard') && n('standard') < n('dense'));
  assert.equal(n('none'), 0);
});

test('extend() adds custom parts', () => {
  const h = buildHuman({
    extend(b, rig) { b.sphere([0, 2.2 * rig.s, 0], 0.05, { name: 'halo', material: 'accent' }); },
  });
  assert.ok(h.parts.some((p) => p.name === 'halo' && p.layer === 'extra'));
});

test('source editing round-trips through sliders', () => {
  const src = `export default {\n  name: 'X',\n  body: {\n    height: 1.75,\n  },\n  extend(h) { /* keep me */ },\n};\n`;
  let s = setSourceValue(src, 'body', 'height', 1.8);
  s = setSourceValue(s, 'body', 'muscle', 1.2);
  s = setSourceValue(s, 'look', 'hair', 'bob');
  s = setSourceValue(s, 'materials', 'hair', '#ff0000');
  const d = evaluateSource(s);
  assert.equal(d.body.height, 1.8);
  assert.equal(d.body.muscle, 1.2);
  assert.equal(d.look.hair, 'bob');
  assert.equal(d.materials.hair, '#ff0000');
  assert.match(s, /keep me/);
});

test('shadertoy export has a mainImage entry point', () => {
  const st = toShadertoy(compileDesign({}));
  assert.match(st, /void mainImage\(out vec4 fragColor, in vec2 fragCoord\)/);
  assert.doesNotMatch(st, /gl_FragColor|uniform /);
});

// ---- body-form measurements: circumference by marching rays in from outside ----
function slice(f, y) {
  const pts = [];
  for (let a = 0; a < 360; a += 4) {
    const r = (a * Math.PI) / 180, dx = Math.cos(r), dz = Math.sin(r);
    let t = 0.5;
    for (let i = 0; i < 200; i++) { const d = f([dx * t, y, dz * t]); if (d < 1e-4) break; t -= Math.max(d, 1e-4); }
    pts.push([dx * t, dz * t]);
  }
  let c = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; c += Math.hypot(p[0] - q[0], p[1] - q[1]); }
  return { c, w: Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) };
}
function measure(form) {
  const h = buildHuman({ body: { form, height: 1.7 }, look: { suit: 'none', markers: 'none', hair: 'none' }, pose: { armSpread: 60 } });
  const f = makeField(h.parts, h.frames, ['body']);
  const s = h.rig.s;
  let waist = Infinity, hip = 0, hipW = 0;
  for (let y = 1.0; y <= 1.2; y += 0.01) waist = Math.min(waist, slice(f, y * s).c);
  for (let y = 0.84; y <= 0.97; y += 0.01) { const r = slice(f, y * s); if (r.c > hip) { hip = r.c; hipW = r.w; } }
  const shoulders = h.rig.arms[1].shoulder[0] - h.rig.arms[-1].shoulder[0];
  return { whr: waist / hip, shoulderToHip: shoulders / hipW };
}

test('form changes the waist-to-hip ratio into typical adult ranges', () => {
  const male = measure(0), female = measure(1);
  assert.ok(male.whr > 0.8 && male.whr < 0.95, `male WHR ${male.whr.toFixed(2)}`);
  assert.ok(female.whr > 0.62 && female.whr < 0.76, `female WHR ${female.whr.toFixed(2)}`);
  assert.ok(male.shoulderToHip > 1.0, `male shoulder/hip ${male.shoulderToHip.toFixed(2)}`);
  assert.ok(female.shoulderToHip < 0.92, `female shoulder/hip ${female.shoulderToHip.toFixed(2)}`);
});

test('weight shift tilts the pelvis and keeps both feet on the floor', () => {
  for (const weightShift of [-1, -0.4, 0.6, 1]) {
    const h = buildHuman({ pose: { weightShift } });
    const L = h.rig.legs;
    for (const side of [-1, 1]) assert.ok(Math.abs(L[side].ankle[1] - 0.08 * h.rig.s) < 1e-6, `ankle ${side} lifted`);
    // standing-side hip is higher
    const stand = weightShift > 0 ? 1 : -1;
    assert.ok(L[stand].hip[1] > L[-stand].hip[1]);
    // segment lengths preserved by the IK
    for (const side of [-1, 1]) {
      const thigh = Math.hypot(...L[side].knee.map((v, i) => v - L[side].hip[i]));
      assert.ok(Math.abs(thigh - L[side].thighLen) < 1e-6);
    }
  }
});
