// Skeleton: proportions + pose angles -> joint positions and local frames.
// Conventions: meters, Y up, feet on y = 0, the figure faces -Z.
// Reference anatomy is authored for a 1.75 m adult and scaled by s.
//
// The torso has two frames so it can counter-rotate (contrapposto):
//   pelvis frame  origin at the pelvis center, rolls with the hips
//   chest frame   origin at the waist, rolls the other way
// Arms hang from the chest frame, legs from the pelvis frame.

import { add, sub, mul, rotate, norm, cross, dot, orthoNorm, deg, frame, toWorld, len } from './vec.js';
import { morph } from './morph.js';

const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], DOWN = [0, -1, 0];
export const REF_HIP_Y = 0.91;   // hip-joint height of the reference figure
export const REF_PELVIS_Y = 0.95; // pelvis frame origin (reference)
export const REF_WAIST_Y = 1.12;  // chest frame origin (reference)
export const HEAD_ORIGIN_REF = [0, 1.53, 0.01]; // neck pivot in reference space

function rollFrame(origin, angle) {
  return frame(origin, rotate(X, Z, angle), rotate(Y, Z, angle), Z.slice());
}

/** Two-bone IK: thigh/shin directions that put the ankle at `target`, knee bending toward `pole`. */
function twoBone(hip, target, L1, L2, pole) {
  let dv = sub(target, hip);
  let d = len(dv);
  const maxD = (L1 + L2) * 0.9995;
  if (d > maxD) { dv = mul(norm(dv), maxD); d = maxD; }
  const dir = norm(dv);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const bend = orthoNorm(pole, dir);
  const thighDir = norm(add(mul(dir, cosA), mul(bend, sinA)));
  const knee = add(hip, mul(thighDir, L1));
  const ankle = add(hip, dv);
  return { thighDir, shinDir: norm(sub(ankle, knee)), knee, ankle };
}

export function buildRig(d) {
  const b = d.body, pose = d.pose;
  const m = morph(d);
  const s = b.height / 1.75;

  // ---- legs: the standing leg sets the pelvis height ----
  const thighLen = 0.42 * s * b.legLength;
  const shinLen = 0.41 * s * b.legLength;
  const ankleY = 0.08 * s;
  const knee = deg(pose.kneeBend);
  const ws = pose.weightShift;               // + = weight on the right leg (+X)
  const tilt = deg(7) * ws;                  // pelvis roll: standing-side hip rises
  const shift = 0.035 * s * ws;              // pelvis slides over the standing foot
  const hipHalf = 0.09 * b.hips * m.hipJoint * s;
  const hipOffset = (side) => rotate([side * hipHalf, (REF_HIP_Y - REF_PELVIS_Y) * s, 0], Z, tilt);

  const fk = (side) => {
    const spread = deg(pose.legSpread) * side;
    return {
      thighDir: rotate(rotate(DOWN, Z, spread), X, knee * 0.5),
      shinDir: rotate(rotate(DOWN, Z, spread * 0.55), X, -knee * 0.5),
    };
  };
  const standing = ws >= 0 ? 1 : -1;
  const st = fk(standing);
  const stOff = hipOffset(standing);
  const pelvisY = ankleY - st.thighDir[1] * thighLen - st.shinDir[1] * shinLen - stOff[1];
  const pelvisOrigin = [shift, pelvisY, 0];
  const pelvis = rollFrame(pelvisOrigin, tilt);

  const legs = {};
  for (const side of [-1, 1]) {
    const hip = add(pelvisOrigin, hipOffset(side));
    const f = fk(side);
    let L;
    if (side === standing || Math.abs(ws) < 1e-6) {
      const kn = add(hip, mul(f.thighDir, thighLen));
      L = { ...f, knee: kn, ankle: add(kn, mul(f.shinDir, shinLen)) };
      if (side !== standing) {
        // symmetric stance: plant this foot too
        L = twoBone(hip, [L.ankle[0], ankleY, L.ankle[2]], thighLen, shinLen, [0, 0, -1]);
      }
    } else {
      // relaxed leg: foot steps slightly in and forward, knee bends to reach the floor
      const nat = add(add(hip, mul(f.thighDir, thighLen)), mul(f.shinDir, shinLen));
      const target = [nat[0] - side * 0.03 * s * Math.abs(ws), ankleY, nat[2] - 0.07 * s * Math.abs(ws)];
      L = twoBone(hip, target, thighLen, shinLen, [0, 0.15, -1]);
    }
    legs[side] = { ...L, hip, thighLen, shinLen };
  }

  // ---- torso frames ----
  const T0 = (yRef) => (yRef - REF_PELVIS_Y) * s;  // reference height -> pelvis-local y
  const waistLocal = [0, T0(REF_WAIST_Y), 0];
  const chestOrigin = toWorld(pelvis, waistLocal);
  const chest = rollFrame(chestOrigin, -tilt * 0.6);  // shoulders roll against the hips

  /** Local coordinates (in the named torso frame) of a reference-space point. */
  const L = (frameName, x, yRef, z) => {
    const base = frameName === 'chest' ? REF_WAIST_Y : REF_PELVIS_Y;
    return [x * s, (yRef - base) * s, z * s];
  };
  /** World position of a reference-space torso point (frame chosen by height). */
  const P = (x, yRef, z) => {
    const name = yRef >= 1.04 ? 'chest' : 'pelvis';
    return toWorld(name === 'chest' ? chest : pelvis, L(name, x, yRef, z));
  };
  /** Legacy helper: world height of a reference height on the untilted axis. */
  const T = (yRef) => P(0, yRef, 0)[1];

  // ---- arms ----
  const upperLen = 0.30 * s * b.armLength;
  const foreLen = 0.26 * s * b.armLength;
  const arms = {};
  for (const side of [-1, 1]) {
    const spread = deg(pose.armSpread) * side;
    const fwd = deg(pose.armForward);
    const shoulder = toWorld(chest, L('chest', side * 0.185 * b.shoulderWidth * m.shoulder, 1.43, 0));
    const upperDir = rotate(rotate(DOWN, Z, spread), X, fwd);
    const hinge = rotate(rotate(X, Z, spread), X, fwd);
    const elbow = add(shoulder, mul(upperDir, upperLen));
    // carrying angle: forearm swings away from the body by a few degrees
    const bent = rotate(upperDir, hinge, deg(pose.elbowBend));
    const outward = orthoNorm(mul(hinge, side), bent);
    const carry = deg(m.carry - 10) * Math.cos(deg(pose.elbowBend));
    const foreDir = norm(rotate(bent, norm(cross(bent, outward)), carry));
    const wrist = add(elbow, mul(foreDir, foreLen));
    // hand frame: x = outward (back of hand), y = toward fingertips, z = forward (thumb side)
    const hy = foreDir;
    const hx = mul(orthoNorm(hinge, hy), side);
    const hz = mul(norm(cross(hx, hy)), side);
    arms[side] = { shoulder, elbow, wrist, upperDir, foreDir, upperLen, foreLen, hand: frame(wrist, hx, hy, hz) };
  }

  // ---- head ----
  const neckExtra = (b.neckLength - 1) * 0.09 * s;
  const headOrigin = add(toWorld(chest, L('chest', HEAD_ORIGIN_REF[0], HEAD_ORIGIN_REF[1], HEAD_ORIGIN_REF[2])), mul(chest.Y, neckExtra));
  const yaw = deg(pose.headYaw), pitch = -deg(pose.headPitch), roll = tilt * 0.4; // head re-levels against the chest roll
  const R = (v) => rotate(rotate(rotate(v, X, pitch), Y, yaw), Z, roll);
  const head = frame(headOrigin, R(X), R(Y), R(Z));
  const headScale = s * b.headSize;

  return { s, m, hipY: pelvisY, T, P, L, pelvis, chest, legs, arms, head, headScale, neckExtra, sides: [-1, 1] };
}
