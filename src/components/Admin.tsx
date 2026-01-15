/**
 * Admin Panel Component
 * Provides interface for viewing and managing feedback
 */

import { useState, useEffect } from 'react';
import { getAdminFeedback, deleteAdminFeedback, getAdminStats } from '../services/api';
import type { PaginatedFeedback, AdminStats, FeedbackItem } from '../types';
import './Admin.css';

export function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Data states
  const [feedback, setFeedback] = useState<PaginatedFeedback | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Filter & pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [limit] = useState(50);

  // Load data when authenticated or filters change
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, currentPage, feedbackType]);

  const loadData = async () => {
    if (!adminPassword) return;

    setLoading(true);
    setError('');

    try {
      const [feedbackData, statsData] = await Promise.all([
        getAdminFeedback(adminPassword, currentPage, limit, feedbackType || undefined),
        getAdminStats(adminPassword),
      ]);

      setFeedback(feedbackData);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);

      // If unauthorized, log out
      if (message.includes('Invalid admin password')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test the password by fetching stats
      await getAdminStats(password);

      setAdminPassword(password);
      setIsAuthenticated(true);
      setPassword(''); // Clear password input
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminPassword('');
    setPassword('');
    setFeedback(null);
    setStats(null);
    setError('');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this feedback?')) {
      return;
    }

    setLoading(true);
    try {
      await deleteAdminFeedback(adminPassword, id);
      await loadData(); // Reload data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete feedback';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="admin-container">
        <div className="admin-login">
          <div className="admin-login-card">
            <h1 className="admin-title">Admin Panel</h1>
            <p className="admin-subtitle">Enter your admin password to access the dashboard</p>

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="admin-error" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" className="admin-button" disabled={loading || !password}>
                {loading ? 'Authenticating...' : 'Login'}
              </button>
            </form>

            <div className="admin-back">
              <a href="/">← Back to ASL Dictionary</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-content">
          <h1 className="admin-title">Admin Dashboard</h1>
          <button onClick={handleLogout} className="admin-logout-button">
            Logout
          </button>
        </div>
      </header>

      <main className="admin-main">
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}

        {/* Statistics */}
        {stats && (
          <section className="admin-stats">
            <h2 className="section-title">Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.total_feedback}</div>
                <div className="stat-label">Total Feedback</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.thumbs_up}</div>
                <div className="stat-label">Thumbs Up</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.thumbs_down}</div>
                <div className="stat-label">Thumbs Down</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.with_text_feedback}</div>
                <div className="stat-label">With Comments</div>
              </div>
            </div>

            {Object.keys(stats.by_type).length > 0 && (
              <div className="stats-breakdown">
                <h3>By Type</h3>
                <div className="breakdown-items">
                  {Object.entries(stats.by_type).map(([type, count]) => (
                    <div key={type} className="breakdown-item">
                      <span className="breakdown-label">{type}</span>
                      <span className="breakdown-value">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(stats.by_category).length > 0 && (
              <div className="stats-breakdown">
                <h3>By Category</h3>
                <div className="breakdown-items">
                  {Object.entries(stats.by_category).map(([category, count]) => (
                    <div key={category} className="breakdown-item">
                      <span className="breakdown-label">{category}</span>
                      <span className="breakdown-value">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Feedback List */}
        <section className="admin-feedback">
          <div className="feedback-header">
            <h2 className="section-title">Feedback Entries</h2>

            <div className="feedback-filters">
              <label htmlFor="feedback-type">Filter by type:</label>
              <select
                id="feedback-type"
                value={feedbackType}
                onChange={(e) => {
                  setFeedbackType(e.target.value);
                  setCurrentPage(1); // Reset to first page
                }}
              >
                <option value="">All Types</option>
                <option value="translation">Translation</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          {loading && <div className="admin-loading">Loading...</div>}

          {feedback && feedback.items.length === 0 && (
            <div className="admin-empty">No feedback entries found</div>
          )}

          {feedback && feedback.items.length > 0 && (
            <>
              <div className="feedback-table-container">
                <table className="feedback-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Query</th>
                      <th>Rating</th>
                      <th>Category</th>
                      <th>Feedback</th>
                      <th>Email</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.items.map((item: FeedbackItem) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>
                          <span className={`badge badge-${item.feedback_type}`}>
                            {item.feedback_type}
                          </span>
                        </td>
                        <td>{item.query || '-'}</td>
                        <td>
                          {item.rating ? (
                            <span className={`rating rating-${item.rating}`}>
                              {item.rating === 'up' ? '👍' : '👎'}
                            </span>
                          ) : '-'}
                        </td>
                        <td>{item.category || '-'}</td>
                        <td className="feedback-text">
                          {item.feedback_text || '-'}
                        </td>
                        <td>{item.email || '-'}</td>
                        <td className="timestamp">{formatDate(item.timestamp)}</td>
                        <td>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="delete-button"
                            disabled={loading}
                            title="Delete this feedback"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {feedback.pages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                    className="pagination-button"
                  >
                    Previous
                  </button>

                  <span className="pagination-info">
                    Page {currentPage} of {feedback.pages} ({feedback.total} total)
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(feedback.pages, p + 1))}
                    disabled={currentPage === feedback.pages || loading}
                    className="pagination-button"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
