/* eslint-disable react-refresh/only-export-components */
/**
 * App Context
 * Manages global application state (search history, favorites, API key)
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { storage } from '../utils/storage';

interface AppContextType {
    searchHistory: string[];
    favorites: Array<{ query: string; timestamp: number }>;
    customApiKey: string | null;
    addToHistory: (query: string) => void;
    clearHistory: () => void;
    addFavorite: (query: string) => void;
    removeFavorite: (query: string) => void;
    isFavorite: (query: string) => boolean;
    setCustomApiKey: (key: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [searchHistory, setSearchHistory] = useState<string[]>(() => storage.getSearchHistory());
    const [favorites, setFavorites] = useState(() => storage.getFavorites());
    const [customApiKey, setCustomApiKeyState] = useState<string | null>(() => storage.getCustomApiKey());

    // Callbacks and the context value are memoized so consumers can safely list
    // them in effect dependency arrays without re-running on every provider render.
    const addToHistory = useCallback((query: string) => {
        storage.addToSearchHistory(query);
        setSearchHistory(storage.getSearchHistory());
    }, []);

    const clearHistory = useCallback(() => {
        storage.clearSearchHistory();
        setSearchHistory([]);
    }, []);

    const addFavorite = useCallback((query: string) => {
        storage.addFavorite(query);
        setFavorites(storage.getFavorites());
    }, []);

    const removeFavorite = useCallback((query: string) => {
        storage.removeFavorite(query);
        setFavorites(storage.getFavorites());
    }, []);

    // Depends on `favorites` so its identity changes when the answer can change
    const isFavorite = useCallback(
        (query: string): boolean => favorites.some(f => f.query === query),
        [favorites],
    );

    const setCustomApiKey = useCallback((key: string | null) => {
        if (key) {
            storage.setCustomApiKey(key);
        } else {
            storage.removeCustomApiKey();
        }
        setCustomApiKeyState(key);
    }, []);

    const value = useMemo(
        () => ({
            searchHistory,
            favorites,
            customApiKey,
            addToHistory,
            clearHistory,
            addFavorite,
            removeFavorite,
            isFavorite,
            setCustomApiKey,
        }),
        [searchHistory, favorites, customApiKey, addToHistory, clearHistory, addFavorite, removeFavorite, isFavorite, setCustomApiKey],
    );

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
