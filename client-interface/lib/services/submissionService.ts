import axiosInstance from './axios-instance';

export const submissionService = {
  /**
   * Submit task with files
   */
  async submitTask(taskId: string, data: {
    submissionText: string;
    submissionUrls?: string[];
    extensionRequested?: boolean;
    extensionReason?: string;
    extensionDays?: number;
    files?: File[];
    timeSpentHours?: number;
  }) {
    const formData = new FormData();
    formData.append('submissionText', data.submissionText);
    
    if (data.submissionUrls) {
      data.submissionUrls.forEach(url => {
        formData.append('submissionUrls[]', url);
      });
    }

    if (data.timeSpentHours !== undefined && data.timeSpentHours > 0) {
      formData.append('timeSpentHours', data.timeSpentHours.toString());
    }

    if (data.extensionRequested) {
      formData.append('extensionRequested', 'true');
      if (data.extensionReason) {
        formData.append('extensionReason', data.extensionReason);
      }
      if (data.extensionDays) {
        formData.append('extensionDays', data.extensionDays.toString());
      }
    }

    if (data.files) {
      data.files.forEach(file => {
        formData.append('files', file);
      });
    }

    // Don't pin Content-Type — the browser must add the multipart boundary
    // itself. Setting 'multipart/form-data' here strips the boundary and the
    // server parses zero files.
    const response = await axiosInstance.post(`/submissions/${taskId}`, formData);

    return response.data;
  },

  /**
   * Request extension for a task
   */
  async requestExtension(taskId: string, data: {
    reason: string;
    days: number;
  }) {
    const response = await axiosInstance.post(`/submissions/${taskId}/extension`, data);
    return response.data;
  },

  /**
   * Get all submissions for a task
   */
  async getTaskSubmissions(taskId: string) {
    const response = await axiosInstance.get(`/submissions/task/${taskId}`);
    return response.data;
  },

  /**
   * Get single submission by ID
   */
  async getSubmission(submissionId: string) {
    const response = await axiosInstance.get(`/submissions/${submissionId}`);
    return response.data;
  },

  /**
   * Review a submission
   */
  async reviewSubmission(submissionId: string, data: {
    rating: number;
    feedbackText: string;
    inlineFeedback?: Array<{ line: number; comment: string; type: 'suggestion' | 'issue' | 'praise' }>;
    isApproved: boolean;
    revisionNotes?: string;
    criteriaMet?: Record<string, boolean>;
    pointsAwarded?: number;
    /** 4-decision model: approved | approved_notes | changes | rejected */
    decision?: 'approved' | 'approved_notes' | 'changes' | 'rejected';
    /** Labels of the acceptance criteria the mentor ticked. */
    checkedCriteria?: string[];
  }) {
    const response = await axiosInstance.post(`/submissions/${submissionId}/review`, data);
    return response.data;
  },

  /**
   * Handle extension request (approve/reject)
   */
  async handleExtension(submissionId: string, approved: boolean, newDueDate?: string) {
    const response = await axiosInstance.post(`/submissions/${submissionId}/extension/handle`, {
      approved,
      newDueDate,
    });
    return response.data;
  },

  /**
   * Delete file from submission
   */
  async deleteFile(fileId: string) {
    const response = await axiosInstance.delete(`/submissions/files/${fileId}`);
    return response.data;
  },

  /**
   * Get pending submissions for mentor
   */
  async getPendingSubmissions(mentorId: string) {
    const response = await axiosInstance.get(`/submissions/mentor/${mentorId}/pending`);
    return response.data;
  },
};
