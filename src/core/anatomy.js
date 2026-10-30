// The default anatomy generator: rig + design -> parts.
// Reference measurements are for a 1.75 m adult (meters), scaled by the rig.
// Side +1 is the subject's right (+X), side -1 the subject's left.

import { add, sub, mul, lerp, norm, dot, toWorld, dirToWorld } from './vec.js';
import { HEAD_ORIGIN_REF } from './rig.js';

const sideName = (side) => (side > 0 ? 'R' : 'L');

/** Head-local coordinates from reference-space coordinates. */
export function headPoint(rig, x, y, z) {
  const k = rig.headScale;
  return [(x - HEAD_ORIGIN_REF[0]) * k, (y - HEAD_ORIGIN_REF[1]) * k, (z - HEAD_ORIGIN_REF[2]) * k];
}

export function buildBody(h, rig, d) {
  const { s, P, m } = rig;
  const b = d.body, pose = d.pose;
  const f = {
    ...d.face,
    jaw: d.face.jaw * m.jaw, browRidge: d.face.browRidge * m.brow, noseLength: d.face.noseLength * m.nose,
    noseWidth: d.face.noseWidth * m.nose, lipFullness: d.face.lipFullness * m.lips, cheekbones: d.face.cheekbones * m.cheek,
  };
  const suited = d.look.suit !== 'none';
  const cover = suited ? 'suit' : 'skin';
  const handMat = suited && d.look.gloves ? 'suit' : 'skin';
  const sw = b.shoulderWidth * m.shoulder, ch = b.chest, wa = b.waist * m.waist, hp = b.hips * m.pelvis, mu = b.muscle;
  const S = (...v) => v.map((x) => x * s);
  const C = (x, y, z) => rig.L('chest', x, y, z);
  const Pv = (x, y, z) => rig.L('pelvis', x, y, z);
  const bl = m.blend;

  // ---------------- chest + abdomen (chest frame) ----------------
  h.with({ layer: 'body', region: 'torso', material: cover, frame: 'chest' }, () => {
    h.ellipsoid(C(0, 1.395, 0.012), S(0.165 * sw, 0.085, 0.092 * ch * m.ribDepth), { blend: 0.045 * s * bl, name: 'shoulderGirdle' });
    h.ellipsoid(C(0, 1.27, 0.0), S(0.146 * ch * m.ribWidth, 0.165, 0.103 * ch * m.ribDepth), { blend: 0.06 * s * bl, name: 'ribcage' });
    h.ellipsoid(C(0, m.waistY, 0.006), S(0.157 * wa, 0.125, 0.114 * wa * m.belly), { blend: 0.07 * s * bl, name: 'abdomen' });
    const pecK = 1 - 0.35 * m.F;
    for (const side of rig.sides) {
      const n = sideName(side);
      h.ellipsoid(C(side * 0.068 * sw, 1.325, -0.052 * ch), S(0.074 * ch * pecK, 0.058 * pecK, 0.05 * ch * Math.sqrt(mu) * pecK), { blend: 0.04 * s, name: `pec${n}` });
      h.ellipsoid(C(side * 0.108 * sw, 1.25, 0.03), S(0.058 * mu * (1 - 0.25 * m.F), 0.12, 0.068), { blend: 0.05 * s * bl, name: `lat${n}` });
      if (b.bust > 0.02) {
        const k = b.bust;
        // upper slope: broad and shallow, blends smoothly into the chest
        h.ellipsoid(C(side * 0.083 * ch, 1.272, -0.068 * ch - 0.008 * k), S(0.05 + 0.012 * k, 0.048 + 0.01 * k, 0.03 + 0.016 * k), { blend: 0.06 * s, name: `bustUpper${n}` });
        // lower pole: fuller and rounder, small blend keeps the inframammary fold defined
        h.ellipsoid(C(side * 0.088 * ch, 1.246 - 0.012 * k, -0.068 * ch - 0.012 * k), S(0.048 + 0.018 * k, 0.04 + 0.015 * k, 0.03 + 0.016 * k), { blend: 0.04 * s, name: `bustLower${n}` });
      }
    }
  });

  // ---------------- pelvis, glutes, hips (pelvis frame) ----------------
  h.with({ layer: 'body', region: 'torso', material: cover, frame: 'pelvis' }, () => {
    h.ellipsoid(Pv(0, 0.955, 0.008 + m.pelvicTilt * 0.5), S(0.163 * hp, 0.11, 0.104 * b.hips), { blend: 0.06 * s * bl, name: 'pelvis' });
    h.ellipsoid(Pv(0, 1.0, -0.018), S(0.118 * hp, 0.07, 0.082 * m.belly), { blend: 0.05 * s, name: 'lowerAbdomen' });
    for (const side of rig.sides) {
      const n = sideName(side);
      h.ellipsoid(Pv(side * 0.07 * hp, 0.885, 0.052 * b.hips + m.pelvicTilt), S(0.08 * b.hips * m.glute, 0.085 * m.glute, 0.07 * b.hips * m.glute), { blend: 0.065 * s, name: `glute${n}` });
      if (m.hipPad > 0.02) {
        const k = 0.5 + 0.5 * Math.min(1.2, m.hipPad);
        h.ellipsoid(Pv(side * 0.132 * hp, 0.858, 0.012), S(0.05 * k, 0.12, 0.068 * k), { blend: 0.1 * s, name: `hipCurve${n}` });
      }
    }
  });

  // ---------------- shoulders + neck (world space between frames) ----------------
  h.with({ layer: 'body', region: 'torso', material: cover }, () => {
    for (const side of rig.sides) {
      const sh = rig.arms[side].shoulder;
      h.limb(P(side * 0.035, 1.465, 0.025), add(sh, S(-side * 0.03, 0.0, 0.01)), 0.042 * s * m.trapezius, 0.03 * s * m.trapezius, { blend: 0.045 * s, name: `trapezius${sideName(side)}` });
    }
  });
  h.with({ layer: 'body', region: 'torso', material: 'skin' }, () => {
    h.limb(P(0, 1.40, 0.012), add(rig.head.origin, dirToWorld(rig.head, [0, 0.02 * s, 0])), 0.054 * s * (0.92 + 0.08 * mu) * m.neck, 0.05 * s * m.neck, { blend: 0.035 * s, name: 'neck' });
  });

  // ---------------- head (authored in the head frame) ----------------
  // Reference landmarks (1.75 m figure, head-local reference space):
  //   crown y 1.743, eye line y 1.630, nasion y 1.636, subnasale ~y 1.59,
  //   mouth line y 1.5605, menton (chin bottom) ~y 1.505.
  // faceWidth scales x across the face, faceLength stretches everything below
  // the eye line, headDepth scales the cranium front-to-back.
  const H = (x, y, z) => headPoint(rig, x, y, z);
  const K = rig.headScale;
  const R = (...v) => v.map((x) => x * K);
  const es = f.eyeSpacing, fw = f.faceWidth, fl = f.faceLength, ez = f.eyeSize;
  const EYE_Y = 1.630;
  const LY = (y) => (y < EYE_Y ? EYE_Y - (EYE_Y - y) * fl : y); // lower-face stretch
  h.with({ layer: 'body', region: 'head', material: 'skin', frame: 'head' }, () => {
    const hd = f.headDepth;
    h.ellipsoid(H(0, 1.645, 0.012 + 0.03 * (hd - 1)), R(0.076 * (0.6 + 0.4 * fw), 0.098, 0.098 * hd), { name: 'cranium' });
    h.ellipsoid(H(0, LY(1.585), -0.022), R(0.056 * f.jaw * fw, 0.072 * fl, 0.072), { blend: 0.03 * K, name: 'face' });
    // maxilla / philtrum: keeps the area around the mouth convex so lips don't sit on a hollow
    h.ellipsoid(H(0, LY(1.577), -0.067), R(0.03 * fw, 0.022 * fl, 0.024), { blend: 0.02 * K, name: 'maxilla' });
    for (const side of rig.sides) {
      h.ellipsoid(H(side * 0.037 * f.jaw * fw, LY(1.548), 0.004), R(0.02 * fw, 0.026 * fl, 0.034), { blend: 0.032 * K, name: `jawAngle${sideName(side)}` }); // gonion: go-go ~105 mm
      const cb = 0.7 + 0.3 * f.cheekbones;
      h.ellipsoid(H(side * 0.041 * fw, 1.609, -0.054), R(0.025 * cb * fw, 0.016 * cb, 0.024 * cb), { blend: 0.03 * K, name: `cheek${sideName(side)}` }); // zygion: zy-zy ~135 mm
    }
    const cp = f.chinProjection;
    h.ellipsoid(H(0, LY(1.531), -0.067 - 0.012 * (cp - 1)), R(0.024 * f.jaw * fw, 0.02 * fl, 0.022 * cp).map((v) => v * m.chin), { blend: 0.022 * K, name: 'chin' });
    h.ellipsoid(H(0, 1.656, -0.076), R(0.058 * fw, 0.013 * f.browRidge, 0.015 * f.browRidge), { blend: 0.028 * K, name: 'brow' });

    // nose: length runs down from the nasion, projection pushes the tip forward
    const nl = f.noseLength, nw = f.noseWidth, np = f.noseProjection;
    const tip = H(0, LY(1.636 - 0.043 * nl), -0.103 - 0.004 * nl - 0.014 * (np - 1));
    h.limb(H(0, 1.634, -0.0795), tip, 0.0062 * K * nw, 0.0088 * K * nw, { blend: 0.01 * K, name: 'noseBridge' });
    h.ellipsoid(tip, R(0.0115 * nw, 0.0095, 0.0105), { blend: 0.008 * K, name: 'noseTip' });
    for (const side of rig.sides) {
      h.ellipsoid(add(tip, R(side * 0.0098 * nw, -0.0015, 0.0085 + 0.006 * (np - 1))), R(0.0075, 0.0068, 0.008), { blend: 0.008 * K, name: `ala${sideName(side)}` }); // al-al ~33 mm
    }

    // eye sockets
    for (const side of rig.sides) {
      h.sphere(H(side * 0.032 * es, EYE_Y, -0.085), 0.0175 * K * ez, { op: 'subtract', blend: 0.012 * K, name: `socket${sideName(side)}` });
    }
    // eyelids: upper lid hoods the eyeball, lower lid is a thin rim
    for (const side of rig.sides) {
      const x = side * 0.032 * es;
      h.ellipsoid(H(x, EYE_Y + 0.0095 * ez, -0.0732), R(0.0165 * ez, 0.0058 * ez, 0.0115 * ez), { blend: 0.004 * K, name: `upperLid${sideName(side)}` });
      h.ellipsoid(H(x, EYE_Y - 0.0088 * ez, -0.0725), R(0.0155 * ez, 0.0042 * ez, 0.0105 * ez), { blend: 0.004 * K, name: `lowerLid${sideName(side)}` });
    }

    // lips and mouth
    const lf = f.lipFullness, mw = f.mouthWidth;
    h.ellipsoid(H(0, LY(1.5655), -0.0895), R(0.024 * mw, 0.0052 * lf, 0.0068 * lf), { material: 'lip', blend: 0.005 * K, name: 'upperLip' });
    h.ellipsoid(H(0, LY(1.5555), -0.0875), R(0.022 * mw, 0.006 * lf, 0.007 * lf), { material: 'lip', blend: 0.005 * K, name: 'lowerLip' });
    h.capsule(H(-0.023 * mw, LY(1.5605), -0.0975), H(0.023 * mw, LY(1.5605), -0.0975), 0.0014 * K, { op: 'subtract', blend: 0.002 * K, name: 'mouthLine' });

    // ears
    for (const side of rig.sides) {
      const e = f.earSize;
      h.ellipsoid(H(side * 0.077 * (0.6 + 0.4 * fw), 1.628, 0.012), R(0.012, 0.031 * e, 0.02 * e), { blend: 0.008 * K, name: `ear${sideName(side)}` });
      h.sphere(H(side * (0.077 * (0.6 + 0.4 * fw) + 0.011), 1.626, 0.008), 0.011 * K * e, { op: 'subtract', blend: 0.004 * K, name: `concha${sideName(side)}` });
    }
  });

  // eyeballs + irises are their own layer so they never blend into skin
  h.with({ layer: 'eyes', region: 'head', frame: 'head' }, () => {
    for (const side of rig.sides) {
      h.sphere(H(side * 0.032 * es, EYE_Y, -0.0705), 0.0118 * K * ez, { material: 'eye', name: `eye${sideName(side)}` });
      h.sphere(H(side * 0.032 * es, EYE_Y, -0.0705 - 0.0073 * ez), 0.0056 * K * ez, { material: 'iris', name: `iris${sideName(side)}` });
    }
  });

  // ---------------- arms ----------------
  for (const side of rig.sides) {
    const A = rig.arms[side], n = sideName(side);
    h.with({ layer: 'body', region: `arm${n}`, material: cover }, () => {
      const sh = A.shoulder, el = A.elbow, wr = A.wrist;
      const am = mu * m.arm;
      h.ellipsoid(add(sh, S(side * 0.008, -0.012, 0)), S(0.047 * mu * m.deltoid, 0.058 * m.deltoid, 0.052 * mu * m.deltoid), { blend: 0.055 * s, name: `deltoid${n}` });
      const mid = lerp(sh, el, 0.45);
      h.limb(sh, mid, 0.046 * am * s, 0.043 * am * s, { blend: 0.045 * s, name: `upperArm${n}` });
      h.limb(mid, el, 0.043 * am * s, 0.034 * am * s, { blend: 0.045 * s, name: `upperArmLow${n}` });
      h.sphere(el, 0.032 * am * s, { blend: 0.035 * s, name: `elbow${n}` });
      const fm = lerp(el, wr, 0.3);
      h.limb(el, fm, 0.038 * am * s, 0.039 * am * s, { blend: 0.025 * s, name: `forearm${n}` });
      h.limb(fm, wr, 0.039 * am * s, 0.025 * s * m.hand, { blend: 0.025 * s, name: `forearmLow${n}` });
    });
    buildHand(h, rig, side, handMat, pose);
  }

  // ---------------- legs + feet ----------------
  for (const side of rig.sides) {
    const L = rig.legs[side], n = sideName(side);
    const hipTop = add(L.hip, add(mul(rig.pelvis.X, -side * 0.01 * s), mul(rig.pelvis.Y, 0.035 * s)));
    h.with({ layer: 'body', region: `leg${n}`, material: cover }, () => {
      const mid = lerp(L.hip, L.knee, 0.5);
      const kneeR = 0.05 * mu * m.knee * s;
      h.limb(hipTop, mid, 0.088 * mu * Math.pow(b.hips, 0.4) * m.thighUpper * s, 0.068 * mu * s * (0.97 + 0.03 * m.thighUpper), { blend: 0.065 * s, name: `thigh${n}` });
      h.limb(mid, L.knee, 0.068 * mu * s * (0.97 + 0.03 * m.thighUpper), kneeR, { blend: 0.045 * s, name: `thighLow${n}` });
      if (m.thighInner > 0.25) {
        // adductor / inner-thigh mass: fills the gap under the pelvis
        const inner = add(lerp(L.hip, L.knee, 0.26), mul(rig.pelvis.X, -side * 0.028 * s));
        h.ellipsoid(inner, S(0.05, 0.11, 0.06).map((v) => v * (0.6 + 0.4 * m.thighInner)), { blend: 0.045 * s, name: `innerThigh${n}` });
      }
      h.ellipsoid(add(L.knee, S(0, 0, -0.01)), S(0.044 * mu * m.knee, 0.05 * m.knee, 0.046 * mu * m.knee), { blend: 0.04 * s, name: `knee${n}` });
      h.limb(L.knee, L.ankle, 0.045 * mu * m.knee * s, 0.029 * s * m.foot, { blend: 0.045 * s, name: `shin${n}` });
      const calf = add(lerp(L.knee, L.ankle, 0.3), S(0, 0, 0.018));
      h.ellipsoid(calf, S(0.04 * mu * m.calf, 0.1, 0.04 * mu * m.calf), { blend: 0.05 * s, name: `calf${n}` });
      h.sphere(L.ankle, 0.032 * s * m.foot, { blend: 0.02 * s, name: `ankle${n}` });
    });
    const a = L.ankle;
    const floor = [{ n: [0, 1, 0], h: 0 }];
    h.with({ layer: 'body', region: `foot${n}`, material: cover, clip: floor }, () => {
      const k = m.foot, Sf = (...v) => v.map((x) => x * s * k);
      h.ellipsoid([a[0], 0.042 * s, a[2] + 0.012 * s * k], Sf(0.034, 0.042, 0.05), { blend: 0.02 * s, name: `heel${n}` });
      h.ellipsoid([a[0] + side * 0.005 * s, 0.035 * s, a[2] - 0.075 * s * k], Sf(0.043, 0.035, 0.1), { blend: 0.03 * s, name: `foot${n}` });
      h.ellipsoid([a[0] + side * 0.008 * s, 0.022 * s, a[2] - 0.16 * s * k], Sf(0.045, 0.022, 0.045), { blend: 0.015 * s, name: `toes${n}` });
    });
  }
}

function buildHand(h, rig, side, material, pose) {
  const s = rig.s * rig.m.hand, n = sideName(side);
  const curl = (pose.fingerCurl * Math.PI) / 180;
  const S = (...v) => v.map((x) => x * s);
  h.with({ layer: 'body', region: `hand${n}`, material, frame: `hand${n}` }, () => {
    h.limb(S(0, -0.012, 0), S(0, 0.022, 0), 0.025 * s, 0.021 * s, { blend: 0.015 * s, name: `wrist${n}` });
    h.box(S(0, 0.052, 0), S(0.008, 0.038, 0.032), 0.0095 * s, { blend: 0.015 * s, name: `palm${n}` });
    const zs = [0.025, 0.0085, -0.0085, -0.025];
    const lens = [0.075, 0.083, 0.078, 0.062];
    const rad = [0.0095, 0.0098, 0.0092, 0.0082];
    for (let i = 0; i < 4; i++) {
      let p = S(0, 0.092, zs[i]);
      const L = lens[i] * s, r0 = rad[i] * s;
      const splay = (i - 1.5) * 0.05;
      const segs = [[0.45, 0.6], [0.3, 1.3], [0.25, 1.9]];
      let r = r0;
      segs.forEach(([frac, k], j) => {
        const th = curl * k;
        const dir = norm([-Math.sin(th), Math.cos(th), splay]);
        const q = add(p, mul(dir, L * frac));
        const r2 = r * (j === 2 ? 0.85 : 0.93);
        h.limb(p, q, r, r2, { blend: (j === 0 ? 0.006 : 0.003) * s, name: `finger${i}_${j}${n}` });
        p = q; r = r2;
      });
    }
    const c = curl * 0.6;
    const t0 = S(-0.004, 0.018, 0.026);
    const t1 = S(-0.012 - 0.01 * c, 0.052, 0.044);
    const t2 = S(-0.02 - 0.018 * c, 0.08, 0.051 - 0.006 * c);
    const t3 = S(-0.026 - 0.026 * c, 0.102, 0.052 - 0.012 * c);
    h.limb(t0, t1, 0.014 * s, 0.011 * s, { blend: 0.012 * s, name: `thumb0${n}` });
    h.limb(t1, t2, 0.0105 * s, 0.0095 * s, { blend: 0.004 * s, name: `thumb1${n}` });
    h.limb(t2, t3, 0.0095 * s, 0.0082 * s, { blend: 0.003 * s, name: `thumb2${n}` });
  });
}

// ---------------- hair ----------------
export function buildHair(h, rig, d) {
  const style = d.look.hair;
  if (style === 'none') return;
  const H = (x, y, z) => headPoint(rig, x, y, z);
  const K = rig.headScale;
  const R = (...v) => v.map((x) => x * K);
  // tilted hairline plane: keep points where n.p >= h (front hairline high, nape low)
  const hairline = (yFront) => {
    const nrm = norm([0, 1, 0.74]);
    return { n: nrm, h: dot(nrm, H(0, yFront, -0.09)) };
  };
  const cap = (o, yFront, extraClip = []) =>
    h.ellipsoid(H(0, 1.645, 0.012), R(0.076 + o, 0.098 + o, 0.098 + o), { clip: [hairline(yFront), ...extraClip], name: 'hairCap' });

  h.with({ layer: 'hair', region: 'head', material: 'hair', frame: 'head' }, () => {
    if (style === 'buzz') {
      cap(0.0035, 1.712);
    } else if (style === 'short') {
      cap(0.011, 1.708);
      h.ellipsoid(H(0, 1.712, 0.0), R(0.07, 0.045, 0.085), { blend: 0.02 * K, clip: [hairline(1.72)], name: 'hairTop' });
      h.ellipsoid(H(0.012, 1.703, -0.074), R(0.06, 0.02, 0.03), { blend: 0.015 * K, name: 'fringe' });
    } else if (style === 'bob' || style === 'long') {
      cap(0.014, 1.71);
      const back = { n: [0, 0, 1], h: H(0, 0, -0.045)[2] };
      const bottom = { n: [0, 1, 0], h: H(0, 1.505, 0)[1] };
      h.ellipsoid(H(0, 1.6, 0.025), R(0.094, 0.1, 0.1), { blend: 0.02 * K, clip: [back, bottom], name: 'hairVolume' });
      h.ellipsoid(H(0, 1.70, -0.08), R(0.075, 0.028, 0.035), { blend: 0.018 * K, name: 'fringe' });
      if (style === 'long') {
        const low = { n: [0, 1, 0], h: H(0, 1.28, 0)[1] };
        h.ellipsoid(H(0, 1.44, 0.082), R(0.095, 0.18, 0.042), { blend: 0.035 * K, clip: [low], name: 'hairLength' });
      }
    } else if (style === 'bun') {
      cap(0.006, 1.712);
      h.sphere(H(0, 1.70, 0.098), 0.042 * K, { blend: 0.015 * K, name: 'bun' });
    }
  });
}

export { sideName, toWorld, sub };
