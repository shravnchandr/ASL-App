import { Link } from 'react-router-dom';
import './OnboardingPage.css';

const STEPS = [
    {
        label: 'Translate',
        title: 'Start with any English phrase.',
        text: 'ASL Guide turns your sentence into ASL order, then breaks it into sign-by-sign instructions.',
    },
    {
        label: 'Learn',
        title: 'Practice in short sessions.',
        text: 'Levels mix recognition, recall, word-to-sign choices, and camera practice so reviews stay varied.',
    },
    {
        label: 'Camera',
        title: 'Check your fingerspelling live.',
        text: 'Camera recognition runs in your browser and helps you hold letters long enough to build muscle memory.',
    },
];

export function OnboardingPage() {
    return (
        <div className="onboarding-page">
            <section className="onboarding-hero">
                <div className="onboarding-hero__copy">
                    <div className="onboarding-hero__eyebrow">ASL GUIDE · FIRST RUN</div>
                    <h1 className="onboarding-hero__title">
                        A quieter path into American Sign Language.
                    </h1>
                    <p className="onboarding-hero__text">
                        Translate, review, and practice signs without leaving the page. Everything is visual-first,
                        keyboard-friendly, and built for short repeat sessions.
                    </p>
                    <div className="onboarding-hero__actions">
                        <Link to="/translate" className="onboarding-btn onboarding-btn--primary">Try a phrase</Link>
                        <Link to="/learn" className="onboarding-btn">Start learning</Link>
                    </div>
                </div>

                <div className="onboarding-preview" aria-hidden="true">
                    <div className="onboarding-preview__top">
                        <span>GOOD MORNING</span>
                        <span>04 signs</span>
                    </div>
                    <div className="onboarding-preview__stage">
                        <svg viewBox="0 0 200 240" role="img">
                            <ellipse cx="100" cy="42" rx="22" ry="28" fill="none" stroke="currentColor" strokeWidth="3" />
                            <circle cx="93" cy="40" r="2" fill="currentColor" />
                            <circle cx="107" cy="40" r="2" fill="currentColor" />
                            <path d="M92 52 Q100 56 108 52" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M70 80 L130 80 L138 200 L62 200 Z" fill="none" stroke="currentColor" strokeWidth="3" />
                            <line x1="100" y1="90" x2="150" y2="160" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <line x1="100" y1="90" x2="58" y2="155" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <rect x="134" y="145" width="24" height="24" rx="4" fill="none" stroke="var(--md-sys-color-primary)" strokeWidth="2.5" />
                        </svg>
                    </div>
                    <div className="onboarding-preview__chips">
                        <span>GOOD</span>
                        <span>MORNING</span>
                        <span>HOW</span>
                        <span>YOU</span>
                    </div>
                </div>
            </section>

            <section className="onboarding-steps" aria-label="How ASL Guide works">
                {STEPS.map(step => (
                    <article className="onboarding-step" key={step.label}>
                        <div className="onboarding-step__label">{step.label}</div>
                        <h2>{step.title}</h2>
                        <p>{step.text}</p>
                    </article>
                ))}
            </section>
        </div>
    );
}

