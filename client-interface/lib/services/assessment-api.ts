import { apiClient } from './api-client';

export type AssessmentQuestionType = 'mcq' | 'multi_select' | 'short_text' | 'long_text' | 'file_upload' | 'external_link';

export interface AssessmentQuestionInput {
  id?: string;
  type: AssessmentQuestionType;
  prompt: string;
  required?: boolean;
  points?: number;
  options?: { id?: string; label: string }[];
  correctOptionIds?: string[];
  config?: Record<string, unknown>;
}

export interface Assessment {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  programId?: string | null;
  passingScore?: number | null;
  timeLimitMins?: number | null;
  status: 'draft' | 'published' | 'archived';
  questionCount?: number;
  totalPoints?: number;
  questions?: (AssessmentQuestionInput & { id: string })[];
}

/** Assessment authoring — admin only. */
export const assessmentApi = {
  list: (params?: { programId?: string; status?: string }) =>
    apiClient.get<any>('/assessments', { params }).then((r) => (r.data?.assessments || []) as Assessment[]),
  get: (id: string) => apiClient.get<any>(`/assessments/${id}`).then((r) => r.data?.assessment as Assessment),
  create: (data: Partial<Assessment>) => apiClient.post<any>('/assessments', data).then((r) => r.data?.assessment as Assessment),
  update: (id: string, data: Partial<Assessment>) => apiClient.patch<any>(`/assessments/${id}`, data).then((r) => r.data?.assessment as Assessment),
  setQuestions: (id: string, questions: AssessmentQuestionInput[]) =>
    apiClient.put<any>(`/assessments/${id}/questions`, { questions }).then((r) => r.data?.assessment as Assessment),
  remove: (id: string) => apiClient.delete<any>(`/assessments/${id}`),
};
