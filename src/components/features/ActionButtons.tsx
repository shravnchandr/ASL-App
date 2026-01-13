/**
 * Action Buttons Component
 * Share, Print, and Favorite buttons for translation results
 */

import { useState } from 'react';
import { share } from '../../utils/share';
import { print } from '../../utils/print';
import { useApp } from '../../contexts/AppContext';
import { announceToScreenReader } from '../../utils/accessibility';
import './ActionButtons.css';

interface ActionButtonsProps {
    query: string;
    signsCount: number;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ query, signsCount }) => {
    const { isFavorite, addFavorite, removeFavorite } = useApp();
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const favorite = isFavorite(query);

    const handleShare = async () => {
        const shareText = share.formatTranslationForSharing(query, signsCount);
        const success = await share.shareContent({
            title: `ASL Translation: ${query}`,
            text: shareText,
            url: share.generateShareUrl(query),
        });

        if (success) {
            setShowCopySuccess(true);
            announceToScreenReader('Translation shared successfully', 'polite');
            setTimeout(() => setShowCopySuccess(false), 3000);
        }
    };

    const handlePrint = () => {
        print.printPage();
        announceToScreenReader('Opening print dialog', 'polite');
    };

    const handleFavorite = () => {
        if (favorite) {
            removeFavorite(query);
            announceToScreenReader(`Removed "${query}" from favorites`, 'polite');
        } else {
            addFavorite(query);
            announceToScreenReader(`Added "${query}" to favorites`, 'polite');
        }
    };

    return (
        <div className="action-buttons">
            <button
                className={`action-button ${favorite ? 'is-favorite' : ''}`}
                onClick={handleFavorite}
                aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={favorite}
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L12.09 7.26L18 8.27L14 12.14L15.18 18.02L10 15.27L4.82 18.02L6 12.14L2 8.27L7.91 7.26L10 2Z" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>{favorite ? 'Saved' : 'Save'}</span>
            </button>

            <button
                className="action-button"
                onClick={handleShare}
                aria-label="Share translation"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M15 6.66667C16.3807 6.66667 17.5 5.54738 17.5 4.16667C17.5 2.78595 16.3807 1.66667 15 1.66667C13.6193 1.66667 12.5 2.78595 12.5 4.16667C12.5 5.54738 13.6193 6.66667 15 6.66667Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 12.5C6.38071 12.5 7.5 11.3807 7.5 10C7.5 8.61929 6.38071 7.5 5 7.5C3.61929 7.5 2.5 8.61929 2.5 10C2.5 11.3807 3.61929 12.5 5 12.5Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 18.3333C16.3807 18.3333 17.5 17.214 17.5 15.8333C17.5 14.4526 16.3807 13.3333 15 13.3333C13.6193 13.3333 12.5 14.4526 12.5 15.8333C12.5 17.214 13.6193 18.3333 15 18.3333Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M7.15833 11.175L12.85 14.6583M12.8417 5.34167L7.15833 8.825" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>Share</span>
            </button>

            <button
                className="action-button"
                onClick={handlePrint}
                aria-label="Print translation"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 6.66667V2.5H15V6.66667M5 15H3.33333C2.89131 15 2.46738 14.8244 2.15482 14.5118C1.84226 14.1993 1.66667 13.7754 1.66667 13.3333V9.16667C1.66667 8.72464 1.84226 8.30072 2.15482 7.98816C2.46738 7.67559 2.89131 7.5 3.33333 7.5H16.6667C17.1087 7.5 17.5326 7.67559 17.8452 7.98816C18.1577 8.30072 18.3333 8.72464 18.3333 9.16667V13.3333C18.3333 13.7754 18.1577 14.1993 17.8452 14.5118C17.5326 14.8244 17.1087 15 16.6667 15H15M5 12.5H15V17.5H5V12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Print</span>
            </button>

            {showCopySuccess && (
                <div className="copy-success" role="status" aria-live="polite">
                    ✓ Copied to clipboard
                </div>
            )}
        </div>
    );
};
