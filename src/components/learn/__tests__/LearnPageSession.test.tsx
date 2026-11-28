import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../utils/signDataLoader', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/signDataLoader')>();
    return {
        ...actual,
        loadMetadata: async () => ({ signs: { hello: {}, goodbye: {}, please: {}, sorry: {} } }),
        loadSignData: async () => null,
        preloadSigns: async () => undefined,
        getDistractors: async () => ['goodbye', 'please', 'sorry'],
    };
});
vi.mock('../SignAnimator', () => ({ SignAnimator: () => null }));
// Every exercise type answers wrong through the same button
const WrongAnswer = ({ onAnswer }: { onAnswer: (a: string, ok: boolean) => void }) => (
    <button data-testid="answer" onClick={() => onAnswer('sorry', false)}>answer</button>
);
vi.mock('../SignToWordExercise', () => ({ SignToWordExercise: WrongAnswer }));
vi.mock('../WordToSignExercise', () => ({ WordToSignExercise: WrongAnswer }));
vi.mock('../RecallExercise', () => ({ RecallExercise: WrongAnswer }));

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

describe('LearnPage session', () => {
    it("shows the last answer's feedback before the summary", async () => {
        const { LearnPage } = await import('../LearnPage');
        sessionStorage.setItem('asl_practice_words', JSON.stringify(['hello']));
        await act(async () => {
            root = createRoot(container);
            root.render(<MemoryRouter initialEntries={['/learn?practice=1']}><LearnPage /></MemoryRouter>);
        });
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
        expect(container.textContent).toContain('+0 XP'); // nothing earned yet

        await act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="answer"]')!.click(); });
        expect(container.textContent).toContain('The answer was "Hello"');
        expect(container.querySelector('.session-complete-page')).toBeNull();

        // The usual 2 s on the feedback, then the summary
        await act(async () => { await new Promise(r => setTimeout(r, 2100)); });
        expect(container.querySelector('.session-complete-page')).not.toBeNull();
    }, 10_000);
});
