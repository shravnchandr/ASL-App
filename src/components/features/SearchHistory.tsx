/**
 * Search History Component
 * Displays recent searches and favorites with quick access
 */

import { useApp } from '../../contexts/AppContext';
import './SearchHistory.css';

interface SearchHistoryProps {
    onSelectQuery: (query: string) => void;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({ onSelectQuery }) => {
    const { searchHistory, favorites, clearHistory, addFavorite, removeFavorite, isFavorite } = useApp();

    if (searchHistory.length === 0 && favorites.length === 0) {
        return null;
    }

    return (
        <div className="search-history">
            {favorites.length > 0 && (
                <section className="history-section">
                    <div className="section-header">
                        <h3 className="section-title">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M10 2L12.09 7.26L18 8.27L14 12.14L15.18 18.02L10 15.27L4.82 18.02L6 12.14L2 8.27L7.91 7.26L10 2Z" fill="currentColor" />
                            </svg>
                            Favorites
                        </h3>
                    </div>
                    <div className="history-items">
                        {favorites.map(({ query }) => (
                            <button
                                key={query}
                                className="history-item favorite-item"
                                onClick={() => onSelectQuery(query)}
                                aria-label={`Search for ${query}`}
                            >
                                <span className="item-text">{query}</span>
                                <button
                                    className="remove-favorite"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFavorite(query);
                                    }}
                                    aria-label={`Remove ${query} from favorites`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </button>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {searchHistory.length > 0 && (
                <section className="history-section">
                    <div className="section-header">
                        <h3 className="section-title">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z" stroke="currentColor" strokeWidth="2" />
                                <path d="M10 5V10L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            Recent Searches
                        </h3>
                        <button className="clear-history" onClick={clearHistory} aria-label="Clear search history">
                            Clear all
                        </button>
                    </div>
                    <div className="history-items">
                        {searchHistory.map((query) => (
                            <button
                                key={query}
                                className="history-item"
                                onClick={() => onSelectQuery(query)}
                                aria-label={`Search for ${query}`}
                            >
                                <span className="item-text">{query}</span>
                                <button
                                    className={`favorite-toggle ${isFavorite(query) ? 'is-favorite' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isFavorite(query)) {
                                            removeFavorite(query);
                                        } else {
                                            addFavorite(query);
                                        }
                                    }}
                                    aria-label={isFavorite(query) ? `Remove ${query} from favorites` : `Add ${query} to favorites`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M8 2L9.545 6.13L14 6.73L11 9.64L11.636 14.02L8 11.77L4.364 14.02L5 9.64L2 6.73L6.455 6.13L8 2Z" fill={isFavorite(query) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                </button>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};
