/**
 * LearnPage Component
 * Main page for the ASL learning feature with Duolingo-style exercises
 */

import React, { useEffect, useState, useCallback } from 'react';
import { LearnProvider, useLearn } from '../../contexts/LearnContext';
import { ExerciseCard } from './ExerciseCard';
import { SignToWordExercise } from './SignToWordExercise';
import { WordToSignExercise } from './WordToSignExercise';
import { RecallExercise } from './RecallExercise';
import { SignBrowser } from './SignBrowser';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './LearnPage.css';

interface LearnPageContentProps {
    onBack?: () => void;
}

// Inner component that uses the context
const LearnPageContent: React.FC<LearnPageContentProps> = ({ onBack }) => {
    const {
        state,
        startSession,
        endSession,
        answerExercise,
        skipExercise,
        nextExercise,
        loadSign,
        getCurrentExercise,
        isLastExercise,
    } = useLearn();

    const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
    const [showXp, setShowXp] = useState(false);
    const [lastXp, setLastXp] = useState(0);
    const [signData, setSignData] = useState<SignData | null>(null);
    const [optionSignData, setOptionSignData] = useState<Array<{ sign: string; data: SignData | null }>>([]);
    const [showSignBrowser, setShowSignBrowser] = useState(false);

    const currentExercise = getCurrentExercise();

    // Load sign data when exercise changes
    useEffect(() => {
        const loadCurrentSignData = async () => {
            if (!currentExercise) return;

            const data = await loadSign(currentExercise.sign);
            setSignData(data);

            // For word-to-sign, load all option sign data
            if (currentExercise.type === 'word-to-sign' && currentExercise.options) {
                const optionData = await Promise.all(
                    currentExercise.options.map(async (sign) => ({
                        sign,
                        data: await loadSign(sign),
                    }))
                );
                setOptionSignData(optionData);
            }
        };

        loadCurrentSignData();
        setFeedback(null);
    }, [currentExercise, loadSign]);

    const handleAnswer = useCallback((answer: string, isCorrect: boolean) => {
        answerExercise(answer, isCorrect);

        if (isCorrect) {
            const xp = currentExercise?.type === 'recall' ? 20 : 10;
            setLastXp(xp);
            setShowXp(true);
            setFeedback({ isCorrect: true, message: 'Correct! Great job!' });
        } else {
            setFeedback({
                isCorrect: false,
                message: `Not quite. The answer was "${formatSignName(currentExercise?.correctAnswer || '')}".`,
            });
        }

        // Auto-advance after delay
        setTimeout(() => {
            if (isLastExercise()) {
                // Session complete - show will be handled by state
            } else {
                nextExercise();
                setFeedback(null);
                setShowXp(false);
            }
        }, 2000);
    }, [answerExercise, currentExercise, isLastExercise, nextExercise]);

    const handleSkip = useCallback(() => {
        skipExercise();
        if (!isLastExercise()) {
            nextExercise();
        }
        setFeedback(null);
    }, [skipExercise, isLastExercise, nextExercise]);

    const handleStartSession = useCallback(() => {
        startSession(10);
    }, [startSession]);

    const handleBackToHome = useCallback(() => {
        if (onBack) {
            onBack();
        } else {
            window.location.href = '/';
        }
    }, [onBack]);

    // Session complete screen
    if (state.isSessionActive && state.currentIndex >= state.exercises.length - 1 && feedback) {
        return (
            <div className="learn-page">
                <header className="learn-page__header">
                    <button className="learn-page__back-btn" onClick={handleBackToHome}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                        </svg>
                        Back to Home
                    </button>
                </header>

                <main className="learn-page__content">
                    <div className="session-complete">
                        <div className="session-complete__icon">🎉</div>
                        <h1 className="session-complete__title">Session Complete!</h1>
                        <div className="session-complete__stats">
                            <div className="stat">
                                <span className="stat__value">{state.sessionScore}</span>
                                <span className="stat__label">XP Earned</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value">{state.exercises.length}</span>
                                <span className="stat__label">Exercises</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value">Level {state.level}</span>
                                <span className="stat__label">Current Level</span>
                            </div>
                        </div>
                        <div className="session-complete__actions">
                            <button className="btn btn--primary" onClick={handleStartSession}>
                                Practice Again
                            </button>
                            <button className="btn btn--secondary" onClick={handleBackToHome}>
                                Back to Home
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // Active session
    if (state.isSessionActive && currentExercise) {
        return (
            <div className="learn-page">
                <header className="learn-page__header">
                    <button className="learn-page__back-btn" onClick={endSession}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" />
                        </svg>
                        End Session
                    </button>
                    <div className="learn-page__stats">
                        <span className="learn-page__xp">XP: {state.totalXP}</span>
                        <span className="learn-page__level">Level {state.level}</span>
                    </div>
                </header>

                <main className="learn-page__content">
                    <ExerciseCard
                        currentIndex={state.currentIndex}
                        totalExercises={state.exercises.length}
                        onSkip={handleSkip}
                        feedback={feedback}
                        xpEarned={lastXp}
                        showXpAnimation={showXp}
                    >
                        {currentExercise.type === 'sign-to-word' && (
                            <SignToWordExercise
                                signData={signData}
                                options={currentExercise.options || []}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}

                        {currentExercise.type === 'word-to-sign' && (
                            <WordToSignExercise
                                targetWord={currentExercise.correctAnswer}
                                options={optionSignData}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}

                        {currentExercise.type === 'recall' && (
                            <RecallExercise
                                signData={signData}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}
                    </ExerciseCard>
                </main>
            </div>
        );
    }

    // Show Sign Browser
    if (showSignBrowser) {
        return <SignBrowser onClose={() => setShowSignBrowser(false)} />;
    }

    // Landing/Start screen
    return (
        <div className="learn-page">
            <header className="learn-page__header">
                <button className="learn-page__back-btn" onClick={handleBackToHome}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                    </svg>
                    Back to Home
                </button>
                <button className="learn-page__browse-btn" onClick={() => setShowSignBrowser(true)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" fill="currentColor" />
                    </svg>
                    Browse Signs
                </button>
            </header>

            <main className="learn-page__content">
                <div className="learn-landing">
                    <div className="learn-landing__icon">🤟</div>
                    <h1 className="learn-landing__title">ASL Learn</h1>
                    <p className="learn-landing__subtitle">
                        Practice recognizing ASL signs with interactive exercises
                    </p>

                    <div className="learn-landing__stats">
                        <div className="stat-card">
                            <span className="stat-card__value">{state.totalXP}</span>
                            <span className="stat-card__label">Total XP</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-card__value">{state.level}</span>
                            <span className="stat-card__label">Level</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-card__value">{state.streak}</span>
                            <span className="stat-card__label">Day Streak</span>
                        </div>
                    </div>

                    {state.error && (
                        <div className="learn-landing__error" role="alert">
                            {state.error}
                        </div>
                    )}

                    <div className="learn-landing__actions">
                        <button
                            className="learn-landing__start-btn"
                            onClick={handleStartSession}
                            disabled={state.isLoading}
                        >
                            {state.isLoading ? (
                                <>
                                    <span className="spinner" />
                                    Loading...
                                </>
                            ) : (
                                <>
                                    Start Practice
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                        <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
                                    </svg>
                                </>
                            )}
                        </button>

                        <button
                            className="learn-landing__browse-btn"
                            onClick={() => setShowSignBrowser(true)}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor" />
                            </svg>
                            Browse All Signs
                        </button>
                    </div>

                    <p className="learn-landing__hint">
                        Complete exercises to earn XP and level up!
                    </p>
                </div>
            </main>
        </div>
    );
};

interface LearnPageProps {
    onBack?: () => void;
}

// Wrapper component with provider
export const LearnPage: React.FC<LearnPageProps> = ({ onBack }) => {
    return (
        <LearnProvider>
            <LearnPageContent onBack={onBack} />
        </LearnProvider>
    );
};

export default LearnPage;
