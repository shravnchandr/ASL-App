/**
 * Session Timeout Hook
 * Monitors user activity and warns before session timeout
 */

import { useEffect, useState, useCallback } from 'react';
import { storage } from '../utils/storage';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION = 5 * 60 * 1000; // 5 minutes before timeout

export function useSessionTimeout(onTimeout?: () => void) {
    const [showWarning, setShowWarning] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(0);

    const updateActivity = useCallback(() => {
        storage.updateLastActivity();
        setShowWarning(false);
    }, []);

    const dismissWarning = useCallback(() => {
        updateActivity();
        setShowWarning(false);
    }, [updateActivity]);

    useEffect(() => {
        const checkActivity = () => {
            const lastActivity = storage.getLastActivity();
            const timeSinceActivity = Date.now() - lastActivity;
            const remaining = TIMEOUT_DURATION - timeSinceActivity;

            if (remaining <= 0) {
                // Session timed out
                setShowWarning(false);
                onTimeout?.();
            } else if (remaining <= WARNING_DURATION) {
                // Show warning
                setShowWarning(true);
                setTimeRemaining(Math.ceil(remaining / 1000)); // Convert to seconds
            } else {
                setShowWarning(false);
            }
        };

        // Check activity every 10 seconds
        const interval = setInterval(checkActivity, 10000);

        // Track user activity
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(event => {
            window.addEventListener(event, updateActivity);
        });

        // Initial check
        checkActivity();

        return () => {
            clearInterval(interval);
            events.forEach(event => {
                window.removeEventListener(event, updateActivity);
            });
        };
    }, [onTimeout, updateActivity]);

    return {
        showWarning,
        timeRemaining,
        dismissWarning,
    };
}
