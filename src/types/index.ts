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
