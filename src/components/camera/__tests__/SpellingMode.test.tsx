import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Each detected frame is a new landmarks array; `hand.show` delivers the next one
const newFrame = () => Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
const hand = { show: (() => {}) as () => void };
const predict = vi.fn(async () => ({ label: 'a', confidence: 0.95 }));
// Like the real hook: a start clears the last error, which re-renders the page
const startCamera = vi.fn(async () => {
    if (camera.error) { camera.error = null; hand.show(); }
});
const camera = { isReady: true, error: null as string | null };

vi.mock('../../../hooks/useCamera', () => ({
    useCamera: () => ({
        videoRef: { current: null }, isReady: camera.isReady, isLoading: false, error: camera.error,
        facingMode: 'user', flipCamera: vi.fn(), startCamera, stopCamera: vi.fn(),
    }),
}));
vi.mock('../../../hooks/useHandDetection', async () => {
    const { useState } = await import('react');
    return {
        useHandDetection: () => {
            const [landmarks, setLandmarks] = useState(newFrame);
            hand.show = () => setLandmarks(newFrame());
            return { landmarks, normalizedLandmarks: null, isHandDetected: true, isLoading: false, error: null, processFrame: vi.fn() };
        },
    };
});
vi.mock('../../../hooks/useASLClassifier', () => ({
    useASLClassifier: () => ({ predict, isLoading: false, error: null }),
}));
vi.mock('../CameraView', () => ({ CameraView: () => null }));
vi.mock('../CameraTutorial', () => ({ CameraTutorial: () => null }));

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
    predict.mockClear();
    startCamera.mockClear();
    camera.error = null;
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

async function renderLetters() {
    const { default: CameraPage } = await import('../CameraPage');
    await act(async () => {
        root = createRoot(container);
        root.render(<CameraPage onBack={() => {}} />);
    });
}

describe('Letters mode', () => {
    it('classifies each detected frame once, even while a sign is being held', async () => {
        await renderLetters();
        // Five frames fill the smoothing buffer, so the sign is held; each result
        // then updates the hold progress and re-renders the page
        for (let i = 0; i < 4; i++) await act(async () => { hand.show(); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
        expect(predict).toHaveBeenCalledTimes(5);
    });

    it('opens the camera once when retrying after a camera error', async () => {
        camera.isReady = false;
        await renderLetters();
        expect(startCamera).toHaveBeenCalledTimes(1); // the first attempt
        // It fails
        camera.error = 'Camera unavailable';
        await act(async () => { hand.show(); });
        startCamera.mockClear();
        // "Try Again"
        await act(async () => {
            container.querySelector<HTMLButtonElement>('.camera-page__button--primary')!.click();
        });
        expect(startCamera).toHaveBeenCalledTimes(1);
        camera.isReady = true;
    });
});
