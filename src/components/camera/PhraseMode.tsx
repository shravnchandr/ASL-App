import { useEffect, useCallback, useRef, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useHolisticLandmarks } from '../../hooks/useHolisticLandmarks';
import {
  DEFAULT_PHRASE_BUNDLE,
  PHRASE_BUNDLES,
  PHRASE_BUNDLE_IDS,
  useSignPhraseModel,
  type PhraseBundleId,
} from '../../hooks/useSignPhraseModel';
import type { PhraseContractVersion } from '../../utils/signPhraseContract';
import { announceToScreenReader } from '../../utils/accessibility';
import { HAND_CONNECTIONS } from '../../utils/handLandmarks';
import {
  MIN_FRAMES,
  MODEL_FPS,
  TRAINING_ASPECT,
  UNSURE_BELOW,
  PhraseSegmenter,
  buildFeatures,
  formatGloss,
  type DecodedSign,
  type SignCandidate,
  keepDominantHand,
  medianShoulderRatio,
  portraitCrop,
  resampleFrames,
  toRecording,
  type HandSlot,
  type PhraseFrame,
  type PhraseSegment,
  type Point,
} from '../../utils/signPhrase';
import { CameraControls } from './CameraControls';
import './CameraView.css';
import './CameraPage.css';
import './PhraseMode.css';

interface PhraseModeProps {
  onBack: () => void;
}

interface LiveStatus {
  body: boolean;
  left: boolean;
  right: boolean;
  signing: boolean;
  /** Unmirrored frame, signer facing the camera: left shoulder has the larger x. */
  facing: boolean;
}

interface Attempt {
  id: number;
  /** Decoded signs with their scores and runners-up. */
  signs: DecodedSign[];
  /** Best-scoring signs over the whole segment, shown when nothing was decoded. */
  closest: SignCandidate[];
  frameCount: number;
  fps: number;
  /** Framing check: about 0.40 when the frame matches training (3:4 portrait). */
  shoulderRatio: number;
  inferenceMs: number | null;
  /** Under the model's 8-frame minimum: recorded but not recognised. */
  tooShort: boolean;
  label: string;
  handMode: HandMode;
  /** Model bundle that read this attempt. */
  model: PhraseBundleId;
  contractVersion: PhraseContractVersion;
  /** Copy-rule outcome per frame of the 30 fps grid the model's input was built from. */
  preparation: {
    kept_frames: number[];
    hand_status: [number, number][];
    assignment_uncertain: number[];
  } | null;
  /** One-hand modes: the hand the model was given. */
  keptHand: HandSlot | null;
  /** Raw captured landmarks (both hands) for export; dropped from older attempts to bound memory. */
  frames: PhraseFrame[] | null;
  /** Capture time of each raw frame, ms from the first. */
  times: number[];
}

const percent = (score: number) => `${Math.round(score * 100)}%`;
const round3 = (n: number) => Number(n.toFixed(3));

/** Which hands the model is given: both as detected, or one (experimental). */
type HandMode = 'both' | 'auto' | HandSlot;
const HAND_MODES: { id: HandMode; label: string }[] = [
  { id: 'both', label: 'Both' },
  { id: 'auto', label: 'One (auto)' },
  { id: 'left_hand', label: 'Left only' },
  { id: 'right_hand', label: 'Right only' },
];

const MODEL_KEY = 'asl_phrase_model';

function savedModel(): PhraseBundleId {
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    if (PHRASE_BUNDLE_IDS.includes(saved as PhraseBundleId)) return saved as PhraseBundleId;
  } catch { /* storage unavailable */ }
  return DEFAULT_PHRASE_BUNDLE;
}

const IDLE_STATUS: LiveStatus = { body: false, left: false, right: false, signing: false, facing: true };
const MAX_ATTEMPTS = 30;
const ATTEMPTS_WITH_FRAMES = 10;

const LEFT_COLOR = '#6aafc0';
const RIGHT_COLOR = '#f2b05e';
const BODY_COLOR = 'rgba(255, 255, 255, 0.55)';
const ARM_CONNECTIONS: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

/** Draw arms and both hand slots over an `object-fit: cover` video. */
function drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: PhraseFrame | null, mirror: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { clientWidth: cw, clientHeight: ch } = canvas;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  ctx.clearRect(0, 0, cw, ch);
  if (!frame?.pose || !video.videoWidth) return;

  // Landmarks are fractions of the 3:4 crop; map crop → video pixels → cover-fitted display
  const crop = portraitCrop(video.videoWidth, video.videoHeight);
  const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
  const dx = (video.videoWidth * scale - cw) / 2;
  const dy = (video.videoHeight * scale - ch) / 2;
  const toCanvas = (p: Point): [number, number] => {
    const x = (crop.x + p[0] * crop.width) * scale - dx;
    return [mirror ? cw - x : x, (crop.y + p[1] * crop.height) * scale - dy];
  };
  const line = (a: Point, b: Point) => {
    ctx.beginPath();
    ctx.moveTo(...toCanvas(a));
    ctx.lineTo(...toCanvas(b));
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = BODY_COLOR;
  for (const [a, b] of ARM_CONNECTIONS) line(frame.pose[a], frame.pose[b]);

  const drawHand = (hand: Point[] | null, color: string, tag: string) => {
    if (!hand) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) line(hand[a], hand[b]);
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(...toCanvas(p), 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    const [x, y] = toCanvas(hand[0]);
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(tag, x + 8, y + 18);
  };
  drawHand(frame.left_hand, LEFT_COLOR, 'L');
  drawHand(frame.right_hand, RIGHT_COLOR, 'R');
}

function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Experimental continuous-signing mode: buffers an utterance while hands are in
 * view, then runs the sign-phrase CTC model on it. Everything stays on-device.
 */
export default function PhraseMode({ onBack }: PhraseModeProps) {
  const { videoRef, isReady: cameraReady, isLoading: cameraLoading, error: cameraError, facingMode, flipCamera, startCamera, stopCamera } = useCamera();
  const { detect, isLoading: landmarksLoading, error: landmarksError } = useHolisticLandmarks();
  const [model, setModel] = useState<PhraseBundleId>(savedModel);
  const { recognize, isLoading: modelLoading, error: modelError, contractVersion } = useSignPhraseModel(model);

  const [status, setStatus] = useState<LiveStatus>(IDLE_STATUS);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [handMode, setHandMode] = useState<HandMode>('both');
  // Read by the frame loop's segment handler without restarting the loop
  const handModeRef = useRef<HandMode>('both');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmenterRef = useRef(new PhraseSegmenter());
  const statusKeyRef = useRef('');
  const nextIdRef = useRef(1);
  const isMountedRef = useRef(true);

  const isLoading = landmarksLoading || modelLoading;
  const error = cameraError || landmarksError || modelError;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Read by the auto-start effect, not one of its dependencies: a camera flip
  // makes useCamera restart itself, dropping isReady on the way, and an effect
  // keyed on it would open a second request that cancels the first
  const cameraActiveRef = useRef(false);
  useEffect(() => { cameraActiveRef.current = cameraReady || cameraLoading; }, [cameraReady, cameraLoading]);

  useEffect(() => {
    // Not keyed on cameraError either: "Try Again" calls startCamera, which
    // clears it. Skipped when the camera is already on: a model switch keeps
    // the same stream.
    if (!isLoading && !landmarksError && !modelError && !cameraActiveRef.current) {
      startCamera();
    }
  }, [isLoading, landmarksError, modelError, startCamera]);

  useEffect(() => {
    // The error view has no <video>: don't leave the camera on behind it
    if (landmarksError || modelError) stopCamera();
  }, [landmarksError, modelError, stopCamera]);

  const handleSegment = useCallback(async (segment: PhraseSegment) => {
    if (!contractVersion) return;
    const id = nextIdRef.current++;
    // One-hand modes drop the less active (or unchosen) hand for the whole segment
    const mode = handModeRef.current;
    // Times as they are saved, so a recording replays to exactly this input
    const times = segment.times.map(t => round3(t - segment.times[0]));
    // The model expects 30 fps video; browsers deliver whatever the device manages
    const frames = resampleFrames(segment.frames, times);
    const oneHanded = mode === 'both'
      ? null
      : keepDominantHand(frames, mode === 'auto' ? undefined : mode);
    const modelFrames = mode === 'both' ? frames : oneHanded?.frames ?? [];
    // Missing parts are filled over the whole clip, context included, then it is cut to the hands
    const input = buildFeatures(modelFrames, contractVersion, TRAINING_ASPECT, true);
    const tooShort = input.T < MIN_FRAMES;
    let signs: DecodedSign[] = [];
    let closest: SignCandidate[] = [];
    let inferenceMs: number | null = null;

    if (!tooShort) {
      setIsRecognizing(true);
      const { features, T } = input;
      const result = await recognize(features, T);
      if (!isMountedRef.current) return;
      setIsRecognizing(false);
      if (result) ({ signs, closest, inferenceMs } = result);
    }

    setAttempts(prev => [
      {
        id, signs, closest, inferenceMs, tooShort, label: '',
        frameCount: input.T,
        handMode: mode,
        model,
        contractVersion,
        preparation: contractVersion === 'v4' ? {
          kept_frames: input.keptFrames!,
          hand_status: input.handStatus!,
          assignment_uncertain: input.assignmentUncertain!,
        } : null,
        keptHand: oneHanded?.kept ?? null,
        fps: segment.fps,
        shoulderRatio: medianShoulderRatio(segment.frames),
        frames: segment.frames,
        times,
      },
      ...prev.map((a, i) => (i + 1 >= ATTEMPTS_WITH_FRAMES && a.frames ? { ...a, frames: null } : a)),
    ].slice(0, MAX_ATTEMPTS));

    if (tooShort) {
      announceToScreenReader('Sign too short to read');
    } else {
      announceToScreenReader(signs.length
        ? `Read: ${signs.map(s => `${formatGloss(s.gloss)}, ${percent(s.score)}${s.unsure ? ', not sure' : ''}`).join('; ')}`
        : 'No signs recognised');
    }
  }, [recognize, contractVersion, model]);

  useEffect(() => {
    if (!cameraReady || isLoading) return;

    const segmenter = segmenterRef.current;
    const overlay = canvasRef.current;
    let animationFrame = 0;
    let lastVideoTime = -1;

    const processLoop = () => {
      const video = videoRef.current;
      // One detection per new camera frame; the raw (unmirrored) frame goes to MediaPipe
      if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const frame = detect(video, performance.now());
        // The camera's own clock: when the frame was captured, not when it was processed
        const segment = segmenter.push(frame, video.currentTime * 1000);

        if (canvasRef.current) drawOverlay(canvasRef.current, video, frame, facingMode === 'user');

        const next: LiveStatus = {
          body: !!frame,
          left: !!frame?.left_hand,
          right: !!frame?.right_hand,
          signing: segmenter.isActive,
          facing: !frame?.pose || frame.pose[11][0] > frame.pose[12][0],
        };
        const key = JSON.stringify(next);
        if (key !== statusKeyRef.current) {
          statusKeyRef.current = key;
          setStatus(next);
        }

        if (segment) void handleSegment(segment);
      }
      animationFrame = requestAnimationFrame(processLoop);
    };

    animationFrame = requestAnimationFrame(processLoop);

    return () => {
      cancelAnimationFrame(animationFrame);
      segmenter.reset();
      // No frozen skeleton over the live video while the loop is paused (model switch)
      overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    };
  }, [cameraReady, isLoading, videoRef, detect, facingMode, handleSegment]);

  const handleRetry = useCallback(() => {
    // A failed model load reset its singleton promise — a full reload retries it.
    if (landmarksError || modelError) {
      window.location.reload();
      return;
    }
    startCamera();
  }, [landmarksError, modelError, startCamera]);

  const handleFinishNow = useCallback(() => {
    const segment = segmenterRef.current.flush();
    if (segment) void handleSegment(segment);
  }, [handleSegment]);

  const handleModelChange = useCallback((id: PhraseBundleId) => {
    setModel(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch { /* storage unavailable */ }
  }, []);

  const handleLabelChange = useCallback((id: number, label: string) => {
    setAttempts(prev => prev.map(a => (a.id === id ? { ...a, label } : a)));
  }, []);

  const handleDownload = useCallback((attempt: Attempt) => {
    if (!attempt.frames) return;
    const label = attempt.label.trim();
    downloadJson(
      `phrase-${String(attempt.id).padStart(3, '0')}-${label.replace(/\s+/g, '_') || 'unlabelled'}.json`,
      toRecording(attempt.frames, label, {
        decoded: attempt.signs.map(s => s.gloss),
        // Pooled model scores (0..1) per decoded sign, with the runners-up
        scores: attempt.signs.map(s => round3(s.score)),
        alternatives: attempt.signs.map(s => s.alternatives.map(a => [a.gloss, round3(a.score)])),
        closest: attempt.closest.map(c => [c.gloss, round3(c.score)]),
        // `frames` are the raw capture with its context frames, at `fps`; the
        // model's input is built from them resampled to `frame_rate` by `timestamps_ms`
        fps: Number(attempt.fps.toFixed(2)),
        frame_rate: MODEL_FPS,
        model: attempt.model,
        // `frames` always holds both hands as detected; in a one-hand mode the
        // model was given only `kept_hand`
        hand_mode: attempt.handMode,
        contract_version: attempt.contractVersion,
        preparation: attempt.preparation,
        kept_hand: attempt.keptHand,
        frame_count: attempt.frameCount,
        shoulder_ratio: Number(attempt.shoulderRatio.toFixed(3)),
        crop: videoRef.current
          ? { ...portraitCrop(videoRef.current.videoWidth, videoRef.current.videoHeight), video_width: videoRef.current.videoWidth, video_height: videoRef.current.videoHeight }
          : null,
        inference_ms: attempt.inferenceMs === null ? null : Math.round(attempt.inferenceMs),
        facing_mode: facingMode,
        recorded_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
      }, attempt.times)
    );
  }, [facingMode, videoRef]);

  const latest = attempts[0] ?? null;
  const shortCount = attempts.filter(a => a.tooShort).length;

  // The full-screen loader is for the first load only. A model switch keeps the
  // camera view (and its stream) on screen; the frame loop waits for the model.
  // (or restarting: a flip mid-load must keep the <video> the restart attaches to)
  const switchingModel = modelLoading && !landmarksLoading && (cameraReady || cameraLoading);

  const heading = (() => {
    if (switchingModel) return 'Loading model…';
    if (isRecognizing) return 'Reading…';
    if (status.signing) return 'Signing…';
    if (!status.body) return 'Step into view';
    return 'Ready';
  })();
  const instruction = (() => {
    if (status.signing) return 'Lower your hands out of view for a second to finish the phrase.';
    if (!status.body) return 'Your face, shoulders and both hands need to be visible to the camera.';
    return 'Raise your hands and sign a word or a short phrase, then lower them.';
  })();

  if (isLoading && !switchingModel) {
    return (
      <div className="camera-page">
        <div className="camera-page__loading">
          <div className="camera-page__spinner" />
          <p>Preparing phrase recognition...</p>
          <div className="camera-page__loading-steps">
            {[
              { done: !landmarksLoading, text: 'Body, hand and face tracking' },
              { done: !modelLoading, text: 'Sign-phrase model (27 MB)' },
            ].map(step => (
              <div
                key={step.text}
                className={`camera-page__loading-step ${step.done ? 'camera-page__loading-step--done' : 'camera-page__loading-step--active'}`}
              >
                <span className="camera-page__step-icon">
                  {step.done ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="camera-page__step-spinner" />
                  )}
                </span>
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="camera-page">
        <div className="camera-page__error">
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
      </div>
    );
  }

  return (
    <div className="camera-page camera-page--phrases">
      {/* LEFT: camera panel */}
      <div className="camera-page__left">
        <div className="camera-page__stage">
          <div className="camera-view">
            <video
              ref={videoRef}
              className={`camera-view__video ${facingMode === 'user' ? 'camera-view__video--mirrored' : ''}`}
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="camera-view__canvas" />
            {cameraLoading && (
              <div className="camera-view__loading">
                <div className="camera-view__spinner" />
              </div>
            )}
          </div>

          <div className="phrase-mode__slots" aria-label="Hands detected">
            <span className={`phrase-mode__slot phrase-mode__slot--left ${status.left ? 'phrase-mode__slot--on' : ''}`}>
              Left hand
            </span>
            <span className={`phrase-mode__slot phrase-mode__slot--right ${status.right ? 'phrase-mode__slot--on' : ''}`}>
              Right hand
            </span>
          </div>

          {status.body && !status.facing && (
            <div className="phrase-mode__warning" role="status">
              Face the camera — your shoulders look reversed.
            </div>
          )}

          <div className="camera-page__device-badge">
            <span aria-hidden="true" />
            On-device
          </div>

          <CameraControls onBack={onBack} onFlipCamera={flipCamera} facingMode={facingMode} />
        </div>
        <div className="camera-page__camera-footer" aria-hidden="true" />
      </div>

      {/* RIGHT: info panel */}
      <div className="camera-page__right">
        <div className="camera-page__right-top">
          <div className="camera-page__your-turn">Phrases · experimental</div>
          <h2 className="camera-page__spell-heading">{heading}</h2>
          <p className="camera-page__instruction">{instruction}</p>

          <div className="phrase-mode__hand-choice" role="group" aria-label="Model">
            <span className="phrase-mode__hand-choice-label">Model</span>
            {PHRASE_BUNDLE_IDS.map(id => (
              <button
                key={id}
                className={`phrase-mode__hand-btn ${model === id ? 'phrase-mode__hand-btn--active' : ''}`}
                aria-pressed={model === id}
                onClick={() => handleModelChange(id)}
              >
                {PHRASE_BUNDLES[id].name}
              </button>
            ))}
          </div>
          {switchingModel && (
            <p className="phrase-mode__model-loading" role="status">
              Loading {PHRASE_BUNDLES[model].name}…
            </p>
          )}

          <div className="phrase-mode__hand-choice" role="group" aria-label="Hands the model reads">
            <span className="phrase-mode__hand-choice-label">Hands</span>
            {HAND_MODES.map(m => (
              <button
                key={m.id}
                className={`phrase-mode__hand-btn ${handMode === m.id ? 'phrase-mode__hand-btn--active' : ''}`}
                aria-pressed={handMode === m.id}
                onClick={() => { handModeRef.current = m.id; setHandMode(m.id); }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="phrase-mode__note phrase-mode__note--tight">
            Both is right for this model, which was trained on two-handed signing. The one-hand
            modes are kept for comparison; Auto keeps the hand that moves more.
          </p>

          {status.signing && (
            <div className="camera-page__right-actions">
              <button className="camera-page__hint-btn" onClick={handleFinishNow}>
                Finish phrase now
              </button>
            </div>
          )}

          {latest && !status.signing && (
            <div className="phrase-mode__result" aria-live="polite">
              <div className="camera-page__stats-label">Last phrase</div>
              {latest.tooShort ? (
                <p className="phrase-mode__empty">
                  Too short to read ({latest.frameCount} frames; the model needs at least {MIN_FRAMES}).
                </p>
              ) : latest.signs.length > 0 ? (
                <ol className="phrase-mode__glosses">
                  {latest.signs.map((s, i) => (
                    <li key={i} className={`phrase-mode__gloss ${s.unsure ? 'phrase-mode__gloss--unsure' : ''}`}>
                      <span className="phrase-mode__gloss-main">
                        <span className="phrase-mode__gloss-word">{formatGloss(s.gloss)}</span>
                        <span className="phrase-mode__gloss-score">{percent(s.score)}</span>
                      </span>
                      {s.unsure && <span className="phrase-mode__gloss-flag">Not sure</span>}
                      {s.alternatives.length > 0 && (
                        <span className="phrase-mode__gloss-alts">
                          or {s.alternatives.map(a => `${formatGloss(a.gloss)} ${percent(a.score)}`).join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <p className="phrase-mode__empty">Not sure: no sign stood out.</p>
                  {latest.closest.length > 0 && (
                    <p className="phrase-mode__note">
                      Closest: {latest.closest.map(c => `${formatGloss(c.gloss)} ${percent(c.score)}`).join(', ')}
                    </p>
                  )}
                </>
              )}
              <p className="phrase-mode__note">
                Signs in ASL order, not an English sentence. The percentage is the model's own score,
                not the chance it is right; below {percent(UNSURE_BELOW)} a sign is marked "Not sure".
              </p>
            </div>
          )}
        </div>

        <div className="camera-page__stats-section">
          <div className="camera-page__stats-label">Last segment</div>
          <div className="camera-page__stats-grid">
            <div className="camera-page__stat-item">
              <span className="camera-page__stat-val">{latest ? latest.frameCount : '—'}</span>
              <span className="camera-page__stat-lbl">Frames</span>
            </div>
            <div className="camera-page__stat-item">
              <span className="camera-page__stat-val">{latest && latest.fps > 0 ? latest.fps.toFixed(1) : '—'}</span>
              <span className="camera-page__stat-lbl">Frames / sec</span>
            </div>
            <div className="camera-page__stat-item">
              <span className="camera-page__stat-val">
                {latest?.inferenceMs != null ? Math.round(latest.inferenceMs) : '—'}
              </span>
              <span className="camera-page__stat-lbl">Model ms</span>
            </div>
            <div className="camera-page__stat-item">
              <span className="camera-page__stat-val">
                {latest && !Number.isNaN(latest.shoulderRatio) ? latest.shoulderRatio.toFixed(2) : '—'}
              </span>
              <span className="camera-page__stat-lbl">Shoulder ratio</span>
            </div>
          </div>
          {latest && (latest.shoulderRatio < 0.3 || latest.shoulderRatio > 0.5) && (
            <p className="phrase-mode__note">
              Shoulder ratio is usually about 0.40. A very different value means the framing does not
              match what the model was trained on, for example if you are turned or leaning.
            </p>
          )}
          {shortCount > 0 && (
            <p className="phrase-mode__note">
              {shortCount} of {attempts.length} segments were under {MIN_FRAMES} frames.
            </p>
          )}
        </div>

        {attempts.length > 0 && (
          <div className="camera-page__stats-section">
            <div className="camera-page__stats-label">Attempts</div>
            <p className="phrase-mode__note">
              Type what you signed and save the attempt to help evaluate the model. Files hold
              landmark coordinates only, never video. Only save other people's signing with their consent.
            </p>
            <ul className="phrase-mode__attempts">
              {attempts.map(a => (
                <li key={a.id} className="phrase-mode__attempt">
                  <div className="phrase-mode__attempt-read">
                    <strong>#{a.id}</strong>{' '}
                    {a.tooShort
                      ? 'too short'
                      : a.signs.length
                        ? a.signs.map(s => `${s.gloss} ${percent(s.score)}${s.unsure ? '?' : ''}`).join(' · ')
                        : 'nothing recognised'}
                    <span className="phrase-mode__attempt-meta">
                      {PHRASE_BUNDLES[a.model].name} · {a.frameCount} frames · {a.fps.toFixed(1)} fps
                      {a.keptHand ? ` · ${a.keptHand === 'left_hand' ? 'left' : 'right'} hand only` : ' · both hands'}
                    </span>
                  </div>
                  {a.frames && (
                    <div className="phrase-mode__attempt-save">
                      <input
                        className="phrase-mode__label-input"
                        type="text"
                        value={a.label}
                        onChange={e => handleLabelChange(a.id, e.target.value)}
                        placeholder="Signs you made, e.g. cloud have"
                        aria-label={`Signs you made in attempt ${a.id}`}
                      />
                      <button className="camera-page__hint-btn" onClick={() => handleDownload(a)}>
                        Save
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="camera-page__privacy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Early research model: 250 signs, trained on stitched single-sign clips and not yet
          validated on real signing. Expect mistakes. No video is stored or sent to any server.
        </div>
        <p className="phrase-mode__note">
          Trained on landmark data from{' '}
          <a href="https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/" target="_blank" rel="noopener noreferrer">PopSign ASL v1.0</a>{' '}
          (Starner et al., 2023;{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>),
          Google's ASL Signs and WLASL.{' '}
          <a href={`${PHRASE_BUNDLES['frozen-phrases07'].dir}ATTRIBUTION.md`} target="_blank" rel="noopener noreferrer">Full credits and changes</a>
        </p>
      </div>
    </div>
  );
}
