/**
 * WordToSignExercise Component
 * Shows a target word, user picks the correct animation from 4 options
 * Medium difficulty
 */

import React, { useState, useCallback } from 'react';
import { SignAnimator } from './SignAnimator';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './WordToSignExercise.css';

interface SignOption {
    sign: string;
    data: SignData | null;
}

interface WordToSignExerciseProps {
    targetWord: string;
    options: SignOption[];
    correctAnswer: string;
    onAnswer: (answer: string, isCorrect: boolean) => void;
    disabled?: boolean;
}

export const WordToSignExercise: React.FC<WordToSignExerciseProps> = ({
    targetWord,
    options,
    correctAnswer,
    onAnswer,
    disabled = false,
}) => {
    // State resets automatically when component remounts (via key prop in parent)
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);

    const handleOptionClick = useCallback((sign: string) => {
        if (hasAnswered || disabled) return;

        setSelectedAnswer(sign);
        setHasAnswered(true);
        const isCorrect = sign.toLowerCase() === correctAnswer.toLowerCase();
        onAnswer(sign, isCorrect);
    }, [hasAnswered, disabled, correctAnswer, onAnswer]);

    const handlePlayOption = useCallback((index: number) => {
        setPlayingIndex(prev => prev === index ? null : index);
    }, []);

    const getOptionClassName = (sign: string) => {
        let className = 'word-to-sign__option';

        if (hasAnswered) {
            if (sign.toLowerCase() === correctAnswer.toLowerCase()) {
                className += ' word-to-sign__option--correct';
            } else if (sign === selectedAnswer) {
                className += ' word-to-sign__option--incorrect';
            } else {
                className += ' word-to-sign__option--disabled';
            }
        }

        return className;
    };

    return (
        <div className="word-to-sign">
            <h2 className="word-to-sign__prompt">
                Which sign means "<span className="word-to-sign__target">{formatSignName(targetWord)}</span>"?
            </h2>

            <div className="word-to-sign__options" role="group" aria-label="Sign options">
                {options.map((option, index) => (
                    <div
                        key={option.sign}
                        className={getOptionClassName(option.sign)}
                    >
                        <button
                            className="word-to-sign__play-btn"
                            onClick={() => handlePlayOption(index)}
                            disabled={disabled}
                            aria-label={`Play sign ${index + 1}`}
                        >
                            {playingIndex === index ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
                                </svg>
                            )}
                        </button>

                        <div className="word-to-sign__animation">
                            <SignAnimator
                                signData={option.data}
                                isPlaying={playingIndex === index}
                                playbackSpeed={1}
                                size="small"
                            />
                        </div>

                        <button
                            className="word-to-sign__select-btn"
                            onClick={() => handleOptionClick(option.sign)}
                            disabled={hasAnswered || disabled}
                            aria-label={`Select option ${index + 1}`}
                        >
                            Select
                        </button>
                    </div>
                ))}
            </div>

            <p className="word-to-sign__hint">
                Tap play to preview each sign, then select your answer
            </p>
        </div>
    );
};

export default WordToSignExercise;
