import { useRef, useState, useCallback, useEffect } from 'react';

export type FacingMode = 'user' | 'environment';

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  facingMode: FacingMode;
  flipCamera: () => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop());
}

/** Resolve once the video has metadata (or after a 5 s safety timeout). */
function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {  // already has metadata (e.g. previously attached)
      resolve();
      return;
    }

    // Use loadedmetadata + canplay: on Android Chrome and iOS Safari, canplay may
    // not fire for MediaStream sources; loadedmetadata is more reliable.
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };

    const onReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Video failed to load'));
    };

    // 5 s safety timeout — resolve (not reject) so the camera still starts
    // even if neither event fires (seen on some Android WebViews).
    const timer = setTimeout(onReady, 5000);

    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
  });
}

/**
 * Hook for managing camera stream via getUserMedia.
 *
 * Every start/stop bumps a generation counter. A start that resolves after a newer
 * start, a stop, or unmount sees a stale generation and stops the tracks it acquired,
 * so no stream outlives its owner. The hook alone restarts on facing-mode changes;
 * `startCamera` has a stable identity so callers' start effects don't re-fire on flip.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const wantsCameraRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const facingModeRef = useRef<FacingMode>(facingMode);
  facingModeRef.current = facingMode;

  const releaseStream = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  const stopCamera = useCallback(() => {
    generationRef.current += 1;  // invalidate any in-flight start
    wantsCameraRef.current = false;
    releaseStream();
    setIsLoading(false);
  }, [releaseStream]);

  const startCamera = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;
    wantsCameraRef.current = true;

    setIsLoading(true);
    setError(null);
    releaseStream();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingModeRef.current,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (!isCurrent()) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('Video element not available');
      video.srcObject = stream;

      await waitForVideoReady(video);
      if (!isCurrent()) return;  // the newer owner already released this stream

      await video.play();
      if (!isCurrent()) return;
      setIsReady(true);
    } catch (err) {
      if (!isCurrent()) {
        stopTracks(stream);
        return;
      }
      releaseStream();
      stopTracks(stream);

      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : 'Failed to access camera';

      if (name === 'NotAllowedError' || message.includes('Permission denied')) {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (name === 'NotFoundError' || message.includes('DevicesNotFoundError')) {
        setError('No camera found. Please connect a camera and try again.');
      } else if (name === 'NotReadableError' || message.includes('TrackStartError')) {
        setError('Camera is in use by another application.');
      } else {
        setError(message);
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [releaseStream]);

  const flipCamera = useCallback(() => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Sole owner of facing-mode restarts: only restart a camera someone asked for.
  const isFirstFacingRender = useRef(true);
  useEffect(() => {
    if (isFirstFacingRender.current) {
      isFirstFacingRender.current = false;
      return;
    }
    if (wantsCameraRef.current) {
      void startCamera();
    }
  }, [facingMode, startCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return {
    videoRef,
    isReady,
    isLoading,
    error,
    facingMode,
    flipCamera,
    startCamera,
    stopCamera,
  };
}
