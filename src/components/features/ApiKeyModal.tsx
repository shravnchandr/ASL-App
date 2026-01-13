/**
 * API Key Modal Component
 * Allows users to input their own Gemini API key with instructions
 */

import { useState, useEffect, useRef } from 'react';
import { trapFocus, handleEscapeKey } from '../../utils/accessibility';
import { useApp } from '../../contexts/AppContext';
import './ApiKeyModal.css';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
    const { customApiKey, setCustomApiKey } = useApp();
    const [apiKey, setApiKey] = useState(customApiKey || '');
    const [showInstructions, setShowInstructions] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const cleanup = modalRef.current ? trapFocus(modalRef.current) : () => { };
        const cleanupEscape = handleEscapeKey(onClose);
        document.body.style.overflow = 'hidden';

        return () => {
            cleanup();
            cleanupEscape();
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleSave = () => {
        if (apiKey.trim()) {
            setCustomApiKey(apiKey.trim());
            onClose();
        }
    };

    const handleRemove = () => {
        setCustomApiKey(null);
        setApiKey('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div
                ref={modalRef}
                className="modal-container api-key-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-key-modal-title"
            >
                <header className="modal-header">
                    <h2 id="api-key-modal-title" className="modal-title">
                        🔑 Custom API Key
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>

                <div className="modal-body">
                    <p className="modal-description">
                        Use your own Google Gemini API key for unlimited translations. Your key is stored locally and never sent to our servers.
                    </p>

                    <div className="form-group">
                        <label htmlFor="api-key-input" className="form-label">
                            Google Gemini API Key
                        </label>
                        <input
                            id="api-key-input"
                            type="password"
                            className="form-input"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key..."
                            autoComplete="off"
                        />
                    </div>

                    <button
                        className="instructions-toggle"
                        onClick={() => setShowInstructions(!showInstructions)}
                        aria-expanded={showInstructions}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z" fill="currentColor" />
                        </svg>
                        {showInstructions ? 'Hide' : 'Show'} instructions
                    </button>

                    {showInstructions && (
                        <div className="instructions-panel">
                            <h3 className="instructions-title">How to get your API key:</h3>
                            <ol className="instructions-list">
                                <li>
                                    Visit{' '}
                                    <a
                                        href="https://makersuite.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="external-link"
                                    >
                                        Google AI Studio
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                            <path d="M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333M10 2H14M14 2V6M14 2L6.66667 9.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </a>
                                </li>
                                <li>Sign in with your Google account</li>
                                <li>Click "Get API Key" or "Create API Key"</li>
                                <li>Copy the generated API key</li>
                                <li>Paste it in the field above and click "Save"</li>
                            </ol>
                            <div className="instructions-note">
                                <strong>Note:</strong> The API key is free to create and includes a generous free tier. Your key is stored only in your browser's local storage.
                            </div>
                        </div>
                    )}

                    <div className="modal-actions">
                        {customApiKey && (
                            <button type="button" className="button-danger" onClick={handleRemove}>
                                Remove Key
                            </button>
                        )}
                        <button type="button" className="button-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="button-primary"
                            onClick={handleSave}
                            disabled={!apiKey.trim()}
                        >
                            Save Key
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
