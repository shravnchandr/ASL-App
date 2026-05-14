/** Converts "thank_you" → "Thank You" */
export function formatSignName(sign: string): string {
    return sign
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}
