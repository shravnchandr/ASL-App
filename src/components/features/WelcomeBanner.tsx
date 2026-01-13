/**
 * Welcome Banner Component
 * Shows important setup information on first visit
 */

import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import './WelcomeBanner.css';

interface WelcomeBannerProps {
    onOpenApiKeyModal: () => void;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ onOpenApiKeyModal }) => {
    const { customApiKey } = useApp();
    const [isDismissed, setIsDismissed] = useState<boolean>(() => {
        return localStorage.getItem('welcome_banner_dismissed') === 'true';
    });

    const handleDismiss = () => {
        localStorage.setItem('welcome_banner_dismissed', 'true');
        setIsDismissed(true);
    };

    // Don't show if dismissed or if user has API key
    if (isDismissed || customApiKey) {
        return null;
    }

    return (
        <div className="welcome-banner" role="alert">
            <div className="banner-content">
                <div className="banner-icon" aria-hidden="true">
                    💡
                </div>
                <div className="banner-text">
                    <h3 className="banner-title">Welcome to ASL Dictionary!</h3>
                    <p className="banner-message">
                        To use this app, you'll need a <strong>free Google Gemini API key</strong>.
                        Click the key icon in the header to add yours and get started.
                    </p>
                </div>
                <div className="banner-actions">
                    <button className="banner-button primary" onClick={onOpenApiKeyModal}>
                        Add API Key
                    </button>
                    <button className="banner-button secondary" onClick={handleDismiss}>
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};
