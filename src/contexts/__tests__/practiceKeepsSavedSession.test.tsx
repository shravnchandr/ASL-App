import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { store = {}; },
    };
})();
Object.defineProperty(globalThis, 'localStorage', { value: storageMock, configurable: true });

vi.mock('../../utils/signDataLoader', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/signDataLoader')>();
    return {
        ...actual,
        loadMetadata: async () => ({ signs: { hello: {}, goodbye: {}, please: {}, sorry: {} } }),
        loadSignData: async () => null,
        preloadSigns: async () => undefined,
        getDistractors: async () => ['goodbye', 'please', 'sorry'],
    };
});

describe('practice sessions', () => {
    it('leave a paused level session to resume', async () => {
        const { LearnProvider, useLearn } = await import('../LearnContext');
        const { storage } = await import('../../utils/storage');
        storageMock.clear();

        // A level-1 session, paused on its third exercise with two answers saved
        const exercises = ['a', 'b', 'c', 'd'].map(sign => ({
            id: `level-${sign}`, type: 'sign-to-word' as const, sign, options: ['a', 'b', 'c', 'd'], correctAnswer: sign,
        }));
        const results = [
            { exerciseId: 'level-a', sign: 'a', isCorrect: true, xp: 10 },
            { exerciseId: 'level-b', sign: 'b', isCorrect: true, xp: 10 },
        ];
        const paused = { exercises, currentIndex: 2, levelId: 1, sessionScore: 20, results };
        storage.saveActiveSession(paused);

        let api: ReturnType<typeof useLearn> | null = null;
        function Probe() {
            const ctx = useLearn();
            useEffect(() => { api = ctx; });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        await act(async () => { root.render(<LearnProvider><Probe /></LearnProvider>); });
        expect(api!.state.activeSessionLevelId).toBe(1);

        // "Practice these signs" from a translation, answered to the end
        await act(async () => { await api!.startPracticeSession(['hello', 'please']); });
        act(() => { api!.answerExercise('hello', true); });
        act(() => { api!.nextExercise(); });
        act(() => { api!.answerExercise('please', true); });
        expect(storage.getActiveSession()).toEqual(paused);
        act(() => { api!.endSession(); });

        expect(storage.getActiveSession()).toEqual(paused);
        expect(api!.state.activeSessionLevelId).toBe(1); // "Resume session" still offered
        act(() => root.unmount());
    });
});
