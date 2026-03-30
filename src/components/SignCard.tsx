/**
 * SignCard Component
 * Displays individual ASL sign with expressive Material 3 design
 * Updated with beginner-friendly language and video resource links
 */

import React, { useState } from 'react';
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

export const SignCard: React.FC<SignCardProps> = ({ sign, index }) => {
    const [guideOpen, setGuideOpen] = useState(false);
    const letters = sign.fingerspell_letters ?? [];

    return (
        <article
            className="sign-card"
            style={{ animationDelay: `${index * 100}ms` }}
            aria-labelledby={`sign-${index}-word`}
        >
            <header className="sign-card-header">
                <div className="sign-word-row">
                    <h3 id={`sign-${index}-word`} className="sign-word">
                        {sign.word.toUpperCase()}
                    </h3>
                    {sign.kb_verified && (
                        <span className="kb-badge" title="Description verified against Lifeprint/ASLU knowledge base">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                            Verified
                        </span>
                    )}
                </div>
                <span className="sign-number" aria-label={`Sign ${index + 1}`}>
                    #{index + 1}
                </span>
            </header>

            <div className="sign-details">
                <div className="sign-detail-item">
                    <div className="detail-icon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="detail-content">
                        <dt className="detail-label">How to Form Your Hands</dt>
                        <dd className="detail-value">{sign.hand_shape}</dd>
                    </div>
                </div>

                <div className="sign-detail-item">
                    <div className="detail-icon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="detail-content">
                        <dt className="detail-label">Where to Place Your Hands</dt>
                        <dd className="detail-value">{sign.location}</dd>
                    </div>
                </div>

                <div className="sign-detail-item">
                    <div className="detail-icon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M13 3L4 14H12L11 21L20 10H12L13 3Z" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="detail-content">
                        <dt className="detail-label">How to Move</dt>
                        <dd className="detail-value">{sign.movement}</dd>
                    </div>
                </div>

                <div className="sign-detail-item">
                    <div className="detail-icon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM8.5 11C9.33 11 10 10.33 10 9.5C10 8.67 9.33 8 8.5 8C7.67 8 7 8.67 7 9.5C7 10.33 7.67 11 8.5 11ZM15.5 11C16.33 11 17 10.33 17 9.5C17 8.67 16.33 8 15.5 8C14.67 8 14 8.67 14 9.5C14 10.33 14.67 11 15.5 11ZM12 17.5C14.33 17.5 16.31 16.04 17.11 14H6.89C7.69 16.04 9.67 17.5 12 17.5Z" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="detail-content">
                        <dt className="detail-label">Facial Expressions & Body Language</dt>
                        <dd className="detail-value">{sign.non_manual_markers}</dd>
                    </div>
                </div>
            </div>

            {sign.is_fingerspelled && letters.length > 0 && (
                <div className="fingerspell-section">
                    <div className="fingerspell-header">
                        <span className="fingerspell-label">Fingerspell</span>
                        <span className="fingerspell-sequence">
                            {letters.map((l, i) => (
                                <span key={i} className="fingerspell-chip">{l}</span>
                            ))}
                        </span>
                    </div>
                    <button
                        className="fingerspell-toggle"
                        onClick={() => setGuideOpen(o => !o)}
                        aria-expanded={guideOpen}
                    >
                        {guideOpen ? 'Hide letter guide ▲' : 'Show letter guide ▼'}
                    </button>
                    {guideOpen && (
                        <dl className="fingerspell-guide">
                            {letters.map((l, i) => (
                                <div key={i} className="fingerspell-row">
                                    <dt className="fingerspell-row-letter">{l}</dt>
                                    <dd className="fingerspell-row-desc">
                                        {LETTER_SHAPES[l] ?? 'See ASL alphabet reference'}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            )}

            <div className="video-resources">
                <p className="video-resources-label">🎥 Watch video tutorials:</p>
                <div className="video-links">
                    <a
                        href={`https://www.lifeprint.com/asl101/pages-signs/${encodeURIComponent(sign.word.toLowerCase().charAt(0))}/${encodeURIComponent(sign.word.toLowerCase())}.htm`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="video-link"
                        aria-label={`Look up ${sign.word} on Lifeprint/ASLU`}
                    >
                        Lifeprint/ASLU
                    </a>
                    <a
                        href={`https://www.signingsavvy.com/search/${encodeURIComponent(sign.word)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="video-link"
                        aria-label={`Watch ${sign.word} on Signing Savvy`}
                    >
                        Signing Savvy
                    </a>
                    <a
                        href={`https://www.spreadthesign.com/en.us/search/?query=${encodeURIComponent(sign.word)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="video-link"
                        aria-label={`Look up ${sign.word} on Spread The Sign`}
                    >
                        Spread The Sign
                    </a>
                    <a
                        href={`https://www.youtube.com/results?search_query=how+to+sign+${encodeURIComponent(sign.word)}+in+asl`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="video-link"
                        aria-label={`Search ${sign.word} on YouTube`}
                    >
                        YouTube
                    </a>
                </div>
            </div>
        </article>
    );
};
