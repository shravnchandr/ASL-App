/**
 * ExerciseCard Component
 * Common wrapper for all exercise types with progress, feedback, and XP display
 */

import React from 'react';
import './ExerciseCard.css';

interface ExerciseCardProps {
    currentIndex: number;
    totalExercises: number;
    children: React.ReactNode;
    onSkip?: () => void;
    feedback?: {
        isCorrect: boolean;
        message: string;
    } | null;
    xpEarned?: number;
    showXpAnimation?: boolean;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
    currentIndex,
    totalExercises,
    children,
    onSkip,
    feedback,
    xpEarned = 0,
    showXpAnimation = false,
}) => {
    const progress = ((currentIndex + 1) / totalExercises) * 100;
    // XP animation is controlled by parent via showXpAnimation prop
    // CSS animation handles the fade-out timing
    const showXp = showXpAnimation && xpEarned > 0;

    return (
        <div className="exercise-card">
            {/* Progress header */}
            <header className="exercise-card__header">
                <div className="exercise-card__progress-info">
                    <span className="exercise-card__progress-text">
                        Exercise {currentIndex + 1} of {totalExercises}
                    </span>
                    {onSkip && (
                        <button
                            className="exercise-card__skip-btn"
                            onClick={onSkip}
                            aria-label="Skip this exercise"
                        >
                            Skip
                        </button>
                    )}
                </div>
                <div className="exercise-card__progress-bar">
                    <div
                        className="exercise-card__progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </header>

            {/* Main content area */}
            <main className="exercise-card__content">
                {children}
            </main>

            {/* Feedback display */}
            {feedback && (
                <div
                    className={`exercise-card__feedback ${
                        feedback.isCorrect
                            ? 'exercise-card__feedback--correct'
                            : 'exercise-card__feedback--incorrect'
                    }`}
                    role="alert"
                >
                    <span className="exercise-card__feedback-icon">
                        {feedback.isCorrect ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path
                                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                                    fill="currentColor"
                                />
                            </svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
                                    fill="currentColor"
                                />
                            </svg>
                        )}
                    </span>
                    <span className="exercise-card__feedback-message">
                        {feedback.message}
                    </span>
                </div>
            )}

            {/* XP animation */}
            {showXp && xpEarned > 0 && (
                <div className="exercise-card__xp-animation" aria-live="polite">
                    +{xpEarned} XP
                </div>
            )}
        </div>
    );
};

export default ExerciseCard;
