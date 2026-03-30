/**
 * API service barrel — re-exports everything from domain modules.
 * Import from 'services/api' as before; nothing in the codebase needs to change.
 */

export { setCustomApiKey } from './client';
export { translateToASL, getRateLimitStatus, checkHealth } from './translate';
export { submitFeedback, submitGeneralFeedback, getFeedbackStats } from './feedback';
export { getAdminFeedback, deleteAdminFeedback, getAdminStats, getAnalyticsOverview } from './admin';
