// Mocap performer — the default design.
// Every field is optional; anything you leave out falls back to the schema
// default (see docs/DESIGN_API.md). Units: meters and degrees.

export default {
  name: 'Mocap Performer',

  body: {
    form: 0.0,          // 0 = masculine proportions, 1 = feminine
    softness: 0.3,      // 0 = lean, 1 = soft
    height: 1.75,
    shoulderWidth: 1.0,
    chest: 1.0,
    bust: 0.0,
    waist: 1.0,
    hips: 1.0,
    muscle: 1.0,
    armLength: 1.0,
    legLength: 1.0,
    neckLength: 1.0,
    headSize: 1.0,
  },

  face: {
    jaw: 1.0,
    cheekbones: 1.0,
    noseLength: 1.0,
    noseWidth: 1.0,
    browRidge: 1.0,
    lipFullness: 1.0,
    eyeSpacing: 1.0,
    earSize: 1.0,
  },

  pose: {
    armSpread: 12,
    armForward: 0,
    elbowBend: 8,
    fingerCurl: 15,
    legSpread: 4,
    weightShift: 0,     // -1 = weight on left leg, +1 = right (contrapposto)
    kneeBend: 0,
    headYaw: 0,
    headPitch: 0,
  },

  look: {
    hair: 'short',      // none | buzz | short | bob | long | bun
    suit: 'mocap',      // mocap | bodysuit | none
    gloves: true,
    markers: 'standard', // none | sparse | standard | dense
    markerSize: 1.0,
    seams: true,
  },

  materials: {
    skin: '#b07a5c',
    suit: '#15191f',
    hair: '#141110',
    marker: '#e8eef2',
    seam: '#39434f',
    lip: '#9a5a4c',
    iris: '#4a3426',
    accent: '#78dce8',
  },
};
