import { apiClient } from './api-client';
import { videoFormData, type VideoUploadEndpoints } from '@/lib/proctoring/videoUpload';
import type { ProctorApi, ProctorEvent, ProctorSnapshot } from './interview-api';

// ── Types ──────────────────────────────────────────────────────────────────
export type QuizQuestionKind = 'single' | 'multi' | 'boolean' | 'short' | 'video' | 'code';
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
  /** Video questions: the longest one recording may run (seconds, 15–300). */
  maxRecordingSeconds?: number;
  /** Code questions: editor language, starting code, and the mentor-only model solution. */
  codeLanguage?: string;
  starterCode?: string | null;
  referenceSolution?: string | null;
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
  /** Assign it with full proctoring (camera + entire screen) unless the mentor turns it off. */
  proctorDefault?: boolean;
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
  proctorDefault?: boolean;
  /** Has a video question — always reviewed by the mentor. */
  hasVideo?: boolean;
  hasCode?: boolean;
  /** Has a video or code question: the mentor scores those, so it's always reviewed. */
  mentorGraded?: boolean;
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
  proctored?: boolean;
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
  maxRecordingSeconds?: number | null;
  codeLanguage?: string | null;
  starterCode?: string | null;
}

export interface QuizSavedAnswer {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  videoUrl?: string | null;
  transcript?: string | null;
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
  videoUrl?: string | null;
  /** null for a video waiting for the mentor's score. */
  isCorrect: boolean | null;
  pointsAwarded: number | null;
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
    cameraRequired?: boolean;
    screenShareRequired?: boolean;
    videoAnswers?: boolean;
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
  /** Video answers: the live captions. */
  transcript?: string | null;
}

// ── Review types ────────────────────────────────────────────────────────────
export interface QuizReviewAnswer {
  selectedOptionIds: string[];
  answerText: string | null;
  videoUrl?: string | null;
  transcript?: string | null;
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
  maxRecordingSeconds?: number | null;
  codeLanguage?: string | null;
  /** Mentor only. */
  referenceSolution?: string | null;
  snapshots?: ProctorSnapshot[];
  answer: QuizReviewAnswer | null;
}
export interface QuizReview {
  task: { id: string; status: string; pointsAwarded: number | null; menteeId: string };
  kit: { id: string; title: string; description: string | null };
  options: { evaluationMode: QuizEvaluationMode; allowRetake: boolean; passScore: number | null; proctored?: boolean; screenShareRequired?: boolean };
  proctor?: {
    snapshots: ProctorSnapshot[];
    flags: { type: string; at: string; meta: Record<string, unknown> }[];
    flagCounts: Record<string, number>;
  };
  /** Video and code answers still to score before the review can finish. */
  toGrade?: number;
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
  /** `capabilities`: what this browser can do ('screen', 'video'). */
  startQuiz: (taskId: string, capabilities: string[] = []) =>
    apiClient.post(`/quizzes/assignments/${taskId}/start`, { capabilities }),
  saveAnswer: (sessionId: string, payload: SaveQuizAnswerPayload) =>
    apiClient.patch(`/quizzes/sessions/${sessionId}/answer`, payload),
  submitQuiz: (sessionId: string) => apiClient.post(`/quizzes/sessions/${sessionId}/submit`, {}),
  signVideoUpload: (sessionId: string, questionId: string) =>
    apiClient.post(`/quizzes/sessions/${sessionId}/video/sign`, { questionId }),
  attachVideo: (sessionId: string, questionId: string, publicId: string) =>
    apiClient.post(`/quizzes/sessions/${sessionId}/video`, { questionId, publicId }),
  uploadAnswerVideoFile: (sessionId: string, questionId: string, blob: Blob, onProgress?: (fraction: number) => void) =>
    apiClient.post(`/quizzes/sessions/${sessionId}/video`, videoFormData(questionId, blob), {
      timeout: 180000,
      onUploadProgress: (e: { loaded: number; total?: number }) => { if (e.total) onProgress?.(e.loaded / e.total); },
    }),
  logProctor: (sessionId: string, events: ProctorEvent[]) =>
    apiClient.post(`/quizzes/sessions/${sessionId}/proctor`, { events }),
  uploadSnapshot: (sessionId: string, blob: Blob, questionId?: string | null, source: 'camera' | 'screen' = 'camera') => {
    const fd = new FormData();
    fd.append('image', blob, `${source}-${Date.now()}.jpg`);
    fd.append('source', source);
    if (questionId) fd.append('questionId', questionId);
    return apiClient.post(`/quizzes/sessions/${sessionId}/snapshot`, fd);
  },

  // Mentor review
  getReview: (taskId: string) => apiClient.get(`/quizzes/review/${taskId}`),
  gradeAnswer: (taskId: string, questionId: string, data: { pointsAwarded?: number; scoreNote?: string | null }) =>
    apiClient.patch(`/quizzes/review/${taskId}/answer`, { questionId, ...data }),
  finalizeReview: (taskId: string, overallNote?: string) =>
    apiClient.post(`/quizzes/review/${taskId}/finalize`, { overallNote }),
  deleteSnapshots: (taskId: string) => apiClient.delete(`/quizzes/review/${taskId}/snapshots`),
};

/** Where quiz video answers go (see video-upload). */
export const quizVideoEndpoints: VideoUploadEndpoints = {
  sign: quizApi.signVideoUpload,
  attach: quizApi.attachVideo,
  uploadFile: quizApi.uploadAnswerVideoFile,
};

/** Quiz proctoring: where events and snapshots go (see useProctor). */
export const quizProctorApi: ProctorApi = {
  logProctor: quizApi.logProctor,
  uploadSnapshot: quizApi.uploadSnapshot,
};

export default quizApi;
