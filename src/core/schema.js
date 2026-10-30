// The design schema: every tunable property of a digital human, its default,
// range and UI group. The studio builds its sliders from this table, the
// compiler fills missing values from it, and docs/DESIGN_API.md mirrors it.

export const SCHEMA = {
  body: {
    label: 'Body',
    fields: {
      form:          { type: 'number', default: 0, min: 0, max: 1, step: 0.01, unit: '', label: 'Form (masculine – feminine)' },
      softness:      { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, unit: '', label: 'Softness (lean – soft)' },
      height:        { type: 'number', default: 1.75, min: 1.45, max: 2.05, step: 0.01, unit: 'm', label: 'Height' },
      shoulderWidth: { type: 'number', default: 1.0, min: 0.8, max: 1.3, step: 0.01, label: 'Shoulder width' },
      chest:         { type: 'number', default: 1.0, min: 0.8, max: 1.35, step: 0.01, label: 'Chest' },
      bust:          { type: 'number', default: 0.0, min: 0, max: 1, step: 0.01, unit: '', label: 'Bust' },
      waist:         { type: 'number', default: 1.0, min: 0.75, max: 1.4, step: 0.01, label: 'Waist' },
      hips:          { type: 'number', default: 1.0, min: 0.8, max: 1.35, step: 0.01, label: 'Hips' },
      muscle:        { type: 'number', default: 1.0, min: 0.7, max: 1.45, step: 0.01, label: 'Muscle / girth' },
      armLength:     { type: 'number', default: 1.0, min: 0.88, max: 1.12, step: 0.01, label: 'Arm length' },
      legLength:     { type: 'number', default: 1.0, min: 0.88, max: 1.12, step: 0.01, label: 'Leg length' },
      neckLength:    { type: 'number', default: 1.0, min: 0.75, max: 1.35, step: 0.01, label: 'Neck length' },
      headSize:      { type: 'number', default: 1.0, min: 0.85, max: 1.18, step: 0.01, label: 'Head size' },
    },
  },
  face: {
    label: 'Face',
    fields: {
      faceWidth:   { type: 'number', default: 1.0, min: 0.85, max: 1.2, step: 0.01, label: 'Face width' },
      faceLength:  { type: 'number', default: 1.0, min: 0.85, max: 1.2, step: 0.01, label: 'Lower face length' },
      headDepth:   { type: 'number', default: 1.0, min: 0.88, max: 1.12, step: 0.01, label: 'Head depth' },
      jaw:         { type: 'number', default: 1.0, min: 0.8, max: 1.25, step: 0.01, label: 'Jaw width' },
      cheekbones:  { type: 'number', default: 1.0, min: 0.6, max: 1.5, step: 0.01, label: 'Cheekbones' },
      noseLength:  { type: 'number', default: 1.0, min: 0.8, max: 1.25, step: 0.01, label: 'Nose length' },
      noseWidth:   { type: 'number', default: 1.0, min: 0.8, max: 1.3, step: 0.01, label: 'Nose width' },
      noseProjection: { type: 'number', default: 1.0, min: 0.75, max: 1.35, step: 0.01, label: 'Nose projection' },
      chinProjection: { type: 'number', default: 1.0, min: 0.7, max: 1.4, step: 0.01, label: 'Chin projection' },
      mouthWidth:  { type: 'number', default: 1.0, min: 0.8, max: 1.25, step: 0.01, label: 'Mouth width' },
      eyeSize:     { type: 'number', default: 1.0, min: 0.85, max: 1.2, step: 0.01, label: 'Eye size' },
      browRidge:   { type: 'number', default: 1.0, min: 0.5, max: 1.6, step: 0.01, label: 'Brow ridge' },
      lipFullness: { type: 'number', default: 1.0, min: 0.6, max: 1.5, step: 0.01, label: 'Lip fullness' },
      eyeSpacing:  { type: 'number', default: 1.0, min: 0.88, max: 1.12, step: 0.01, label: 'Eye spacing' },
      earSize:     { type: 'number', default: 1.0, min: 0.75, max: 1.3, step: 0.01, label: 'Ear size' },
    },
  },
  pose: {
    label: 'Pose',
    fields: {
      armSpread:  { type: 'number', default: 12, min: 0, max: 90, step: 1, unit: '°', label: 'Arm spread' },
      armForward: { type: 'number', default: 0, min: -30, max: 90, step: 1, unit: '°', label: 'Arm raise forward' },
      elbowBend:  { type: 'number', default: 8, min: 0, max: 130, step: 1, unit: '°', label: 'Elbow bend' },
      fingerCurl: { type: 'number', default: 15, min: 0, max: 90, step: 1, unit: '°', label: 'Finger curl' },
      legSpread:  { type: 'number', default: 4, min: 0, max: 30, step: 1, unit: '°', label: 'Leg spread' },
      weightShift: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, unit: '', label: 'Weight shift (left – right)' },
      kneeBend:   { type: 'number', default: 0, min: 0, max: 70, step: 1, unit: '°', label: 'Knee bend' },
      headYaw:    { type: 'number', default: 0, min: -60, max: 60, step: 1, unit: '°', label: 'Head turn' },
      headPitch:  { type: 'number', default: 0, min: -30, max: 30, step: 1, unit: '°', label: 'Head nod' },
    },
  },
  look: {
    label: 'Look',
    fields: {
      hair:       { type: 'enum', default: 'short', options: ['none', 'buzz', 'short', 'bob', 'long', 'bun'], label: 'Hair style' },
      suit:       { type: 'enum', default: 'mocap', options: ['mocap', 'bodysuit', 'none'], label: 'Suit' },
      gloves:     { type: 'bool', default: true, label: 'Gloves' },
      markers:    { type: 'enum', default: 'standard', options: ['none', 'sparse', 'standard', 'dense'], label: 'Markers' },
      markerSize: { type: 'number', default: 1.0, min: 0.6, max: 1.6, step: 0.05, label: 'Marker size' },
      seams:      { type: 'bool', default: true, label: 'Suit seams' },
    },
  },
  materials: {
    label: 'Materials',
    fields: {
      skin:   { type: 'color', default: '#b07a5c', label: 'Skin' },
      suit:   { type: 'color', default: '#15191f', label: 'Suit' },
      hair:   { type: 'color', default: '#141110', label: 'Hair' },
      marker: { type: 'color', default: '#e8eef2', label: 'Markers' },
      seam:   { type: 'color', default: '#39434f', label: 'Seams' },
      lip:    { type: 'color', default: '#9a5a4c', label: 'Lips' },
      iris:   { type: 'color', default: '#4a3426', label: 'Iris' },
      accent: { type: 'color', default: '#78dce8', label: 'Accent' },
    },
  },
};

/** Material slots, in uniform-array order. Index 0 is reserved for "eye white". */
export const MATERIALS = ['eye', 'skin', 'suit', 'hair', 'marker', 'seam', 'lip', 'iris', 'accent'];
export const materialIndex = (name) => {
  const i = MATERIALS.indexOf(name);
  if (i < 0) throw new Error(`Unknown material "${name}". Use one of: ${MATERIALS.join(', ')}`);
  return i;
};

/** Fill every missing field with its default and clamp numbers into range. */
export function normalizeDesign(input = {}) {
  const out = { name: input.name || 'Untitled human' };
  for (const [section, def] of Object.entries(SCHEMA)) {
    const src = input[section] || {};
    out[section] = {};
    for (const [key, f] of Object.entries(def.fields)) {
      let v = src[key];
      if (v === undefined || v === null) v = f.default;
      if (f.type === 'number') {
        v = Number(v);
        if (!Number.isFinite(v)) v = f.default;
        v = Math.min(f.max, Math.max(f.min, v));
      } else if (f.type === 'enum') {
        if (!f.options.includes(v)) v = f.default;
      } else if (f.type === 'bool') {
        v = Boolean(v);
      } else if (f.type === 'color') {
        if (!/^#[0-9a-f]{6}$/i.test(String(v))) v = f.default;
      }
      out[section][key] = v;
    }
  }
  if (typeof input.extend === 'function') out.extend = input.extend;
  return out;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  // sRGB -> linear so the shader lights in linear space
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2));
}
