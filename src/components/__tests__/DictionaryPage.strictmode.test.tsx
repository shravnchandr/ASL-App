import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TranslateResponse } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const response: TranslateResponse = {
    query: 'hello',
    note: 'Greeting.',
    asl_gloss_order: 'HELLO',
    signs: [{ word: 'HELLO', simple_description: 'Salute outward.', hand_shape: 'flat', location: 'forehead', movement: 'out', non_manual_markers: 'smile' }],
};

// Behaves like the real client: an aborted request rejects with "cancelled"
const translateToASL = vi.fn((_text: string, signal?: AbortSignal) =>
    new Promise<TranslateResponse>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('cancelled')));
        setTimeout(() => (signal?.aborted ? reject(new Error('cancelled')) : resolve(response)), 10);
    }),
);

vi.mock('../../services/api/translate', () => ({
    translateToASL: (text: string, signal?: AbortSignal) => translateToASL(text, signal),
    getRateLimitStatus: async () => ({ shared_key_available: false }),
}));
vi.mock('../../services/api/feedback', () => ({ submitFeedback: vi.fn(), submitGeneralFeedback: vi.fn() }));
vi.mock('../SentenceAnimator', () => ({ SentenceAnimator: () => null }));

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

describe('DictionaryPage ?q= link', () => {
    it('translates an uncached link under StrictMode', async () => {
        const { AppProvider } = await import('../../contexts/AppContext');
        const { DictionaryPage } = await import('../DictionaryPage');
        sessionStorage.clear();

        const container = document.createElement('div');
        const root = createRoot(container);
        await act(async () => {
            root.render(
                <StrictMode>
                    <AppProvider>
                        <MemoryRouter initialEntries={['/translate?q=hello']}>
                            <DictionaryPage />
                        </MemoryRouter>
                    </AppProvider>
                </StrictMode>,
            );
        });
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });

        expect(container.querySelector('[aria-label="Translation results"]')).not.toBeNull();
        expect(container.textContent).toContain('hello');
        act(() => root.unmount());
    });
});
