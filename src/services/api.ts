/**
 * API Service Layer
 * Handles all communication with the FastAPI backend
 */

import axios, { AxiosError } from 'axios';
import type { TranslateResponse, FeedbackData, FeedbackResponse, FeedbackStats, APIError } from '../types';

// Get API URL from environment or use same-origin
const API_URL = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_URL,
    timeout: 30000, // 30 seconds for LLM processing
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Set custom API key for requests
 */
export function setCustomApiKey(apiKey: string | null): void {
    if (apiKey) {
        apiClient.defaults.headers.common['X-Custom-API-Key'] = apiKey;
    } else {
        delete apiClient.defaults.headers.common['X-Custom-API-Key'];
    }
}

/**
 * Translate English phrase to ASL sign descriptions
 */
export async function translateToASL(text: string): Promise<TranslateResponse> {
    try {
        const response = await apiClient.post<TranslateResponse>(`${API_PREFIX}/translate`, {
            text,
        });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIError>;
            if (axiosError.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
            throw new Error(axiosError.response?.data?.detail || 'Failed to translate. Please try again.');
        }
        throw new Error('An unexpected error occurred. Please try again.');
    }
}

/**
 * Submit user feedback
 */
export async function submitFeedback(data: FeedbackData): Promise<FeedbackResponse> {
    try {
        const response = await apiClient.post<FeedbackResponse>(`${API_PREFIX}/feedback`, data);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIError>;
            if (axiosError.response?.status === 429) {
                throw new Error('Too many feedback submissions. Please wait a moment.');
            }
            throw new Error(axiosError.response?.data?.detail || 'Failed to submit feedback.');
        }
        throw new Error('An unexpected error occurred while submitting feedback.');
    }
}

/**
 * Get feedback statistics (optional)
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
    try {
        const response = await apiClient.get<FeedbackStats>(`${API_PREFIX}/feedback/stats`);
        return response.data;
    } catch (error) {
        console.error('Failed to fetch feedback stats:', error);
        throw error;
    }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string }> {
    try {
        const response = await apiClient.get('/health');
        return response.data;
    } catch {
        throw new Error('API is not responding');
    }
}

/**
 * Submit general feedback (bug report, feature request, etc.)
 */
export async function submitGeneralFeedback(data: {
    category: string;
    feedback_text: string;
    email?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const response = await apiClient.post(`${API_PREFIX}/feedback/general`, data);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIError>;
            if (axiosError.response?.status === 429) {
                throw new Error('Too many feedback submissions. Please wait a moment.');
            }
            throw new Error(axiosError.response?.data?.detail || 'Failed to submit feedback.');
        }
        throw new Error('An unexpected error occurred while submitting feedback.');
    }
}
