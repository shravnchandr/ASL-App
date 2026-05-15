import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignAnimator } from './learn/SignAnimator';
import { storage } from '../utils/storage';
import { loadSignData } from '../utils/signDataLoader';
import { getSignOfTheDay } from '../utils/signOfTheDay';
import { formatSignName } from '../utils/format';
import { LEVELS } from '../constants/levels';
import { useApp } from '../contexts/AppContext';
import type { SignData } from '../types';
import './HomePage.css';

function getLevelMastery(levelId: number): number {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return 0;
    const progress = storage.getLearningProgress();
    const masteries = level.signs.map(s => progress[s]?.mastery ?? 0);
    if (masteries.length === 0) return 0;
    return Math.round(masteries.reduce((a, b) => a + b, 0) / masteries.length);
}

function getReviewDueForLevel(levelId: number): number {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return 0;
    const due = new Set(storage.getSignsDueForReview());
    return level.signs.filter(s => due.has(s)).length;
}

function getTotalReviewDue(): number {
    return storage.getSignsDueForReview().length;
}

function getTotalSignsLearned(): number {
    const progress = storage.getLearningProgress();
    return Object.values(progress).filter(p => p.mastery > 0).length;
}

const SignOfDayHero: React.FC<{ onSearch: (q: string) => void }> = ({ onSearch }) => {
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
        <section className="home-sotd" aria-label="Sign of the day">
            <div className="home-sotd__text">
                <div className="home-sotd__eyebrow">SIGN OF THE DAY · GREETING</div>
                <div className="home-sotd__word">{formatSignName(sign)}.</div>
                <p className="home-sotd__desc">
                    Salute by your forehead, then move outward — like waving a friend over.
                </p>
                <div className="home-sotd__actions">
                    {data && (
                        <button className="home-sotd__play-btn" onClick={() => setIsPlaying(p => !p)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                {isPlaying
                                    ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                    : <path d="M8 5v14l11-7z" />}
                            </svg>
                            {isPlaying ? 'Pause' : 'Watch & try'}
                        </button>
                    )}
                    <button
                        className="home-sotd__more-btn"
                        onClick={() => onSearch(formatSignName(sign))}
                    >
                        More {formatSignName(sign).toLowerCase()}s
                    </button>
                </div>
            </div>
            {data && (
                <div className="home-sotd__anim" aria-hidden="true">
                    <SignAnimator signData={data} isPlaying={isPlaying} playbackSpeed={0.8} size="small" />
                </div>
            )}
        </section>
    );
};

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const { searchHistory } = useApp();
    const stats = storage.getLearningStats();
    const levelProgress = storage.getLevelProgress();
    const currentLevel = LEVELS.find(l => l.id === levelProgress.currentLevel) ?? LEVELS[0];
    const mastery = getLevelMastery(currentLevel.id);
    const reviewDueCurrentLevel = getReviewDueForLevel(currentLevel.id);
    const totalReviewDue = getTotalReviewDue();
    const totalSignsLearned = getTotalSignsLearned();
    const hasProgress = stats.totalXP > 0;

    const handleSearch = (q: string) => navigate(`/dictionary?q=${encodeURIComponent(q)}`);

    const recentSearches = searchHistory.slice(0, 4);

    return (
        <div className="home-page">
            <div className="home-page__top">
                <SignOfDayHero onSearch={handleSearch} />

                {hasProgress ? (
                    <aside className="home-resume">
                        <div className="home-resume__eyebrow">WELCOME BACK</div>
                        <h2 className="home-resume__title">Pick up where you left off.</h2>

                        <Link to="/learn" className="home-resume__lesson-card">
                            <div
                                className="home-resume__lesson-badge"
                                style={{ background: `var(--md-sys-color-secondary)`, color: `var(--md-sys-color-on-secondary)` }}
                            >
                                {currentLevel.id}
                            </div>
                            <div className="home-resume__lesson-info">
                                <div className="home-resume__lesson-name">
                                    {currentLevel.name} · Lesson {currentLevel.id}
                                </div>
                                <div className="home-resume__lesson-meta">
                                    5 min · {mastery}% mastered · 80% to unlock {currentLevel.name}
                                </div>
                            </div>
                            <button className="home-resume__resume-btn" tabIndex={-1} aria-hidden="true">
                                Resume
                            </button>
                        </Link>

                        {totalReviewDue > 0 && (
                            <Link to="/learn" className="home-resume__review-card">
                                <div className="home-resume__review-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                    </svg>
                                </div>
                                <div className="home-resume__review-info">
                                    <div className="home-resume__review-count">
                                        {totalReviewDue} sign{totalReviewDue !== 1 ? 's' : ''} due for review
                                        {reviewDueCurrentLevel > 0 && ` (${reviewDueCurrentLevel} in current level)`}
                                    </div>
                                    <div className="home-resume__review-sub">SM-2 spaced repetition</div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </Link>
                        )}
                    </aside>
                ) : (
                    <aside className="home-resume home-resume--empty">
                        <div className="home-resume__eyebrow">GET STARTED</div>
                        <h2 className="home-resume__title">Start learning ASL today.</h2>
                        <p className="home-resume__empty-desc">
                            Work through 10 levels, 100 signs, with spaced repetition tracking your progress.
                        </p>
                        <Link to="/learn" className="home-resume__start-btn">
                            Start Level 1 →
                        </Link>
                    </aside>
                )}
            </div>

            <section className="home-tools" aria-label="Quick tools">
                <h2 className="home-tools__title">Quick tools</h2>
                <div className="home-tools__grid">
                    <Link to="/dictionary" className="home-tool-card home-tool-card--blue">
                        <div className="home-tool-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                        </div>
                        <div className="home-tool-card__label">Look up a sign</div>
                        <div className="home-tool-card__sub">AI breakdown, audio in</div>
                    </Link>

                    <Link to="/camera" className="home-tool-card home-tool-card--coral">
                        <div className="home-tool-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                        </div>
                        <div className="home-tool-card__label">Camera practice</div>
                        <div className="home-tool-card__sub">36-class fingerspelling</div>
                    </Link>

                    <Link to="/learn?browse=1" className="home-tool-card home-tool-card--green">
                        <div className="home-tool-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                            </svg>
                        </div>
                        <div className="home-tool-card__label">Browse library</div>
                        <div className="home-tool-card__sub">100 verified signs</div>
                    </Link>

                    <Link to="/learn" className="home-tool-card home-tool-card--red">
                        <div className="home-tool-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <path d="M18 20V10M12 20V4M6 20v-6" />
                            </svg>
                        </div>
                        <div className="home-tool-card__label">Daily review</div>
                        <div className="home-tool-card__sub">
                            {totalReviewDue > 0 ? `${totalReviewDue} due now` : 'All caught up'}
                        </div>
                    </Link>
                </div>
            </section>

            <div className="home-page__bottom">
                {recentSearches.length > 0 && (
                    <section className="home-recent" aria-label="Recent searches">
                        <div className="home-recent__header">
                            <h2 className="home-recent__title">Recent searches</h2>
                            <Link to="/dictionary" className="home-recent__view-all">View all</Link>
                        </div>
                        <ul className="home-recent__list">
                            {recentSearches.map((q, i) => (
                                <li key={i}>
                                    <button
                                        className="home-recent__item"
                                        onClick={() => handleSearch(q)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                            <circle cx="11" cy="11" r="8" />
                                            <path d="M21 21l-4.35-4.35" />
                                        </svg>
                                        <span>{q}</span>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="home-recent__arrow" aria-hidden="true">
                                            <path d="M9 18l6-6-6-6" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {hasProgress && (
                    <section className="home-progress" aria-label="Your progress">
                        <h2 className="home-progress__title">Your progress</h2>
                        <div className="home-progress__stats">
                            <div className="home-progress__stat home-progress__stat--streak">
                                <div className="home-progress__stat-value">{stats.streak}</div>
                                <div className="home-progress__stat-label">Day streak</div>
                            </div>
                            <div className="home-progress__stat home-progress__stat--signs">
                                <div className="home-progress__stat-value">{totalSignsLearned}</div>
                                <div className="home-progress__stat-label">Signs learned</div>
                            </div>
                            <div className="home-progress__stat home-progress__stat--xp">
                                <div className="home-progress__stat-value">{stats.totalXP}</div>
                                <div className="home-progress__stat-label">XP this week</div>
                            </div>
                        </div>
                        <div className="home-progress__level-row">
                            <span className="home-progress__level-name">{currentLevel.name} · Lv {currentLevel.id}</span>
                            <span className="home-progress__level-pct">{mastery}%</span>
                        </div>
                        <div className="home-progress__bar">
                            <div className="home-progress__bar-fill" style={{ width: `${mastery}%` }} />
                        </div>
                    </section>
                )}

                {recentSearches.length === 0 && !hasProgress && (
                    <section className="home-quicktry" aria-label="Try a translation">
                        <h2 className="home-quicktry__title">Try translating</h2>
                        <div className="home-quicktry__chips">
                            {['Hello', 'Thank you', 'I love you', 'How are you', 'My name is'].map(q => (
                                <button key={q} className="home-quicktry__chip" onClick={() => handleSearch(q)}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default HomePage;
