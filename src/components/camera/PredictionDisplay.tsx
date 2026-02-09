import './PredictionDisplay.css';

interface PredictionDisplayProps {
  prediction: string | null;
  confidence: number;
  isHandDetected: boolean;
  holdProgress?: number; // 0-1 progress towards adding letter
}

export function PredictionDisplay({ prediction, confidence, isHandDetected, holdProgress = 0 }: PredictionDisplayProps) {
  // Format the prediction label for display
  const formatLabel = (label: string): string => {
    // Already single character (letter or digit)
    return label.toUpperCase();
  };

  // Determine confidence level for styling
  const getConfidenceLevel = (): string => {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.7) return 'medium';
    return 'low';
  };

  return (
    <div className="prediction-display" role="status" aria-live="polite" aria-atomic="true">
      {isHandDetected && prediction ? (
        <div className={`prediction-card prediction-card--${getConfidenceLevel()}`} aria-label={`Detected sign: ${formatLabel(prediction)}, ${Math.round(confidence * 100)}% confident`}>
          <span className="prediction-card__letter">
            {formatLabel(prediction)}
          </span>
          <span className="prediction-card__confidence">
            {Math.round(confidence * 100)}% confident
          </span>
          {holdProgress > 0 && confidence > 0.8 && (
            <div className="prediction-card__progress">
              <div
                className="prediction-card__progress-bar"
                style={{ width: `${holdProgress * 100}%` }}
              />
            </div>
          )}
          {holdProgress > 0 && confidence > 0.8 && (
            <span className="prediction-card__hold-hint">
              Hold to add letter...
            </span>
          )}
        </div>
      ) : (
        <div className="prediction-card prediction-card--empty">
          <span className="prediction-card__hint">
            {isHandDetected ? 'Processing...' : 'Show your hand to start'}
          </span>
        </div>
      )}
    </div>
  );
}
