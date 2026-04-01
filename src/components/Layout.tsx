/**
 * Layout Component
 * Shared app shell with persistent navigation bar
 */

import React, { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ThemeSwitcher } from './features/ThemeSwitcher';
import { ApiKeyModal } from './features/ApiKeyModal';
import { GeneralFeedbackModal } from './features/GeneralFeedbackModal';
import { submitGeneralFeedback } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { announceToScreenReader } from '../utils/accessibility';
import './Layout.css';

const PageLoader = () => (
    <div className="page-loader">
        <div className="page-loader__spinner" />
    </div>
);

export const Layout: React.FC = () => {
    const { customApiKey } = useApp();
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);

    const handleGeneralFeedbackSubmit = async (category: string, feedbackText: string, email?: string) => {
        try {
            await submitGeneralFeedback({ category, feedback_text: feedbackText, email });
            announceToScreenReader('Thank you for your feedback!', 'polite');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback';
            announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
            throw err;
        }
    };

    // Listen for custom event to open API key modal
    React.useEffect(() => {
        const handleOpenModal = () => setShowApiKeyModal(true);
        window.addEventListener('openApiKeyModal', handleOpenModal);
        return () => window.removeEventListener('openApiKeyModal', handleOpenModal);
    }, []);

    return (
        <div className="layout">
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>

            {/* Top bar with utility actions */}
            <header className="layout__topbar">
                <div className="layout__topbar-left">
                    <NavLink to="/" className="layout__logo" aria-label="ASL Guide home">
                        ASL Guide
                    </NavLink>
                </div>
                <div className="layout__topbar-right">
                    <button
                        className="layout__icon-btn"
                        onClick={() => setShowFeedbackModal(true)}
                        aria-label="Send feedback"
                        title="Send feedback"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button
                        className="layout__icon-btn"
                        onClick={() => setShowApiKeyModal(true)}
                        aria-label="Manage API key"
                        title="API key settings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M21 2L19 4M11.39 11.61C12.32 12.54 12.89 13.82 12.89 15.22C12.89 18.04 10.61 20.32 7.79 20.32C4.97 20.32 2.69 18.04 2.69 15.22C2.69 12.4 4.97 10.12 7.79 10.12C9.19 10.12 10.47 10.69 11.39 11.61ZM11.39 11.61L15.5 7.5M15.5 7.5L18.5 10.5L21 8L18 5L15.5 7.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {customApiKey && <span className="layout__key-dot" />}
                    </button>
                    <ThemeSwitcher />
                </div>
            </header>

            {/* Main content */}
            <main id="main-content" className="layout__main">
                <Suspense fallback={<PageLoader />}>
                    <Outlet />
                </Suspense>
            </main>

            {/* Bottom navigation */}
            <nav className="layout__nav" aria-label="Main navigation">
                <NavLink
                    to="/"
                    end
                    className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
                    aria-label="Search and translate"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.134 17 3 13.866 3 10C3 6.134 6.134 3 10 3C13.866 3 17 6.134 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Search</span>
                </NavLink>
                <NavLink
                    to="/learn"
                    className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
                    aria-label="Learn signs"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 14L9 5L6 14M12 14L9 5M12 14H6M19 14L16 5L13 14M19 14L16 5M19 14H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Learn</span>
                </NavLink>
                <NavLink
                    to="/camera"
                    className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
                    aria-label="Live camera"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span>Camera</span>
                </NavLink>
            </nav>

            {/* Modals */}
            {showApiKeyModal && (
                <ApiKeyModal
                    isOpen={showApiKeyModal}
                    onClose={() => setShowApiKeyModal(false)}
                />
            )}
            {showFeedbackModal && (
                <GeneralFeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    onSubmit={handleGeneralFeedbackSubmit}
                />
            )}
        </div>
    );
};

export default Layout;
