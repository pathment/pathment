'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { messagingApi } from '@/lib/services/messaging-api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/services/socket-client';
import { getToken } from '@/lib/services/token-store';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { ChatMessage, ConversationSummary, MessageReaction, SearchableUser } from '@/lib/types/messaging';

import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';

interface MessageCenterProps {
  role: 'admin' | 'mentor' | 'mentee';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return extractApiErrorMessage(error, fallback);
}

export default function MessageCenter({ role }: MessageCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { activeClanId } = useClan();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composer, setComposer] = useState('');

  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Cache messages by conversation ID for 0ms conversation switching
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const pendingConversationPromisesRef = useRef<Record<string, Promise<any>>>({});

  // Mobile layout state: 'list' or 'chat'
  const [activeMobilePane, setActiveMobilePane] = useState<'list' | 'chat'>('list');

  const participantId = searchParams.get('participantId');
  const queryConversationId = searchParams.get('conversationId');

  // Scope conversation list to active clan for mentors
  const visibleConversations = useMemo(() => {
    if (role !== 'mentor' || activeClanId === ALL_CLANS) return conversations;
    return conversations.filter((c) => (c.clanIds || []).includes(activeClanId));
  }, [conversations, role, activeClanId]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((c) => c.id === selectedConversationId) ||
      archivedConversations.find((c) => c.id === selectedConversationId) ||
      null,
    [conversations, archivedConversations, selectedConversationId]
  );

  const selectedTitle = useMemo(() => {
    if (!selectedConversation) {
      return 'Select a conversation';
    }

    const participant = selectedConversation.participants[0];
    if (!participant) {
      return 'System Conversation';
    }

    const fullName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
    return fullName || participant.email || 'Conversation';
  }, [selectedConversation]);

  const mergeIncomingMessage = (incoming: ChatMessage) => {
    setMessages((prev) => {
      // Replace optimistic temp message if matching text or temp id
      const existingTempIdx = prev.findIndex((m) => m.id.startsWith('temp-') && m.messageText === incoming.messageText);
      if (existingTempIdx !== -1) {
        const next = [...prev];
        next[existingTempIdx] = incoming;
        return next;
      }

      if (prev.some((message) => message.id === incoming.id)) {
        return prev;
      }
      return [...prev, incoming];
    });
  };

  const loadConversations = async () => {
    try {
      const [activeList, archivedList] = await Promise.all([
        messagingApi.listConversations(50, false),
        messagingApi.listConversations(50, true),
      ]);
      setConversations(activeList);
      setArchivedConversations(archivedList);
      return activeList;
    } catch {
      return [];
    }
  };

  const handleTabChange = (tab: 'all' | 'unread' | 'archived') => {
    setActiveTab(tab);
  };

  const loadMessages = async (conversationId: string, showLoadingState = true) => {
    if (conversationId.startsWith('temp-')) {
      setMessages([]);
      setIsMessagesLoading(false);
      setHasMore(false);
      return;
    }

    if (showLoadingState && !messageCacheRef.current[conversationId]) {
      setIsMessagesLoading(true);
    }
    try {
      const list = await messagingApi.listMessages(conversationId, 15);
      messageCacheRef.current[conversationId] = list;
      setMessages(list);
      setHasMore(list.length === 15);

      await messagingApi.markConversationRead(conversationId);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
        )
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not load messages'));
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || !selectedConversationId || selectedConversationId.startsWith('temp-')) return;
    setIsLoadingMore(true);

    const oldestMessage = messages[0];
    if (!oldestMessage) {
      setIsLoadingMore(false);
      return;
    }

    try {
      const list = await messagingApi.listMessages(selectedConversationId, 15, oldestMessage.createdAt);
      if (list.length < 15) {
        setHasMore(false);
      }
      const updatedList = [...list, ...messages];
      setMessages(updatedList);
      messageCacheRef.current[selectedConversationId] = updatedList;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to load older messages'));
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Bootstrap initial load
  useEffect(() => {
    const boot = async () => {
      setIsBootstrapping(true);
      try {
        let list = await loadConversations();

        if (participantId) {
          const conversation = await messagingApi.createDirectConversation(participantId);
          list = await loadConversations();
          setSelectedConversationId(conversation?.id || null);

          if (conversation?.id) {
            await loadMessages(conversation.id);
            setActiveMobilePane('chat');
            router.replace(`/${role}/messages?conversationId=${conversation.id}`);
          }
        } else {
          const initialConversationId = queryConversationId || null;
          setSelectedConversationId(initialConversationId);
          if (initialConversationId) {
            await loadMessages(initialConversationId);
            if (queryConversationId) {
              setActiveMobilePane('chat');
            }
          }
        }
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Could not open messages'));
      } finally {
        setIsBootstrapping(false);
      }
    };

    boot();
  }, [participantId, queryConversationId, role, router]);

  // Load messages on conversation switch with cache fallback (0ms latency switch)
  useEffect(() => {
    if (!selectedConversationId || isBootstrapping) {
      return;
    }

    // Instant switch to cached messages if available
    if (messageCacheRef.current[selectedConversationId]) {
      setMessages(messageCacheRef.current[selectedConversationId]);
      setIsMessagesLoading(false);
      loadMessages(selectedConversationId, false); // silent background revalidation
    } else {
      setMessages([]);
      loadMessages(selectedConversationId, true);
    }
  }, [isBootstrapping, selectedConversationId]);

  // Socket connection and global event listeners
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = connectSocket(token);

    const onMessage = (payload: { conversationId: string; message: ChatMessage }) => {
      const incomingConversationId = payload?.conversationId;
      const incomingMessage = payload?.message;
      if (!incomingConversationId || !incomingMessage) return;

      if (incomingConversationId === selectedConversationId) {
        mergeIncomingMessage(incomingMessage);

        if (incomingMessage.senderId !== user?.id) {
          messagingApi.markConversationRead(incomingConversationId).catch(() => {});
        }
      }

      setConversations((prev) => {
        const target = prev.find((conversation) => conversation.id === incomingConversationId);
        if (!target) return prev;

        return prev
          .map((conversation) => {
            if (conversation.id !== incomingConversationId) return conversation;
            const unreadIncrement = incomingMessage.senderId === user?.id ? 0 : 1;
            return {
              ...conversation,
              lastMessage: incomingMessage,
              lastMessageAt: incomingMessage.createdAt,
              unreadCount:
                incomingConversationId === selectedConversationId
                  ? 0
                  : (conversation.unreadCount || 0) + unreadIncrement,
            };
          })
          .sort((a, b) => {
            const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return right - left;
          });
      });
    };

    const onDelivered = (payload: { messageIds?: string[] }) => {
      const ids = new Set(payload?.messageIds || []);
      if (ids.size === 0) return;

      setMessages((prev) =>
        prev.map((message) =>
          ids.has(message.id) && !message.deliveredAt
            ? { ...message, deliveredAt: new Date().toISOString() }
            : message
        )
      );
    };

    const onConversationRead = (payload: { conversationId?: string; userId?: string }) => {
      if (!payload?.conversationId || payload.conversationId !== selectedConversationId) return;
      if (payload.userId === user?.id) return;

      setMessages((prev) =>
        prev.map((message) =>
          message.senderId === user?.id && !message.isRead
            ? { ...message, isRead: true, readAt: message.readAt || new Date().toISOString() }
            : message
        )
      );
    };

    const onReaction = (payload: { messageId?: string; reactions?: MessageReaction[] }) => {
      if (!payload?.messageId) return;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === payload.messageId ? { ...message, reactions: payload.reactions || [] } : message
        )
      );
    };

    socket.on('message:new', onMessage);
    socket.on('message:delivered', onDelivered);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:reaction', onReaction);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:delivered', onDelivered);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:reaction', onReaction);
      const currentSocket = getSocket();
      if (currentSocket?.connected) {
        disconnectSocket();
      }
    };
  }, [selectedConversationId, user?.id]);

  // Join/leave conversation socket rooms
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedConversationId) return;

    socket.emit('conversation:join', { conversationId: selectedConversationId });
    return () => {
      socket.emit('conversation:leave', { conversationId: selectedConversationId });
    };
  }, [selectedConversationId]);

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setActiveMobilePane('chat');
  };

  /**
   * OPTIMISTIC MESSAGE SENDING (0ms UI latency)
   */
  const handleSendMessage = async () => {
    if (!selectedConversationId || !composer.trim()) return;

    let targetConversationId = selectedConversationId;

    if (targetConversationId.startsWith('temp-') && Boolean(pendingConversationPromisesRef.current[targetConversationId])) {
      try {
        const realConv = await pendingConversationPromisesRef.current[targetConversationId];
        if (realConv?.id) {
          targetConversationId = realConv.id;
        }
      } catch {
        // Error handled in handleStartConversation
      }
    }

    if (targetConversationId.startsWith('temp-')) {
      toast.error('Starting conversation, please try sending again in a second...');
      return;
    }

    const messageText = composer.trim();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const optimisticMessage: ChatMessage = {
      id: tempId,
      threadId: targetConversationId,
      senderId: user?.id || '',
      recipientId: selectedConversation?.participants[0]?.id || '',
      messageText,
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: user ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role as 'admin' | 'mentor' | 'mentee',
        profilePictureUrl: user.profilePictureUrl || undefined,
      } : undefined,
      reactions: [],
    };

    // 1. Instantly append optimistic message & update lastMessage in state
    setMessages((prev) => [...prev, optimisticMessage]);
    setComposer('');
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConversationId
          ? { ...c, lastMessage: optimisticMessage, lastMessageAt: optimisticMessage.createdAt }
          : c
      )
    );

    setIsSending(true);
    try {
      // 2. Call API in background
      const sent = await messagingApi.sendMessage({
        conversationId: targetConversationId,
        messageText,
      });

      // 3. Reconcile temporary message with server response
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? sent : m))
      );

      // Update cache
      if (messageCacheRef.current[selectedConversationId]) {
        messageCacheRef.current[selectedConversationId] = messageCacheRef.current[selectedConversationId].map(
          (m) => (m.id === tempId ? sent : m)
        );
      }
    } catch (error: unknown) {
      // Revert optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(getErrorMessage(error, 'Failed to send message'));
    } finally {
      setIsSending(false);
    }
  };

  /**
   * OPTIMISTIC EMOJI REACTION (0ms UI latency)
   */
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!user?.id) return;

    let originalReactions: MessageReaction[] = [];

    // 1. Instantly toggle reaction locally in state
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        originalReactions = message.reactions || [];

        const existingUserReaction = originalReactions.find((r) => r.userId === user.id);
        let updatedReactions: MessageReaction[];

        if (existingUserReaction?.emoji === emoji) {
          // Remove reaction if clicking same emoji
          updatedReactions = originalReactions.filter((r) => r.userId !== user.id);
        } else if (existingUserReaction) {
          // Replace emoji if clicking different emoji
          updatedReactions = originalReactions.map((r) =>
            r.userId === user.id ? { ...r, emoji } : r
          );
        } else {
          // Add new reaction
          updatedReactions = [
            ...originalReactions,
            { id: `temp-react-${Date.now()}`, userId: user.id, emoji },
          ];
        }

        return { ...message, reactions: updatedReactions };
      })
    );

    // 2. Call API in background to persist
    try {
      const { reactions } = await messagingApi.toggleReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((message) => (message.id === messageId ? { ...message, reactions } : message))
      );
    } catch (error: unknown) {
      // Revert to original state on network error
      setMessages((prev) =>
        prev.map((message) => (message.id === messageId ? { ...message, reactions: originalReactions } : message))
      );
      toast.error(getErrorMessage(error, 'Could not add reaction'));
    }
  };

  /**
   * OPTIMISTIC NEW CHAT SELECTION (0ms UI latency)
   */
  const handleStartConversation = async (selectedUser: SearchableUser) => {
    // 1. Check if conversation with target user already exists
    const existing = conversations.find((c) =>
      c.participants.some((p) => p.id === selectedUser.id)
    );

    if (existing) {
      setSelectedConversationId(existing.id);
      setActiveMobilePane('chat');
      return;
    }

    // 2. Optimistically add new conversation to state instantly (0ms)
    const tempId = `temp-conv-${Date.now()}`;
    const optimisticConv: ConversationSummary = {
      id: tempId,
      type: 'direct',
      unreadCount: 0,
      participants: [
        {
          id: selectedUser.id,
          firstName: selectedUser.firstName,
          lastName: selectedUser.lastName,
          email: selectedUser.email,
          role: selectedUser.role,
          profilePictureUrl: selectedUser.profilePictureUrl,
        },
      ],
    };

    setConversations((prev) => [optimisticConv, ...prev]);
    setSelectedConversationId(tempId);
    setActiveMobilePane('chat');

    // 3. Call API in background to persist
    const createPromise = messagingApi.createDirectConversation(selectedUser.id);
    pendingConversationPromisesRef.current[tempId] = createPromise;

    try {
      const realConv = await createPromise;
      if (realConv?.id) {
        setConversations((prev) =>
          prev.map((c) => (c.id === tempId ? { ...realConv, participants: optimisticConv.participants } : c))
        );
        setSelectedConversationId((current) => (current === tempId ? realConv.id : current));
      }
    } catch (error: unknown) {
      setConversations((prev) => prev.filter((c) => c.id !== tempId));
      setSelectedConversationId((current) => (current === tempId ? null : current));
      toast.error(getErrorMessage(error, 'Could not start conversation'));
    } finally {
      delete pendingConversationPromisesRef.current[tempId];
    }
  };

  const handleArchiveConversation = async (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (target) {
      setArchivedConversations((prev) => [{ ...target, isArchived: true }, ...prev]);
    }
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
      setActiveMobilePane('list');
    }
    toast.success('Conversation archived');
    try {
      await messagingApi.archiveConversation(conversationId);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to archive conversation'));
      loadConversations();
    }
  };

  const handleUnarchiveConversation = async (conversationId: string) => {
    const target = archivedConversations.find((c) => c.id === conversationId);
    setArchivedConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (target) {
      setConversations((prev) => [{ ...target, isArchived: false }, ...prev]);
    }
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
      setActiveMobilePane('list');
    }
    toast.success('Conversation unarchived');
    try {
      await messagingApi.unarchiveConversation(conversationId);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to unarchive conversation'));
      loadConversations();
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setArchivedConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
      setActiveMobilePane('list');
    }
    toast.success('Conversation deleted');
    try {
      await messagingApi.deleteConversation(conversationId);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to delete conversation'));
      loadConversations();
    }
  };

  if (isBootstrapping) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6.5rem)] max-h-[calc(100vh-6.5rem)] overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-6 h-full">
        {/* Sidebar Panel */}
        <div
          className={`xl:col-span-4 h-full min-h-0 ${
            activeMobilePane === 'list' ? 'block' : 'hidden xl:block'
          }`}
        >
          <ConversationList
            conversations={activeTab === 'archived' ? archivedConversations : visibleConversations}
            allCount={visibleConversations.length}
            archivedCount={archivedConversations.length}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            role={role}
            onStartConversation={handleStartConversation}
            onRefresh={loadConversations}
            onArchiveConversation={handleArchiveConversation}
            onUnarchiveConversation={handleUnarchiveConversation}
            onDeleteConversation={handleDeleteConversation}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isBootstrapping={isBootstrapping}
          />
        </div>

        {/* Chat Thread Pane */}
        <div
          className={`xl:col-span-8 h-full min-h-0 ${
            activeMobilePane === 'chat' ? 'block' : 'hidden xl:block'
          }`}
        >
          <ChatWindow
            selectedConversation={selectedConversation}
            selectedTitle={selectedTitle}
            messages={messages}
            currentUserId={user?.id}
            isLoading={isMessagesLoading}
            composerValue={composer}
            onComposerChange={setComposer}
            onSendMessage={handleSendMessage}
            isSending={isSending}
            onReact={handleReactToMessage}
            onBackToList={() => setActiveMobilePane('list')}
            onArchiveConversation={handleArchiveConversation}
            onDeleteConversation={handleDeleteConversation}
            onLoadMore={loadMoreMessages}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </div>
      </div>
    </div>
  );
}
