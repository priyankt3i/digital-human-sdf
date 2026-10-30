// Head-mounted camera rig for facial capture, built with extend().
// extend(h, rig, util) runs after the anatomy is generated:
//   h    - the part builder (sphere, ellipsoid, capsule, limb, box, torus, with, remove)
//   rig  - joints and frames (rig.head, rig.arms[±1], rig.legs[±1], rig.s)
//   util - { vec, design, headPoint(x, y, z) } ; headPoint maps reference-space
//          head coordinates (a 1.75 m figure) into the head frame.
export default {
  name: 'Facial Capture',
  body: { height: 1.72, shoulderWidth: 0.96 },
  pose: { armSpread: 10, elbowBend: 15, headYaw: 14, headPitch: 4 },
  look: { hair: 'bob', suit: 'mocap', markers: 'sparse' },
  materials: { skin: '#c48d6b', hair: '#3b2416', accent: '#ff5d5d' },

  extend(h, rig, { headPoint: H }) {
    const k = rig.headScale;
    h.with({ frame: 'head', region: 'helmet', material: 'suit' }, () => {
      // headband ring around the cranium
      h.torus(H(0, 1.69, 0.012), 0.092 * k, 0.008 * k, { name: 'headband' });
      // boom arm from the right temple down to the front of the face
      h.limb(H(0.09, 1.67, 0.0), H(0.075, 1.6, -0.1), 0.005 * k, 0.004 * k, { material: 'seam', blend: 0.004 * k });
      h.limb(H(0.075, 1.6, -0.1), H(0.03, 1.575, -0.165), 0.004 * k, 0.0035 * k, { material: 'seam', blend: 0.004 * k });
      // camera body + glowing lens
      h.box(H(0.022, 1.575, -0.175), [0.018 * k, 0.012 * k, 0.014 * k], 0.003 * k, { material: 'seam', blend: 0.003 * k, name: 'camera' });
      h.sphere(H(0.022, 1.575, -0.19), 0.006 * k, { material: 'accent', name: 'lens' });
    });
  },
};
