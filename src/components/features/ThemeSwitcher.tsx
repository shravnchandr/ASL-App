/**
 * Theme Switcher Component
 * Allows users to switch between light, dark, and high-contrast themes
 */

import { useTheme } from '../../contexts/ThemeContext';
import './ThemeSwitcher.css';

export const ThemeSwitcher: React.FC = () => {
    const { theme, textSize, toggleTheme, increaseTextSize, decreaseTextSize } = useTheme();

    return (
        <div className="theme-switcher">
            <button
                className="theme-button"
                onClick={toggleTheme}
                aria-label={`Current theme: ${theme}. Click to switch theme`}
                title="Switch theme"
            >
                {theme === 'light' && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3V4M12 20V21M4 12H3M6.31412 6.31412L5.5 5.5M17.6859 6.31412L18.5 5.5M6.31412 17.69L5.5 18.5M17.6859 17.69L18.5 18.5M21 12H20M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                )}
                {theme === 'dark' && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
                    </svg>
                )}
                {theme === 'high-contrast' && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 3 V21" stroke="currentColor" strokeWidth="2" />
                    </svg>
                )}
            </button>

            <div className="text-size-controls">
                <button
                    className="text-size-button"
                    onClick={decreaseTextSize}
                    disabled={textSize === 'normal'}
                    aria-label="Decrease text size"
                    title="Decrease text size"
                >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <text x="10" y="15" textAnchor="middle" fontSize="14" fill="currentColor" fontWeight="bold">A</text>
                    </svg>
                </button>
                <button
                    className="text-size-button"
                    onClick={increaseTextSize}
                    disabled={textSize === 'x-large'}
                    aria-label="Increase text size"
                    title="Increase text size"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <text x="12" y="18" textAnchor="middle" fontSize="18" fill="currentColor" fontWeight="bold">A</text>
                    </svg>
                </button>
            </div>
        </div>
    );
};
