import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { SignAnimator } from './learn/SignAnimator';
import { formatSignName } from '../utils/format';
import type { SignData, SignMetadata, SignMetadataEntry } from '../types';
import { loadSignData } from '../utils/signDataLoader';
import './SignBrowserPage.css';

type CategoryFilter = 'all' | 'alphabet' | 'numbers' | 'months' | 'common' | 'greetings' | 'family' | 'verified';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
    all: 'All signs',
    alphabet: 'A–Z',
    numbers: 'Numbers',
    months: 'Months',
    common: 'Common',
    greetings: 'Greetings',
    family: 'Family',
    verified: 'Verified only',
};

const GREETINGS_SIGNS = new Set(['hello', 'goodbye', 'please', 'thank_you', 'sorry', 'yes', 'good', 'bad']);
const FAMILY_SIGNS = new Set(['mother', 'family', 'friend', 'grandfather', 'grandmother']);

interface SignCardProps {
    sign: string;
    frameCount: number;
    isVerified: boolean;
    isPlaying: boolean;
    onTogglePlay: (sign: string) => void;
}

const BrowserSignCard = memo<SignCardProps>(({ sign, frameCount, isVerified, isPlaying, onTogglePlay }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [signData, setSignData] = useState<SignData | null>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '150px' }
        );
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    // Auto-load data when visible
    useEffect(() => {
        if (!isVisible) return;
        let cancelled = false;
        loadSignData(sign).then(data => {
            if (!cancelled) setSignData(data);
        });
        return () => { cancelled = true; };
    }, [isVisible, sign]);

    return (
        <div
            ref={cardRef}
            className={`sbp-card${isPlaying ? ' sbp-card--playing' : ''}`}
            onClick={() => onTogglePlay(sign)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onTogglePlay(sign); }}
            aria-label={`${formatSignName(sign)}, ${frameCount} frames`}
            aria-pressed={isPlaying}
        >
            <div className="sbp-card__anim">
                {isVisible ? (
                    <SignAnimator
                        signData={signData}
                        isPlaying={isPlaying}
                        playbackSpeed={1}
                        size="card"
                    />
                ) : (
                    <div className="sbp-card__anim-placeholder" />
                )}
                {!isVerified && (
                    <span className="sbp-card__ai-badge">AI</span>
                )}
            </div>
            <div className="sbp-card__footer">
                <span className="sbp-card__name">{formatSignName(sign)}</span>
                <span className="sbp-card__frames">{frameCount} frames</span>
            </div>
        </div>
    );
});
BrowserSignCard.displayName = 'BrowserSignCard';

export const SignBrowserPage: React.FC = () => {
    const [allSigns, setAllSigns] = useState<string[]>([]);
    const [signMetadata, setSignMetadata] = useState<Record<string, SignMetadataEntry>>({});
    const [playingSign, setPlayingSign] = useState<string | null>(null);
    const [filter, setFilter] = useState<CategoryFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

    const abortRef = useRef<AbortController | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        fetch('/sign-data/metadata.json', { signal })
            .then(r => r.json())
            .then((metadata: SignMetadata) => {
                const sorted = Object.keys(metadata.signs).sort();
                setAllSigns(sorted);
                setSignMetadata(metadata.signs);

                const counts: Record<string, number> = { all: sorted.length };
                for (const [sign, meta] of Object.entries(metadata.signs)) {
                    const cat = meta.category ?? 'common';
                    counts[cat] = (counts[cat] ?? 0) + 1;
                    if (GREETINGS_SIGNS.has(sign)) counts['greetings'] = (counts['greetings'] ?? 0) + 1;
                    if (FAMILY_SIGNS.has(sign)) counts['family'] = (counts['family'] ?? 0) + 1;
                    if (meta.source !== 'ai_generated') counts['verified'] = (counts['verified'] ?? 0) + 1;
                }
                setCategoryCounts(counts);
            })
            .catch(err => { if (err?.name !== 'AbortError') console.error(err); })
            .finally(() => setIsLoading(false));

        return () => abortRef.current?.abort();
    }, []);

    const handleTogglePlay = useCallback((sign: string) => {
        setPlayingSign(prev => prev === sign ? null : sign);
    }, []);

    const filteredSigns = allSigns.filter(sign => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!sign.toLowerCase().includes(q) && !formatSignName(sign).toLowerCase().includes(q)) return false;
        }
        if (filter === 'all') return true;
        if (filter === 'greetings') return GREETINGS_SIGNS.has(sign);
        if (filter === 'family') return FAMILY_SIGNS.has(sign);
        if (filter === 'verified') return signMetadata[sign]?.source !== 'ai_generated';
        return signMetadata[sign]?.category === filter;
    });

    // Group by first letter
    const grouped = filteredSigns.reduce<Record<string, string[]>>((acc, sign) => {
        const letter = sign[0].toUpperCase();
        if (!acc[letter]) acc[letter] = [];
        acc[letter].push(sign);
        return acc;
    }, {});
    const letters = Object.keys(grouped).sort();

    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    const scrollToLetter = (letter: string) => {
        const el = document.getElementById(`sbp-section-${letter}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="sbp">
            {/* A-Z sidebar */}
            <nav className="sbp__sidebar" aria-label="Jump to letter">
                {allLetters.map(l => (
                    <button
                        key={l}
                        className={`sbp__sidebar-letter${grouped[l] ? '' : ' sbp__sidebar-letter--empty'}`}
                        onClick={() => scrollToLetter(l)}
                        disabled={!grouped[l]}
                        aria-label={`Jump to ${l}`}
                    >
                        {l}
                    </button>
                ))}
            </nav>

            {/* Main content */}
            <div className="sbp__content">
                <div className="sbp__page-header">
                    <div className="sbp__breadcrumb">Dictionary</div>
                    <h1 className="sbp__title">
                        Look up any sign. <span className="sbp__title-muted">100 verified, plus AI generated for the rest.</span>
                    </h1>
                </div>

                {/* Search */}
                <div className="sbp__search">
                    <svg className="sbp__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                    </svg>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="sbp__search-input"
                        placeholder='Type a word — like "hello" or "family"'
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        aria-label="Search signs"
                    />
                    {searchQuery && (
                        <button className="sbp__search-clear" onClick={() => setSearchQuery('')} aria-label="Clear">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    )}
                    <kbd className="sbp__search-kbd">⌘ K</kbd>
                </div>

                {/* Category filters */}
                <div className="sbp__filters" role="tablist" aria-label="Filter by category">
                    {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map(cat => (
                        <button
                            key={cat}
                            role="tab"
                            aria-selected={filter === cat}
                            className={`sbp__filter${filter === cat ? ' sbp__filter--active' : ''}`}
                            onClick={() => setFilter(cat)}
                        >
                            {CATEGORY_LABELS[cat]}
                            <span className="sbp__filter-count">{categoryCounts[cat] ?? 0}</span>
                        </button>
                    ))}
                </div>

                {/* Sort row */}
                <div className="sbp__sort-row">
                    <span className="sbp__result-count">{filteredSigns.length} signs</span>
                    <button className="sbp__sort-btn">Sort: A–Z <span aria-hidden="true">→</span></button>
                </div>

                {/* Grid area */}
                {isLoading ? (
                    <div className="sbp__loading">Loading signs…</div>
                ) : filteredSigns.length === 0 ? (
                    <div className="sbp__empty">
                        No signs found{searchQuery ? ` for "${searchQuery}"` : ''}.
                        {searchQuery && <button className="sbp__clear-link" onClick={() => setSearchQuery('')}>Clear search</button>}
                    </div>
                ) : (
                    <div className="sbp__sections">
                        {letters.map(letter => (
                            <div key={letter} id={`sbp-section-${letter}`} className="sbp__section">
                                <div className="sbp__section-header">
                                    <span className="sbp__section-letter">{letter}</span>
                                    <span className="sbp__section-count">{grouped[letter].length} signs</span>
                                </div>
                                <div className="sbp__grid">
                                    {grouped[letter].map(sign => (
                                        <BrowserSignCard
                                            key={sign}
                                            sign={sign}
                                            frameCount={signMetadata[sign]?.frame_count ?? 0}
                                            isVerified={signMetadata[sign]?.source !== 'ai_generated'}
                                            isPlaying={playingSign === sign}
                                            onTogglePlay={handleTogglePlay}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SignBrowserPage;
