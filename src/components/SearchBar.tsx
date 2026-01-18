/**
 * SearchBar Component
 * Material 3 Expressive search input with floating label
 */

import React, { useState, useRef } from 'react';
import './SearchBar.css';

interface SearchBarProps {
    onSearch: (query: string) => void;
    isLoading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading = false }) => {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim() && !isLoading) {
            onSearch(query.trim());
        }
    };

    const handleClear = () => {
        setQuery('');
        inputRef.current?.focus();
    };

    return (
        <form className="search-bar" onSubmit={handleSubmit}>
            <div className={`search-container ${isFocused ? 'focused' : ''} ${query ? 'has-value' : ''}`}>
                <label htmlFor="search-input" className="search-label">
                    Enter phrase to learn ASL signs
                </label>

                <div className="search-input-wrapper">
                    <svg className="search-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>

                    <input
                        ref={inputRef}
                        id="search-input"
                        type="text"
                        className="search-input"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        disabled={isLoading}
                        aria-label="Search for ASL translation"
                        aria-describedby="search-hint"
                        autoComplete="off"
                    />

                    {query && !isLoading && (
                        <button
                            type="button"
                            className="clear-button"
                            onClick={handleClear}
                            aria-label="Clear search"
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                    )}

                    {isLoading && (
                        <div className="loading-spinner" aria-label="Loading">
                            <svg className="spinner" width="20" height="20" viewBox="0 0 20 20">
                                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="50" strokeDashoffset="25" />
                            </svg>
                        </div>
                    )}
                </div>

                <p id="search-hint" className="sr-only">
                    Type an English phrase and press Enter to see ASL sign descriptions
                </p>
            </div>

            <button
                type="submit"
                className="search-button"
                disabled={!query.trim() || isLoading}
                aria-label="Search"
            >
                <span>Translate</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </form>
    );
};
