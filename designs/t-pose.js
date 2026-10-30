// Calibration T-pose: arms out, dense marker set, buzz cut.
export default {
  name: 'Calibration T-Pose',
  body: { height: 1.8, shoulderWidth: 1.06, muscle: 1.08 },
  pose: { armSpread: 88, elbowBend: 0, fingerCurl: 5, legSpread: 9 },
  look: { hair: 'buzz', suit: 'mocap', markers: 'dense', markerSize: 1.1 },
  materials: { skin: '#8d5a3f', suit: '#101318' },
};
