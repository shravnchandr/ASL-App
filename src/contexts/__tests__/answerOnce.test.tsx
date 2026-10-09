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

describe('answerExercise', () => {
    it('awards once when called twice before React commits', async () => {
        const { LearnProvider, useLearn } = await import('../LearnContext');
        const { storage } = await import('../../utils/storage');
        storageMock.clear();

        let api: ReturnType<typeof useLearn> | null = null;
        function Probe() {
            const ctx = useLearn();
            useEffect(() => { api = ctx; });
            return null;
        }

        const root = createRoot(document.createElement('div'));
        await act(async () => { root.render(<LearnProvider><Probe /></LearnProvider>); });
        await act(async () => { await api!.startPracticeSession(['hello']); });

        let awards: (number | null)[] = [];
        act(() => {
            const answer = api!.answerExercise;
            awards = [answer('hello', true), answer('hello', true)];
        });

        expect(awards).toEqual([10, null]);
        expect(storage.getLearningStats().totalXP).toBe(10);
        expect(storage.getSignProgress('hello')?.timesStudied).toBe(1);
        expect(api!.state.totalXP).toBe(10);
        act(() => root.unmount());
    });
});
