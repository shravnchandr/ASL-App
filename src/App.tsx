/**
 * Main App Component - ASL Guide
 * Two modes: Text to Signs (Dictionary) and Learn Signs (Animations)
 */

import { useState, useEffect, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { SignCard } from './components/SignCard';
import { FeedbackWidget } from './components/FeedbackWidget';
import { FeedbackModal } from './components/FeedbackModal';
import { LoadingState } from './components/LoadingState';
import { LearningDisclaimer } from './components/LearningDisclaimer';
import { SearchHistory } from './components/features/SearchHistory';
import { ApiKeyModal } from './components/features/ApiKeyModal';
import { ThemeSwitcher } from './components/features/ThemeSwitcher';
import { SessionTimeoutWarning } from './components/features/SessionTimeoutWarning';
import { ActionButtons } from './components/features/ActionButtons';
import { WelcomeBanner } from './components/features/WelcomeBanner';
import { GeneralFeedbackModal } from './components/features/GeneralFeedbackModal';
import { FloatingFeedbackButton } from './components/features/FloatingFeedbackButton';
import { RateLimitBanner } from './components/features/RateLimitBanner';
import { Admin } from './components/Admin';
import { LearnPage } from './components/learn/LearnPage';
import { HomePage } from './components/HomePage';
import { translateToASL, submitFeedback, submitGeneralFeedback, setCustomApiKey } from './services/api';
import { announceToScreenReader } from './utils/accessibility';
import { print } from './utils/print';
import { useApp } from './contexts/AppContext';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import type { TranslateResponse } from './types';
import './App.css';

type AppMode = 'home' | 'dictionary' | 'learn';

function App() {
  // Check if we're on special routes
  const isAdminRoute = window.location.pathname === '/admin' || window.location.search.includes('admin=true');

  // Determine initial mode from URL
  const getInitialMode = (): AppMode => {
    const path = window.location.pathname;
    if (path === '/learn') return 'learn';
    if (path === '/dictionary' || path === '/translate') return 'dictionary';
    return 'home';
  };

  const [currentMode, setCurrentMode] = useState<AppMode>(getInitialMode);

  const { customApiKey, addToHistory } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState<'up' | 'down' | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showGeneralFeedbackModal, setShowGeneralFeedbackModal] = useState(false);

  // Session timeout
  const { showWarning: showTimeoutWarning, timeRemaining, dismissWarning } = useSessionTimeout();

  // Handle mode selection from home page
  const handleSelectMode = (mode: 'dictionary' | 'learn') => {
    setCurrentMode(mode);
    const path = mode === 'learn' ? '/learn' : '/dictionary';
    window.history.pushState({}, '', path);
  };

  // Handle back to home
  const handleBackToHome = () => {
    setCurrentMode('home');
    window.history.pushState({}, '', '/');
  };

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setCurrentMode(getInitialMode());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Set custom API key when it changes
  useEffect(() => {
    setCustomApiKey(customApiKey);
  }, [customApiKey]);

  // Setup print listeners
  useEffect(() => {
    const cleanup = print.setupPrintListeners();
    return cleanup;
  }, []);

  // Listen for custom event to open API key modal
  useEffect(() => {
    const handleOpenModal = () => setShowApiKeyModal(true);
    window.addEventListener('openApiKeyModal', handleOpenModal);
    return () => window.removeEventListener('openApiKeyModal', handleOpenModal);
  }, []);

  // Handle URL query parameter for sharing
  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    announceToScreenReader('Searching for ASL translation', 'polite');
    addToHistory(query);

    try {
      const response = await translateToASL(query);
      setResult(response);
      announceToScreenReader(`Found ${response.signs.length} signs for ${query}`, 'polite');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
    } finally {
      setIsLoading(false);
    }
  }, [addToHistory]);

  // Handle URL query parameter for sharing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) {
      handleSearch(query);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [handleSearch]);

  const handleFeedbackClick = (rating: 'up' | 'down') => {
    setSelectedRating(rating);
    setShowFeedbackModal(true);
  };

  const handleFeedbackSubmit = async (feedbackText: string) => {
    if (!result || !selectedRating) return;

    setIsSubmittingFeedback(true);

    try {
      await submitFeedback({
        query: result.query,
        rating: selectedRating,
        feedback_text: feedbackText || undefined,
      });

      announceToScreenReader('Thank you for your feedback!', 'polite');
      setShowFeedbackModal(false);
      setSelectedRating(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback';
      announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
      alert(errorMessage);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleGeneralFeedbackSubmit = async (category: string, feedbackText: string, email?: string) => {
    try {
      await submitGeneralFeedback({
        category,
        feedback_text: feedbackText,
        email,
      });
      announceToScreenReader('Thank you for your feedback!', 'polite');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback';
      announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
      throw err; // Re-throw to let modal handle it
    }
  };

  // If admin route, show admin panel (after all hooks are called)
  if (isAdminRoute) {
    return <Admin />;
  }

  // Show home page
  if (currentMode === 'home') {
    return <HomePage onSelectMode={handleSelectMode} />;
  }

  // Show learn page
  if (currentMode === 'learn') {
    return <LearnPage onBack={handleBackToHome} />;
  }

  // Dictionary mode
  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header">
        <div className="container">
          <div className="header-content">
            <div className="header-top">
              <div className="header-left">
                <button
                  className="back-button"
                  onClick={handleBackToHome}
                  aria-label="Back to home"
                  title="Back to ASL Guide"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <h1 className="app-title">
                  <span className="title-icon" aria-hidden="true">🤟</span>
                  Text to Signs
                </h1>
              </div>
              <div className="header-actions">
                <button
                  className="api-key-button"
                  onClick={() => setShowApiKeyModal(true)}
                  aria-label="Manage API key"
                  title="Use your own API key"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M14.1667 8.33333C15.5474 8.33333 16.6667 7.21405 16.6667 5.83333C16.6667 4.45262 15.5474 3.33333 14.1667 3.33333C12.786 3.33333 11.6667 4.45262 11.6667 5.83333C11.6667 7.21405 12.786 8.33333 14.1667 8.33333Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M7.5 16.6667L3.33333 12.5L7.5 8.33333L11.6667 12.5L7.5 16.6667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M11.6667 5.83333H7.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {customApiKey && <span className="api-key-indicator" />}
                </button>
                <ThemeSwitcher />
              </div>
            </div>
            <p className="app-subtitle">
              Enter any English phrase and get detailed ASL sign instructions
            </p>
          </div>
        </div>
      </header>

      <RateLimitBanner customApiKey={customApiKey} />

      <main id="main-content" className="app-main">
        <div className="container">
          <section className="search-section" aria-label="Search for ASL translations">
            <WelcomeBanner onOpenApiKeyModal={() => setShowApiKeyModal(true)} />
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
            <SearchHistory onSelectQuery={handleSearch} />
          </section>

          {isLoading && (
            <section className="results-section" aria-label="Loading results">
              <LoadingState />
            </section>
          )}

          {error && (
            <section className="results-section" aria-label="Error message">
              <div className="error-message" role="alert">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <path d="M24 4C12.96 4 4 12.96 4 24C4 35.04 12.96 44 24 44C35.04 44 44 35.04 44 24C44 12.96 35.04 4 24 4ZM26 34H22V30H26V34ZM26 26H22V14H26V26Z" fill="currentColor" />
                </svg>
                <h2 className="error-title">Oops! Something went wrong</h2>
                <p className="error-text">{error}</p>
                {!customApiKey && (
                  <p className="error-hint">
                    💡 <strong>Tip:</strong> Make sure you've added your Google Gemini API key.
                    Click the key icon in the header to add one.
                  </p>
                )}
                <div className="error-actions">
                  <button className="error-retry" onClick={() => setError(null)}>
                    Try Again
                  </button>
                  {!customApiKey && (
                    <button className="error-setup" onClick={() => setShowApiKeyModal(true)}>
                      Add API Key
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {result && !isLoading && (
            <section
              className="results-section"
              aria-label="Translation results"
              data-print-date={print.getFormattedDate()}
            >
              <div className="results-header">
                <h2 className="results-title">
                  ASL Signs for "{result.query}"
                </h2>
                <p className="results-count" aria-live="polite">
                  {result.signs.length} {result.signs.length === 1 ? 'sign' : 'signs'} found
                </p>
              </div>

              <LearningDisclaimer />

              <ActionButtons query={result.query} signsCount={result.signs.length} />

              <div className="signs-grid">
                {result.signs.map((sign, index) => (
                  <SignCard key={`${sign.word}-${index}`} sign={sign} index={index} />
                ))}
              </div>

              {result.note && (
                <div className="asl-note">
                  <h3 className="note-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z" fill="currentColor" />
                    </svg>
                    ASL Grammar Tips
                  </h3>
                  <p className="note-text">{result.note}</p>
                </div>
              )}

              <FeedbackWidget onFeedbackClick={handleFeedbackClick} />
            </section>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p className="footer-text">
            Built with Material 3 Expressive Design • Powered by Google Gemini
          </p>
        </div>
      </footer>

      {/* Floating Feedback Button */}
      <FloatingFeedbackButton onClick={() => setShowGeneralFeedbackModal(true)} />

      {/* Modals */}
      {showFeedbackModal && result && selectedRating && (
        <FeedbackModal
          isOpen={showFeedbackModal}
          rating={selectedRating}
          query={result.query}
          onClose={() => {
            setShowFeedbackModal(false);
            setSelectedRating(null);
          }}
          onSubmit={handleFeedbackSubmit}
          isSubmitting={isSubmittingFeedback}
        />
      )}

      {showApiKeyModal && (
        <ApiKeyModal
          isOpen={showApiKeyModal}
          onClose={() => setShowApiKeyModal(false)}
        />
      )}

      {/* Session Timeout Warning */}
      {showTimeoutWarning && (
        <SessionTimeoutWarning
          timeRemaining={timeRemaining}
          onDismiss={dismissWarning}
        />
      )}

      {/* General Feedback Modal */}
      {showGeneralFeedbackModal && (
        <GeneralFeedbackModal
          isOpen={showGeneralFeedbackModal}
          onClose={() => setShowGeneralFeedbackModal(false)}
          onSubmit={handleGeneralFeedbackSubmit}
        />
      )}
    </div>
  );
}

export default App;
