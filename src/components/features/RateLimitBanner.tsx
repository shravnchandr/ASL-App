/**
 * Rate Limit Banner Component
 * Shows when user is using shared API key with remaining translations
 */

import { useEffect, useState } from 'react';
import { getRateLimitStatus } from '../../services/api';
import type { RateLimitStatus } from '../../types';
import './RateLimitBanner.css';

interface RateLimitBannerProps {
    customApiKey: string | null;
}

export function RateLimitBanner({ customApiKey }: RateLimitBannerProps) {
    const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Only fetch rate limit if user is NOT using custom API key
        if (!customApiKey) {
            fetchRateLimit();
        } else {
            setIsLoading(false);
            setRateLimitStatus(null);
        }
    }, [customApiKey]);

    const fetchRateLimit = async () => {
        try {
            const status = await getRateLimitStatus();
            setRateLimitStatus(status);
        } catch (error) {
            console.error('Failed to fetch rate limit:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Don't show banner if:
    // - Still loading
    // - User has custom API key
    // - Shared key not available
    // - No remaining translations
    if (isLoading || customApiKey || !rateLimitStatus?.shared_key_available) {
        return null;
    }

    const remaining = rateLimitStatus.remaining ?? 0;
    const limit = rateLimitStatus.limit ?? 0;
    const percentUsed = limit > 0 ? ((limit - remaining) / limit) * 100 : 0;

    // Color based on usage
    let statusClass = 'status-good';
    if (percentUsed >= 80) {
        statusClass = 'status-critical';
    } else if (percentUsed >= 50) {
        statusClass = 'status-warning';
    }

    return (
        <div className={`rate-limit-banner ${statusClass}`}>
            <div className="banner-content">
                <div className="banner-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
                    </svg>
                </div>
                <div className="banner-text">
                    <strong>Using shared API key</strong>
                    {remaining > 0 ? (
                        <span> — {remaining} of {limit} free translations remaining today</span>
                    ) : (
                        <span> — Daily limit reached</span>
                    )}
                </div>
                <button
                    className="banner-action"
                    onClick={() => {
                        // Trigger API key modal (this will be handled by parent)
                        window.dispatchEvent(new CustomEvent('openApiKeyModal'));
                    }}
                    aria-label="Add your own API key for unlimited access"
                >
                    Add your key for unlimited
                </button>
            </div>
        </div>
    );
}
