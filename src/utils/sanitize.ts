/**
 * Sanitization Utilities
 * XSS protection using DOMPurify
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML string to prevent XSS attacks
 * Use this when rendering any user-generated or API-provided content
 */
export function sanitizeHtml(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'span'],
        ALLOWED_ATTR: [],
    });
}

/**
 * Sanitize plain text - strips all HTML tags
 * Use for text that should never contain HTML
 */
export function sanitizeText(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
    });
}

/**
 * Sanitize URL to prevent javascript: and data: attacks
 */
export function sanitizeUrl(url: string): string {
    // Remove whitespace
    const trimmed = url.trim();

    // Block dangerous protocols
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
        return '';
    }

    return trimmed;
}

/**
 * Escape HTML entities for safe display
 * Lighter alternative when you just need to display text
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export default {
    sanitizeHtml,
    sanitizeText,
    sanitizeUrl,
    escapeHtml,
};
