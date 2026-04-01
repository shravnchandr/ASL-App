/**
 * SearchBar Component
 * Search input with autocomplete from the 100-sign knowledge base
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './SearchBar.css';

// Available signs for autocomplete — loaded once from metadata
let cachedSigns: string[] | null = null;

async function getAvailableSigns(): Promise<string[]> {
    if (cachedSigns) return cachedSigns;
    try {
        const res = await fetch('/sign-data/metadata.json');
        const data = await res.json();
        cachedSigns = Object.keys(data.signs);
        return cachedSigns;
    } catch {
        return [];
    }
}

function formatSignName(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface SearchBarProps {
    onSearch: (query: string) => void;
    isLoading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading = false }) => {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [allSigns, setAllSigns] = useState<string[]>([]);
    // Tracks the query value when suggestions were dismissed.
    // When query changes (user types), the dismissal no longer applies.
    const [dismissedForQuery, setDismissedForQuery] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load sign names on mount
    useEffect(() => {
        getAvailableSigns().then(setAllSigns);
    }, []);

    // Derive suggestions from query + allSigns (no effect needed)
    const suggestions = useMemo(() => {
        if (!query.trim() || allSigns.length === 0) return [];
        const q = query.toLowerCase().replace(/\s+/g, '_');
        return allSigns
            .filter(s => s.startsWith(q) || s.includes(q))
            .slice(0, 6);
    }, [query, allSigns]);

    // Suggestions are hidden only if dismissed for the current query value
    const suggestionsHidden = dismissedForQuery === query;

    const handleSubmit = useCallback((e?: React.FormEvent) => {
        e?.preventDefault();
        const value = selectedIdx >= 0 && suggestions[selectedIdx]
            ? formatSignName(suggestions[selectedIdx])
            : query.trim();
        if (value && !isLoading) {
            onSearch(value);
            setDismissedForQuery(query);
            setSelectedIdx(-1);
        }
    }, [query, selectedIdx, suggestions, isLoading, onSearch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, -1));
        } else if (e.key === 'Escape') {
            setDismissedForQuery(query);
            setSelectedIdx(-1);
        }
    };

    const handleSelectSuggestion = (sign: string) => {
        const value = formatSignName(sign);
        setQuery(value);
        setDismissedForQuery(value);
        setSelectedIdx(-1);
        onSearch(value);
    };

    const handleClear = () => {
        setQuery('');
        setDismissedForQuery('');
        inputRef.current?.focus();
    };

    const showSuggestions = isFocused && suggestions.length > 0 && !suggestionsHidden;

    return (
        <form className="search-bar" onSubmit={handleSubmit} role="search">
            <div className={`search-bar__container ${isFocused ? 'search-bar__container--focused' : ''}`}>
                <svg className="search-bar__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.134 17 3 13.866 3 10C3 6.134 6.134 3 10 3C13.866 3 17 6.134 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>

                <input
                    ref={inputRef}
                    type="text"
                    className="search-bar__input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter a phrase to learn ASL signs..."
                    disabled={isLoading}
                    aria-label="Search for ASL translation"
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions}
                    aria-controls="search-suggestions"
                    autoComplete="off"
                />

                {query && !isLoading && (
                    <button type="button" className="search-bar__clear" onClick={handleClear} aria-label="Clear">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                )}

                {isLoading && (
                    <div className="search-bar__spinner" aria-label="Loading">
                        <svg width="18" height="18" viewBox="0 0 20 20">
                            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="50" strokeDashoffset="25" />
                        </svg>
                    </div>
                )}

                {/* Autocomplete dropdown */}
                {showSuggestions && (
                    <ul
                        id="search-suggestions"
                        ref={listRef}
                        className="search-bar__suggestions"
                        role="listbox"
                    >
                        {suggestions.map((sign, i) => (
                            <li
                                key={sign}
                                role="option"
                                aria-selected={i === selectedIdx}
                                className={`search-bar__suggestion ${i === selectedIdx ? 'search-bar__suggestion--selected' : ''}`}
                                onMouseDown={() => handleSelectSuggestion(sign)}
                            >
                                {formatSignName(sign)}
                                <span className="search-bar__suggestion-hint">Known sign</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <button
                type="submit"
                className="search-bar__submit"
                disabled={!query.trim() || isLoading}
                aria-label="Search"
            >
                Translate
            </button>
        </form>
    );
};
