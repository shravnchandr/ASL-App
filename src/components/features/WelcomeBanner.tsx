/**
 * Welcome Banner Component
 * Shows friendly welcome message, only pushes API key after user tries the app
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { getRateLimitStatus } from '../../services/api';
import './WelcomeBanner.css';

interface WelcomeBannerProps {
    onOpenApiKeyModal: () => void;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ onOpenApiKeyModal }) => {
    const { customApiKey } = useApp();
    const [isDismissed, setIsDismissed] = useState<boolean>(() => {
        return localStorage.getItem('welcome_banner_dismissed') === 'true';
    });
    const [hasSharedKey, setHasSharedKey] = useState(false);

    useEffect(() => {
        // Check if shared key is available
        getRateLimitStatus().then(status => {
            setHasSharedKey(status.shared_key_available);
        });
    }, []);

    const handleDismiss = () => {
        localStorage.setItem('welcome_banner_dismissed', 'true');
        setIsDismissed(true);
    };

    // Don't show if dismissed or if user has API key
    if (isDismissed || customApiKey) {
        return null;
    }

    return (
        <div className="welcome-banner" role="note">
            <div className="banner-content">
                <div className="banner-icon" aria-hidden="true">
                    👋
                </div>
                <div className="banner-text">
                    <h3 className="banner-title">Welcome to ASL Learning Assistant!</h3>
                    <p className="banner-message">
                        {hasSharedKey ? (
                            <>
                                Try it free! You get <strong>10 sign breakdowns per day</strong> with our shared API key.
                                Want unlimited access? Add your own free Google Gemini API key.
                            </>
                        ) : (
                            <>
                                To get started, you'll need a <strong>free Google Gemini API key</strong>.
                                Click the key icon in the header to add yours.
                            </>
                        )}
                    </p>
                </div>
                <div className="banner-actions">
                    {hasSharedKey ? (
                        <>
                            <button className="banner-button secondary" onClick={handleDismiss}>
                                Got it!
                            </button>
                            <button className="banner-button primary" onClick={onOpenApiKeyModal}>
                                Add My Key
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="banner-button primary" onClick={onOpenApiKeyModal}>
                                Add API Key
                            </button>
                            <button className="banner-button secondary" onClick={handleDismiss}>
                                Dismiss
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
