import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const newFrame = () => Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
const hand = { show: (() => {}) as () => void };
const predict = vi.fn(async () => ({ label: 'a', confidence: 0.95 }));
// Stable, like the real hook's callbacks
const startCamera = vi.fn(async () => {});
const stopCamera = vi.fn();
const processFrame = vi.fn();

vi.mock('../../../hooks/useCamera', () => ({
    useCamera: () => ({
        videoRef: { current: null }, isReady: true, isLoading: false, error: null,
        startCamera, stopCamera,
    }),
}));
vi.mock('../../../hooks/useHandDetection', async () => {
    const { useState } = await import('react');
    return {
        useHandDetection: () => {
            const [landmarks, setLandmarks] = useState(newFrame);
            hand.show = () => setLandmarks(newFrame());
            return { landmarks, isHandDetected: true, isLoading: false, error: null, processFrame };
        },
    };
});
vi.mock('../../../hooks/useASLClassifier', () => ({
    useASLClassifier: () => ({ predict, isLoading: false, error: null }),
}));

let root: Root | undefined;

afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    vi.useRealTimers();
});

describe('CameraPracticeExercise', () => {
    it('classifies each frame once while the page re-renders, and completes once', async () => {
        const { CameraPracticeExercise } = await import('../CameraPracticeExercise');
        const onComplete = vi.fn();
        // Like LearnPage: a new onComplete arrow on every render
        const draw = () => root!.render(
            <CameraPracticeExercise targetSign="a" levelId={1} onComplete={ok => onComplete(ok)} onSkip={() => {}} />,
        );
        await act(async () => { root = createRoot(document.createElement('div')); draw(); });

        // Five frames fill the smoothing buffer; the page re-renders after each
        for (let i = 0; i < 4; i++) await act(async () => { hand.show(); });
        for (let i = 0; i < 3; i++) await act(async () => { draw(); });
        expect(predict).toHaveBeenCalledTimes(5);

        // Keep signing past the 1.5 s hold
        for (let i = 0; i < 20; i++) {
            await act(async () => { hand.show(); await new Promise(r => setTimeout(r, 100)); });
        }
        await act(async () => { await new Promise(r => setTimeout(r, 1100)); });
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith(true);
    }, 10_000);
});
