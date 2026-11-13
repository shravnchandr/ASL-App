import { describe, expect, it } from 'vitest';
import { toSignKey } from '../signDataLoader';
import { buildAnimationSteps, practiceKeys, signLibraryKey } from '../animationSteps';
import type { ASLSign } from '../../types';

const sign = (word: string, extra: Partial<ASLSign> = {}): ASLSign => ({
    word, hand_shape: '', location: '', movement: '', non_manual_markers: '', ...extra,
});

describe('toSignKey', () => {
    it.each([
        ['THANK-YOU', 'thank_you'],
        ['Thank you', 'thank_you'],
        ['thank_you', 'thank_you'],
        ['fs-BOSTON', 'boston'],
        ['3', 'three'],
        ['10', 'ten'],
        ['HELLO!', 'hello'],
    ])('%s → %s', (input, expected) => {
        expect(toSignKey(input)).toBe(expected);
    });
});

describe('buildAnimationSteps', () => {
    it('maps glosses to library keys and expands fingerspelling', () => {
        const steps = buildAnimationSteps([
            sign('THANK-YOU'),
            sign('Sam', { is_fingerspelled: true, fingerspell_letters: ['S', 'A', 'M'] }),
            sign('617', { is_fingerspelled: true, fingerspell_letters: ['6', '1', '7'] }),
        ]);
        expect(steps.map(s => s.key)).toEqual(['thank_you', 's', 'a', 'm', 'six', 'one', 'seven']);
        expect(steps.slice(1, 4).map(s => s.label)).toEqual(['S', 'A', 'M']);
    });
});

describe('word glosses versus alphabet letters', () => {
    it('gives the pronoun "I" no library entry, but keeps a fingerspelled I', () => {
        expect(signLibraryKey(sign('I'))).toBeNull();
        expect(signLibraryKey(sign('I', { is_fingerspelled: true, fingerspell_letters: ['I'] }))).toBe('i');
        expect(signLibraryKey(sign('THANK-YOU'))).toBe('thank_you');
        expect(signLibraryKey(sign('3'))).toBe('three');
    });

    it('practises real signs and spelled letters, never a bare-letter word', () => {
        expect(practiceKeys([
            sign('I'),
            sign('HAPPY'),
            sign('Sam', { is_fingerspelled: true, fingerspell_letters: ['S', 'A', 'M'] }),
            sign('HAPPY'),
        ])).toEqual(['happy', 's', 'a', 'm']);
    });
});
