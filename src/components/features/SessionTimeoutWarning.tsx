/**
 * Session Timeout Warning Component
 * Displays warning when session is about to timeout
 */

import './SessionTimeoutWarning.css';

interface SessionTimeoutWarningProps {
    timeRemaining: number;
    onDismiss: () => void;
}

export const SessionTimeoutWarning: React.FC<SessionTimeoutWarningProps> = ({
    timeRemaining,
    onDismiss,
}) => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;

    return (
        <div className="session-warning" role="alert" aria-live="assertive">
            <div className="warning-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor" />
                </svg>
                <div className="warning-text">
                    <strong>Session timeout warning</strong>
                    <p>
                        Your session will expire in {minutes}:{seconds.toString().padStart(2, '0')}
                    </p>
                </div>
                <button className="dismiss-button" onClick={onDismiss} aria-label="Dismiss warning">
                    I'm still here
                </button>
            </div>
        </div>
    );
};
