import { useEffect, useState } from 'react';
import {
  adminFetchResultDetail,
  fetchResultDetail,
  getAdminToken,
  getStoredUserEmail,
  type QuestionReviewItem,
  type ResultHistoryEntry,
} from './api';
import ResultDetailView from './ResultDetailView';
import './ResultReviewPage.css';

type ReviewMode = 'admin' | 'user';

type ResultReviewPageProps = {
  mode: ReviewMode;
  resultId: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function sourceLabel(sourceMode: string): string {
  return sourceMode === 'Ai' ? 'AI generated' : sourceMode === 'Json' ? 'Question bank' : sourceMode;
}

export default function ResultReviewPage({ mode, resultId }: ResultReviewPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ResultHistoryEntry | null>(null);
  const [questions, setQuestions] = useState<QuestionReviewItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (mode === 'admin') {
          if (!getAdminToken()) {
            throw new Error('Admin session required. Sign in from the admin dashboard, then open Review again.');
          }
          const detail = await adminFetchResultDetail(resultId);
          if (cancelled) return;
          setSummary(detail.summary);
          setQuestions(detail.questions);
        } else {
          const email = getStoredUserEmail();
          if (!email) {
            throw new Error('Sign in to the practice app first, then open Review again.');
          }
          const detail = await fetchResultDetail(email, resultId);
          if (cancelled) return;
          setSummary(detail.summary);
          setQuestions(detail.questions);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load review');
        setSummary(null);
        setQuestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, resultId]);

  const backHref = mode === 'admin' ? '/admin' : '/';
  const backLabel = mode === 'admin' ? 'Back to admin' : 'Back to practice app';

  return (
    <div className="result-review-page">
      <header className="result-review-header card">
        <div>
          <h1>Exam review</h1>
          <p className="hint">
            {mode === 'admin' ? 'Admin view' : 'Your practice result'} · opens in its own tab
          </p>
        </div>
        <a href={backHref} className="btn secondary">
          {backLabel}
        </a>
      </header>

      {loading && <p className="muted result-review-status">Loading review…</p>}
      {error && <p className="error result-review-status">{error}</p>}

      {!loading && !error && summary && (
        <ResultDetailView
          dateLabel={formatDate(summary.completedAt)}
          sourceLabel={sourceLabel(summary.sourceMode)}
          scoreLabel={
            summary.scaledScore != null ? String(summary.scaledScore) : `${summary.percentCorrect}%`
          }
          questions={questions}
          onClose={() => {
            window.close();
          }}
        />
      )}
    </div>
  );
}

export function parseReviewRoute(pathname: string): { mode: ReviewMode; resultId: string } | null {
  const adminMatch = pathname.match(/^\/admin\/review\/([^/]+)\/?$/);
  if (adminMatch?.[1]) {
    return { mode: 'admin', resultId: decodeURIComponent(adminMatch[1]) };
  }

  const userMatch = pathname.match(/^\/review\/([^/]+)\/?$/);
  if (userMatch?.[1]) {
    return { mode: 'user', resultId: decodeURIComponent(userMatch[1]) };
  }

  return null;
}
