import React, { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from './features/ThemeSwitcher';
import { ApiKeyModal } from './features/ApiKeyModal';
import { GeneralFeedbackModal } from './features/GeneralFeedbackModal';
import { submitGeneralFeedback } from '../services/api/feedback';
import { useApp } from '../contexts/AppContext';
import { announceToScreenReader } from '../utils/accessibility';
import { storage } from '../utils/storage';
import './Layout.css';

const PageLoader = () => (
    <div className="page-loader">
        <div className="page-loader__spinner" />
    </div>
);

const NAV_ITEMS = [
    { to: '/', label: 'Home', end: true },
    { to: '/translate', label: 'Translate', end: false },
    { to: '/learn', label: 'Learn', end: false },
    { to: '/camera', label: 'Camera', end: false },
    { to: '/dictionary', label: 'Dictionary', end: false },
] as const;

export const Layout: React.FC = () => {
    const { customApiKey } = useApp();
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();
    const streak = storage.getLearningStats().streak;

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

    React.useEffect(() => {
        const handleOpenModal = () => setShowApiKeyModal(true);
        window.addEventListener('openApiKeyModal', handleOpenModal);
        return () => window.removeEventListener('openApiKeyModal', handleOpenModal);
    }, []);

    React.useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                navigate('/dictionary');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [navigate]);

    return (
        <div className="layout">
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>

            <header className="layout__topbar">
                <div className="layout__topbar-start">
                    {/* Logo */}
                    <NavLink to="/" className="layout__logo" aria-label="ASL Guide home">
                        <div className="layout__logo-icon" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 11V5a1.5 1.5 0 0 1 3 0v6"/>
                                <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/>
                                <path d="M14 11V5a1.5 1.5 0 0 1 3 0v8"/>
                                <path d="M5 12v3a7 7 0 0 0 14 0V9"/>
                            </svg>
                        </div>
                        <span className="layout__logo-text">ASLGuide</span>
                    </NavLink>

                    {/* Horizontal nav */}
                    <nav className="layout__nav" aria-label="Main navigation">
                        {NAV_ITEMS.map(({ to, label, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                className={({ isActive }) =>
                                    `layout__nav-item${isActive ? ' layout__nav-item--active' : ''}`
                                }
                            >
                                <span className="layout__nav-dot" aria-hidden="true" />
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="layout__topbar-end">
                    {/* Streak badge */}
                    {streak > 0 && (
                        <div className="layout__streak-badge" aria-label={`${streak}-day streak`}>
                            <span className="layout__streak-dot" aria-hidden="true" />
                            {streak}-day streak
                        </div>
                    )}

                    {/* Search shortcut */}
                    <button
                        className="layout__search-btn"
                        onClick={() => navigate('/dictionary')}
                        aria-label="Search signs (⌘K)"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="7"/>
                            <path d="M21 21l-4.3-4.3"/>
                        </svg>
                        <span>Search…</span>
                        <kbd className="layout__kbd">⌘K</kbd>
                    </button>

                    {/* Feedback */}
                    <button
                        className="layout__icon-btn"
                        onClick={() => setShowFeedbackModal(true)}
                        aria-label="Send feedback"
                        title="Send feedback"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
                                stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        </svg>
                    </button>

                    {/* API key */}
                    <button
                        className={`layout__icon-btn${customApiKey ? ' layout__icon-btn--keyed' : ''}`}
                        onClick={() => setShowApiKeyModal(true)}
                        aria-label={customApiKey ? 'Custom API key active' : 'Set API key'}
                        title="API key settings"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M21 2L19 4M11.39 11.61C12.32 12.54 12.89 13.82 12.89 15.22C12.89 18.04 10.61 20.32 7.79 20.32C4.97 20.32 2.69 18.04 2.69 15.22C2.69 12.4 4.97 10.12 7.79 10.12C9.19 10.12 10.47 10.69 11.39 11.61ZM11.39 11.61L15.5 7.5M15.5 7.5L18.5 10.5L21 8L18 5L15.5 7.5Z"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {customApiKey && <span className="layout__key-dot" aria-hidden="true"/>}
                    </button>

                    <ThemeSwitcher />

                    <div className="layout__profile">
                        <button
                            className={`layout__avatar${menuOpen ? ' layout__avatar--open' : ''}`}
                            onClick={() => setMenuOpen(open => !open)}
                            aria-label="Open user menu"
                            aria-expanded={menuOpen}
                        >
                            AC
                        </button>
                        {menuOpen && (
                            <>
                                <button
                                    className="layout__menu-scrim"
                                    aria-label="Close user menu"
                                    onClick={() => setMenuOpen(false)}
                                />
                                <div className="layout__profile-menu" role="menu">
                                    <div className="layout__profile-head">
                                        <div className="layout__profile-name">Alex Carter</div>
                                        <div className="layout__profile-email">alex@aslguide.app</div>
                                    </div>
                                    {[
                                        { label: 'Onboarding', to: '/onboarding' },
                                        { label: 'Admin dashboard', to: '/admin' },
                                        { label: 'Signs library', to: '/dictionary' },
                                    ].map(item => (
                                        <button
                                            key={item.label}
                                            className="layout__profile-item"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                navigate(item.to);
                                            }}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                    <button className="layout__profile-item layout__profile-item--muted" role="menuitem">
                                        Sign out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main id="main-content" className="layout__main">
                <Suspense fallback={<PageLoader />}>
                    <Outlet />
                </Suspense>
            </main>

            {/* Mobile bottom nav */}
            <nav className="layout__mobile-nav" aria-label="Mobile navigation">
                {NAV_ITEMS.map(({ to, label, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                            `layout__mobile-nav-item${isActive ? ' layout__mobile-nav-item--active' : ''}`
                        }
                    >
                        <MobileNavIcon route={to} />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

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

function MobileNavIcon({ route }: { route: string }) {
    if (route === '/') return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9.5L12 3L21 9.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
        </svg>
    );
    if (route === '/translate') return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 11V5a1.5 1.5 0 0 1 3 0v6"/>
            <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/>
            <path d="M14 11V5a1.5 1.5 0 0 1 3 0v8"/>
            <path d="M5 12v3a7 7 0 0 0 14 0V9"/>
        </svg>
    );
    if (route === '/learn') return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/>
            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
    );
    if (route === '/camera') return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>
    );
    if (route === '/dictionary') return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
    );
    return null;
}

export default Layout;
