/**
 * Learning Disclaimer Component
 * Clarifies that this is a study tool, not a replacement for proper ASL instruction
 */

import './LearningDisclaimer.css';

export function LearningDisclaimer() {
    return (
        <div className="learning-disclaimer" role="note">
            <div className="disclaimer-icon" aria-hidden="true">
                📚
            </div>
            <div className="disclaimer-content">
                <strong>Study Tool:</strong> These AI-generated descriptions help you understand sign structure.
                Always watch video tutorials and practice with fluent signers to learn correctly!
            </div>
        </div>
    );
}
