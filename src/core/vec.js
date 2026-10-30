// Minimal vec3 / mat3 helpers. Vectors are plain [x, y, z] arrays.

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const mulv = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
export const deg = (d) => (d * Math.PI) / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Rotate vector v around unit axis k by angle a (Rodrigues). */
export function rotate(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

/** Component of v orthogonal to unit u, normalized. */
export function orthoNorm(v, u) {
  return norm(sub(v, mul(u, dot(v, u))));
}

/**
 * A frame is an origin plus three orthonormal world-space axes.
 * toLocal(p) = [dot(p-o, X), dot(p-o, Y), dot(p-o, Z)]
 */
export function frame(origin, X, Y, Z) {
  return { origin, X, Y, Z };
}
export function toWorld(f, p) {
  return add(f.origin, add(add(mul(f.X, p[0]), mul(f.Y, p[1])), mul(f.Z, p[2])));
}
export function toLocal(f, p) {
  const d = sub(p, f.origin);
  return [dot(d, f.X), dot(d, f.Y), dot(d, f.Z)];
}
export function dirToWorld(f, d) {
  return add(add(mul(f.X, d[0]), mul(f.Y, d[1])), mul(f.Z, d[2]));
}
