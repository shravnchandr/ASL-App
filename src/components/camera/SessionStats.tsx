/**
 * SessionStats Component
 * Displays camera session statistics (signs recognized, time, accuracy)
 */

import { useEffect, useState, useRef } from 'react';
import './SessionStats.css';

interface SessionStatsProps {
  signsRecognized: number;
  accuracy: number; // 0-100
}

export function SessionStats({ signsRecognized, accuracy }: SessionStatsProps) {
  const [sessionTime, setSessionTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Update session time every second
  useEffect(() => {
    // Initialize start time on mount
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setSessionTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="session-stats" aria-label="Session statistics">
      <div className="session-stats__item">
        <span className="session-stats__value">{signsRecognized}</span>
        <span className="session-stats__label">Signs</span>
      </div>
      <div className="session-stats__divider" />
      <div className="session-stats__item">
        <span className="session-stats__value">{formatTime(sessionTime)}</span>
        <span className="session-stats__label">Time</span>
      </div>
      {accuracy > 0 && (
        <>
          <div className="session-stats__divider" />
          <div className="session-stats__item">
            <span className="session-stats__value">{accuracy}%</span>
            <span className="session-stats__label">Accuracy</span>
          </div>
        </>
      )}
    </div>
  );
}
