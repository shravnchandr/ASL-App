import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../SignAnimator', () => ({ SignAnimator: () => null }));

describe('WordToSignExercise', () => {
    it("doesn't tell a screen reader which option is the word's sign", async () => {
        const { WordToSignExercise } = await import('../WordToSignExercise');
        const container = document.createElement('div');
        const root = createRoot(container);
        const signs = ['hello', 'thank_you', 'please', 'sorry'];
        await act(async () => {
            root.render(
                <WordToSignExercise
                    targetWord="hello"
                    correctAnswer="hello"
                    options={signs.map(sign => ({ sign, data: null }))}
                    onAnswer={() => {}}
                />,
            );
        });
        const labels = [...container.querySelectorAll('[role="button"]')].map(el => el.getAttribute('aria-label') ?? '');
        expect(labels).toEqual(['Option A', 'Option B', 'Option C', 'Option D']);
        act(() => root.unmount());
    });
});
