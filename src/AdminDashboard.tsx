import { useEffect, useState } from 'react';
import type { AdminOverview, AdminSession, ExamMetadata } from './api';
import { fetchAdminOverview } from './api';
import './AdminDashboard.css';

type AdminDashboardProps = {
  adminSession: AdminSession;
  meta: ExamMetadata | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboard({ adminSession, meta }: AdminDashboardProps) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminOverview(adminSession)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load team scores. Check admin access.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adminSession]);

  const passTarget = meta?.passingScore ?? 720;
  const activeUsers = overview?.users.filter((u) => u.totalExams > 0).length ?? 0;
  const totalExams =
    overview?.users.reduce((sum, user) => sum + user.totalExams, 0) ?? 0;
  const avgTeamScore = (() => {
    const scores = overview?.users.map((u) => u.avgScore).filter((s): s is number => s != null) ?? [];
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  })();

  return (
    <div className="admin-dashboard">
      <section className="admin-hero">
        <div>
          <p className="admin-eyebrow">Super Admin</p>
          <h2>Team scores</h2>
          <p className="muted">
            All practice exam results from every registered user. Pass target: {passTarget} scaled.
          </p>
        </div>
      </section>

      {loading && <p className="muted admin-loading">Loading team data…</p>}
      {error && <div className="banner error">{error}</div>}

      {!loading && overview && (
        <>
          <div className="admin-stats-grid">
            <div className="admin-stat-card admin-stat-primary">
              <span className="admin-stat-label">Total users</span>
              <span className="admin-stat-value">{overview.totalUsers}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Active users</span>
              <span className="admin-stat-value">{activeUsers}</span>
              <span className="admin-stat-hint">At least 1 exam</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Total exams</span>
              <span className="admin-stat-value">{totalExams}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Team avg score</span>
              <span className="admin-stat-value">{avgTeamScore ?? '—'}</span>
            </div>
          </div>

          <section className="card admin-table-section">
            <h3>All users</h3>
            {overview.users.length === 0 ? (
              <p className="muted">No users registered yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Exams</th>
                      <th>Latest</th>
                      <th>Best</th>
                      <th>Average</th>
                      <th>Last exam</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.users.map((user) => {
                      const passed = user.latestScore != null && user.latestScore >= passTarget;
                      const hasExams = user.totalExams > 0;
                      return (
                        <tr key={user.email}>
                          <td>{user.name}</td>
                          <td className="mono">{user.email}</td>
                          <td>{user.totalExams}</td>
                          <td className="mono score-cell">{user.latestScore ?? '—'}</td>
                          <td className="mono score-cell">{user.bestScore ?? '—'}</td>
                          <td className="mono score-cell">{user.avgScore ?? '—'}</td>
                          <td>{formatDate(user.lastExamAt)}</td>
                          <td>
                            {!hasExams ? (
                              <span className="admin-badge neutral">No exams</span>
                            ) : (
                              <span className={`admin-badge ${passed ? 'pass' : 'fail'}`}>
                                {passed ? 'Pass' : 'Below pass'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
