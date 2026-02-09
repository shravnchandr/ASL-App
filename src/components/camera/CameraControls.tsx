import type { FacingMode } from '../../hooks/useCamera';
import './CameraControls.css';

interface CameraControlsProps {
  onBack: () => void;
  onFlipCamera: () => void;
  facingMode: FacingMode;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export function CameraControls({ onBack, onFlipCamera, facingMode, soundEnabled = false, onToggleSound }: CameraControlsProps) {
  return (
    <div className="camera-controls">
      {/* Back button */}
      <button
        className="camera-controls__button"
        onClick={onBack}
        aria-label="Go back to home"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      {/* Sound toggle button */}
      {onToggleSound && (
        <button
          className={`camera-controls__button ${soundEnabled ? 'camera-controls__button--active' : ''}`}
          onClick={onToggleSound}
          aria-label={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
      )}

      {/* Flip camera button */}
      <button
        className="camera-controls__button camera-controls__button--flip"
        onClick={onFlipCamera}
        aria-label={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
          <path d="M16 6v2" />
        </svg>
      </button>
    </div>
  );
}
