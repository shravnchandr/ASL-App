/* eslint-disable react-refresh/only-export-components */
/**
 * Theme Context
 * Manages theme state (light, dark, high-contrast) and text size
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { storage } from '../utils/storage';

type Theme = 'light' | 'dark' | 'high-contrast';
type TextSize = 'normal' | 'large' | 'x-large';

interface ThemeContextType {
    theme: Theme;
    textSize: TextSize;
    setTheme: (theme: Theme) => void;
    setTextSize: (size: TextSize) => void;
    toggleTheme: () => void;
    increaseTextSize: () => void;
    decreaseTextSize: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => storage.getTheme());
    const [textSize, setTextSizeState] = useState<TextSize>('normal');

    useEffect(() => {
        // Apply theme to document
        document.documentElement.setAttribute('data-theme', theme);
        storage.setTheme(theme);
    }, [theme]);

    useEffect(() => {
        // Apply text size to document
        document.documentElement.setAttribute('data-text-size', textSize);
    }, [textSize]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    const toggleTheme = () => {
        setThemeState(prev => {
            // Toggle between light and dark only (high-contrast can be set separately)
            if (prev === 'light') return 'dark';
            return 'light';
        });
    };

    const setTextSize = (size: TextSize) => {
        setTextSizeState(size);
    };

    const increaseTextSize = () => {
        setTextSizeState(prev => {
            if (prev === 'normal') return 'large';
            if (prev === 'large') return 'x-large';
            return 'x-large';
        });
    };

    const decreaseTextSize = () => {
        setTextSizeState(prev => {
            if (prev === 'x-large') return 'large';
            if (prev === 'large') return 'normal';
            return 'normal';
        });
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                textSize,
                setTheme,
                setTextSize,
                toggleTheme,
                increaseTextSize,
                decreaseTextSize,
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
