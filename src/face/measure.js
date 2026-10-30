// Pure face-measurement math. No DOM, no MediaPipe: easy to test.
//
// Front view: MediaPipe Face Mesh landmarks (468 + 10 iris points), as
// normalized {x, y} image coordinates. Every ratio is a length divided by
// another length on the same face, so camera distance and photo size cancel.
//
// Profile views: a "front contour" (how far forward the face reaches on each
// image row) taken from a segmentation mask, or from the model's distance
// field. Landmarks are found on the curve: nasion (deepest point above the
// nose), pronasale (nose tip, the most forward point), subnasale (deepest
// point under the nose) and pogonion (most forward chin point).

export const LM = {
  irisR: 468, irisL: 473,
  eyeOutR: 33, eyeInR: 133, eyeOutL: 263, eyeInL: 362,
  nasion: 168, noseTip: 1, subnasale: 2, alarR: 98, alarL: 327,
  mouthR: 61, mouthL: 291, lipTop: 0, lipInTop: 13, lipInBottom: 14, lipBottom: 17,
  chin: 152, zygR: 234, zygL: 454, jawR: 172, jawL: 397,
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Front-view ratios. `lm` is MediaPipe's landmark list, w/h the image size in px. */
export function frontRatios(lm, w, h) {
  if (!lm || lm.length < 468) throw new Error('Need the 468-point face mesh.');
  const p = (i) => [lm[i].x * w, lm[i].y * h];
  const hasIris = lm.length >= 478;
  const eyeR = hasIris ? p(LM.irisR) : mid(p(LM.eyeOutR), p(LM.eyeInR));
  const eyeL = hasIris ? p(LM.irisL) : mid(p(LM.eyeOutL), p(LM.eyeInL));
  const ipd = dist(eyeR, eyeL);
  const faceW = dist(p(LM.zygR), p(LM.zygL));
  const eyeMid = mid(eyeR, eyeL);
  const lower = dist(eyeMid, p(LM.chin));
  const eyeW = (dist(p(LM.eyeOutR), p(LM.eyeInR)) + dist(p(LM.eyeOutL), p(LM.eyeInL))) / 2;
  // yaw check: the nose tip should sit midway between the face edges
  const tip = p(LM.noseTip);
  const yawSkew = (dist(tip, p(LM.zygR)) - dist(tip, p(LM.zygL))) / faceW;
  return {
    ratios: {
      eyeSpacing: ipd / faceW,
      faceLength: lower / faceW,
      noseWidth: dist(p(LM.alarR), p(LM.alarL)) / faceW,
      mouthWidth: dist(p(LM.mouthR), p(LM.mouthL)) / faceW,
      jaw: dist(p(LM.jawR), p(LM.jawL)) / faceW,
      noseLength: dist(p(LM.nasion), p(LM.subnasale)) / lower,
      eyeSize: eyeW / ipd,
      lipFullness: dist(p(LM.lipTop), p(LM.lipBottom)) / lower,
    },
    yawSkew,
    points: { eyeR, eyeL, eyeMid, tip },
    ipdPx: ipd,
  };
}

/** Which design parameter each front ratio drives (all multiplicative, ~linear). */
export const FRONT_PARAMS = ['eyeSpacing', 'faceLength', 'noseWidth', 'mouthWidth', 'jaw', 'noseLength', 'eyeSize', 'lipFullness'];

const smooth = (a) => a.map((v, i) => {
  if (v === null) return null;
  let s = 0, n = 0;
  for (let k = -2; k <= 2; k++) { const u = a[i + k]; if (u !== null && u !== undefined) { s += u; n++; } }
  return s / n;
});

function argBy(arr, from, to, better) {
  let best = -1;
  for (let i = Math.max(0, Math.floor(from)); i <= Math.min(arr.length - 1, Math.ceil(to)); i++) {
    if (arr[i] === null) continue;
    if (best < 0 || better(arr[i], arr[best])) best = i;
  }
  return best;
}

/**
 * Analyze a profile.
 *   front[i] = how far forward the face reaches on row i (larger = more forward), or null
 *   back[i]  = how far back the head (incl. hair) reaches on row i (smaller = further back), or null
 * Rows run top to bottom. Units are arbitrary but must be the same for both arrays.
 */
export function analyzeProfile(front, back = null) {
  const f = smooth(front);
  const rows = f.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  if (rows.length < 20) throw new Error('Profile too small: no face found.');
  const t0 = rows[0], t1 = rows[rows.length - 1];
  // nose tip: most forward point in the middle 70% of the head (skips hair tufts and the chest)
  const prn = argBy(f, t0 + (t1 - t0) * 0.15, t0 + (t1 - t0) * 0.85, (a, b) => a > b);
  if (prn < 0) throw new Error('No nose tip found in profile.');
  // nasion: walk up the nose bridge from the tip. The bridge slopes back
  // steadily; the nasion is where that slope runs out (it flattens or turns
  // forward again at the brow). Then take the deepest point right around it.
  let nas = -1;
  {
    const limit = Math.max(t0 + 2, prn - (prn - t0) * 0.75);
    const slope = (i) => (f[i - 2] === null || f[i + 2] === null ? null : (f[i + 2] - f[i - 2]) / 4);
    let maxSlope = 0, run = 0;
    for (let i = prn - 3; i >= limit; i--) {
      const sl = slope(i);
      if (sl === null) break;
      maxSlope = Math.max(maxSlope, sl);
      run++;
      if (run > 4 && sl < 0.12 * maxSlope) {
        nas = argBy(f, i - 6, Math.min(prn - 3, i + 6), (a, b) => a < b);
        break;
      }
    }
  }
  if (nas < 0) throw new Error('No nasion found in profile.');
  const U = prn - nas; // nasion -> nose tip height: the unit for everything below
  if (U < 4) throw new Error('Profile too small to measure.');
  // subnasale: below the tip the contour drops steeply under the nose, then
  // levels off where the upper lip starts. Take the deepest point there.
  let sn = -1;
  {
    let maxDrop = 0, run = 0;
    for (let i = prn + 2; i <= Math.min(f.length - 3, prn + 0.9 * U); i++) {
      if (f[i - 2] === null || f[i + 2] === null) break;
      const drop = (f[i - 2] - f[i + 2]) / 4;
      maxDrop = Math.max(maxDrop, drop);
      run++;
      if (run > 2 && maxDrop > 0 && drop < 0.15 * maxDrop) {
        sn = argBy(f, i - 2, i + 0.12 * U, (a, b) => a < b);
        break;
      }
    }
  }
  // pogonion: skip past the lips to the labiomental fold, then the most forward chin point
  const fold = sn < 0 ? -1 : argBy(f, sn + 0.45 * U, sn + 1.0 * U, (a, b) => a < b);
  const pog = fold < 0 ? -1 : argBy(f, fold, sn + 1.5 * U, (a, b) => a > b);
  if (sn < 0 || pog < 0) throw new Error('Could not find the chin in profile.');
  const out = {
    landmarks: { top: t0, nasion: nas, pronasale: prn, subnasale: sn, pogonion: pog },
    ratios: {
      noseProjection: (f[prn] - f[sn]) / U,
      chinProjection: (f[pog] - f[sn]) / U,
    },
    unit: U,
  };
  if (back) {
    const b = smooth(back);
    if (b[nas] !== null && b[nas] !== undefined) out.ratios.headDepth = (f[nas] - b[nas]) / U;
  }
  return out;
}

export const PROFILE_PARAMS = ['noseProjection', 'chinProjection', 'headDepth'];

/**
 * Front and back contours from a category mask (Uint8Array, w*h).
 * faceClasses: category ids counted as face skin; headClasses: face + hair.
 * facing: +1 if the subject looks toward +x (right of image), -1 toward -x.
 */
export function maskContours(mask, w, h, faceClasses, headClasses, facing) {
  const front = new Array(h).fill(null), back = new Array(h).fill(null);
  for (let y = 0; y < h; y++) {
    let fx = null, bx = null;
    for (let x = 0; x < w; x++) {
      const c = mask[y * w + x];
      const xf = facing > 0 ? x : w - 1 - x;
      if (faceClasses.includes(c)) fx = fx === null ? xf : Math.max(fx, xf);
      if (headClasses.includes(c)) bx = bx === null ? xf : Math.min(bx, xf);
    }
    front[y] = fx; back[y] = bx;
  }
  return { front, back };
}

/** Which way does a profile face? Face skin sits on the side away from most of the hair. */
export function profileFacing(mask, w, h, skinClasses, hairClasses) {
  const skin = [].concat(skinClasses), hair = [].concat(hairClasses);
  let fx = 0, fn = 0, hx = 0, hn = 0;
  // only the upper half of the image: shoulders and chest would pull the skin centroid
  const yMax = Math.floor(h * 0.6);
  for (let i = 0; i < w * yMax; i++) {
    const x = i % w;
    if (skin.includes(mask[i])) { fx += x; fn++; } else if (hair.includes(mask[i])) { hx += x; hn++; }
  }
  if (!fn) return 0;
  if (!hn) return 0;
  return fx / fn >= hx / hn ? 1 : -1;
}

/**
 * Multiplicative update for one parameter given target and current ratios.
 * gain < 1 damps oscillation; result is clamped by the caller.
 */
export function updateParam(value, target, current, gain = 0.9) {
  if (!(current > 0) || !(target > 0)) return value;
  return value * Math.pow(target / current, gain);
}

/** Hair style guess from the back view's hair mask: tall narrow masks are long hair. */
export function guessHair(mask, w, h, hairClass) {
  let top = h, bottom = -1, maxW = 0, count = 0;
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++) if (mask[y * w + x] === hairClass) { if (lo < 0) lo = x; hi = x; count++; }
    if (lo >= 0) { top = Math.min(top, y); bottom = y; maxW = Math.max(maxW, hi - lo); }
  }
  if (bottom < 0 || maxW < 4) return { style: 'none', aspect: 0 };
  const aspect = (bottom - top) / maxW;
  const fill = count / ((bottom - top + 1) * maxW);
  let style = aspect > 1.45 ? 'long' : aspect > 1.08 ? 'bob' : 'short';
  if (style === 'short' && fill < 0.35) style = 'buzz';
  return { style, aspect, fill };
}

/** Median color (hex) of pixels whose mask class is in `classes`. */
export function medianColor(rgba, mask, classes, step = 2) {
  const r = [], g = [], b = [];
  for (let i = 0; i < mask.length; i += step) {
    if (!classes.includes(mask[i])) continue;
    const j = i * 4;
    const lum = rgba[j] + rgba[j + 1] + rgba[j + 2];
    if (lum < 40 || lum > 740) continue; // skip deep shadow and blown highlights
    r.push(rgba[j]); g.push(rgba[j + 1]); b.push(rgba[j + 2]);
  }
  if (!r.length) return null;
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  return '#' + [med(r), med(g), med(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
