import { useState, useCallback, useEffect } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark } from '../utils/handLandmarks';

export interface NormalizedLandmark {
  x: number; // 0-1 range (percentage of video width)
  y: number; // 0-1 range (percentage of video height)
  z: number;
}

export interface UseHandDetectionResult {
  landmarks: HandLandmark[] | null; // World landmarks for classification
  normalizedLandmarks: NormalizedLandmark[] | null; // Screen landmarks for visualization
  isHandDetected: boolean;
  isLoading: boolean;
  error: string | null;
  processFrame: (video: HTMLVideoElement) => void;
}

// Pin to specific version to prevent breaking changes
const MEDIAPIPE_VERSION = '0.10.14';
const HAND_LANDMARKER_WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_LANDMARKER_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const isWebGLAvailable = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

// Module-level singleton — survives navigation, loads only once per session.
const _singleton = {
  landmarker: null as HandLandmarker | null,
  loadPromise: null as Promise<void> | null,
};

function getOrLoadHandLandmarker(): Promise<void> {
  if (_singleton.landmarker) return Promise.resolve();
  if (_singleton.loadPromise) return _singleton.loadPromise;

  _singleton.loadPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM_PATH);
    const useGPU = isWebGLAvailable();
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_LANDMARKER_MODEL_PATH,
        delegate: useGPU ? 'GPU' : 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    console.log(`Hand detection initialized with ${useGPU ? 'GPU' : 'CPU'} acceleration`);
    _singleton.landmarker = landmarker;
  })().catch(err => {
    _singleton.loadPromise = null; // allow retry on next mount
    throw err;
  });

  return _singleton.loadPromise;
}

/**
 * Hook for hand detection using MediaPipe Tasks Vision API.
 * The landmarker is loaded once per session and reused across mounts.
 */
export function useHandDetection(): UseHandDetectionResult {
  const [landmarks, setLandmarks] = useState<HandLandmark[] | null>(null);
  const [normalizedLandmarks, setNormalizedLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !_singleton.landmarker);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_singleton.landmarker) return; // already loaded, isLoading already false

    let isCurrent = true;

    getOrLoadHandLandmarker()
      .then(() => { if (isCurrent) setIsLoading(false); })
      .catch(err => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to initialize hand detection');
          setIsLoading(false);
        }
      });

    return () => { isCurrent = false; };
    // No close() — singleton persists for the session
  }, []);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!_singleton.landmarker) return;

    try {
      const startTimeMs = performance.now();
      const results = _singleton.landmarker.detectForVideo(video, startTimeMs);

      if (results.worldLandmarks && results.worldLandmarks.length > 0) {
        const worldLandmarks = results.worldLandmarks[0];
        const converted: HandLandmark[] = worldLandmarks.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        }));
        setLandmarks(converted);

        if (results.landmarks && results.landmarks.length > 0) {
          const normalized: NormalizedLandmark[] = results.landmarks[0].map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
          }));
          setNormalizedLandmarks(normalized);
        }

        setIsHandDetected(true);
      } else {
        setLandmarks(null);
        setNormalizedLandmarks(null);
        setIsHandDetected(false);
      }
    } catch (err) {
      console.warn('Hand detection frame processing error:', err);
    }
  }, []);

  return {
    landmarks,
    normalizedLandmarks,
    isHandDetected,
    isLoading,
    error,
    processFrame,
  };
}
