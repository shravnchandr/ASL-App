import axios, { AxiosError } from 'axios';
import type { TranslateResponse, APIError, RateLimitStatus } from '../../types';
import { apiClient, API_PREFIX } from './client';

export async function translateToASL(text: string, signal?: AbortSignal): Promise<TranslateResponse> {
    try {
        const response = await apiClient.post<TranslateResponse>(`${API_PREFIX}/translate`, { text }, { signal });
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) {
            throw new Error('cancelled');
        }
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIError>;
            const status = axiosError.response?.status;
            if (status === 429) {
                const retryAfter = parseInt(axiosError.response?.headers?.['retry-after'] ?? '', 10);
                const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
                const detail = axiosError.response?.data?.detail;
                const message = typeof detail === 'string'
                    ? detail
                    : "You've made too many requests. Please wait before trying again.";
                throw new Error(`rate_limit:${seconds}: ${message}`);
            }
            if (status === 503) {
                throw new Error('ai_busy: The AI service is experiencing high demand. Please try again in a few seconds.');
            }
            if (!axiosError.response) {
                throw new Error('network: Unable to connect. Please check your internet connection and try again.');
            }
            const detail = axiosError.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Something went wrong. Please try again.';
            throw new Error(`server: ${message}`);
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
