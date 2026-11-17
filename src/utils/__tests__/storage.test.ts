import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../storage';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('storage - SM-2 spaced repetition', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it('should initialize new sign progress with SM-2 defaults', () => {
        storage.updateSignProgress('hello', true);
        const progress = storage.getSignProgress('hello');
        expect(progress).not.toBeNull();
        expect(progress!.easeFactor).toBeGreaterThanOrEqual(1.3);
        expect(progress!.interval).toBe(1);
        expect(progress!.repetitions).toBe(1);
        expect(progress!.nextReview).toBeTruthy();
    });

    it('should increase interval on consecutive correct answers', () => {
        storage.updateSignProgress('hello', true);
        const after1 = storage.getSignProgress('hello')!;
        expect(after1.interval).toBe(1);

        storage.updateSignProgress('hello', true);
        const after2 = storage.getSignProgress('hello')!;
        expect(after2.interval).toBe(6);

        storage.updateSignProgress('hello', true);
        const after3 = storage.getSignProgress('hello')!;
        expect(after3.interval).toBeGreaterThan(6);
    });

    it('should reset interval on incorrect answer', () => {
        storage.updateSignProgress('hello', true);
        storage.updateSignProgress('hello', true);
        storage.updateSignProgress('hello', true);
        const before = storage.getSignProgress('hello')!;
        expect(before.interval).toBeGreaterThan(6);

        storage.updateSignProgress('hello', false);
        const after = storage.getSignProgress('hello')!;
        expect(after.interval).toBe(1);
        expect(after.repetitions).toBe(0);
    });

    it('should never let ease factor drop below 1.3', () => {
        // Several incorrect answers should not crash ease factor below floor
        for (let i = 0; i < 20; i++) {
            storage.updateSignProgress('hard_sign', false);
        }
        const progress = storage.getSignProgress('hard_sign')!;
        expect(progress.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should return due signs for review', () => {
        // Create a sign with a past nextReview date
        storage.updateSignProgress('hello', true);
        const progress = storage.getLearningProgress();
        progress['hello'].nextReview = '2020-01-01';
        localStorage.setItem('asl_learn_progress', JSON.stringify(progress));

        const due = storage.getSignsDueForReview();
        expect(due).toContain('hello');
    });

    it('should not return signs not yet due', () => {
        storage.updateSignProgress('hello', true);
        // nextReview should be tomorrow or later
        const due = storage.getSignsDueForReview();
        expect(due).not.toContain('hello');
    });

    it('should track mastery combining accuracy and repetitions', () => {
        // 5 correct answers
        for (let i = 0; i < 5; i++) {
            storage.updateSignProgress('hello', true);
        }
        const progress = storage.getSignProgress('hello')!;
        expect(progress.mastery).toBeGreaterThan(0);
        expect(progress.mastery).toBeLessThanOrEqual(100);
    });
});

describe('storage - malformed saved data', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it.each(['null', '42', '"text"', '{"a":1}', '{not json'])('falls back to defaults for %s', (raw) => {
        for (const key of ['asl_favorites', 'asl_search_history', 'asl_learn_progress', 'asl_learn_stats',
            'asl_learn_settings', 'asl_level_progress']) {
            localStorageMock.setItem(key, raw);
        }
        expect(storage.getFavorites()).toEqual([]);
        expect(storage.getSearchHistory()).toEqual([]);
        expect(storage.getLearningProgress()).toEqual({});
        expect(storage.getLearningStats()).toEqual({ totalXP: 0, level: 1, streak: 0, lastActivityDate: '' });
        expect(storage.getLearningSettings()).toEqual({ animationSpeed: 1, difficulty: 'beginner' });
        expect(storage.getLevelProgress()).toEqual({ unlockedLevels: [1], currentLevel: 1 });
        expect(storage.isFavorite('hello')).toBe(false);
    });

    it('keeps valid entries and drops only the damaged ones', () => {
        storage.updateSignProgress('hello', true);
        const saved = JSON.parse(localStorageMock.getItem('asl_learn_progress')!);
        localStorageMock.setItem('asl_learn_progress', JSON.stringify({ ...saved, broken: null, worse: 'x' }));
        expect(Object.keys(storage.getLearningProgress())).toEqual(['hello']);

        localStorageMock.setItem('asl_favorites', JSON.stringify([{ query: 'hi', timestamp: 1 }, null, { query: 5 }]));
        expect(storage.getFavorites()).toEqual([{ query: 'hi', timestamp: 1 }]);

        localStorageMock.setItem('asl_level_progress', JSON.stringify({ unlockedLevels: [1, 2, 'x', 99], currentLevel: 2 }));
        expect(storage.getLevelProgress()).toEqual({ unlockedLevels: [1, 2], currentLevel: 2 });
    });

    it('repairs damaged scheduling fields so their consumers keep working', () => {
        const counts = { timesStudied: 3, timesCorrect: 2, mastery: 50 };
        localStorageMock.setItem('asl_learn_progress', JSON.stringify({
            a: { ...counts, nextReview: ['2020-01-01'] },
            b: { ...counts, nextReview: ['2020-01-02'], easeFactor: 'x', interval: null, repetitions: {} },
            c: { ...counts, nextReview: '2020-01-03', lastStudied: 7 },
            d: { ...counts, timesStudied: -1 },
        }));

        // only the entry with a real date is due; sorting no longer throws
        expect(storage.getSignsDueForReview()).toEqual(['c']);
        expect(storage.getSignProgress('d')).toBeNull();
        expect(storage.getSignProgress('c')!.lastStudied).toBe('');

        storage.updateSignProgress('b', true);
        const b = storage.getSignProgress('b')!;
        expect(b).toMatchObject({ timesStudied: 4, timesCorrect: 3, repetitions: 1, interval: 1 });
        expect(b.easeFactor).toBeGreaterThanOrEqual(1.3);
        expect(b.nextReview).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
