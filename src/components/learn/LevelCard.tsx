/**
 * LevelCard Component
 * Displays a single level with progress, unlock status, and visual states
 */

import React from 'react';
import type { LevelInfo } from '../../constants/levels';
import './LevelCard.css';

interface LevelCardProps {
    level: LevelInfo;
    mastery: number;
    isUnlocked: boolean;
    isCurrent: boolean;
    isCompleted: boolean;
    onClick: () => void;
}

export const LevelCard: React.FC<LevelCardProps> = ({
    level,
    mastery,
    isUnlocked,
    isCurrent,
    isCompleted,
    onClick,
}) => {
    const cardClasses = [
        'level-card',
        isUnlocked ? 'level-card--unlocked' : 'level-card--locked',
        isCurrent && 'level-card--current',
        isCompleted && 'level-card--completed',
    ].filter(Boolean).join(' ');

    // Handle click - only allow if unlocked
    const handleClick = () => {
        if (isUnlocked) {
            onClick();
        }
    };

    // Handle keyboard - prevent action if locked
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isUnlocked && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
        }
    };

    return (
        <button
            className={cardClasses}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-disabled={!isUnlocked}
            aria-label={`Level ${level.id}: ${level.name}. ${isUnlocked ? `${mastery}% mastery. ${isCompleted ? 'Completed.' : ''}` : 'Locked. Complete previous level to unlock.'}`}
        >
            <div className="level-card__header">
                <span className="level-card__number">Level {level.id}</span>
                {isCompleted && <span className="level-card__badge">&#x2713;</span>}
                {!isUnlocked && (
                    <span className="level-card__lock" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                        </svg>
                    </span>
                )}
            </div>

            <div className="level-card__icon">{level.icon}</div>

            <h3 className="level-card__name">{level.name}</h3>
            <p className="level-card__description">{level.description}</p>

            <div className="level-card__footer">
                <span className="level-card__sign-count">{level.signs.length} signs</span>
                {isUnlocked && (
                    <div className="level-card__progress">
                        <div className="level-card__progress-bar">
                            <div
                                className="level-card__progress-fill"
                                style={{ width: `${mastery}%` }}
                            />
                        </div>
                        <span className="level-card__progress-text">{mastery}%</span>
                    </div>
                )}
            </div>
        </button>
    );
};

export default LevelCard;
