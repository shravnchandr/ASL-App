import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const camera = { isReady: false, isLoading: false };
const startCamera = vi.fn(async () => {});
const stopCamera = vi.fn();
/** Per model bundle: still loading, or the error its load ended with */
const models: Record<string, { loading: boolean; error: string | null }> = {};

vi.mock('../../../hooks/useCamera', () => ({
    useCamera: () => ({
        videoRef: { current: null }, isReady: camera.isReady, isLoading: camera.isLoading, error: null,
        facingMode: 'user', flipCamera: vi.fn(), startCamera, stopCamera,
    }),
}));
vi.mock('../../../hooks/useHolisticLandmarks', () => ({
    useHolisticLandmarks: () => ({ detect: vi.fn(() => null), isLoading: false, error: null }),
}));
vi.mock('../../../hooks/useSignPhraseModel', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../hooks/useSignPhraseModel')>();
    return {
        ...actual,
        useSignPhraseModel: (id: string) => {
            const m = models[id] ?? { loading: false, error: null };
            return { recognize: vi.fn(), isLoading: m.loading, error: m.error, contractVersion: m.loading ? null : 'v4' };
        },
    };
});
vi.mock('../CameraControls', () => ({ CameraControls: () => null }));

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
    camera.isReady = false;
    camera.isLoading = false;
    startCamera.mockClear();
    stopCamera.mockClear();
    for (const k of Object.keys(models)) delete models[k];
    vi.stubGlobal('localStorage', memoryStorage());
    container = document.createElement('div');
    document.body.append(container);
});

afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    container.remove();
    vi.unstubAllGlobals();
});

async function render() {
    const { default: PhraseMode } = await import('../PhraseMode');
    const draw = () => root!.render(<PhraseMode onBack={() => {}} />);
    await act(async () => { root = createRoot(container); draw(); });
    return { rerender: () => act(async () => { draw(); }) };
}

const modelButton = (name: RegExp) =>
    [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Model"] button')].find(b => name.test(b.textContent ?? ''))!;

describe('PhraseMode model switch', () => {
    it('keeps the camera running and on screen while another model loads', async () => {
        const view = await render();
        expect(startCamera).toHaveBeenCalledTimes(1);
        camera.isReady = true; // the stream is up
        await view.rerender();

        models['frozen-phrases07'] = { loading: true, error: null };
        await act(async () => { modelButton(/phrases07/).click(); });
        expect(container.querySelector('video')).not.toBeNull();
        expect(container.textContent).toContain('Loading phrases07');

        models['frozen-phrases07'] = { loading: false, error: null };
        await view.rerender();
        expect(container.querySelector('video')).not.toBeNull();
        expect(startCamera).toHaveBeenCalledTimes(1); // not reopened
        expect(stopCamera).not.toHaveBeenCalled();
    });

    it('flipping the camera opens it once, also while a model loads', async () => {
        const view = await render();
        camera.isReady = true;
        await view.rerender();
        // What useCamera does on a flip: it restarts itself, releasing the stream first
        const flip = async () => {
            startCamera.mockClear();
            await act(async () => { void startCamera(); camera.isReady = false; camera.isLoading = true; });
            await view.rerender();
            expect(startCamera).toHaveBeenCalledTimes(1); // only the hook's own restart
            expect(container.querySelector('video')).not.toBeNull(); // the restart needs it
            camera.isReady = true;
            camera.isLoading = false;
            await view.rerender();
        };
        await flip();

        models['frozen-phrases07'] = { loading: true, error: null };
        await act(async () => { modelButton(/phrases07/).click(); });
        await flip();
    });

    it('turns the camera off when a model fails to load', async () => {
        const view = await render();
        camera.isReady = true;
        await view.rerender();

        models['frozen-phrases07'] = { loading: false, error: 'The phrase model on the server does not match' };
        await act(async () => { modelButton(/phrases07/).click(); });
        expect(container.textContent).toContain('does not match');
        expect(stopCamera).toHaveBeenCalled();
    });
});
