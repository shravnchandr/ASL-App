export interface ShareData {
    title: string;
    text: string;
    url?: string;
}

export const share = {
    isSupported(): boolean {
        return typeof navigator !== 'undefined' && 'share' in navigator;
    },

    async shareContent(data: ShareData): Promise<boolean> {
        if (this.isSupported()) {
            try {
                await navigator.share(data);
                return true;
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    console.error('Share failed:', error);
                }
                return false;
            }
        } else {
            return this.copyToClipboard(data.text);
        }
    },

    async copyToClipboard(text: string): Promise<boolean> {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // execCommand fallback for browsers without clipboard API
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                return success;
            }
        } catch (error) {
            console.error('Copy to clipboard failed:', error);
            return false;
        }
    },

    generateShareUrl(query: string): string {
        const baseUrl = window.location.origin;
        const params = new URLSearchParams({ q: query });
        return `${baseUrl}?${params.toString()}`;
    },

    formatTranslationForSharing(query: string, signsCount: number): string {
        return `Check out this ASL translation for "${query}"!\n\n${signsCount} sign${signsCount !== 1 ? 's' : ''} found.\n\nTranslate your own phrases at: ${window.location.origin}`;
    },
};
