import { useState, useCallback, useEffect } from 'react';
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_WASM_PATH, HAND_LANDMARKER_MODEL_PATH, isWebGLAvailable } from './useHandDetection';
import { assignHandSlots, portraitCrop, type PhraseFrame, type Point } from '../utils/signPhrase';

export interface UseHolisticLandmarksResult {
  /**
   * Landmarks for one raw (unmirrored) video frame, centre-cropped to 3:4 portrait;
   * coordinates are fractions of that crop. Null when no pose is detected.
   */
  detect: (video: HTMLVideoElement, timestampMs: number) => PhraseFrame | null;
  isLoading: boolean;
  error: string | null;
}

const POSE_LANDMARKER_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const FACE_LANDMARKER_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

interface Landmarkers {
  pose: PoseLandmarker;
  hands: HandLandmarker;
  face: FaceLandmarker;
}

// Module-level singleton — survives navigation, loads only once per session.
// Separate from useHandDetection's landmarker: phrases need both hands.
const _singleton = {
  landmarkers: null as Landmarkers | null,
  loadPromise: null as Promise<void> | null,
};

function getOrLoadLandmarkers(): Promise<void> {
  if (_singleton.landmarkers) return Promise.resolve();
  if (_singleton.loadPromise) return _singleton.loadPromise;

  _singleton.loadPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
    const delegate = isWebGLAvailable() ? 'GPU' : 'CPU';
    const base = (modelAssetPath: string) => ({ baseOptions: { modelAssetPath, delegate }, runningMode: 'VIDEO' } as const);

    const [pose, hands, face] = await Promise.all([
      PoseLandmarker.createFromOptions(vision, { ...base(POSE_LANDMARKER_MODEL_PATH), numPoses: 1 }),
      HandLandmarker.createFromOptions(vision, { ...base(HAND_LANDMARKER_MODEL_PATH), numHands: 2 }),
      FaceLandmarker.createFromOptions(vision, { ...base(FACE_LANDMARKER_MODEL_PATH), numFaces: 1 }),
    ]);
    _singleton.landmarkers = { pose, hands, face };
  })().catch(err => {
    _singleton.loadPromise = null; // allow retry on next mount
    throw err;
  });

  return _singleton.loadPromise;
}

// Reused scratch canvas holding the 3:4 crop that MediaPipe sees
let _cropCanvas: HTMLCanvasElement | null = null;

function cropToPortrait(video: HTMLVideoElement): HTMLCanvasElement | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const crop = portraitCrop(video.videoWidth, video.videoHeight);
  const canvas = _cropCanvas ?? (_cropCanvas = document.createElement('canvas'));
  if (canvas.width !== crop.width || canvas.height !== crop.height) {
    canvas.width = crop.width;
    canvas.height = crop.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas;
}

const toPoints = (landmarks: { x: number; y: number; z: number }[]): Point[] =>
  landmarks.map(lm => [lm.x, lm.y, lm.z]);

/**
 * Hook for pose + both hands + face landmarks (MediaPipe Tasks), in the
 * normalised image coordinates the sign-phrase model was trained on.
 */
export function useHolisticLandmarks(): UseHolisticLandmarksResult {
  const [isLoading, setIsLoading] = useState(() => !_singleton.landmarkers);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_singleton.landmarkers) return; // already loaded, isLoading already false

    let isCurrent = true;

    getOrLoadLandmarkers()
      .then(() => { if (isCurrent) setIsLoading(false); })
      .catch(err => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to initialize body tracking');
          setIsLoading(false);
        }
      });

    return () => { isCurrent = false; };
    // No close() — singleton persists for the session
  }, []);

  const detect = useCallback((video: HTMLVideoElement, timestampMs: number): PhraseFrame | null => {
    const landmarkers = _singleton.landmarkers;
    if (!landmarkers) return null;

    try {
      // Training video was 3:4 portrait; a landscape frame would distort x against y
      const image = cropToPortrait(video);
      if (!image) return null;

      const poseResult = landmarkers.pose.detectForVideo(image, timestampMs);
      if (!poseResult.landmarks.length) return null;
      const pose = toPoints(poseResult.landmarks[0]);

      // `landmarks` (image coordinates), not `worldLandmarks`
      const handResult = landmarkers.hands.detectForVideo(image, timestampMs);
      const faceResult = landmarkers.face.detectForVideo(image, timestampMs);

      return {
        pose,
        ...assignHandSlots(handResult.landmarks.slice(0, 2).map(toPoints), pose),
        face: faceResult.faceLandmarks.length ? toPoints(faceResult.faceLandmarks[0]) : null,
      };
    } catch (err) {
      console.warn('Landmark frame processing error:', err);
      return null;
    }
  }, []);

  return { detect, isLoading, error };
}
