import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import type { ExamMetadata, QuestionReviewItem, ResultHistoryEntry } from './api';
import { fetchResultDetail, getSessionExamTargets } from './api';
import {
  buildDailyProgress,
  buildDashboardStats,
  buildScoreTrend,
  getEntryScore,
  isEntryPassed,
} from './dashboardUtils';
import ResultDetailView from './ResultDetailView';
import './Dashboard.css';

type DashboardProps = {
  userName: string;
  userEmail: string;
  history: ResultHistoryEntry[];
  meta: ExamMetadata | null;
  onStartPractice: () => void;
};

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.dataKey === 'exams' && `${item.value} exam${item.value === 1 ? '' : 's'}`}
          {item.dataKey === 'avgScore' && `Avg score: ${item.value}`}
          {item.dataKey === 'accuracy' && `Accuracy: ${item.value}%`}
          {item.dataKey === 'score' && `Score: ${item.value}`}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard({
  userName,
  userEmail,
  history,
  meta,
  onStartPractice,
}: DashboardProps) {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [detailQuestions, setDetailQuestions] = useState<QuestionReviewItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const stats = buildDashboardStats(history, meta);
  const dailyProgress = buildDailyProgress(history, 14);
  const scoreTrend = buildScoreTrend(history);
  const hasData = history.length > 0;
  const passTarget = meta?.passingScore ?? 720;

  const handleSelectResult = async (entry: ResultHistoryEntry) => {
    if (selectedResultId === entry.id) {
      setSelectedResultId(null);
      setDetailQuestions([]);
      setDetailError(null);
      return;
    }

    setSelectedResultId(entry.id);
    setDetailLoading(true);
    setDetailError(null);
    setDetailQuestions([]);

    try {
      const detail = await fetchResultDetail(userEmail, entry.id);
      setDetailQuestions(detail.questions);
    } catch {
      setDetailError('Could not load question details for this session.');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedEntry = history.find((e) => e.id === selectedResultId) ?? null;
  const selectedScore = selectedEntry ? getEntryScore(selectedEntry) : null;

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero-text">
          <p className="dashboard-eyebrow">Your progress hub</p>
          <h2>Hello, {userName}</h2>
          <p className="muted">
            Track every practice session, spot daily momentum, and see how close you are to the{' '}
            {passTarget} pass target.
          </p>
        </div>
        <button type="button" className="btn primary dashboard-cta" onClick={onStartPractice}>
          Start new exam
        </button>
      </section>

      <div className="dashboard-stats-grid">
        <article className="dash-stat-card dash-stat-primary">
          <span className="dash-stat-icon" aria-hidden="true">
            ◈
          </span>
          <p className="dash-stat-label">Total exams</p>
          <p className="dash-stat-value">{stats.totalExams}</p>
          <p className="dash-stat-hint">{stats.totalQuestions} questions practiced</p>
        </article>
        <article className="dash-stat-card">
          <span className="dash-stat-icon" aria-hidden="true">
            ↗
          </span>
          <p className="dash-stat-label">Average score</p>
          <p className="dash-stat-value">{stats.avgScore ?? '—'}</p>
          <p className="dash-stat-hint">Across all sessions</p>
        </article>
        <article className="dash-stat-card">
          <span className="dash-stat-icon" aria-hidden="true">
            ★
          </span>
          <p className="dash-stat-label">Best score</p>
          <p className="dash-stat-value dash-stat-ok">{stats.bestScore ?? '—'}</p>
          <p className="dash-stat-hint">Personal best</p>
        </article>
        <article className="dash-stat-card">
          <span className="dash-stat-icon" aria-hidden="true">
            ✓
          </span>
          <p className="dash-stat-label">Pass rate</p>
          <p className="dash-stat-value">{stats.passRate != null ? `${stats.passRate}%` : '—'}</p>
          <p className="dash-stat-hint">At or above {passTarget}</p>
        </article>
        <article className="dash-stat-card dash-stat-streak">
          <span className="dash-stat-icon" aria-hidden="true">
            🔥
          </span>
          <p className="dash-stat-label">Practice streak</p>
          <p className="dash-stat-value">{stats.practiceStreak}</p>
          <p className="dash-stat-hint">Consecutive day{stats.practiceStreak === 1 ? '' : 's'}</p>
        </article>
      </div>

      <div className="dashboard-charts">
        <section className="dashboard-chart-card dashboard-chart-wide">
          <div className="dashboard-chart-header">
            <div>
              <h3>Daily progress</h3>
              <p className="hint">Exams completed per day — last 14 days</p>
            </div>
            <span className="pill">Live</span>
          </div>
          {hasData ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyProgress} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="exams" radius={[8, 8, 0, 0]} maxBarSize={42}>
                    {dailyProgress.map((day) => (
                      <Cell
                        key={day.date}
                        fill={day.exams > 0 ? '#0a0a0a' : '#e4e4e7'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboard-empty-chart">
              <p>No sessions yet. Complete your first exam to unlock daily charts.</p>
            </div>
          )}
        </section>

        <section className="dashboard-chart-card">
          <div className="dashboard-chart-header">
            <div>
              <h3>Score trend</h3>
              <p className="hint">Session-by-session performance</p>
            </div>
          </div>
          {scoreTrend.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={scoreTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['dataMin - 50', 'dataMax + 50']}
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#0a0a0a"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#0a0a0a', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboard-empty-chart">
              <p>Your score line will appear after your first completed exam.</p>
            </div>
          )}
        </section>

        <section className="dashboard-chart-card">
          <div className="dashboard-chart-header">
            <div>
              <h3>Daily accuracy</h3>
              <p className="hint">Average % correct per day</p>
            </div>
          </div>
          {hasData ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyProgress} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#166534" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#166534" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#166534"
                    strokeWidth={2}
                    fill="url(#accuracyGradient)"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboard-empty-chart">
              <p>Daily accuracy builds as you practice more.</p>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-results card">
        <div className="dashboard-results-header">
          <div>
            <h3>Recent results</h3>
            <p className="hint">Saved for {userEmail}</p>
          </div>
          <span className="mono muted">{history.length} total</span>
        </div>

        {history.length === 0 ? (
          <div className="dashboard-empty-results">
            <p className="muted">You have not completed any exams yet.</p>
            <button type="button" className="btn primary" onClick={onStartPractice}>
              Take your first practice exam
            </button>
          </div>
        ) : (
          <>
            <p className="results-table-hint hint">
              Click any row to view each question, your answer, the correct answer, and explanation.
            </p>
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Score</th>
                    <th>Correct</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => {
                    const score = getEntryScore(entry);
                    const passed = isEntryPassed(entry, meta);
                    const targets = meta ? getSessionExamTargets(entry.total, meta) : null;
                    const isSelected = selectedResultId === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        className={`clickable ${isSelected ? 'selected-row' : ''}`}
                        onClick={() => void handleSelectResult(entry)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void handleSelectResult(entry);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        aria-label={`View details for exam on ${formatHistoryDate(entry.completedAt)}`}
                      >
                        <td>{formatHistoryDate(entry.completedAt)}</td>
                        <td>
                          <span className="pill history-source">
                            {entry.sourceMode === 'Ai' ? 'AI' : 'Bank'}
                          </span>
                        </td>
                        <td className="mono score-cell">
                          {score ?? `${entry.percentCorrect}%`}
                          {targets && score != null && (
                            <span className="muted score-target"> / {targets.passingScore}</span>
                          )}
                        </td>
                        <td>
                          {entry.correct}/{entry.total}
                        </td>
                        <td>
                          <span className={`result-badge ${passed ? 'pass' : 'fail'}`}>
                            {passed ? 'Pass' : 'Below pass'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {detailLoading && (
              <p className="result-detail-loading">Loading question details…</p>
            )}

            {detailError && <div className="banner error">{detailError}</div>}

            {selectedEntry && !detailLoading && (
              <ResultDetailView
                dateLabel={formatHistoryDate(selectedEntry.completedAt)}
                sourceLabel={selectedEntry.sourceMode === 'Ai' ? 'AI generated' : 'Question bank'}
                scoreLabel={
                  selectedScore != null
                    ? String(selectedScore)
                    : `${selectedEntry.percentCorrect}%`
                }
                questions={detailQuestions}
                onClose={() => {
                  setSelectedResultId(null);
                  setDetailQuestions([]);
                  setDetailError(null);
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
