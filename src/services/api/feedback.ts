/**
 * User feedback endpoints (translation ratings and general feedback).
 */

import axios, { AxiosError } from 'axios';
import type { FeedbackData, FeedbackResponse, APIError } from '../../types';
import { apiClient, API_PREFIX } from './client';

function handleFeedbackError(error: unknown): never {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<APIError>;
        if (axiosError.response?.status === 429) {
            throw new Error('Too many feedback submissions. Please wait a moment.');
        }
        throw new Error(axiosError.response?.data?.detail || 'Failed to submit feedback.');
    }
    throw new Error('An unexpected error occurred while submitting feedback.');
}

export async function submitFeedback(data: FeedbackData): Promise<FeedbackResponse> {
    try {
        const response = await apiClient.post<FeedbackResponse>(`${API_PREFIX}/feedback`, data);
        return response.data;
    } catch (error) {
        handleFeedbackError(error);
    }
}

export async function submitGeneralFeedback(data: {
    category: string;
    feedback_text: string;
    email?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const response = await apiClient.post(`${API_PREFIX}/feedback/general`, data);
        return response.data;
    } catch (error) {
        handleFeedbackError(error);
    }
}

