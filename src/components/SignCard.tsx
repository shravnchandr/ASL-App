/**
 * SignCard Component
 * Compact reference card with embedded animation when available
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SignAnimator } from './learn/SignAnimator';
import { loadSignData } from '../utils/signDataLoader';
import { LEVELS } from '../constants/levels';
import type { ASLSign, SignData } from '../types';
import './SignCard.css';

const LETTER_SHAPES: Record<string, string> = {
    A: 'Closed fist, thumb resting on the side of the index finger',
    B: 'Flat hand, four fingers extended and together pointing up, thumb tucked across palm',
    C: 'All fingers and thumb curved to form a C shape',
    D: 'Index finger points up, remaining fingers curl to touch thumb forming a D',
    E: 'All fingers bent at the knuckles, thumb tucked under fingertips',
    F: 'Index finger and thumb touch forming a circle; other three fingers extended up',
    G: 'Index finger points sideways, thumb parallel beneath it',
    H: 'Index and middle fingers extended horizontally, held side by side',
    I: 'Pinky finger extended straight up, other fingers in a fist',
    J: 'Pinky extended; draw a J by moving down then curving up',
    K: 'Index pointing up, middle angled outward, thumb between them',
    L: 'Index finger pointing up, thumb extended outward — an L shape',
    M: 'Three fingers folded down over the tucked thumb',
    N: 'Index and middle fingers folded down over the tucked thumb',
    O: 'All fingers and thumb curved to meet each other, forming an O',
    P: 'Like K but rotated so the index finger points downward',
    Q: 'Like G but index finger and thumb point downward',
    R: 'Index and middle fingers crossed over each other',
    S: 'Closed fist with thumb placed across the front of the fingers',
    T: 'Thumb tucked between index and middle fingers in a closed fist',
    U: 'Index and middle fingers extended together and pointing up',
    V: 'Index and middle fingers extended and spread apart (peace sign)',
    W: 'Index, middle, and ring fingers extended and spread apart',
    X: 'Index finger bent into a hook',
    Y: 'Thumb and pinky extended outward, other fingers curled',
    Z: 'Index finger extended; trace a Z shape in the air',
};

interface SignCardProps {
    sign: ASLSign;
    index: number;
}

// Check if a sign word exists in the Learn levels
function findSignLevel(word: string): number | null {
    const key = word.toLowerCase().replace(/[\s-]+/g, '_');
    for (const level of LEVELS) {
        if (level.signs.includes(key)) return level.id;
    }
    return null;
}

export const SignCard: React.FC<SignCardProps> = ({ sign, index }) => {
    const [guideOpen, setGuideOpen] = useState(false);
    const [signData, setSignData] = useState<SignData | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [animLoaded, setAnimLoaded] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const letters = sign.fingerspell_letters ?? [];
    const signLevel = findSignLevel(sign.word);
    const isSingleLetter = sign.word.length === 1 && /^[a-zA-Z]$/.test(sign.word);

    // Try to load animation data for this sign.
    // Skip single-letter words that aren't fingerspelled — the animation files
    // are for alphabet letters, not for word signs like the pronoun "I".
    useEffect(() => {
        if (isSingleLetter && !sign.is_fingerspelled) return;
        let cancelled = false;
        const word = sign.word.toLowerCase().replace(/[\s-]+/g, '_');
        loadSignData(word).then(data => {
            if (!cancelled && data) {
                setSignData(data);
                setAnimLoaded(true);
            }
        });
        return () => { cancelled = true; };
    }, [sign.word, isSingleLetter, sign.is_fingerspelled]);

    return (
        <article className="sign-card" aria-labelledby={`sign-${index}-word`}>
            {/* Header */}
            <div className="sign-card__header">
                <h3 id={`sign-${index}-word`} className="sign-card__word">
                    {sign.word.toUpperCase()}
                </h3>
                {sign.kb_verified && (
                    <span className="sign-card__badge" title="Verified against Lifeprint/ASLU knowledge base">
                        Verified
                    </span>
                )}
            </div>

            <div className="sign-card__body">
                {/* Animation (if available) — always visible */}
                {animLoaded && signData && (
                    <div className="sign-card__anim">
                        <SignAnimator
                            signData={signData}
                            isPlaying={isPlaying}
                            playbackSpeed={0.8}
                            size="small"
                            onAnimationEnd={() => setIsPlaying(false)}
                        />
                        <button
                            className="sign-card__play-btn"
                            onClick={() => setIsPlaying(p => !p)}
                            aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
                        >
                            {isPlaying ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            )}
                            {isPlaying ? 'Pause' : 'Play'}
                        </button>
                    </div>
                )}

                {/* Expand/collapse toggle */}
                <button
                    className="sign-card__expand-btn"
                    onClick={() => setIsExpanded(e => !e)}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? 'Less' : 'More details'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`sign-card__chevron ${isExpanded ? 'sign-card__chevron--open' : ''}`}>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                    <div className="sign-card__expanded">
                        {/* Fingerspelling */}
                        {sign.is_fingerspelled && letters.length > 0 && (
                            <div className="sign-card__fingerspell">
                                <div className="sign-card__fs-header">
                                    <span className="sign-card__fs-label">Fingerspell</span>
                                    <span className="sign-card__fs-chips">
                                        {letters.map((l, i) => (
                                            <span key={i} className="sign-card__fs-chip">{l}</span>
                                        ))}
                                    </span>
                                </div>
                                <button
                                    className="sign-card__fs-toggle"
                                    onClick={() => setGuideOpen(o => !o)}
                                    aria-expanded={guideOpen}
                                >
                                    {guideOpen ? 'Hide letter guide' : 'Show letter guide'}
                                </button>
                                {guideOpen && (
                                    <dl className="sign-card__fs-guide">
                                        {letters.map((l, i) => (
                                            <div key={i} className="sign-card__fs-row">
                                                <dt>{l}</dt>
                                                <dd>{LETTER_SHAPES[l] ?? 'See ASL alphabet reference'}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        )}

                        {/* Sign details */}
                        <dl className="sign-card__details">
                            <div className="sign-card__detail">
                                <dt>Hand shape</dt>
                                <dd>{sign.hand_shape}</dd>
                            </div>
                            <div className="sign-card__detail">
                                <dt>Location</dt>
                                <dd>{sign.location}</dd>
                            </div>
                            <div className="sign-card__detail">
                                <dt>Movement</dt>
                                <dd>{sign.movement}</dd>
                            </div>
                            <div className="sign-card__detail">
                                <dt>Expression</dt>
                                <dd>{sign.non_manual_markers}</dd>
                            </div>
                        </dl>

                        {/* Video resources */}
                        <div className="sign-card__links">
                            <a href={`https://www.lifeprint.com/asl101/pages-signs/${encodeURIComponent(sign.word.toLowerCase().charAt(0))}/${encodeURIComponent(sign.word.toLowerCase())}.htm`} target="_blank" rel="noopener noreferrer">Lifeprint</a>
                            <a href={`https://www.signingsavvy.com/search/${encodeURIComponent(sign.word)}`} target="_blank" rel="noopener noreferrer">Signing Savvy</a>
                            <a href={`https://www.youtube.com/results?search_query=how+to+sign+${encodeURIComponent(sign.word)}+in+asl`} target="_blank" rel="noopener noreferrer">YouTube</a>
                        </div>

                        {/* Practice links (Feature 1: Connect modes) */}
                        {(signLevel || isSingleLetter) && (
                            <div className="sign-card__practice">
                                {signLevel && (
                                    <Link to="/learn" className="sign-card__practice-link sign-card__practice-link--learn">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 14L9 5L6 14M12 14H6M19 14L16 5L13 14M19 14H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                        Practice in Learn
                                    </Link>
                                )}
                                {isSingleLetter && (
                                    <Link to="/camera" className="sign-card__practice-link sign-card__practice-link--camera">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" /></svg>
                                        Try with Camera
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
};
