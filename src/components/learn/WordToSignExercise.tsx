import React, { useState, useCallback } from 'react';
import { SignAnimator } from './SignAnimator';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types/index';
import './WordToSignExercise.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

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
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);

    const handleSelect = useCallback((sign: string) => {
        if (hasAnswered || disabled) return;
        setSelectedAnswer(sign);
        setHasAnswered(true);
        const isCorrect = sign.toLowerCase() === correctAnswer.toLowerCase();
        onAnswer(sign, isCorrect);
    }, [hasAnswered, disabled, correctAnswer, onAnswer]);

    const handleTogglePlay = useCallback((index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPlayingIndex(prev => prev === index ? null : index);
    }, []);

    const getOptionClassName = (sign: string) => {
        let cls = 'sign-option';
        if (hasAnswered) {
            if (sign.toLowerCase() === correctAnswer.toLowerCase()) {
                cls += ' sign-option--correct';
            } else if (sign === selectedAnswer) {
                cls += ' sign-option--incorrect';
            } else {
                cls += ' sign-option--disabled';
            }
        }
        return cls;
    };

    return (
        <div className="word-to-sign">
            {/* Prompt */}
            <div className="wts-prompt">
                <div className="wts-prompt__label">WHICH SIGN MEANS</div>
                <div className="wts-prompt__word-box">
                    <span className="wts-prompt__word">"{formatSignName(targetWord)}"</span>
                </div>
                <p className="wts-prompt__sub">Tap any sign to preview it. Take your time — we wait for you.</p>
            </div>

            {/* 2×2 option grid */}
            <div className="word-to-sign__options" role="group" aria-label="Sign options">
                {options.map((option, index) => (
                    <div
                        key={option.sign}
                        className={getOptionClassName(option.sign)}
                        onClick={() => handleSelect(option.sign)}
                        role="button"
                        tabIndex={hasAnswered || disabled ? -1 : 0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleSelect(option.sign); }}
                        aria-label={`Option ${OPTION_LABELS[index]}: ${formatSignName(option.sign)}`}
                        aria-disabled={hasAnswered || disabled}
                    >
                        <div className="sign-option__label">{OPTION_LABELS[index]}</div>

                        <div
                            className="sign-option__anim"
                            onClick={e => handleTogglePlay(index, e)}
                            aria-label={`Preview option ${OPTION_LABELS[index]}`}
                        >
                            <SignAnimator
                                signData={option.data}
                                isPlaying={playingIndex === index}
                                playbackSpeed={1}
                                size="small"
                            />
                        </div>

                        <div className="sign-option__footer">
                            <span className="sign-option__frames">
                                {option.data?.frame_count ?? 0} fr
                            </span>
                            <button
                                className="sign-option__select"
                                onClick={e => { e.stopPropagation(); handleSelect(option.sign); }}
                                disabled={hasAnswered || disabled}
                                aria-label={`Select option ${OPTION_LABELS[index]}`}
                            >
                                Select
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WordToSignExercise;
