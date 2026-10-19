import type { ChatMessage } from '@/lib/types/messaging';

// Helpers for the chat's read state and the "Unread Messages" divider.

// True when the tab is visible, so the open chat is on screen. A tab in the
// background or a minimised window doesn't count.
export function isReaderLooking(doc: Pick<Document, 'visibilityState'> | undefined): boolean {
  return !!doc && doc.visibilityState === 'visible';
}

// Index of the first unread message from the other person (where the divider goes), or -1.
export function firstUnreadIndex(messages: ChatMessage[], currentUserId: string | undefined): number {
  return messages.findIndex((m) => !m.isRead && m.senderId !== currentUserId);
}

// Mark the other person's messages as read. The user's own messages are left alone,
// because their isRead flag is the other person's read receipt.
export function markThreadRead(messages: ChatMessage[], currentUserId: string | undefined, readAt: string): ChatMessage[] {
  if (firstUnreadIndex(messages, currentUserId) === -1) return messages;
  return messages.map((m) => (
    m.isRead || m.senderId === currentUserId ? m : { ...m, isRead: true, readAt: m.readAt || readAt }
  ));
}
