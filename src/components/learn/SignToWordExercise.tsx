import React, { useState, useCallback } from 'react';
import { SignAnimator } from './SignAnimator';
import { PlaybackControls } from './PlaybackControls';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './SignToWordExercise.css';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

interface SignToWordExerciseProps {
    signData: SignData | null;
    options: string[];
    correctAnswer: string;
    onAnswer: (answer: string, isCorrect: boolean) => void;
    disabled?: boolean;
}

export const SignToWordExercise: React.FC<SignToWordExerciseProps> = ({
    signData,
    options,
    correctAnswer,
    onAnswer,
    disabled = false,
}) => {
    const [isPlaying, setIsPlaying] = useState(true);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [hasAnswered, setHasAnswered] = useState(false);

    const handlePlayPause = useCallback(() => setIsPlaying(p => !p), []);

    const handleReplay = useCallback(() => {
        setCurrentFrame(0);
        setIsPlaying(true);
    }, []);

    const handleReplaySlow = useCallback(() => {
        setPlaybackSpeed(0.5);
        setCurrentFrame(0);
        setIsPlaying(true);
    }, []);

    const handleFrameChange = useCallback((frame: number) => setCurrentFrame(frame), []);

    const handleOptionSelect = useCallback((option: string) => {
        if (hasAnswered || disabled) return;
        setSelectedAnswer(option);
    }, [hasAnswered, disabled]);

    const handleCheck = useCallback(() => {
        if (!selectedAnswer || hasAnswered || disabled) return;
        setHasAnswered(true);
        const isCorrect = selectedAnswer.toLowerCase() === correctAnswer.toLowerCase();
        onAnswer(selectedAnswer, isCorrect);
    }, [selectedAnswer, hasAnswered, disabled, correctAnswer, onAnswer]);

    const getOptionClassName = (option: string) => {
        let cls = 'sign-to-word__option';
        if (selectedAnswer === option && !hasAnswered) {
            cls += ' sign-to-word__option--selected';
        }
        if (hasAnswered) {
            if (option.toLowerCase() === correctAnswer.toLowerCase()) {
                cls += ' sign-to-word__option--correct';
            } else if (option === selectedAnswer) {
                cls += ' sign-to-word__option--incorrect';
            } else {
                cls += ' sign-to-word__option--dimmed';
            }
        }
        return cls;
    };

    return (
        <div className="sign-to-word">
            <div className="sign-to-word__columns">
                {/* Left: video card */}
                <div className="sign-to-word__video-card">
                    <div className="sign-to-word__video-eyebrow">WHAT DOES THIS SIGN MEAN?</div>
                    <p className="sign-to-word__video-sub">Watch the signer.</p>

                    <div className="sign-to-word__animation">
                        <SignAnimator
                            signData={signData}
                            isPlaying={isPlaying}
                            playbackSpeed={playbackSpeed}
                            size="medium"
                            onFrameChange={handleFrameChange}
                        />
                    </div>

                    <div className="sign-to-word__playback-wrap">
                        <PlaybackControls
                            isPlaying={isPlaying}
                            playbackSpeed={playbackSpeed}
                            currentFrame={currentFrame}
                            totalFrames={signData?.frame_count || 0}
                            onPlayPause={handlePlayPause}
                            onSpeedChange={setPlaybackSpeed}
                            onReplay={handleReplay}
                            disabled={disabled}
                        />
                    </div>

                    <button className="sign-to-word__replay-slow" onClick={handleReplaySlow}>
                        ↺ Replay slowly
                    </button>
                </div>

                {/* Right: answer panel */}
                <div className="sign-to-word__answer-panel">
                    <div className="sign-to-word__answers-label">SELECT AN ANSWER</div>

                    <div className="sign-to-word__options" role="group" aria-label="Answer options">
                        {options.map((option, idx) => (
                            <button
                                key={option}
                                className={getOptionClassName(option)}
                                onClick={() => handleOptionSelect(option)}
                                disabled={hasAnswered || disabled}
                                aria-label={`Option ${OPTION_KEYS[idx]}: ${formatSignName(option)}`}
                                aria-pressed={selectedAnswer === option}
                            >
                                <span className="sign-to-word__option-key">
                                    {OPTION_KEYS[idx] ?? idx + 1}
                                </span>
                                <span className="sign-to-word__option-text">
                                    {formatSignName(option)}
                                </span>
                            </button>
                        ))}
                    </div>

                    <button
                        className={`sign-to-word__check-btn ${!selectedAnswer || hasAnswered ? 'sign-to-word__check-btn--disabled' : ''}`}
                        onClick={handleCheck}
                        disabled={!selectedAnswer || hasAnswered || disabled}
                        aria-label="Check your answer"
                    >
                        Check answer
                    </button>

                    {!hasAnswered && (
                        <div className="sign-to-word__secondary-actions">
                            <button
                                className="sign-to-word__secondary-btn"
                                onClick={() => onAnswer('', false)}
                                disabled={disabled}
                            >
                                Skip
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SignToWordExercise;
