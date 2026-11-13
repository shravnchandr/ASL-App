import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

export const API_PREFIX = '/api';

export const apiClient = axios.create({
    baseURL: API_URL,
    timeout: 60000, // multi-sign phrases can take 30-50s to generate
    headers: {
        'Content-Type': 'application/json',
    },
});

let customApiKey: string | null = null;

export function setCustomApiKey(apiKey: string | null): void {
    customApiKey = apiKey;
}

/**
 * Headers carrying the user's own Gemini key. Only the translate request
 * needs them, so the key is never attached to feedback, admin or status calls.
 */
export function customApiKeyHeaders(): Record<string, string> {
    return customApiKey ? { 'X-Custom-API-Key': customApiKey } : {};
}
