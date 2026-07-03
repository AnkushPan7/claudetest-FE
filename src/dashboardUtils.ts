import type { ExamMetadata, ResultHistoryEntry } from './api';
import { getSessionExamTargets } from './api';

export type DailyProgress = {
  date: string;
  label: string;
  exams: number;
  avgScore: number | null;
  bestScore: number | null;
  accuracy: number | null;
};

export type DashboardStats = {
  totalExams: number;
  avgScore: number | null;
  bestScore: number | null;
  passRate: number | null;
  totalQuestions: number;
  practiceStreak: number;
  latestScore: number | null;
};

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function getEntryScore(entry: ResultHistoryEntry): number | null {
  if (entry.scaledScore != null) return entry.scaledScore;
  if (entry.percentCorrect > 0) return Math.round(entry.percentCorrect * 10);
  return null;
}

export function isEntryPassed(entry: ResultHistoryEntry, meta: ExamMetadata | null): boolean {
  const score = getEntryScore(entry);
  if (score == null || !meta) return false;
  return score >= getSessionExamTargets(entry.total, meta).passingScore;
}

export function buildDailyProgress(
  history: ResultHistoryEntry[],
  days = 14,
): DailyProgress[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDate = new Map<string, ResultHistoryEntry[]>();
  for (const entry of history) {
    const key = toDateKey(entry.completedAt);
    const list = byDate.get(key) ?? [];
    list.push(entry);
    byDate.set(key, list);
  }

  const result: DailyProgress[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toDateKey(d.toISOString());
    const entries = byDate.get(key) ?? [];
    const scores = entries.map(getEntryScore).filter((s): s is number => s != null);
    const accuracyValues = entries
      .filter((e) => e.total > 0)
      .map((e) => Math.round((e.correct / e.total) * 100));

    result.push({
      date: key,
      label: formatDayLabel(d),
      exams: entries.length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      accuracy:
        accuracyValues.length
          ? Math.round(accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length)
          : null,
    });
  }

  return result;
}

export function buildDashboardStats(
  history: ResultHistoryEntry[],
  meta: ExamMetadata | null,
): DashboardStats {
  const scores = history.map(getEntryScore).filter((s): s is number => s != null);
  const passed = meta ? history.filter((e) => isEntryPassed(e, meta)).length : 0;

  const dateKeys = new Set(history.map((e) => toDateKey(e.completedAt)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = toDateKey(cursor.toISOString());
    if (dateKeys.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0) {
      cursor.setDate(cursor.getDate() - 1);
      const yesterdayKey = toDateKey(cursor.toISOString());
      if (dateKeys.has(yesterdayKey)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    } else {
      break;
    }
  }

  return {
    totalExams: history.length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    passRate: history.length && meta ? Math.round((passed / history.length) * 100) : null,
    totalQuestions: history.reduce((sum, e) => sum + e.total, 0),
    practiceStreak: streak,
    latestScore: scores.length ? scores[0] : null,
  };
}

export function buildScoreTrend(history: ResultHistoryEntry[]): { index: number; label: string; score: number }[] {
  const chronological = [...history].reverse();
  return chronological
    .map((entry, i) => {
      const score = getEntryScore(entry);
      if (score == null) return null;
      return {
        index: i + 1,
        label: new Date(entry.completedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        score,
      };
    })
    .filter((item): item is { index: number; label: string; score: number } => item != null);
}
