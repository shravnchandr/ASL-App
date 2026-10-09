// @vitest-environment node
import swSource from '../../../public/sw.js?raw';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://app.test';
const DIR = '/models/asl-classifier/';
const FILES = ['model.json', 'group1-shard1of1.bin', 'labels.json', 'scaler.json'];

/** Minimal Cache Storage: name → (path → body text). */
function fakeCaches() {
    const stores = new Map<string, Map<string, string>>();
    const keyOf = (req: string | Request) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
    const open = async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
            put: async (req: string | Request, res: Response) => { store.set(keyOf(req), await res.text()); },
            match: async (req: string | Request) => {
                const body = store.get(keyOf(req));
                return body === undefined ? undefined : new Response(body);
            },
            keys: async () => [...store.keys()].map(p => new Request(ORIGIN + p)),
            delete: async (req: string | Request) => store.delete(keyOf(req)),
            addAll: async () => undefined,
        };
    };
    return {
        stores,
        api: {
            open,
            keys: async () => [...stores.keys()],
            has: async (name: string) => stores.has(name),
            delete: async (name: string) => stores.delete(name),
            match: async () => undefined,
        },
    };
}

/** Pages that are still open (service-worker clients). */
const openClients = new Set<string>();

function loadWorker(fetchImpl: (path: string) => Promise<Response>, caches = fakeCaches()) {
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
        skipWaiting: () => undefined,
        clients: {
            claim: () => undefined,
            get: async (id: string) => (openClients.has(id) ? { id } : undefined),
        },
    };
    const fetchFn = (input: string | Request) => fetchImpl(new URL(typeof input === 'string' ? input : input.url, ORIGIN).pathname);
    new Function('self', 'caches', 'fetch', swSource)(self, caches.api, fetchFn);

    const request = async (path: string, clientId = 'page-1') => {
        openClients.add(clientId);
        let responded: Promise<Response> | undefined;
        listeners.fetch({
            clientId,
            request: new Request(ORIGIN + path),
            respondWith: (p: Promise<Response>) => { responded = p; },
            waitUntil: () => undefined,
        });
        const response = await responded!;
        // Response.error() makes the page's fetch reject, like a real network error
        if (response.type === 'error') throw new TypeError('network error');
        return response.text();
    };
    // Each page load is a new client that closes once the model has loaded
    let page = 0;
    const loadModel = async () => {
        const clientId = `load-${++page}`;
        const bodies = await Promise.all(FILES.map(f => request(DIR + f, clientId)));
        openClients.delete(clientId);
        return bodies;
    };
    return { loadModel, request, caches };
}

const version = (v: string) => async (path: string) => new Response(`${v}:${path}`, { headers: { 'content-type': 'application/json' } });

describe('service worker model bundles', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        openClients.clear();
    });

    it('pins a page to one version across sequential requests (fallback, then recovery)', async () => {
        let now = 3_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let network = version('v1');
        const sw = loadWorker(path => network(path));
        await sw.loadModel();                      // v1 is the complete cached bundle

        // v2 deployed; this page's first request hits a partial failure → falls back to v1
        now += 5 * 60 * 1000;
        network = async path => (path.endsWith('.bin') ? Promise.reject(new TypeError('network')) : version('v2')(path));
        const topology = await sw.request(DIR + 'model.json', 'page-A');

        // Network recovers before the same page asks for the weights
        network = version('v2');
        const weights = await sw.request(DIR + 'group1-shard1of1.bin', 'page-A');
        const labels = await sw.request(DIR + 'labels.json', 'page-A');

        expect([topology, weights, labels].every(b => b.startsWith('v1:'))).toBe(true);
        // Another page gets v2, and page A's v1 bundle survives the cleanup
        const otherPage = await sw.request(DIR + 'model.json', 'page-B');
        expect(otherPage.startsWith('v2:')).toBe(true);
        expect((await sw.request(DIR + 'scaler.json', 'page-A')).startsWith('v1:')).toBe(true);

        // Once pages A and B close, their old bundles are cleaned up on the next refresh
        openClients.delete('page-A');
        openClients.delete('page-B');
        now += 5 * 60 * 1000;
        await sw.request(DIR + 'model.json', 'page-C');
        const bundles = [...sw.caches.stores.keys()].filter(k => k.startsWith('asl-model-bundle-'));
        expect(bundles).toHaveLength(1);
    });

    it('fails the whole load when no complete bundle exists, then retries for a complete one', async () => {
        const now = 5_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        // Empty cache, first download is incomplete (weights fail)
        let network = async (path: string) =>
            (path.endsWith('.bin') ? Promise.reject(new TypeError('network')) : version('v1')(path));
        const sw = loadWorker(path => network(path));

        const firstLoad = await Promise.allSettled(
            FILES.map(f => sw.request(DIR + f, 'page-E')),
        );
        // No file is served at all — never v1 topology from an individual request
        expect(firstLoad.every(r => r.status === 'rejected')).toBe(true);

        // A new model is deployed and the network recovers before the next request
        network = version('v2');
        const weights = await sw.request(DIR + 'group1-shard1of1.bin', 'page-E');
        const topology = await sw.request(DIR + 'model.json', 'page-E');
        expect([weights, topology].every(b => b.startsWith('v2:'))).toBe(true);
        expect([...sw.caches.stores.keys()].filter(k => k.startsWith('asl-model-bundle-'))).toHaveLength(1);
    });

    it('never mixes versions when the deploy changes between requests on an empty cache', async () => {
        const now = 6_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let network = async (path: string) =>
            (path.endsWith('.bin') ? Promise.reject(new TypeError('network')) : version('v1')(path));
        const sw = loadWorker(path => network(path));

        await expect(sw.request(DIR + 'model.json', 'page-M')).rejects.toThrow();
        network = version('v2');
        const served = await Promise.all(FILES.map(f => sw.request(DIR + f, 'page-M')));
        expect(served.every(b => b.startsWith('v2:'))).toBe(true);
    });

    it('keeps the pin when the worker restarts mid-load', async () => {
        let now = 4_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let network = version('v1');
        const caches = fakeCaches();
        const first = loadWorker(path => network(path), caches);
        expect((await first.request(DIR + 'model.json', 'page-R')).startsWith('v1:')).toBe(true);

        // v2 deployed and the worker is stopped/restarted before the weights request
        now += 5 * 60 * 1000;
        network = version('v2');
        const restarted = loadWorker(path => network(path), caches);
        expect((await restarted.request(DIR + 'group1-shard1of1.bin', 'page-R')).startsWith('v1:')).toBe(true);
    });

    it('serves one complete version even when a later refresh partially fails', async () => {
        let now = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let network = version('v1');
        const sw = loadWorker(path => network(path));

        expect((await sw.loadModel()).every(body => body.startsWith('v1:'))).toBe(true);

        // A retrained model is deployed, but the weights request fails this time
        now += 5 * 60 * 1000;
        network = async path => (path.endsWith('.bin') ? Promise.reject(new TypeError('network')) : version('v2')(path));
        const mixedAttempt = await sw.loadModel();
        expect(mixedAttempt.every(body => body.startsWith('v1:'))).toBe(true);

        // Next successful refresh switches every file to v2 together
        now += 5 * 60 * 1000;
        network = version('v2');
        expect((await sw.loadModel()).every(body => body.startsWith('v2:'))).toBe(true);
        const bundles = [...sw.caches.stores.keys()].filter(k => k.startsWith('asl-model-bundle-'));
        expect(bundles).toHaveLength(1);
    });

    it('serves the last complete bundle offline', async () => {
        let now = 2_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let online = true;
        const sw = loadWorker(path => (online ? version('v1')(path) : Promise.reject(new TypeError('offline'))));
        await sw.loadModel();

        now += 5 * 60 * 1000;
        online = false;
        expect((await sw.loadModel()).every(body => body.startsWith('v1:'))).toBe(true);
    });
});
