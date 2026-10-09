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
