// @vitest-environment node
import swSource from '../../../public/sw.js?raw';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://app.test';

function loadWorker() {
    /** The worker's caches, keyed by path; every cache shares one map (only '/' matters here). */
    const store = new Map<string, string>();
    const keyOf = (req: string | Request) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
    const match = async (req: string | Request) => {
        const body = store.get(keyOf(req));
        return body === undefined ? undefined : new Response(body);
    };
    const caches = {
        open: async () => ({ put: async (req: string, res: Response) => { store.set(keyOf(req), await res.text()); }, match }),
        match,
    };
    /** path → [body, content type]; empty = offline */
    let server: Record<string, [string, string]> = {};
    const fetchFn = async (input: string | Request) => {
        const entry = server[keyOf(input)];
        if (!entry) throw new TypeError('network');
        return new Response(entry[0], { headers: { 'content-type': entry[1] } });
    };
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
        skipWaiting: () => undefined,
        clients: { claim: () => undefined },
    };
    new Function('self', 'caches', 'fetch', swSource)(self, caches, fetchFn);

    /** A navigation (a Request can't be built with mode 'navigate', so a plain object stands in). */
    const navigate = async (path: string) => {
        let responded: Promise<Response | undefined> | undefined;
        const pending: Promise<unknown>[] = [];
        listeners.fetch({
            request: { url: ORIGIN + path, method: 'GET', mode: 'navigate' },
            respondWith: (p: Promise<Response | undefined>) => { responded = p; },
            waitUntil: (p: Promise<unknown>) => { pending.push(p); },
        });
        const response = await responded!;
        await Promise.all(pending);
        return response ? response.text() : undefined;
    };
    return { navigate, setServer: (s: typeof server) => { server = s; } };
}

const SHELL: [string, string] = ['<!doctype html><div id="root"></div>', 'text/html; charset=utf-8'];

describe('service worker navigations', () => {
    it('serves the cached app shell offline for any route', async () => {
        const sw = loadWorker();
        sw.setServer({ '/camera': SHELL });
        await sw.navigate('/camera');
        sw.setServer({});
        expect(await sw.navigate('/learn')).toBe(SHELL[0]);
    });

    it('never stores a non-HTML file opened directly as the app shell', async () => {
        const sw = loadWorker();
        sw.setServer({
            '/': SHELL,
            '/models/sign-phrases/ATTRIBUTION.md': ['# Training data credits', 'text/markdown; charset=utf-8'],
        });
        await sw.navigate('/');
        // Opening the credits link is a navigation that the server answers with Markdown
        expect(await sw.navigate('/models/sign-phrases/ATTRIBUTION.md')).toBe('# Training data credits');
        sw.setServer({});
        expect(await sw.navigate('/camera')).toBe(SHELL[0]);
    });
});
