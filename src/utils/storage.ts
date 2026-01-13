/**
 * LocalStorage Utility
 * Handles all localStorage operations with error handling
 */

const STORAGE_KEYS = {
    SEARCH_HISTORY: 'asl_search_history',
    FAVORITES: 'asl_favorites',
    THEME: 'asl_theme',
    API_KEY: 'asl_custom_api_key',
    LAST_ACTIVITY: 'asl_last_activity',
} as const;

export const storage = {
    // Search History
    getSearchHistory(): string[] {
        try {
            const history = localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
            return history ? JSON.parse(history) : [];
        } catch {
            return [];
        }
    },

    addToSearchHistory(query: string): void {
        try {
            const history = this.getSearchHistory();
            const updated = [query, ...history.filter(q => q !== query)].slice(0, 10); // Keep last 10
            localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(updated));
        } catch (error) {
            console.error('Failed to save search history:', error);
        }
    },

    clearSearchHistory(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
        } catch (error) {
            console.error('Failed to clear search history:', error);
        }
    },

    // Favorites
    getFavorites(): Array<{ query: string; timestamp: number }> {
        try {
            const favorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
            return favorites ? JSON.parse(favorites) : [];
        } catch {
            return [];
        }
    },

    addFavorite(query: string): void {
        try {
            const favorites = this.getFavorites();
            if (!favorites.some(f => f.query === query)) {
                favorites.unshift({ query, timestamp: Date.now() });
                localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
            }
        } catch (error) {
            console.error('Failed to add favorite:', error);
        }
    },

    removeFavorite(query: string): void {
        try {
            const favorites = this.getFavorites().filter(f => f.query !== query);
            localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
        } catch (error) {
            console.error('Failed to remove favorite:', error);
        }
    },

    isFavorite(query: string): boolean {
        return this.getFavorites().some(f => f.query === query);
    },

    // Theme
    getTheme(): 'light' | 'dark' | 'high-contrast' {
        try {
            const theme = localStorage.getItem(STORAGE_KEYS.THEME);
            return (theme as 'light' | 'dark' | 'high-contrast') || 'light';
        } catch {
            return 'light';
        }
    },

    setTheme(theme: 'light' | 'dark' | 'high-contrast'): void {
        try {
            localStorage.setItem(STORAGE_KEYS.THEME, theme);
        } catch (error) {
            console.error('Failed to save theme:', error);
        }
    },

    // Custom API Key
    getCustomApiKey(): string | null {
        try {
            return localStorage.getItem(STORAGE_KEYS.API_KEY);
        } catch {
            return null;
        }
    },

    setCustomApiKey(key: string): void {
        try {
            localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        } catch (error) {
            console.error('Failed to save API key:', error);
        }
    },

    removeCustomApiKey(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
        } catch (error) {
            console.error('Failed to remove API key:', error);
        }
    },

    // Session Activity
    updateLastActivity(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
        } catch (error) {
            console.error('Failed to update last activity:', error);
        }
    },

    getLastActivity(): number {
        try {
            const activity = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
            return activity ? parseInt(activity, 10) : Date.now();
        } catch {
            return Date.now();
        }
    },
};
