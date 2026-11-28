import type { TranslateResponse } from '../types';

// sessionStorage cache of translation results (tab-scoped). Versioned so a shape
// or pipeline change never revives stale results; expires like the server cache.
// Case is part of the key: "May" (the month) and "may" translate differently.
const RESULT_CACHE_PREFIX = 'asl_result:v3:';
const RESULT_CACHE_TTL_MS = 60 * 60 * 1000;

function resultCacheKey(query: string): string {
    return RESULT_CACHE_PREFIX + query.trim().replace(/\s+/g, ' ');
}

export function readCachedResult(query: string): TranslateResponse | null {
    try {
        const raw = sessionStorage.getItem(resultCacheKey(query));
        if (!raw) return null;
        const entry = JSON.parse(raw) as { savedAt?: number; response?: TranslateResponse };
        const r = entry.response;
        const fresh = typeof entry.savedAt === 'number' && Date.now() - entry.savedAt < RESULT_CACHE_TTL_MS;
        const valid = !!r && typeof r.query === 'string' && typeof r.note === 'string'
            && Array.isArray(r.signs) && r.signs.every(s => s && typeof s.word === 'string');
        return fresh && valid ? { ...r!, query } : null;
    } catch {
        return null;  // storage blocked or corrupt entry
    }
}

export function writeCachedResult(query: string, response: TranslateResponse): void {
    try {
        sessionStorage.setItem(resultCacheKey(query), JSON.stringify({ savedAt: Date.now(), response }));
    } catch { /* storage blocked or full */ }
}
