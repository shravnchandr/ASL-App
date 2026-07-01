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

  // Confidence percentage label for display
  const confidencePct = Math.round(confidence * 100);

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

      {/* Two-panel layout when camera is active/permission */}
      {(state === 'permission' || state === 'active') && (
        <>
          {/* LEFT: dark camera panel */}
          <div className="camera-page__left">
            <div className="camera-page__stage">
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

              {(isHandDetected || spelledLetters.length > 0) && (
                <PredictionDisplay
                  prediction={prediction}
                  confidence={confidence}
                  isHandDetected={isHandDetected}
                  holdProgress={holdProgress}
                />
              )}

              {spelledLetters.length > 0 && (
                <SpellingDisplay
                  letters={spelledLetters}
                  onClear={handleClearSpelling}
                  onBackspace={handleBackspace}
                />
              )}

              <div className="camera-page__device-badge">
                <span aria-hidden="true" />
                On-device
              </div>

              <CameraControls
                onBack={handleBack}
                onFlipCamera={flipCamera}
                facingMode={facingMode}
                soundEnabled={soundEnabled}
                onToggleSound={toggleSounds}
              />
            </div>
            <div className="camera-page__camera-footer" aria-hidden="true" />
          </div>

          {/* RIGHT: info panel */}
          <div className="camera-page__right">
            <div className="camera-page__right-top">
              <div className="camera-page__your-turn">YOUR TURN</div>

              {prediction ? (
                <>
                  <h2 className="camera-page__spell-heading">
                    Reading: <strong>{prediction.toUpperCase()}</strong>
                    {confidence > 0 && (
                      <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--md-sys-color-on-surface-variant)', marginLeft: 8 }}>
                        {confidencePct}% confident
                      </span>
                    )}
                  </h2>
                  <p className="camera-page__instruction">
                    Hold the sign steady for 1 second to add it to your spelling.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="camera-page__spell-heading">
                    {spelledLetters.length > 0
                      ? `Spelled: "${spelledLetters.join('').toUpperCase()}"`
                      : 'Show your hand'}
                  </h2>
                  <p className="camera-page__instruction">
                    Position your hand in front of the camera. Sign letters to spell words.
                  </p>
                </>
              )}

              {/* Spelled letters as boxes */}
              {spelledLetters.length > 0 && (
                <div className="camera-page__letter-boxes" aria-label="Spelled letters">
                  {spelledLetters.map((letter, i) => (
                    <div key={i} className="camera-page__letter-box camera-page__letter-box--filled">
                      {letter.toUpperCase()}
                    </div>
                  ))}
                </div>
              )}

              <div className="camera-page__right-actions">
                {spelledLetters.length > 0 && (
                  <button className="camera-page__hint-btn" onClick={handleBackspace}>
                    ← Backspace
                  </button>
                )}
                {spelledLetters.length > 0 && (
                  <button className="camera-page__skip-btn" onClick={handleClearSpelling}>
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Stats section */}
            <div className="camera-page__stats-section">
              <div className="camera-page__stats-label">THIS SESSION</div>
              <div className="camera-page__stats-grid">
                <div className="camera-page__stat-item">
                  <span className="camera-page__stat-val">{signsRecognized}</span>
                  <span className="camera-page__stat-lbl">Signs read</span>
                </div>
                <div className="camera-page__stat-item">
                  <span className="camera-page__stat-val">{spelledLetters.length}</span>
                  <span className="camera-page__stat-lbl">Letters spelled</span>
                </div>
                <div className="camera-page__stat-item">
                  <span className="camera-page__stat-val">
                    {confidence > 0 ? `${confidencePct}%` : '—'}
                  </span>
                  <span className="camera-page__stat-lbl">Avg confidence</span>
                </div>
              </div>
            </div>

            {/* Privacy notice */}
            <div className="camera-page__privacy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Private by design — no video is stored or sent to any server.
            </div>
          </div>
        </>
      )}

      {!tutorialComplete && (
        <CameraTutorial onComplete={() => setTutorialComplete(true)} />
      )}
    </div>
  );
}
