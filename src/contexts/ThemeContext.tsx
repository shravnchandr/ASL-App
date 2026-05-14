/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react';
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

const subscribeToSystemTheme = (callback: () => void) => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', callback);
    return () => mediaQuery.removeEventListener('change', callback);
};

const getSystemThemeSnapshot = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

const getServerSnapshot = (): 'light' | 'dark' => 'light';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themePreference, setThemePreference] = useState<ThemePreference>(
        () => (storage.getTheme() as ThemePreference) || 'auto'
    );
    const [textSize, setTextSizeState] = useState<TextSize>('normal');

    const systemTheme = useSyncExternalStore(
        subscribeToSystemTheme,
        getSystemThemeSnapshot,
        getServerSnapshot
    );

    const effectiveTheme: EffectiveTheme = themePreference === 'auto' ? systemTheme : themePreference;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', effectiveTheme);
    }, [effectiveTheme]);

    useEffect(() => {
        storage.setTheme(themePreference);
    }, [themePreference]);

    useEffect(() => {
        document.documentElement.setAttribute('data-text-size', textSize);
    }, [textSize]);

    const setTheme = useCallback((newTheme: ThemePreference) => {
        setThemePreference(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemePreference(prev => {
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
