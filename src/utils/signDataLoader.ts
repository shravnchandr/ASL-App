import type { SignData, SignMetadata } from '../types';

/** Fisher-Yates shuffle — returns a new array, does not mutate the input. */
export function shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const SIGN_CACHE_MAX = 50; // cap to prevent unbounded memory growth
const signDataCache = new Map<string, SignData>();
const pendingLoads = new Map<string, Promise<SignData | null>>();

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * Canonical library key for a word or gloss: THANK-YOU / "Thank you" / thank_you →
 * thank_you, fs-BOSTON → boston, "3" → three. Single source of truth for file names.
 */
export function toSignKey(word: string): string {
    const key = word
        .trim()
        .toLowerCase()
        .replace(/^fs-/, '')
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    if (/^\d+$/.test(key) && Number(key) < NUMBER_WORDS.length) {
        return NUMBER_WORDS[Number(key)];
    }
    return key;
}

let metadataCache: SignMetadata | null = null;

const BASE_PATH = '/sign-data';

export async function loadMetadata(): Promise<SignMetadata> {
    if (metadataCache) {
        return metadataCache;
    }

    const response = await fetch(`${BASE_PATH}/metadata.json`);
    if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.status}`);
    }
    metadataCache = await response.json();
    return metadataCache!;
}

export async function loadSignData(sign: string): Promise<SignData | null> {
    const key = toSignKey(sign);
    if (!key) return null;

    const cached = signDataCache.get(key);
    if (cached) {
        // LRU: re-insert so frequently used signs are evicted last
        signDataCache.delete(key);
        signDataCache.set(key, cached);
        return cached;
    }

    // Share one fetch between concurrent callers
    const pending = pendingLoads.get(key);
    if (pending) return pending;

    const load = fetchSignData(key, sign).finally(() => pendingLoads.delete(key));
    pendingLoads.set(key, load);
    return load;
}

async function fetchSignData(key: string, sign: string): Promise<SignData | null> {
    try {
        const response = await fetch(`${BASE_PATH}/signs/${key}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Sign data not found: ${sign}`);
                return null;
            }
            throw new Error(`Failed to load sign data: ${response.status}`);
        }

        const data: SignData = await response.json();
        if (signDataCache.size >= SIGN_CACHE_MAX) {
            const firstKey = signDataCache.keys().next().value; // Maps preserve insertion order
            if (firstKey !== undefined) signDataCache.delete(firstKey);
        }
        signDataCache.set(key, data);
        return data;
    } catch (error) {
        console.error(`Error loading sign data for "${sign}":`, error);
        return null;
    }
}

export async function preloadSigns(signs: string[], concurrency = 6): Promise<void> {
    for (let i = 0; i < signs.length; i += concurrency) {
        await Promise.allSettled(signs.slice(i, i + concurrency).map(loadSignData));
    }
}

export async function getDistractors(
    correctSign: string,
    count: number
): Promise<string[]> {
    const metadata = await loadMetadata();
    const allSigns = Object.keys(metadata.signs).filter(s => s !== correctSign);
    const shuffled = shuffle(allSigns);
    return shuffled.slice(0, count);
}

