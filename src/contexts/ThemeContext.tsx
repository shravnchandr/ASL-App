/* eslint-disable react-refresh/only-export-components */
/**
 * Theme Context
 * Manages theme state (auto, light, dark, high-contrast) and text size
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { storage } from '../utils/storage';

type ThemePreference = 'auto' | 'light' | 'dark' | 'high-contrast';
type EffectiveTheme = 'light' | 'dark' | 'high-contrast';
type TextSize = 'normal' | 'large' | 'x-large';

interface ThemeContextType {
    theme: EffectiveTheme;
    themePreference: ThemePreference;
    textSize: TextSize;
    setTheme: (theme: ThemePreference) => void;
    setTextSize: (size: TextSize) => void;
    toggleTheme: () => void;
    increaseTextSize: () => void;
    decreaseTextSize: () => void;
    isAutoTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Get system preference
const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

// Resolve effective theme from preference
const resolveTheme = (preference: ThemePreference): EffectiveTheme => {
    if (preference === 'auto') {
        return getSystemTheme();
    }
    return preference;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
        const stored = storage.getTheme();
        // Migrate old 'light'/'dark' to support new 'auto' option
        return (stored as ThemePreference) || 'auto';
    });
    const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
        resolveTheme(themePreference)
    );
    const [textSize, setTextSizeState] = useState<TextSize>('normal');

    // Listen for system theme changes when in auto mode
    useEffect(() => {
        if (themePreference !== 'auto') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e: MediaQueryListEvent) => {
            setEffectiveTheme(e.matches ? 'dark' : 'light');
        };

        // Set initial value
        setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');

        // Listen for changes
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [themePreference]);

    // Update effective theme when preference changes
    useEffect(() => {
        if (themePreference !== 'auto') {
            setEffectiveTheme(themePreference);
        }
    }, [themePreference]);

    // Apply theme to document
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', effectiveTheme);
    }, [effectiveTheme]);

    // Persist preference
    useEffect(() => {
        storage.setTheme(themePreference as 'light' | 'dark' | 'high-contrast');
    }, [themePreference]);

    useEffect(() => {
        // Apply text size to document
        document.documentElement.setAttribute('data-text-size', textSize);
    }, [textSize]);

    const setTheme = useCallback((newTheme: ThemePreference) => {
        setThemePreference(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemePreference(prev => {
            // Cycle: auto -> light -> dark -> high-contrast -> auto
            if (prev === 'auto') return 'light';
            if (prev === 'light') return 'dark';
            if (prev === 'dark') return 'high-contrast';
            return 'auto';
        });
    }, []);

    const setTextSize = useCallback((size: TextSize) => {
        setTextSizeState(size);
    }, []);

    const increaseTextSize = useCallback(() => {
        setTextSizeState(prev => {
            if (prev === 'normal') return 'large';
            if (prev === 'large') return 'x-large';
            return 'x-large';
        });
    }, []);

    const decreaseTextSize = useCallback(() => {
        setTextSizeState(prev => {
            if (prev === 'x-large') return 'large';
            if (prev === 'large') return 'normal';
            return 'normal';
        });
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                theme: effectiveTheme,
                themePreference,
                textSize,
                setTheme,
                setTextSize,
                toggleTheme,
                increaseTextSize,
                decreaseTextSize,
                isAutoTheme: themePreference === 'auto',
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
}
