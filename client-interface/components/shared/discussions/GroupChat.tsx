'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import ChatWindow from '@/components/shared/messages/ChatWindow';
import MessageComposer from '@/components/shared/messages/MessageComposer';
import { MediaButtons } from './MediaButtons';
import { DISCUSSION_ROLE_LABEL, useGroupMembers } from './GroupMembers';
import { messagingApi } from '@/lib/services/messaging-api';
import { acquireSocket } from '@/lib/services/socket-client';
import { useAuth } from '@/lib/context/AuthContext';
import { useInvalidate } from '@/lib/query';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { ChatMessage, ConversationSummary, MessageReaction } from '@/lib/types/messaging';

const PAGE_SIZE = 30;

/**
 * A group's chat, on any page that has the conversation id.
 *
 * It is the existing chat with a different header and composer, not a second
 * one: the same ChatWindow, the same send and read endpoints, the same socket
 * events. `canPost` is only the display; the server decides who may post.
 */
export function GroupChat({ conversationId, groupId, title, subtitle, canPost, closedNote, header, actions }: {
  conversationId: string;
  /** The discussion group, so each sender is labelled Discussion Lead or Participant. */
  groupId?: string;
  title: string;
  subtitle?: string;
  canPost: boolean;
  /** Shown instead of the composer while posting is closed. */
  closedNote?: string;
  /** Replaces the title bar. */
  header?: ReactNode;
  /** Buttons at the end of the default title bar. */
  actions?: ReactNode;
}) {
  const { user } = useAuth();
  const invalidate = useInvalidate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const merge = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await messagingApi.listMessages(conversationId, PAGE_SIZE);
        if (cancelled) return;
        setMessages(first);
        setHasMore(first.length === PAGE_SIZE);
        // Opening the chat starts the reader's Group Discussion task on the
        // server, so their task lists are refreshed to offer Submit.
        messagingApi.markConversationRead(conversationId)
          .then(() => invalidate(['me', 'tasks'], ['me', 'task']))
          .catch(() => {});
      } catch {
        if (!cancelled) toast.error('Could not load the discussion');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, invalidate]);

  useEffect(() => {
    const socket = acquireSocket();
    if (!socket) return undefined;
    const join = () => socket.emit('conversation:join', { conversationId });
    const onMessage = (payload: { conversationId: string; message: ChatMessage }) => {
      if (payload?.conversationId !== conversationRef.current || !payload.message) return;
      merge(payload.message);
      if (payload.message.senderId !== user?.id) {
        messagingApi.markConversationRead(conversationId).catch(() => {});
      }
    };
    const onReaction = (payload: { messageId?: string; reactions?: MessageReaction[] }) => {
      if (!payload?.messageId) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m)));
    };
    socket.on('connect', join);
    socket.on('message:new', onMessage);
    socket.on('message:reaction', onReaction);
    if (socket.connected) join();
    return () => {
      socket.emit('conversation:leave', { conversationId });
      socket.off('connect', join);
      socket.off('message:new', onMessage);
      socket.off('message:reaction', onReaction);
    };
  }, [conversationId, merge, user?.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      merge(await messagingApi.sendMessage({ conversationId, messageText: text }));
      setDraft('');
    } catch (error) {
      // The server's own reason (frozen chat, not a member), not axios's status line.
      toast.error(extractApiErrorMessage(error, 'Could not send that'));
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File) => {
    try {
      merge(await messagingApi.sendAttachment(conversationId, file, draft.trim() || undefined));
      setDraft('');
    } catch (error) {
      // e.g. "is over 10MB", "Send an image, video … or text file", an upload failure.
      toast.error(extractApiErrorMessage(error, 'Could not send that file'));
    }
  };

  const react = async (messageId: string, emoji: string) => {
    try {
      const result = await messagingApi.toggleReaction(messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: result.reactions } : m)));
    } catch {
      toast.error('Could not react to that');
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || !messages.length) return;
    setLoadingMore(true);
    try {
      const older = await messagingApi.listMessages(conversationId, PAGE_SIZE, messages[0].createdAt);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  // A person's part comes from their seat in this group, not their account:
  // someone who leads one clan can be a participant in another's discussion.
  const { data: members } = useGroupMembers(groupId);
  const senderTag = useMemo(() => {
    if (!groupId) return undefined;
    const roleOf = new Map((members ?? []).map((member) => [member.userId, member.role]));
    return (senderId: string) => {
      const role = roleOf.get(senderId);
      return role ? { label: DISCUSSION_ROLE_LABEL[role], lead: role === 'mentor' } : undefined;
    };
  }, [groupId, members]);

  const conversation = useMemo<ConversationSummary>(
    () => ({ id: conversationId, type: 'group', unreadCount: 0, participants: [] }),
    [conversationId],
  );

  return (
    <ChatWindow
      selectedConversation={conversation}
      selectedTitle={title}
      messages={messages}
      currentUserId={user?.id}
      isLoading={loading}
      composerValue={draft}
      onComposerChange={setDraft}
      onSendMessage={send}
      isSending={sending}
      onReact={react}
      onLoadMore={loadMore}
      hasMore={hasMore}
      isLoadingMore={loadingMore}
      senderTag={senderTag}
      header={header ?? (
        <div className="flex items-center gap-2 border-b border-border bg-card/90 p-3 sm:p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      composer={canPost ? (
        <MessageComposer
          value={draft}
          onChange={setDraft}
          onSend={send}
          disabled={loading}
          isSending={sending}
          leading={<MediaButtons onFile={sendFile} disabled={loading} />}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden />
          {closedNote || 'This discussion is closed.'}
        </div>
      )}
    />
  );
}
