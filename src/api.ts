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

export type SectionInfo = { id: number; name: string; range: string; questionCount?: number };

export type QuestionBankInfo = {
  id: string;
  name: string;
  questionCount: number;
  sections: SectionInfo[];
};

/** How many bank questions can be drawn for the current domain filter (Json mode). */
export function getAvailableQuestionCount(
  meta: ExamMetadata,
  selectedDomainIds: number[],
  useAiMode: boolean,
  bankId?: string,
): number {
  if (useAiMode) return meta.maxQuestionsPerSession;
  const bank = getSelectedBank(meta, bankId);
  if (selectedDomainIds.length === 0) return bank.questionCount;
  return selectedDomainIds.reduce(
    (sum, id) => sum + (bank.sections.find((s) => s.id === id)?.questionCount ?? 0),
    0,
  );
}

export function getSelectedBank(meta: ExamMetadata, bankId?: string): QuestionBankInfo {
  const banks = meta.questionBanks ?? [];
  const id = bankId ?? meta.defaultBankId ?? 'ankush';
  return banks.find((b) => b.id === id) ?? {
    id,
    name: 'Question bank',
    questionCount: meta.bankQuestionCount,
    sections: meta.sections,
  };
}
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
  questionBanks: QuestionBankInfo[] | null;
  defaultBankId: string | null;
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
  wrongAnswerExplanation?: string | null;
  optionExplanations?: Record<string, string> | null;
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
  wrongAnswerExplanation?: string | null;
  optionExplanations?: Record<string, string> | null;
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
  bankId?: string,
): Promise<SessionDto> {
  const res = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count,
      sectionIds: sectionIds?.length ? sectionIds : null,
      source: source ?? null,
      learningUrl: learningUrl?.trim() || null,
      bankId: bankId ?? null,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to create practice session');
  }
  return res.json();
}

export async function restoreSession(payload: {
  sessionId: string;
  questionIds: number[];
  sourceMode: string;
  bankId?: string | null;
  generationJobId?: string | null;
  answers?: Record<number, string>;
}): Promise<SessionDto> {
  const res = await fetch(`${API}/sessions/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: payload.sessionId,
      questionIds: payload.questionIds,
      sourceMode: payload.sourceMode,
      bankId: payload.bankId ?? null,
      generationJobId: payload.generationJobId ?? null,
      answers: payload.answers ?? null,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to restore practice session');
  }
  return res.json();
}

export type GenerationJobDto = {
  jobId: string;
  userEmail: string;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled' | string;
  requestedCount: number;
  completedCount: number;
  error: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

const GENERATION_JOB_KEY = 'cca_ai_generation_job';
const ACTIVE_EXAM_KEY = 'cca_active_exam';

export type ActiveExamProgress = {
  email: string;
  sessionId: string;
  sourceMode: string;
  bankId?: string | null;
  generationJobId?: string | null;
  currentIndex: number;
  remainingSeconds: number;
  totalQuestions: number;
  questionIds: number[];
  draftAnswersByIndex: Record<number, string>;
  answersByIndex: Record<number, string>;
  updatedAt: string;
};

export function getStoredGenerationJobId(email: string): string | null {
  try {
    const raw = localStorage.getItem(GENERATION_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; jobId?: string };
    if (
      parsed.email?.toLowerCase() === email.trim().toLowerCase() &&
      parsed.jobId
    ) {
      return parsed.jobId;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredGenerationJobId(email: string, jobId: string): void {
  try {
    localStorage.setItem(
      GENERATION_JOB_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), jobId }),
    );
  } catch {
    /* ignore */
  }
}

export function clearStoredGenerationJobId(): void {
  try {
    localStorage.removeItem(GENERATION_JOB_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredActiveExam(email: string): ActiveExamProgress | null {
  try {
    const raw = localStorage.getItem(ACTIVE_EXAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExamProgress;
    if (
      parsed.email?.toLowerCase() === email.trim().toLowerCase() &&
      parsed.sessionId &&
      Array.isArray(parsed.questionIds) &&
      parsed.questionIds.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredActiveExam(progress: ActiveExamProgress): void {
  try {
    localStorage.setItem(
      ACTIVE_EXAM_KEY,
      JSON.stringify({
        ...progress,
        email: progress.email.trim().toLowerCase(),
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function clearStoredActiveExam(): void {
  try {
    localStorage.removeItem(ACTIVE_EXAM_KEY);
  } catch {
    /* ignore */
  }
}

export async function startGenerationJob(payload: {
  userEmail: string;
  count: number;
  sectionIds?: number[];
  learningUrl?: string;
  forceNew?: boolean;
}): Promise<GenerationJobDto> {
  const res = await fetch(`${API}/generation-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: payload.userEmail.trim(),
      count: payload.count,
      sectionIds: payload.sectionIds?.length ? payload.sectionIds : null,
      learningUrl: payload.learningUrl?.trim() || null,
      forceNew: payload.forceNew ?? false,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to start AI generation');
  }
  return res.json();
}

export async function fetchGenerationJob(jobId: string): Promise<GenerationJobDto> {
  const res = await fetch(`${API}/generation-jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error('Failed to load generation progress');
  return res.json();
}

export async function fetchActiveGenerationJob(
  email: string,
): Promise<GenerationJobDto | null> {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(`${API}/users/${encoded}/generation-jobs/active`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load active generation job');
  return res.json();
}

export async function createSessionFromGenerationJob(
  jobId: string,
  userEmail: string,
): Promise<SessionDto> {
  const res = await fetch(`${API}/generation-jobs/${encodeURIComponent(jobId)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail: userEmail.trim() }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to open exam from generated questions');
  }
  return res.json();
}

export async function cancelGenerationJob(
  jobId: string,
  userEmail: string,
): Promise<void> {
  const res = await fetch(`${API}/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail: userEmail.trim() }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed to cancel generation');
  }
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
    // Prefer localStorage so Review links opened in a new tab (target=_blank + noopener)
    // still see the admin session. Migrate any legacy sessionStorage token.
    const fromLocal = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (fromLocal) return fromLocal;

    const fromSession = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (fromSession) {
      localStorage.setItem(ADMIN_TOKEN_KEY, fromSession);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      return fromSession;
    }

    return null;
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
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
