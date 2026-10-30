// The part builder: the public API for authoring geometry.
// Every primitive becomes a plain data record ("part"). The compiler turns the
// list into GLSL; field.js evaluates the same list on the CPU.

import { materialIndex } from './schema.js';

export const LAYERS = ['body', 'eyes', 'hair', 'seams', 'markers', 'extra'];
const KINDS = ['sphere', 'ellipsoid', 'capsule', 'limb', 'box', 'torus'];

export class Builder {
  constructor() {
    this.parts = [];
    this.frames = {};
    this.ctx = [{ layer: 'body', material: 'skin', blend: 0, frame: null, region: 'misc', op: 'union' }];
  }

  get state() { return this.ctx[this.ctx.length - 1]; }

  /** Register a named local frame (origin + axes) that parts can be authored in. */
  frame(name, f) { this.frames[name] = f; return this; }

  /** Run fn with overridden defaults (layer, material, blend, frame, region, op). */
  with(opts, fn) {
    this.ctx.push({ ...this.state, ...opts });
    try { fn(this); } finally { this.ctx.pop(); }
    return this;
  }

  _push(kind, geom, opts = {}) {
    const st = { ...this.state, ...opts };
    if (!KINDS.includes(kind)) throw new Error(`Unknown primitive ${kind}`);
    if (!this.frames[st.frame] && st.frame) throw new Error(`Unknown frame "${st.frame}"`);
    if (!LAYERS.includes(st.layer)) throw new Error(`Unknown layer "${st.layer}". Use: ${LAYERS.join(', ')}`);
    const part = {
      kind, ...geom,
      layer: st.layer,
      material: st.material,
      mat: materialIndex(st.material),
      blend: +st.blend || 0,
      op: st.op || 'union',
      frame: st.frame || null,
      region: st.region || 'misc',
      clip: opts.clip || st.clip || null,
      name: opts.name || null,
    };
    for (const k of ['c', 'a', 'b', 'size']) if (part[k]) part[k] = part[k].map(Number);
    this.parts.push(part);
    return part;
  }

  sphere(c, r, o) { return this._push('sphere', { c, r }, o); }
  ellipsoid(c, size, o) { return this._push('ellipsoid', { c, size }, o); }
  capsule(a, b, r, o) { return this._push('capsule', { a, b, r, r2: r }, o); }
  /** Tapered capsule from a (radius r1) to b (radius r2). */
  limb(a, b, r1, r2, o) { return this._push('limb', { a, b, r: r1, r2 }, o); }
  /** Rounded box centered at c with half-extents size and corner radius r. */
  box(c, size, r = 0, o) { return this._push('box', { c, size, r }, o); }
  /** Torus centered at c around the local Y axis: ring radius R, tube radius r. */
  torus(c, R, r, o) { return this._push('torus', { c, size: [R, r, 0], r }, o); }

  /** Remove parts matching a predicate (e.g. by name or region). */
  remove(pred) { this.parts = this.parts.filter((p) => !pred(p)); return this; }
  find(pred) { return this.parts.filter(pred); }
}
