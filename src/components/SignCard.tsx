/**
 * SignCard Component
 * Playful Springs redesign: hero strip + colored attribute tiles
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS } from '../constants/levels';
import type { ASLSign } from '../types';
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

function findSignLevel(word: string): number | null {
    const key = word.toLowerCase().replace(/[\s-]+/g, '_');
    for (const level of LEVELS) {
        if (level.signs.includes(key)) return level.id;
    }
    return null;
}

export const SignCard: React.FC<SignCardProps> = ({ sign, index }) => {
    const [guideOpen, setGuideOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const letters = sign.fingerspell_letters ?? [];
    const signLevel = findSignLevel(sign.word);
    const isSingleLetter = sign.word.length === 1 && /^[a-zA-Z]$/.test(sign.word);

    return (
        <article className="sign-card" aria-labelledby={`sign-${index}-word`}>
            {/* Hero strip */}
            <div className="sign-card__hero">
                <div className="sign-card__hero-badges">
                    {sign.kb_verified && (
                        <span className="sign-card__badge sign-card__badge--verified">Verified</span>
                    )}
                    {sign.is_fingerspelled && (
                        <span className="sign-card__badge sign-card__badge--fs">Fingerspelled</span>
                    )}
                </div>
                <h3 id={`sign-${index}-word`} className="sign-card__word">
                    {sign.word.toUpperCase()}
                </h3>
            </div>

            <div className="sign-card__body">
                {/* How to do it — always visible */}
                {sign.simple_description && (
                    <div className="sign-card__desc-block">
                        <div className="sign-card__desc-label">HOW TO DO IT</div>
                        <p className="sign-card__desc">{sign.simple_description}</p>
                    </div>
                )}

                {/* More details toggle */}
                <button
                    className="sign-card__details-toggle"
                    onClick={() => setDetailsOpen(o => !o)}
                    aria-expanded={detailsOpen}
                >
                    {detailsOpen ? 'Hide details' : 'More details'}
                    <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        className={`sign-card__chevron ${detailsOpen ? 'sign-card__chevron--open' : ''}`}
                        aria-hidden="true"
                    >
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                {detailsOpen && (
                    <div className="sign-card__expanded">
                        {/* Attribute tiles — 2×2 grid */}
                        <div className="sign-card__tiles">
                            <div className="sign-card__tile sign-card__tile--hand">
                                <div className="sign-card__tile-label">Hand shape</div>
                                <div className="sign-card__tile-value">{sign.hand_shape}</div>
                            </div>
                            <div className="sign-card__tile sign-card__tile--location">
                                <div className="sign-card__tile-label">Location</div>
                                <div className="sign-card__tile-value">{sign.location}</div>
                            </div>
                            <div className="sign-card__tile sign-card__tile--movement">
                                <div className="sign-card__tile-label">Movement</div>
                                <div className="sign-card__tile-value">{sign.movement}</div>
                            </div>
                            <div className="sign-card__tile sign-card__tile--expression">
                                <div className="sign-card__tile-label">Expression</div>
                                <div className="sign-card__tile-value">{sign.non_manual_markers}</div>
                            </div>
                        </div>

                        {/* Practice links */}
                        {(signLevel || isSingleLetter) && (
                            <div className="sign-card__practice">
                                {signLevel && (
                                    <Link to="/learn" className="sign-card__practice-btn sign-card__practice-btn--learn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M12 14L9 5L6 14M12 14H6M19 14L16 5L13 14M19 14H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M5 19H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                        Practice this sign
                                    </Link>
                                )}
                                {isSingleLetter && (
                                    <Link to="/camera" className="sign-card__practice-btn sign-card__practice-btn--camera">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                                        </svg>
                                        Try with camera
                                    </Link>
                                )}
                            </div>
                        )}

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

                        <div className="sign-card__links">
                            <a href={`https://www.lifeprint.com/asl101/pages-signs/${encodeURIComponent(sign.word.toLowerCase().charAt(0))}/${encodeURIComponent(sign.word.toLowerCase())}.htm`} target="_blank" rel="noopener noreferrer">Lifeprint</a>
                            <a href={`https://www.signingsavvy.com/search/${encodeURIComponent(sign.word)}`} target="_blank" rel="noopener noreferrer">Signing Savvy</a>
                            <a href={`https://www.youtube.com/results?search_query=how+to+sign+${encodeURIComponent(sign.word)}+in+asl`} target="_blank" rel="noopener noreferrer">YouTube</a>
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
};
