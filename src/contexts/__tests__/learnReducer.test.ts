import { beforeEach, describe, expect, it } from 'vitest';
import { initialState, learnReducer } from '../LearnContext';
import { storage } from '../../utils/storage';
import type { Exercise, ExerciseResult } from '../../types';

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

const exercise = (id: string, sign = 'hello'): Exercise => ({
    id, type: 'sign-to-word', sign, options: [sign, 'a', 'b', 'c'], correctAnswer: sign,
});

describe('ANSWER_EXERCISE', () => {
    it('takes lifetime XP from storage instead of adding it again', () => {
        const start = { ...initialState, totalXP: 0, exercises: [exercise('e1')], isSessionActive: true };
        const result: ExerciseResult = { exerciseId: 'e1', sign: 'hello', isCorrect: true, xp: 10 };
        const next = learnReducer(start, {
            type: 'ANSWER_EXERCISE',
            payload: { result, progress: null, stats: { totalXP: 10, level: 1, streak: 1 } },
        });
        expect(next.totalXP).toBe(10);
        expect(next.sessionScore).toBe(10);
        expect(next.results).toEqual([result]);
    });

    it('ignores a second answer for the same exercise', () => {
        const result: ExerciseResult = { exerciseId: 'e1', sign: 'hello', isCorrect: true, xp: 10 };
        const answered = { ...initialState, sessionScore: 10, results: [result] };
        const next = learnReducer(answered, {
            type: 'ANSWER_EXERCISE',
            payload: { result, progress: null, stats: { totalXP: 20, level: 1, streak: 1 } },
        });
        expect(next).toBe(answered);
    });
});

describe('active session validation', () => {
    beforeEach(() => localStorage.clear());

    const valid = () => ({ exercises: [exercise('e1'), exercise('e2', 'goodbye')], currentIndex: 0, levelId: 3, sessionScore: 0 });

    it('accepts a well-formed session, with or without results', () => {
        storage.saveActiveSession(valid());
        expect(storage.getActiveSession()).not.toBeNull();
        storage.saveActiveSession({ ...valid(), results: [{ exerciseId: 'e1', sign: 'hello', isCorrect: true, xp: 10 }] });
        expect(storage.getActiveSession()?.results).toHaveLength(1);
    });

    it.each([
        ['empty exercises', { exercises: [] }],
        ['out-of-range index', { currentIndex: 5 }],
        ['negative index', { currentIndex: -1 }],
        ['fractional index', { currentIndex: 0.5 }],
        ['unknown level', { levelId: 99 }],
        ['bad results', { results: [{ exerciseId: 1 }] }],
    ])('rejects %s', (_label, patch) => {
        localStorage.setItem('asl_active_session', JSON.stringify({ ...valid(), ...patch }));
        expect(storage.getActiveSession()).toBeNull();
    });

    it('rejects exercises whose options omit the answer', () => {
        const bad = { ...exercise('e1'), options: ['a', 'b', 'c', 'd'] };
        localStorage.setItem('asl_active_session', JSON.stringify({ ...valid(), exercises: [bad] }));
        expect(storage.getActiveSession()).toBeNull();
    });

    it('clearLearningData also removes the saved session', () => {
        storage.saveActiveSession(valid());
        storage.clearLearningData();
        expect(storage.getActiveSession()).toBeNull();
    });
});
