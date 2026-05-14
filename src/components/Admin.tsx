import { useState, useEffect, useCallback } from 'react';
import { getAdminFeedback, deleteAdminFeedback, getAdminStats, getAnalyticsOverview } from '../services/api/admin';
import type { PaginatedFeedback, AdminStats, FeedbackItem, AnalyticsOverview } from '../types';
import './Admin.css';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="sparkline-empty" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 110, H = 34;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - 3 - ((v - min) / range) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true" className="sparkline-svg">
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'teal';
  badge?: string;
  sparkValues?: number[];
}

function StatCard({ label, value, color, badge, sparkValues }: StatCardProps) {
  const colorMap = {
    blue:   { val: '#4A78E8', bg: '#EBF1FD', spark: '#4A78E8' },
    green:  { val: '#2DC87A', bg: '#E6F8F0', spark: '#2DC87A' },
    red:    { val: '#E84848', bg: '#FEEEEE', spark: '#E84848' },
    orange: { val: '#F06A20', bg: '#FEF2E8', spark: '#F06A20' },
    purple: { val: '#7C6FE0', bg: '#EFEDFB', spark: '#7C6FE0' },
    teal:   { val: '#22B5AD', bg: '#E4F6F5', spark: '#22B5AD' },
  };
  const c = colorMap[color];
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {badge && (
          <span className="stat-card-badge" style={{ background: c.bg, color: c.val }}>
            {badge}
          </span>
        )}
      </div>
      <div className="stat-card-value" style={{ color: c.val }}>{value}</div>
      <div className="stat-card-bottom">
        {sparkValues && sparkValues.length >= 2
          ? <Sparkline values={sparkValues} color={c.spark} />
          : <div className="sparkline-empty" />
        }
      </div>
    </div>
  );
}

function DailyUsersChart({ data }: { data: Array<{ date: string; unique_users: number }> }) {
  if (!data.length) return <p className="chart-empty">No daily data yet</p>;

  // Pad to 14 days so the chart always has enough bars to fill its width.
  // Without this, a single-bar viewBox (18px wide) stretched to 100% width makes
  // the bar fill the entire card.
  const padded = (() => {
    const byDate = new Map(data.map(d => [d.date.split('T')[0], d.unique_users]));
    const days: Array<{ date: string; unique_users: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push({ date: key, unique_users: byDate.get(key) ?? 0 });
    }
    return days;
  })();

  const max = Math.max(...padded.map(d => d.unique_users), 1);
  const BAR_W = 18, GAP = 6, CHART_H = 140, LABEL_H = 22;
  const totalW = padded.length * (BAR_W + GAP) - GAP;

  return (
    <div className="bar-chart-scroll">
      <svg
        width="100%"
        viewBox={`0 0 ${totalW} ${CHART_H + LABEL_H}`}
        preserveAspectRatio="none"
        className="bar-chart-svg"
        aria-label="Daily active users chart"
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C6FE0" />
            <stop offset="100%" stopColor="#B3ACEF" />
          </linearGradient>
        </defs>
        {padded.map((d, i) => {
          const barH = Math.max((d.unique_users / max) * CHART_H, 2);
          const x = i * (BAR_W + GAP);
          const y = CHART_H - barH;
          const day = d.date.split('T')[0].split('-')[2];
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={4} fill="url(#barGrad)">
                <title>{d.date.split('T')[0]}: {d.unique_users} users</title>
              </rect>
              <text
                x={x + BAR_W / 2}
                y={CHART_H + LABEL_H - 5}
                textAnchor="middle"
                className="bar-day-label"
                fontSize="8"
              >
                {day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'feedback' | 'analytics'>('analytics');
  const [feedback, setFeedback] = useState<PaginatedFeedback | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [limit] = useState(50);

  const loadData = useCallback(async () => {
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
      if (message.includes('Invalid admin password')) {
        setIsAuthenticated(false);
        setAdminPassword('');
        setPassword('');
        setFeedback(null);
        setStats(null);
        setAnalytics(null);
      }
    } finally {
      setLoading(false);
    }
  }, [adminPassword, currentPage, limit, feedbackType]);

  const loadAnalytics = useCallback(async () => {
    if (!adminPassword) return;
    setLoading(true);
    setError('');
    try {
      const analyticsData = await getAnalyticsOverview(adminPassword);
      setAnalytics(analyticsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
      if (message.includes('Invalid admin password')) {
        setIsAuthenticated(false);
        setAdminPassword('');
        setPassword('');
        setFeedback(null);
        setStats(null);
        setAnalytics(null);
      }
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'feedback') loadData();
      else if (activeTab === 'analytics') loadAnalytics();
    }
  }, [isAuthenticated, activeTab, loadData, loadAnalytics]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await getAdminStats(password);
      setAdminPassword(password);
      setIsAuthenticated(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
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
    setAnalytics(null);
    setError('');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this feedback entry?')) return;
    setLoading(true);
    try {
      await deleteAdminFeedback(adminPassword, id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return `${m}m ago`;
  };

  // ── Login ──────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="admin-root">
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-emoji">🤟</div>
            <h1 className="login-title">ASL Admin</h1>
            <p className="login-sub">Enter your password to continue</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="login-field">
                <label htmlFor="adm-pw">Password</label>
                <input
                  id="adm-pw"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Admin password"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
              {error && <p className="login-error" role="alert">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading || !password}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <a href="/" className="login-back">← Back to app</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  const dailyValues = analytics?.daily_active_users.map(d => d.unique_users) ?? [];
  const last7Values = analytics?.daily_active_users.slice(-7).map(d => d.unique_users) ?? [];
  const positiveRate = stats
    ? (stats.thumbs_up + stats.thumbs_down > 0
        ? Math.round((stats.thumbs_up / (stats.thumbs_up + stats.thumbs_down)) * 100)
        : 0)
    : 0;

  return (
    <div className="admin-root">
      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-inner">
          <div className="adm-brand">
            <span className="adm-brand-icon">🤟</span>
            <span className="adm-brand-name">ASL Admin</span>
          </div>
          <nav className="adm-tabs">
            <button
              className={`adm-tab ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              Analytics
            </button>
            <button
              className={`adm-tab ${activeTab === 'feedback' ? 'active' : ''}`}
              onClick={() => setActiveTab('feedback')}
            >
              Feedback
            </button>
          </nav>
          <button onClick={handleLogout} className="adm-signout">Sign out</button>
        </div>
      </header>

      <main className="adm-main">
        {error && <div className="adm-error" role="alert">{error}</div>}

        {/* ── Analytics tab ── */}
        {activeTab === 'analytics' && (
          <>
            {loading && !analytics && <p className="adm-loading">Loading analytics…</p>}
            {!loading && !analytics && !error && (
              <p className="adm-empty">No analytics data yet — start using the app!</p>
            )}

            {analytics && (
              <>
                {/* Stat cards */}
                <div className="stat-grid">
                  <StatCard
                    label="Users Today"
                    value={analytics.unique_users_today.toLocaleString()}
                    color="purple"
                    badge={last7Values.length > 1
                      ? `${last7Values[last7Values.length - 1] >= last7Values[last7Values.length - 2] ? '+' : ''}${last7Values[last7Values.length - 1] - last7Values[Math.max(0, last7Values.length - 2)]} vs yesterday`
                      : undefined}
                    sparkValues={last7Values}
                  />
                  <StatCard
                    label="Users (7 days)"
                    value={analytics.unique_users_7d.toLocaleString()}
                    color="blue"
                    sparkValues={last7Values}
                  />
                  <StatCard
                    label="Users (30 days)"
                    value={analytics.unique_users_30d.toLocaleString()}
                    color="teal"
                    sparkValues={dailyValues}
                  />
                  <StatCard
                    label="Total Translations"
                    value={analytics.translations.total.toLocaleString()}
                    color="orange"
                    badge={`${analytics.translations.cache_hit_rate.toFixed(0)}% cached`}
                    sparkValues={dailyValues}
                  />
                </div>

                {/* Two-column section */}
                <div className="adm-two-col">
                  {/* Daily users chart */}
                  <div className="adm-card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">Daily active users</h2>
                        <p className="card-sub">Last {analytics.daily_active_users.slice(-14).length} days</p>
                      </div>
                    </div>
                    <DailyUsersChart data={analytics.daily_active_users.slice(-14)} />
                  </div>

                  {/* Popular searches */}
                  <div className="adm-card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">Popular searches</h2>
                        <p className="card-sub">Last 30 days</p>
                      </div>
                      {analytics.popular_searches.length > 0 && (
                        <span className="card-count">Top {analytics.popular_searches.length}</span>
                      )}
                    </div>
                    {analytics.popular_searches.length === 0 ? (
                      <p className="adm-empty">No searches recorded yet</p>
                    ) : (
                      <div className="search-list">
                        {analytics.popular_searches.map((s, i) => (
                          <div key={s.query} className="search-row">
                            <span className="search-rank">{i + 1}</span>
                            <span className="search-query">{s.query}</span>
                            <span className="search-count">{s.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Translation performance */}
                <div className="adm-card">
                  <div className="card-header">
                    <h2 className="card-title">Translation performance</h2>
                  </div>
                  <div className="perf-grid">
                    {[
                      { label: 'Cache hits',   value: analytics.translations.cache_hits.toLocaleString(),  color: 'green'  as const },
                      { label: 'Cache misses', value: analytics.translations.cache_misses.toLocaleString(), color: 'orange' as const },
                      { label: 'Hit rate',     value: `${analytics.translations.cache_hit_rate.toFixed(1)}%`, color: 'blue' as const },
                      { label: 'Total',        value: analytics.translations.total.toLocaleString(),        color: 'purple' as const },
                    ].map(p => (
                      <div key={p.label} className={`perf-item perf-${p.color}`}>
                        <span className="perf-val">{p.value}</span>
                        <span className="perf-label">{p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Feedback tab ── */}
        {activeTab === 'feedback' && (
          <>
            {/* Stats row */}
            {stats && (
              <div className="stat-grid">
                <StatCard
                  label="Total Feedback"
                  value={stats.total_feedback.toLocaleString()}
                  color="blue"
                  badge={`${positiveRate}% positive`}
                />
                <StatCard
                  label="Thumbs Up"
                  value={stats.thumbs_up.toLocaleString()}
                  color="green"
                  badge="👍"
                />
                <StatCard
                  label="Thumbs Down"
                  value={stats.thumbs_down.toLocaleString()}
                  color="red"
                  badge="👎"
                />
                <StatCard
                  label="With Comments"
                  value={stats.with_text_feedback.toLocaleString()}
                  color="purple"
                  badge="text"
                />
              </div>
            )}

            {/* Feedback table */}
            <div className="adm-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Feedback entries</h2>
                  {feedback && <p className="card-sub">{feedback.total.toLocaleString()} total</p>}
                </div>
                <div className="card-actions">
                  <select
                    value={feedbackType}
                    onChange={e => { setFeedbackType(e.target.value); setCurrentPage(1); }}
                    className="filter-select"
                    aria-label="Filter by type"
                  >
                    <option value="">All types</option>
                    <option value="translation">Translation</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              {loading && <p className="adm-loading">Loading…</p>}

              {!loading && feedback && feedback.items.length === 0 && (
                <p className="adm-empty">No feedback entries found</p>
              )}

              {feedback && feedback.items.length > 0 && (
                <>
                  <div className="table-scroll">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Query</th>
                          <th>Rating</th>
                          <th>Category</th>
                          <th>Comment</th>
                          <th>Submitted</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.items.map((item: FeedbackItem) => (
                          <tr key={item.id}>
                            <td>
                              <span className={`pill pill-${item.feedback_type}`}>
                                {item.feedback_type}
                              </span>
                            </td>
                            <td className="td-query">{item.query || <span className="td-nil">—</span>}</td>
                            <td>
                              {item.rating === 'up' && <span className="rating-up" aria-label="thumbs up">👍</span>}
                              {item.rating === 'down' && <span className="rating-down" aria-label="thumbs down">👎</span>}
                              {!item.rating && <span className="td-nil">—</span>}
                            </td>
                            <td>
                              {item.category
                                ? <span className="pill pill-category">{item.category}</span>
                                : <span className="td-nil">—</span>
                              }
                            </td>
                            <td className="td-comment">
                              {item.feedback_text || <span className="td-nil">—</span>}
                            </td>
                            <td className="td-time">{timeAgo(item.timestamp)}</td>
                            <td>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="btn-delete"
                                disabled={loading}
                                title="Delete entry"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {feedback.pages > 1 && (
                    <div className="adm-pagination">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1 || loading}
                        className="page-btn"
                      >
                        ← Prev
                      </button>
                      <span className="page-info">Page {currentPage} of {feedback.pages}</span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(feedback.pages, p + 1))}
                        disabled={currentPage === feedback.pages || loading}
                        className="page-btn"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
