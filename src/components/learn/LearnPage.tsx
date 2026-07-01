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
import { GemShape } from '../GemShape';
import { formatSignName } from '../../utils/format';
import { getLevelById, MASTERY_THRESHOLD } from '../../constants/levels';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { storage } from '../../utils/storage';
import type { SignData } from '../../types';
import './LearnPage.css';

const LearnPageContent: React.FC = () => {
    const {
        state,
        startLevelSession,
        startPracticeSession,
        resumeSession,
        endSession,
        answerExercise,
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

    const hasResumeSession = state.activeSessionLevelId !== null && state.activeSessionLevelId === state.currentLevel;
    const [searchParams] = useSearchParams();

    const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
    const [showXp, setShowXp] = useState(false);
    const [lastXp, setLastXp] = useState(0);
    const [signData, setSignData] = useState<SignData | null>(null);
    const [optionSignData, setOptionSignData] = useState<Array<{ sign: string; data: SignData | null }>>([]);
    const [showSignBrowser, setShowSignBrowser] = useState(false);
    const [exerciseResults, setExerciseResults] = useState<Array<{ sign: string; isCorrect: boolean }>>([]);
    const { playSuccess, playError: playSoundError } = useSoundEffects();

    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unlockCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    const sessionStartTimeRef = useRef<number>(0);
    const [sessionElapsed, setSessionElapsed] = useState(0);

    const currentExercise = getCurrentExercise();
    const selectedLevelInfo = state.selectedLevel ? getLevelById(state.selectedLevel) : null;

    const showUnlockCelebration = state.justUnlockedLevel !== null;

    useEffect(() => {
        isMountedRef.current = true;
        sessionStartTimeRef.current = Date.now();

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

        if (searchParams.get('browse') === '1') {
            setShowSignBrowser(true);
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

    // Capture elapsed time once on completion so the render doesn't call Date.now() on every tick
    const sessionIsComplete = state.isSessionActive && state.currentIndex >= state.exercises.length - 1 && !!feedback;
    useEffect(() => {
        if (sessionIsComplete) {
            setSessionElapsed(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
        }
    }, [sessionIsComplete]);

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

    useEffect(() => {
        const loadCurrentSignData = async () => {
            if (!currentExercise) return;

            const data = await loadSign(currentExercise.sign);
            setSignData(data);

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
    }, [currentExercise, loadSign]);

    const handleAnswer = useCallback((answer: string, isCorrect: boolean) => {
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
        }

        const exerciseType = currentExercise?.type;
        const correctAnswer = currentExercise?.correctAnswer || '';

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

        autoAdvanceTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;

            if (isLastExercise()) {
                // leave state as-is — session complete screen renders from state
            } else {
                nextExercise();
                setFeedback(null);
                setShowXp(false);
            }
        }, 2000);
    }, [answerExercise, currentExercise, isLastExercise, nextExercise, playSuccess, playSoundError]);

    const handleSkip = useCallback(() => {
        setFeedback(null);
        if (isLastExercise()) {
            // Skipping the last exercise ends the session cleanly
            endSession();
            selectLevel(null);
        } else {
            // nextExercise already increments — do not also call skipExercise (double-advance bug)
            nextExercise();
        }
    }, [isLastExercise, nextExercise, endSession, selectLevel]);

    const handleStartLevelSession = useCallback(() => {
        const levelToStart = state.selectedLevel || state.currentLevel;
        if (levelToStart) {
            setFeedback(null);
            setExerciseResults([]);
            sessionStartTimeRef.current = Date.now();
            startLevelSession(levelToStart, 10);
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

    if (state.isSessionActive && state.currentIndex >= state.exercises.length - 1 && feedback) {
        const nextLevelUnlocked = state.unlockedLevels.includes(state.currentLevel + 1);
        const nextLevelInfo = getLevelById(state.currentLevel + 1);
        const correctCount = exerciseResults.filter(r => r.isCorrect).length;
        const totalCount = exerciseResults.length || state.exercises.length;
        const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
        const elapsed = sessionElapsed;
        const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
        const missedSigns = exerciseResults.filter(r => !r.isCorrect).map(r => r.sign);

        return (
            <div className="session-complete-page">
                {/* Clean top area */}
                <div className="sc-top">
                    <div className="sc-top__check">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
                        </svg>
                        SESSION COMPLETE
                    </div>
                    <h1 className="sc-top__headline">
                        <span className="sc-top__headline-bold">Nice quiet work,</span>
                        <br />
                        <span className="sc-top__headline-light">
                            {scorePercent >= 80
                                ? 'you nailed it.'
                                : scorePercent >= 50
                                ? 'keep it up.'
                                : 'practice makes progress.'}
                        </span>
                    </h1>
                    <p className="sc-top__sub">
                        You signed {correctCount} of {totalCount} correctly in {elapsedStr}.
                        {nextLevelUnlocked && nextLevelInfo && ` ${nextLevelInfo.name} is now unlocked.`}
                    </p>
                </div>

                {/* Stats tiles */}
                <div className="sc-stats-row">
                    <div className="sc-stat-tile">
                        <span className="sc-stat-tile__val">+{state.sessionScore}</span>
                        <span className="sc-stat-tile__lbl">XP earned</span>
                    </div>
                    <div className="sc-stat-tile">
                        <span className="sc-stat-tile__val">{correctCount}/{totalCount}</span>
                        <span className="sc-stat-tile__lbl">Signs correct</span>
                    </div>
                    <div className="sc-stat-tile">
                        <span className="sc-stat-tile__val">{scorePercent}%</span>
                        <span className="sc-stat-tile__lbl">Accuracy</span>
                    </div>
                    <div className="sc-stat-tile">
                        <span className="sc-stat-tile__val">{elapsedStr}</span>
                        <span className="sc-stat-tile__lbl">Time</span>
                    </div>
                </div>

                {/* Recap header */}
                <div className="sc-recap-header">
                    <span className="sc-recap-header__label">RECAP How each sign went</span>
                </div>

                {/* Sign grid */}
                <div className="sc-sign-grid">
                    {exerciseResults.map((r, i) => (
                        <div key={i} className={`sc-sign-card ${r.isCorrect ? 'sc-sign-card--correct' : 'sc-sign-card--incorrect'}`}>
                            <div className="sc-sign-card__icon">
                                {r.isCorrect
                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                                }
                            </div>
                            <span className="sc-sign-card__name">{formatSignName(r.sign)}</span>
                            <span className="sc-sign-card__status">
                                {r.isCorrect ? 'mastered' : 'needs review'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="sc-actions">
                    {nextLevelInfo && nextLevelUnlocked ? (
                        <button className="sc-actions__primary" onClick={() => {
                            setExerciseResults([]);
                            sessionStartTimeRef.current = Date.now();
                            startLevelSession(state.currentLevel + 1, 10);
                        }}>
                            → Continue to Level {state.currentLevel + 1}
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
        );
    }

    if (state.isSessionActive && currentExercise) {
        const totalEx = state.exercises.length;
        const doneEx = state.currentIndex;
        return (
            <div className="learn-page learn-page--session">
                {/* Segmented progress bar at very top */}
                <div className="session-progress" aria-label={`Exercise ${doneEx + 1} of ${totalEx}`}>
                    {Array.from({ length: totalEx }).map((_, i) => (
                        <div
                            key={i}
                            className={`session-progress__seg${i < doneEx ? ' session-progress__seg--done' : i === doneEx ? ' session-progress__seg--current' : ''}`}
                        />
                    ))}
                </div>

                {/* Header row */}
                <header className="session-header">
                    <button className="session-header__end" onClick={handleEndSession}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                        End session
                    </button>
                    <span className="session-header__info">Exercise {doneEx + 1} of {totalEx}</span>
                    <span className="session-header__xp">+{lastXp > 0 ? lastXp : 30} XP</span>
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

    if (showSignBrowser) {
        return <SignBrowser onClose={() => setShowSignBrowser(false)} />;
    }

    if (selectedLevelInfo && !state.isSessionActive) {
        const levelMastery = calculateLevelMastery(selectedLevelInfo.id);
        const dueCount = getReviewDueCountForLevel(selectedLevelInfo.id);
        const sessionSigns = selectedLevelInfo.signs.slice(0, 10);
        const signCount = sessionSigns.length;
        const progressData = storage.getLearningProgress();

        const queueSigns = sessionSigns.map(sign => {
            const prog = progressData[sign];
            const mastery = prog?.mastery ?? 0;
            let status: 'mastered' | 'review' | 'new';
            if (mastery >= 70) status = 'mastered';
            else if (mastery > 0) status = 'review';
            else status = 'new';
            // Approx time per sign: mastered ~15s (quick), review ~30s, new ~30s
            const secEst = status === 'mastered' ? 15 : 30;
            return { sign, status, secEst };
        });
        const totalSec = queueSigns.reduce((acc, s) => acc + s.secEst, 0);
        const estMin = Math.round(totalSec / 60);

        return (
            <div className="learn-page">
                <main className="learn-page__content">
                    <div className="level-presession">
                        {/* LEFT column */}
                        <div className="presession-left">
                            <div className="presession-breadcrumb">
                                READY · LEVEL {selectedLevelInfo.id} · {selectedLevelInfo.name.toUpperCase()}
                            </div>

                            <div className="presession-headline">
                                <span className="presession-headline__bold">{signCount} signs.</span>
                                <br />
                                <span className="presession-headline__light">About {(['one','two','three','four','five','six','seven','eight','nine'][estMin-1] ?? estMin)} quiet minutes.</span>
                            </div>

                            <p className="presession-description">
                                Spaced repetition selected a balanced mix of review signs, mastered signs,
                                and new material for this session.
                            </p>

                            {levelMastery > 0 && (
                                <div className="presession-progress">
                                    <div className="presession-progress__bar">
                                        <div className="presession-progress__fill" style={{ width: `${levelMastery}%` }} />
                                    </div>
                                    <span className="presession-progress__text">
                                        {levelMastery >= MASTERY_THRESHOLD
                                            ? 'Level complete — keep practicing!'
                                            : `${levelMastery}% mastered`}
                                    </span>
                                </div>
                            )}

                            <div className="presession-mix-card">
                                <h2>Exercise mix</h2>
                                <table className="presession-mix">
                                    <tbody>
                                        <tr>
                                            <td className="presession-mix__type">Sign → Word <span>(multiple choice)</span></td>
                                            <td className="presession-mix__count">×4</td>
                                        </tr>
                                        <tr>
                                            <td className="presession-mix__type">Word → Sign <span>(pick the animation)</span></td>
                                            <td className="presession-mix__count">×3</td>
                                        </tr>
                                        <tr>
                                            <td className="presession-mix__type">Camera practice <span>(one-handed letters)</span></td>
                                            <td className="presession-mix__count">×2</td>
                                        </tr>
                                        <tr>
                                            <td className="presession-mix__type">Free recall <span>(sign it cold)</span></td>
                                            <td className="presession-mix__count">×1</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {dueCount > 0 && (
                                <p className="presession-review-notice" role="status">
                                    {dueCount} sign{dueCount !== 1 ? 's' : ''} due for review today — they'll appear first.
                                </p>
                            )}

                            {state.error && (
                                <div className="level-detail__error" role="alert">{state.error}</div>
                            )}

                            <div className="presession-actions">
                                <button
                                    className="level-detail__start-btn"
                                    onClick={handleStartLevelSession}
                                    disabled={state.isLoading}
                                >
                                    {state.isLoading ? (
                                        <><span className="spinner" />Loading...</>
                                    ) : (
                                        <>Begin session<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7L8 5z" fill="currentColor" /></svg></>
                                    )}
                                </button>
                                <button className="presession-all-levels" onClick={handleBackToLevels}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                        <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                    </svg>
                                    All levels
                                </button>
                            </div>
                        </div>

                        {/* RIGHT column — queue preview */}
                        <div className="presession-right">
                            <div className="queue-preview__header">
                                <div className="queue-preview__title">
                                    QUEUE PREVIEW · {signCount} signs · ~{estMin} min
                                </div>
                                <button
                                    className="queue-preview__shuffle"
                                    onClick={handleStartLevelSession}
                                    disabled={state.isLoading}
                                    title="Shuffle and start"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path d="M16 3l4 4-4 4M2 7h18M8 21l-4-4 4-4M22 17H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Shuffle
                                </button>
                            </div>
                            <div className="queue-preview__list">
                                {queueSigns.map(({ sign, status }) => (
                                    <div key={sign} className="queue-sign-row">
                                        <div className="queue-sign-row__thumb" aria-hidden="true">
                                            <svg viewBox="0 0 40 50" width="28" height="32">
                                                <circle cx="20" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                                <line x1="20" y1="15" x2="20" y2="33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                <line x1="20" y1="21" x2="10" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                <line x1="20" y1="21" x2="30" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                <line x1="20" y1="33" x2="13" y2="46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                <line x1="20" y1="33" x2="27" y2="46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <span className="queue-sign-row__name">{formatSignName(sign)}</span>
                                        <span className={`queue-sign-row__badge queue-sign-row__badge--${status}`}>
                                            {status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="learn-page">
            <main className="learn-page__content">
                <div className="learn-page__hero">
                    <div className="learn-page__hero-text">
                        <div className="learn-page__hero-label">YOUR PATH · 10 LEVELS</div>
                        <h1 className="learn-page__hero-title">
                            Sign by sign,<br/>step by step.
                        </h1>
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
                        <GemShape size={84} fill="var(--md-sys-color-secondary)" className="learn-page__xp-gem">
                            <div className="learn-page__xp-gem-inner">
                                <span className="learn-page__xp-gem-value">{state.totalXP}</span>
                                <span className="learn-page__xp-gem-label">XP</span>
                            </div>
                        </GemShape>
                    </div>
                </div>

                <LevelSelector
                    levels={levels}
                    unlockedLevels={state.unlockedLevels}
                    currentLevel={state.currentLevel}
                    onSelectLevel={selectLevel}
                    getLevelMastery={calculateLevelMastery}
                    getReviewDueCount={getReviewDueCountForLevel}
                    hasResumeSession={hasResumeSession}
                    onResume={hasResumeSession ? resumeSession : undefined}
                />
            </main>

        </div>
    );
};

export const LearnPage: React.FC = () => {
    return (
        <LearnProvider>
            <LearnPageContent />
        </LearnProvider>
    );
};

export default LearnPage;
