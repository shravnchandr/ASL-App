/**
 * PlaybackControls Component
 * Controls for sign animation playback: play/pause, speed, replay
 */

import React from 'react';
import './PlaybackControls.css';

interface PlaybackControlsProps {
    isPlaying: boolean;
    playbackSpeed: number;
    currentFrame: number;
    totalFrames: number;
    onPlayPause: () => void;
    onSpeedChange: (speed: number) => void;
    onReplay: () => void;
    disabled?: boolean;
}

const SPEED_OPTIONS = [0.5, 1, 1.5];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
    isPlaying,
    playbackSpeed,
    currentFrame,
    totalFrames,
    onPlayPause,
    onSpeedChange,
    onReplay,
    disabled = false,
}) => {
    const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

    return (
        <div className="playback-controls">
            {/* Progress bar */}
            <div className="playback-controls__progress">
                <div
                    className="playback-controls__progress-fill"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="playback-controls__buttons">
                {/* Replay button */}
                <button
                    className="playback-controls__btn playback-controls__btn--secondary"
                    onClick={onReplay}
                    disabled={disabled}
                    aria-label="Replay animation"
                    title="Replay"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
                            fill="currentColor"
                        />
                    </svg>
                </button>

                {/* Play/Pause button */}
                <button
                    className="playback-controls__btn playback-controls__btn--primary"
                    onClick={onPlayPause}
                    disabled={disabled}
                    aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
                    title={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
                            <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
                        </svg>
                    )}
                </button>

                {/* Speed selector */}
                <div className="playback-controls__speed">
                    {SPEED_OPTIONS.map(speed => (
                        <button
                            key={speed}
                            className={`playback-controls__speed-btn ${
                                playbackSpeed === speed ? 'playback-controls__speed-btn--active' : ''
                            }`}
                            onClick={() => onSpeedChange(speed)}
                            disabled={disabled}
                            aria-label={`Set speed to ${speed}x`}
                            aria-pressed={playbackSpeed === speed}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;
