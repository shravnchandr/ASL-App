// @vitest-environment node
import { createHash } from 'node:crypto';
import swSource from '../../../public/sw.js?raw';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://app.test';
const DIR = '/models/sign-phrases/';
const CACHE = 'asl-phrase-model-v1';
const sha = (body: string) => createHash('sha256').update(body).digest('hex');

/** One export: the files the server holds and the URLs a page built with it asks for. */
function bundle(tag: string, dir = DIR) {
    const files = Object.fromEntries(['preprocess.json', 'labels.json', 'sign_ctc.onnx'].map(f => [dir + f, `${tag}:${f}`]));
    const url = (file: string) => `${dir}${file}?v=${sha(files[dir + file])}`;
    return { files, url };
}

function loadWorker() {
    /** Cache Storage keyed by full URL, as in a browser. */
    const stores = new Map<string, Map<string, string>>();
    const caches = {
        open: async (name: string) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name)!;
            return {
                put: async (url: string, res: Response) => { store.set(new URL(url, ORIGIN).href, await res.text()); },
                match: async (url: string) => {
                    const body = store.get(new URL(url, ORIGIN).href);
                    return body === undefined ? undefined : new Response(body);
                },
                keys: async () => [...store.keys()].map(url => new Request(url)),
                delete: async (req: Request) => store.delete(req.url),
            };
        },
    };
    const state = {
        server: {} as Record<string, string>,   // path → body; empty = offline
        pages: 1,
        fetched: [] as string[],
    };
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
        skipWaiting: () => undefined,
        clients: {
            claim: () => undefined,
            matchAll: async () => Array.from({ length: state.pages }, (_, i) => ({ id: `page-${i}` })),
        },
    };
    const fetchFn = async (input: string | Request) => {
        const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN);
        state.fetched.push(url.pathname + url.search);
        const body = state.server[url.pathname];
        if (body === undefined) throw new TypeError('network');
        return new Response(body, { headers: { 'content-type': 'application/octet-stream' } });
    };
    new Function('self', 'caches', 'fetch', swSource)(self, caches, fetchFn);

    /** A page's fetch: the body, or a rejection as for a network error. `handled` is false if the worker stayed out. */
    const request = async (path: string) => {
        let responded: Promise<Response> | undefined;
        const pending: Promise<unknown>[] = [];
        listeners.fetch({
            clientId: 'page-0',
            request: new Request(ORIGIN + path),
            respondWith: (p: Promise<Response>) => { responded = p; },
            waitUntil: (p: Promise<unknown>) => { pending.push(p); },
        });
        if (!responded) return { handled: false, body: null };
        const response = await responded;
        await Promise.all(pending);
        if (response.type === 'error') throw new TypeError('network error');
        return { handled: true, body: await response.text() };
    };
    const cached = () => [...(stores.get(CACHE)?.keys() ?? [])].map(url => url.slice(ORIGIN.length)).sort();
    return { state, request, cached };
}

describe('service worker phrase model cache', () => {
    it('caches a bundle after checking each file, then serves it offline', async () => {
        const v1 = bundle('v1');
        const sw = loadWorker();
        sw.state.server = v1.files;
        for (const file of ['preprocess.json', 'labels.json', 'sign_ctc.onnx']) {
            expect((await sw.request(v1.url(file))).body).toBe(`v1:${file}`);
        }
        sw.state.server = {};
        expect((await sw.request(v1.url('sign_ctc.onnx'))).body).toBe('v1:sign_ctc.onnx');
        expect(sw.state.fetched).toHaveLength(3);
    });

    it('never serves or caches a file from a newer export under an older hash', async () => {
        const v1 = bundle('v1');
        const v2 = bundle('v2');
        const sw = loadWorker();
        sw.state.server = v1.files;
        expect((await sw.request(v1.url('preprocess.json'))).body).toBe('v1:preprocess.json');

        // Deployed between the page's requests: the path now holds the v2 model
        sw.state.server = v2.files;
        await expect(sw.request(v1.url('sign_ctc.onnx'))).rejects.toThrow('network error');
        expect(sw.cached()).toEqual([v1.url('preprocess.json')]);

        // A partial download leaves nothing wrong behind either
        sw.state.server = { [DIR + 'labels.json']: v2.files[DIR + 'labels.json'] };
        await expect(sw.request(v2.url('sign_ctc.onnx'))).rejects.toThrow();
        expect((await sw.request(v2.url('labels.json'))).body).toBe('v2:labels.json');
        expect(sw.cached()).toEqual([v2.url('labels.json'), v1.url('preprocess.json')].sort());
    });

    it('replaces the old version of a file once no other page is open', async () => {
        const v1 = bundle('v1');
        const v2 = bundle('v2');
        const sw = loadWorker();
        sw.state.server = v1.files;
        await sw.request(v1.url('preprocess.json'));
        await sw.request(v1.url('sign_ctc.onnx'));

        // An old page is still open while a new one loads v2: v1 stays for it
        sw.state.server = v2.files;
        sw.state.pages = 2;
        await sw.request(v2.url('preprocess.json'));
        expect(sw.cached()).toContain(v1.url('preprocess.json'));
        sw.state.server = {};
        expect((await sw.request(v1.url('sign_ctc.onnx'))).body).toBe('v1:sign_ctc.onnx');

        // Later, with one page left, loading v2 clears v1 file by file
        sw.state.server = v2.files;
        sw.state.pages = 1;
        await sw.request(v2.url('sign_ctc.onnx'));
        expect(sw.cached()).toEqual([v1.url('preprocess.json'), v2.url('preprocess.json'), v2.url('sign_ctc.onnx')].sort());
    });

    it('keeps the two bundles side by side', async () => {
        const main = bundle('p07');
        const fallback = bundle('p05', DIR + 'phrases05/');
        const sw = loadWorker();
        sw.state.server = { ...main.files, ...fallback.files };
        await sw.request(main.url('sign_ctc.onnx'));
        await sw.request(fallback.url('sign_ctc.onnx'));
        expect(sw.cached()).toEqual([fallback.url('sign_ctc.onnx'), main.url('sign_ctc.onnx')].sort());
    });

    it('does not cache requests without a content hash', async () => {
        const v1 = bundle('v1');
        const sw = loadWorker();
        sw.state.server = v1.files;
        await sw.request(DIR + 'ATTRIBUTION.md').catch(() => undefined);
        await sw.request(DIR + 'labels.json?v=abc123').catch(() => undefined);
        expect(sw.cached()).toEqual([]);
    });
});
