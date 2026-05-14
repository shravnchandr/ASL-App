import React from 'react';
import type { LevelInfo } from '../../constants/levels';
import { FlowerShape } from '../FlowerShape';
import './LevelCard.css';

interface LevelCardProps {
    level: LevelInfo;
    mastery: number;
    isUnlocked: boolean;
    isCurrent: boolean;
    isCompleted: boolean;
    reviewDue?: number;
    onClick: () => void;
}

const LEVEL_COLORS: Array<{ fill: string; bg: string }> = [
    { fill: '#4F8B47', bg: '#CFEFC9' },   // 1 — green
    { fill: '#0B6BC4', bg: '#D0E8FF' },   // 2 — blue
    { fill: '#E46A2C', bg: '#FFD9C2' },   // 3 — coral
    { fill: '#0B6BC4', bg: '#D0E8FF' },   // 4
    { fill: '#4F8B47', bg: '#CFEFC9' },   // 5
    { fill: '#E46A2C', bg: '#FFD9C2' },   // 6
    { fill: '#0B6BC4', bg: '#D0E8FF' },   // 7
    { fill: '#4F8B47', bg: '#CFEFC9' },   // 8
    { fill: '#E46A2C', bg: '#FFD9C2' },   // 9
    { fill: '#0B6BC4', bg: '#D0E8FF' },   // 10
];

export const LevelCard: React.FC<LevelCardProps> = ({
    level,
    mastery,
    isUnlocked,
    isCurrent,
    isCompleted,
    reviewDue = 0,
    onClick,
}) => {
    const colors = LEVEL_COLORS[(level.id - 1) % LEVEL_COLORS.length];
    const badgeFill = isCompleted
        ? '#4F8B47'
        : isCurrent
        ? colors.fill
        : isUnlocked
        ? colors.fill
        : 'var(--md-sys-color-surface-container-high)';

    const cardClass = [
        'level-card',
        isUnlocked ? 'level-card--unlocked' : 'level-card--locked',
        isCurrent && 'level-card--current',
        isCompleted && 'level-card--completed',
    ].filter(Boolean).join(' ');

    return (
        <button
            className={cardClass}
            onClick={() => isUnlocked && onClick()}
            aria-disabled={!isUnlocked}
            aria-label={`Level ${level.id}: ${level.name}. ${
                isUnlocked
                    ? `${mastery}% mastery. ${isCompleted ? 'Completed.' : ''}`
                    : 'Locked.'
            }`}
        >
            {/* Top row: badge + info */}
            <div className="level-card__top">
                <div className="level-card__badge-wrap">
                    <FlowerShape size={52} fill={badgeFill} petals={8}>
                        {isCompleted ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                        ) : !isUnlocked ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--md-sys-color-on-surface-variant)" aria-hidden="true">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                        ) : (
                            <span className="level-card__badge-num">{level.id}</span>
                        )}
                    </FlowerShape>
                </div>

                <div className="level-card__info">
                    <span className="level-card__eyebrow">LEVEL {String(level.id).padStart(2, '0')}</span>
                    <h3 className="level-card__name">{level.name}</h3>
                    <span className="level-card__count">
                        {level.signs.length} signs
                        {isUnlocked && reviewDue > 0 && ` · ${reviewDue} due`}
                    </span>
                </div>
            </div>

            {/* Bottom row: progress + status */}
            <div className="level-card__bottom">
                {isUnlocked && (
                    <div className="level-card__progress-row">
                        <div className="level-card__bar">
                            <div
                                className="level-card__bar-fill"
                                style={{ width: `${mastery}%`, background: isCompleted ? 'var(--md-sys-color-tertiary)' : colors.fill }}
                            />
                        </div>
                    </div>
                )}
                <div className="level-card__status-row">
                    <span className="level-card__mastery">
                        {isUnlocked ? `${mastery}% mastery` : '0% mastery'}
                    </span>
                    {isCompleted && (
                        <span className="level-card__status level-card__status--complete">✓ Complete</span>
                    )}
                    {isCurrent && !isCompleted && (
                        <span className="level-card__status level-card__status--continue">Continue</span>
                    )}
                    {!isUnlocked && (
                        <span className="level-card__status level-card__status--locked">Locked</span>
                    )}
                </div>
            </div>
        </button>
    );
};

export default LevelCard;
