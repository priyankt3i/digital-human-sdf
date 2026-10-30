// Figure study: feminine proportions in a relaxed contrapposto stance.
//
// The width sliders were fitted to a reference photo's silhouette with
// tools/fit-silhouette.mjs. Measured as fractions of standing height:
//   outer shoulder breadth 0.232, narrowest waist 0.141 (at 0.67 H),
//   widest hip 0.211 (at 0.52 H)  ->  waist/hip width ratio 0.67.
// Weight on the right leg: the right hip rises, the shoulders counter-tilt,
// and the left knee softens to keep the foot on the floor.
export default {
  name: 'Figure Study',
  body: {
    form: 1,
    softness: 0.45,
    height: 1.68,
    shoulderWidth: 0.8,
    bust: 0.6,
    waist: 0.96,
    hips: 0.92,
    muscle: 0.95,
    legLength: 1.1,
    neckLength: 1.06,
  },
  face: { cheekbones: 1.1, lipFullness: 1.05 },
  pose: {
    armSpread: 12,
    elbowBend: 12,
    fingerCurl: 22,
    legSpread: 3,
    weightShift: 0.7,
    headYaw: -8,
    headPitch: 4,
  },
  look: { hair: 'long', suit: 'bodysuit', gloves: false, markers: 'none', seams: true },
  materials: { skin: '#c9977a', suit: '#d8c8ad', hair: '#5a3424', seam: '#bfae92', lip: '#a35f58' },
};
