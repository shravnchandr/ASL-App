import type { ASLSign } from '../types';
import { toSignKey } from './signDataLoader';

export interface AnimationStep {
    /** Library key used to load landmark data (e.g. thank_you, three, b). */
    key: string;
    /** Chip label shown to the user. */
    label: string;
    isFingerspelled: boolean;
}

/**
 * A bare single-letter gloss that is not fingerspelled is a word (the pronoun
 * "I", the article "A"), not an alphabet handshape, so it has no library entry.
 * Every place that maps a translated sign to the library goes through this.
 */
export function hasLibraryEntry(step: Pick<AnimationStep, 'key' | 'isFingerspelled'>): boolean {
    return !(/^[a-z]$/.test(step.key) && !step.isFingerspelled);
}

/** Library key for a translated sign's own animation, or null when it has none. */
export function signLibraryKey(sign: ASLSign): string | null {
    const key = toSignKey(sign.word);
    return key && hasLibraryEntry({ key, isFingerspelled: !!sign.is_fingerspelled }) ? key : null;
}

/** Distinct library keys to practise for a translation (fingerspelled words become their letters). */
export function practiceKeys(signs: ASLSign[]): string[] {
    return [...new Set(buildAnimationSteps(signs).filter(hasLibraryEntry).map(s => s.key))];
}

/**
 * Turn translated signs into the animation sequence: canonical library keys,
 * with fingerspelled words expanded into one step per letter/digit.
 */
export function buildAnimationSteps(signs: ASLSign[]): AnimationStep[] {
    const steps: AnimationStep[] = [];
    for (const sign of signs) {
        const letters = sign.is_fingerspelled ? sign.fingerspell_letters ?? [] : [];
        if (letters.length > 0) {
            for (const ch of letters) {
                steps.push({ key: toSignKey(ch), label: ch.toUpperCase(), isFingerspelled: true });
            }
        } else {
            steps.push({ key: toSignKey(sign.word), label: sign.word, isFingerspelled: !!sign.is_fingerspelled });
        }
    }
    return steps;
}
