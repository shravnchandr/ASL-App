/**
 * FeedbackModal Component
 * Modal for collecting detailed feedback
 */

import React, { useState, useEffect, useRef } from 'react';
import { trapFocus, handleEscapeKey } from '../utils/accessibility';
import './FeedbackModal.css';

interface FeedbackModalProps {
    isOpen: boolean;
    rating: 'up' | 'down';
    query: string;
    onClose: () => void;
    onSubmit: (feedbackText: string) => void;
    isSubmitting?: boolean;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
    isOpen,
    rating,
    query,
    onClose,
    onSubmit,
    isSubmitting = false,
}) => {
    const [feedbackText, setFeedbackText] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        // Trap focus
        const cleanup = modalRef.current ? trapFocus(modalRef.current) : () => { };

        // Handle escape key
        const cleanupEscape = handleEscapeKey(onClose);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Focus textarea
        setTimeout(() => textareaRef.current?.focus(), 100);

        return () => {
            cleanup();
            cleanupEscape();
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(feedbackText.trim());
    };

    const handleSkip = () => {
        onSubmit('');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onClose} role="presentation">
            <div
                ref={modalRef}
                className="modal-container"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-description"
            >
                <header className="modal-header">
                    <h2 id="modal-title" className="modal-title">
                        {rating === 'up' ? '👍 Thanks for the positive feedback!' : '👎 Help us improve'}
                    </h2>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close feedback form"
                        disabled={isSubmitting}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>

                <div className="modal-body">
                    <p id="modal-description" className="modal-description">
                        {rating === 'up'
                            ? 'We\'re glad this translation was helpful! Want to share more details?'
                            : 'We\'d love to know how we can improve this translation.'
                        }
                    </p>

                    <div className="query-display">
                        <span className="query-label">Your query:</span>
                        <span className="query-text">"{query}"</span>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="feedback-text" className="form-label">
                                Additional feedback (optional)
                            </label>
                            <textarea
                                ref={textareaRef}
                                id="feedback-text"
                                className="form-textarea"
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                placeholder="Tell us more about your experience..."
                                rows={5}
                                maxLength={1000}
                                disabled={isSubmitting}
                            />
                            <span className="char-count" aria-live="polite">
                                {feedbackText.length}/1000 characters
                            </span>
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={handleSkip}
                                disabled={isSubmitting}
                            >
                                Skip
                            </button>
                            <button
                                type="submit"
                                className="button-primary"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
