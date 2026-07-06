import { useCallback, useEffect, useState } from 'react';
import {
  adminFetchResultDetail,
  adminFetchResults,
  adminFetchUsers,
  adminLogin,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  type AdminResultSummary,
  type AdminUserSummary,
  type QuestionReviewItem,
} from './api';
import ResultDetailView from './ResultDetailView';
import './Admin.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function Admin() {
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  const [email, setEmail] = useState('admin@appunik.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [results, setResults] = useState<AdminResultSummary[]>([]);
  const [tab, setTab] = useState<'users' | 'results'>('results');

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [detailQuestions, setDetailQuestions] = useState<QuestionReviewItem[]>([]);
  const [detailMeta, setDetailMeta] = useState<AdminResultSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRows, resultRows] = await Promise.all([adminFetchUsers(), adminFetchResults()]);
      setUsers(userRows);
      setResults(resultRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load admin data';
      if (message.includes('Session expired')) {
        clearAdminToken();
        setToken(null);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadDashboard();
  }, [token, loadDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await adminLogin(email, password);
      setAdminToken(response.token);
      setToken(response.token);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setToken(null);
    setUsers([]);
    setResults([]);
    setSelectedResultId(null);
    setDetailQuestions([]);
    setDetailMeta(null);
  };

  const openResultDetail = async (row: AdminResultSummary) => {
    if (!row.hasDetail) {
      setError('Detailed question review is not available for this exam.');
      return;
    }

    setSelectedResultId(row.id);
    setDetailMeta(row);
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await adminFetchResultDetail(row.id);
      setDetailQuestions(detail.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
      setSelectedResultId(null);
      setDetailMeta(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="admin-page">
        <div className="admin-login card">
          <h1>Admin sign in</h1>
          <p className="hint">Monitor user exam results across the practice platform.</p>
          <form onSubmit={handleLogin} className="admin-login-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <a href="/" className="admin-back-link">
            Back to practice app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header card">
        <div>
          <h1>Admin dashboard</h1>
          <p className="hint">Signed in as {email}</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="btn secondary" onClick={loadDashboard} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn secondary" onClick={handleLogout}>
            Sign out
          </button>
          <a href="/" className="btn secondary admin-back-btn">
            Practice app
          </a>
        </div>
      </header>

      <div className="admin-stats">
        <div className="admin-stat card">
          <span className="admin-stat-label">Users</span>
          <strong>{users.length}</strong>
        </div>
        <div className="admin-stat card">
          <span className="admin-stat-label">Exam attempts</span>
          <strong>{results.length}</strong>
        </div>
      </div>

      {error && <p className="error admin-error">{error}</p>}

      <div className="admin-tabs">
        <button
          type="button"
          className={tab === 'results' ? 'active' : ''}
          onClick={() => setTab('results')}
        >
          Exam results
        </button>
        <button
          type="button"
          className={tab === 'users' ? 'active' : ''}
          onClick={() => setTab('users')}
        >
          Users
        </button>
      </div>

      {tab === 'users' ? (
        <section className="admin-table-wrap card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Registered</th>
                <th>Exams</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    {loading ? 'Loading…' : 'No users yet.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.email}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.resultCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="admin-table-wrap card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Date</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Mode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {loading ? 'Loading…' : 'No exam results yet.'}
                  </td>
                </tr>
              ) : (
                results.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.userName}</strong>
                      <div className="admin-subtext">{row.userEmail}</div>
                    </td>
                    <td>{formatDate(row.completedAt)}</td>
                    <td>{row.scaledScore ?? '—'}</td>
                    <td>
                      {row.correct}/{row.total} ({row.percentCorrect.toFixed(1)}%)
                    </td>
                    <td>{row.sourceMode}</td>
                    <td>
                      {row.hasDetail ? (
                        <button
                          type="button"
                          className="btn secondary admin-view-btn"
                          onClick={() => openResultDetail(row)}
                        >
                          Review
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {selectedResultId && detailMeta && (
        <div className="admin-detail-overlay">
          {detailLoading ? (
            <p className="muted">Loading review…</p>
          ) : (
            <ResultDetailView
              dateLabel={formatDate(detailMeta.completedAt)}
              sourceLabel={detailMeta.sourceMode}
              scoreLabel={String(detailMeta.scaledScore ?? '—')}
              questions={detailQuestions}
              onClose={() => {
                setSelectedResultId(null);
                setDetailMeta(null);
                setDetailQuestions([]);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
