// Sculpting base: no suit, no hair, no markers. Switch the viewport to
// "Clay" to judge pure form.
export default {
  name: 'Sculpt Base',
  body: { height: 1.75 },
  pose: { armSpread: 40, elbowBend: 12, fingerCurl: 10, legSpread: 8 },
  look: { hair: 'none', suit: 'none', markers: 'none' },
  materials: { skin: '#9c9c9c', lip: '#8f8a88', iris: '#3a3a3a' },
};
