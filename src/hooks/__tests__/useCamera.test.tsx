import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCamera, type UseCameraResult } from '../useCamera';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeStream() {
    const track = { stop: vi.fn() };
    return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

let hook: UseCameraResult;
function setHook(result: UseCameraResult) { hook = result; }
function Harness() {
    const result = useCamera();
    const { videoRef } = result;
    useEffect(() => setHook(result));
    return <video ref={videoRef} />;
}

describe('useCamera', () => {
    let container: HTMLDivElement;
    let root: Root;
    const getUserMedia = vi.fn();

    beforeEach(() => {
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
        // jsdom has no media pipeline: pretend metadata is loaded and play succeeds
        Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true });
        HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
        container = document.createElement('div');
        root = createRoot(container);
        act(() => root.render(<Harness />));
    });

    afterEach(() => {
        getUserMedia.mockReset();
    });

    it('stops a stream that resolves after unmount', async () => {
        const pending = deferred<MediaStream>();
        getUserMedia.mockReturnValueOnce(pending.promise);
        const { stream, track } = fakeStream();

        act(() => { void hook.startCamera(); });
        act(() => root.unmount());
        await act(async () => { pending.resolve(stream); });

        expect(track.stop).toHaveBeenCalled();
    });

    it('stops the older stream when two starts overlap', async () => {
        const first = deferred<MediaStream>();
        const a = fakeStream();
        const b = fakeStream();
        getUserMedia.mockReturnValueOnce(first.promise).mockResolvedValueOnce(b.stream);

        act(() => { void hook.startCamera(); });
        await act(async () => { await hook.startCamera(); });
        await act(async () => { first.resolve(a.stream); });

        expect(a.track.stop).toHaveBeenCalled();
        expect(b.track.stop).not.toHaveBeenCalled();
        expect(hook.isReady).toBe(true);
        act(() => root.unmount());
        expect(b.track.stop).toHaveBeenCalled();
    });

    it('restarts exactly once when flipping an active camera', async () => {
        getUserMedia.mockImplementation(async () => fakeStream().stream);
        await act(async () => { await hook.startCamera(); });
        expect(getUserMedia).toHaveBeenCalledTimes(1);

        await act(async () => { hook.flipCamera(); });
        expect(getUserMedia).toHaveBeenCalledTimes(2);
        expect(getUserMedia.mock.calls[1][0].video.facingMode).toBe('environment');
        act(() => root.unmount());
    });

    it('does not start on flip if the camera was never requested', async () => {
        await act(async () => { hook.flipCamera(); });
        expect(getUserMedia).not.toHaveBeenCalled();
        act(() => root.unmount());
    });
});
