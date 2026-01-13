/* eslint-disable react-refresh/only-export-components */
/**
 * App Context
 * Manages global application state (search history, favorites, API key)
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
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

    const addToHistory = (query: string) => {
        storage.addToSearchHistory(query);
        setSearchHistory(storage.getSearchHistory());
    };

    const clearHistory = () => {
        storage.clearSearchHistory();
        setSearchHistory([]);
    };

    const addFavorite = (query: string) => {
        storage.addFavorite(query);
        setFavorites(storage.getFavorites());
    };

    const removeFavorite = (query: string) => {
        storage.removeFavorite(query);
        setFavorites(storage.getFavorites());
    };

    const isFavorite = (query: string): boolean => {
        return storage.isFavorite(query);
    };

    const setCustomApiKey = (key: string | null) => {
        if (key) {
            storage.setCustomApiKey(key);
        } else {
            storage.removeCustomApiKey();
        }
        setCustomApiKeyState(key);
    };

    return (
        <AppContext.Provider
            value={{
                searchHistory,
                favorites,
                customApiKey,
                addToHistory,
                clearHistory,
                addFavorite,
                removeFavorite,
                isFavorite,
                setCustomApiKey,
            }}
        >
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
