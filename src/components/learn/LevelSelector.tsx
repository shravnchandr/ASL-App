import React from 'react';
import { LevelCard } from './LevelCard';
import { FlowerShape } from '../FlowerShape';
import { MASTERY_THRESHOLD, type LevelInfo } from '../../constants/levels';
import './LevelSelector.css';

interface LevelSelectorProps {
    levels: LevelInfo[];
    unlockedLevels: number[];
    currentLevel: number;
    onSelectLevel: (levelId: number) => void;
    getLevelMastery: (levelId: number) => number;
    getReviewDueCount: (levelId: number) => number;
    hasResumeSession?: boolean;
    onResume?: () => void;
}

export const LevelSelector: React.FC<LevelSelectorProps> = ({
    levels,
    unlockedLevels,
    currentLevel,
    onSelectLevel,
    getLevelMastery,
    getReviewDueCount,
    hasResumeSession = false,
    onResume,
}) => {
    const currentLevelInfo = levels.find(level => level.id === currentLevel);
    const mastery = getLevelMastery(currentLevel);
    const nextLevel = levels.find(level => level.id === currentLevel + 1);
    const signsLearned = currentLevelInfo
        ? Math.round((mastery / 100) * currentLevelInfo.signs.length)
        : 0;

    return (
        <div className="level-selector">
            {currentLevelInfo && (
                <div className="current-level-card">
                    <div className="current-level-card__badge">
                        <FlowerShape size={72} fill="rgba(255,255,255,0.22)" petals={6}>
                            <span className="current-level-card__badge-num">{currentLevel}</span>
                        </FlowerShape>
                    </div>
                    <div className="current-level-card__info">
                        <div className="current-level-card__eyebrow">CURRENT LEVEL</div>
                        <h2 className="current-level-card__name">{currentLevelInfo.name}</h2>
                        <p className="current-level-card__meta">
                            {signsLearned} of {currentLevelInfo.signs.length} signs mastered
                            {nextLevel && ` · ${MASTERY_THRESHOLD}% to unlock ${nextLevel.name}`}
                        </p>
                        <div className="current-level-card__dots">
                            {currentLevelInfo.signs.slice(0, 10).map((_, index) => (
                                <span
                                    key={index}
                                    className={`current-level-card__dot ${
                                        index < signsLearned ? 'current-level-card__dot--filled' : ''
                                    }`}
                                />
                            ))}
                            {currentLevelInfo.signs.length > 10 && (
                                <span className="current-level-card__dot-more">
                                    +{currentLevelInfo.signs.length - 10}
                                </span>
                            )}
                        </div>
                    </div>
                    {hasResumeSession && onResume ? (
                        <div className="current-level-card__btn-group">
                            <button
                                className="current-level-card__resume-btn current-level-card__resume-btn--primary"
                                onClick={onResume}
                                aria-label={`Resume session for Level ${currentLevel}: ${currentLevelInfo.name}`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                Resume session
                            </button>
                            <button
                                className="current-level-card__resume-btn current-level-card__resume-btn--ghost"
                                onClick={() => onSelectLevel(currentLevel)}
                                aria-label={`Start new session for Level ${currentLevel}: ${currentLevelInfo.name}`}
                            >
                                New session
                            </button>
                        </div>
                    ) : (
                        <button
                            className="current-level-card__resume-btn"
                            onClick={() => onSelectLevel(currentLevel)}
                            aria-label={`Preview Level ${currentLevel}: ${currentLevelInfo.name}`}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Preview session
                        </button>
                    )}
                </div>
            )}

            <div className="level-selector__section-title">All levels</div>

            <div className="level-selector__grid">
                {levels.map((level) => {
                    const levelMastery = getLevelMastery(level.id);
                    const isUnlocked = unlockedLevels.includes(level.id);
                    const isCurrent = level.id === currentLevel;
                    const isCompleted = isUnlocked && levelMastery >= MASTERY_THRESHOLD;

                    return (
                        <LevelCard
                            key={level.id}
                            level={level}
                            mastery={levelMastery}
                            isUnlocked={isUnlocked}
                            isCurrent={isCurrent}
                            isCompleted={isCompleted}
                            reviewDue={getReviewDueCount(level.id)}
                            onClick={() => isUnlocked && onSelectLevel(level.id)}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default LevelSelector;
