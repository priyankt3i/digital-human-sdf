# Digital Human SDF

Design a digital human in code. A short JavaScript design file describes the
body, face, pose and wardrobe. A compiler turns it into a single raymarched
GLSL fragment shader. No meshes, textures or libraries.

**Live studio:** https://priyankt3i.github.io/digital-human-sdf/

```js
// designs/my-human.js
export default {
  name: 'Facial Capture',
  body: { height: 1.72, shoulderWidth: 0.96 },
  pose: { armSpread: 10, elbowBend: 15, headYaw: 14 },
  look: { hair: 'bob', suit: 'mocap', markers: 'sparse' },
  materials: { skin: '#c48d6b', accent: '#ff5d5d' },

  // add your own geometry on top of the generated anatomy
  extend(h, rig, { headPoint: H }) {
    const k = rig.headScale;
    h.with({ frame: 'head', material: 'suit' }, () => {
      h.torus(H(0, 1.69, 0.012), 0.092 * k, 0.008 * k);                 // headband
      h.box(H(0.022, 1.575, -0.175), [0.018 * k, 0.012 * k, 0.014 * k], 0.003 * k); // face camera
    });
  },
};
```

## What you get

- **A parametric body.** About 40 parameters cover proportions, face, pose,
  hair, suit and materials. Every one is a slider in the studio and a field in
  the design file.
- **Male and female forms.** A `form` slider (masculine to feminine) changes
  the proportions that actually differ by sex: shoulder and hip width, rib
  cage, waist height and taper, pelvic tilt, the outer hip and thigh curve,
  arm build and elbow angle, hand and foot size, and facial structure. A
  `softness` slider runs from lean to soft. The tests check the waist-to-hip
  ratio stays in typical adult ranges: about 0.85 male and 0.66 female.
- **A rig.** Shoulder, elbow, hip, knee and neck joints drive limbs, hands and
  head. A knee bend lowers the pelvis so the feet stay on the floor.
  `weightShift` gives a contrapposto stance: the hips tilt, the shoulders tilt
  the other way, and the relaxed leg bends to stay on the floor.
- **Markers that sit on the body.** The 39-marker Vicon Plug-in Gait set
  (plus sparse and dense variants) and the suit seams are projected onto the
  actual surface. You can export marker positions as CSV.
- **Code and sliders stay in sync.** Moving a slider rewrites the matching
  literal in your design file. Your comments and `extend()` code are kept.
- **Exports.** The design file, the fragment shader, a Shadertoy-ready
  shader, the marker CSV and a PNG.
- **A command-line compiler** for builds, CI and other engines.

## Run it

```bash
git clone https://github.com/priyankt3i/digital-human-sdf
cd digital-human-sdf
npm start            # http://localhost:8000 (zero dependencies)
npm test             # node:test suite: proportions, markers, compiler, source sync
```

Compile designs without a browser:

```bash
node tools/build.mjs designs/t-pose.js -o t-pose.frag.glsl
node tools/build.mjs designs/t-pose.js --shadertoy > shadertoy.glsl
node tools/build.mjs designs/t-pose.js --markers markers.csv
node tools/build.mjs designs/t-pose.js --stats
```

## Studio controls

| | |
|---|---|
| Drag | Orbit |
| Shift-drag or right-drag | Raise or lower the camera target |
| Wheel / pinch | Zoom |
| Double-click | Reset to the front view |
| Ctrl/⌘ + Enter in the editor | Run the design |
| Double-click a slider | Reset that value |

The Render tab has lit, clay, normals, materials and step-cost views, a
scanner sweep, a turntable, resolution scale and progressive supersampling.

## Project layout

```
index.html              studio shell
src/core/schema.js      every parameter: default, range, UI label
src/core/rig.js         proportions + pose -> joints, torso frames, leg IK
src/core/morph.js       masculine/feminine and lean/soft factors
src/core/anatomy.js     body, face, hands, feet, hair as SDF primitives
src/core/suit.js        mocap markers and seams snapped to the surface
src/core/builder.js     the primitive API used by anatomy and extend()
src/core/field.js       CPU distance field (snapping, tests)
src/core/compiler.js    parts -> GLSL with bounding regions and materials
src/core/glsl.js        primitives, lighting, camera, tonemapping
src/core/source.js      design file evaluation and in-place literal editing
src/render/renderer.js  WebGL, async shader compile, progressive AA
src/ui/                 controls and styles
designs/                example designs
tools/                  build CLI, dev server, screenshot script
legacy/v0-prototype.html  the original single-file prototype
```

Full field reference and the `extend()` API: [docs/DESIGN_API.md](docs/DESIGN_API.md).

## How anatomically accurate is it?

It is a well-proportioned mannequin, not an anatomical model.

**Accurate:**
- Landmark heights and segment lengths follow standard adult proportion
  tables, scaled from a 1.75 m reference. That covers the crown, chin,
  shoulder line, hip joint, knee and ankle.
- The head is about 1/7.5 of stature, and the tests check this.
- Marker placement follows Plug-in Gait landmark conventions.

**Approximate or missing:**
- Muscles are smooth blended volumes. There are no individual muscle bellies,
  tendons or bone landmarks.
- The face is a planar arrangement of features, not a sculpt. It has no
  expression rig.
- Fingers are capsule chains. Joints are hinge-only. There's no spine
  articulation, shoulder shrug or foot roll.
- Genitals, nails and teeth are not modeled.

For metric accuracy, the natural next step is fitting the parameters to a
statistical body model such as SMPL, or to scan data, and keeping this
renderer as the front end.

## Roadmap ideas

- Torso twist, spine bend, wrist and ankle rotation
- An expression layer (brows, lids, jaw open)
- Mesh export via marching cubes
- Animated poses driven from BVH or C3D marker data

## License

MIT
