/**
 * CameraPracticeExercise Component
 * Practice signing alphabet letters and numbers using live camera recognition
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useHandDetection } from '../../hooks/useHandDetection';
import { useASLClassifier } from '../../hooks/useASLClassifier';
import { PredictionBuffer } from '../../utils/predictionBuffer';
import { formatSignName } from '../../utils/format';
import { announceToScreenReader } from '../../utils/accessibility';
import './CameraPracticeExercise.css';

// Map classifier digit labels (0-9) to word labels used in Level 2
const DIGIT_TO_WORD: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
};

interface CameraPracticeExerciseProps {
  targetSign: string;
  levelId: number;
  onComplete: (isCorrect: boolean) => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function CameraPracticeExercise({
  targetSign,
  levelId,
  onComplete,
  onSkip,
  disabled = false,
}: CameraPracticeExerciseProps) {
  const { videoRef, isReady: cameraReady, isLoading: cameraLoading, error: cameraError, startCamera, stopCamera } = useCamera();
  const { landmarks, isHandDetected, isLoading: handLoading, processFrame } = useHandDetection();
  const { predict, isLoading: modelLoading } = useASLClassifier();

  const [prediction, setPrediction] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [matchProgress, setMatchProgress] = useState<number>(0);
  const [isMatched, setIsMatched] = useState(false);

  const predictionBufferRef = useRef(new PredictionBuffer(5, 0.6));
  const matchTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const TARGET_FPS = 15;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  const MATCH_THRESHOLD = 1500; // 1.5 seconds to confirm match

  const isLoading = handLoading || modelLoading;

  // Derive status from other state values (no effect needed)
  const status: 'loading' | 'ready' | 'matched' | 'error' = (() => {
    if (isMatched) return 'matched';
    if (isLoading || cameraLoading) return 'loading';
    if (cameraError) return 'error';
    if (cameraReady) return 'ready';
    return 'loading';
  })();

  // Normalize sign for comparison (handle digit to word mapping)
  const normalizeSign = useCallback((sign: string): string => {
    const lower = sign.toLowerCase();
    // For level 2 (numbers), classifier returns '0'-'9', but targets are 'one'-'ten'
    if (levelId === 2 && DIGIT_TO_WORD[lower]) {
      return DIGIT_TO_WORD[lower];
    }
    return lower;
  }, [levelId]);

  // Check if the prediction matches the target
  const isMatch = useCallback((pred: string | null): boolean => {
    if (!pred) return false;
    const normalizedPred = normalizeSign(pred);
    const normalizedTarget = targetSign.toLowerCase();
    return normalizedPred === normalizedTarget;
  }, [normalizeSign, targetSign]);

  // Start camera when models are loaded
  useEffect(() => {
    if (!isLoading && !cameraError) {
      startCamera();
    }
  }, [isLoading, cameraError, startCamera]);

  // Processing loop
  useEffect(() => {
    if (!cameraReady || isLoading || status === 'matched' || disabled) return;

    const processLoop = (timestamp: number) => {
      if (!isMountedRef.current) return;

      const elapsed = timestamp - lastFrameTimeRef.current;
      if (elapsed >= FRAME_INTERVAL) {
        lastFrameTimeRef.current = timestamp;

        const video = videoRef.current;
        if (video) {
          processFrame(video);
        }
      }

      animationFrameRef.current = requestAnimationFrame(processLoop);
    };

    animationFrameRef.current = requestAnimationFrame(processLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraReady, isLoading, status, disabled, videoRef, processFrame]);

  // Run prediction when landmarks change
  useEffect(() => {
    if (landmarks && !isLoading && status === 'ready') {
      const result = predict(landmarks);
      if (result) {
        predictionBufferRef.current.add(result.label);
        const stablePrediction = predictionBufferRef.current.getStablePrediction();
        if (stablePrediction) {
          setPrediction(stablePrediction);
          setConfidence(result.confidence);

          // Check if prediction matches target
          if (isMatch(stablePrediction) && result.confidence > 0.75) {
            matchTimeRef.current += FRAME_INTERVAL;
            setMatchProgress(Math.min(matchTimeRef.current / MATCH_THRESHOLD, 1));

            if (matchTimeRef.current >= MATCH_THRESHOLD) {
              setIsMatched(true);
              announceToScreenReader(`Correct! You signed ${formatSignName(targetSign)}`);
              setTimeout(() => {
                onComplete(true);
              }, 1000);
            }
          } else {
            matchTimeRef.current = 0;
            setMatchProgress(0);
          }
        }
      }
    } else if (!isHandDetected) {
      predictionBufferRef.current.clear();
      setPrediction(null);
      setConfidence(0);
      matchTimeRef.current = 0;
      setMatchProgress(0);
    }
  }, [landmarks, isHandDetected, isLoading, predict, isMatch, targetSign, onComplete, status]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // Announce when ready
  useEffect(() => {
    if (status === 'ready') {
      announceToScreenReader(`Sign the letter ${formatSignName(targetSign)} to continue`);
    }
  }, [status, targetSign]);

  if (status === 'loading') {
    return (
      <div className="camera-practice">
        <div className="camera-practice__loading">
          <div className="camera-practice__spinner" />
          <p>Loading camera...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="camera-practice">
        <div className="camera-practice__error">
          <p>Camera error: {cameraError}</p>
          <button onClick={onSkip} className="camera-practice__skip-btn">
            Skip to next exercise
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-practice">
      <div className="camera-practice__target">
        <span className="camera-practice__target-label">Sign this:</span>
        <span className="camera-practice__target-sign">{formatSignName(targetSign)}</span>
      </div>

      <div className="camera-practice__video-container">
        <video
          ref={videoRef}
          className="camera-practice__video"
          autoPlay
          playsInline
          muted
        />

        {/* Detection feedback overlay */}
        <div className="camera-practice__overlay">
          {status === 'matched' ? (
            <div className="camera-practice__success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Correct!</span>
            </div>
          ) : isHandDetected ? (
            <div className="camera-practice__detection">
              <span className="camera-practice__prediction">
                {prediction ? prediction.toUpperCase() : '...'}
              </span>
              {matchProgress > 0 && (
                <div className="camera-practice__match-progress">
                  <div
                    className="camera-practice__match-bar"
                    style={{ width: `${matchProgress * 100}%` }}
                  />
                </div>
              )}
              <span className="camera-practice__confidence">
                {confidence > 0 ? `${Math.round(confidence * 100)}%` : 'Detecting...'}
              </span>
            </div>
          ) : (
            <div className="camera-practice__hint">
              Show your hand to start
            </div>
          )}
        </div>
      </div>

      <div className="camera-practice__actions">
        <button onClick={onSkip} className="camera-practice__skip-btn" disabled={disabled}>
          Skip
        </button>
      </div>
    </div>
  );
}
