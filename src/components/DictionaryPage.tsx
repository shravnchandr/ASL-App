import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { SignCard } from './SignCard';
import { FeedbackWidget } from './FeedbackWidget';
import { FeedbackModal } from './FeedbackModal';
import { ActionButtons } from './features/ActionButtons';
import { RateLimitBanner } from './features/RateLimitBanner';
import { SentenceAnimator } from './SentenceAnimator';
import { setCustomApiKey } from '../services/api/client';
import { translateToASL } from '../services/api/translate';
import { submitFeedback, submitGeneralFeedback } from '../services/api/feedback';
import { announceToScreenReader } from '../utils/accessibility';
import { print } from '../utils/print';
import { useApp } from '../contexts/AppContext';
import { formatSignName } from '../utils/format';
import { LEVELS } from '../constants/levels';
import type { TranslateResponse } from '../types';
import './DictionaryPage.css';

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

const GlossBar: React.FC<{ gloss: string; query: string }> = ({ gloss }) => {
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
            <span className="gloss-bar__lang-label">ASL ORDER</span>
            <span className="gloss-bar__sequence">
                {tokens.map((token, i) => (
                    <span
                        key={i}
                        className={`gloss-token ${token.toLowerCase().startsWith('fs-') ? 'gloss-token--fs' : ''}`}
                    >
                        <span className="gloss-token__num">{String(i + 1).padStart(2, '0')}</span>
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



const QUICK_TRIES = [
    'Good morning, how are you?',
    'Where is the bathroom?',
    'Thank you so much for your help.',
    'My name is Alex, nice to meet you.',
    'Can you sign slower, please?',
];

const RECENT_TRANSLATIONS = [
    { phrase: "What's your favorite food?", signs: 5, date: '3 days ago' },
    { phrase: 'I am learning sign language.', signs: 5, date: '1 week ago' },
    { phrase: 'Where do you work?', signs: 4, date: '1 week ago' },
];

const TranslateLanding: React.FC<{
    isLoading: boolean;
    onSearch: (query: string) => void;
}> = ({ isLoading, onSearch }) => {
    const [draft, setDraft] = useState('');
    const charCount = draft.length;
    const canSubmit = draft.trim().length > 0 && !isLoading;

    const submit = () => {
        const value = draft.trim();
        if (!value || isLoading) return;
        onSearch(value);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setDraft(text.slice(0, 300));
        } catch {
            // Browser denied clipboard access; leave the composer unchanged.
        }
    };

    return (
        <section className="translate-landing" aria-label="Translate English to ASL">
            <div className="translate-hero">
                <div className="translate-hero__eyebrow">
                    <span aria-hidden="true" /> ENGLISH → ASL
                </div>
                <h1 className="translate-hero__title">
                    What would you like to <em>sign?</em>
                </h1>
                <p className="translate-hero__sub">
                    Type any English phrase. We'll convert it to ASL gloss order and show you each sign
                    with a verified breakdown.
                </p>
            </div>

            <div className="translate-composer">
                <textarea
                    value={draft}
                    onChange={event => setDraft(event.target.value.slice(0, 300))}
                    onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="Type a phrase..."
                    aria-label="Phrase to translate"
                    maxLength={300}
                    disabled={isLoading}
                />
                <div className="translate-composer__bar">
                    <button type="button" onClick={handlePaste}>
                        <span aria-hidden="true">+</span>
                        Paste
                    </button>
                    <button type="button" onClick={() => setDraft('Good morning, how are you?')}>
                        <span aria-hidden="true">▣</span>
                        From a saved phrase
                    </button>
                    <span className="translate-composer__count">{charCount} / 300 chars</span>
                    <span className="translate-composer__shortcut">Press <kbd>↵</kbd> to translate</span>
                    <button
                        type="button"
                        className="translate-composer__submit"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {isLoading ? 'Translating…' : 'Translate'}
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>

            <div className="translate-tries" aria-label="Try one">
                <div className="translate-tries__label">TRY ONE</div>
                <div className="translate-tries__chips">
                    {QUICK_TRIES.map(phrase => (
                        <button key={phrase} onClick={() => onSearch(phrase)} disabled={isLoading}>
                            <span aria-hidden="true">"</span>
                            {phrase}
                            <span aria-hidden="true">"</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="translate-info-grid">
                <section className="translate-card translate-recent" aria-label="Recent translations">
                    <header>
                        <h2>Recent translations</h2>
                        <Link to="/translate">Open library</Link>
                    </header>
                    <div className="translate-recent__rows">
                        {RECENT_TRANSLATIONS.map(row => (
                            <button key={row.phrase} onClick={() => onSearch(row.phrase)} disabled={isLoading}>
                                <strong>"{row.phrase}"</strong>
                                <span>{row.signs} signs</span>
                                <span>{row.date}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="translate-card translate-steps" aria-label="How this works">
                    <h2>How this works</h2>
                    {[
                        ['01', 'Grammar pass', 'A grammar agent rewrites English into ASL gloss — topic-comment order, time before topic, no articles.'],
                        ['02', 'Sign lookup', 'Each gloss is matched against 100 verified Lifeprint entries. Anything missing is generated by AI and clearly marked.'],
                        ['03', 'Animation', 'Stick-figure animations show the handshape, location, and movement of every sign — loop and slow them as you watch.'],
                    ].map(([n, title, text]) => (
                        <div className="translate-step" key={n}>
                            <span>{n}</span>
                            <div>
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </div>
                        </div>
                    ))}
                </section>
            </div>

            <section className="translate-privacy" aria-label="Privacy">
                <div className="translate-privacy__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <div>
                    <h2>Everything stays on your device.</h2>
                    <p>Translations are processed locally. Phrases you save sync only if you turn on sync in settings.</p>
                </div>
                <Link to="/onboarding">Learn more →</Link>
            </section>
        </section>
    );
};

const PIPELINE_STEPS = [
    { label: 'Parsing English',      desc: 'Tokenizing and tagging parts of speech' },
    { label: 'ASL grammar pass',     desc: 'Reordering to topic–comment, dropping articles' },
    { label: 'Sign lookup',          desc: 'Matching gloss against the verified knowledge base' },
    { label: 'Building animations',  desc: 'Assembling handshape, location and movement' },
];

// Advance timings match typical backend latency breakdown
const STEP_TIMINGS = [0, 800, 1700, 2700];

const TranslateLoadingView: React.FC<{
    phrase: string;
    onCancel: () => void;
    hint: string | null;
}> = ({ phrase, onCancel, hint }) => {
    const [activeStep, setActiveStep] = React.useState(0);
    const [tick, setTick] = React.useState(0);

    // Spinner rotation
    React.useEffect(() => {
        let raf: number;
        let start: number | null = null;
        const loop = (ts: number) => {
            if (!start) start = ts;
            setTick(((ts - start) % 1400) / 1400);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Advance pipeline steps
    React.useEffect(() => {
        const timers = STEP_TIMINGS.slice(1).map((delay, i) =>
            setTimeout(() => setActiveStep(i + 1), delay)
        );
        return () => timers.forEach(clearTimeout);
    }, []);

    const tokenCount = Math.max(3, Math.min(6, phrase.trim().split(/\s+/).length));
    const spinAngle = Math.round(tick * 360);
    const spR = 5.5, spC = 2 * Math.PI * spR, spDash = spC * 0.3;

    return (
        <section className="tl-view" aria-label="Translating">
            {/* ── Phrase header card ─────────────────────────── */}
            <div className="tl-phrase-card">
                <div className="tl-phrase-card__top">
                    <div className="tl-phrase-card__english">
                        <div className="tl-phrase-card__lang">ENGLISH</div>
                        <div className="tl-phrase-card__query">&ldquo;{phrase}&rdquo;</div>
                    </div>
                    <div className="tl-translating-pill" aria-live="polite">
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
                            style={{ transform: `rotate(${spinAngle}deg)` }}>
                            <circle cx="8" cy="8" r={spR} fill="none"
                                stroke="var(--md-sys-color-primary-container)" strokeWidth="2"/>
                            <circle cx="8" cy="8" r={spR} fill="none"
                                stroke="var(--md-sys-color-primary)" strokeWidth="2"
                                strokeDasharray={`${spDash} ${spC}`} strokeLinecap="round"/>
                        </svg>
                        Translating…
                    </div>
                </div>
                <div className="tl-phrase-card__divider" />
                <div className="tl-gloss-row">
                    <span className="tl-gloss-row__label">ASL GLOSS</span>
                    {Array.from({ length: tokenCount }).map((_, i) => (
                        <div key={i} className={`tl-gloss-skel ${activeStep >= 1 ? 'tl-gloss-skel--lit' : ''}`}
                            style={{ width: [68, 84, 56, 72, 60, 78][i % 6],
                                animationDelay: `${i * 0.08}s` }} />
                    ))}
                </div>
            </div>

            {/* ── Two columns ────────────────────────────────── */}
            <div className="tl-columns">
                {/* Left: skeleton sign cards */}
                <div className="tl-skels">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="tl-skel-card">
                            <div className="tl-skel-card__thumb">
                                <div className="tl-skel-block tl-skel-block--thumb"
                                    style={{ animationDelay: `${i * 0.1}s` }} />
                            </div>
                            <div className="tl-skel-card__body">
                                <div className="tl-skel-row">
                                    <div className="tl-skel-block" style={{ width: 56, height: 11, animationDelay: `${i * 0.1}s` }} />
                                    <div className="tl-skel-block" style={{ width: 64, height: 18, borderRadius: 999, animationDelay: `${i * 0.1 + 0.05}s` }} />
                                </div>
                                <div className="tl-skel-block" style={{ width: 120, height: 22, animationDelay: `${i * 0.1}s` }} />
                                <div className="tl-skel-block" style={{ width: '100%', height: 11, animationDelay: `${i * 0.1 + 0.1}s` }} />
                                <div className="tl-skel-block" style={{ width: '82%', height: 11, animationDelay: `${i * 0.1 + 0.15}s` }} />
                                <div className="tl-skel-row">
                                    {[84, 84, 84].map((w, j) => (
                                        <div key={j} className="tl-skel-block" style={{ width: w, height: 10, animationDelay: `${i * 0.1 + 0.2 + j * 0.05}s` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right: pipeline card */}
                <div className="tl-pipeline-wrap">
                    <div className="tl-pipeline-card">
                        <div className="tl-pipeline-card__header">
                            <span className="tl-pipeline-card__title">Two-agent pipeline</span>
                            <span className="tl-pipeline-card__counter">{Math.min(activeStep + 1, 4)} / 4</span>
                        </div>

                        <div className="tl-steps">
                            {PIPELINE_STEPS.map((step, i) => {
                                const done = i < activeStep;
                                const running = i === activeStep;
                                return (
                                    <div key={i}
                                        className={`tl-step ${running ? 'tl-step--running' : ''}`}
                                        aria-current={running ? 'step' : undefined}>
                                        <div className={`tl-step__icon ${done ? 'tl-step__icon--done' : running ? 'tl-step__icon--running' : ''}`}>
                                            {done ? (
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                    <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="2.8"
                                                        strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            ) : running ? (
                                                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
                                                    style={{ transform: `rotate(${spinAngle}deg)` }}>
                                                    <circle cx="8" cy="8" r="4.5" fill="none"
                                                        stroke="var(--md-sys-color-primary-container)" strokeWidth="2"/>
                                                    <circle cx="8" cy="8" r="4.5" fill="none"
                                                        stroke="var(--md-sys-color-primary)" strokeWidth="2"
                                                        strokeDasharray={`${2*Math.PI*4.5*0.3} ${2*Math.PI*4.5}`} strokeLinecap="round"/>
                                                </svg>
                                            ) : (
                                                <span className="tl-step__num">{i + 1}</span>
                                            )}
                                        </div>
                                        <div className="tl-step__text">
                                            <div className={`tl-step__label ${done || running ? '' : 'tl-step__label--dim'}`}>
                                                {step.label}
                                            </div>
                                            <div className={`tl-step__desc ${done || running ? '' : 'tl-step__desc--dim'}`}>
                                                {step.desc}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="tl-pipeline-card__footer">
                            <span className="tl-pipeline-card__hint">
                                {hint ?? 'Usually under two seconds.'}
                            </span>
                            <button className="tl-cancel-btn" onClick={onCancel}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

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

    // Capture initial ?q= once so the effect dep array stays stable across re-renders
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
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

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

        setSearchParams({ q: query }, { replace: true });

        announceToScreenReader('Searching for ASL translation', 'polite');
        addToHistory(query);

        try {
            const response = await translateToASL(query, controller.signal);
            setResult(response);
            try { sessionStorage.setItem(cacheKey, JSON.stringify(response)); } catch { /* ignore storage quota errors */ }
            announceToScreenReader(`Found ${response.signs.length} signs for ${query}`, 'polite');
        } catch (err) {
            if (err instanceof Error && err.message === 'cancelled') return;
            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);
            setErrorReported(false);
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

    const followUps = result
        ? getFollowUpSuggestions(result.query, result.signs.map(s => s.word))
        : [];

    return (
        <div className="dictionary-page">
            <RateLimitBanner customApiKey={customApiKey} />

            {showLanding && (
                <TranslateLanding isLoading={isLoading} onSearch={handleSearch} />
            )}

            {isLoading && (
                <TranslateLoadingView
                    phrase={searchParams.get('q') || ''}
                    hint={loadingHint}
                    onCancel={() => {
                        abortControllerRef.current?.abort();
                        setIsLoading(false);
                        clearLoadingTimers();
                    }}
                />
            )}

            {error && (() => {
                const isAiBusy = error.startsWith('ai_busy:');
                const isRateLimit = error.startsWith('rate_limit:');
                const isNetwork = error.startsWith('network:');
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
                    <div className="results-phrase-card">
                        <div className="results-phrase-card__top">
                            <div className="results-phrase-card__english">
                                <div className="results-phrase-card__lang">ENGLISH</div>
                                <h2 className="results-phrase-card__query">&ldquo;{result.query}&rdquo;</h2>
                            </div>
                            <div className="results-phrase-card__actions-col">
                                <ActionButtons query={result.query} signsCount={result.signs.length} />
                                <button
                                    className="results-new-search"
                                    onClick={() => { setResult(null); setError(null); setSearchParams({}); }}
                                    aria-label="Start a new search"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                                    </svg>
                                    New search
                                </button>
                            </div>
                        </div>
                        <div className="results-phrase-card__divider" />
                        {result.asl_gloss_order && (
                            <GlossBar gloss={result.asl_gloss_order} query={result.query} />
                        )}
                    </div>

                    <div className="results-columns">
                        <div className="results-left">
                            <div className="signs-list">
                                {result.signs.map((sign, index) => (
                                    <SignCard key={`${sign.word}-${index}`} sign={sign} index={index} totalCount={result.signs.length} />
                                ))}
                            </div>
                        </div>

                        <div className="results-right">
                            <SentenceAnimator words={result.signs.map(s => ({
                                word: s.word.toLowerCase().replace(/\s+/g, '_'),
                                isFingerspelled: !!s.is_fingerspelled,
                            }))} />
                        </div>
                    </div>

                    <p className="results-disclaimer">
                        AI generated · verify with a native signer or <a href="https://www.lifeprint.com" target="_blank" rel="noopener noreferrer">ASL resource</a>
                    </p>

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
