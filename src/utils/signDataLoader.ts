/**
 * Sign Data Loader Utility
 * Loads and caches sign landmark data for the learning feature
 */

import type { SignData, SignMetadata } from '../types';

// Cache for loaded sign data
const signDataCache = new Map<string, SignData>();
let metadataCache: SignMetadata | null = null;

const BASE_PATH = '/sign-data';

/**
 * Load metadata containing list of available signs
 */
export async function loadMetadata(): Promise<SignMetadata> {
    if (metadataCache) {
        return metadataCache;
    }

    try {
        const response = await fetch(`${BASE_PATH}/metadata.json`);
        if (!response.ok) {
            throw new Error(`Failed to load metadata: ${response.status}`);
        }
        metadataCache = await response.json();
        return metadataCache!;
    } catch (error) {
        console.error('Error loading sign metadata:', error);
        throw error;
    }
}

/**
 * Load sign data for a specific sign
 */
export async function loadSignData(sign: string): Promise<SignData | null> {
    const signLower = sign.toLowerCase();

    // Check cache first
    if (signDataCache.has(signLower)) {
        return signDataCache.get(signLower)!;
    }

    try {
        const response = await fetch(`${BASE_PATH}/signs/${signLower}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Sign data not found: ${sign}`);
                return null;
            }
            throw new Error(`Failed to load sign data: ${response.status}`);
        }

        const data: SignData = await response.json();
        signDataCache.set(signLower, data);
        return data;
    } catch (error) {
        console.error(`Error loading sign data for "${sign}":`, error);
        return null;
    }
}

/**
 * Preload multiple signs for smoother experience
 */
export async function preloadSigns(signs: string[]): Promise<void> {
    const loadPromises = signs.map(sign => loadSignData(sign));
    await Promise.allSettled(loadPromises);
}

/**
 * Get list of available signs by difficulty
 */
export async function getSignsByDifficulty(
    difficulty: 'beginner' | 'intermediate' | 'other' | 'all'
): Promise<string[]> {
    const metadata = await loadMetadata();

    if (difficulty === 'all') {
        return Object.keys(metadata.signs);
    }

    return Object.entries(metadata.signs)
        .filter(([, info]) => info.difficulty === difficulty)
        .map(([sign]) => sign);
}

/**
 * Get random signs for exercises
 */
export async function getRandomSigns(count: number, exclude: string[] = []): Promise<string[]> {
    const metadata = await loadMetadata();
    const allSigns = Object.keys(metadata.signs).filter(s => !exclude.includes(s));

    // Shuffle and take first N
    const shuffled = allSigns.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Generate wrong options for exercises (similar signs or random)
 */
export async function getDistractors(
    correctSign: string,
    count: number
): Promise<string[]> {
    const metadata = await loadMetadata();
    const allSigns = Object.keys(metadata.signs).filter(s => s !== correctSign);

    // Shuffle and take first N
    const shuffled = allSigns.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Clear the sign data cache (useful for memory management)
 */
export function clearSignCache(): void {
    signDataCache.clear();
}

/**
 * Check if a sign is available
 */
export async function isSignAvailable(sign: string): Promise<boolean> {
    const metadata = await loadMetadata();
    return sign.toLowerCase() in metadata.signs;
}

/**
 * Get sign info from metadata
 */
export async function getSignInfo(sign: string): Promise<SignMetadata['signs'][string] | null> {
    const metadata = await loadMetadata();
    return metadata.signs[sign.toLowerCase()] || null;
}
