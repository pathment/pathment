import { apiClient } from './api-client';

// ── Types ──────────────────────────────────────────────────────────────────
export type QuizQuestionKind = 'single' | 'multi' | 'boolean' | 'short';
export type QuizMatchMode = 'exact' | 'keyword';
export type QuizKitStatus = 'draft' | 'published' | 'archived';
export type QuizEvaluationMode = 'auto' | 'review';

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestionInput {
  id?: string;
  kind: QuizQuestionKind;
  prompt: string;
  points?: number;
  required?: boolean;
  options?: QuizOption[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  matchMode?: QuizMatchMode;
  explanation?: string | null;
  config?: Record<string, unknown>;
}

export interface QuizKitInput {
  title: string;
  description?: string | null;
  timeLimitSeconds?: number | null;
  passScore?: number | null;
  shuffleQuestions?: boolean;
  showAnswers?: boolean;
  allowRetakeDefault?: boolean;
  evaluationDefault?: QuizEvaluationMode;
  status?: QuizKitStatus;
  questions?: QuizQuestionInput[];
}

export interface QuizKitSummary {
  id: string;
  title: string;
  description: string | null;
  status: QuizKitStatus;
  timeLimitSeconds: number | null;
  passScore: number | null;
  evaluationDefault: QuizEvaluationMode;
  allowRetakeDefault: boolean;
  questionCount: number;
  totalPoints: number;
  updatedAt: string;
}

export interface QuizKit extends Omit<QuizKitSummary, 'questionCount'> {
  createdBy: string;
  programId: string | null;
  clanId: string | null;
  shuffleQuestions: boolean;
  showAnswers: boolean;
  settings: Record<string, unknown>;
  questions: Required<QuizQuestionInput>[];
  createdAt: string;
}

// Per-assignment options passed on a custom `quiz` task.
export interface QuizAssignOptions {
  kitId: string;
  evaluationMode?: QuizEvaluationMode;
  allowRetake?: boolean;
  timeLimitSeconds?: number | null;
  shuffleQuestions?: boolean;
  showAnswers?: boolean;
  passScore?: number | null;
}

// ── Candidate runner types ─────────────────────────────────────────────────
export interface CandidateQuizQuestion {
  id: string;
  position: number;
  kind: QuizQuestionKind;
  prompt: string;
  points: number;
  required: boolean;
  options: QuizOption[];
  multiple: boolean;
}

export interface QuizSavedAnswer {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
}

export interface QuizResultItem {
  questionId: string;
  prompt: string;
  kind: QuizQuestionKind;
  points: number;
  options: QuizOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
  selectedOptionIds: string[];
  answerText: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface CandidateQuiz {
  task: { id: string; status: string; dueDate: string | null };
  kit: { id: string; title: string; description: string | null; totalPoints: number };
  options: {
    evaluationMode: QuizEvaluationMode;
    allowRetake: boolean;
    timeLimitSeconds: number | null;
    showAnswers: boolean;
    passScore: number | null;
  };
  questions: CandidateQuizQuestion[];
  state: {
    canStart: boolean;
    activeSessionId: string | null;
    attemptNumber: number;
    submittedCount: number;
    savedAnswers: QuizSavedAnswer[];
    currentPosition: number;
    sessionStartedAt: string | null;
    lastResult: {
      scorePercent: number | null;
      autoScore: number | null;
      maxScore: number | null;
      passed: boolean | null;
      submittedAt: string | null;
    } | null;
  };
  serverNow: string;
}

export interface QuizSubmitResult {
  autoScore: number;
  maxScore: number;
  scorePercent: number;
  passed: boolean | null;
  evaluationMode: QuizEvaluationMode;
  finalized: boolean;
  review: QuizResultItem[] | null;
}

export interface SaveQuizAnswerPayload {
  questionId: string;
  selectedOptionIds?: string[];
  answerText?: string | null;
}

// ── Review types ────────────────────────────────────────────────────────────
export interface QuizReviewAnswer {
  selectedOptionIds: string[];
  answerText: string | null;
  isCorrect: boolean | null;
  autoPoints: number | null;
  pointsAwarded: number | null;
  scoreNote: string | null;
}
export interface QuizReviewItem {
  questionId: string;
  position: number;
  kind: QuizQuestionKind;
  prompt: string;
  points: number;
  options: QuizOption[];
  correctOptionIds: string[] | null;
  acceptedAnswers: string[] | null;
  matchMode: QuizMatchMode;
  explanation: string | null;
  answer: QuizReviewAnswer | null;
}
export interface QuizReview {
  task: { id: string; status: string; pointsAwarded: number | null; menteeId: string };
  kit: { id: string; title: string; description: string | null };
  options: { evaluationMode: QuizEvaluationMode; allowRetake: boolean; passScore: number | null };
  session: {
    id: string; status: string; attemptNumber: number; submittedAt: string | null;
    autoScore: number | null; maxScore: number | null; scorePercent: number | null; passed: boolean | null;
    mentee: { id: string; name: string; avatarUrl: string | null } | null;
  } | null;
  items: QuizReviewItem[];
  totals: { totalPossible: number; totalAwarded: number; questionCount: number };
  canReview: boolean;
}

// ── API ──────────────────────────────────────────────────────────────────
export const quizApi = {
  // Authoring. Pass `status` (e.g. 'published') to limit to assignable kits.
  listKits: (status?: QuizKitStatus) =>
    apiClient.get('/quizzes/kits', status ? { params: { status } } : undefined),
  getKit: (id: string) => apiClient.get(`/quizzes/kits/${id}`),
  createKit: (data: QuizKitInput) => apiClient.post('/quizzes/kits', data),
  updateKit: (id: string, data: Partial<QuizKitInput>) => apiClient.patch(`/quizzes/kits/${id}`, data),
  deleteKit: (id: string) => apiClient.delete(`/quizzes/kits/${id}`),

  // Candidate runner
  getCandidateQuiz: (taskId: string) => apiClient.get(`/quizzes/assignments/${taskId}`),
  startQuiz: (taskId: string) => apiClient.post(`/quizzes/assignments/${taskId}/start`, {}),
  saveAnswer: (sessionId: string, payload: SaveQuizAnswerPayload) =>
    apiClient.patch(`/quizzes/sessions/${sessionId}/answer`, payload),
  submitQuiz: (sessionId: string) => apiClient.post(`/quizzes/sessions/${sessionId}/submit`, {}),

  // Mentor review
  getReview: (taskId: string) => apiClient.get(`/quizzes/review/${taskId}`),
  gradeAnswer: (taskId: string, questionId: string, data: { pointsAwarded?: number; scoreNote?: string | null }) =>
    apiClient.patch(`/quizzes/review/${taskId}/answer`, { questionId, ...data }),
  finalizeReview: (taskId: string, overallNote?: string) =>
    apiClient.post(`/quizzes/review/${taskId}/finalize`, { overallNote }),
};

export default quizApi;
