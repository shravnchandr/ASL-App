/**
 * Formatting Utilities
 * String formatting and display helpers
 */

/**
 * Format a sign name for display
 * Converts "thank_you" to "Thank You"
 */
export function formatSignName(sign: string): string {
    return sign
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format a sign name for URL/storage
 * Converts "Thank You" to "thank_you"
 */
export function toSignKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_');
}
