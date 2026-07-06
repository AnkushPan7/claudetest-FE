/** Dev: Vite proxies `/api` to the backend. Prod: call the Render API host (override with VITE_API_BASE_URL). */
function resolveApiBase(): string {
  const raw = (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
    (import.meta.env.DEV ? '/api/quiz' : 'https://claudetest-be.onrender.com/api/quiz')
  ).replace(/\/$/, '');

  if (raw.endsWith('/api/quiz')) return raw;
  // Render often sets host-only VITE_API_BASE_URL — append the quiz route prefix.
  if (raw.startsWith('http')) return `${raw}/api/quiz`;
  return raw;
}

const API = resolveApiBase();

export type SectionInfo = { id: number; name: string; range: string };
export type ExamScenarioInfo = { id: number; name: string; primaryDomains: string[] };
export type ExamMetadata = {
  examTitle: string;
  totalQuestions: number;
  bankQuestionCount: number;
  sections: SectionInfo[];
  questionSource: string;
  aiGenerationAvailable: boolean;
  learningUrl: string | null;
  learningUrls: string[] | null;
  maxQuestionsPerSession: number;
  passingScore: number;
  scoreMin: number;
  scoreMax: number;
  practicePassingScore: number;
  responseFormat: string | null;
  examScenariosNote: string | null;
  scenarios: ExamScenarioInfo[] | null;
};

/** Full CCA-F exam: 60 questions, 120 minutes, 720 scaled pass. */
export const FULL_EXAM_TIME_SECONDS = 120 * 60;

export type SessionExamTargets = {
  questionCount: number;
  timeLimitSeconds: number;
  passingScore: number;
  practicePassingScore: number;
  scoreMin: number;
  scoreMax: number;
};

/** Time limit and scaled pass targets proportional to question count (baseline: 60 questions). */
export function getSessionExamTargets(
  questionCount: number,
  meta: ExamMetadata,
): SessionExamTargets {
  const ratio = questionCount / meta.totalQuestions;
  const scoreSpan = meta.scoreMax - meta.scoreMin;
  return {
    questionCount,
    timeLimitSeconds: Math.round(FULL_EXAM_TIME_SECONDS * ratio),
    passingScore: Math.round(meta.scoreMin + (meta.passingScore - meta.scoreMin) * ratio),
    practicePassingScore: Math.round(
      meta.scoreMin + (meta.practicePassingScore - meta.scoreMin) * ratio,
    ),
    scoreMin: meta.scoreMin,
    scoreMax: Math.round(meta.scoreMin + scoreSpan * ratio),
  };
}

/** Maps percent correct to the exam's 100–1000 scaled score range (full 60-question exam). */
export function toScaledScore(percentCorrect: number, meta: ExamMetadata): number {
  const range = meta.scoreMax - meta.scoreMin;
  return Math.round(meta.scoreMin + (percentCorrect / 100) * range);
}

/** Maps percent correct to the scaled range for this session size (keeps ~72% as pass). */
export function toSessionScaledScore(
  percentCorrect: number,
  targets: SessionExamTargets,
): number {
  const span = targets.scoreMax - targets.scoreMin;
  return Math.round(targets.scoreMin + (percentCorrect / 100) * span);
}

export type SessionDto = {
  sessionId: string;
  totalQuestions: number;
  questionIds: number[];
  sourceMode: string;
};

export type QuestionDto = {
  id: number;
  sectionId: number;
  sectionName: string;
  title: string;
  text: string;
  options: Record<string, string>;
  index: number;
  total: number;
};

export type AnswerSubmit = {
  index: number;
  total: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
};

export type QuestionReviewItem = {
  index: number;
  sectionName: string;
  title: string;
  text: string;
  options: Record<string, string>;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  answered: boolean;
};

export type SessionReview = {
  sessionId: string;
  questions: QuestionReviewItem[];
};

export type SessionSummary = {
  sessionId: string;
  total: number;
  answered: number;
  correct: number;
  percentCorrect: number;
};

export async function fetchMetadata(): Promise<ExamMetadata> {
  const res = await fetch(`${API}/metadata`);
  if (!res.ok) throw new Error('Failed to load exam metadata');
  return res.json();
}

export async function createSession(
  count: number,
  sectionIds?: number[],
  source?: string,
  learningUrl?: string,
): Promise<SessionDto> {
  const res = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count,
      sectionIds: sectionIds?.length ? sectionIds : null,
      source: source ?? null,
      learningUrl: learningUrl?.trim() || null,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to create practice session');
  }
  return res.json();
}

export async function fetchQuestion(sessionId: string, index: number): Promise<QuestionDto> {
  const res = await fetch(`${API}/sessions/${sessionId}/questions/${index}`);
  if (!res.ok) throw new Error('Failed to load question');
  return res.json();
}

export async function submitAnswer(
  sessionId: string,
  index: number,
  selectedAnswer: string,
): Promise<AnswerSubmit> {
  const res = await fetch(`${API}/sessions/${sessionId}/questions/${index}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedAnswer }),
  });
  if (!res.ok) throw new Error('Failed to submit answer');
  return res.json();
}

export async function fetchReview(sessionId: string): Promise<SessionReview> {
  const res = await fetch(`${API}/sessions/${sessionId}/review`);
  if (!res.ok) throw new Error('Failed to load answer review');
  return res.json();
}

export async function fetchSummary(sessionId: string): Promise<SessionSummary> {
  const res = await fetch(`${API}/sessions/${sessionId}/summary`);
  if (!res.ok) throw new Error('Failed to load summary');
  return res.json();
}

export type UserDto = {
  email: string;
  name: string;
  createdAt: string;
};

export type ResultHistoryEntry = {
  id: string;
  sessionId: string;
  completedAt: string;
  total: number;
  answered: number;
  correct: number;
  percentCorrect: number;
  sourceMode: string;
  scaledScore: number | null;
  hasDetail: boolean;
};

export type ResultDetail = {
  summary: ResultHistoryEntry;
  questions: QuestionReviewItem[];
};

export type UserHistory = {
  user: UserDto;
  results: ResultHistoryEntry[];
};

const USER_EMAIL_KEY = 'cca_user_email';

export function getStoredUserEmail(): string | null {
  try {
    return localStorage.getItem(USER_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserEmail(email: string): void {
  try {
    localStorage.setItem(USER_EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

export function clearStoredUserEmail(): void {
  try {
    localStorage.removeItem(USER_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export async function registerUser(email: string, name: string): Promise<UserDto> {
  const res = await fetch(`${API}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), name: name.trim() }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to register user');
  }
  return res.json();
}

export async function fetchUserHistory(email: string): Promise<UserHistory> {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(`${API}/users/${encoded}/history`);
  if (!res.ok) throw new Error('Failed to load history');
  return res.json();
}

export async function saveUserResult(
  email: string,
  payload: {
    sessionId: string;
    total: number;
    answered: number;
    correct: number;
    percentCorrect: number;
    sourceMode: string;
    scaledScore: number | null;
    questions?: QuestionReviewItem[];
  },
): Promise<ResultHistoryEntry> {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(`${API}/users/${encoded}/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to save result');
  }
  return res.json();
}

export async function fetchResultDetail(
  email: string,
  resultId: string,
): Promise<ResultDetail> {
  const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
  const encodedId = encodeURIComponent(resultId);
  const res = await fetch(`${API}/users/${encodedEmail}/results/${encodedId}`);
  if (!res.ok) throw new Error('Failed to load result details');
  return res.json();
}

function resolveApiRoot(): string {
  return resolveApiBase().replace(/\/api\/quiz\/?$/, '');
}

const ADMIN_API = `${resolveApiRoot()}/api/admin`;
const ADMIN_TOKEN_KEY = 'cca_admin_token';

export type AdminLoginResponse = {
  token: string;
  expiresAt: string;
};

export type AdminUserSummary = {
  email: string;
  name: string;
  createdAt: string;
  resultCount: number;
};

export type AdminResultSummary = {
  id: string;
  userEmail: string;
  userName: string;
  sessionId: string;
  completedAt: string;
  total: number;
  answered: number;
  correct: number;
  percentCorrect: number;
  sourceMode: string;
  scaledScore: number | null;
  hasDetail: boolean;
};

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function adminHeaders(): HeadersInit {
  const token = getAdminToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  const res = await fetch(`${ADMIN_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Invalid admin credentials');
  }
  return res.json();
}

export async function adminFetchUsers(): Promise<AdminUserSummary[]> {
  const res = await fetch(`${ADMIN_API}/users`, { headers: adminHeaders() });
  if (res.status === 401) throw new Error('Session expired. Please sign in again.');
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
}

export async function adminFetchResults(): Promise<AdminResultSummary[]> {
  const res = await fetch(`${ADMIN_API}/results`, { headers: adminHeaders() });
  if (res.status === 401) throw new Error('Session expired. Please sign in again.');
  if (!res.ok) throw new Error('Failed to load exam results');
  return res.json();
}

export async function adminFetchResultDetail(resultId: string): Promise<ResultDetail> {
  const encodedId = encodeURIComponent(resultId);
  const res = await fetch(`${ADMIN_API}/results/${encodedId}`, { headers: adminHeaders() });
  if (res.status === 401) throw new Error('Session expired. Please sign in again.');
  if (!res.ok) throw new Error('Failed to load result details');
  return res.json();
}
