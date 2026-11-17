import { apiClient } from './api-client';
import { videoFormData, type VideoUploadEndpoints } from './video-upload';

/** Where a proctored attempt sends its events and snapshots (interviews and quizzes). */
export interface ProctorApi {
  logProctor: (sessionId: string, events: ProctorEvent[]) => Promise<unknown>;
  uploadSnapshot: (sessionId: string, blob: Blob, questionId?: string | null, source?: 'camera' | 'screen') => Promise<unknown>;
}

// ── Types ──────────────────────────────────────────────────────────────────
export type InterviewQuestionKind = 'voice' | 'code' | 'text' | 'video';
export type InterviewTimingMode = 'per_question' | 'total';
export type InterviewKitStatus = 'draft' | 'published' | 'archived';

export interface InterviewQuestionInput {
  id?: string;
  kind: InterviewQuestionKind;
  prompt: string;
  timeLimitSeconds?: number;
  points?: number;
  required?: boolean;
  codeLanguage?: string;
  starterCode?: string | null;
  referenceAnswer?: string | null;
  promptAudioUrl?: string | null;
  promptAudioPublicId?: string | null;
  /** Video questions: the longest one recording may run (stored in config). */
  maxRecordingSeconds?: number;
  config?: Record<string, unknown>;
}

export interface InterviewerSettings {
  name: string | null;
  voiceName: string | null;
  pitch: number; // 0–2
  rate: number;  // 0.5–2
}

export interface InterviewKitInput {
  title: string;
  description?: string | null;
  timingMode?: InterviewTimingMode;
  totalSeconds?: number | null;
  cameraDefault?: boolean;
  aiGradingDefault?: boolean;
  allowRetakeDefault?: boolean;
  status?: InterviewKitStatus;
  interviewer?: Partial<InterviewerSettings>;
  questions?: InterviewQuestionInput[];
}

export interface InterviewKitSummary {
  id: string;
  title: string;
  description: string | null;
  status: InterviewKitStatus;
  timingMode: InterviewTimingMode;
  totalSeconds: number | null;
  cameraDefault: boolean;
  aiGradingDefault: boolean;
  allowRetakeDefault: boolean;
  questionCount: number;
  totalPoints: number;
  updatedAt: string;
}

export interface InterviewKit extends Omit<InterviewKitSummary, 'questionCount'> {
  createdBy: string;
  programId: string | null;
  clanId: string | null;
  settings: Record<string, unknown>;
  questions: Required<InterviewQuestionInput>[];
  createdAt: string;
}

// Per-assignment options passed on a custom `interview` task.
export interface InterviewAssignOptions {
  kitId: string;
  allowRetake?: boolean;
  cameraRequired?: boolean;
  aiGradingEnabled?: boolean;
  timingMode?: InterviewTimingMode;
  totalSeconds?: number | null;
}

// ── Candidate runner types ─────────────────────────────────────────────────
export interface CandidateQuestion {
  id: string;
  position: number;
  kind: InterviewQuestionKind;
  prompt: string;
  timeLimitSeconds: number | null;
  points: number;
  required: boolean;
  codeLanguage: string | null;
  starterCode: string | null;
  promptAudioUrl: string | null;
  /** Video questions: the longest one recording may run, in seconds. */
  maxRecordingSeconds?: number | null;
}

export interface SavedAnswer {
  questionId: string;
  transcript: string | null;
  audioUrl: string | null;
  videoUrl?: string | null;
  code: string | null;
  answerText: string | null;
  timeSpentSeconds: number;
  startedAt: string | null;
}

export interface CandidateInterview {
  task: { id: string; status: string; dueDate: string | null };
  kit: { id: string; title: string; description: string | null; totalPoints: number };
  interviewer: InterviewerSettings | null;
  options: {
    allowRetake: boolean;
    /** Camera must stay on: proctored, or it has video answers. */
    cameraRequired: boolean;
    /** The entire screen must be shared for the whole interview. */
    screenShareRequired?: boolean;
    /** At least one question is answered on video. */
    videoAnswers?: boolean;
    timingMode: InterviewTimingMode;
    totalSeconds: number | null;
  };
  questions: CandidateQuestion[];
  state: {
    canStart: boolean;
    activeSessionId: string | null;
    attemptNumber: number;
    submittedCount: number;
    savedAnswers: SavedAnswer[];
    currentPosition: number;
    sessionStartedAt: string | null;
    // When non-empty, the mentor asked the mentee to redo ONLY these questions.
    redoQuestionIds?: string[];
  };
  serverNow: string;
}

export interface SaveAnswerPayload {
  questionId: string;
  transcript?: string | null;
  code?: string | null;
  answerText?: string | null;
  timeSpentSeconds?: number;
}

export interface ProctorEvent {
  type: string;
  at?: string;
  meta?: Record<string, unknown>;
}

// ── API ──────────────────────────────────────────────────────────────────
export const interviewApi = {
  // Authoring. Pass `status` (e.g. 'published') to limit to assignable kits.
  listKits: (status?: InterviewKitStatus) =>
    apiClient.get('/interviews/kits', status ? { params: { status } } : undefined),
  getKit: (id: string) => apiClient.get(`/interviews/kits/${id}`),
  createKit: (data: InterviewKitInput) => apiClient.post('/interviews/kits', data),
  updateKit: (id: string, data: Partial<InterviewKitInput>) => apiClient.patch(`/interviews/kits/${id}`, data),
  deleteKit: (id: string) => apiClient.delete(`/interviews/kits/${id}`),
  uploadPromptAudio: (blob: Blob) => {
    const fd = new FormData();
    fd.append('audio', blob, 'prompt.webm');
    return apiClient.post('/interviews/kits/prompt-audio', fd);
  },

  // Candidate runner
  getCandidateInterview: (taskId: string) => apiClient.get(`/interviews/assignments/${taskId}`),
  /** `capabilities`: what this browser can do ('screen', 'video'); the server
   *  turns away a client that can't run a proctored or video interview. */
  startInterview: (taskId: string, capabilities: string[] = []) =>
    apiClient.post(`/interviews/assignments/${taskId}/start`, { capabilities }),
  startQuestion: (sessionId: string, questionId: string) =>
    apiClient.post(`/interviews/sessions/${sessionId}/question/start`, { questionId }),
  saveAnswer: (sessionId: string, payload: SaveAnswerPayload) =>
    apiClient.patch(`/interviews/sessions/${sessionId}/answer`, payload),
  uploadAnswerAudio: (sessionId: string, questionId: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('questionId', questionId);
    fd.append('audio', blob, `answer-${questionId}.webm`);
    return apiClient.post(`/interviews/sessions/${sessionId}/audio`, fd);
  },
  logProctor: (sessionId: string, events: ProctorEvent[]) =>
    apiClient.post(`/interviews/sessions/${sessionId}/proctor`, { events }),
  uploadSnapshot: (sessionId: string, blob: Blob, questionId?: string | null, source: 'camera' | 'screen' = 'camera') => {
    const fd = new FormData();
    fd.append('image', blob, `${source}-${Date.now()}.jpg`);
    fd.append('source', source);
    if (questionId) fd.append('questionId', questionId);
    return apiClient.post(`/interviews/sessions/${sessionId}/snapshot`, fd);
  },
  signVideoUpload: (sessionId: string, questionId: string) =>
    apiClient.post(`/interviews/sessions/${sessionId}/video/sign`, { questionId }),
  attachVideo: (sessionId: string, questionId: string, publicId: string) =>
    apiClient.post(`/interviews/sessions/${sessionId}/video`, { questionId, publicId }),
  /** The fallback: send the file through our server (25MB cap). */
  uploadAnswerVideoFile: (sessionId: string, questionId: string, blob: Blob, onProgress?: (fraction: number) => void) => {
    const fd = videoFormData(questionId, blob);
    return apiClient.post(`/interviews/sessions/${sessionId}/video`, fd, {
      timeout: 180000,
      onUploadProgress: (e: { loaded: number; total?: number }) => { if (e.total) onProgress?.(e.loaded / e.total); },
    });
  },
  submitInterview: (sessionId: string) =>
    apiClient.post(`/interviews/sessions/${sessionId}/submit`, {}),

  // Mentor review
  getReview: (taskId: string) => apiClient.get(`/interviews/review/${taskId}`),
  gradeAnswer: (taskId: string, questionId: string, data: { pointsAwarded?: number; scoreNote?: string | null }) =>
    apiClient.patch(`/interviews/review/${taskId}/answer`, { questionId, ...data }),
  aiDraftAnswer: (taskId: string, questionId: string) =>
    apiClient.post(`/interviews/review/${taskId}/ai-draft`, { questionId }),
  aiDraftAll: (taskId: string, questionIds?: string[]) =>
    apiClient.post(`/interviews/review/${taskId}/ai-draft-all`, { questionIds }, { timeout: 90000 }),
  finalizeReview: (taskId: string, overallNote?: string) =>
    apiClient.post(`/interviews/review/${taskId}/finalize`, { overallNote }),
  requestRedo: (taskId: string, questionIds: string[], note?: string) =>
    apiClient.post(`/interviews/review/${taskId}/request-redo`, { questionIds, note }),
  deleteSnapshots: (taskId: string) => apiClient.delete(`/interviews/review/${taskId}/snapshots`),
  flagInterview: (taskId: string, flagged: boolean, reason?: string) =>
    apiClient.post(`/interviews/review/${taskId}/flag`, { flagged, reason }),
};

/** Where interview video answers go (see video-upload). */
export const interviewVideoEndpoints: VideoUploadEndpoints = {
  sign: interviewApi.signVideoUpload,
  attach: interviewApi.attachVideo,
  uploadFile: interviewApi.uploadAnswerVideoFile,
};

/** Interview proctoring: where events and snapshots go (see useProctor). */
export const interviewProctorApi: ProctorApi = {
  logProctor: interviewApi.logProctor,
  uploadSnapshot: interviewApi.uploadSnapshot,
};

// ── Review types ────────────────────────────────────────────────────────────
export interface ReviewAnswer {
  transcript: string | null;
  audioUrl: string | null;
  videoUrl?: string | null;
  code: string | null;
  answerText: string | null;
  timeSpentSeconds: number;
  pointsAwarded: number | null;
  scoreNote: string | null;
  aiDraft: { score: number; suggestedPoints: number; note: string; transcript?: string | null; at: string } | null;
}
export interface ReviewItem {
  questionId: string;
  position: number;
  kind: InterviewQuestionKind;
  prompt: string;
  points: number;
  codeLanguage: string | null;
  referenceAnswer: string | null;
  answer: ReviewAnswer | null;
  snapshots?: ProctorSnapshot[];
}
export interface ProctorSnapshot { url: string; at: string; questionId?: string | null; source?: 'camera' | 'screen' }
export interface InterviewReview {
  task: { id: string; status: string; pointsAwarded: number | null; menteeId: string };
  kit: { id: string; title: string; description: string | null };
  options: { aiGradingEnabled: boolean; allowRetake: boolean; cameraRequired: boolean; screenShareRequired?: boolean };
  session: {
    id: string; status: string; attemptNumber: number; startedAt: string | null; submittedAt: string | null;
    mentee: { id: string; name: string; avatarUrl: string | null } | null;
  } | null;
  proctor: {
    snapshots: ProctorSnapshot[];
    flags: { type: string; at: string; meta: Record<string, unknown> }[];
    flagCounts: Record<string, number>;
  };
  flag: { flagged: boolean; reason: string | null; by: string; at: string } | null;
  items: ReviewItem[];
  totals: { totalPossible: number; totalAwarded: number; gradedCount: number; questionCount: number };
  canReview: boolean;
}

export default interviewApi;
