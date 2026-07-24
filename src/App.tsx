import { useCallback, useEffect, useRef, useState } from 'react';
import {
  QuestionDto,
  QuestionReviewItem,
  SessionDto,
  SessionSummary,
  createSession,
  restoreSession,
  fetchMetadata,
  fetchQuestion,
  fetchReview,
  fetchSummary,
  submitAnswer,
  type AnswerSubmit,
  type ExamMetadata,
  type ActiveExamProgress,
  getAvailableQuestionCount,
  getSelectedBank,
  getSessionExamTargets,
  toSessionScaledScore,
  type SessionExamTargets,
  type UserDto,
  type ResultHistoryEntry,
  type GenerationJobDto,
  registerUser,
  fetchUserHistory,
  saveUserResult,
  getStoredUserEmail,
  setStoredUserEmail,
  clearStoredUserEmail,
  startGenerationJob,
  fetchGenerationJob,
  fetchActiveGenerationJob,
  createSessionFromGenerationJob,
  cancelGenerationJob,
  getStoredGenerationJobId,
  setStoredGenerationJobId,
  clearStoredGenerationJobId,
  getStoredActiveExam,
  setStoredActiveExam,
  clearStoredActiveExam,
} from './api';
import Dashboard from './Dashboard';
import { ThemeToggle, useTheme } from './theme';
import {
  AnswerComparison,
  OptionExplanation,
  getExplanationForOption,
} from './AnswerExplanations';
import { FormatText } from './formatText';

type Screen = 'welcome' | 'dashboard' | 'home' | 'quiz' | 'submit-review' | 'results';

function formatRemainingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}


export default function App() {
  const { theme } = useTheme();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [meta, setMeta] = useState<ExamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState<UserDto | null>(null);
  const [history, setHistory] = useState<ResultHistoryEntry[]>([]);
  const [userLoading, setUserLoading] = useState(true);
  const [welcomeName, setWelcomeName] = useState('');
  const [welcomeEmail, setWelcomeEmail] = useState('');

  const [questionCount, setQuestionCount] = useState(20);
  const [selectedSections, setSelectedSections] = useState<number[]>([]);
  const [useAiMode, setUseAiMode] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState('ankush');
  const [learningUrl, setLearningUrl] = useState('');

  const [session, setSession] = useState<SessionDto | null>(null);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<QuestionDto | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [draftAnswersByIndex, setDraftAnswersByIndex] = useState<Record<number, string>>({});
  const [answersByIndex, setAnswersByIndex] = useState<Record<number, string>>({});
  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, AnswerSubmit>>({});
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [review, setReview] = useState<QuestionReviewItem[]>([]);
  const [sessionTargets, setSessionTargets] = useState<SessionExamTargets | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timeUpHandled = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [generationJob, setGenerationJob] = useState<GenerationJobDto | null>(null);
  const [generationPolling, setGenerationPolling] = useState(false);
  const generationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingFromJobRef = useRef(false);
  const [activeExam, setActiveExam] = useState<ActiveExamProgress | null>(null);
  const examJobIdRef = useRef<string | null>(null);
  const resumeBootstrappedRef = useRef(false);

  const refreshMetadata = useCallback(async (opts?: { applyDefaults?: boolean }) => {
    const m = await fetchMetadata();
    setMeta(m);
    if (opts?.applyDefaults) {
      const ai = m.questionSource.toLowerCase() === 'ai';
      setUseAiMode(ai);
      setSelectedBankId(m.defaultBankId ?? 'ankush');
      setLearningUrl(m.learningUrl ?? m.learningUrls?.[0] ?? '');
      const bank = getSelectedBank(m, m.defaultBankId ?? 'ankush');
      const max = ai ? m.maxQuestionsPerSession : bank.questionCount;
      setQuestionCount(Math.min(m.totalQuestions, max));
    } else {
      setLearningUrl((prev) => prev || m.learningUrl || m.learningUrls?.[0] || '');
    }
    return m;
  }, []);

  useEffect(() => {
    refreshMetadata({ applyDefaults: true }).catch(() =>
      setError('Cannot reach API. Start the .NET backend on live.'),
    );
  }, [refreshMetadata]);

  const selectedBank = meta ? getSelectedBank(meta, selectedBankId) : null;

  const availableQuestionCount =
    meta ? getAvailableQuestionCount(meta, selectedSections, useAiMode, selectedBankId) : 0;
  const sliderMin = availableQuestionCount > 0 ? Math.min(5, availableQuestionCount) : 5;
  const sliderMax = useAiMode
    ? meta?.maxQuestionsPerSession ?? 60
    : availableQuestionCount;
  const bankSections = useAiMode ? meta?.sections ?? [] : selectedBank?.sections ?? meta?.sections ?? [];

  useEffect(() => {
    if (!meta) return;
    const max = getAvailableQuestionCount(meta, selectedSections, useAiMode, selectedBankId);
    if (max <= 0) return;
    const min = Math.min(5, max);
    setQuestionCount((prev) => Math.max(min, Math.min(prev, max)));
  }, [meta, selectedSections, useAiMode, selectedBankId]);

  const loadUserHistory = useCallback(async (email: string) => {
    const data = await fetchUserHistory(email);
    setUser(data.user);
    setHistory(data.results);
    setStoredUserEmail(data.user.email);
    return data;
  }, []);

  useEffect(() => {
    const storedEmail = getStoredUserEmail();
    if (!storedEmail) {
      setUserLoading(false);
      setScreen('welcome');
      return;
    }

    loadUserHistory(storedEmail)
      .then(() => {
        setActiveExam(getStoredActiveExam(storedEmail));
        setScreen('dashboard');
      })
      .catch(() => {
        clearStoredUserEmail();
        clearStoredActiveExam();
        setScreen('welcome');
      })
      .finally(() => setUserLoading(false));
  }, [loadUserHistory]);

  const handleWelcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const registered = await registerUser(welcomeEmail, welcomeName);
      setStoredUserEmail(registered.email);
      await loadUserHistory(registered.email);
      setScreen('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your profile.');
    } finally {
      setLoading(false);
    }
  };

  const switchUser = () => {
    clearStoredUserEmail();
    clearStoredGenerationJobId();
    clearStoredActiveExam();
    setUser(null);
    setHistory([]);
    setWelcomeName('');
    setWelcomeEmail('');
    setGenerationJob(null);
    setActiveExam(null);
    examJobIdRef.current = null;
    resumeBootstrappedRef.current = false;
    setScreen('welcome');
    setError(null);
  };

  const stopGenerationPolling = useCallback(() => {
    if (generationPollRef.current) {
      clearInterval(generationPollRef.current);
      generationPollRef.current = null;
    }
    setGenerationPolling(false);
  }, []);

  const hydrateAnswersFromReview = useCallback((items: QuestionReviewItem[]) => {
    const answers: Record<number, string> = {};
    const feedback: Record<number, AnswerSubmit> = {};
    for (const item of items) {
      if (!item.answered || !item.selectedAnswer) continue;
      answers[item.index] = item.selectedAnswer;
      feedback[item.index] = {
        index: item.index,
        total: items.length,
        selectedAnswer: item.selectedAnswer,
        correctAnswer: item.correctAnswer,
        isCorrect: item.isCorrect,
        explanation: item.explanation,
        wrongAnswerExplanation: item.wrongAnswerExplanation,
        optionExplanations: item.optionExplanations,
      };
    }
    return { answers, feedback };
  }, []);

  const openSessionFromDto = useCallback(
    async (
      s: SessionDto,
      currentMeta: ExamMetadata,
      opts?: {
        startIndex?: number;
        remainingSeconds?: number;
        draftAnswersByIndex?: Record<number, string>;
        answersByIndex?: Record<number, string>;
        generationJobId?: string | null;
        bankId?: string | null;
        email?: string;
        hydrateReview?: boolean;
      },
    ) => {
      const startIndex = Math.max(
        0,
        Math.min(opts?.startIndex ?? 0, Math.max(0, s.totalQuestions - 1)),
      );

      let answers = { ...(opts?.answersByIndex ?? {}) };
      let feedback: Record<number, AnswerSubmit> = {};
      const drafts = { ...(opts?.draftAnswersByIndex ?? {}) };

      if (opts?.hydrateReview !== false) {
        try {
          const rev = await fetchReview(s.sessionId);
          const hydrated = hydrateAnswersFromReview(rev.questions);
          answers = { ...answers, ...hydrated.answers };
          feedback = hydrated.feedback;
        } catch {
          /* fresh session or review unavailable */
        }
      }

      examJobIdRef.current = opts?.generationJobId ?? examJobIdRef.current;
      setSession(s);
      setIndex(startIndex);
      setSelectedLetter(answers[startIndex] ?? drafts[startIndex] ?? null);
      setDraftAnswersByIndex(drafts);
      setAnswersByIndex(answers);
      setFeedbackByIndex(feedback);
      setReview([]);
      const q = await fetchQuestion(s.sessionId, startIndex);
      setQuestion(q);
      const targets = getSessionExamTargets(s.totalQuestions, currentMeta);
      setSessionTargets(targets);
      const timeLeft =
        opts?.remainingSeconds != null
          ? Math.max(0, Math.min(opts.remainingSeconds, targets.timeLimitSeconds))
          : targets.timeLimitSeconds;
      setRemainingSeconds(timeLeft);
      timeUpHandled.current = false;
      setScreen('quiz');

      const email = opts?.email;
      if (email) {
        const progress: ActiveExamProgress = {
          email,
          sessionId: s.sessionId,
          sourceMode: s.sourceMode,
          bankId: opts?.bankId ?? null,
          generationJobId: examJobIdRef.current,
          currentIndex: startIndex,
          remainingSeconds: timeLeft,
          totalQuestions: s.totalQuestions,
          questionIds: [...s.questionIds],
          draftAnswersByIndex: drafts,
          answersByIndex: answers,
          updatedAt: new Date().toISOString(),
        };
        setStoredActiveExam(progress);
        setActiveExam(progress);
      }
    },
    [hydrateAnswersFromReview],
  );

  const resumeActiveExam = useCallback(
    async (progress: ActiveExamProgress, currentMeta: ExamMetadata) => {
      setLoading(true);
      setError(null);
      try {
        examJobIdRef.current = progress.generationJobId ?? null;
        const s = await restoreSession({
          sessionId: progress.sessionId,
          questionIds: progress.questionIds,
          sourceMode: progress.sourceMode,
          bankId: progress.bankId,
          generationJobId: progress.generationJobId,
          answers: progress.answersByIndex,
        });
        await openSessionFromDto(s, currentMeta, {
          startIndex: progress.currentIndex,
          remainingSeconds: progress.remainingSeconds,
          draftAnswersByIndex: progress.draftAnswersByIndex,
          answersByIndex: progress.answersByIndex,
          generationJobId: progress.generationJobId,
          bankId: progress.bankId,
          email: progress.email,
          hydrateReview: true,
        });
      } catch (err) {
        clearStoredActiveExam();
        setActiveExam(null);
        examJobIdRef.current = null;
        setError(
          err instanceof Error
            ? err.message
            : 'Could not resume your last exam. Start a new one.',
        );
        setScreen('home');
      } finally {
        setLoading(false);
      }
    },
    [openSessionFromDto],
  );

  // After login + metadata: park any in-progress exam on the dashboard.
  // User must click "Resume your last test" (bank and AI) — do not auto-enter quiz on refresh.
  useEffect(() => {
    if (!user || !meta || userLoading || resumeBootstrappedRef.current) return;
    resumeBootstrappedRef.current = true;

    const progress = getStoredActiveExam(user.email);
    setActiveExam(progress);
    if (!progress) return;

    if (progress.sourceMode === 'Ai') {
      setUseAiMode(true);
    }
    // Stay on dashboard (set at login) so Resume CTA is visible for both modes.
  }, [user, meta, userLoading]);

  // Persist live exam progress so refresh can resume.
  useEffect(() => {
    if ((screen !== 'quiz' && screen !== 'submit-review') || !session || !user) return;

    const progress: ActiveExamProgress = {
      email: user.email,
      sessionId: session.sessionId,
      sourceMode: session.sourceMode,
      bankId: session.sourceMode === 'Json' ? selectedBankId : null,
      generationJobId: examJobIdRef.current,
      currentIndex: index,
      remainingSeconds,
      totalQuestions: session.totalQuestions,
      questionIds: [...session.questionIds],
      draftAnswersByIndex,
      answersByIndex,
      updatedAt: new Date().toISOString(),
    };
    setStoredActiveExam(progress);
    setActiveExam(progress);
  }, [
    screen,
    session,
    user,
    index,
    remainingSeconds,
    draftAnswersByIndex,
    answersByIndex,
    selectedBankId,
  ]);

  const openCompletedGenerationJob = useCallback(
    async (job: GenerationJobDto) => {
      if (!meta || !user || startingFromJobRef.current) return;
      startingFromJobRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const s = await createSessionFromGenerationJob(job.jobId, user.email);
        clearStoredGenerationJobId();
        setGenerationJob(null);
        stopGenerationPolling();
        examJobIdRef.current = job.jobId;
        await openSessionFromDto(s, meta, {
          startIndex: 0,
          generationJobId: job.jobId,
          email: user.email,
          hydrateReview: true,
        });
        void refreshMetadata().catch(() => undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open generated exam.');
      } finally {
        startingFromJobRef.current = false;
        setLoading(false);
      }
    },
    [meta, user, openSessionFromDto, refreshMetadata, stopGenerationPolling],
  );

  const beginPollingGenerationJob = useCallback(
    (jobId: string) => {
      stopGenerationPolling();
      setGenerationPolling(true);

      const pollOnce = async () => {
        try {
          const latest = await fetchGenerationJob(jobId);
          setGenerationJob(latest);

          if (latest.status === 'Completed') {
            stopGenerationPolling();
            await openCompletedGenerationJob(latest);
            return;
          }

          if (latest.status === 'Failed' || latest.status === 'Cancelled') {
            stopGenerationPolling();
            clearStoredGenerationJobId();
            setError(latest.error || `Generation ${latest.status.toLowerCase()}.`);
            setLoading(false);
          }
        } catch (err) {
          stopGenerationPolling();
          setError(err instanceof Error ? err.message : 'Lost connection to generation progress.');
          setLoading(false);
        }
      };

      void pollOnce();
      generationPollRef.current = setInterval(() => {
        void pollOnce();
      }, 2000);
    },
    [openCompletedGenerationJob, stopGenerationPolling],
  );

  const restoreActiveGenerationJob = useCallback(
    async (email: string) => {
      try {
        const storedId = getStoredGenerationJobId(email);
        const job =
          (storedId ? await fetchGenerationJob(storedId).catch(() => null) : null) ??
          (await fetchActiveGenerationJob(email));

        if (!job) {
          clearStoredGenerationJobId();
          setGenerationJob(null);
          return;
        }

        setStoredGenerationJobId(email, job.jobId);
        setGenerationJob(job);

        if (
          job.status === 'Completed' ||
          job.status === 'Failed' ||
          job.status === 'Cancelled'
        ) {
          setLoading(false);
          return;
        }

        setLoading(true);
        beginPollingGenerationJob(job.jobId);
      } catch {
        /* no active job */
      }
    },
    [beginPollingGenerationJob],
  );

  useEffect(() => {
    if (!user || screen !== 'home') return;
    void restoreActiveGenerationJob(user.email);
  }, [user, screen, restoreActiveGenerationJob]);

  useEffect(() => () => stopGenerationPolling(), [stopGenerationPolling]);

  const toggleSection = (id: number) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const startPractice = async (opts?: { forceNew?: boolean }) => {
    if (!meta) return;
    setLoading(true);
    setError(null);
    try {
      if (opts?.forceNew) {
        clearStoredActiveExam();
        setActiveExam(null);
        examJobIdRef.current = null;
      }

      if (useAiMode) {
        if (!user) {
          setError('Sign in before generating AI questions so progress can resume after refresh.');
          setLoading(false);
          return;
        }

        const job = await startGenerationJob({
          userEmail: user.email,
          count: questionCount,
          sectionIds: selectedSections.length ? selectedSections : undefined,
          forceNew: opts?.forceNew ?? true,
        });
        setStoredGenerationJobId(user.email, job.jobId);
        setGenerationJob(job);

        if (job.status === 'Completed') {
          await openCompletedGenerationJob(job);
          return;
        }

        beginPollingGenerationJob(job.jobId);
        return;
      }

      const s = await createSession(
        questionCount,
        selectedSections.length ? selectedSections : undefined,
        'Json',
        undefined,
        selectedBankId,
      );
      examJobIdRef.current = null;
      await openSessionFromDto(s, meta, {
        startIndex: 0,
        bankId: selectedBankId,
        email: user?.email,
        hydrateReview: false,
      });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session.');
      setLoading(false);
    }
  };

  const cancelActiveGeneration = async () => {
    if (!user || !generationJob) return;
    setLoading(true);
    setError(null);
    try {
      await cancelGenerationJob(generationJob.jobId, user.email);
      clearStoredGenerationJobId();
      stopGenerationPolling();
      setGenerationJob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel generation.');
    } finally {
      setLoading(false);
    }
  };

  const openPracticeSetup = () => {
    setScreen('home');
    void refreshMetadata().catch(() => undefined);
  };

  const selectAnswer = (letter: string) => {
    if (!session || answerSubmitting || feedbackByIndex[index]) return;
    setSelectedLetter(letter);
    setDraftAnswersByIndex((prev) => ({ ...prev, [index]: letter }));
  };

  const submitCurrentAnswer = async () => {
    if (!session || !selectedLetter || answerSubmitting || feedbackByIndex[index]) return;
    setAnswerSubmitting(true);
    setError(null);
    try {
      const result = await submitAnswer(session.sessionId, index, selectedLetter);
      setAnswersByIndex((prev) => ({ ...prev, [index]: selectedLetter }));
      setFeedbackByIndex((prev) => ({ ...prev, [index]: result }));
      setDraftAnswersByIndex((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } catch {
      setError('Failed to save answer.');
    } finally {
      setAnswerSubmitting(false);
    }
  };

  const navigateToQuestion = useCallback(
    async (targetIndex: number) => {
      if (!session) return;
      setLoading(true);
      setError(null);
      try {
        setIndex(targetIndex);
        setSelectedLetter(
          answersByIndex[targetIndex] ?? draftAnswersByIndex[targetIndex] ?? null,
        );
        const q = await fetchQuestion(session.sessionId, targetIndex);
        setQuestion(q);
      } catch {
        setError('Failed to load question.');
      } finally {
        setLoading(false);
      }
    },
    [session, answersByIndex, draftAnswersByIndex],
  );

  const goPrevious = () => {
    if (index <= 0) return;
    void navigateToQuestion(index - 1);
  };

  const goNext = () => {
    if (!session || index + 1 >= session.totalQuestions) return;
    void navigateToQuestion(index + 1);
  };

  const finishSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [sum, rev] = await Promise.all([
        fetchSummary(session.sessionId),
        fetchReview(session.sessionId),
      ]);
      const sortedReview = [...rev.questions].sort((a, b) => a.index - b.index);
      if (sortedReview.length < sum.total) {
        setError(
          `Review shows ${sortedReview.length} of ${sum.total} questions. Restart the .NET backend and submit again.`,
        );
      }
      setSummary(sum);
      setReview(sortedReview);
      clearStoredActiveExam();
      setActiveExam(null);
      examJobIdRef.current = null;

      if (user && meta) {
        const targets = getSessionExamTargets(sum.total, meta);
        const scaled =
          sum.answered > 0 && sum.percentCorrect > 0
            ? toSessionScaledScore(sum.percentCorrect, targets)
            : null;
        try {
          const entry = await saveUserResult(user.email, {
            sessionId: sum.sessionId,
            total: sum.total,
            answered: sum.answered,
            correct: sum.correct,
            percentCorrect: sum.percentCorrect,
            sourceMode: session.sourceMode,
            scaledScore: scaled,
            questions: sortedReview,
          });
          setHistory((prev) => [entry, ...prev]);
        } catch {
          setError('Results loaded, but saving to your history failed.');
        }
      }

      setScreen('results');
    } catch {
      setError('Failed to load results.');
    } finally {
      setLoading(false);
    }
  }, [session, user, meta]);

  const proceedToSubmitReview = useCallback(() => {
    if (!session) return;
    setError(null);
    setScreen('submit-review');
  }, [session]);

  const goToQuestionFromReview = useCallback(
    (questionIndex: number) => {
      if (!session) return;
      setError(null);
      setScreen('quiz');
      if (index !== questionIndex) {
        void navigateToQuestion(questionIndex);
      }
    },
    [session, index, navigateToQuestion],
  );

  const backToExam = useCallback(() => {
    if (!session) return;
    goToQuestionFromReview(session.totalQuestions - 1);
  }, [session, goToQuestionFromReview]);

  const submitExam = useCallback(async () => {
    if (!session) return;
    await finishSession();
  }, [session, finishSession]);

  const finishSessionRef = useRef(finishSession);
  finishSessionRef.current = finishSession;

  useEffect(() => {
    if ((screen !== 'quiz' && screen !== 'submit-review') || !session) return;

    const tick = () => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    };

    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [screen, session?.sessionId]);

  useEffect(() => {
    if (
      (screen !== 'quiz' && screen !== 'submit-review') ||
      !session ||
      remainingSeconds > 0 ||
      timeUpHandled.current
    ) {
      return;
    }
    timeUpHandled.current = true;
    setError('Time is up. Showing results for questions you answered.');
    void finishSessionRef.current();
  }, [remainingSeconds, screen, session]);

  const restart = () => {
    clearStoredActiveExam();
    setActiveExam(null);
    examJobIdRef.current = null;
    setScreen('dashboard');
    setSession(null);
    setQuestion(null);
    setSummary(null);
    setReview([]);
    setIndex(0);
    setDraftAnswersByIndex({});
    setAnswersByIndex({});
    setFeedbackByIndex({});
    setSessionTargets(null);
    setRemainingSeconds(0);
    setAnswerSubmitting(false);
    timeUpHandled.current = false;
  };

  const previewTargets =
    meta && screen === 'home'
      ? getSessionExamTargets(Math.min(questionCount, sliderMax), meta)
      : null;

  const resultsTargets =
    sessionTargets ??
    (meta && summary ? getSessionExamTargets(summary.total, meta) : null);

  const scaledScore =
    summary && resultsTargets && summary.answered > 0
      ? toSessionScaledScore(summary.percentCorrect, resultsTargets)
      : null;
  const certPass =
    scaledScore !== null && resultsTargets
      ? scaledScore >= resultsTargets.passingScore
      : false;
  const resultsScoreDisplay =
    summary && (summary.answered === 0 || summary.percentCorrect === 0)
      ? `${summary.percentCorrect}%`
      : String(scaledScore ?? summary?.percentCorrect ?? 0);

  const answeredCount = Object.keys(answersByIndex).length;
  const totalQuestions = session?.totalQuestions ?? 0;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const isLastQuestion = session ? index + 1 >= session.totalQuestions : false;
  const showAppNav =
    user && (screen === 'dashboard' || screen === 'home' || screen === 'results');
  const showExamTimer = screen === 'quiz' || screen === 'submit-review';
  const currentFeedback = feedbackByIndex[index] ?? null;
  const questionAnswered = currentFeedback != null;

  useEffect(() => {
    if (!currentFeedback || !feedbackRef.current) return;
    feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentFeedback, index]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">CCA-F</span>
          <div>
            <h1>Claude Certified Architect</h1>
            <p>Practice exam — By AppUnik</p>
          </div>
        </div>
        <div className="header-end">
          <div className="header-toolbar">
            {showAppNav && (
              <nav className="app-nav" aria-label="Main navigation">
                <button
                  type="button"
                  className={`app-nav-btn ${screen === 'dashboard' || screen === 'results' ? 'active' : ''}`}
                  onClick={() => setScreen('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className={`app-nav-btn ${screen === 'home' ? 'active' : ''}`}
                  onClick={openPracticeSetup}
                >
                  Practice
                </button>
              </nav>
            )}
            <ThemeToggle />
            {user && screen !== 'welcome' && (
              <div className="user-chip">
                <span className="user-chip-name">{user.name}</span>
                <span className="user-chip-email muted">{user.email}</span>
                <button type="button" className="btn-link" onClick={switchUser}>
                  Switch user
                </button>
              </div>
            )}
            {showExamTimer && session && sessionTargets && (
              <div className="header-stats">
                <span
                  className={`mono exam-timer ${remainingSeconds <= 300 ? 'timer-low' : ''}`}
                  title={`Time limit for ${session.totalQuestions} questions`}
                >
                  {formatRemainingTime(remainingSeconds)} /{' '}
                  {formatRemainingTime(sessionTargets.timeLimitSeconds)}
                </span>
                {screen === 'quiz' && (
                  <span className="mono">
                    Q{index + 1}/{session.totalQuestions}
                  </span>
                )}
                {screen === 'submit-review' && <span className="muted">Submit review</span>}
              </div>
            )}
            <div className="header-logos">
              <img
                src="/logos/claude.png"
                alt="Claude Certified Architect"
                className="header-logo header-logo-claude"
              />
              <img
                src={
                  theme === 'dark'
                    ? '/logos/appunik-transparent.png'
                    : '/logos/appunik.png'
                }
                alt="AppUnik"
                className="header-logo header-logo-appunik"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {error && <div className="banner error">{error}</div>}

        {userLoading && screen === 'welcome' && (
          <section className="card welcome-card">
            <p className="muted">Loading…</p>
          </section>
        )}

        {!userLoading && screen === 'welcome' && (
          <section className="card welcome-card">
            <h2>Welcome</h2>
            <p className="muted">
              Enter your name and email to start practicing. Your exam results will be saved so you
              can review your history anytime.
            </p>
            <form className="welcome-form" onSubmit={(e) => void handleWelcomeSubmit(e)}>
              <label className="field">
                <span>Your name</span>
                <input
                  type="text"
                  className="text-input"
                  value={welcomeName}
                  onChange={(e) => setWelcomeName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  className="text-input"
                  value={welcomeEmail}
                  onChange={(e) => setWelcomeEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </label>
              <button
                type="submit"
                className="btn primary"
                disabled={loading || welcomeName.trim().length < 2 || !welcomeEmail.trim()}
              >
                {loading ? 'Saving…' : 'Continue'}
              </button>
            </form>
            <p className="welcome-admin-link">
              <a href="/admin">Admin sign in</a>
            </p>
          </section>
        )}

        {screen === 'dashboard' && user && (
          <Dashboard
            userName={user.name}
            userEmail={user.email}
            history={history}
            meta={meta}
            onStartPractice={openPracticeSetup}
            activeExamLabel={
              activeExam
                ? `Left off at question ${activeExam.currentIndex + 1} of ${activeExam.totalQuestions}${
                    activeExam.sourceMode === 'Ai' ? ' (AI test)' : ''
                  }`
                : null
            }
            onResumeExam={
              activeExam && meta
                ? () => {
                    if (activeExam.sourceMode === 'Ai') {
                      setUseAiMode(true);
                      setScreen('home');
                      return;
                    }
                    void resumeActiveExam(activeExam, meta);
                  }
                : undefined
            }
          />
        )}

        {screen === 'home' && (
          <section className="card home-card">
            <h2>Start a new practice session</h2>
            {user && (
              <p className="muted welcome-back">
                Welcome back, <strong>{user.name}</strong>.
              </p>
            )}

            <p className="muted">
              Official CCA-F format: multiple choice (1 correct, 3 distractors). Full exam is 60
              questions, <strong>2:00:00</strong>, pass {meta?.passingScore ?? 720}/
              {meta?.scoreMax ?? 1000} scaled. Your selection below scales time and pass targets
              proportionally.
            </p>

            {meta && (
              <>
                <details className="exam-guide">
                  <summary>Exam guide summary (from Anthropic materials)</summary>
                  <p className="hint">{meta.responseFormat}</p>
                  <p className="hint">{meta.examScenariosNote}</p>
                  <ul className="domain-list domain-list-grid">
                    {meta.sections.map((d) => (
                      <li key={d.id}>
                        <strong>{d.name}</strong> <em className="muted">({d.range})</em>
                      </li>
                    ))}
                  </ul>
                  {meta.scenarios && meta.scenarios.length > 0 && (
                    <>
                      <p className="hint">Six exam scenarios (4 shown per attempt on the real exam):</p>
                      <ol className="scenario-list">
                        {meta.scenarios.map((s) => (
                          <li key={s.id}>
                            {s.name}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </details>
                <fieldset className="sections source-mode">
                  <legend>Question source</legend>
                  <div className="source-options">
                    <label className="checkbox source-option">
                      <input
                        type="radio"
                        name="source"
                        checked={!useAiMode}
                        onChange={() => {
                          setUseAiMode(false);
                          if (meta) {
                            const bank = getSelectedBank(meta, selectedBankId);
                            setQuestionCount((c) => Math.min(c, bank.questionCount));
                          }
                        }}
                      />
                      <span>
                        <strong>Real exam question bank</strong> —{' '}
                        {selectedBank?.questionCount ?? meta.bankQuestionCount}{' '}
                        scenario-based questions from the Claude certification program (same
                        format as the live exam)
                      </span>
                    </label>
                    <label className="checkbox source-option">
                      <input
                        type="radio"
                        name="source"
                        checked={useAiMode}
                        onChange={() => {
                          setUseAiMode(true);
                          if (meta)
                            setQuestionCount((c) => Math.min(c, meta.maxQuestionsPerSession));
                        }}
                        disabled={!meta.aiGenerationAvailable}
                      />
                      <span>
                        <strong>AI from learning URL</strong> — Claude writes new questions each
                        session
                        {!meta.aiGenerationAvailable && (
                          <em className="muted">
                            {' '}
                            (set ANTHROPIC_API_KEY or AnthropicApiKey in backend .env)
                          </em>
                        )}
                      </span>
                    </label>
                  </div>
                </fieldset>

                {!useAiMode && meta.questionBanks && meta.questionBanks.length > 0 && (
                  <label className="field bank-select-field">
                    <span>Question bank</span>
                    <select
                      className="bank-select"
                      value={selectedBankId}
                      onChange={(e) => {
                        const nextBankId = e.target.value;
                        setSelectedBankId(nextBankId);
                        if (meta) {
                          const bank = getSelectedBank(meta, nextBankId);
                          setQuestionCount((c) => Math.min(c, bank.questionCount));
                        }
                      }}
                    >
                      {meta.questionBanks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name} ({bank.questionCount} questions)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {meta.aiGenerationAvailable && (
                  <label className="field learning-url-field">
                    <span>Learning material URL</span>
                    <input
                      type="url"
                      className="url-input"
                      value={learningUrl}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                )}

                <label className="field">
                  <span>
                    Number of questions{' '}
                    {useAiMode ? '(generated fresh)' : '(random order from bank)'}
                  </span>
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    value={Math.min(questionCount, sliderMax)}
                    disabled={!useAiMode && availableQuestionCount === 0}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                  />
                  <strong className="mono">{Math.min(questionCount, sliderMax)}</strong>
                  {!useAiMode && selectedSections.length > 0 && (
                    <span className="hint">
                      {' '}
                      (max {availableQuestionCount} for selected domain
                      {selectedSections.length === 1 ? '' : 's'})
                    </span>
                  )}
                </label>

                {previewTargets && (
                  <p className="session-targets hint">
                    For <strong>{previewTargets.questionCount}</strong> questions: time limit{' '}
                    <strong className="mono">
                      {formatRemainingTime(previewTargets.timeLimitSeconds)}
                    </strong>
                    , pass <strong>{previewTargets.passingScore}</strong>/
                    {previewTargets.scoreMax} scaled (full exam: {meta.passingScore}/
                    {meta.scoreMax} in 2:00:00).
                  </p>
                )}

                <fieldset className="sections domain-mode">
                  <legend>Filter by exam domain (optional)</legend>
                  <div className="domain-options">
                    {meta.sections.map((s) => {
                      const bankSection = bankSections.find((b) => b.id === s.id);
                      const inBankCount = bankSection?.questionCount;
                      return (
                      <label key={s.id} className="checkbox domain-option">
                        <input
                          type="checkbox"
                          checked={selectedSections.includes(s.id)}
                          onChange={() => toggleSection(s.id)}
                        />
                        <span>
                          <strong>{s.name}</strong>{' '}
                          <em className="muted">
                            ({s.range}
                            {!useAiMode && inBankCount !== undefined
                              ? ` · ${inBankCount} in bank`
                              : ''}
                            )
                          </em>
                        </span>
                      </label>
                      );
                    })}
                  </div>
                  <p className="hint">
                    {useAiMode
                      ? 'Optional topic focus for AI generation.'
                      : selectedSections.length > 0
                        ? availableQuestionCount === 0
                          ? 'No questions in the bank for the selected domain(s). Clear the filter or choose other domains.'
                          : `Leave all unchecked to pull from the full bank (${selectedBank?.questionCount ?? meta.bankQuestionCount} questions).`
                        : 'Leave all unchecked to pull from the full question bank.'}
                  </p>
                </fieldset>

                {activeExam &&
                  (!useAiMode
                    ? activeExam.sourceMode !== 'Ai'
                    : activeExam.sourceMode === 'Ai') && (
                  <div className="generation-resume banner info">
                    <p>
                      You left off at question {activeExam.currentIndex + 1} of{' '}
                      {activeExam.totalQuestions}
                      {activeExam.sourceMode === 'Ai' ? ' (AI test)' : ''}.
                    </p>
                    <div className="start-exam-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={loading || !meta}
                        onClick={() => {
                          if (!meta) return;
                          void resumeActiveExam(activeExam, meta);
                        }}
                      >
                        Resume your last test
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={loading || !meta}
                        onClick={() => void startPractice({ forceNew: true })}
                      >
                        {useAiMode ? 'Generate new test' : 'Start new exam'}
                      </button>
                    </div>
                  </div>
                )}

                {useAiMode && generationJob && (
                  <div className="generation-resume banner info">
                    <p>
                      {generationJob.status === 'Completed'
                        ? `Your ${generationJob.requestedCount} AI questions are ready.`
                        : generationJob.status === 'Failed'
                          ? `Generation paused with ${generationJob.completedCount}/${generationJob.requestedCount} questions saved.`
                          : `Generating for you (${user?.name ?? 'this account'})…`}
                    </p>
                    {(generationJob.status === 'Pending' || generationJob.status === 'Running') && (
                      <>
                        <div className="progress generation-progress">
                          <div
                            className="progress-bar"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (100 * generationJob.completedCount) /
                                    Math.max(1, generationJob.requestedCount),
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mono hint">
                          {generationJob.completedCount}/{generationJob.requestedCount} questions
                          {generationPolling ? ' · generating in background…' : ''}
                        </p>
                      </>
                    )}
                    <div className="generation-actions">
                      {(generationJob.status === 'Pending' ||
                        generationJob.status === 'Running') && (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void cancelActiveGeneration()}
                            disabled={loading && !generationPolling}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void startPractice({ forceNew: true })}
                            disabled={loading && !generationPolling}
                          >
                            Start over
                          </button>
                        </>
                      )}
                      {(generationJob.status === 'Failed' ||
                        generationJob.status === 'Cancelled') && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() =>
                            void startPractice({
                              forceNew: generationJob.status === 'Cancelled',
                            })
                          }
                          disabled={loading}
                        >
                          {generationJob.completedCount > 0
                            ? 'Resume generation'
                            : 'Retry generation'}
                        </button>
                      )}
                      {generationJob.status === 'Completed' && !activeExam && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => void openCompletedGenerationJob(generationJob)}
                          disabled={loading}
                        >
                          Open exam
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!(
                  activeExam &&
                  (useAiMode
                    ? activeExam.sourceMode === 'Ai'
                    : activeExam.sourceMode !== 'Ai')
                ) && (
                <div className="start-exam-actions">
                  <button
                    className="btn primary"
                    onClick={() => void startPractice({ forceNew: true })}
                    disabled={
                      loading ||
                      generationPolling ||
                      !meta ||
                      (useAiMode && !meta.aiGenerationAvailable) ||
                      (!useAiMode && availableQuestionCount === 0) ||
                      (useAiMode &&
                        !!generationJob &&
                        (generationJob.status === 'Pending' ||
                          generationJob.status === 'Running'))
                    }
                  >
                    {loading || generationPolling
                      ? useAiMode
                        ? generationJob
                          ? `Generating ${generationJob.completedCount}/${generationJob.requestedCount}…`
                          : 'Starting AI generation…'
                        : 'Starting…'
                      : useAiMode
                        ? 'Generate & start exam'
                        : 'Start exam'}
                  </button>
                </div>
                )}
              </>
            )}

            {!meta && !error && <p className="muted">Loading exam data…</p>}
          </section>
        )}

        {screen === 'quiz' && question && (
          <section className="card quiz-card">
            {sessionTargets && (
              <div className="quiz-timer-bar">
                <span className="muted">
                  Time remaining ({sessionTargets.questionCount} questions)
                </span>
                <span
                  className={`mono exam-timer ${remainingSeconds <= 300 ? 'timer-low' : ''}`}
                >
                  {formatRemainingTime(remainingSeconds)} /{' '}
                  {formatRemainingTime(sessionTargets.timeLimitSeconds)}
                </span>
              </div>
            )}
            <div className="question-meta">
              <span className="pill">{question.sectionName}</span>
            </div>
            <h2 className="question-text">
              <span className="question-number" aria-hidden="true">
                {index + 1}.
              </span>
              <span className="question-text-body">
                <FormatText text={question.text} />
              </span>
            </h2>

            <div className="options" role="radiogroup" aria-label="Answer choices">
              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const text = question.options[letter];
                if (!text) return null;
                const selected = selectedLetter === letter;
                const isPendingSelection = answerSubmitting && selected && !questionAnswered;
                const isCorrectOption =
                  questionAnswered && letter === currentFeedback.correctAnswer;
                const isWrongSelection =
                  questionAnswered &&
                  letter === currentFeedback.selectedAnswer &&
                  !currentFeedback.isCorrect;
                const optionClass = [
                  'option',
                  selected ? 'selected' : '',
                  isPendingSelection ? 'pending' : '',
                  isCorrectOption ? 'correct' : '',
                  isWrongSelection ? 'wrong' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const explText =
                  questionAnswered && currentFeedback
                    ? getExplanationForOption({
                        letter,
                        correctAnswer: currentFeedback.correctAnswer,
                        explanation: currentFeedback.explanation,
                        optionText: text,
                        selectedAnswer: currentFeedback.selectedAnswer,
                        optionExplanations: currentFeedback.optionExplanations,
                        wrongAnswerExplanation: currentFeedback.wrongAnswerExplanation,
                      })
                    : null;

                return (
                  <div key={letter} className="option-block">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={optionClass}
                      onClick={() => selectAnswer(letter)}
                      disabled={loading || answerSubmitting || questionAnswered}
                    >
                      <span className="option-radio" aria-hidden="true" />
                      <span className="option-letter" aria-hidden="true">
                        {letter}
                      </span>
                      <span className="option-text">
                        <FormatText text={text} />
                      </span>
                      {isCorrectOption && (
                        <span className="option-result ok" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      {isWrongSelection && (
                        <span className="option-result bad" aria-hidden="true">
                          ✗
                        </span>
                      )}
                    </button>
                    {questionAnswered && explText && (
                      <OptionExplanation
                        isCorrectOption={Boolean(isCorrectOption)}
                        explanationText={explText}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {questionAnswered && currentFeedback && (
              <div className="answer-comparison-wrap">
                <AnswerComparison
                  selectedAnswer={currentFeedback.selectedAnswer}
                  correctAnswer={currentFeedback.correctAnswer}
                  isCorrect={currentFeedback.isCorrect}
                  answered
                  selectedExplanation={
                    getExplanationForOption({
                      letter: currentFeedback.selectedAnswer,
                      correctAnswer: currentFeedback.correctAnswer,
                      explanation: currentFeedback.explanation,
                      selectedAnswer: currentFeedback.selectedAnswer,
                      optionExplanations: currentFeedback.optionExplanations,
                      wrongAnswerExplanation: currentFeedback.wrongAnswerExplanation,
                    }).body
                  }
                  correctExplanation={
                    getExplanationForOption({
                      letter: currentFeedback.correctAnswer,
                      correctAnswer: currentFeedback.correctAnswer,
                      explanation: currentFeedback.explanation,
                      selectedAnswer: currentFeedback.selectedAnswer,
                      optionExplanations: currentFeedback.optionExplanations,
                      wrongAnswerExplanation: currentFeedback.wrongAnswerExplanation,
                    }).body
                  }
                />
              </div>
            )}

            {!questionAnswered && (
              <div className="quiz-submit-answer">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void submitCurrentAnswer()}
                  disabled={loading || answerSubmitting || !selectedLetter}
                >
                  {answerSubmitting ? 'Checking answer…' : 'Submit answer'}
                </button>
              </div>
            )}

            {answerSubmitting && !currentFeedback && (
              <div className="question-feedback feedback-pending" aria-live="polite">
                <p className="question-feedback-status">
                  <strong>Checking your answer…</strong>
                </p>
              </div>
            )}

            {currentFeedback && (
              <div
                ref={feedbackRef}
                className={`question-feedback reveal ${currentFeedback.isCorrect ? 'feedback-ok' : 'feedback-bad'}`}
                aria-live="polite"
              >
                <p className="question-feedback-status">
                  {currentFeedback.isCorrect ? (
                    <strong>Correct</strong>
                  ) : (
                    <strong>Incorrect</strong>
                  )}
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  Open an option&apos;s Explanation to see why it is correct or incorrect.
                </p>
              </div>
            )}

            <div className="quiz-actions">
              <p className="hint">
                {questionAnswered
                  ? 'Review the explanation, then continue to the next question.'
                  : 'Select an answer, then submit to check whether you were right and read the explanation.'}
                {answeredCount > 0 && (
                  <>
                    {' '}
                    <span className="mono">
                      {answeredCount}/{session?.totalQuestions ?? 0}
                    </span>{' '}
                    answered.
                  </>
                )}
              </p>
              <div className="quiz-nav">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={goPrevious}
                  disabled={loading || index <= 0}
                >
                  Previous
                </button>
                {isLastQuestion ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={proceedToSubmitReview}
                    disabled={loading || answerSubmitting}
                  >
                    Proceed to Submit Exam
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={goNext}
                    disabled={loading || answerSubmitting || !questionAnswered}
                  >
                    Next question
                  </button>
                )}
              </div>
            </div>

            <div className="progress">
              <div
                className="progress-bar"
                style={{
                  width: `${(answeredCount / (session?.totalQuestions ?? 1)) * 100}%`,
                }}
              />
            </div>
          </section>
        )}

        {screen === 'submit-review' && session && (
          <section className="card submit-review-card">
            <h2>Submit exam</h2>
            <p className="muted">
              Review your progress before final submission. You can go back to change answers.
            </p>
            {sessionTargets && (
              <div className="quiz-timer-bar">
                <span className="muted">Time remaining</span>
                <span
                  className={`mono exam-timer ${remainingSeconds <= 300 ? 'timer-low' : ''}`}
                >
                  {formatRemainingTime(remainingSeconds)} /{' '}
                  {formatRemainingTime(sessionTargets.timeLimitSeconds)}
                </span>
              </div>
            )}
            <ul className="stats submit-stats">
              <li>
                <strong>{totalQuestions}</strong>
                total questions
              </li>
              <li>
                <strong>{answeredCount}</strong>
                answered
              </li>
              <li>
                <strong className={unansweredCount > 0 ? 'stat-warn' : ''}>
                  {unansweredCount}
                </strong>
                unanswered
              </li>
            </ul>
            {unansweredCount > 0 && (
              <p className="hint submit-warn">
                You have {unansweredCount} unanswered question
                {unansweredCount === 1 ? '' : 's'}. Unanswered questions count as incorrect.
              </p>
            )}
            <div className="question-palette">
              <p className="hint">Click a number to go to that question.</p>
              <div className="question-palette-grid" role="navigation" aria-label="Question list">
                {Array.from({ length: totalQuestions }, (_, i) => {
                  const answered = answersByIndex[i] != null;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`palette-box ${answered ? 'answered' : 'unanswered'}`}
                      onClick={() => goToQuestionFromReview(i)}
                      disabled={loading}
                      title={
                        answered
                          ? `Question ${i + 1} — answered`
                          : `Question ${i + 1} — unanswered`
                      }
                      aria-label={
                        answered
                          ? `Question ${i + 1}, answered`
                          : `Question ${i + 1}, unanswered`
                      }
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <p className="palette-legend hint">
                <span className="legend-swatch answered" /> Answered
                <span className="legend-swatch unanswered" /> Unanswered
              </p>
            </div>
            <div className="submit-review-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={backToExam}
                disabled={loading}
              >
                Back to exam
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void submitExam()}
                disabled={loading}
              >
                {loading ? 'Submitting…' : 'Submit exam'}
              </button>
            </div>
          </section>
        )}

        {screen === 'results' && summary && (
          <section className="card results-card">
            <h2>Session complete</h2>
            <div className={`score-ring ${certPass ? 'pass' : 'fail'}`}>
              <span className="score-value">{resultsScoreDisplay}</span>
              <span className="score-label">
                {summary.answered === 0
                  ? 'No answers submitted — unanswered questions count as incorrect'
                  : resultsTargets && scaledScore != null
                    ? certPass
                      ? `Scaled score — at/above ${resultsTargets.passingScore} pass (${resultsTargets.questionCount} questions)`
                      : `Below ${resultsTargets.passingScore} pass (${summary.percentCorrect}% correct)`
                    : `${summary.percentCorrect}% correct`}
              </span>
            </div>
            <ul className="stats">
              <li>
                <strong>{summary.correct}</strong> correct
              </li>
              <li>
                <strong>{summary.answered}</strong> answered
              </li>
              <li>
                <strong>{summary.total}</strong> in session
              </li>
            </ul>
            {meta && resultsTargets && (
              <p className="muted">
                Scaled score for this session: {resultsTargets.scoreMin}–{resultsTargets.scoreMax}{' '}
                (pass {resultsTargets.passingScore}). Full {meta.totalQuestions}-question exam:{' '}
                {meta.scoreMin}–{meta.scoreMax}, pass {meta.passingScore}, 2:00:00, practice target{' '}
                {meta.practicePassingScore}+.
              </p>
            )}

            {review.length > 0 && (
              <div className="review-section">
                <h3>Answer review</h3>
                <p className="hint">
                  All questions in your session — answered, unanswered, correct, and incorrect.
                </p>
                {review.map((item) => {
                  const statusClass = !item.answered
                    ? 'unanswered'
                    : item.isCorrect
                      ? 'ok'
                      : 'bad';
                  const statusLabel = !item.answered
                    ? 'Unanswered'
                    : item.isCorrect
                      ? 'Correct'
                      : 'Incorrect';
                  const itemClass = !item.answered
                    ? 'review-unanswered'
                    : item.isCorrect
                      ? 'review-ok'
                      : 'review-bad';

                  return (
                    <details key={item.index} className={`review-item ${itemClass}`}>
                      <summary>
                        <span className="review-qnum">Q{item.index + 1}</span>
                        <span className="review-title">{item.title}</span>
                        <span className={`review-badge ${statusClass}`}>{statusLabel}</span>
                      </summary>
                      <div className="review-body">
                        <p className="pill">{item.sectionName}</p>
                        <p className="question-text">
                          <span className="question-number" aria-hidden="true">
                            {item.index + 1}.
                          </span>
                          <span className="question-text-body">
                            <FormatText text={item.text} />
                          </span>
                        </p>
                        <ul className="review-options">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const optText = item.options[letter];
                            if (!optText) return null;
                            const isSelected = item.selectedAnswer === letter;
                            const isCorrect = item.correctAnswer === letter;
                            const state = isCorrect
                              ? 'correct'
                              : isSelected && !item.isCorrect
                                ? 'wrong'
                                : isSelected
                                  ? 'selected'
                                  : '';
                            const explText = getExplanationForOption({
                              letter,
                              correctAnswer: item.correctAnswer,
                              explanation: item.explanation,
                              optionText: optText,
                              selectedAnswer: item.selectedAnswer,
                              optionExplanations: item.optionExplanations,
                              wrongAnswerExplanation: item.wrongAnswerExplanation,
                            });
                            return (
                              <li key={letter} className="review-option-block">
                                <div className={`review-option ${state}`}>
                                  <span className="option-radio" aria-hidden="true" />
                                  <span className="option-letter" aria-hidden="true">
                                    {letter}
                                  </span>
                                  <span className="option-text">
                                    <FormatText text={optText} />
                                  </span>
                                </div>
                                <OptionExplanation
                                  isCorrectOption={isCorrect}
                                  explanationText={explText}
                                />
                              </li>
                            );
                          })}
                        </ul>
                        <div className="result-detail-answers">
                          <AnswerComparison
                            selectedAnswer={item.selectedAnswer}
                            correctAnswer={item.correctAnswer}
                            isCorrect={item.isCorrect}
                            answered={item.answered}
                            selectedExplanation={
                              item.selectedAnswer
                                ? getExplanationForOption({
                                    letter: item.selectedAnswer,
                                    correctAnswer: item.correctAnswer,
                                    explanation: item.explanation,
                                    selectedAnswer: item.selectedAnswer,
                                    optionExplanations: item.optionExplanations,
                                    wrongAnswerExplanation: item.wrongAnswerExplanation,
                                  }).body
                                : null
                            }
                            correctExplanation={
                              getExplanationForOption({
                                letter: item.correctAnswer,
                                correctAnswer: item.correctAnswer,
                                explanation: item.explanation,
                                selectedAnswer: item.selectedAnswer,
                                optionExplanations: item.optionExplanations,
                                wrongAnswerExplanation: item.wrongAnswerExplanation,
                              }).body
                            }
                          />
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            <div className="results-actions">
              <button className="btn secondary" onClick={() => setScreen('dashboard')}>
                View dashboard
              </button>
              <button className="btn primary" onClick={restart}>
                New practice session
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Real exam bank: 60 scenario questions · AI: generated from learning URL · 5 official domains</span>
        <span>API: .NET 8 · UI: React + Vite</span>
      </footer>
    </div>
  );
}
