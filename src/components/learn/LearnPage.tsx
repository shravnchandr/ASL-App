/**
 * LearnPage Component
 * Main page for the ASL learning feature with level-based progression
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { LearnProvider, useLearn } from '../../contexts/LearnContext';
import { ExerciseCard } from './ExerciseCard';
import { SignToWordExercise } from './SignToWordExercise';
import { WordToSignExercise } from './WordToSignExercise';
import { RecallExercise } from './RecallExercise';
import { SignBrowser } from './SignBrowser';
import { LevelSelector } from './LevelSelector';
import { GeneralFeedbackModal } from '../features/GeneralFeedbackModal';
import { FloatingFeedbackButton } from '../features/FloatingFeedbackButton';
import { formatSignName } from '../../utils/format';
import { getLevelById, MASTERY_THRESHOLD } from '../../constants/levels';
import { submitGeneralFeedback } from '../../services/api';
import { announceToScreenReader } from '../../utils/accessibility';
import type { SignData } from '../../types';
import './LearnPage.css';

interface LearnPageContentProps {
    onBack?: () => void;
}

// Inner component that uses the context
const LearnPageContent: React.FC<LearnPageContentProps> = ({ onBack }) => {
    const {
        state,
        startLevelSession,
        endSession,
        answerExercise,
        skipExercise,
        nextExercise,
        loadSign,
        getCurrentExercise,
        isLastExercise,
        selectLevel,
        calculateLevelMastery,
        clearJustUnlocked,
        levels,
    } = useLearn();

    const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
    const [showXp, setShowXp] = useState(false);
    const [lastXp, setLastXp] = useState(0);
    const [signData, setSignData] = useState<SignData | null>(null);
    const [optionSignData, setOptionSignData] = useState<Array<{ sign: string; data: SignData | null }>>([]);
    const [showSignBrowser, setShowSignBrowser] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);

    // Refs for cleanup
    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unlockCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);

    const currentExercise = getCurrentExercise();
    const selectedLevelInfo = state.selectedLevel ? getLevelById(state.selectedLevel) : null;

    // Show unlock celebration when justUnlockedLevel is set in context
    const showUnlockCelebration = state.justUnlockedLevel !== null;

    // Cleanup timers on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (autoAdvanceTimerRef.current) {
                clearTimeout(autoAdvanceTimerRef.current);
            }
            if (unlockCelebrationTimerRef.current) {
                clearTimeout(unlockCelebrationTimerRef.current);
            }
        };
    }, []);

    // Auto-dismiss unlock celebration after 3 seconds
    useEffect(() => {
        if (state.justUnlockedLevel !== null) {
            unlockCelebrationTimerRef.current = setTimeout(() => {
                clearJustUnlocked();
            }, 3000);
            return () => {
                if (unlockCelebrationTimerRef.current) {
                    clearTimeout(unlockCelebrationTimerRef.current);
                }
            };
        }
    }, [state.justUnlockedLevel, clearJustUnlocked]);

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
        // Feedback is cleared in handleAnswer and handleSkip event handlers
        // to avoid synchronous setState in effect
    }, [currentExercise, loadSign]);

    const handleAnswer = useCallback((answer: string, isCorrect: boolean) => {
        // Clear any existing auto-advance timer
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
        }

        // Capture current exercise info before state changes
        const exerciseType = currentExercise?.type;
        const correctAnswer = currentExercise?.correctAnswer || '';

        answerExercise(answer, isCorrect);

        if (isCorrect) {
            const xp = exerciseType === 'recall' ? 20 : 10;
            setLastXp(xp);
            setShowXp(true);
            setFeedback({ isCorrect: true, message: 'Correct! Great job!' });
        } else {
            setFeedback({
                isCorrect: false,
                message: `Not quite. The answer was "${formatSignName(correctAnswer)}".`,
            });
        }

        // Auto-advance after delay with cleanup support
        autoAdvanceTimerRef.current = setTimeout(() => {
            // Check if component is still mounted before updating state
            if (!isMountedRef.current) return;

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

    const handleStartLevelSession = useCallback(() => {
        // Use currentLevel for "Practice Again" on completion screen, or selectedLevel for starting new
        const levelToStart = state.selectedLevel || state.currentLevel;
        if (levelToStart) {
            setFeedback(null);
            startLevelSession(levelToStart, 10);
        }
    }, [startLevelSession, state.selectedLevel, state.currentLevel]);

    const handleBackToHome = useCallback(() => {
        if (onBack) {
            onBack();
        } else {
            window.location.href = '/';
        }
    }, [onBack]);

    const handleBackToLevels = useCallback(() => {
        endSession();
        selectLevel(null);
        setFeedback(null);
    }, [endSession, selectLevel]);

    const handleEndSession = useCallback(() => {
        endSession();
        selectLevel(null);
        setFeedback(null);
    }, [endSession, selectLevel]);

    const handleFeedbackSubmit = useCallback(async (
        category: string,
        feedbackText: string,
        email?: string
    ) => {
        try {
            // Add context about current exercise/sign if in a session
            let contextText = feedbackText;
            if (state.isSessionActive && currentExercise) {
                contextText = `[Learning Mode - Sign: "${currentExercise.sign}", Exercise Type: "${currentExercise.type}"]\n\n${feedbackText}`;
            }

            await submitGeneralFeedback({
                category,
                feedback_text: contextText,
                email,
            });
            announceToScreenReader('Feedback submitted successfully. Thank you!');
            setShowFeedbackModal(false);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            throw error;
        }
    }, [state.isSessionActive, currentExercise]);

    // Unlock celebration overlay
    if (showUnlockCelebration && state.justUnlockedLevel) {
        const unlockedLevel = getLevelById(state.justUnlockedLevel);
        return (
            <div className="learn-page">
                <div className="unlock-celebration">
                    <div className="unlock-celebration__content">
                        <div className="unlock-celebration__icon">🎉</div>
                        <h2 className="unlock-celebration__title">Level Unlocked!</h2>
                        <div className="unlock-celebration__level">
                            <span className="unlock-celebration__level-icon">{unlockedLevel?.icon}</span>
                            <span className="unlock-celebration__level-name">{unlockedLevel?.name}</span>
                        </div>
                        <p className="unlock-celebration__message">
                            You've mastered the previous level. Keep up the great work!
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Session complete screen
    if (state.isSessionActive && state.currentIndex >= state.exercises.length - 1 && feedback) {
        const levelMastery = calculateLevelMastery(state.currentLevel);
        const nextLevelUnlocked = state.unlockedLevels.includes(state.currentLevel + 1);
        const currentLevelInfo = getLevelById(state.currentLevel);

        return (
            <div className="learn-page">
                <header className="learn-page__header">
                    <button className="learn-page__back-btn" onClick={handleBackToLevels}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                        </svg>
                        Back to Levels
                    </button>
                </header>

                <main className="learn-page__content">
                    <div className="session-complete">
                        <div className="session-complete__icon">🎉</div>
                        <h1 className="session-complete__title">Session Complete!</h1>

                        <div className="session-complete__level-info">
                            <span className="session-complete__level-icon">{currentLevelInfo?.icon}</span>
                            <span className="session-complete__level-name">Level {state.currentLevel}: {currentLevelInfo?.name}</span>
                        </div>

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
                                <span className="stat__value">{levelMastery}%</span>
                                <span className="stat__label">Level Mastery</span>
                            </div>
                        </div>

                        {!nextLevelUnlocked && state.currentLevel < levels.length && (
                            <div className="session-complete__progress-hint">
                                <p>
                                    Reach {MASTERY_THRESHOLD}% mastery to unlock Level {state.currentLevel + 1}
                                </p>
                                <div className="session-complete__progress-bar">
                                    <div
                                        className="session-complete__progress-fill"
                                        style={{ width: `${(levelMastery / MASTERY_THRESHOLD) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="session-complete__actions">
                            <button className="btn btn--primary" onClick={handleStartLevelSession}>
                                Practice Again
                            </button>
                            <button className="btn btn--secondary" onClick={handleBackToLevels}>
                                Choose Another Level
                            </button>
                        </div>
                    </div>
                </main>

                <FloatingFeedbackButton onClick={() => setShowFeedbackModal(true)} />

                <GeneralFeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    onSubmit={handleFeedbackSubmit}
                />
            </div>
        );
    }

    // Active session
    if (state.isSessionActive && currentExercise) {
        return (
            <div className="learn-page">
                <header className="learn-page__header">
                    <button className="learn-page__back-btn" onClick={handleEndSession}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" />
                        </svg>
                        End Session
                    </button>
                    <div className="learn-page__stats">
                        <span className="learn-page__xp">XP: {state.totalXP}</span>
                        <span className="learn-page__level">Level {state.currentLevel}</span>
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
                                key={`${currentExercise.correctAnswer}-${state.currentIndex}`}
                                signData={signData}
                                options={currentExercise.options || []}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}

                        {currentExercise.type === 'word-to-sign' && (
                            <WordToSignExercise
                                key={`${currentExercise.correctAnswer}-${state.currentIndex}`}
                                targetWord={currentExercise.correctAnswer}
                                options={optionSignData}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}

                        {currentExercise.type === 'recall' && (
                            <RecallExercise
                                key={`${currentExercise.correctAnswer}-${state.currentIndex}`}
                                signData={signData}
                                correctAnswer={currentExercise.correctAnswer}
                                onAnswer={handleAnswer}
                                disabled={feedback !== null}
                            />
                        )}
                    </ExerciseCard>
                </main>

                <FloatingFeedbackButton onClick={() => setShowFeedbackModal(true)} />

                <GeneralFeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    onSubmit={handleFeedbackSubmit}
                />
            </div>
        );
    }

    // Show Sign Browser
    if (showSignBrowser) {
        return <SignBrowser onClose={() => setShowSignBrowser(false)} />;
    }

    // Level detail view (after selecting a level)
    if (selectedLevelInfo && !state.isSessionActive) {
        const levelMastery = calculateLevelMastery(selectedLevelInfo.id);

        return (
            <div className="learn-page">
                <header className="learn-page__header">
                    <button className="learn-page__back-btn" onClick={handleBackToLevels}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                        </svg>
                        Back to Levels
                    </button>
                    <button className="learn-page__browse-btn" onClick={() => setShowSignBrowser(true)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" fill="currentColor" />
                        </svg>
                        Browse Signs
                    </button>
                </header>

                <main className="learn-page__content">
                    <div className="level-detail">
                        <div className="level-detail__icon">{selectedLevelInfo.icon}</div>
                        <h1 className="level-detail__title">
                            Level {selectedLevelInfo.id}: {selectedLevelInfo.name}
                        </h1>
                        <p className="level-detail__description">{selectedLevelInfo.description}</p>

                        <div className="level-detail__stats">
                            <div className="stat-card">
                                <span className="stat-card__value">{selectedLevelInfo.signs.length}</span>
                                <span className="stat-card__label">Signs</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-card__value">{levelMastery}%</span>
                                <span className="stat-card__label">Mastery</span>
                            </div>
                        </div>

                        <div className="level-detail__progress">
                            <div className="level-detail__progress-bar">
                                <div
                                    className="level-detail__progress-fill"
                                    style={{ width: `${levelMastery}%` }}
                                />
                            </div>
                            <span className="level-detail__progress-text">
                                {levelMastery >= MASTERY_THRESHOLD
                                    ? 'Level Complete!'
                                    : `${MASTERY_THRESHOLD - levelMastery}% more to unlock next level`}
                            </span>
                        </div>

                        {state.error && (
                            <div className="level-detail__error" role="alert">
                                {state.error}
                            </div>
                        )}

                        <div className="level-detail__actions">
                            <button
                                className="level-detail__start-btn"
                                onClick={handleStartLevelSession}
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
                        </div>

                        <div className="level-detail__signs-preview">
                            <h3>Signs in this level:</h3>
                            <div className="level-detail__signs-list">
                                {selectedLevelInfo.signs.map(sign => (
                                    <span key={sign} className="level-detail__sign-chip">
                                        {formatSignName(sign)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>

                <FloatingFeedbackButton onClick={() => setShowFeedbackModal(true)} />

                <GeneralFeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    onSubmit={handleFeedbackSubmit}
                />
            </div>
        );
    }

    // Landing/Level selector screen
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
                <div className="learn-page__stats-bar">
                    <div className="stats-bar__item">
                        <span className="stats-bar__value">{state.totalXP}</span>
                        <span className="stats-bar__label">Total XP</span>
                    </div>
                    <div className="stats-bar__item">
                        <span className="stats-bar__value">{state.level}</span>
                        <span className="stats-bar__label">Player Level</span>
                    </div>
                    <div className="stats-bar__item">
                        <span className="stats-bar__value">{state.streak}</span>
                        <span className="stats-bar__label">Day Streak</span>
                    </div>
                </div>

                <LevelSelector
                    levels={levels}
                    unlockedLevels={state.unlockedLevels}
                    currentLevel={state.currentLevel}
                    onSelectLevel={selectLevel}
                    getLevelMastery={calculateLevelMastery}
                />
            </main>

            <FloatingFeedbackButton onClick={() => setShowFeedbackModal(true)} />

            <GeneralFeedbackModal
                isOpen={showFeedbackModal}
                onClose={() => setShowFeedbackModal(false)}
                onSubmit={handleFeedbackSubmit}
            />
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
