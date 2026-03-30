/**
 * Admin-only endpoints: feedback management and analytics dashboard.
 * All functions require an adminPassword argument passed as X-Admin-Password header.
 */

import axios, { AxiosError } from 'axios';
import type { PaginatedFeedback, AdminStats, AnalyticsOverview, APIError } from '../../types';
import { apiClient, API_PREFIX } from './client';

function adminHeaders(adminPassword: string) {
    return { 'X-Admin-Password': adminPassword };
}

function handleAdminError(error: unknown, fallbackMessage: string): never {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<APIError>;
        if (axiosError.response?.status === 401) throw new Error('Invalid admin password');
        if (axiosError.response?.status === 503) throw new Error('Admin access not configured on server');
        throw new Error(axiosError.response?.data?.detail || fallbackMessage);
    }
    throw new Error('An unexpected error occurred');
}

export async function getAdminFeedback(
    adminPassword: string,
    page: number = 1,
    limit: number = 50,
    feedbackType?: string,
): Promise<PaginatedFeedback> {
    try {
        const params: Record<string, string | number> = { page, limit };
        if (feedbackType) params.feedback_type = feedbackType;

        const response = await apiClient.get<PaginatedFeedback>(`${API_PREFIX}/admin/feedback`, {
            headers: adminHeaders(adminPassword),
            params,
        });
        return response.data;
    } catch (error) {
        handleAdminError(error, 'Failed to fetch feedback');
    }
}

export async function deleteAdminFeedback(adminPassword: string, feedbackId: number): Promise<void> {
    try {
        await apiClient.delete(`${API_PREFIX}/admin/feedback/${feedbackId}`, {
            headers: adminHeaders(adminPassword),
        });
    } catch (error) {
        if (axios.isAxiosError(error) && (error as AxiosError<APIError>).response?.status === 404) {
            throw new Error('Feedback not found');
        }
        handleAdminError(error, 'Failed to delete feedback');
    }
}

export async function getAdminStats(adminPassword: string): Promise<AdminStats> {
    try {
        const response = await apiClient.get<AdminStats>(`${API_PREFIX}/admin/stats`, {
            headers: adminHeaders(adminPassword),
        });
        return response.data;
    } catch (error) {
        handleAdminError(error, 'Failed to fetch statistics');
    }
}

export async function getAnalyticsOverview(adminPassword: string): Promise<AnalyticsOverview> {
    try {
        const response = await apiClient.get<AnalyticsOverview>(
            `${API_PREFIX}/admin/analytics/overview`,
            { headers: adminHeaders(adminPassword) },
        );
        return response.data;
    } catch (error) {
        handleAdminError(error, 'Failed to fetch analytics');
    }
}
