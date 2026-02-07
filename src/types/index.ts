/**
 * TypeScript type definitions for ASL Dictionary
 */

export interface ASLSign {
    word: string;
    hand_shape: string;
    location: string;
    movement: string;
    non_manual_markers: string;
}

export interface TranslateResponse {
    query: string;
    signs: ASLSign[];
    note: string;
}

export interface FeedbackData {
    query: string;
    rating: 'up' | 'down';
    feedback_text?: string;
}

export interface FeedbackResponse {
    success: boolean;
    message: string;
}

export interface FeedbackStats {
    total_feedback: number;
    thumbs_up: number;
    thumbs_down: number;
    with_text_feedback: number;
}

export interface APIError {
    detail: string;
}

export interface FeedbackItem {
    id: number;
    query: string | null;
    rating: string | null;
    feedback_text: string | null;
    timestamp: string;
    feedback_type: string;
    category: string | null;
    email: string | null;
}

export interface PaginatedFeedback {
    items: FeedbackItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

export interface AdminStats extends FeedbackStats {
    by_type: Record<string, number>;
    by_category: Record<string, number>;
}

// Analytics types
export interface PopularSearch {
    query: string;
    count: number;
}

export interface DailyActiveUser {
    date: string;
    unique_users: number;
}

export interface TranslationStats {
    total: number;
    cache_hits: number;
    cache_misses: number;
    cache_hit_rate: number;
}

export interface AnalyticsOverview {
    unique_users_30d: number;
    unique_users_7d: number;
    unique_users_today: number;
    translations: TranslationStats;
    popular_searches: PopularSearch[];
    daily_active_users: DailyActiveUser[];
    hourly_usage: Record<string, number>;
}

// Rate limit types
export interface RateLimitStatus {
    shared_key_available: boolean;
    limit?: number;
    used?: number;
    remaining?: number;
    reset?: string;
    message?: string;
}

// Learning feature types
export type Coordinate = [number, number, number] | null;

export interface SignFrame {
    pose: Coordinate[];
    left_hand: Coordinate[];
    right_hand: Coordinate[];
    face: Coordinate[];
}

export interface SignData {
    sign: string;
    frames: SignFrame[];
    frame_count: number;
    fps: number;
    source: string;
}

export interface SignMetadataEntry {
    difficulty: 'beginner' | 'intermediate' | 'other';
    frame_count: number;
    fps: number;
    source: string;
}

export interface SignMetadata {
    version: string;
    total_signs: number;
    face_landmark_count: number;
    pose_landmark_count: number;
    hand_landmark_count: number;
    face_keypoint_mapping: Record<string, number[]>;
    face_indices: number[];
    signs: Record<string, SignMetadataEntry>;
}

export interface SignProgress {
    timesStudied: number;
    timesCorrect: number;
    lastStudied: string;
    mastery: number;
}

export interface Exercise {
    id: string;
    type: 'sign-to-word' | 'word-to-sign' | 'recall';
    sign: string;
    options?: string[];
    correctAnswer: string;
}

export interface LearnSession {
    exercises: Exercise[];
    currentIndex: number;
    score: number;
    startTime: string;
}
