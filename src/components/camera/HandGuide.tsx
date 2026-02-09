/**
 * HandGuide Component
 * Visual guide to help users position their hand in the camera frame
 */

import './HandGuide.css';

interface HandGuideProps {
  isHandDetected: boolean;
  showGuide: boolean;
}

export function HandGuide({ isHandDetected, showGuide }: HandGuideProps) {
  if (!showGuide || isHandDetected) return null;

  return (
    <div className="hand-guide" aria-hidden="true">
      <div className="hand-guide__silhouette">
        <svg viewBox="0 0 100 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Simplified hand silhouette */}
          <path
            d="M50 10 L50 35 M42 15 L42 30 M58 15 L58 30 M34 25 L34 35 M66 25 L66 35
               M30 35 Q25 35 25 45 L25 90 Q25 100 35 100 L65 100 Q75 100 75 90 L75 45 Q75 35 70 35
               L30 35 Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 4"
            className="hand-guide__outline"
          />
        </svg>
      </div>
      <div className="hand-guide__message">
        Position your hand here
      </div>
      <div className="hand-guide__tips">
        <span>Keep hand steady</span>
        <span>Good lighting helps</span>
        <span>Plain background works best</span>
      </div>
    </div>
  );
}
