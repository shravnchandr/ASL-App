import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS } from '../constants/levels';
import type { ASLSign } from '../types';
import type { SignData } from '../types/index';
import { SignAnimator } from './learn/SignAnimator';
import { loadSignData } from '../utils/signDataLoader';
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

const StickFigurePlaceholder: React.FC = () => (
    <svg viewBox="0 0 80 110" width="60" height="80" aria-hidden="true" className="sign-card__stick-figure">
        {/* Head */}
        <circle cx="40" cy="16" r="12" stroke="currentColor" strokeWidth="2.5" fill="none" />
        {/* Body */}
        <line x1="40" y1="28" x2="40" y2="68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {/* Left arm */}
        <line x1="40" y1="38" x2="18" y2="55" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {/* Right arm */}
        <line x1="40" y1="38" x2="62" y2="55" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {/* Left leg */}
        <line x1="40" y1="68" x2="24" y2="95" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {/* Right leg */}
        <line x1="40" y1="68" x2="56" y2="95" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

interface SignCardProps {
    sign: ASLSign;
    index: number;
    totalCount?: number;
}

function findSignLevel(word: string): number | null {
    const key = word.toLowerCase().replace(/[\s-]+/g, '_');
    for (const level of LEVELS) {
        if (level.signs.includes(key)) return level.id;
    }
    return null;
}

export const SignCard: React.FC<SignCardProps> = ({ sign, index, totalCount }) => {
    const [guideOpen, setGuideOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [animData, setAnimData] = useState<SignData | null>(null);
    const cancelledRef = useRef(false);

    const letters = sign.fingerspell_letters ?? [];
    const signLevel = findSignLevel(sign.word);
    const isSingleLetter = sign.word.length === 1 && /^[a-zA-Z]$/.test(sign.word);

    useEffect(() => {
        cancelledRef.current = false;
        const key = sign.word.toLowerCase().replace(/\s+/g, '_');
        loadSignData(key).then(data => {
            if (!cancelledRef.current) {
                setAnimData(data);
            }
        }).catch(() => { /* no-op */ });
        return () => { cancelledRef.current = true; };
    }, [sign.word]);

    const hasLinks = (signLevel !== null || isSingleLetter) || (sign.is_fingerspelled && letters.length > 0);

    return (
        <article className="sign-card" aria-labelledby={`sign-${index}-word`}>
            {/* Left animation panel */}
            <div className="sign-card__anim-panel" aria-hidden="true">
                {animData ? (
                    <SignAnimator
                        signData={animData}
                        isPlaying={false}
                        playbackSpeed={1}
                        size="xs"
                    />
                ) : (
                    <StickFigurePlaceholder />
                )}
            </div>

            {/* Right content */}
            <div className="sign-card__body">
                {/* Badge row + counter */}
                <div className="sign-card__meta-row">
                    {sign.kb_verified
                        ? <span className="sign-card__badge sign-card__badge--verified">verified</span>
                        : !sign.is_fingerspelled && <span className="sign-card__badge sign-card__badge--ai">AI generated</span>
                    }
                    {sign.is_fingerspelled && (
                        <span className="sign-card__badge sign-card__badge--fs">fingerspelled</span>
                    )}
                    <span className="sign-card__counter">
                        {String(index + 1).padStart(2, '0')} of {totalCount != null ? String(totalCount).padStart(2, '0') : '—'}
                    </span>
                </div>

                <h3 id={`sign-${index}-word`} className="sign-card__word">
                    {sign.word.toLowerCase()}
                </h3>

                {/* Description — no label */}
                {sign.simple_description && (
                    <p className="sign-card__desc">{sign.simple_description}</p>
                )}

                {/* Always-visible inline metadata */}
                <div className="sign-card__meta">
                    <span><span className="sign-card__meta-key">Hand</span> {sign.hand_shape}</span>
                    <span><span className="sign-card__meta-key">Where</span> {sign.location}</span>
                    <span><span className="sign-card__meta-key">Move</span> {sign.movement}</span>
                </div>

                {/* Links & guides toggle — only shown when there's something to show */}
                {hasLinks && (
                    <>
                        <button
                            className="sign-card__details-toggle"
                            onClick={() => setDetailsOpen(o => !o)}
                            aria-expanded={detailsOpen}
                        >
                            {detailsOpen ? 'Hide links & guides' : 'Links & guides'}
                            <svg
                                width="12" height="12" viewBox="0 0 24 24" fill="none"
                                className={`sign-card__chevron ${detailsOpen ? 'sign-card__chevron--open' : ''}`}
                                aria-hidden="true"
                            >
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {detailsOpen && (
                            <div className="sign-card__expanded">
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
                    </>
                )}
            </div>
        </article>
    );
};
