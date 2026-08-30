import { apiClient } from './api-client';
import type { ChatMessage, ConversationSummary, NotificationItem, SearchableUser } from '@/lib/types/messaging';

export interface SendMessagePayload {
  conversationId: string;
  messageText: string;
  subject?: string;
  parentMessageId?: string;
  relatedTaskId?: string;
  relatedEnrollmentId?: string;
}

export const messagingApi = {
  async listConversations(limit = 50, archived = false): Promise<ConversationSummary[]> {
    const response = await apiClient.get<any>(`/messaging/conversations?limit=${limit}&archived=${archived}`);
    return response.data?.conversations || [];
  },

  async createDirectConversation(participantId: string, relatedTaskId?: string, relatedEnrollmentId?: string): Promise<any> {
    const response = await apiClient.post<any>('/messaging/conversations/direct', {
      participantId,
      relatedTaskId,
      relatedEnrollmentId,
    });
    return response.data?.conversation;
  },

  async listMessages(conversationId: string, limit = 50, before?: string): Promise<ChatMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) {
      params.set('before', before);
    }

    const response = await apiClient.get<any>(`/messaging/conversations/${conversationId}/messages?${params.toString()}`);
    return response.data?.messages || [];
  },

  async sendMessage(payload: SendMessagePayload): Promise<ChatMessage> {
    const response = await apiClient.post<any>('/messaging/messages', payload);
    return response.data?.message;
  },

  async markConversationRead(conversationId: string): Promise<{ updatedCount: number }> {
    const response = await apiClient.post<any>(`/messaging/conversations/${conversationId}/read`, {});
    return {
      updatedCount: response.data?.updatedCount || 0,
    };
  },

  async archiveConversation(conversationId: string): Promise<any> {
    const response = await apiClient.post(`/messaging/conversations/${conversationId}/archive`, {});
    return response.data;
  },

  async unarchiveConversation(conversationId: string): Promise<any> {
    const response = await apiClient.post(`/messaging/conversations/${conversationId}/unarchive`, {});
    return response.data;
  },

  async deleteConversation(conversationId: string): Promise<any> {
    const response = await apiClient.delete(`/messaging/conversations/${conversationId}`);
    return response.data;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<{ messageId: string; reactions: { id: string; userId: string; emoji: string }[] }> {
    const response = await apiClient.post<any>(`/messaging/messages/${messageId}/reactions`, { emoji });
    return {
      messageId: response.data?.messageId || messageId,
      reactions: response.data?.reactions || [],
    };
  },

  async listNotifications(limit = 30): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
    const response = await apiClient.get<any>(`/messaging/notifications?limit=${limit}`);
    return {
      notifications: response.data?.notifications || [],
      unreadCount: response.data?.unreadCount || 0,
    };
  },

  async markNotificationRead(notificationId: string): Promise<any> {
    const response = await apiClient.post(`/messaging/notifications/${notificationId}/read`, {});
    return response.data;
  },

  async markAllNotificationsRead(): Promise<any> {
    const response = await apiClient.post('/messaging/notifications/read-all', {});
    return response.data;
  },

  async deleteNotification(notificationId: string): Promise<any> {
    const response = await apiClient.delete(`/messaging/notifications/${notificationId}`);
    return response.data;
  },

  async searchUsers(query: string, page: number = 1, role?: string): Promise<SearchableUser[]> {
    const params = new URLSearchParams({ q: query, page: String(page), limit: '25' });
    if (role) {
      params.set('role', role);
    }

    const response = await apiClient.get<any>(`/messaging/users/search?${params.toString()}`);
    return response.data?.users || [];
  },

  async listPendingDrafts(): Promise<any[]> {
    const response = await apiClient.get<any>('/messaging/drafts');
    return response.data?.drafts || [];
  },

  async approveDraft(draftId: string, finalText: string): Promise<ChatMessage> {
    const response = await apiClient.post<any>('/messaging/messages/approve', { draftId, finalText });
    return response.data?.message;
  },

  async rejectDraft(draftId: string): Promise<void> {
    await apiClient.post(`/messaging/drafts/${draftId}/reject`, {});
  },

  // Mentor RAG Documents
  async getMentorDocuments(): Promise<any[]> {
    const response = await apiClient.get<any>('/messaging/mentor/documents');
    return response.data?.documents || [];
  },

  async uploadMentorDocument(file: File, programId?: string, visibility = 'mentor'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (programId) formData.append('programId', programId);
    formData.append('visibility', visibility);

    const response = await apiClient.post<any>('/messaging/mentor/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.document;
  },

  async deleteMentorDocument(documentId: string): Promise<void> {
    await apiClient.delete(`/messaging/mentor/documents/${documentId}`);
  },
};
