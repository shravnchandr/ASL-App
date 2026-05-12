/**
 * Translation and rate-limit endpoints.
 */

import axios, { AxiosError } from 'axios';
import type { TranslateResponse, APIError, RateLimitStatus } from '../../types';
import { apiClient, API_PREFIX } from './client';

export async function translateToASL(text: string): Promise<TranslateResponse> {
    try {
        const response = await apiClient.post<TranslateResponse>(`${API_PREFIX}/translate`, { text });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIError>;
            const status = axiosError.response?.status;
            if (status === 429) {
                throw new Error('rate_limit: You have made too many requests. Please wait a moment and try again.');
            }
            if (status === 503) {
                throw new Error('ai_busy: The AI service is experiencing high demand. Please try again in a few seconds.');
            }
            if (!axiosError.response) {
                throw new Error('network: Unable to connect. Please check your internet connection and try again.');
            }
            throw new Error(`server: ${axiosError.response?.data?.detail || 'Something went wrong. Please try again.'}`);
        }
        throw new Error('network: Unable to connect. Please check your internet connection and try again.');
    }
}

export async function getRateLimitStatus(): Promise<RateLimitStatus> {
    try {
        const response = await apiClient.get<RateLimitStatus>(`${API_PREFIX}/rate-limit`);
        return response.data;
    } catch (error) {
        console.error('Failed to check rate limit:', error);
        return { shared_key_available: false, message: 'Unable to check rate limit status' };
    }
}

export async function checkHealth(): Promise<{ status: string }> {
    try {
        const response = await apiClient.get('/health');
        return response.data;
    } catch {
        throw new Error('API is not responding');
    }
}
