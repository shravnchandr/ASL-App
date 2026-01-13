/**
 * General Feedback Modal Component
 * Allows users to submit bug reports, feature requests, and general feedback
 */

import { useState, useEffect, useRef } from 'react';
import { trapFocus, handleEscapeKey } from '../../utils/accessibility';
import './GeneralFeedbackModal.css';

interface GeneralFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (category: string, feedbackText: string, email?: string) => Promise<void>;
}

const CATEGORIES = [
    { value: 'bug', label: '🐛 Bug Report', description: 'Report a problem or error' },
    { value: 'feature', label: '✨ Feature Request', description: 'Suggest a new feature' },
    { value: 'general', label: '💬 General Feedback', description: 'Share your thoughts' },
    { value: 'ui_ux', label: '🎨 UI/UX Suggestion', description: 'Improve the design' },
];

export const GeneralFeedbackModal: React.FC<GeneralFeedbackModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
}) => {
    const [category, setCategory] = useState('general');
    const [feedbackText, setFeedbackText] = useState('');
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const charCount = feedbackText.length;
    const maxChars = 2000;
    const minChars = 10;
    const isValid = charCount >= minChars && charCount <= maxChars;

    useEffect(() => {
        if (!isOpen) return;

        const cleanup = modalRef.current ? trapFocus(modalRef.current) : () => { };
        const cleanupEscape = handleEscapeKey(onClose);
        document.body.style.overflow = 'hidden';

        // Focus textarea
        setTimeout(() => textareaRef.current?.focus(), 100);

        return () => {
            cleanup();
            cleanupEscape();
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(category, feedbackText, email || undefined);
            // Reset form
            setCategory('general');
            setFeedbackText('');
            setEmail('');
            onClose();
        } catch (error) {
            console.error('Failed to submit feedback:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div
                ref={modalRef}
                className="modal-container general-feedback-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="general-feedback-title"
            >
                <header className="modal-header">
                    <h2 id="general-feedback-title" className="modal-title">
                        💬 Send Feedback
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>

                <form className="modal-body" onSubmit={handleSubmit}>
                    <p className="modal-description">
                        We'd love to hear from you! Share your thoughts, report bugs, or suggest new features.
                    </p>

                    <div className="category-grid">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                type="button"
                                className={`category-card ${category === cat.value ? 'selected' : ''}`}
                                onClick={() => setCategory(cat.value)}
                                aria-pressed={category === cat.value}
                            >
                                <div className="category-label">{cat.label}</div>
                                <div className="category-description">{cat.description}</div>
                            </button>
                        ))}
                    </div>

                    <div className="form-group">
                        <label htmlFor="feedback-text" className="form-label">
                            Your Feedback *
                        </label>
                        <textarea
                            ref={textareaRef}
                            id="feedback-text"
                            className="form-textarea"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="Tell us what's on your mind..."
                            rows={6}
                            required
                            minLength={minChars}
                            maxLength={maxChars}
                        />
                        <div className={`char-counter ${!isValid && charCount > 0 ? 'invalid' : ''}`}>
                            {charCount}/{maxChars} characters
                            {charCount > 0 && charCount < minChars && (
                                <span className="char-hint"> (minimum {minChars})</span>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="feedback-email" className="form-label">
                            Email (optional)
                        </label>
                        <input
                            id="feedback-email"
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com (for follow-up)"
                        />
                        <p className="form-hint">We'll only use this to respond to your feedback</p>
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="button-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="button-primary"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? 'Sending...' : 'Send Feedback'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
