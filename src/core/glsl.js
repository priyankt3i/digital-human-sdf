// GLSL building blocks: SDF primitives and the renderer that wraps the
// generated scene function. Written in GLSL ES 1.00 so it runs on WebGL 1 and 2.

export const PRIMITIVES = /* glsl */ `
float sdEll(vec3 q, vec3 r){
  float k0 = length(q / r), k1 = length(q / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}
float sdLimb(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r1, r2, h);
}
float sdRBox(vec3 q, vec3 b, float r){
  vec3 d = abs(q) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r;
}
float sdTorus(vec3 q, vec2 t){ return length(vec2(length(q.xz) - t.x, q.y)) - t.y; }
float sdBound(vec3 q, vec3 b){
  vec3 d = abs(q) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
`;

export const HEADER = /* glsl */ `
precision highp float;
uniform vec2  iResolution;
uniform float iTime;
uniform vec3  uCam;        // yaw, pitch, distance
uniform vec3  uTarget;
uniform vec2  uJitter;
uniform float uLight;
uniform float uScan;
uniform float uFloor;
uniform int   uMaxSteps;
uniform int   uDebug;      // 0 lit, 1 clay, 2 normals, 3 materials, 4 cost
uniform vec3  uMat[9];
`;

export const RENDERER = /* glsl */ `
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// ---------------------------------------------------------------- materials
// 0 eye, 1 skin, 2 suit, 3 hair, 4 marker, 5 seam, 6 lip, 7 iris, 8 accent
vec3 matColor(float id){
  if (id < 0.5) return uMat[0];
  if (id < 1.5) return uMat[1];
  if (id < 2.5) return uMat[2];
  if (id < 3.5) return uMat[3];
  if (id < 4.5) return uMat[4];
  if (id < 5.5) return uMat[5];
  if (id < 6.5) return uMat[6];
  if (id < 7.5) return uMat[7];
  return uMat[8];
}

vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0004;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float softShadow(vec3 ro, vec3 rd, float maxt){
  float res = 1.0, t = 0.012;
  for (int i = 0; i < 40; i++){
    float h = map(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.006, 0.12);
    if (res < 0.01 || t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.008 + 0.03 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 3.2 * occ, 0.0, 1.0);
}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

const vec3 KEY  = vec3(-0.50, 0.80, -0.62);
const vec3 FILL = vec3( 0.75, 0.25, -0.45);
const vec3 RIM  = vec3( 0.35, 0.45,  0.95);

vec3 shade(vec3 p, vec3 n, vec3 rd, float id){
  vec3 base = matColor(id);
  if (uDebug == 1) { base = vec3(0.42); id = 2.0; }
  vec3 v = -rd;
  vec3 lk = normalize(KEY), lf = normalize(FILL), lr = normalize(RIM);
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float occ = calcAO(p, n);
  float sh = softShadow(p + n * 0.002, lk, 2.5);
  vec3 keyCol = vec3(1.0, 0.95, 0.88) * 2.4 * uLight;
  vec3 fillCol = vec3(0.55, 0.66, 0.85) * 0.55 * uLight;
  vec3 rimCol = vec3(0.65, 0.82, 1.0) * 1.1 * uLight;

  float nk = dot(n, lk);
  vec3 hk = normalize(lk + v);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0);

  vec3 col = vec3(0.0);
  bool isSkin = (id > 0.5 && id < 1.5) || (id > 5.5 && id < 6.5);
  if (isSkin) {
    float wrap = clamp((nk + 0.35) / 1.35, 0.0, 1.0);
    float sss = clamp(smoothstep(-0.35, 0.25, nk) - smoothstep(0.0, 0.8, nk), 0.0, 1.0);
    col += base * keyCol * wrap * mix(0.35, 1.0, sh);
    col += base * vec3(1.0, 0.28, 0.16) * keyCol * sss * 0.28;
    col += keyCol * pow(max(dot(n, hk), 0.0), 40.0) * 0.18 * fres * 4.0 * sh;
  } else if (id > 2.5 && id < 3.5) {
    vec3 T = normalize(vec3(0.0, 1.0, 0.0) - n * n.y + vec3(1e-4));
    float th = dot(T, hk);
    float aniso = pow(sqrt(max(1.0 - th * th, 0.0)), 70.0);
    float strands = 0.55 + 0.45 * vnoise(p * vec3(700.0, 60.0, 700.0));
    col += base * keyCol * clamp(nk * 0.8 + 0.2, 0.0, 1.0) * sh * strands;
    col += (keyCol * 0.05 + base * keyCol * 0.5) * aniso * sh * strands;
  } else if (id > 3.5 && id < 4.5) {
    col += base * keyCol * max(nk, 0.0) * 0.35 * sh;
    col += base * pow(nv, 3.0) * 1.35 * uLight;  // retroreflective glow
    col += keyCol * pow(max(dot(n, hk), 0.0), 90.0) * 0.6;
  } else if (id < 0.5 || (id > 6.5 && id < 7.5)) {
    col += base * keyCol * max(nk, 0.0) * 0.8 * sh;
    col += keyCol * pow(max(dot(n, hk), 0.0), 140.0) * 1.6 * sh;
  } else if (id > 7.5) {
    col += base * 2.0;
  } else {
    // fabric: lambert + sheen
    col += base * keyCol * max(nk, 0.0) * sh;
    col += mix(base, vec3(0.6, 0.7, 0.8), 0.5) * pow(1.0 - nv, 3.0) * 0.22 * uLight;
    col += keyCol * pow(max(dot(n, hk), 0.0), 18.0) * 0.035 * sh;
  }
  col += base * fillCol * clamp(dot(n, lf) * 0.7 + 0.3, 0.0, 1.0);
  col += rimCol * pow(clamp(dot(n, lr), 0.0, 1.0), 2.0) * pow(1.0 - nv, 2.5) * (isSkin ? 0.35 : 0.5);
  vec3 amb = mix(vec3(0.05, 0.045, 0.04), vec3(0.16, 0.19, 0.24), n.y * 0.5 + 0.5);
  col += base * amb * 0.9;
  col *= mix(0.25, 1.0, occ);

  if (uScan > 0.5) {
    float y = fract(iTime * 0.11) * (uTarget.y * 2.25);
    float band = exp(-abs(p.y - y) * 380.0);
    float trail = smoothstep(y + 0.0, y - 0.35, p.y) * step(p.y, y);
    vec3 acc = uMat[8];
    float lines = smoothstep(0.92, 1.0, abs(sin(p.y * 180.0)));
    col = mix(col, col * 0.6 + acc * 0.25 * lines, trail * 0.6);
    col += acc * band * 1.8;
  }
  return col;
}

vec3 background(vec3 rd, vec2 uv){
  float g = clamp(rd.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 c = mix(vec3(0.028, 0.032, 0.04), vec3(0.075, 0.09, 0.11), g);
  c += vec3(0.06, 0.08, 0.1) * exp(-dot(uv, uv) * 1.6) * 0.6;
  return c;
}

vec3 tonemap(vec3 x){
  x *= 0.9;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main(){
  vec2 frag = gl_FragCoord.xy + uJitter;
  vec2 uv = (frag - 0.5 * iResolution) / iResolution.y;
  float yaw = uCam.x, pitch = uCam.y, dist = uCam.z;
  vec3 ro = uTarget + dist * vec3(cos(pitch) * sin(yaw), sin(pitch), -cos(pitch) * cos(yaw));
  vec3 ww = normalize(uTarget - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.1 * ww);

  vec3 col = background(rd, uv);
  float tHit = 1e9; float steps = 0.0;
  vec2 bh = boxHit(ro, rd, BMIN, BMAX);
  if (bh.y > max(bh.x, 0.0)) {
    float t = max(bh.x, 0.0);
    for (int i = 0; i < 400; i++){
      if (i >= uMaxSteps) break;
      vec3 p = ro + rd * t;
      float h = map(p);
      steps += 1.0;
      if (h < 0.00025 * t) { tHit = t; break; }
      t += h * 0.9;
      if (t > bh.y) break;
    }
  }

  // studio floor
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  if (uFloor > 0.5 && tFloor < tHit) {
    vec3 gp = ro + rd * tFloor;
    float sh = softShadow(gp + vec3(0.0, 0.001, 0.0), normalize(KEY), 3.0);
    float md = map(gp);
    float contact = md > 0.049 ? 1.0 : clamp(md / 0.05, 0.0, 1.0);
    vec3 fc = vec3(0.05, 0.056, 0.066) * (0.35 + 0.65 * sh) * mix(0.35, 1.0, contact) * uLight;
    vec2 gq = abs(fract(gp.xz * 2.0) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.012 * tFloor, min(gq.x, gq.y));
    fc += uMat[8] * grid * 0.035 * exp(-length(gp.xz) * 0.6);
    float fade = exp(-length(gp.xz) * 0.22);
    col = mix(col, fc, fade);
  } else if (tHit < 1e8) {
    vec3 p = ro + rd * tHit;
    vec3 n = calcNormal(p);
    float id = matAt(p);
    if (uDebug == 2) col = n * 0.5 + 0.5;
    else if (uDebug == 3) col = matColor(id) * 0.5 + 0.5 * vec3(fract(id * 0.618), fract(id * 0.382 + 0.3), fract(id * 0.137 + 0.6));
    else col = shade(p, n, rd, id);
  }
  if (uDebug == 4) col = mix(vec3(0.05, 0.1, 0.4), vec3(1.0, 0.3, 0.1), clamp(steps / float(uMaxSteps), 0.0, 1.0)) * (steps > 0.0 ? 1.0 : 0.15);

  if (uDebug != 2 && uDebug != 3 && uDebug != 4) col = tonemap(col);
  col = pow(col, vec3(1.0 / 2.2));
  col *= 1.0 - 0.22 * dot(uv, uv);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const VERTEX = /* glsl */ `
attribute vec2 position;
void main(){ gl_Position = vec4(position, 0.0, 1.0); }
`;
