/**
 * LearnPage Component
 * Main page for the ASL learning feature with level-based progression
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LearnProvider, useLearn } from '../../contexts/LearnContext';
import { ExerciseCard } from './ExerciseCard';
import { SignToWordExercise } from './SignToWordExercise';
import { WordToSignExercise } from './WordToSignExercise';
import { RecallExercise } from './RecallExercise';
import { CameraPracticeExercise } from './CameraPracticeExercise';
import { SignBrowser } from './SignBrowser';
import { LevelSelector } from './LevelSelector';
import { FlowerShape } from '../FlowerShape';
import { formatSignName } from '../../utils/format';
import { getLevelById, MASTERY_THRESHOLD } from '../../constants/levels';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import type { SignData } from '../../types';
import './LearnPage.css';

// Inner component that uses the context
const LearnPageContent: React.FC = () => {
    const {
        state,
        startLevelSession,
        startPracticeSession,
        endSession,
        answerExercise,
        skipExercise,
        nextExercise,
        loadSign,
        getCurrentExercise,
        isLastExercise,
        selectLevel,
        calculateLevelMastery,
        getReviewDueCountForLevel,
        clearJustUnlocked,
        levels,
    } = useLearn();
    const [searchParams] = useSearchParams();

    const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
    const [showXp, setShowXp] = useState(false);
    const [lastXp, setLastXp] = useState(0);
    const [signData, setSignData] = useState<SignData | null>(null);
    const [optionSignData, setOptionSignData] = useState<Array<{ sign: string; data: SignData | null }>>([]);
    const [showSignBrowser, setShowSignBrowser] = useState(false);
    const [exerciseResults, setExerciseResults] = useState<Array<{ sign: string; isCorrect: boolean }>>([]);
    const { isEnabled: soundEnabled, toggleSounds, playSuccess, playError: playSoundError } = useSoundEffects();

    // Refs for cleanup
    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unlockCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    const sessionStartTimeRef = useRef<number>(0);
    const [sessionElapsed, setSessionElapsed] = useState(0);

    const currentExercise = getCurrentExercise();
    const selectedLevelInfo = state.selectedLevel ? getLevelById(state.selectedLevel) : null;

    // Show unlock celebration when justUnlockedLevel is set in context
    const showUnlockCelebration = state.justUnlockedLevel !== null;

    // Cleanup timers on unmount; record session start time on mount
    useEffect(() => {
        isMountedRef.current = true;
        sessionStartTimeRef.current = Date.now();

        // If navigated from dictionary with ?practice=1, auto-start a practice session
        if (searchParams.get('practice') === '1') {
            try {
                const raw = sessionStorage.getItem('asl_practice_words');
                if (raw) {
                    const words: string[] = JSON.parse(raw);
                    sessionStorage.removeItem('asl_practice_words');
                    void startPracticeSession(words);
                }
            } catch { /* ignore parse errors */ }
        }

        return () => {
            isMountedRef.current = false;
            if (autoAdvanceTimerRef.current) {
                clearTimeout(autoAdvanceTimerRef.current);
            }
            if (unlockCelebrationTimerRef.current) {
                clearTimeout(unlockCelebrationTimerRef.current);
            }
        };
    // startPracticeSession is stable (useCallback); searchParams value captured once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Capture elapsed time when session completes so render doesn't call Date.now()
    const sessionIsComplete = state.isSessionActive && state.currentIndex >= state.exercises.length - 1 && !!feedback;
    useEffect(() => {
        if (sessionIsComplete) {
            setSessionElapsed(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
        }
    }, [sessionIsComplete]);

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

        // Track result for session complete screen
        if (correctAnswer) {
            setExerciseResults(prev => [...prev, { sign: correctAnswer, isCorrect }]);
        }

        answerExercise(answer, isCorrect);

        if (isCorrect) {
            const xp = exerciseType === 'recall' ? 20 : 10;
            setLastXp(xp);
            setShowXp(true);
            setFeedback({ isCorrect: true, message: 'Correct! Great job!' });
            playSuccess();
        } else {
            setFeedback({
                isCorrect: false,
                message: `Not quite. The answer was "${formatSignName(correctAnswer)}".`,
            });
            playSoundError();
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
    }, [answerExercise, currentExercise, isLastExercise, nextExercise, playSuccess, playSoundError]);

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
            setExerciseResults([]);
            sessionStartTimeRef.current = Date.now();
            startLevelSession(levelToStart, 10);
        }
    }, [startLevelSession, state.selectedLevel, state.currentLevel]);

    const handleStartCameraPractice = useCallback(() => {
        const levelToStart = state.selectedLevel || state.currentLevel;
        if (levelToStart) {
            setFeedback(null);
            // Start a session with camera-practice type exercises
            startLevelSession(levelToStart, 10, true);
        }
    }, [startLevelSession, state.selectedLevel, state.currentLevel]);

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
        const nextLevelInfo = getLevelById(state.currentLevel + 1);
        const correctCount = exerciseResults.filter(r => r.isCorrect).length;
        const totalCount = exerciseResults.length || state.exercises.length;
        const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
        const elapsed = sessionElapsed;
        const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
        const missedSigns = exerciseResults.filter(r => !r.isCorrect).map(r => r.sign);

        return (
            <div className="session-complete-page">
                {/* Purple header */}
                <div className="sc-header">
                    <div className="sc-header__eyebrow">LESSON COMPLETE</div>
                    <h1 className="sc-header__title">Beautifully done.</h1>
                    <p className="sc-header__subtitle">
                        You signed {correctCount} of {totalCount} correctly.
                        {nextLevelUnlocked && nextLevelInfo && ` ${nextLevelInfo.name} is now unlocked.`}
                    </p>
                </div>

                {/* Score card — overlaps header/body */}
                <div className="sc-score-card">
                    <div className="sc-score-badge">
                        <FlowerShape size={88} fill="var(--md-sys-color-secondary)" petals={8}>
                            <div className="sc-score-badge__inner">
                                <span className="sc-score-badge__pct">{scorePercent}%</span>
                                <span className="sc-score-badge__label">SCORE</span>
                            </div>
                        </FlowerShape>
                    </div>
                    <div className="sc-score-info">
                        <div className="sc-score-info__lesson">
                            {currentLevelInfo?.name} · Lesson {state.currentLevel}
                        </div>
                        <div className="sc-score-info__chapter">
                            Level {state.currentLevel} · {levelMastery}% mastery overall
                        </div>
                        <div className="sc-score-chips">
                            <div className="sc-chip sc-chip--blue">
                                <span className="sc-chip__val">+{state.sessionScore}</span>
                                <span className="sc-chip__lbl">XP</span>
                            </div>
                            <div className="sc-chip sc-chip--green">
                                <span className="sc-chip__val">{correctCount}/{totalCount}</span>
                                <span className="sc-chip__lbl">Correct</span>
                            </div>
                            <div className="sc-chip sc-chip--peach">
                                <span className="sc-chip__val">{elapsedStr}</span>
                                <span className="sc-chip__lbl">Time</span>
                            </div>
                            <div className="sc-chip sc-chip--pink">
                                <span className="sc-chip__val">+{state.streak}</span>
                                <span className="sc-chip__lbl">Streak</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body: sign-by-sign + actions */}
                <div className="sc-body">
                    {/* Sign by sign list */}
                    <div className="sc-sign-list">
                        <div className="sc-sign-list__title">Sign by sign</div>
                        <ul>
                            {exerciseResults.map((r, i) => (
                                <li key={i} className={`sc-sign-row ${r.isCorrect ? 'sc-sign-row--correct' : 'sc-sign-row--incorrect'}`}>
                                    <span className="sc-sign-row__icon">
                                        {r.isCorrect
                                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                                        }
                                    </span>
                                    <span className="sc-sign-row__name">{formatSignName(r.sign)}</span>
                                    {!r.isCorrect && (
                                        <button
                                            className="sc-sign-row__retry"
                                            onClick={handleStartLevelSession}
                                        >
                                            Retry
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Actions */}
                    <div className="sc-actions">
                        {nextLevelInfo && nextLevelUnlocked ? (
                            <button className="sc-actions__primary" onClick={() => {
                                setExerciseResults([]);
                                sessionStartTimeRef.current = Date.now();
                                startLevelSession(state.currentLevel + 1, 10);
                            }}>
                                → Continue to Lesson {state.currentLevel + 1}
                            </button>
                        ) : (
                            <button className="sc-actions__primary" onClick={handleStartLevelSession}>
                                → Practice again
                            </button>
                        )}
                        {missedSigns.length > 0 && (
                            <button className="sc-actions__secondary" onClick={handleStartLevelSession}>
                                Practice missed signs
                            </button>
                        )}
                        <button className="sc-actions__ghost" onClick={handleBackToLevels}>
                            Back to Learn
                        </button>
                    </div>
                </div>
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
                        <button
                            className="learn-page__sound-btn"
                            onClick={toggleSounds}
                            aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
                            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
                        >
                            {soundEnabled ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            )}
                        </button>
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

                        {currentExercise.type === 'camera-practice' && (
                            <CameraPracticeExercise
                                key={`${currentExercise.correctAnswer}-${state.currentIndex}`}
                                targetSign={currentExercise.correctAnswer}
                                levelId={state.currentLevel}
                                onComplete={(isCorrect) => handleAnswer(currentExercise.correctAnswer, isCorrect)}
                                onSkip={handleSkip}
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

    // Level detail view (after selecting a level)
    if (selectedLevelInfo && !state.isSessionActive) {
        const levelMastery = calculateLevelMastery(selectedLevelInfo.id);
        const dueCount = getReviewDueCountForLevel(selectedLevelInfo.id);

        return (
            <div className="learn-page">
                <main className="learn-page__content">
                    <div className="level-detail">
                        <button className="level-detail__back-btn" onClick={handleBackToLevels}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                            </svg>
                            All levels
                        </button>
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

                        {dueCount > 0 && (
                            <p className="level-detail__review-notice" role="status">
                                {dueCount} sign{dueCount !== 1 ? 's' : ''} scheduled for review today — they'll appear first in your session.
                            </p>
                        )}

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
                            {/* Camera practice available for Alphabet (level 1) and Numbers (level 2) */}
                            {(selectedLevelInfo.id === 1 || selectedLevelInfo.id === 2) && (
                                <button
                                    className="level-detail__camera-btn"
                                    onClick={handleStartCameraPractice}
                                    disabled={state.isLoading}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/>
                                    </svg>
                                    Practice with Camera
                                </button>
                            )}
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

            </div>
        );
    }

    // Landing/Level selector screen
    return (
        <div className="learn-page">
            <main className="learn-page__content">
                <div className="learn-page__hero">
                    <div className="learn-page__hero-text">
                        <div className="learn-page__hero-label">YOUR PATH · 10 LEVELS</div>
                        <h1 className="learn-page__hero-title">
                            Sign by sign,<br/>step by step.
                        </h1>
                        <button className="learn-page__browse-btn--inline" onClick={() => setShowSignBrowser(true)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" fill="currentColor" />
                            </svg>
                            Browse all signs
                        </button>
                    </div>
                    <div className="learn-page__hero-badges">
                        {state.streak > 0 && (
                            <div className="learn-stat-pill learn-stat-pill--streak">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--md-sys-color-secondary)" aria-hidden="true">
                                    <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67z" />
                                </svg>
                                <span>{state.streak} days</span>
                            </div>
                        )}
                        <div className="learn-stat-pill learn-stat-pill--xp">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--md-sys-color-accent-gold)" aria-hidden="true">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                            <span>{state.totalXP} XP</span>
                        </div>
                    </div>
                </div>

                <LevelSelector
                    levels={levels}
                    unlockedLevels={state.unlockedLevels}
                    currentLevel={state.currentLevel}
                    onSelectLevel={selectLevel}
                    getLevelMastery={calculateLevelMastery}
                    getReviewDueCount={getReviewDueCountForLevel}
                />
            </main>

        </div>
    );
};

// Wrapper component with provider
export const LearnPage: React.FC = () => {
    return (
        <LearnProvider>
            <LearnPageContent />
        </LearnProvider>
    );
};

export default LearnPage;
