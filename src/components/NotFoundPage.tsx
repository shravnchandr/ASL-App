import React from 'react';
import { Link } from 'react-router-dom';
import './NotFoundPage.css';

/** Shown for any URL the router doesn't know, instead of an empty page. */
export const NotFoundPage: React.FC = () => (
    <section className="not-found" aria-labelledby="not-found-title">
        <p className="not-found__eyebrow">PAGE NOT FOUND</p>
        <h1 id="not-found-title" className="not-found__title">We couldn't find that page</h1>
        <p className="not-found__text">
            The link may be out of date, or the address may have a typo.
        </p>
        <div className="not-found__actions">
            <Link to="/" className="not-found__btn not-found__btn--primary">Go to Home</Link>
            <Link to="/translate" className="not-found__btn">Translate a phrase</Link>
            <Link to="/dictionary" className="not-found__btn">Browse signs</Link>
        </div>
    </section>
);
