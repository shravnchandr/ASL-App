export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ScalerParams {
  mean: number[];
  scale: number[];
}

function flattenLandmarks(landmarks: HandLandmark[]): number[] {
  const result: number[] = [];
  for (const lm of landmarks) {
    result.push(lm.x, lm.y, lm.z);
  }
  return result;
}

/** Apply StandardScaler normalization: (value - mean) / scale */
function normalizeLandmarks(
  features: number[],
  scaler: ScalerParams
): number[] {
  if (features.length !== scaler.mean.length) {
    throw new Error(
      `Feature length (${features.length}) doesn't match scaler mean length (${scaler.mean.length})`
    );
  }

  return features.map((val, i) => (val - scaler.mean[i]) / scaler.scale[i]);
}

export function processLandmarksForModel(
  landmarks: HandLandmark[],
  scaler: ScalerParams
): Float32Array {
  const flattened = flattenLandmarks(landmarks);
  const normalized = normalizeLandmarks(flattened, scaler);
  return new Float32Array(normalized);
}

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // index
  [0, 9], [9, 10], [10, 11], [11, 12],    // middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [5, 9], [9, 13], [13, 17],              // palm
];

/**
 * Where a landmark (normalized to the full video frame) lands inside a box that
 * shows the video with `object-fit: cover`: the frame is scaled to fill the box
 * and the overflow is cropped equally on both sides. `mirror` flips x, matching
 * a CSS-mirrored selfie view.
 */
export function coverPoint(
  lm: { x: number; y: number },
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
  mirror = false
): { x: number; y: number } {
  const nx = mirror ? 1 - lm.x : lm.x;
  if (!videoWidth || !videoHeight) return { x: nx * boxWidth, y: lm.y * boxHeight };
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  return {
    x: nx * videoWidth * scale + (boxWidth - videoWidth * scale) / 2,
    y: lm.y * videoHeight * scale + (boxHeight - videoHeight * scale) / 2,
  };
}
