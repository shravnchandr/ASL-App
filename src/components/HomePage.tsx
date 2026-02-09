/**
 * HomePage Component
 * Landing page for ASL Guide with options for Dictionary and Learn modes
 */

import React from 'react';
import { ThemeSwitcher } from './features/ThemeSwitcher';
import './HomePage.css';

interface HomePageProps {
    onSelectMode: (mode: 'dictionary' | 'learn' | 'camera') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectMode }) => {
    return (
        <div className="home-page">
            <div className="home-page__controls">
                <ThemeSwitcher />
            </div>

            <header className="home-page__header">
                <h1 className="home-page__title">ASL Guide</h1>
                <p className="home-page__subtitle">
                    Your companion for learning American Sign Language
                </p>
            </header>

            <main className="home-page__cards">
                <button
                    className="home-card home-card--dictionary"
                    onClick={() => onSelectMode('dictionary')}
                    aria-label="Text to Signs - Enter English phrases and get ASL instructions"
                >
                    <div className="home-card__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            <line x1="12" y1="6" x2="12" y2="10" />
                            <line x1="12" y1="14" x2="12" y2="14.01" />
                        </svg>
                    </div>
                    <h2 className="home-card__title">Text to Signs</h2>
                    <p className="home-card__description">
                        Enter any English phrase and get detailed ASL sign instructions with hand shapes, movements, and facial expressions.
                    </p>
                    <span className="home-card__cta" aria-hidden="true">
                        Start Translating
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </span>
                </button>

                <button
                    className="home-card home-card--learn"
                    onClick={() => onSelectMode('learn')}
                    aria-label="Learn Signs - Practice with interactive animations and quizzes"
                >
                    <div className="home-card__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 14l9-5-9-5-9 5 9 5z" />
                            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                            <path d="M12 14v7" />
                            <path d="M21 12v7" />
                        </svg>
                    </div>
                    <h2 className="home-card__title">Learn Signs</h2>
                    <p className="home-card__description">
                        Practice recognizing ASL signs through interactive animations. Test your knowledge with quizzes and track your progress.
                    </p>
                    <span className="home-card__cta" aria-hidden="true">
                        Start Learning
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </span>
                </button>

                <button
                    className="home-card home-card--camera"
                    onClick={() => onSelectMode('camera')}
                    aria-label="Live Camera - Use your camera to recognize ASL signs in real-time"
                >
                    <div className="home-card__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                    </div>
                    <h2 className="home-card__title">Live Camera</h2>
                    <p className="home-card__description">
                        Use your camera to recognize ASL alphabet signs in real-time. Practice fingerspelling and see instant feedback.
                    </p>
                    <span className="home-card__cta" aria-hidden="true">
                        Start Camera
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </span>
                </button>
            </main>

            <footer className="home-page__footer">
                <p>Powered by AI for accurate ASL guidance</p>
            </footer>
        </div>
    );
};

export default HomePage;
