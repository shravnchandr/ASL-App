/* eslint-disable react-refresh/only-export-components */
/**
 * LearnContext
 * State management for the ASL learning feature
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { SignData, Exercise, SignProgress } from '../types';
import { storage } from '../utils/storage';
import {
    loadSignData,
    loadMetadata,
    getDistractors,
    preloadSigns,
} from '../utils/signDataLoader';
import { LEVELS, MASTERY_THRESHOLD, getLevelById, type LevelInfo } from '../constants/levels';

// State types
interface LearnState {
    // Session state
    exercises: Exercise[];
    currentIndex: number;
    sessionScore: number;
    isSessionActive: boolean;

    // Progress
    signProgress: Record<string, SignProgress>;
    totalXP: number;
    level: number;
    streak: number;

    // Level progression
    unlockedLevels: number[];
    currentLevel: number;
    selectedLevel: number | null;
    justUnlockedLevel: number | null;

    // Settings
    animationSpeed: number;
    difficulty: 'beginner' | 'intermediate' | 'all';

    // UI state
    isLoading: boolean;
    error: string | null;

    // Loaded sign data
    loadedSigns: Record<string, SignData>;
}

// Action types
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
    | { type: 'CLEAR_JUST_UNLOCKED' };

// Initial state
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
};

// Reducer
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

        default:
            return state;
    }
}

// Context type
interface LearnContextType {
    state: LearnState;
    startSession: (exerciseCount?: number) => Promise<void>;
    startLevelSession: (levelId: number, exerciseCount?: number) => Promise<void>;
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
    clearJustUnlocked: () => void;
    levels: LevelInfo[];
}

const LearnContext = createContext<LearnContextType | null>(null);

// XP rewards
const XP_CORRECT = 10;
const XP_CORRECT_STREAK = 15;
const XP_RECALL_CORRECT = 20;

// Provider component
export const LearnProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(learnReducer, initialState);

    // Restore state from localStorage on mount
    useEffect(() => {
        const progress = storage.getLearningProgress();
        const stats = storage.getLearningStats();
        const settings = storage.getLearningSettings();
        const levelProgress = storage.getLevelProgress();

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
            },
        });
    }, []);

    // Load sign data
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

    // Generate exercises for a session
    const generateExercises = useCallback(async (count: number): Promise<Exercise[]> => {
        const metadata = await loadMetadata();
        const availableSigns = Object.keys(metadata.signs);

        if (availableSigns.length === 0) {
            throw new Error('No signs available');
        }

        // Filter by difficulty if needed
        let signsToUse = availableSigns;
        if (state.difficulty !== 'all') {
            signsToUse = availableSigns.filter(
                sign => metadata.signs[sign].difficulty === state.difficulty
            );
            if (signsToUse.length === 0) {
                signsToUse = availableSigns; // Fallback to all
            }
        }

        const exercises: Exercise[] = [];
        const usedSigns = new Set<string>();

        for (let i = 0; i < count && usedSigns.size < signsToUse.length; i++) {
            // Pick a random sign not yet used
            const availableForPick = signsToUse.filter(s => !usedSigns.has(s));
            const sign = availableForPick[Math.floor(Math.random() * availableForPick.length)];
            usedSigns.add(sign);

            // Determine exercise type based on mastery
            const progress = state.signProgress[sign];
            let type: Exercise['type'] = 'sign-to-word';

            if (progress) {
                if (progress.mastery >= 80 && progress.timesStudied >= 5) {
                    type = 'recall';
                } else if (progress.mastery >= 50 && progress.timesStudied >= 3) {
                    type = Math.random() > 0.5 ? 'word-to-sign' : 'sign-to-word';
                }
            }

            // Generate options for multiple choice exercises
            let options: string[] | undefined;
            if (type !== 'recall') {
                const distractors = await getDistractors(sign, 3);
                options = [sign, ...distractors].sort(() => Math.random() - 0.5);
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

    // Start a new learning session
    const startSession = useCallback(async (exerciseCount: number = 10) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
            const exercises = await generateExercises(exerciseCount);

            // Preload sign data for all exercises
            const signsToLoad = [...new Set(exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);

            // Load signs into state
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

    // End the current session
    const endSession = useCallback(() => {
        dispatch({ type: 'END_SESSION' });
    }, []);

    // Skip the current exercise
    const skipExercise = useCallback(() => {
        dispatch({ type: 'SKIP_EXERCISE' });
    }, []);

    // Move to next exercise
    const nextExercise = useCallback(() => {
        dispatch({ type: 'NEXT_EXERCISE' });
    }, []);

    // Set animation speed
    const setAnimationSpeed = useCallback((speed: number) => {
        dispatch({ type: 'SET_SETTING', payload: { animationSpeed: speed } });
        storage.setLearningSettings({ animationSpeed: speed });
    }, []);

    // Set difficulty
    const setDifficulty = useCallback((difficulty: 'beginner' | 'intermediate' | 'all') => {
        dispatch({ type: 'SET_SETTING', payload: { difficulty } });
        storage.setLearningSettings({ difficulty });
    }, []);

    // Get current exercise
    const getCurrentExercise = useCallback((): Exercise | null => {
        return state.exercises[state.currentIndex] || null;
    }, [state.exercises, state.currentIndex]);

    // Check if on last exercise
    const isLastExercise = useCallback((): boolean => {
        return state.currentIndex >= state.exercises.length - 1;
    }, [state.currentIndex, state.exercises.length]);

    // Calculate mastery for a specific level
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

    // Check if a level can be unlocked
    const canUnlockLevel = useCallback((levelId: number): boolean => {
        if (levelId === 1) return true; // Level 1 is always unlocked
        if (state.unlockedLevels.includes(levelId)) return true;

        // Check if previous level has 80% mastery
        const previousLevelMastery = calculateLevelMastery(levelId - 1);
        return previousLevelMastery >= MASTERY_THRESHOLD;
    }, [state.unlockedLevels, calculateLevelMastery]);

    // Check for level unlocks after answering
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

    // Generate exercises for a specific level
    const generateLevelExercises = useCallback(async (levelId: number, count: number): Promise<Exercise[]> => {
        const level = getLevelById(levelId);
        if (!level) {
            throw new Error('Level not found');
        }

        const levelSigns = level.signs;
        if (levelSigns.length === 0) {
            throw new Error('No signs available for this level');
        }

        const exercises: Exercise[] = [];
        const usedSigns = new Set<string>();

        for (let i = 0; i < count; i++) {
            // Pick a sign (allow repeats if we've used all signs)
            let sign: string;
            if (usedSigns.size >= levelSigns.length) {
                // All signs used, pick randomly from all
                sign = levelSigns[Math.floor(Math.random() * levelSigns.length)];
            } else {
                const availableForPick = levelSigns.filter(s => !usedSigns.has(s));
                sign = availableForPick[Math.floor(Math.random() * availableForPick.length)];
                usedSigns.add(sign);
            }

            // Determine exercise type based on mastery
            const progress = state.signProgress[sign];
            let type: Exercise['type'] = 'sign-to-word';

            if (progress) {
                if (progress.mastery >= 80 && progress.timesStudied >= 5) {
                    type = 'recall';
                } else if (progress.mastery >= 50 && progress.timesStudied >= 3) {
                    type = Math.random() > 0.5 ? 'word-to-sign' : 'sign-to-word';
                }
            }

            // Generate options for multiple choice exercises (use level signs as distractors)
            let options: string[] | undefined;
            if (type !== 'recall') {
                const otherSigns = levelSigns.filter(s => s !== sign);
                const distractors = otherSigns.sort(() => Math.random() - 0.5).slice(0, 3);
                // If not enough distractors in level, get from global
                if (distractors.length < 3) {
                    const moreDistractors = await getDistractors(sign, 3 - distractors.length);
                    distractors.push(...moreDistractors);
                }
                options = [sign, ...distractors.slice(0, 3)].sort(() => Math.random() - 0.5);
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

    // Start a level-specific session
    const startLevelSession = useCallback(async (levelId: number, exerciseCount: number = 10) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        dispatch({ type: 'SELECT_LEVEL', payload: levelId });
        dispatch({ type: 'SET_CURRENT_LEVEL', payload: levelId });
        storage.setCurrentLevel(levelId);

        try {
            const exercises = await generateLevelExercises(levelId, exerciseCount);

            // Preload sign data for all exercises
            const signsToLoad = [...new Set(exercises.map(e => e.sign))];
            await preloadSigns(signsToLoad);

            // Load signs into state
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
    }, [generateLevelExercises, loadSign]);

    // Select a level (for viewing details before starting)
    const selectLevel = useCallback((levelId: number | null) => {
        dispatch({ type: 'SELECT_LEVEL', payload: levelId });
    }, []);

    // Clear the just unlocked notification
    const clearJustUnlocked = useCallback(() => {
        dispatch({ type: 'CLEAR_JUST_UNLOCKED' });
    }, []);

    // Modified answerExercise to check for level unlocks
    const answerExerciseWithLevelCheck = useCallback((_answer: string, isCorrect: boolean) => {
        const currentExercise = state.exercises[state.currentIndex];
        if (!currentExercise) return;

        // Calculate XP
        let xp = 0;
        if (isCorrect) {
            if (currentExercise.type === 'recall') {
                xp = XP_RECALL_CORRECT;
            } else {
                xp = state.sessionScore > 0 ? XP_CORRECT_STREAK : XP_CORRECT;
            }
        }

        // Update progress in storage and state
        storage.updateSignProgress(currentExercise.sign, isCorrect);
        const updatedProgress = storage.getSignProgress(currentExercise.sign);
        if (updatedProgress) {
            dispatch({
                type: 'UPDATE_PROGRESS',
                payload: { sign: currentExercise.sign, progress: updatedProgress },
            });
        }

        // Add XP
        if (xp > 0) {
            const stats = storage.addXP(xp);
            dispatch({
                type: 'UPDATE_STATS',
                payload: stats,
            });
        }

        dispatch({ type: 'ANSWER_EXERCISE', payload: { isCorrect, xp } });

        // Check for level unlock after updating progress
        setTimeout(() => checkLevelUnlock(), 100);
    }, [state.exercises, state.currentIndex, state.sessionScore, checkLevelUnlock]);

    const value: LearnContextType = {
        state,
        startSession,
        startLevelSession,
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
        clearJustUnlocked,
        levels: LEVELS,
    };

    return (
        <LearnContext.Provider value={value}>
            {children}
        </LearnContext.Provider>
    );
};

// Hook to use the context
export const useLearn = (): LearnContextType => {
    const context = useContext(LearnContext);
    if (!context) {
        throw new Error('useLearn must be used within a LearnProvider');
    }
    return context;
};

export default LearnContext;
