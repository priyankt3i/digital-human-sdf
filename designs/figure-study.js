// Figure study: feminine proportions in a relaxed contrapposto stance.
// Weight on the right leg: the right hip rises, the shoulders counter-tilt,
// and the left knee softens to keep the foot on the floor.
export default {
  name: 'Figure Study',
  body: {
    form: 1,
    softness: 0.45,
    height: 1.68,
    bust: 0.6,
    hips: 1.02,
    muscle: 0.95,
    neckLength: 1.06,
  },
  face: { cheekbones: 1.1, lipFullness: 1.1 },
  pose: {
    armSpread: 14,
    elbowBend: 14,
    fingerCurl: 22,
    legSpread: 3,
    weightShift: 0.85,
    headYaw: -8,
    headPitch: 4,
  },
  look: { hair: 'long', suit: 'bodysuit', gloves: false, markers: 'none', seams: true },
  materials: { skin: '#c9977a', suit: '#5b6470', hair: '#4a2c1c', seam: '#737d89', lip: '#a35f58' },
};
