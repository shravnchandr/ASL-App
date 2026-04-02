/**
 * DictionaryPage Component
 * Search for ASL translations — the primary app feature
 * Landing page with Sign of the Day, progress summary, onboarding, and categories
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { SignCard } from './SignCard';
import { FeedbackWidget } from './FeedbackWidget';
import { FeedbackModal } from './FeedbackModal';
import { LoadingState } from './LoadingState';
import { SearchHistory } from './features/SearchHistory';
import { ActionButtons } from './features/ActionButtons';
import { RateLimitBanner } from './features/RateLimitBanner';
import { SignAnimator } from './learn/SignAnimator';
import { SentenceAnimator } from './SentenceAnimator';
import { translateToASL, submitFeedback, setCustomApiKey } from '../services/api';
import { announceToScreenReader } from '../utils/accessibility';
import { print } from '../utils/print';
import { useApp } from '../contexts/AppContext';
import { storage } from '../utils/storage';
import { loadSignData } from '../utils/signDataLoader';
import { getSignOfTheDay } from '../utils/signOfTheDay';
import { formatSignName } from '../utils/format';
import { LEVELS } from '../constants/levels';
import type { TranslateResponse, SignData } from '../types';
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
const GlossBar: React.FC<{ gloss: string }> = ({ gloss }) => {
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
        <div className="gloss-bar" aria-label="ASL gloss order">
            <span className="gloss-bar__label">Gloss</span>
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
    );
};

// ─── Sign of the Day ─────────────────────────────────────────────
const SignOfTheDay: React.FC<{ onSearch: (q: string) => void }> = ({ onSearch }) => {
    const [sign, setSign] = useState<string | null>(null);
    const [data, setData] = useState<SignData | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getSignOfTheDay().then(async s => {
            if (cancelled || !s) return;
            setSign(s);
            const d = await loadSignData(s);
            if (!cancelled) setData(d);
        });
        return () => { cancelled = true; };
    }, []);

    if (!sign) return null;

    return (
        <section className="sign-of-day" aria-label="Sign of the day">
            <div className="sign-of-day__header">
                <span className="sign-of-day__badge">Sign of the Day</span>
            </div>
            <div className="sign-of-day__content">
                {data && (
                    <div className="sign-of-day__anim">
                        <SignAnimator signData={data} isPlaying={isPlaying} playbackSpeed={0.8} size="small" />
                    </div>
                )}
                <div className="sign-of-day__info">
                    <h3 className="sign-of-day__name">{formatSignName(sign)}</h3>
                    <div className="sign-of-day__actions">
                        {data && (
                            <button className="sign-of-day__play" onClick={() => setIsPlaying(p => !p)}>
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>
                        )}
                        <button className="sign-of-day__search" onClick={() => onSearch(formatSignName(sign))}>
                            Translate
                        </button>
                    </div>
                </div>
            </div>
        </section>
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
    const [searchParams, setSearchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<TranslateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
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

    const handleSearch = useCallback(async (query: string) => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        // Keep the query in the URL so results are shareable and indexable
        setSearchParams({ q: query }, { replace: true });

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
    }, [addToHistory, setSearchParams]);

    // Auto-search when the page loads with a ?q= param (e.g. from a shared link)
    useEffect(() => {
        if (initialQueryRef.current) {
            handleSearch(initialQueryRef.current);
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

    const showLanding = !result && !isLoading && !error;

    // Follow-up suggestions
    const followUps = result
        ? getFollowUpSuggestions(result.query, result.signs.map(s => s.word))
        : [];

    return (
        <div className="dictionary-page">
            <RateLimitBanner customApiKey={customApiKey} />

            <section className="dictionary-page__search" aria-label="Search for ASL translations">
                <h1 className="dictionary-page__title">Text to Signs</h1>
                <p className="dictionary-page__subtitle">
                    Enter any English phrase to get ASL sign-by-sign instructions
                </p>
                <SearchBar onSearch={handleSearch} isLoading={isLoading} />
                <SearchHistory onSelectQuery={handleSearch} />
            </section>

            {/* ─── Landing content ─── */}
            {showLanding && (
                <>
                    <OnboardingCallout />

                    <SignOfTheDay onSearch={handleSearch} />

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
                </section>
            )}

            {error && (
                <section aria-label="Error message">
                    <div className="error-card" role="alert">
                        <p className="error-card__title">Something went wrong</p>
                        <p className="error-card__text">{error}</p>
                        {!customApiKey && (
                            <p className="error-card__hint">
                                You may need a Google Gemini API key. Click the key icon in the header to add one.
                            </p>
                        )}
                        <button className="error-card__retry" onClick={() => setError(null)}>
                            Try Again
                        </button>
                    </div>
                </section>
            )}

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
                    </div>

                    {result.asl_gloss_order && (
                        <GlossBar gloss={result.asl_gloss_order} />
                    )}

                    <ActionButtons query={result.query} signsCount={result.signs.length} />

                    {/* Sentence-level animation */}
                    {result.signs.length > 1 && (
                        <SentenceAnimator words={result.signs.map(s => ({
                            word: s.word.toLowerCase().replace(/\s+/g, '_'),
                            isFingerspelled: !!s.is_fingerspelled,
                        }))} />
                    )}

                    <div className="signs-list">
                        {result.signs.map((sign, index) => (
                            <SignCard key={`${sign.word}-${index}`} sign={sign} index={index} />
                        ))}
                    </div>

                    {result.note && (
                        <div className="grammar-note">
                            <h3 className="grammar-note__title">Grammar Notes</h3>
                            <p className="grammar-note__text">{result.note}</p>
                        </div>
                    )}

                    <FeedbackWidget onFeedbackClick={handleFeedbackClick} />

                    {/* Follow-up suggestions (Feature 4) */}
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
