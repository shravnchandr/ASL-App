/**
 * RecallExercise Component
 * Shows animation, user types the word (no options)
 * Hardest exercise type - only for mastered signs
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SignAnimator } from './SignAnimator';
import { PlaybackControls } from './PlaybackControls';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './RecallExercise.css';

interface RecallExerciseProps {
    signData: SignData | null;
    correctAnswer: string;
    onAnswer: (answer: string, isCorrect: boolean) => void;
    disabled?: boolean;
}

export const RecallExercise: React.FC<RecallExerciseProps> = ({
    signData,
    correctAnswer,
    onAnswer,
    disabled = false,
}) => {
    // State resets automatically when component remounts (via key prop in parent)
    const [isPlaying, setIsPlaying] = useState(true);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [hasAnswered, setHasAnswered] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current && !disabled) {
            inputRef.current.focus();
        }
    }, [disabled]);

    const handlePlayPause = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    const handleReplay = useCallback(() => {
        setCurrentFrame(0);
        setIsPlaying(true);
    }, []);

    const handleFrameChange = useCallback((frame: number) => {
        setCurrentFrame(frame);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (hasAnswered || disabled) return;
        setInputValue(e.target.value);
    }, [hasAnswered, disabled]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (hasAnswered || disabled || !inputValue.trim()) return;

        const answer = inputValue.trim();
        const correct = answer.toLowerCase() === correctAnswer.toLowerCase();

        setHasAnswered(true);
        setIsCorrect(correct);
        onAnswer(answer, correct);
    }, [hasAnswered, disabled, inputValue, correctAnswer, onAnswer]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
    }, [handleSubmit]);

    const getInputClassName = () => {
        let className = 'recall-exercise__input';
        if (hasAnswered) {
            className += isCorrect
                ? ' recall-exercise__input--correct'
                : ' recall-exercise__input--incorrect';
        }
        return className;
    };

    return (
        <div className="recall-exercise">
            <h2 className="recall-exercise__prompt">
                What sign is this?
            </h2>

            <div className="recall-exercise__animation">
                <SignAnimator
                    signData={signData}
                    isPlaying={isPlaying}
                    playbackSpeed={playbackSpeed}
                    size="medium"
                    onFrameChange={handleFrameChange}
                />
            </div>

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

            <form className="recall-exercise__form" onSubmit={handleSubmit}>
                <div className="recall-exercise__input-wrapper">
                    <input
                        ref={inputRef}
                        type="text"
                        className={getInputClassName()}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your answer..."
                        disabled={hasAnswered || disabled}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label="Type the word for this sign"
                    />
                    {hasAnswered && !isCorrect && (
                        <div className="recall-exercise__correct-answer">
                            Correct answer: <strong>{formatSignName(correctAnswer)}</strong>
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    className="recall-exercise__submit-btn"
                    disabled={hasAnswered || disabled || !inputValue.trim()}
                >
                    {hasAnswered ? (isCorrect ? 'Correct!' : 'Incorrect') : 'Check'}
                </button>
            </form>

            <p className="recall-exercise__hint">
                Type the English word for this sign
            </p>
        </div>
    );
};

export default RecallExercise;
