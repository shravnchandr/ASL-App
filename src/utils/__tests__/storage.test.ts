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
