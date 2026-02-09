import { useRef, useState, useCallback, useEffect } from 'react';

export type FacingMode = 'user' | 'environment';

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  facingMode: FacingMode;
  flipCamera: () => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

/**
 * Hook for managing camera stream via getUserMedia.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Stop any existing stream
      stopCamera();

      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error('Video element not available'));
            return;
          }

          const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('error', handleError);
            resolve();
          };

          const handleError = () => {
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('error', handleError);
            reject(new Error('Video failed to load'));
          };

          video.addEventListener('canplay', handleCanPlay);
          video.addEventListener('error', handleError);
        });

        await videoRef.current.play();
        setIsReady(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';

      // Provide user-friendly error messages
      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (message.includes('NotFoundError') || message.includes('DevicesNotFoundError')) {
        setError('No camera found. Please connect a camera and try again.');
      } else if (message.includes('NotReadableError') || message.includes('TrackStartError')) {
        setError('Camera is in use by another application.');
      } else {
        setError(message);
      }

      setIsReady(false);
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, stopCamera]);

  const flipCamera = useCallback(() => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Restart camera when facing mode changes (if already running)
  useEffect(() => {
    if (isReady) {
      startCamera();
    }
    // Only trigger on facingMode change, not on startCamera change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

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
