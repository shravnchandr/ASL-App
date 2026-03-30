/**
 * LoadingState Component
 * Animated loading indicator with step-by-step progress messaging
 */

import React, { useState, useEffect } from 'react';
import './LoadingState.css';

const STEPS = [
    'Analyzing ASL grammar...',
    'Applying grammar rules...',
    'Looking up verified signs...',
    'Generating sign descriptions...',
];

export const LoadingState: React.FC = () => {
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        const intervals = [1800, 2200, 2600];
        const timers = intervals.map((delay, i) =>
            setTimeout(() => setStepIndex(i + 1), delay)
        );
        return () => timers.forEach(clearTimeout);
    }, []);

    return (
        <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-animation">
                <div className="wave wave-1"></div>
                <div className="wave wave-2"></div>
                <div className="wave wave-3"></div>
            </div>
            <p className="loading-text">{STEPS[stepIndex]}</p>
            <div className="loading-steps" aria-hidden="true">
                {STEPS.map((_, i) => (
                    <span
                        key={i}
                        className={`loading-step-dot ${i <= stepIndex ? 'loading-step-dot--active' : ''}`}
                    />
                ))}
            </div>
            <span className="sr-only">Loading translation results</span>
        </div>
    );
};
