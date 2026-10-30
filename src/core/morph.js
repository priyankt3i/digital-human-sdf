// Sexual dimorphism and body composition as explicit, documented factors.
//
// form     0 = typical adult male proportions, 1 = typical adult female proportions
// softness 0 = lean, 1 = soft (subcutaneous fat over hips, thighs, abdomen, arms)
//
// Values are ratios taken from common anthropometric summaries (e.g. ANSUR II,
// art-anatomy canons): female biacromial width ~0.9x male, bi-iliac / hip
// breadth ~1.05-1.1x relative to stature, waist-to-hip ratio ~0.7 vs ~0.9,
// larger elbow carrying angle (~15° vs ~10°), smaller hands and feet, more
// anterior pelvic tilt, and gynoid fat distribution (hips, outer thigh,
// buttocks) rather than android (abdomen). They are starting points to tune,
// not measurements of any one person.

const mix = (a, b, t) => a + (b - a) * t;

export function morph(design) {
  const F = design.body.form;
  const soft = design.body.softness;
  return {
    F, soft,
    shoulder: mix(1.0, 0.89, F),        // biacromial width
    ribWidth: mix(1.0, 0.9, F),
    ribDepth: mix(1.0, 0.93, F),
    waist: mix(1.0, 0.9, F),            // waist breadth (before the user's waist slider)
    waistY: mix(1.105, 1.12, F),        // natural waist sits a little higher
    pelvis: mix(1.0, 1.07, F),           // bi-iliac / hip breadth
    hipJoint: mix(1.0, 1.06, F),        // femoral head spacing
    pelvicTilt: mix(0.0, 0.012, F),     // glutes shifted back (m, reference scale)
    glute: mix(1.0, 1.12, F) * mix(0.95, 1.08, soft),
    hipPad: F * mix(0.35, 1.1, soft),   // trochanteric (outer hip) fat
    thighUpper: mix(1.0, 1.06, F) * mix(0.96, 1.06, soft),
    thighInner: mix(0.2, 1.0, F) * mix(0.6, 1.1, soft),
    knee: mix(1.0, 0.88, F),
    calf: mix(1.0, 0.9, F),
    arm: mix(1.0, 0.82, F) * mix(0.96, 1.05, soft),
    deltoid: mix(1.0, 0.78, F),
    trapezius: mix(1.0, 0.72, F),
    neck: mix(1.0, 0.84, F),
    carry: mix(10, 16, F),              // elbow carrying angle (degrees)
    hand: mix(1.0, 0.9, F),
    foot: mix(1.0, 0.9, F),
    belly: mix(1.0, 0.92, F) * mix(0.95, 1.08, soft),
    jaw: mix(1.0, 0.88, F),
    brow: mix(1.0, 0.5, F),
    chin: mix(1.0, 0.85, F),
    nose: mix(1.0, 0.88, F),
    lips: mix(1.0, 1.15, F),
    cheek: mix(1.0, 1.1, F),
    blend: mix(1.0, 0.8, F),            // crisper torso transitions read as a defined waist
  };
}
