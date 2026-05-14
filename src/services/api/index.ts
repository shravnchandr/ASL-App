/**
 * API service barrel — re-exports everything from domain modules.
 */

export { setCustomApiKey } from './client';
export { translateToASL, getRateLimitStatus } from './translate';
export { submitFeedback, submitGeneralFeedback } from './feedback';
export { getAdminFeedback, deleteAdminFeedback, getAdminStats, getAnalyticsOverview } from './admin';
