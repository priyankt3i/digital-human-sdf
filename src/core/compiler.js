// Design -> rig -> parts -> GLSL. This is the whole pipeline.

import { normalizeDesign, MATERIALS, hexToRgb } from './schema.js';
import { buildRig } from './rig.js';
import { Builder, LAYERS } from './builder.js';
import { buildBody, buildHair, headPoint } from './anatomy.js';
import { buildMarkers, buildSeams } from './suit.js';
import { toWorld } from './vec.js';
import { PRIMITIVES, HEADER, RENDERER } from './glsl.js';
import * as vec from './vec.js';

/** Build the part list for a design (no GLSL yet). */
export function buildHuman(input) {
  const design = normalizeDesign(input);
  const rig = buildRig(design);
  const h = new Builder();
  h.frame('head', rig.head);
  h.frame('chest', rig.chest);
  h.frame('pelvis', rig.pelvis);
  h.frame('handL', rig.arms[-1].hand);
  h.frame('handR', rig.arms[1].hand);

  buildBody(h, rig, design);
  buildHair(h, rig, design);
  if (design.extend) {
    const util = { vec, design, headPoint: (x, y, z) => headPoint(rig, x, y, z) };
    h.with({ layer: 'extra', region: 'extra', material: 'accent' }, () => design.extend(h, rig, util));
  }
  buildSeams(h, rig, design, h.frames);
  const markers = buildMarkers(h, rig, design, h.frames);
  return { design, rig, parts: h.parts, frames: h.frames, markers };
}

// ---------------------------------------------------------------- GLSL emit
const f = (x) => {
  if (!Number.isFinite(x)) throw new Error(`Non-finite number in geometry: ${x}`);
  let s = (+x).toFixed(5).replace(/0+$/, '');
  if (s.endsWith('.')) s += '0';
  if (s === '-0.0') s = '0.0';
  return s;
};
const v3 = (a) => `vec3(${f(a[0])},${f(a[1])},${f(a[2])})`;

function localBounds(p) {
  const pad = (c, e) => [c.map((x, i) => x - e[i]), c.map((x, i) => x + e[i])];
  switch (p.kind) {
    case 'sphere': return pad(p.c, [p.r, p.r, p.r]);
    case 'ellipsoid': return pad(p.c, p.size);
    case 'box': return pad(p.c, p.size.map((x) => x + p.r));
    case 'torus': { const R = p.size[0] + p.size[1]; return pad(p.c, [R, p.size[1], R]); }
    default: {
      const r = Math.max(p.r, p.r2);
      return [p.a.map((x, i) => Math.min(x, p.b[i]) - r), p.a.map((x, i) => Math.max(x, p.b[i]) + r)];
    }
  }
}

function worldBounds(p, frames) {
  const [lo, hi] = localBounds(p);
  if (!p.frame) return [lo, hi];
  const F = frames[p.frame];
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < 8; i++) {
    const c = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    const w = toWorld(F, c);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
  }
  return [min, max];
}

function partExpr(p, q) {
  let e;
  switch (p.kind) {
    case 'sphere': e = `length(${q}-${v3(p.c)})-${f(p.r)}`; break;
    case 'ellipsoid': e = `sdEll(${q}-${v3(p.c)},${v3(p.size)})`; break;
    case 'capsule':
    case 'limb': e = `sdLimb(${q},${v3(p.a)},${v3(p.b)},${f(p.r)},${f(p.r2)})`; break;
    case 'box': e = `sdRBox(${q}-${v3(p.c)},${v3(p.size)},${f(p.r)})`; break;
    case 'torus': e = `sdTorus(${q}-${v3(p.c)},vec2(${f(p.size[0])},${f(p.size[1])}))`; break;
  }
  if (p.clip) for (const c of p.clip) e = `max(${e},${f(c.h)}-dot(${v3(c.n)},${q}))`;
  return e;
}

function combine(p, expr) {
  const k = p.blend;
  if (p.op === 'subtract') return k > 0 ? `d=smax(d,-(${expr}),${f(k)});` : `d=max(d,-(${expr}));`;
  if (p.op === 'intersect') return k > 0 ? `d=smax(d,${expr},${f(k)});` : `d=max(d,${expr});`;
  return k > 0 ? `d=smin(d,${expr},${f(k)});` : `d=min(d,${expr});`;
}

function groupRegions(parts, frames) {
  const regions = new Map();
  for (const p of parts) {
    if (!regions.has(p.region)) regions.set(p.region, { name: p.region, parts: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], blend: 0, frames: new Set() });
    const r = regions.get(p.region);
    r.parts.push(p);
    if (p.frame) r.frames.add(p.frame);
    if (p.op !== 'subtract') {
      const [lo, hi] = worldBounds(p, frames);
      for (let k = 0; k < 3; k++) {
        r.min[k] = Math.min(r.min[k], lo[k] - p.blend);
        r.max[k] = Math.max(r.max[k], hi[k] + p.blend);
      }
    }
    r.blend = Math.max(r.blend, p.blend);
  }
  return [...regions.values()].filter((r) => r.min[0] < 1e8);
}

function frameDecl(name) { return `F_${name}`; }

export function emitScene(parts, frames) {
  const lines = [];
  const usedFrames = [...new Set(parts.filter((p) => p.frame).map((p) => p.frame))];
  for (const name of usedFrames) {
    const F = frames[name];
    lines.push(`const vec3 ${frameDecl(name)}_O=${v3(F.origin)};`);
    lines.push(`const mat3 ${frameDecl(name)}_M=mat3(${[...F.X, ...F.Y, ...F.Z].map(f).join(',')});`);
  }
  const q = (p) => (p.frame ? `q_${p.frame}` : 'p');
  const frameLocals = (r) => [...r.frames].map((n) => `vec3 q_${n}=(p-${frameDecl(n)}_O)*${frameDecl(n)}_M;`).join('');

  const gmin = [1e9, 1e9, 1e9], gmax = [-1e9, -1e9, -1e9];
  const layerFns = [];
  for (const layer of LAYERS) {
    const matLines = [];
    const lp = parts.filter((p) => p.layer === layer);
    if (!lp.length) continue;
    const regions = groupRegions(lp, frames);
    const body = [];
    for (const r of regions) {
      for (let k = 0; k < 3; k++) { gmin[k] = Math.min(gmin[k], r.min[k]); gmax[k] = Math.max(gmax[k], r.max[k]); }
      const c = r.min.map((x, i) => (x + r.max[i]) / 2), he = r.max.map((x, i) => (x - r.min[i]) / 2);
      const margin = r.blend + 0.01;
      body.push(` { // ${layer}/${r.name}: ${r.parts.length} parts`);
      body.push(`  float bd=sdBound(p-${v3(c)},${v3(he)});`);
      body.push(`  if(bd>${f(margin)}) d=min(d,bd); else { ${frameLocals(r)}`);
      for (const p of r.parts) body.push(`   ${combine(p, partExpr(p, q(p)))}${p.name ? ` // ${p.name}` : ''}`);
      body.push('  }');
      body.push(' }');

      const solid = r.parts.filter((p) => p.op !== 'subtract');
      if (solid.length) {
        matLines.push(` if(sdBound(p-${v3(c)},${v3(he)})<best){ ${frameLocals(r)}`);
        for (const p of solid) matLines.push(`  x=${partExpr(p, q(p))}; if(x<best){best=x;id=${f(p.mat)};}`);
        matLines.push(' }');
      }
    }
    layerFns.push({
      layer,
      code: `float L_${layer}(vec3 p){\n float d=1e5;\n${body.join('\n')}\n return d;\n}\n` +
        `float M_${layer}(vec3 p){\n float best=1e5, id=1.0, x;\n${matLines.join('\n')}\n return id;\n}`,
    });
  }
  const pad = 0.02;
  const bmin = gmin.map((x) => x - pad), bmax = gmax.map((x) => x + pad);
  const bc = bmin.map((x, i) => (x + bmax[i]) / 2), bh = bmax.map((x, i) => (x - bmin[i]) / 2);

  const src = [
    `const vec3 BMIN=${v3(bmin)};`,
    `const vec3 BMAX=${v3(bmax)};`,
    ...lines,
    ...layerFns.map((l) => l.code),
    `float map(vec3 p){`,
    ` float bd=sdBound(p-${v3(bc)},${v3(bh)});`,
    ` if(bd>0.05) return bd;`,
    ` float d=1e5;`,
    ...layerFns.map((l) => ` d=min(d,L_${l.layer}(p));`),
    ` return d;`,
    `}`,
    `// material = nearest part inside the nearest layer (blends never leak across layers)`,
    `float matAt(vec3 p){`,
    ` float bd=1e5, x; int L=0;`,
    ...layerFns.map((l, i) => ` x=L_${l.layer}(p); if(x<bd){bd=x;L=${i};}`),
    ...layerFns.map((l, i) => ` if(L==${i}) return M_${l.layer}(p);`),
    ` return 1.0;`,
    `}`,
  ].join('\n');
  return { src, bounds: { min: bmin, max: bmax } };
}

/** Full pipeline: design -> fragment shader source + metadata. */
export function compileDesign(input) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const human = buildHuman(input);
  const scene = emitScene(human.parts, human.frames);
  const fragment = [HEADER, PRIMITIVES, '// ---- generated scene ----', scene.src, RENDERER].join('\n');
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const byLayer = {};
  for (const p of human.parts) byLayer[p.layer] = (byLayer[p.layer] || 0) + 1;
  return {
    ...human,
    fragment,
    sceneSource: scene.src,
    bounds: scene.bounds,
    materials: materialUniforms(human.design),
    target: [0, human.rig.s * 0.98, 0],
    stats: { parts: human.parts.length, byLayer, markers: human.markers.length, lines: fragment.split('\n').length, buildMs: t1 - t0 },
  };
}

export function materialUniforms(design) {
  const m = design.materials;
  const table = { eye: '#d9d6d0', ...m };
  return MATERIALS.flatMap((name) => hexToRgb(table[name]));
}

/** A self-contained Shadertoy version (turntable camera driven by iTime). */
export function toShadertoy(compiled, opts = {}) {
  const mats = compiled.materials;
  const matDecl = `vec3 uMat[9];\nvoid initMats(){\n${MATERIALS.map((n, i) => ` uMat[${i}]=vec3(${f(mats[i * 3])},${f(mats[i * 3 + 1])},${f(mats[i * 3 + 2])}); // ${n}`).join('\n')}\n}`;
  const header = `// ${compiled.design.name} — generated by digital-human-sdf\n// Paste into https://www.shadertoy.com/new\n` +
    `#define uLight ${f(opts.light ?? 1.0)}\n#define uScan ${f(opts.scan ? 1 : 0)}\n#define uFloor 1.0\n#define uMaxSteps 160\n#define uDebug 0\n` +
    `#define uTarget ${v3(compiled.target)}\n#define uJitter vec2(0.0)\n#define uCam vec3(iTime*0.35, 0.08, ${f(opts.distance ?? 3.6 * compiled.rig.s)})\n${matDecl}\n`;
  const body = RENDERER
    .replace('void main(){', 'void mainImage(out vec4 fragColor, in vec2 fragCoord){\n  initMats();')
    .replace('gl_FragCoord.xy', 'fragCoord')
    .replace('gl_FragColor', 'fragColor')
    .replace(/iResolution(?!\.)/g, 'iResolution.xy');
  return [header, PRIMITIVES, compiled.sceneSource, body].join('\n');
}
