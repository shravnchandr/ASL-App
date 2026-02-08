/**
 * SignBrowser Component
 * Displays all available signs in a grid with preview animations
 * Uses lazy loading to only render visible cards for performance
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { SignAnimator } from './SignAnimator';
import { formatSignName } from '../../utils/format';
import type { SignData } from '../../types';
import './SignBrowser.css';

interface SignMetadata {
    difficulty: string;
    category: string;
    frame_count: number;
    fps: number;
    source: string;
}

interface MetadataFile {
    signs: Record<string, SignMetadata>;
    total_signs: number;
    categories?: string[];
}

type CategoryFilter = 'all' | 'alphabet' | 'numbers' | 'months' | 'common';

interface SignBrowserProps {
    onClose: () => void;
    onSelectSign?: (sign: string) => void;
}

// Memoized card component for performance
const SignCard = memo<{
    sign: string;
    signData: SignData | null;
    isPlaying: boolean;
    onPlay: (sign: string) => void;
    onSelect?: (sign: string) => void;
}>(({ sign, signData, isPlaying, onPlay, onSelect }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    // Lazy load using IntersectionObserver
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={cardRef} className="sign-browser__card">
            <div className="sign-browser__animation">
                {isVisible ? (
                    <SignAnimator
                        signData={signData}
                        isPlaying={isPlaying}
                        playbackSpeed={1}
                        size="small"
                    />
                ) : (
                    <div className="sign-browser__placeholder" aria-hidden="true" />
                )}
            </div>
            <h3 className="sign-browser__sign-name">
                {formatSignName(sign)}
            </h3>
            <div className="sign-browser__actions">
                <button
                    className="sign-browser__play-btn"
                    onClick={() => onPlay(sign)}
                    aria-label={isPlaying ? `Pause ${formatSignName(sign)}` : `Play ${formatSignName(sign)}`}
                >
                    {isPlaying ? (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
                                <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
                            </svg>
                            Pause
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
                            </svg>
                            Play
                        </>
                    )}
                </button>
                {onSelect && (
                    <button
                        className="sign-browser__practice-btn"
                        onClick={() => onSelect(sign)}
                        aria-label={`Practice ${formatSignName(sign)}`}
                    >
                        Practice
                    </button>
                )}
            </div>
        </div>
    );
});

SignCard.displayName = 'SignCard';

export const SignBrowser: React.FC<SignBrowserProps> = ({ onClose, onSelectSign }) => {
    const [signs, setSigns] = useState<string[]>([]);
    const [signMetadata, setSignMetadata] = useState<Record<string, SignMetadata>>({});
    const [signDataCache, setSignDataCache] = useState<Record<string, SignData | null>>({});
    const [playingSign, setPlayingSign] = useState<string | null>(null);
    const [filter, setFilter] = useState<CategoryFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Ref for AbortController
    const abortControllerRef = useRef<AbortController | null>(null);

    // Load metadata on mount with AbortController
    useEffect(() => {
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;

        const loadMetadata = async () => {
            try {
                const response = await fetch('/sign-data/metadata.json', { signal });
                if (!response.ok) throw new Error('Failed to load metadata');
                const metadata: MetadataFile = await response.json();
                setSigns(Object.keys(metadata.signs).sort());
                setSignMetadata(metadata.signs);
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return; // Request was cancelled, ignore
                }
                console.error('Failed to load sign metadata:', error);
                setLoadError('Failed to load sign library. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        loadMetadata();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // Load sign data when a sign is clicked
    const loadSignData = useCallback(async (sign: string) => {
        if (signDataCache[sign]) return signDataCache[sign];

        try {
            const response = await fetch(`/sign-data/signs/${sign}.json`);
            if (!response.ok) return null;
            const data: SignData = await response.json();
            setSignDataCache(prev => ({ ...prev, [sign]: data }));
            return data;
        } catch (error) {
            console.error(`Failed to load sign data for ${sign}:`, error);
            return null;
        }
    }, [signDataCache]);

    const handlePlaySign = useCallback(async (sign: string) => {
        if (playingSign === sign) {
            setPlayingSign(null);
            return;
        }

        // Ensure data is loaded
        if (!signDataCache[sign]) {
            await loadSignData(sign);
        }
        setPlayingSign(sign);
    }, [playingSign, signDataCache, loadSignData]);

    const filteredSigns = signs.filter((sign) => {
        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const signName = formatSignName(sign).toLowerCase();
            if (!sign.toLowerCase().includes(query) && !signName.includes(query)) {
                return false;
            }
        }
        // Apply category filter
        if (filter === 'all') return true;
        const meta = signMetadata[sign];
        return meta?.category === filter;
    });

    return (
        <div className="sign-browser">
            <header className="sign-browser__header">
                <button className="sign-browser__close-btn" onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" />
                    </svg>
                </button>
                <h1 className="sign-browser__title">Sign Library</h1>
                <div className="sign-browser__count">
                    {filteredSigns.length} signs available
                </div>
            </header>

            <div className="sign-browser__search">
                <svg className="sign-browser__search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                    type="text"
                    className="sign-browser__search-input"
                    placeholder="Search signs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search signs"
                />
                {searchQuery && (
                    <button
                        className="sign-browser__search-clear"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                )}
            </div>

            <div className="sign-browser__filters">
                <button
                    className={`sign-browser__filter ${filter === 'all' ? 'sign-browser__filter--active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All ({signs.length})
                </button>
                <button
                    className={`sign-browser__filter ${filter === 'alphabet' ? 'sign-browser__filter--active' : ''}`}
                    onClick={() => setFilter('alphabet')}
                >
                    Alphabet (A-Z)
                </button>
                <button
                    className={`sign-browser__filter ${filter === 'numbers' ? 'sign-browser__filter--active' : ''}`}
                    onClick={() => setFilter('numbers')}
                >
                    Numbers
                </button>
                <button
                    className={`sign-browser__filter ${filter === 'months' ? 'sign-browser__filter--active' : ''}`}
                    onClick={() => setFilter('months')}
                >
                    Months
                </button>
                <button
                    className={`sign-browser__filter ${filter === 'common' ? 'sign-browser__filter--active' : ''}`}
                    onClick={() => setFilter('common')}
                >
                    Common
                </button>
            </div>

            {isLoading ? (
                <div className="sign-browser__loading">
                    <div className="spinner" />
                    <p>Loading signs...</p>
                </div>
            ) : loadError ? (
                <div className="sign-browser__error" role="alert">
                    <p>{loadError}</p>
                    <button
                        className="sign-browser__retry-btn"
                        onClick={() => window.location.reload()}
                    >
                        Retry
                    </button>
                </div>
            ) : filteredSigns.length === 0 ? (
                <div className="sign-browser__empty">
                    <p>No signs found{searchQuery ? ` for "${searchQuery}"` : ''}</p>
                    {searchQuery && (
                        <button className="sign-browser__clear-btn" onClick={() => setSearchQuery('')}>
                            Clear search
                        </button>
                    )}
                </div>
            ) : (
                <div className="sign-browser__grid" role="list" aria-label="Sign library">
                    {filteredSigns.map(sign => (
                        <SignCard
                            key={sign}
                            sign={sign}
                            signData={signDataCache[sign] || null}
                            isPlaying={playingSign === sign}
                            onPlay={handlePlaySign}
                            onSelect={onSelectSign}
                        />
                    ))}
                </div>
            )}

            <div className="sign-browser__footer">
                <p>100 signs available: 26 letters, 10 numbers, 12 months, and 52 common signs.</p>
            </div>
        </div>
    );
};

export default SignBrowser;
