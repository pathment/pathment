export interface ConversationParticipantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  role: 'admin' | 'mentor' | 'mentee';
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  threadId: string;
  parentMessageId?: string;
  subject?: string;
  messageText: string;
  isRead: boolean;
  readAt?: string;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: ConversationParticipantUser;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  id: string;
  userId: string;
  emoji: string;
}

export interface ConversationSummary {
  id: string;
  type: 'direct' | 'system';
  relatedTaskId?: string;
  relatedEnrollmentId?: string;
  lastMessageAt?: string;
  unreadCount: number;
  participants: ConversationParticipantUser[];
  /** Clans the other participant(s) belong to — lets the mentor view scope by clan. */
  clanIds?: string[];
  isArchived?: boolean;
  lastMessage?: ChatMessage;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'task' | 'feedback' | 'badge' | 'milestone' | 'message' | 'system' | 'challenge';
  // Which role's "hat" this notification concerns; 'any' = shown in every role.
  audience?: 'mentor' | 'mentee' | 'admin' | 'any';
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  actionUrl?: string;
  actionLabel?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  readAt?: string;
  createdAt: string;
}

export interface SearchableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'mentor' | 'mentee';
  profilePictureUrl?: string;
}
