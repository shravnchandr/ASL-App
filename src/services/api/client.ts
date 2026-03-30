/**
 * Axios client — shared instance used by all API modules.
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

export const API_PREFIX = '/api';

export const apiClient = axios.create({
    baseURL: API_URL,
    timeout: 30000, // 30 seconds for LLM processing
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Set or clear the custom Google Gemini API key sent with every request.
 */
export function setCustomApiKey(apiKey: string | null): void {
    if (apiKey) {
        apiClient.defaults.headers.common['X-Custom-API-Key'] = apiKey;
    } else {
        delete apiClient.defaults.headers.common['X-Custom-API-Key'];
    }
}
