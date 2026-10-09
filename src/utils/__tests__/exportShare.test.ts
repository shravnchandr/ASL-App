import { describe, expect, it } from 'vitest';
import { share } from '../share';
import { signProvenance, signSections } from '../pdf';
import type { ASLSign } from '../../types';

const base: ASLSign = {
    word: 'HELLO',
    simple_description: 'Salute outward from your forehead.',
    hand_shape: 'Flat B',
    location: 'Forehead',
    movement: 'Outward',
    non_manual_markers: 'Smile',
};

describe('share.generateShareUrl', () => {
    it('targets the translation route', () => {
        const url = new URL(share.generateShareUrl('how are you?'));
        expect(url.pathname).toBe('/translate');
        expect(url.searchParams.get('q')).toBe('how are you?');
    });
});

describe('pdf content', () => {
    it('exports beginner and detailed fields in order', () => {
        expect(signSections(base).map(([label]) => label)).toEqual([
            'HOW TO DO IT', 'HAND SHAPE', 'LOCATION', 'MOVEMENT', 'FACIAL EXPRESSION',
        ]);
    });

    it('includes fingerspelling characters including digits', () => {
        const sign = { ...base, word: '617', is_fingerspelled: true, fingerspell_letters: ['6', '1', '7'] };
        expect(signSections(sign)).toContainEqual(['FINGERSPELL', '6 - 1 - 7']);
    });

    it('labels provenance like the sign card', () => {
        expect(signProvenance({ ...base, kb_verified: true })).toMatch(/^Verified/);
        expect(signProvenance(base)).toBe('AI generated');
        expect(signProvenance({ ...base, is_fingerspelled: true })).toBe('Fingerspelled');
    });
});
