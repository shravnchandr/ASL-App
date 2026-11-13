import type { SignProgress, Exercise, ExerciseResult } from '../types';
import { getLevelById } from '../constants/levels';

const STORAGE_KEYS = {
    SEARCH_HISTORY: 'asl_search_history',
    FAVORITES: 'asl_favorites',
    THEME: 'asl_theme',
    API_KEY: 'asl_custom_api_key',
    LAST_ACTIVITY: 'asl_last_activity',
    LEARNING_PROGRESS: 'asl_learn_progress',
    LEARNING_SETTINGS: 'asl_learn_settings',
    LEARNING_STATS: 'asl_learn_stats',
    LEVEL_PROGRESS: 'asl_level_progress',
    ONBOARDING_DISMISSED: 'asl_onboarding_dismissed',
    ACTIVE_SESSION: 'asl_active_session',
} as const;

export interface ActiveSessionData {
    exercises: Exercise[];
    currentIndex: number;
    levelId: number;
    sessionScore: number;
    /** Answered exercises; lets resume skip already-rewarded exercises. Absent in older saves. */
    results?: ExerciseResult[];
}

const EXERCISE_TYPES: ReadonlySet<string> = new Set(['sign-to-word', 'word-to-sign', 'recall', 'camera-practice']);
const SIGN_KEY = /^[a-z0-9_]+$/i;

function isValidExercise(e: Exercise): boolean {
    if (!e || typeof e.id !== 'string' || typeof e.sign !== 'string' || !SIGN_KEY.test(e.sign)) return false;
    if (!EXERCISE_TYPES.has(e.type) || typeof e.correctAnswer !== 'string') return false;
    if (e.options === undefined) return e.type === 'recall' || e.type === 'camera-practice';
    return Array.isArray(e.options)
        && e.options.every(o => typeof o === 'string' && SIGN_KEY.test(o))
        && e.options.includes(e.correctAnswer);
}

function isValidResult(r: ExerciseResult): boolean {
    return !!r && typeof r.exerciseId === 'string' && typeof r.sign === 'string'
        && typeof r.isCorrect === 'boolean' && typeof r.xp === 'number' && r.xp >= 0;
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

/**
 * Stored values can be valid JSON of the wrong shape (edited by hand, another
 * version, a half-written save). Readers fall back to defaults instead of
 * handing a wrong type to the app.
 */
function readJson(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const finiteOr = (v: unknown, fallback: number, min = 0): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;

function isSignProgress(v: unknown): v is SignProgress {
    return isRecord(v)
        && ['timesStudied', 'timesCorrect', 'mastery'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
}

export const storage = {
    getSearchHistory(): string[] {
        const history = readJson(STORAGE_KEYS.SEARCH_HISTORY);
        return Array.isArray(history) ? history.filter((q): q is string => typeof q === 'string') : [];
    },

    addToSearchHistory(query: string): void {
        try {
            const history = this.getSearchHistory();
            const updated = [query, ...history.filter(q => q !== query)].slice(0, 10);
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

    getFavorites(): Array<{ query: string; timestamp: number }> {
        const favorites = readJson(STORAGE_KEYS.FAVORITES);
        if (!Array.isArray(favorites)) return [];
        return favorites.filter((f): f is { query: string; timestamp: number } =>
            isRecord(f) && typeof f.query === 'string' && typeof f.timestamp === 'number');
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

    getTheme(): 'auto' | 'light' | 'dark' | 'high-contrast' {
        try {
            const theme = localStorage.getItem(STORAGE_KEYS.THEME);
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

    getLearningProgress(): Record<string, SignProgress> {
        const progress = readJson(STORAGE_KEYS.LEARNING_PROGRESS);
        if (!isRecord(progress)) return {};
        // Drop only the damaged entries; the rest of the progress survives
        return Object.fromEntries(
            Object.entries(progress).filter((entry): entry is [string, SignProgress] => isSignProgress(entry[1]))
        );
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
                easeFactor: 2.5,
                interval: 0,
                repetitions: 0,
                nextReview: '',
            };

            existing.timesStudied += 1;
            if (isCorrect) {
                existing.timesCorrect += 1;
            }
            existing.lastStudied = new Date().toISOString();

            // SM-2: quality 4 = correct, quality 1 = incorrect
            const quality = isCorrect ? 4 : 1;

            if (quality >= 3) {
                if (existing.repetitions === 0) {
                    existing.interval = 1;
                } else if (existing.repetitions === 1) {
                    existing.interval = 6;
                } else {
                    existing.interval = Math.round(existing.interval * existing.easeFactor);
                }
                existing.repetitions += 1;
            } else {
                existing.repetitions = 0;
                existing.interval = 1;
            }

            // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
            existing.easeFactor = existing.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            existing.easeFactor = Math.max(1.3, existing.easeFactor);

            const next = new Date();
            next.setDate(next.getDate() + existing.interval);
            existing.nextReview = next.toISOString().split('T')[0];

            // Mastery = 80% accuracy weight + 20% repetition confidence
            const accuracy = existing.timesStudied >= 3
                ? existing.timesCorrect / existing.timesStudied
                : (existing.timesCorrect / Math.max(existing.timesStudied, 1)) * 0.8;
            const repetitionBonus = Math.min(existing.repetitions / 5, 1) * 0.2;
            existing.mastery = Math.round((accuracy * 0.8 + repetitionBonus) * 100);

            progress[sign] = existing;
            localStorage.setItem(STORAGE_KEYS.LEARNING_PROGRESS, JSON.stringify(progress));
        } catch (error) {
            console.error('Failed to update sign progress:', error);
        }
    },

    /**
     * Get signs that are due for review based on SM-2 scheduling.
     * Returns sign names sorted by most overdue first.
     */
    getSignsDueForReview(): string[] {
        const progress = this.getLearningProgress();
        const today = new Date().toISOString().split('T')[0];
        return Object.entries(progress)
            .filter(([, p]) => p.nextReview && p.nextReview <= today)
            .sort(([, a], [, b]) => (a.nextReview || '').localeCompare(b.nextReview || ''))
            .map(([sign]) => sign);
    },

    getLearningStats(): LearningStats {
        const stats = readJson(STORAGE_KEYS.LEARNING_STATS);
        const s = isRecord(stats) ? stats : {};
        return {
            totalXP: finiteOr(s.totalXP, 0),
            level: finiteOr(s.level, 1, 1),
            streak: finiteOr(s.streak, 0),
            lastActivityDate: typeof s.lastActivityDate === 'string' ? s.lastActivityDate : '',
        };
    },

    addXP(amount: number): LearningStats {
        try {
            const stats = this.getLearningStats();
            stats.totalXP += amount;
            stats.level = Math.floor(stats.totalXP / 100) + 1;
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

    getLearningSettings(): LearningSettings {
        const settings = readJson(STORAGE_KEYS.LEARNING_SETTINGS);
        const s = isRecord(settings) ? settings : {};
        return {
            animationSpeed: typeof s.animationSpeed === 'number' && Number.isFinite(s.animationSpeed) && s.animationSpeed > 0
                ? s.animationSpeed : 1,
            difficulty: s.difficulty === 'intermediate' || s.difficulty === 'all' ? s.difficulty : 'beginner',
        };
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

    clearLearningData(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.LEARNING_PROGRESS);
            localStorage.removeItem(STORAGE_KEYS.LEARNING_STATS);
            localStorage.removeItem(STORAGE_KEYS.LEARNING_SETTINGS);
            localStorage.removeItem(STORAGE_KEYS.LEVEL_PROGRESS);
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        } catch (error) {
            console.error('Failed to clear learning data:', error);
        }
    },

    getLevelProgress(): LevelProgressData {
        const data = readJson(STORAGE_KEYS.LEVEL_PROGRESS);
        const d = isRecord(data) ? data : {};
        const unlocked = Array.isArray(d.unlockedLevels)
            ? d.unlockedLevels.filter((id): id is number => typeof id === 'number' && !!getLevelById(id))
            : [];
        const unlockedLevels = unlocked.includes(1) ? unlocked : [1, ...unlocked];
        return {
            unlockedLevels,
            currentLevel: typeof d.currentLevel === 'number' && getLevelById(d.currentLevel) ? d.currentLevel : 1,
        };
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

    isOnboardingDismissed(): boolean {
        try {
            return localStorage.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED) === 'true';
        } catch {
            return false;
        }
    },

    dismissOnboarding(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.ONBOARDING_DISMISSED, 'true');
        } catch (error) {
            console.error('Failed to dismiss onboarding:', error);
        }
    },

    saveActiveSession(data: ActiveSessionData): void {
        try {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save active session:', error);
        }
    },

    getActiveSession(): ActiveSessionData | null {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
            if (!data) return null;
            const parsed = JSON.parse(data) as ActiveSessionData;
            // Structural validation — reject corrupted or tampered entries
            if (
                !parsed ||
                !Array.isArray(parsed.exercises) ||
                parsed.exercises.length === 0 ||
                !parsed.exercises.every(isValidExercise) ||
                !Number.isInteger(parsed.currentIndex) ||
                parsed.currentIndex < 0 ||
                parsed.currentIndex >= parsed.exercises.length ||
                !Number.isInteger(parsed.levelId) ||
                !getLevelById(parsed.levelId) ||
                typeof parsed.sessionScore !== 'number' ||
                parsed.sessionScore < 0 ||
                (parsed.results !== undefined && (!Array.isArray(parsed.results) || !parsed.results.every(isValidResult)))
            ) {
                localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    },

    clearActiveSession(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        } catch (error) {
            console.error('Failed to clear active session:', error);
        }
    },
};
