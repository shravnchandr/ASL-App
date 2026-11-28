import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateResponse } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../learn/SignAnimator', () => ({ SignAnimator: () => null }));
vi.mock('../../utils/signOfTheDay', () => ({ getSignOfTheDay: async () => 'hello' }));
vi.mock('../../utils/signDataLoader', () => ({
    loadSignData: async (sign: string) => ({ sign, frames: [], frame_count: 30, fps: 30 }),
}));

function memoryStorage(): Storage {
    let store: Record<string, string> = {};
    return {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { store = {}; },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
    };
}

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    container = document.createElement('div');
    document.body.append(container);
});

afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    container.remove();
    vi.unstubAllGlobals();
});

async function renderHome() {
    const { default: HomePage } = await import('../HomePage');
    await act(async () => {
        root = createRoot(container);
        root.render(<MemoryRouter><HomePage /></MemoryRouter>);
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    return container.textContent ?? '';
}

describe('HomePage', () => {
    it('shows no placeholder person or made-up metrics', async () => {
        const text = await renderHome();
        expect(text).not.toMatch(/Alex|camera accuracy|last 5|this week|pickup #|#42/);
        expect(text).toMatch(/Good (morning|afternoon|evening)\./);
    });

    it("shows today's sign from the sign library", async () => {
        const text = await renderHome();
        expect(text).toContain('SIGN OF THE DAY');
        expect(text).toContain('hello');
        expect(text).not.toContain('Save to library'); // it saved nothing
    });

    it("counts a recent translation's signs from the Translate page's cache", async () => {
        const { storage } = await import('../../utils/storage');
        const { writeCachedResult } = await import('../../utils/resultCache');
        const response: TranslateResponse = {
            query: 'Good Morning', note: '', asl_gloss_order: 'MORNING GOOD',
            signs: ['MORNING', 'GOOD'].map(word => ({
                word, simple_description: '', hand_shape: '', location: '', movement: '', non_manual_markers: '',
            })),
        };
        storage.addToSearchHistory('Good Morning');
        writeCachedResult('Good Morning', response);
        const text = await renderHome();
        expect(text).toContain('RECENT TRANSLATIONS');
        expect(text).toContain('2 signs');
        expect(text).not.toMatch(/Today|Yesterday|days ago/); // history has no dates
    });
});
