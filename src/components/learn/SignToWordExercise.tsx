/**
 * SignToWordExercise Component
 * Shows animation, user picks the correct word from 4 options
 * Easiest exercise type
 */

import React, { useState, useCallback, useEffect } from 'react';
import { SignAnimator } from './SignAnimator';
import { PlaybackControls } from './PlaybackControls';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './SignToWordExercise.css';

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

    // Reset state when exercise changes
    useEffect(() => {
        setSelectedAnswer(null);
        setHasAnswered(false);
        setCurrentFrame(0);
        setIsPlaying(true);
    }, [correctAnswer, signData]);

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

    const handleOptionClick = useCallback((option: string) => {
        if (hasAnswered || disabled) return;

        setSelectedAnswer(option);
        setHasAnswered(true);
        const isCorrect = option.toLowerCase() === correctAnswer.toLowerCase();
        onAnswer(option, isCorrect);
    }, [hasAnswered, disabled, correctAnswer, onAnswer]);

    const getOptionClassName = (option: string) => {
        let className = 'sign-to-word__option';

        if (hasAnswered) {
            if (option.toLowerCase() === correctAnswer.toLowerCase()) {
                className += ' sign-to-word__option--correct';
            } else if (option === selectedAnswer) {
                className += ' sign-to-word__option--incorrect';
            } else {
                className += ' sign-to-word__option--disabled';
            }
        }

        return className;
    };

    return (
        <div className="sign-to-word">
            <h2 className="sign-to-word__prompt">
                What sign is this?
            </h2>

            <div className="sign-to-word__animation">
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

            <div className="sign-to-word__options" role="group" aria-label="Answer options">
                {options.map((option, index) => (
                    <button
                        key={option}
                        className={getOptionClassName(option)}
                        onClick={() => handleOptionClick(option)}
                        disabled={hasAnswered || disabled}
                        aria-label={`Option ${index + 1}: ${formatSignName(option)}`}
                        aria-pressed={selectedAnswer === option}
                    >
                        {formatSignName(option)}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SignToWordExercise;
