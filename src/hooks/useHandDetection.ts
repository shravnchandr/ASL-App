import { useRef, useState, useCallback, useEffect } from 'react';
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

// Check if WebGL is available for GPU acceleration
const isWebGLAvailable = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

/**
 * Hook for hand detection using MediaPipe Tasks Vision API.
 */
export function useHandDetection(): UseHandDetectionResult {
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const [landmarks, setLandmarks] = useState<HandLandmark[] | null>(null);
  const [normalizedLandmarks, setNormalizedLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize MediaPipe Hand Landmarker
  useEffect(() => {
    let isMounted = true;

    const initHandLandmarker = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load the vision tasks WASM
        const vision = await FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM_PATH);

        // Create the hand landmarker with GPU if available, fallback to CPU
        const useGPU = isWebGLAvailable();
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
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

        if (isMounted) {
          handLandmarkerRef.current = handLandmarker;
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to initialize hand detection';
          setError(message);
          setIsLoading(false);
        }
      }
    };

    initHandLandmarker();

    return () => {
      isMounted = false;
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
    };
  }, []);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!handLandmarkerRef.current) {
      return;
    }

    try {
      const startTimeMs = performance.now();
      const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

      if (results.worldLandmarks && results.worldLandmarks.length > 0) {
        // Use world landmarks (3D coordinates in meters) for classification
        const worldLandmarks = results.worldLandmarks[0];
        const converted: HandLandmark[] = worldLandmarks.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        }));
        setLandmarks(converted);

        // Use normalized landmarks (0-1 range) for visualization
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
      // Silently ignore processing errors (frame drops are acceptable)
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
