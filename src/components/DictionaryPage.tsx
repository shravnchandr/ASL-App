/**
 * DictionaryPage Component
 * Search for ASL translations — the primary app feature
 * Landing page with Sign of the Day, progress summary, onboarding, and categories
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { SignCard } from './SignCard';
import { FeedbackWidget } from './FeedbackWidget';
import { FeedbackModal } from './FeedbackModal';
import { LoadingState } from './LoadingState';
import { SearchHistory } from './features/SearchHistory';
import { ActionButtons } from './features/ActionButtons';
import { RateLimitBanner } from './features/RateLimitBanner';
import { SentenceAnimator } from './SentenceAnimator';
import { translateToASL, submitFeedback, submitGeneralFeedback, setCustomApiKey } from '../services/api';
import { announceToScreenReader } from '../utils/accessibility';
import { print } from '../utils/print';
import { useApp } from '../contexts/AppContext';
import { storage } from '../utils/storage';
import { formatSignName } from '../utils/format';
import { LEVELS } from '../constants/levels';
import type { TranslateResponse } from '../types';
import './DictionaryPage.css';

// ─── Follow-up phrase suggestions ────────────────────────────────
const FOLLOW_UP_MAP: Record<string, string[]> = {
    'hello': ['How are you', 'My name is', 'Nice to meet you', 'Goodbye'],
    'how are you': ['I am fine', 'I am good', 'I am tired', 'Thank you'],
    'thank you': ["You're welcome", 'Please', 'Sorry', 'Goodbye'],
    'goodbye': ['See you later', 'Hello', 'Thank you', 'Good'],
    'i love you': ['Family', 'Friend', 'Happy', 'Thank you'],
    'my name is': ['Hello', 'Nice to meet you', 'How are you'],
    'sorry': ['Thank you', 'Please', 'It is okay'],
    'please': ['Thank you', 'Sorry', 'Help'],
    'yes': ['No', 'Thank you', 'Please'],
    'no': ['Yes', 'Sorry', 'Thank you'],
    'happy': ['Sad', 'Angry', 'Tired', 'Scared'],
    'mother': ['Family', 'Friend', 'Grandmother', 'Grandfather'],
};

function getFollowUpSuggestions(query: string, resultWords: string[]): string[] {
    const q = query.toLowerCase().trim();
    if (FOLLOW_UP_MAP[q]) return FOLLOW_UP_MAP[q];
    // Fallback: find category siblings from Levels
    for (const level of LEVELS) {
        const match = resultWords.find(w =>
            level.signs.includes(w.toLowerCase().replace(/[\s-]+/g, '_'))
        );
        if (match) {
            return level.signs
                .filter(s => s !== match.toLowerCase().replace(/[\s-]+/g, '_'))
                .slice(0, 4)
                .map(s => formatSignName(s));
        }
    }
    return [];
}

// ─── Gloss bar ───────────────────────────────────────────────────
const GlossBar: React.FC<{ gloss: string; query: string }> = ({ gloss, query }) => {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(gloss).then(() => {
            setCopied(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 2000);
        });
    };

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const tokens = gloss.split(' ');

    return (
        <div className="gloss-bar" aria-label="ASL grammar transformation">
            <div className="gloss-bar__row">
                <span className="gloss-bar__lang-label">English</span>
                <span className="gloss-bar__english">{query}</span>
            </div>
            <div className="gloss-bar__row">
                <span className="gloss-bar__lang-label">ASL order</span>
                <span className="gloss-bar__sequence">
                    {tokens.map((token, i) => (
                        <span
                            key={i}
                            className={`gloss-token ${token.toLowerCase().startsWith('fs-') ? 'gloss-token--fs' : ''}`}
                        >
                            {token}
                        </span>
                    ))}
                </span>
                <button
                    className="gloss-bar__copy"
                    onClick={handleCopy}
                    aria-label="Copy ASL gloss sequence"
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
};



// ─── Onboarding callout ──────────────────────────────────────────
const OnboardingCallout: React.FC = () => {
    const [visible, setVisible] = useState(() => !storage.isOnboardingDismissed());
    if (!visible) return null;

    const dismiss = () => {
        storage.dismissOnboarding();
        setVisible(false);
    };

    return (
        <div className="onboarding-callout" role="status">
            <div className="onboarding-callout__content">
                <h3 className="onboarding-callout__title">Welcome to ASL Guide</h3>
                <p className="onboarding-callout__text">
                    Type any English phrase to get sign-by-sign ASL instructions with animations.
                    You can also <Link to="/learn">learn interactively</Link> or <Link to="/camera">practice with your camera</Link>.
                </p>
            </div>
            <button className="onboarding-callout__close" onClick={dismiss} aria-label="Dismiss">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
        </div>
    );
};

// ─── Learn progress summary ──────────────────────────────────────
const LearnProgressCard: React.FC = () => {
    const [stats] = useState(() => storage.getLearningStats());
    if (stats.totalXP === 0) return null;

    return (
        <Link to="/learn" className="learn-progress" aria-label="Continue learning">
            <div className="learn-progress__stats">
                <div className="learn-progress__stat">
                    <span className="learn-progress__value">{stats.streak}</span>
                    <span className="learn-progress__label">Day Streak</span>
                </div>
                <div className="learn-progress__stat">
                    <span className="learn-progress__value">{stats.level}</span>
                    <span className="learn-progress__label">Level</span>
                </div>
                <div className="learn-progress__stat">
                    <span className="learn-progress__value">{stats.totalXP}</span>
                    <span className="learn-progress__label">XP</span>
                </div>
            </div>
            <span className="learn-progress__cta">Continue Learning &rarr;</span>
        </Link>
    );
};

// ─── Quick-try chips ─────────────────────────────────────────────
const QUICK_TRIES = ['Hello', 'Thank you', 'I love you', 'How are you', 'My name is'];

// ─── Main component ─────────────────────────────────────────────
export const DictionaryPage: React.FC = () => {
    const { customApiKey, addToHistory } = useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingHint, setLoadingHint] = useState<string | null>(null);
    const loadingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [result, setResult] = useState<TranslateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorReported, setErrorReported] = useState(false);
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [selectedRating, setSelectedRating] = useState<'up' | 'down' | null>(null);
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    // Capture initial ?q= before any renders so the effect dep stays stable
    const initialQueryRef = useRef(searchParams.get('q'));

    useEffect(() => {
        setCustomApiKey(customApiKey);
    }, [customApiKey]);

    useEffect(() => {
        const cleanup = print.setupPrintListeners();
        return cleanup;
    }, []);

    const clearLoadingTimers = () => {
        loadingTimersRef.current.forEach(clearTimeout);
        loadingTimersRef.current = [];
        setLoadingHint(null);
    };

    const handleSearch = useCallback(async (query: string) => {
        // Abort any in-flight request
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Optimistic cache check — skip the API call entirely if we already have this result
        const cacheKey = `asl_result:${query.toLowerCase().trim()}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                setResult(JSON.parse(cached));
                setError(null);
                setSearchParams({ q: query }, { replace: true });
                return;
            } catch { /* corrupt cache entry — fall through to API */ }
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        clearLoadingTimers();
        loadingTimersRef.current = [
            setTimeout(() => setLoadingHint('Taking a bit longer than usual…'), 4000),
            setTimeout(() => setLoadingHint('The AI is busy — retrying in the background. Hang tight!'), 8000),
            setTimeout(() => setLoadingHint('Still working on it. Thanks for your patience.'), 14000),
        ];

        // Keep the query in the URL so results are shareable and indexable
        setSearchParams({ q: query }, { replace: true });

        announceToScreenReader('Searching for ASL translation', 'polite');
        addToHistory(query);

        try {
            const response = await translateToASL(query, controller.signal);
            setResult(response);
            try { sessionStorage.setItem(cacheKey, JSON.stringify(response)); } catch { /* ignore quota errors */ }
            announceToScreenReader(`Found ${response.signs.length} signs for ${query}`, 'polite');
        } catch (err) {
            if (err instanceof Error && err.message === 'cancelled') return;
            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);
            setErrorReported(false);
            // Start rate-limit countdown if seconds are encoded in the error
            const rlMatch = errorMessage.match(/^rate_limit:(\d+):/);
            if (rlMatch) {
                const secs = parseInt(rlMatch[1], 10);
                setRateLimitCountdown(secs);
                if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = setInterval(() => {
                    setRateLimitCountdown(prev => {
                        if (prev <= 1) { clearInterval(countdownTimerRef.current!); return 0; }
                        return prev - 1;
                    });
                }, 1000);
            }
            announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
        } finally {
            setIsLoading(false);
            clearLoadingTimers();
        }
    }, [addToHistory, setSearchParams]);

    // On load with ?q=: restore from sessionStorage cache to avoid re-calling the API on refresh
    useEffect(() => {
        const q = initialQueryRef.current;
        if (!q) return;
        const cached = sessionStorage.getItem(`asl_result:${q.toLowerCase().trim()}`);
        if (cached) {
            try {
                setResult(JSON.parse(cached));
                return;
            } catch { /* fall through to API call */ }
        }
        handleSearch(q);
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

    const showLanding = !result && !isLoading && !error;

    // Follow-up suggestions
    const followUps = result
        ? getFollowUpSuggestions(result.query, result.signs.map(s => s.word))
        : [];

    return (
        <div className="dictionary-page">
            <RateLimitBanner customApiKey={customApiKey} />

            <section className="dictionary-page__search" aria-label="Search for ASL translations">
                <h1 className="dictionary-page__title">
                    Let's sign<br/><span className="dictionary-page__title-accent">something today.</span>
                </h1>
                <SearchBar onSearch={handleSearch} isLoading={isLoading} />
                <SearchHistory onSelectQuery={handleSearch} />
            </section>

            {/* ─── Landing content ─── */}
            {showLanding && (
                <>
                    <OnboardingCallout />

                    <section className="quick-tries" aria-label="Try these phrases">
                        <p className="quick-tries__label">Try these</p>
                        <div className="quick-tries__chips">
                            {QUICK_TRIES.map(phrase => (
                                <button
                                    key={phrase}
                                    className="quick-tries__chip"
                                    onClick={() => handleSearch(phrase)}
                                >
                                    {phrase}
                                </button>
                            ))}
                        </div>
                    </section>

                    <LearnProgressCard />

                    {/* Feature cards (only if no learn progress — replaced by progress card above) */}
                    {storage.getLearningStats().totalXP === 0 && (
                        <section className="feature-cards" aria-label="Explore features">
                            <Link to="/learn" className="feature-card feature-card--learn">
                                <div className="feature-card__icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M12 14L9 5L6 14M12 14L9 5M12 14H6M19 14L16 5L13 14M19 14L16 5M19 14H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </div>
                                <div className="feature-card__content">
                                    <h3 className="feature-card__title">Learn Signs</h3>
                                    <p className="feature-card__desc">Practice with animated sign demos across 10 levels, Duolingo-style</p>
                                </div>
                                <span className="feature-card__arrow" aria-hidden="true">&rarr;</span>
                            </Link>

                            <Link to="/camera" className="feature-card feature-card--camera">
                                <div className="feature-card__icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                                    </svg>
                                </div>
                                <div className="feature-card__content">
                                    <h3 className="feature-card__title">Live Camera</h3>
                                    <p className="feature-card__desc">Use your webcam to practice fingerspelling with real-time recognition</p>
                                </div>
                                <span className="feature-card__arrow" aria-hidden="true">&rarr;</span>
                            </Link>
                        </section>
                    )}

                    <section className="sign-categories" aria-label="Browse by category">
                        <h2 className="sign-categories__title">Browse by Category</h2>
                        <div className="sign-categories__grid">
                            <button className="category-card" onClick={() => handleSearch('Hello')}>
                                <span className="category-card__emoji">👋</span>
                                <span className="category-card__name">Greetings</span>
                                <span className="category-card__count">8 signs</span>
                            </button>
                            <button className="category-card" onClick={() => handleSearch('Happy')}>
                                <span className="category-card__emoji">😊</span>
                                <span className="category-card__name">Feelings</span>
                                <span className="category-card__count">7 signs</span>
                            </button>
                            <button className="category-card" onClick={() => handleSearch('Mother')}>
                                <span className="category-card__emoji">👨‍👩‍👧</span>
                                <span className="category-card__name">Family</span>
                                <span className="category-card__count">5 signs</span>
                            </button>
                            <button className="category-card" onClick={() => handleSearch('Where')}>
                                <span className="category-card__emoji">❓</span>
                                <span className="category-card__name">Questions</span>
                                <span className="category-card__count">6 signs</span>
                            </button>
                        </div>
                    </section>
                </>
            )}

            {isLoading && (
                <section aria-label="Loading results">
                    <LoadingState />
                    {loadingHint && (
                        <p className="loading-hint" role="status" aria-live="polite">
                            {loadingHint}
                        </p>
                    )}
                    <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                        <button
                            className="loading-cancel"
                            onClick={() => { abortControllerRef.current?.abort(); setIsLoading(false); clearLoadingTimers(); }}
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            )}

            {error && (() => {
                const isAiBusy = error.startsWith('ai_busy:');
                const isRateLimit = error.startsWith('rate_limit:');
                const isNetwork = error.startsWith('network:');
                // Strip type prefix and optional seconds: "rate_limit:60: msg" or "ai_busy: msg"
                const displayMessage = error.replace(/^[a-z_]+:\d*:\s*/, '').replace(/^[a-z_]+:\s*/, '');
                const title = isAiBusy ? 'AI service is busy'
                    : isRateLimit ? 'Too many requests'
                    : isNetwork ? 'Connection problem'
                    : 'Something went wrong';

                const currentQuery = searchParams.get('q') || '';
                const canRetry = isAiBusy || isNetwork;
                const retryDisabled = isRateLimit && rateLimitCountdown > 0;

                const handleReportError = async () => {
                    try {
                        await submitGeneralFeedback({
                            category: 'bug',
                            feedback_text: `Error during translation${currentQuery ? ` for "${currentQuery}"` : ''}: ${displayMessage}`,
                        });
                        setErrorReported(true);
                    } catch {
                        // silently ignore — reporting errors shouldn't cause more errors
                    }
                };

                return (
                    <section aria-label="Error message">
                        <div className="error-card" role="alert">
                            <p className="error-card__title">{title}</p>
                            <p className="error-card__text">{displayMessage}</p>
                            {isRateLimit && rateLimitCountdown > 0 && (
                                <p className="error-card__hint">
                                    You can try again in <strong>{rateLimitCountdown}s</strong>.
                                </p>
                            )}
                            {!customApiKey && !isAiBusy && !isRateLimit && !isNetwork && (
                                <p className="error-card__hint">
                                    You may need a Google Gemini API key. Click the key icon in the header to add one.
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                <button
                                    className="error-card__retry"
                                    disabled={retryDisabled}
                                    onClick={() => {
                                        setError(null);
                                        if (canRetry && currentQuery) handleSearch(currentQuery);
                                    }}
                                >
                                    {retryDisabled ? `Try again in ${rateLimitCountdown}s` : 'Try Again'}
                                </button>
                                {!isAiBusy && !isRateLimit && !isNetwork && (
                                    errorReported
                                        ? <span className="error-card__hint" style={{ alignSelf: 'center' }}>Thanks for reporting!</span>
                                        : <button className="error-card__secondary" onClick={handleReportError}>
                                            Report this error
                                          </button>
                                )}
                            </div>
                        </div>
                    </section>
                );
            })()}

            {result && !isLoading && (
                <section
                    className="dictionary-page__results"
                    aria-label="Translation results"
                    data-print-date={print.getFormattedDate()}
                >
                    <div className="results-header">
                        <h2 className="results-header__title">
                            ASL Signs for &ldquo;{result.query}&rdquo;
                        </h2>
                            <p className="results-header__count" aria-live="polite">
                            {result.signs.length} {result.signs.length === 1 ? 'sign' : 'signs'}
                        </p>
                        <p className="results-header__disclaimer">
                            AI generated · verify with a native signer or <a href="https://www.lifeprint.com" target="_blank" rel="noopener noreferrer">ASL resource</a>
                        </p>
                    </div>

                    {result.asl_gloss_order && (
                        <GlossBar gloss={result.asl_gloss_order} query={result.query} />
                    )}

                    <ActionButtons query={result.query} signsCount={result.signs.length} />

                    {/* Two-column: sign cards left, animation right (sticky ends when grid ends) */}
                    <div className="results-columns">
                        <div className="results-left">
                            <div className="signs-list">
                                {result.signs.map((sign, index) => (
                                    <SignCard key={`${sign.word}-${index}`} sign={sign} index={index} />
                                ))}
                            </div>
                        </div>

                        {/* Sticky animation — stops at grid boundary */}
                        <div className="results-right">
                            <SentenceAnimator words={result.signs.map(s => ({
                                word: s.word.toLowerCase().replace(/\s+/g, '_'),
                                isFingerspelled: !!s.is_fingerspelled,
                            }))} />
                        </div>
                    </div>

                    {/* Full-width below grid: grammar notes, then try-next + feedback row */}
                    {result.note && (
                        <div className="grammar-note">
                            <h3 className="grammar-note__title">Grammar Notes</h3>
                            <p className="grammar-note__text">{result.note}</p>
                        </div>
                    )}

                    <div className="results-footer">
                        {followUps.length > 0 && (
                            <section className="follow-up" aria-label="Try next">
                                <p className="follow-up__label">Try next</p>
                                <div className="follow-up__chips">
                                    {followUps.map(phrase => (
                                        <button
                                            key={phrase}
                                            className="quick-tries__chip"
                                            onClick={() => handleSearch(phrase)}
                                        >
                                            {phrase}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                        <button
                            className="practice-cta"
                            onClick={() => {
                                const words = result.signs.map(s =>
                                    s.word.toLowerCase().replace(/[\s-]+/g, '_')
                                );
                                try { sessionStorage.setItem('asl_practice_words', JSON.stringify(words)); } catch { /* ignore */ }
                                navigate('/learn?practice=1');
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 14L9 5L6 14M12 14H6M19 14L16 5L13 14M19 14H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            Practice these signs
                        </button>
                        <FeedbackWidget onFeedbackClick={handleFeedbackClick} />
                    </div>
                </section>
            )}

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
        </div>
    );
};

export default DictionaryPage;
