/**
 * SentenceAnimator Component
 * Plays multiple sign animations in sequence with word indicators and playback controls
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SignAnimator } from './learn/SignAnimator';
import { loadSignData } from '../utils/signDataLoader';
import { formatSignName } from '../utils/format';
import type { SignData } from '../types';
import './SentenceAnimator.css';

interface WordEntry {
    word: string;
    isFingerspelled: boolean;
}

interface SentenceAnimatorProps {
    /** List of sign words to animate in order */
    words: WordEntry[];
}

type PlayState = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Returns true if a word key should have its animation loaded.
 * Single-letter words that aren't fingerspelled are word-signs (e.g. pronoun "I")
 * and don't have matching animation data (the files are for alphabet letters).
 */
function shouldLoadAnimation(entry: WordEntry): boolean {
    if (entry.word.length === 1 && /^[a-z]$/i.test(entry.word) && !entry.isFingerspelled) {
        return false;
    }
    return true;
}

export const SentenceAnimator: React.FC<SentenceAnimatorProps> = ({ words }) => {
    const [signDataMap, setSignDataMap] = useState<Map<string, SignData>>(new Map());
    const [currentIndex, setCurrentIndex] = useState(0);
    const [playState, setPlayState] = useState<PlayState>('idle');
    const [isPlaying, setIsPlaying] = useState(false);
    const isMountedRef = useRef(true);

    // Word keys for lookups
    const wordKeys = useMemo(() => words.map(w => w.word), [words]);

    // Track which words have sign data available
    const availableWords = wordKeys.filter(w => signDataMap.has(w));

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Load sign data — skip single-letter non-fingerspelled words
    useEffect(() => {
        let cancelled = false;
        async function loadAll() {
            const map = new Map<string, SignData>();
            await Promise.all(
                words.map(async (entry) => {
                    if (!shouldLoadAnimation(entry)) return;
                    const data = await loadSignData(entry.word);
                    if (data && !cancelled) {
                        map.set(entry.word, data);
                    }
                })
            );
            if (!cancelled && isMountedRef.current) {
                setSignDataMap(map);
            }
        }
        loadAll();
        return () => { cancelled = true; };
    }, [words]);

    const findNextAvailable = useCallback((startIdx: number): number | null => {
        for (let i = startIdx; i < wordKeys.length; i++) {
            if (signDataMap.has(wordKeys[i])) return i;
        }
        return null;
    }, [wordKeys, signDataMap]);

    const handleAnimationEnd = useCallback(() => {
        if (!isMountedRef.current) return;

        const nextAvailableIndex = findNextAvailable(currentIndex + 1);
        if (nextAvailableIndex !== null) {
            setCurrentIndex(nextAvailableIndex);
            setIsPlaying(true);
        } else {
            setPlayState('idle');
            setIsPlaying(false);
            setCurrentIndex(0);
        }
    }, [currentIndex, findNextAvailable]);

    const handlePlay = useCallback(() => {
        if (availableWords.length === 0) return;

        if (playState === 'paused') {
            setPlayState('playing');
            setIsPlaying(true);
            return;
        }

        const firstAvailable = findNextAvailable(0);
        if (firstAvailable !== null) {
            setCurrentIndex(firstAvailable);
            setPlayState('playing');
            setIsPlaying(true);
        }
    }, [playState, availableWords.length, findNextAvailable]);

    const handlePause = useCallback(() => {
        setPlayState('paused');
        setIsPlaying(false);
    }, []);

    const handleRestart = useCallback(() => {
        const firstAvailable = findNextAvailable(0);
        if (firstAvailable !== null) {
            setCurrentIndex(firstAvailable);
            setPlayState('playing');
            setIsPlaying(true);
        }
    }, [findNextAvailable]);

    const handleWordClick = useCallback((index: number) => {
        if (!signDataMap.has(wordKeys[index])) return;
        setCurrentIndex(index);
        setPlayState('playing');
        setIsPlaying(true);
    }, [signDataMap, wordKeys]);

    if (words.length === 0) return null;

    const currentWord = wordKeys[currentIndex];
    const currentData = signDataMap.get(currentWord) || null;
    const completedCount = playState === 'playing' || playState === 'paused'
        ? wordKeys.slice(0, currentIndex).filter(w => signDataMap.has(w)).length
        : 0;
    const totalAvailable = availableWords.length;
    const progress = totalAvailable > 0 ? ((completedCount + (playState === 'playing' ? 0.5 : 0)) / totalAvailable) * 100 : 0;

    return (
        <div className="sentence-animator">
            {/* Header */}
            <div className="sentence-animator__header">
                <h4 className="sentence-animator__title">Sentence Animation</h4>
                {playState !== 'idle' && (
                    <span className="sentence-animator__status">
                        {completedCount + 1} / {totalAvailable}
                    </span>
                )}
            </div>

            {/* Word chips */}
            <div className="sentence-animator__words">
                {words.map((entry, idx) => {
                    const hasData = signDataMap.has(entry.word);
                    let chipClass = 'sentence-animator__word-chip';
                    if (!hasData) chipClass += ' sentence-animator__word-chip--skipped';
                    else if (playState !== 'idle' && idx === currentIndex) chipClass += ' sentence-animator__word-chip--active';
                    else if (playState !== 'idle' && idx < currentIndex && hasData) chipClass += ' sentence-animator__word-chip--done';

                    return (
                        <button
                            key={`${entry.word}-${idx}`}
                            className={chipClass}
                            onClick={() => handleWordClick(idx)}
                            disabled={!hasData}
                            title={hasData ? `Play "${formatSignName(entry.word)}"` : `No animation for "${formatSignName(entry.word)}"`}
                        >
                            {formatSignName(entry.word)}
                        </button>
                    );
                })}
            </div>

            {/* Canvas */}
            <div className="sentence-animator__canvas-area">
                {totalAvailable === 0 ? (
                    <div className="sentence-animator__no-data">
                        No sign animations available
                    </div>
                ) : (
                    <SignAnimator
                        signData={currentData}
                        isPlaying={isPlaying && playState === 'playing'}
                        playbackSpeed={1}
                        size="medium"
                        onAnimationEnd={handleAnimationEnd}
                    />
                )}
            </div>

            {/* Progress bar */}
            {playState !== 'idle' && totalAvailable > 1 && (
                <div className="sentence-animator__progress">
                    <div className="sentence-animator__progress-bar">
                        <div
                            className="sentence-animator__progress-fill"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Controls */}
            {totalAvailable > 0 && (
                <div className="sentence-animator__controls">
                    {playState !== 'idle' && (
                        <button
                            className="sentence-animator__btn sentence-animator__btn--secondary"
                            onClick={handleRestart}
                            aria-label="Restart"
                            title="Restart from beginning"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                        </button>
                    )}

                    <button
                        className="sentence-animator__btn sentence-animator__btn--play"
                        onClick={playState === 'playing' ? handlePause : handlePlay}
                        aria-label={playState === 'playing' ? 'Pause' : 'Play sentence'}
                    >
                        {playState === 'playing' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="6,3 20,12 6,21" />
                            </svg>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SentenceAnimator;
