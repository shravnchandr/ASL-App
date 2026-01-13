/**
 * FeedbackWidget Component
 * Thumbs up/down buttons with expressive animations
 */

import React, { useState } from 'react';
import './FeedbackWidget.css';

interface FeedbackWidgetProps {
    onFeedbackClick: (rating: 'up' | 'down') => void;
    disabled?: boolean;
}

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ onFeedbackClick, disabled = false }) => {
    const [selectedRating, setSelectedRating] = useState<'up' | 'down' | null>(null);

    const handleClick = (rating: 'up' | 'down') => {
        if (disabled) return;
        setSelectedRating(rating);
        onFeedbackClick(rating);
    };

    return (
        <div className="feedback-widget" role="group" aria-label="Rate this translation">
            <p className="feedback-prompt">Was this translation helpful?</p>

            <div className="feedback-buttons">
                <button
                    className={`feedback-button thumbs-up ${selectedRating === 'up' ? 'selected' : ''}`}
                    onClick={() => handleClick('up')}
                    disabled={disabled}
                    aria-label="Yes, this was helpful"
                    aria-pressed={selectedRating === 'up'}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 22V11M2 13V20C2 21.1046 2.89543 22 4 22H16.4262C17.907 22 19.1662 20.9197 19.3914 19.4562L20.4683 12.4562C20.7479 10.6389 19.3418 9 17.5031 9H14V4C14 2.89543 13.1046 2 12 2C11.4477 2 11 2.44772 11 3V3.5C11 4.24583 10.7542 4.96911 10.3025 5.55295L7.49741 9.15076C7.18512 9.54723 7 10.0444 7 10.5585V11M7 11H4C2.89543 11 2 11.8954 2 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Helpful</span>
                </button>

                <button
                    className={`feedback-button thumbs-down ${selectedRating === 'down' ? 'selected' : ''}`}
                    onClick={() => handleClick('down')}
                    disabled={disabled}
                    aria-label="No, this needs improvement"
                    aria-pressed={selectedRating === 'down'}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M17 2V13M22 11V4C22 2.89543 21.1046 2 20 2H7.57377C6.09297 2 4.83379 3.08031 4.60859 4.54377L3.53165 11.5438C3.25211 13.3611 4.65823 15 6.49689 15H10V20C10 21.1046 10.8954 22 12 22C12.5523 22 13 21.5523 13 21V20.5C13 19.7542 13.2458 19.0309 13.6975 18.447L16.5026 14.8492C16.8149 14.4528 17 13.9556 17 13.4415V13M17 13H20C21.1046 13 22 12.1046 22 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Needs work</span>
                </button>
            </div>
        </div>
    );
};
