/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { SignData, Exercise, SignProgress } from '../types';
import { storage } from '../utils/storage';
import {
    loadSignData,
    loadMetadata,
    getDistractors,
    preloadSigns,
    shuffle,
} from '../utils/signDataLoader';
import { LEVELS, MASTERY_THRESHOLD, getLevelById, type LevelInfo } from '../constants/levels';

interface LearnState {
    exercises: Exercise[];
    currentIndex: number;
    sessionScore: number;
    isSessionActive: boolean;
    signProgress: Record<string, SignProgress>;
    totalXP: number;
    level: number;
    streak: number;
    unlockedLevels: number[];
    currentLevel: number;
    selectedLevel: number | null;
    justUnlockedLevel: number | null;
    animationSpeed: number;
    difficulty: 'beginner' | 'intermediate' | 'all';
    isLoading: boolean;
    error: string | null;
    loadedSigns: Record<string, SignData>;
    activeSessionLevelId: number | null;
}

type LearnAction =
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'START_SESSION'; payload: Exercise[] }
    | { type: 'END_SESSION' }
    | { type: 'NEXT_EXERCISE' }
    | { type: 'SKIP_EXERCISE' }
    | { type: 'ANSWER_EXERCISE'; payload: { isCorrect: boolean; xp: number } }
    | { type: 'LOAD_SIGN'; payload: { sign: string; data: SignData } }
    | { type: 'UPDATE_PROGRESS'; payload: { sign: string; progress: SignProgress } }
    | { type: 'UPDATE_STATS'; payload: { totalXP: number; level: number; streak: number } }
    | { type: 'SET_SETTING'; payload: Partial<{ animationSpeed: number; difficulty: 'beginner' | 'intermediate' | 'all' }> }
    | { type: 'RESTORE_STATE'; payload: Partial<LearnState> }
    | { type: 'SET_CURRENT_LEVEL'; payload: number }
    | { type: 'SELECT_LEVEL'; payload: number | null }
    | { type: 'UNLOCK_LEVEL'; payload: number }
    | { type: 'CLEAR_JUST_UNLOCKED' }
    | { type: 'SET_ACTIVE_SESSION_LEVEL'; payload: number | null }
    | { type: 'RESTORE_SESSION'; payload: { exercises: Exercise[]; currentIndex: number; sessionScore: number; levelId: number } };

const initialState: LearnState = {
    exercises: [],
    currentIndex: 0,
    sessionScore: 0,
    isSessionActive: false,
    signProgress: {},
    totalXP: 0,
    level: 1,
    streak: 0,
    unlockedLevels: [1],
    currentLevel: 1,
    selectedLevel: null,
    justUnlockedLevel: null,
    animationSpeed: 1,
    difficulty: 'beginner',
    isLoading: false,
    error: null,
    loadedSigns: {},
    activeSessionLevelId: null,
};

function learnReducer(state: LearnState, action: LearnAction): LearnState {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };

        case 'SET_ERROR':
            return { ...state, error: action.payload, isLoading: false };

        case 'START_SESSION':
            return {
                ...state,
                exercises: action.payload,
                currentIndex: 0,
                sessionScore: 0,
                isSessionActive: true,
                error: null,
            };

        case 'END_SESSION':
            return {
                ...state,
                isSessionActive: false,
            };

        case 'NEXT_EXERCISE':
            return {
                ...state,
                currentIndex: Math.min(state.currentIndex + 1, state.exercises.length - 1),
            };

        case 'SKIP_EXERCISE':
            return {
                ...state,
                currentIndex: Math.min(state.currentIndex + 1, state.exercises.length - 1),
            };

        case 'ANSWER_EXERCISE':
            return {
                ...state,
                sessionScore: state.sessionScore + action.payload.xp,
                totalXP: state.totalXP + action.payload.xp,
            };

        case 'LOAD_SIGN':
            return {
                ...state,
                loadedSigns: {
                    ...state.loadedSigns,
                    [action.payload.sign]: action.payload.data,
                },
            };

        case 'UPDATE_PROGRESS':
            return {
                ...state,
                signProgress: {
                    ...state.signProgress,
                    [action.payload.sign]: action.payload.progress,
                },
            };

        case 'UPDATE_STATS':
            return {
                ...state,
                totalXP: action.payload.totalXP,
                level: action.payload.level,
                streak: action.payload.streak,
            };

        case 'SET_SETTING':
            return {
                ...state,
                ...action.payload,
            };

        case 'RESTORE_STATE':
            return {
                ...state,
                ...action.payload,
            };

        case 'SET_CURRENT_LEVEL':
            return {
                ...state,
                currentLevel: action.payload,
            };

        case 'SELECT_LEVEL':
            return {
                ...state,
                selectedLevel: action.payload,
            };

        case 'UNLOCK_LEVEL':
            if (state.unlockedLevels.includes(action.payload)) {
                return state;
            }
            return {
                ...state,
                unlockedLevels: [...state.unlockedLevels, action.payload].sort((a, b) => a - b),
                justUnlockedLevel: action.payload,
            };

        case 'CLEAR_JUST_UNLOCKED':
            return {
                ...state,
                justUnlockedLevel: null,
            };

        case 'SET_ACTIVE_SESSION_LEVEL':
            return {
                ...state,
                activeSessionLevelId: action.payload,
            };

        case 'RESTORE_SESSION':
            return {
                ...state,
                exercises: action.payload.exercises,
                currentIndex: action.payload.currentIndex,
                sessionScore: action.payload.sessionScore,
                isSessionActive: true,
                selectedLevel: action.payload.levelId,
                currentLevel: action.payload.levelId,
                activeSessionLevelId: null,
                error: null,
            };

        default:
            return state;
    }
}

interface LearnContextType {
    state: LearnState;
    startSession: (exerciseCount?: number) => Promise<void>;
    startLevelSession: (levelId: number, exerciseCount?: number, cameraPractice?: boolean) => Promise<void>;
    startPracticeSession: (signWords: string[]) => Promise<void>;
    resumeSession: () => Promise<void>;
    endSession: () => void;
    answerExercise: (answer: string, isCorrect: boolean) => void;
    skipExercise: () => void;
    nextExercise: () => void;
    loadSign: (sign: string) => Promise<SignData | null>;
    setAnimationSpeed: (speed: number) => void;
    setDifficulty: (difficulty: 'beginner' | 'intermediate' | 'all') => void;
    getCurrentExercise: () => Exercise | null;
    isLastExercise: () => boolean;
    selectLevel: (levelId: number | null) => void;
    calculateLevelMastery: (levelId: number) => number;
    canUnlockLevel: (levelId: number) => boolean;
    getReviewDueCountForLevel: (levelId: number) => number;
    clearJustUnlocked: () => void;
    levels: LevelInfo[];
}

const LearnContext = createContext<LearnContextType | null>(null);

const XP_CORRECT = 10;
const XP_CORRECT_STREAK = 15;
const XP_RECALL_CORRECT = 20;

export const LearnProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(learnReducer, initialState);

    useEffect(() => {
        const progress = storage.getLearningProgress();
        const stats = storage.getLearningStats();
        const settings = storage.getLearningSettings();
        const levelProgress = storage.getLevelProgress();
        const saved = storage.getActiveSession();

        dispatch({
            type: 'RESTORE_STATE',
            payload: {
                signProgress: progress,
                totalXP: stats.totalXP,
                level: stats.level,
                streak: stats.streak,
                animationSpeed: settings.animationSpeed,
                difficulty: settings.difficulty,
                unlockedLevels: levelProgress.unlockedLevels,
                currentLevel: levelProgress.currentLevel,
                activeSessionLevelId: saved ? saved.levelId : null,
            },
        });
    }, []);

    const loadSign = useCallback(async (sign: string): Promise<SignData | null> => {
        if (state.loadedSigns[sign]) {
            return state.loadedSigns[sign];
        }

        const data = await loadSignData(sign);
        if (data) {
            dispatch({ type: 'LOAD_SIGN', payload: { sign, data } });
        }
        return data;
    }, [state.loadedSigns]);

    const generateExercises = useCallback(async (count: number): Promise<Exercise[]> => {
        const metadata = await loadMetadata();
        const availableSigns = Object.keys(metadata.signs);

        if (availableSigns.length === 0) {
            throw new Error('No signs available');
        }

        let signsToUse = availableSigns;
        if (state.difficulty !== 'all') {
            signsToUse = availableSigns.filter(
                sign => metadata.signs[sign].difficulty === state.difficulty
            );
            if (signsToUse.length === 0) {
                signsToUse = availableSigns;
            }
        }

        const exercises: Exercise[] = [];
        const usedSigns = new Set<string>();

        for (let i = 0; i < count && usedSigns.size < signsToUse.length; i++) {
            const availableForPick = signsToUse.filter(s => !usedSigns.has(s));
            const sign = availableForPick[Math.floor(Math.random() * availableForPick.length)];
            usedSigns.add(sign);

            const progress = state.signProgress[sign];
            let type: Exercise['type'] = 'sign-to-word';

            if (progress && progress.mastery >= 70 && progress.timesStudied >= 3) {
                type = 'recall';
            } else {
                type = Math.random() > 0.5 ? 'sign-to-word' : 'word-to-sign';
            }

            let options: string[] | undefined;
            if (type !== 'recall') {
                const distractors = await getDistractors(sign, 3);
                options = shuffle([sign, ...distractors]);
            }

            exercises.push({
                id: `${sign}-${i}-${Date.now()}`,
                type,
                sign,
                options,
                correctAnswer: sign,
            });
        }

        return exercises;
    }, [state.difficulty, state.signProgress]);

    const startSession = useCallback(async (exerciseCount: number = 10) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
            const exercises = await generateExercises(exerciseCount);
            const signsToLoad = [...new Set(exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);

            for (const sign of signsToLoad) {
                await loadSign(sign);
            }

            dispatch({ type: 'START_SESSION', payload: exercises });
        } catch (error) {
            dispatch({
                type: 'SET_ERROR',
                payload: error instanceof Error ? error.message : 'Failed to start session',
            });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [generateExercises, loadSign]);

    const startPracticeSession = useCallback(async (signWords: string[]) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
            const metadata = await loadMetadata();
            const available = new Set(Object.keys(metadata.signs));

            const validSigns = signWords
                .map(w => w.toLowerCase().replace(/[\s-]+/g, '_'))
                .filter((s, i, arr) => available.has(s) && arr.indexOf(s) === i);

            if (validSigns.length === 0) {
                throw new Error('None of these signs are in the practice library yet');
            }

            const exercises: Exercise[] = [];
            for (let i = 0; i < validSigns.length; i++) {
                const sign = validSigns[i];
                const progress = state.signProgress[sign];
                let type: Exercise['type'] = 'sign-to-word';

                if (progress && progress.mastery >= 70 && progress.timesStudied >= 3) {
                    type = 'recall';
                } else {
                    type = Math.random() > 0.5 ? 'sign-to-word' : 'word-to-sign';
                }

                let options: string[] | undefined;
                if (type !== 'recall') {
                    const others = validSigns.filter(s => s !== sign);
                    const distractors = shuffle(others).slice(0, 3);
                    if (distractors.length < 3) {
                        const more = await getDistractors(sign, 3 - distractors.length);
                        distractors.push(...more);
                    }
                    options = shuffle([sign, ...distractors.slice(0, 3)]);
                }

                exercises.push({
                    id: `practice-${sign}-${i}-${Date.now()}`,
                    type,
                    sign,
                    options,
                    correctAnswer: sign,
                });
            }

            const signsToLoad = [...new Set(exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);
            for (const sign of signsToLoad) {
                await loadSign(sign);
            }

            dispatch({ type: 'START_SESSION', payload: exercises });
        } catch (error) {
            dispatch({
                type: 'SET_ERROR',
                payload: error instanceof Error ? error.message : 'Failed to start practice session',
            });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [state.signProgress, loadSign]);

    const endSession = useCallback(() => {
        storage.clearActiveSession();
        dispatch({ type: 'SET_ACTIVE_SESSION_LEVEL', payload: null });
        dispatch({ type: 'END_SESSION' });
    }, []);

    const skipExercise = useCallback(() => {
        dispatch({ type: 'SKIP_EXERCISE' });
    }, []);

    const nextExercise = useCallback(() => {
        dispatch({ type: 'NEXT_EXERCISE' });
    }, []);

    const setAnimationSpeed = useCallback((speed: number) => {
        dispatch({ type: 'SET_SETTING', payload: { animationSpeed: speed } });
        storage.setLearningSettings({ animationSpeed: speed });
    }, []);

    const setDifficulty = useCallback((difficulty: 'beginner' | 'intermediate' | 'all') => {
        dispatch({ type: 'SET_SETTING', payload: { difficulty } });
        storage.setLearningSettings({ difficulty });
    }, []);

    const getCurrentExercise = useCallback((): Exercise | null => {
        return state.exercises[state.currentIndex] || null;
    }, [state.exercises, state.currentIndex]);

    const isLastExercise = useCallback((): boolean => {
        return state.currentIndex >= state.exercises.length - 1;
    }, [state.currentIndex, state.exercises.length]);

    const calculateLevelMastery = useCallback((levelId: number): number => {
        const level = getLevelById(levelId);
        if (!level) return 0;

        const masteries = level.signs.map(sign => {
            const progress = state.signProgress[sign];
            return progress?.mastery ?? 0;
        });

        if (masteries.length === 0) return 0;
        return Math.round(masteries.reduce((a, b) => a + b, 0) / masteries.length);
    }, [state.signProgress]);

    const canUnlockLevel = useCallback((levelId: number): boolean => {
        if (levelId === 1) return true;
        if (state.unlockedLevels.includes(levelId)) return true;
        const previousLevelMastery = calculateLevelMastery(levelId - 1);
        return previousLevelMastery >= MASTERY_THRESHOLD;
    }, [state.unlockedLevels, calculateLevelMastery]);

    const checkLevelUnlock = useCallback(() => {
        const currentLevelMastery = calculateLevelMastery(state.currentLevel);
        const nextLevel = state.currentLevel + 1;

        if (
            currentLevelMastery >= MASTERY_THRESHOLD &&
            nextLevel <= LEVELS.length &&
            !state.unlockedLevels.includes(nextLevel)
        ) {
            dispatch({ type: 'UNLOCK_LEVEL', payload: nextLevel });
            storage.unlockLevel(nextLevel);
        }
    }, [state.currentLevel, state.unlockedLevels, calculateLevelMastery]);

    // Sync currentIndex and sessionScore to localStorage so resume picks up at the right spot
    useEffect(() => {
        if (!state.isSessionActive || state.exercises.length === 0) return;
        const saved = storage.getActiveSession();
        if (!saved) return;
        storage.saveActiveSession({ ...saved, currentIndex: state.currentIndex, sessionScore: state.sessionScore });
    }, [state.currentIndex, state.sessionScore, state.isSessionActive, state.exercises.length]);

    const resumeSession = useCallback(async () => {
        const saved = storage.getActiveSession();
        if (!saved) return;

        dispatch({ type: 'SET_LOADING', payload: true });
        try {
            const signsToLoad = [...new Set(saved.exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);
            for (const sign of signsToLoad) {
                await loadSign(sign);
            }
            dispatch({ type: 'RESTORE_SESSION', payload: saved });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to resume session' });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [loadSign]);

    const generateLevelExercises = useCallback(async (levelId: number, count: number, cameraPractice: boolean = false): Promise<Exercise[]> => {
        const level = getLevelById(levelId);
        if (!level) {
            throw new Error('Level not found');
        }

        const levelSigns = level.signs;
        if (levelSigns.length === 0) {
            throw new Error('No signs available for this level');
        }

        const exercises: Exercise[] = [];

        if (cameraPractice) {
            const usedSigns = new Set<string>();
            for (let i = 0; i < count; i++) {
                let sign: string;
                if (usedSigns.size >= levelSigns.length) {
                    sign = levelSigns[Math.floor(Math.random() * levelSigns.length)];
                } else {
                    const available = levelSigns.filter(s => !usedSigns.has(s));
                    sign = available[Math.floor(Math.random() * available.length)];
                    usedSigns.add(sign);
                }
                exercises.push({
                    id: `${sign}-${i}-${Date.now()}`,
                    type: 'camera-practice',
                    sign,
                    correctAnswer: sign,
                });
            }
            return exercises;
        }

        const dueSet = new Set(storage.getSignsDueForReview());
        const dueSigns = levelSigns.filter(s => dueSet.has(s));
        const unseenSigns = shuffle(levelSigns.filter(s => !state.signProgress[s]));
        const knownSigns = shuffle(levelSigns.filter(s => state.signProgress[s] && !dueSet.has(s)));

        const orderedPool = [...dueSigns, ...unseenSigns, ...knownSigns];
        let poolIndex = 0;

        for (let i = 0; i < count; i++) {
            const sign = poolIndex < orderedPool.length
                ? orderedPool[poolIndex++]
                : levelSigns[Math.floor(Math.random() * levelSigns.length)];

            const progress = state.signProgress[sign];
            let type: Exercise['type'] = 'sign-to-word';

            if (progress && progress.mastery >= 70 && progress.timesStudied >= 3) {
                type = 'recall';
            } else {
                type = Math.random() > 0.5 ? 'sign-to-word' : 'word-to-sign';
            }

            let options: string[] | undefined;
            if (type !== 'recall') {
                const otherSigns = levelSigns.filter(s => s !== sign);
                const distractors = shuffle(otherSigns).slice(0, 3);
                if (distractors.length < 3) {
                    const moreDistractors = await getDistractors(sign, 3 - distractors.length);
                    distractors.push(...moreDistractors);
                }
                options = shuffle([sign, ...distractors.slice(0, 3)]);
            }

            exercises.push({
                id: `${sign}-${i}-${Date.now()}`,
                type,
                sign,
                options,
                correctAnswer: sign,
            });
        }

        return exercises;
    }, [state.signProgress]);

    const startLevelSession = useCallback(async (levelId: number, exerciseCount: number = 10, cameraPractice: boolean = false) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        dispatch({ type: 'SELECT_LEVEL', payload: levelId });
        dispatch({ type: 'SET_CURRENT_LEVEL', payload: levelId });
        dispatch({ type: 'SET_ACTIVE_SESSION_LEVEL', payload: null });
        storage.setCurrentLevel(levelId);
        storage.clearActiveSession();

        try {
            const exercises = await generateLevelExercises(levelId, exerciseCount, cameraPractice);
            const signsToLoad = [...new Set(exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);

            for (const sign of signsToLoad) {
                await loadSign(sign);
            }

            storage.saveActiveSession({ exercises, currentIndex: 0, levelId, sessionScore: 0 });
            dispatch({ type: 'START_SESSION', payload: exercises });
        } catch (error) {
            dispatch({
                type: 'SET_ERROR',
                payload: error instanceof Error ? error.message : 'Failed to start session',
            });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [generateLevelExercises, loadSign]);

    const selectLevel = useCallback((levelId: number | null) => {
        dispatch({ type: 'SELECT_LEVEL', payload: levelId });
    }, []);

    const getReviewDueCountForLevel = useCallback((levelId: number): number => {
        const level = getLevelById(levelId);
        if (!level) return 0;
        const dueSet = new Set(storage.getSignsDueForReview());
        return level.signs.filter(s => dueSet.has(s)).length;
    }, []);

    const clearJustUnlocked = useCallback(() => {
        dispatch({ type: 'CLEAR_JUST_UNLOCKED' });
    }, []);

    const answerExerciseWithLevelCheck = useCallback((_answer: string, isCorrect: boolean) => {
        const currentExercise = state.exercises[state.currentIndex];
        if (!currentExercise) return;

        let xp = 0;
        if (isCorrect) {
            if (currentExercise.type === 'recall') {
                xp = XP_RECALL_CORRECT;
            } else {
                xp = state.sessionScore > 0 ? XP_CORRECT_STREAK : XP_CORRECT;
            }
        }

        storage.updateSignProgress(currentExercise.sign, isCorrect);
        const updatedProgress = storage.getSignProgress(currentExercise.sign);
        if (updatedProgress) {
            dispatch({
                type: 'UPDATE_PROGRESS',
                payload: { sign: currentExercise.sign, progress: updatedProgress },
            });
        }

        if (xp > 0) {
            const stats = storage.addXP(xp);
            dispatch({
                type: 'UPDATE_STATS',
                payload: stats,
            });
        }

        dispatch({ type: 'ANSWER_EXERCISE', payload: { isCorrect, xp } });

        // Clear the saved session when the last exercise is answered (session complete)
        if (state.currentIndex >= state.exercises.length - 1) {
            storage.clearActiveSession();
            dispatch({ type: 'SET_ACTIVE_SESSION_LEVEL', payload: null });
        }

        setTimeout(() => checkLevelUnlock(), 100); // let progress state flush before unlock check
    }, [state.exercises, state.currentIndex, state.sessionScore, checkLevelUnlock]);

    const value: LearnContextType = {
        state,
        startSession,
        startLevelSession,
        startPracticeSession,
        resumeSession,
        endSession,
        answerExercise: answerExerciseWithLevelCheck,
        skipExercise,
        nextExercise,
        loadSign,
        setAnimationSpeed,
        setDifficulty,
        getCurrentExercise,
        isLastExercise,
        selectLevel,
        calculateLevelMastery,
        canUnlockLevel,
        getReviewDueCountForLevel,
        clearJustUnlocked,
        levels: LEVELS,
    };

    return (
        <LearnContext.Provider value={value}>
            {children}
        </LearnContext.Provider>
    );
};

export const useLearn = (): LearnContextType => {
    const context = useContext(LearnContext);
    if (!context) {
        throw new Error('useLearn must be used within a LearnProvider');
    }
    return context;
};

export default LearnContext;
