# Design API

A design is a plain ES module that exports one object. Everything is optional;
missing fields fall back to the defaults below and numbers are clamped to range.

```js
export default {
  name: 'My human',
  body: { height: 1.82, muscle: 1.1 },
  face: { jaw: 1.1 },
  pose: { armSpread: 30, headYaw: -15 },
  look: { hair: 'bob', suit: 'mocap', markers: 'standard' },
  materials: { skin: '#a8714f' },
  extend(h, rig, util) { /* add your own geometry */ },
};
```

Units are **meters** and **degrees**. The figure stands on `y = 0`, Y is up and
the figure faces **−Z**. Side `+1` (positive X) is the subject's right.

## Fields

### body

| key | default | range | notes |
|---|---|---|---|
| `form` | 0 | 0 – 1 | 0 = masculine, 1 = feminine proportions (see `src/core/morph.js`) |
| `softness` | 0.3 | 0 – 1 | lean to soft: hip, thigh, glute and arm fullness |
| `height` | 1.75 | 1.45 – 2.05 m | stature, floor to crown |
| `shoulderWidth` | 1.0 | 0.8 – 1.3 | biacromial width multiplier |
| `chest` | 1.0 | 0.8 – 1.35 | rib cage girth and depth |
| `bust` | 0 | 0 – 1 | adds breast volume |
| `waist` | 1.0 | 0.75 – 1.4 | |
| `hips` | 1.0 | 0.8 – 1.35 | pelvis, glutes, hip-joint spacing |
| `muscle` | 1.0 | 0.7 – 1.45 | limb and neck girth |
| `armLength` / `legLength` | 1.0 | 0.88 – 1.12 | segment-length multipliers |
| `neckLength` | 1.0 | 0.75 – 1.35 | |
| `headSize` | 1.0 | 0.85 – 1.18 | uniform head scale |

### face

`jaw`, `cheekbones`, `noseLength`, `noseWidth`, `browRidge`, `lipFullness`,
`eyeSpacing`, `earSize`: all multipliers around 1.0.

### pose

| key | default | range |
|---|---|---|
| `armSpread` | 12° | 0 – 90 (90 = T-pose) |
| `armForward` | 0° | −30 – 90 |
| `elbowBend` | 8° | 0 – 130 |
| `fingerCurl` | 15° | 0 – 90 |
| `legSpread` | 4° | 0 – 30 |
| `weightShift` | 0 | −1 – 1 (contrapposto: weight on left / right leg) |
| `kneeBend` | 0° | 0 – 70 (pelvis drops so feet stay planted) |
| `headYaw` | 0° | −60 – 60 |
| `headPitch` | 0° | −30 – 30 (positive looks down) |

### look

| key | values |
|---|---|
| `hair` | `none`, `buzz`, `short`, `bob`, `long`, `bun` |
| `suit` | `mocap` (with center zip), `bodysuit`, `none` (bare mannequin) |
| `gloves` | `true` / `false` (only with a suit) |
| `markers` | `none`, `sparse` (22), `standard` (39, Vicon Plug-in Gait names), `dense` (51) |
| `markerSize` | 0.6 – 1.6 (base radius 7.5 mm) |
| `seams` | `true` / `false` |

### materials

Hex colors for `skin`, `suit`, `hair`, `marker`, `seam`, `lip`, `iris`, `accent`.
Colors are shader uniforms, so changing them never recompiles the shader.

## extend(h, rig, util)

`extend` runs after the anatomy and hair are generated and before markers and
seams are snapped to the surface, so anything you add is respected by both.

### The builder `h`

| call | makes |
|---|---|
| `h.sphere(c, r, opts)` | sphere |
| `h.ellipsoid(c, [rx, ry, rz], opts)` | axis-aligned ellipsoid (in its frame) |
| `h.capsule(a, b, r, opts)` | capsule |
| `h.limb(a, b, r1, r2, opts)` | tapered capsule (cone with round caps) |
| `h.box(c, [hx, hy, hz], round, opts)` | rounded box |
| `h.torus(c, R, r, opts)` | ring around the local Y axis |
| `h.with(opts, fn)` | run `fn` with default `opts` |
| `h.remove(pred)` | delete generated parts, e.g. `p => p.name === 'earL'` |
| `h.find(pred)` | look up parts |

`opts`:

- `material`: `skin`, `suit`, `hair`, `marker`, `seam`, `lip`, `iris`, `eye`, `accent`
- `blend`: smooth-union radius in meters (0 = hard union)
- `op`: `union` (default), `subtract`, `intersect`
- `frame`: author in a local frame: `head`, `handL`, `handR` (or one you
  register with `h.frame(name, frame)`)
- `layer`: `body`, `eyes`, `hair`, `seams`, `markers`, `extra`. Parts only
  blend with parts in the same layer. `extend` defaults to `extra`.
- `clip`: `[{ n: [x, y, z], h }]` keeps only the half-space `dot(n, p) >= h`
- `name`, `region` (regions are bounding-box groups used for speed)

### The rig

```
rig.s                      scale factor (height / 1.75)
rig.P(x, yRef, z)          torso point from 1.75 m reference coordinates
rig.head                   { origin, X, Y, Z } head frame (follows yaw/pitch)
rig.headScale              s * headSize
rig.arms[±1]               { shoulder, elbow, wrist, upperDir, foreDir, hand }
rig.legs[±1]               { hip, knee, ankle, thighDir, shinDir }
rig.pelvis, rig.chest      torso frames (they roll with weightShift)
rig.m                      the form/softness factors from morph.js
```

### util

- `util.headPoint(x, y, z)` maps a point given in the 1.75 m reference head
  (crown ≈ y 1.743, eyes ≈ y 1.643, nose tip ≈ z −0.11) into the head frame,
  so accessories follow head turns and head size.
- `util.vec`: the small vector library (`add`, `sub`, `mul`, `lerp`, `norm`,
  `cross`, `rotate`, `toWorld`, …).
- `util.design`: the normalized design.

## How it renders

1. `buildRig` turns proportions and pose into joints and local frames.
2. `buildBody` / `buildHair` place about 100 primitives on the rig.
3. `extend` runs.
4. Seams and markers are projected onto the surface with a CPU copy of the
   distance field (`src/core/field.js`).
5. `emitScene` writes GLSL: one function per layer, grouped into
   bounding-box regions so the raymarcher skips far-away limbs, plus a
   material lookup that picks the nearest part in the nearest layer.
6. The renderer (`src/core/glsl.js`) adds lighting: wrap-lit skin with a
   subsurface tint, fabric sheen, anisotropic hair, retroreflective markers,
   soft shadows and ambient occlusion, then progressively supersamples still
   frames.
