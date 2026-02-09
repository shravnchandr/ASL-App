import { useEffect, useCallback, useRef, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useHandDetection } from '../../hooks/useHandDetection';
import { useASLClassifier } from '../../hooks/useASLClassifier';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { PredictionBuffer } from '../../utils/predictionBuffer';
import { announceToScreenReader } from '../../utils/accessibility';
import { CameraView } from './CameraView';
import { PredictionDisplay } from './PredictionDisplay';
import { CameraControls } from './CameraControls';
import { SpellingDisplay } from './SpellingDisplay';
import { SessionStats } from './SessionStats';
import { HandGuide } from './HandGuide';
import { CameraTutorial } from './CameraTutorial';
import './CameraPage.css';

interface CameraPageProps {
  onBack: () => void;
}

type CameraState = 'loading' | 'permission' | 'active' | 'error';

// Target frame rate for hand detection (lower = less CPU usage)
const TARGET_FPS = 15;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export default function CameraPage({ onBack }: CameraPageProps) {
  const { videoRef, isReady: cameraReady, isLoading: cameraLoading, error: cameraError, facingMode, flipCamera, startCamera, stopCamera } = useCamera();
  const { landmarks, normalizedLandmarks, isHandDetected, isLoading: handLoading, error: handError, processFrame } = useHandDetection();
  const { predict, isLoading: modelLoading, error: modelError } = useASLClassifier();
  const { isEnabled: soundEnabled, toggleSounds, playLetterAdded } = useSoundEffects();

  const [prediction, setPrediction] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [spelledLetters, setSpelledLetters] = useState<string[]>([]);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [signsRecognized, setSignsRecognized] = useState(0);
  const [tutorialComplete, setTutorialComplete] = useState(false);

  const predictionBufferRef = useRef(new PredictionBuffer(5, 0.6));
  const lastAddedLetterRef = useRef<string | null>(null);
  const lastStablePredictionRef = useRef<string | null>(null);
  const letterHoldStartRef = useRef<number | null>(null);
  const LETTER_HOLD_THRESHOLD = 1000; // 1 second hold to add letter
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // Determine overall loading state
  const isLoading = handLoading || modelLoading;
  const error = cameraError || handError || modelError;

  // Derive state from other values (no useState/useEffect needed)
  const state: CameraState = (() => {
    if (isLoading) return 'loading';
    if (error) return 'error';
    if (!cameraReady) return 'permission';
    return 'active';
  })();

  // Start camera when models are loaded
  useEffect(() => {
    if (!isLoading && !error) {
      startCamera();
    }
  }, [isLoading, error, startCamera]);

  // Start processing loop when camera is ready (throttled to TARGET_FPS)
  useEffect(() => {
    if (!cameraReady || isLoading) return;

    const processLoop = (timestamp: number) => {
      if (!isMountedRef.current) return;

      // Throttle frame rate
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
  }, [cameraReady, isLoading, videoRef, processFrame]);

  // Run prediction when landmarks change
  useEffect(() => {
    if (landmarks && !isLoading) {
      const result = predict(landmarks);
      if (result) {
        predictionBufferRef.current.add(result.label);
        const stablePrediction = predictionBufferRef.current.getStablePrediction();
        if (stablePrediction) {
          setPrediction(stablePrediction);
          setConfidence(result.confidence);

          // Track hold time for spelling mode using timestamps
          const now = Date.now();

          if (stablePrediction === lastAddedLetterRef.current) {
            // Same letter we just added - don't add again, keep progress at 0
            setHoldProgress(0);
            letterHoldStartRef.current = null;
          } else if (stablePrediction === lastStablePredictionRef.current) {
            // Still holding same prediction - check elapsed time
            if (letterHoldStartRef.current !== null && result.confidence > 0.8) {
              const elapsed = now - letterHoldStartRef.current;
              setHoldProgress(Math.min(elapsed / LETTER_HOLD_THRESHOLD, 1));

              if (elapsed >= LETTER_HOLD_THRESHOLD) {
                // Letter held long enough with high confidence - add to spelling
                setSpelledLetters(prev => [...prev, stablePrediction]);
                setSignsRecognized(prev => prev + 1);
                lastAddedLetterRef.current = stablePrediction;
                letterHoldStartRef.current = null;
                setHoldProgress(0);
                // Announce to screen readers
                announceToScreenReader(`Added ${stablePrediction.toUpperCase()} to spelling`);
                // Play sound effect
                playLetterAdded();
              }
            } else if (result.confidence <= 0.8) {
              // Confidence dropped, reset progress
              setHoldProgress(0);
            }
          } else {
            // Different prediction - start new timer
            lastStablePredictionRef.current = stablePrediction;
            letterHoldStartRef.current = result.confidence > 0.8 ? now : null;
            setHoldProgress(0);
          }
        } else {
          // No stable prediction yet
          lastStablePredictionRef.current = null;
          letterHoldStartRef.current = null;
          setHoldProgress(0);
        }
      }
    } else if (!isHandDetected) {
      // Clear prediction when hand is not detected
      predictionBufferRef.current.clear();
      setPrediction(null);
      setConfidence(0);
      setHoldProgress(0);
      lastStablePredictionRef.current = null;
      letterHoldStartRef.current = null;
      lastAddedLetterRef.current = null;
    }
  }, [landmarks, isHandDetected, isLoading, predict, playLetterAdded]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // Announce state changes for screen readers
  useEffect(() => {
    if (state === 'loading') {
      announceToScreenReader('Loading hand detection models, please wait');
    } else if (state === 'error') {
      announceToScreenReader(`Camera error: ${error}`, 'assertive');
    } else if (state === 'active') {
      announceToScreenReader('Camera ready. Show your hand to start signing');
    }
  }, [state, error]);

  const handleRetry = useCallback(() => {
    startCamera();
  }, [startCamera]);

  const handleClearSpelling = useCallback(() => {
    setSpelledLetters([]);
    lastAddedLetterRef.current = null;
  }, []);

  const handleBackspace = useCallback(() => {
    setSpelledLetters(prev => prev.slice(0, -1));
    lastAddedLetterRef.current = null;
  }, []);

  return (
    <div className="camera-page">
      {state === 'loading' && (
        <div className="camera-page__loading">
          <div className="camera-page__spinner" />
          <p>Preparing camera recognition...</p>
          <div className="camera-page__loading-steps">
            <div className={`camera-page__loading-step ${!handLoading ? 'camera-page__loading-step--done' : 'camera-page__loading-step--active'}`}>
              <span className="camera-page__step-icon">
                {!handLoading ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <div className="camera-page__step-spinner" />
                )}
              </span>
              <span>Hand detection model</span>
            </div>
            <div className={`camera-page__loading-step ${!modelLoading ? 'camera-page__loading-step--done' : handLoading ? '' : 'camera-page__loading-step--active'}`}>
              <span className="camera-page__step-icon">
                {!modelLoading ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : handLoading ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                ) : (
                  <div className="camera-page__step-spinner" />
                )}
              </span>
              <span>ASL classifier model</span>
            </div>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="camera-page__error">
          <div className="camera-page__error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Camera Error</h2>
          <p>{error}</p>
          <div className="camera-page__error-actions">
            <button onClick={handleRetry} className="camera-page__button camera-page__button--primary">
              Try Again
            </button>
            <button onClick={onBack} className="camera-page__button">
              Go Back
            </button>
          </div>
        </div>
      )}

      {(state === 'permission' || state === 'active') && (
        <>
          <CameraView
            videoRef={videoRef}
            isLoading={cameraLoading}
            facingMode={facingMode}
            landmarks={normalizedLandmarks}
          />

          {/* Only show hand guide when no hand detected and no letters spelled yet */}
          {!isHandDetected && spelledLetters.length === 0 && (
            <HandGuide
              isHandDetected={isHandDetected}
              showGuide={true}
            />
          )}

          {/* Only show stats when hand has been detected at least once */}
          {signsRecognized > 0 && (
            <SessionStats
              signsRecognized={signsRecognized}
              accuracy={0} // Accuracy calculation would require tracking attempts
            />
          )}

          {/* Only show prediction when hand is detected or we have spelled letters */}
          {(isHandDetected || spelledLetters.length > 0) && (
            <PredictionDisplay
              prediction={prediction}
              confidence={confidence}
              isHandDetected={isHandDetected}
              holdProgress={holdProgress}
            />
          )}

          {/* Only show spelling display when we have letters or hand is detected */}
          {(spelledLetters.length > 0 || isHandDetected) && (
            <SpellingDisplay
              letters={spelledLetters}
              onClear={handleClearSpelling}
              onBackspace={handleBackspace}
            />
          )}

          <CameraControls
            onBack={onBack}
            onFlipCamera={flipCamera}
            facingMode={facingMode}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSounds}
          />
        </>
      )}

      {/* First-time user tutorial */}
      {!tutorialComplete && (
        <CameraTutorial onComplete={() => setTutorialComplete(true)} />
      )}
    </div>
  );
}
