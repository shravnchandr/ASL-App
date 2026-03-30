// This file has been split into src/services/api/.
// It is kept as a re-export shim so existing imports remain unchanged.
//
// New locations:
//   api/client.ts    — axios instance, setCustomApiKey
//   api/translate.ts — translateToASL, getRateLimitStatus, checkHealth
//   api/feedback.ts  — submitFeedback, submitGeneralFeedback, getFeedbackStats
//   api/admin.ts     — getAdminFeedback, deleteAdminFeedback, getAdminStats, getAnalyticsOverview

export * from './api/index';
