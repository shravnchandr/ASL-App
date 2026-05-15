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
  onBack?: () => void;
}

type CameraState = 'loading' | 'permission' | 'active' | 'error';

// Target frame rate for hand detection (lower = less CPU usage)
const TARGET_FPS = 15;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export default function CameraPage({ onBack }: CameraPageProps) {
  const handleBack = onBack ?? (() => { window.location.href = '/'; });
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
  const LETTER_HOLD_THRESHOLD = 1000; // ms
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const isLoading = handLoading || modelLoading;
  const error = cameraError || handError || modelError;

  const state: CameraState = (() => {
    if (isLoading) return 'loading';
    if (error) return 'error';
    if (!cameraReady) return 'permission';
    return 'active';
  })();

  useEffect(() => {
    if (!isLoading && !error) {
      startCamera();
    }
  }, [isLoading, error, startCamera]);

  useEffect(() => {
    if (!cameraReady || isLoading) return;

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
  }, [cameraReady, isLoading, videoRef, processFrame]);

  useEffect(() => {
    if (landmarks && !isLoading) {
      let isCurrent = true;
      void predict(landmarks).then(result => {
        if (!isCurrent || !result) return;
        predictionBufferRef.current.add(result.label);
        const stablePrediction = predictionBufferRef.current.getStablePrediction();
        if (stablePrediction) {
          setPrediction(stablePrediction);
          setConfidence(result.confidence);

          const now = Date.now();

          if (stablePrediction === lastAddedLetterRef.current) {
            setHoldProgress(0);
            letterHoldStartRef.current = null;
          } else if (stablePrediction === lastStablePredictionRef.current) {
            if (letterHoldStartRef.current !== null && result.confidence > 0.8) {
              const elapsed = now - letterHoldStartRef.current;
              setHoldProgress(Math.min(elapsed / LETTER_HOLD_THRESHOLD, 1));

              if (elapsed >= LETTER_HOLD_THRESHOLD) {
                setSpelledLetters(prev => [...prev, stablePrediction]);
                setSignsRecognized(prev => prev + 1);
                lastAddedLetterRef.current = stablePrediction;
                letterHoldStartRef.current = null;
                setHoldProgress(0);
                announceToScreenReader(`Added ${stablePrediction.toUpperCase()} to spelling`);
                playLetterAdded();
              }
            } else if (result.confidence <= 0.8) {
              setHoldProgress(0);
            }
          } else {
            lastStablePredictionRef.current = stablePrediction;
            letterHoldStartRef.current = result.confidence > 0.8 ? now : null;
            setHoldProgress(0);
          }
        } else {
          lastStablePredictionRef.current = null;
          letterHoldStartRef.current = null;
          setHoldProgress(0);
        }
      });
      return () => { isCurrent = false; };
    }
  }, [landmarks, isLoading, predict, playLetterAdded]);

  useEffect(() => {
    if (!isHandDetected) {
      predictionBufferRef.current.clear();
      lastStablePredictionRef.current = null;
      letterHoldStartRef.current = null;
      lastAddedLetterRef.current = null;
      queueMicrotask(() => {
        setPrediction(null);
        setConfidence(0);
        setHoldProgress(0);
      });
    }
  }, [isHandDetected]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

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
    // If hand/model detection failed, the singleton promise was reset — need a full reload to retry.
    if (handError || modelError) {
      window.location.reload();
      return;
    }
    startCamera();
  }, [handError, modelError, startCamera]);

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
            <button onClick={handleBack} className="camera-page__button">
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* CameraView is always mounted so videoRef is available when startCamera fires.
          Visibility is controlled via display style to avoid a race condition on mobile
          where the video element wouldn't exist yet when the models finish loading. */}
      <div style={{ display: state === 'permission' || state === 'active' ? undefined : 'none' }}>
        <CameraView
          videoRef={videoRef}
          isLoading={cameraLoading}
          facingMode={facingMode}
          landmarks={normalizedLandmarks}
        />

        {!isHandDetected && spelledLetters.length === 0 && (
          <HandGuide
            isHandDetected={isHandDetected}
            showGuide={true}
          />
        )}

        {signsRecognized > 0 && (
          <SessionStats
            signsRecognized={signsRecognized}
            accuracy={0}
          />
        )}

        {(isHandDetected || spelledLetters.length > 0) && (
          <PredictionDisplay
            prediction={prediction}
            confidence={confidence}
            isHandDetected={isHandDetected}
            holdProgress={holdProgress}
          />
        )}

        {(spelledLetters.length > 0 || isHandDetected) && (
          <SpellingDisplay
            letters={spelledLetters}
            onClear={handleClearSpelling}
            onBackspace={handleBackspace}
          />
        )}

        <CameraControls
          onBack={handleBack}
          onFlipCamera={flipCamera}
          facingMode={facingMode}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSounds}
        />
      </div>

      {!tutorialComplete && (
        <CameraTutorial onComplete={() => setTutorialComplete(true)} />
      )}
    </div>
  );
}
