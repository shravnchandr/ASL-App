import { useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { FacingMode } from '../../hooks/useCamera';
import type { NormalizedLandmark } from '../../hooks/useHandDetection';
import { HAND_CONNECTIONS } from '../../utils/handLandmarks';
import './CameraView.css';

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isLoading: boolean;
  facingMode: FacingMode;
  landmarks: NormalizedLandmark[] | null;
}

// Colors for hand visualization
const LANDMARK_COLOR = '#00FF88';
const CONNECTION_COLOR = 'rgba(0, 255, 136, 0.6)';
const LANDMARK_RADIUS = 5;
const CONNECTION_WIDTH = 2;

export function CameraView({ videoRef, isLoading, facingMode, landmarks }: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw hand landmarks on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    const updateCanvasSize = () => {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    updateCanvasSize();

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || landmarks.length === 0) return;

    // Mirror coordinates if using front camera
    const mirror = facingMode === 'user';

    // Draw connections first (so points are on top)
    ctx.strokeStyle = CONNECTION_COLOR;
    ctx.lineWidth = CONNECTION_WIDTH;
    ctx.lineCap = 'round';

    for (const [start, end] of HAND_CONNECTIONS) {
      const startLm = landmarks[start];
      const endLm = landmarks[end];
      if (!startLm || !endLm) continue;

      const startX = mirror ? (1 - startLm.x) * canvas.width : startLm.x * canvas.width;
      const startY = startLm.y * canvas.height;
      const endX = mirror ? (1 - endLm.x) * canvas.width : endLm.x * canvas.width;
      const endY = endLm.y * canvas.height;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // Draw landmark points
    ctx.fillStyle = LANDMARK_COLOR;
    ctx.shadowColor = LANDMARK_COLOR;
    ctx.shadowBlur = 8;

    for (const lm of landmarks) {
      const x = mirror ? (1 - lm.x) * canvas.width : lm.x * canvas.width;
      const y = lm.y * canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, LANDMARK_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Reset shadow
    ctx.shadowBlur = 0;
  }, [landmarks, facingMode, videoRef]);

  return (
    <div className="camera-view">
      <video
        ref={videoRef}
        className={`camera-view__video ${facingMode === 'user' ? 'camera-view__video--mirrored' : ''}`}
        autoPlay
        playsInline
        muted
      />

      {/* Canvas overlay for hand landmarks */}
      <canvas
        ref={canvasRef}
        className="camera-view__canvas"
      />

      {isLoading && (
        <div className="camera-view__loading">
          <div className="camera-view__spinner" />
        </div>
      )}

      {/* Viewfinder corners for visual guidance */}
      <div className="camera-view__viewfinder">
        <div className="camera-view__corner camera-view__corner--tl" />
        <div className="camera-view__corner camera-view__corner--tr" />
        <div className="camera-view__corner camera-view__corner--bl" />
        <div className="camera-view__corner camera-view__corner--br" />
      </div>
    </div>
  );
}
