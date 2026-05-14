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

export function setCustomApiKey(apiKey: string | null): void {
    if (apiKey) {
        apiClient.defaults.headers.common['X-Custom-API-Key'] = apiKey;
    } else {
        delete apiClient.defaults.headers.common['X-Custom-API-Key'];
    }
}
