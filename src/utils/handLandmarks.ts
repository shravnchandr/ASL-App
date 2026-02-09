/**
 * Hand landmark utilities for ASL classification.
 */

// 21 hand landmarks × 3 coordinates (x, y, z) = 63 features
export const NUM_LANDMARKS = 21;
export const NUM_FEATURES = NUM_LANDMARKS * 3;

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ScalerParams {
  mean: number[];
  scale: number[];
}

/**
 * Flatten hand landmarks to a 1D array of [x0, y0, z0, x1, y1, z1, ...].
 */
export function flattenLandmarks(landmarks: HandLandmark[]): number[] {
  const result: number[] = [];
  for (const lm of landmarks) {
    result.push(lm.x, lm.y, lm.z);
  }
  return result;
}

/**
 * Apply StandardScaler normalization: (value - mean) / scale
 */
export function normalizeLandmarks(
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

/**
 * Process raw landmarks for model input.
 * Flattens and normalizes the landmarks.
 */
export function processLandmarksForModel(
  landmarks: HandLandmark[],
  scaler: ScalerParams
): Float32Array {
  const flattened = flattenLandmarks(landmarks);
  const normalized = normalizeLandmarks(flattened, scaler);
  return new Float32Array(normalized);
}

// MediaPipe hand connections for visualization
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17]
];
