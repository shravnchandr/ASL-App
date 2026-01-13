/**
 * LoadingState Component
 * Animated loading indicator with Ocean Blue/Teal gradient
 */

import React from 'react';
import './LoadingState.css';

export const LoadingState: React.FC = () => {
    return (
        <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-animation">
                <div className="wave wave-1"></div>
                <div className="wave wave-2"></div>
                <div className="wave wave-3"></div>
            </div>
            <p className="loading-text">Translating to ASL...</p>
            <span className="sr-only">Loading translation results</span>
        </div>
    );
};
