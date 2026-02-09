import { useState, useCallback } from 'react';
import './SpellingDisplay.css';

interface SpellingDisplayProps {
  letters: string[];
  onClear: () => void;
  onBackspace: () => void;
}

export function SpellingDisplay({ letters, onClear, onBackspace }: SpellingDisplayProps) {
  const [copied, setCopied] = useState(false);

  const word = letters.join('').toUpperCase();

  const handleCopy = useCallback(async () => {
    if (word.length === 0) return;

    try {
      await navigator.clipboard.writeText(word);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [word]);

  const handleSpeak = useCallback(() => {
    if (word.length === 0 || !('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.8;
    speechSynthesis.speak(utterance);
  }, [word]);

  return (
    <div className="spelling-display" role="region" aria-label="Spelled word">
      <div className="spelling-display__header">
        <span className="spelling-display__label">Spelled Word</span>
        <div className="spelling-display__actions">
          {word.length > 0 && (
            <>
              <button
                className="spelling-display__btn"
                onClick={handleSpeak}
                aria-label="Speak word"
                title="Speak word"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
              <button
                className="spelling-display__btn"
                onClick={handleCopy}
                aria-label={copied ? 'Copied!' : 'Copy word'}
                title={copied ? 'Copied!' : 'Copy word'}
              >
                {copied ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              <button
                className="spelling-display__btn"
                onClick={onBackspace}
                aria-label="Delete last letter"
                title="Backspace"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
              <button
                className="spelling-display__btn spelling-display__btn--clear"
                onClick={onClear}
                aria-label="Clear all letters"
                title="Clear"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="spelling-display__word">
        {word.length > 0 ? (
          <span className="spelling-display__letters">
            {letters.map((letter, index) => (
              <span
                key={index}
                className={`spelling-display__letter ${index === letters.length - 1 ? 'spelling-display__letter--latest' : ''}`}
              >
                {letter.toUpperCase()}
              </span>
            ))}
          </span>
        ) : (
          <span className="spelling-display__placeholder">
            Sign letters to spell a word...
          </span>
        )}
      </div>

      {word.length > 0 && (
        <div className="spelling-display__hint">
          Hold a sign steady to add a letter
        </div>
      )}
    </div>
  );
}
