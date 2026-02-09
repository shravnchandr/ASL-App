/**
 * CameraTutorial Component
 * Onboarding guide for first-time camera users
 */

import { useState, useEffect, useCallback } from 'react';
import './CameraTutorial.css';

const TUTORIAL_KEY = 'asl_camera_tutorial_seen';

interface TutorialStep {
  icon: string;
  title: string;
  description: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '✋',
    title: 'Show Your Hand',
    description: 'Position your hand clearly in front of the camera. Good lighting helps!',
  },
  {
    icon: '🤟',
    title: 'Sign Letters',
    description: 'Make ASL alphabet or number signs. The app will recognize them in real-time.',
  },
  {
    icon: '⏱️',
    title: 'Hold to Spell',
    description: 'Hold a sign steady for 1 second to add it to your spelled word.',
  },
  {
    icon: '📋',
    title: 'Copy & Speak',
    description: 'Use the buttons to copy your spelled word or have it spoken aloud.',
  },
];

interface CameraTutorialProps {
  onComplete: () => void;
}

// Check if tutorial has been seen (called once at module load)
function hasSeenTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TUTORIAL_KEY) === 'true';
}

export function CameraTutorial({ onComplete }: CameraTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  // Initialize visibility based on localStorage (no effect needed)
  const [isVisible, setIsVisible] = useState(() => !hasSeenTutorial());

  // Call onComplete if already seen (on mount only)
  useEffect(() => {
    if (!isVisible) {
      onComplete();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback(() => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    setIsVisible(false);
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, handleComplete]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  if (!isVisible) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  return (
    <div className="camera-tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="camera-tutorial__backdrop" onClick={handleSkip} />
      <div className="camera-tutorial__content">
        <button
          className="camera-tutorial__skip"
          onClick={handleSkip}
          aria-label="Skip tutorial"
        >
          Skip
        </button>

        <div className="camera-tutorial__step">
          <div className="camera-tutorial__icon">{step.icon}</div>
          <h2 id="tutorial-title" className="camera-tutorial__title">{step.title}</h2>
          <p className="camera-tutorial__description">{step.description}</p>
        </div>

        <div className="camera-tutorial__progress">
          {TUTORIAL_STEPS.map((_, index) => (
            <div
              key={index}
              className={`camera-tutorial__dot ${index === currentStep ? 'camera-tutorial__dot--active' : ''} ${index < currentStep ? 'camera-tutorial__dot--completed' : ''}`}
            />
          ))}
        </div>

        <div className="camera-tutorial__actions">
          {currentStep > 0 && (
            <button
              className="camera-tutorial__btn camera-tutorial__btn--secondary"
              onClick={() => setCurrentStep(prev => prev - 1)}
            >
              Back
            </button>
          )}
          <button
            className="camera-tutorial__btn camera-tutorial__btn--primary"
            onClick={handleNext}
          >
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

