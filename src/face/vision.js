// In-browser computer vision via MediaPipe Tasks (Apache-2.0).
// Loaded lazily from a CDN the first time someone measures a face. Images are
// processed locally: nothing is uploaded.

const VERSION = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

// selfie_multiclass_256x256 categories
export const SEG = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5 };

let loading = null;

async function create(Cls, fileset, options) {
  try {
    return await Cls.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch {
    return Cls.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

/** Load MediaPipe once. Returns { landmarker, segmenter }. */
export function loadVision(onStatus = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    onStatus('Loading face models (about 8 MB, first time only)…');
    const mp = await import(/* @vite-ignore */ `${BASE}/vision_bundle.mjs`);
    const fileset = await mp.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const landmarker = await create(mp.FaceLandmarker, fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });
    const segmenter = await create(mp.ImageSegmenter, fileset, {
      baseOptions: { modelAssetPath: SEG_MODEL },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    onStatus('Face models ready.');
    return { landmarker, segmenter };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Face landmarks (478 points) + head yaw in degrees, or null if no face. */
export function detectFace(vision, image) {
  const res = vision.landmarker.detect(image);
  if (!res.faceLandmarks || !res.faceLandmarks.length) return null;
  let yaw = null;
  const m = res.facialTransformationMatrixes?.[0]?.data;
  if (m) yaw = (Math.atan2(m[8], m[10]) * 180) / Math.PI;
  return { landmarks: res.faceLandmarks[0], yaw };
}

/** Per-pixel category mask at the image's own resolution. */
export function segment(vision, image) {
  const res = vision.segmenter.segment(image);
  const mask = res.categoryMask;
  const out = { data: mask.getAsUint8Array().slice(), width: mask.width, height: mask.height };
  mask.close?.();
  res.close?.();
  return out;
}

/** Load a File/Blob/URL into a canvas, downscaled so the long side is <= maxSide. */
export async function toCanvas(src, maxSide = 1024) {
  // createImageBitmap decodes off the render loop, so it also works in background tabs
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const w0 = bitmap.width, h0 = bitmap.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Resample a category mask to the canvas size (nearest neighbour). */
export function maskToSize(mask, w, h) {
  if (mask.width === w && mask.height === h) return mask.data;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / h));
    for (let x = 0; x < w; x++) out[y * w + x] = mask.data[sy * mask.width + Math.min(mask.width - 1, Math.floor((x * mask.width) / w))];
  }
  return out;
}
