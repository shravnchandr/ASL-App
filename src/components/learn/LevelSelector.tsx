/**
 * LevelSelector Component
 * Grid layout showing all 10 levels with visual progression path
 */

import React from 'react';
import { LevelCard } from './LevelCard';
import { MASTERY_THRESHOLD, type LevelInfo } from '../../constants/levels';
import './LevelSelector.css';

interface LevelSelectorProps {
    levels: LevelInfo[];
    unlockedLevels: number[];
    currentLevel: number;
    onSelectLevel: (levelId: number) => void;
    getLevelMastery: (levelId: number) => number;
}

export const LevelSelector: React.FC<LevelSelectorProps> = ({
    levels,
    unlockedLevels,
    currentLevel,
    onSelectLevel,
    getLevelMastery,
}) => {
    return (
        <div className="level-selector">
            <header className="level-selector__header">
                <h2 className="level-selector__title">Choose Your Level</h2>
                <p className="level-selector__subtitle">
                    Complete each level with {MASTERY_THRESHOLD}% mastery to unlock the next
                </p>
            </header>

            <div className="level-selector__grid">
                {levels.map((level) => {
                    const mastery = getLevelMastery(level.id);
                    const isUnlocked = unlockedLevels.includes(level.id);
                    const isCurrent = level.id === currentLevel;
                    const isCompleted = isUnlocked && mastery >= MASTERY_THRESHOLD;

                    return (
                        <LevelCard
                            key={level.id}
                            level={level}
                            mastery={mastery}
                            isUnlocked={isUnlocked}
                            isCurrent={isCurrent}
                            isCompleted={isCompleted}
                            onClick={() => isUnlocked && onSelectLevel(level.id)}
                        />
                    );
                })}
            </div>

            <div className="level-selector__progress-summary">
                <div className="progress-summary__stat">
                    <span className="progress-summary__value">{unlockedLevels.length}</span>
                    <span className="progress-summary__label">Levels Unlocked</span>
                </div>
                <div className="progress-summary__stat">
                    <span className="progress-summary__value">
                        {levels.reduce((acc, l) => acc + l.signs.length, 0)}
                    </span>
                    <span className="progress-summary__label">Total Signs</span>
                </div>
            </div>
        </div>
    );
};

export default LevelSelector;
