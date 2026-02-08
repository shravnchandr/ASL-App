/**
 * Level Definitions for ASL Learning
 * 10 progressive levels with 100 total signs
 */

export interface LevelInfo {
    id: number;
    name: string;
    description: string;
    icon: string;
    signs: string[];
    requiredMastery: number;
}

export const MASTERY_THRESHOLD = 80;

export const LEVELS: LevelInfo[] = [
    {
        id: 1,
        name: 'Alphabet',
        description: 'Master A-Z fingerspelling',
        icon: '🔤',
        signs: [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
            'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
            'u', 'v', 'w', 'x', 'y', 'z'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 2,
        name: 'Numbers',
        description: 'Count from one to ten',
        icon: '🔢',
        signs: [
            'one', 'two', 'three', 'four', 'five',
            'six', 'seven', 'eight', 'nine', 'ten'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 3,
        name: 'Greetings & Basics',
        description: 'Essential everyday signs',
        icon: '👋',
        signs: [
            'hello', 'goodbye', 'please', 'thank_you',
            'sorry', 'yes', 'good', 'bad'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 4,
        name: 'Family & People',
        description: 'Signs for family members',
        icon: '👨‍👩‍👧',
        signs: [
            'mother', 'family', 'friend', 'grandfather', 'grandmother'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 5,
        name: 'Feelings',
        description: 'Express your emotions',
        icon: '😊',
        signs: [
            'happy', 'sad', 'angry', 'scared', 'tired', 'hungry', 'thirsty'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 6,
        name: 'Actions',
        description: 'Common action verbs',
        icon: '🏃',
        signs: [
            'sit', 'stand', 'wait', 'read', 'write', 'learn', 'sleep', 'finished'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 7,
        name: 'Questions',
        description: 'Ask the right questions',
        icon: '❓',
        signs: [
            'how', 'when', 'where', 'which', 'who', 'why'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 8,
        name: 'Time',
        description: 'Talk about time',
        icon: '⏰',
        signs: [
            'now', 'later', 'today', 'tomorrow', 'yesterday', 'morning'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 9,
        name: 'Places & Things',
        description: 'Common nouns and places',
        icon: '🏠',
        signs: [
            'home', 'house', 'school', 'hospital', 'bathroom', 'phone', 'book', 'car'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
    {
        id: 10,
        name: 'Months & Essentials',
        description: 'Calendar and daily essentials',
        icon: '📅',
        signs: [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
            'want', 'need', 'food', 'water'
        ],
        requiredMastery: MASTERY_THRESHOLD,
    },
];

/**
 * Get a level by ID
 */
export const getLevelById = (id: number): LevelInfo | undefined => {
    return LEVELS.find(level => level.id === id);
};

/**
 * Get all signs for a given level
 */
export const getSignsForLevel = (levelId: number): string[] => {
    const level = getLevelById(levelId);
    return level ? level.signs : [];
};

/**
 * Get total sign count across all levels
 */
export const getTotalSignCount = (): number => {
    return LEVELS.reduce((total, level) => total + level.signs.length, 0);
};
