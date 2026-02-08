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
    // Learning feature keys
    LEARNING_PROGRESS: 'asl_learn_progress',
    LEARNING_SETTINGS: 'asl_learn_settings',
    LEARNING_STATS: 'asl_learn_stats',
    LEVEL_PROGRESS: 'asl_level_progress',
} as const;

// Learning feature types
interface SignProgress {
    timesStudied: number;
    timesCorrect: number;
    lastStudied: string;
    mastery: number;
}

interface LearningStats {
    totalXP: number;
    level: number;
    streak: number;
    lastActivityDate: string;
}

interface LearningSettings {
    animationSpeed: number;
    difficulty: 'beginner' | 'intermediate' | 'all';
}

interface LevelProgressData {
    unlockedLevels: number[];
    currentLevel: number;
}

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
    getTheme(): 'auto' | 'light' | 'dark' | 'high-contrast' {
        try {
            const theme = localStorage.getItem(STORAGE_KEYS.THEME);
            // Default to 'auto' for new users
            if (!theme) return 'auto';
            return theme as 'auto' | 'light' | 'dark' | 'high-contrast';
        } catch {
            return 'auto';
        }
    },

    setTheme(theme: 'auto' | 'light' | 'dark' | 'high-contrast'): void {
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

    // Learning Progress
    getLearningProgress(): Record<string, SignProgress> {
        try {
            const progress = localStorage.getItem(STORAGE_KEYS.LEARNING_PROGRESS);
            return progress ? JSON.parse(progress) : {};
        } catch {
            return {};
        }
    },

    getSignProgress(sign: string): SignProgress | null {
        const progress = this.getLearningProgress();
        return progress[sign] || null;
    },

    updateSignProgress(sign: string, isCorrect: boolean): void {
        try {
            const progress = this.getLearningProgress();
            const existing = progress[sign] || {
                timesStudied: 0,
                timesCorrect: 0,
                lastStudied: '',
                mastery: 0,
            };

            existing.timesStudied += 1;
            if (isCorrect) {
                existing.timesCorrect += 1;
            }
            existing.lastStudied = new Date().toISOString();
            // Calculate mastery as percentage (with minimum 5 attempts for stable score)
            existing.mastery = existing.timesStudied >= 5
                ? Math.round((existing.timesCorrect / existing.timesStudied) * 100)
                : Math.round((existing.timesCorrect / Math.max(existing.timesStudied, 1)) * 100 * 0.8);

            progress[sign] = existing;
            localStorage.setItem(STORAGE_KEYS.LEARNING_PROGRESS, JSON.stringify(progress));
        } catch (error) {
            console.error('Failed to update sign progress:', error);
        }
    },

    // Learning Stats
    getLearningStats(): LearningStats {
        try {
            const stats = localStorage.getItem(STORAGE_KEYS.LEARNING_STATS);
            return stats ? JSON.parse(stats) : {
                totalXP: 0,
                level: 1,
                streak: 0,
                lastActivityDate: '',
            };
        } catch {
            return {
                totalXP: 0,
                level: 1,
                streak: 0,
                lastActivityDate: '',
            };
        }
    },

    addXP(amount: number): LearningStats {
        try {
            const stats = this.getLearningStats();
            stats.totalXP += amount;

            // Level up every 100 XP
            stats.level = Math.floor(stats.totalXP / 100) + 1;

            // Update streak
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            if (stats.lastActivityDate === yesterday) {
                stats.streak += 1;
            } else if (stats.lastActivityDate !== today) {
                stats.streak = 1;
            }
            stats.lastActivityDate = today;

            localStorage.setItem(STORAGE_KEYS.LEARNING_STATS, JSON.stringify(stats));
            return stats;
        } catch (error) {
            console.error('Failed to add XP:', error);
            return this.getLearningStats();
        }
    },

    // Learning Settings
    getLearningSettings(): LearningSettings {
        try {
            const settings = localStorage.getItem(STORAGE_KEYS.LEARNING_SETTINGS);
            return settings ? JSON.parse(settings) : {
                animationSpeed: 1,
                difficulty: 'beginner',
            };
        } catch {
            return {
                animationSpeed: 1,
                difficulty: 'beginner',
            };
        }
    },

    setLearningSettings(settings: Partial<LearningSettings>): void {
        try {
            const current = this.getLearningSettings();
            const updated = { ...current, ...settings };
            localStorage.setItem(STORAGE_KEYS.LEARNING_SETTINGS, JSON.stringify(updated));
        } catch (error) {
            console.error('Failed to save learning settings:', error);
        }
    },

    // Clear all learning data
    clearLearningData(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.LEARNING_PROGRESS);
            localStorage.removeItem(STORAGE_KEYS.LEARNING_STATS);
            localStorage.removeItem(STORAGE_KEYS.LEARNING_SETTINGS);
            localStorage.removeItem(STORAGE_KEYS.LEVEL_PROGRESS);
        } catch (error) {
            console.error('Failed to clear learning data:', error);
        }
    },

    // Level Progress
    getLevelProgress(): LevelProgressData {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.LEVEL_PROGRESS);
            return data ? JSON.parse(data) : {
                unlockedLevels: [1], // Level 1 is always unlocked
                currentLevel: 1,
            };
        } catch {
            return {
                unlockedLevels: [1],
                currentLevel: 1,
            };
        }
    },

    unlockLevel(levelId: number): void {
        try {
            const progress = this.getLevelProgress();
            if (!progress.unlockedLevels.includes(levelId)) {
                progress.unlockedLevels.push(levelId);
                progress.unlockedLevels.sort((a, b) => a - b);
                localStorage.setItem(STORAGE_KEYS.LEVEL_PROGRESS, JSON.stringify(progress));
            }
        } catch (error) {
            console.error('Failed to unlock level:', error);
        }
    },

    setCurrentLevel(levelId: number): void {
        try {
            const progress = this.getLevelProgress();
            if (progress.unlockedLevels.includes(levelId)) {
                progress.currentLevel = levelId;
                localStorage.setItem(STORAGE_KEYS.LEVEL_PROGRESS, JSON.stringify(progress));
            }
        } catch (error) {
            console.error('Failed to set current level:', error);
        }
    },

    isLevelUnlocked(levelId: number): boolean {
        const progress = this.getLevelProgress();
        return progress.unlockedLevels.includes(levelId);
    },
};
