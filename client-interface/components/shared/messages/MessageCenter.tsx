'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Check, Wand2, Loader2, ChevronRight, ChevronLeft, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { messagingApi } from '@/lib/services/messaging-api';
import { connectSocket, getSocket } from '@/lib/services/socket-client';
import { getToken } from '@/lib/services/token-store';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { scopeConversationsToClan } from '@/lib/utils/clan-scope';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { isReaderLooking, markThreadRead } from '@/lib/utils/chat-read';
import { workspacePath } from '@/lib/services/workspace-scope';
import type { ChatMessage, ConversationSummary, MessageReaction, SearchableUser } from '@/lib/types/messaging';

import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import { ReplyAssistantDrawer } from '@/components/mentor/ReplyAssistantDrawer';
import { useAutoReply } from '@/lib/hooks/mentor/useAutoReply';

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
  const { activeClanId, setActiveClanId, clans, menteeActiveClanId } = useClan();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composer, setComposer] = useState('');

  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditorText, setDraftEditorText] = useState('');
  const [isApprovingDraft, setIsApprovingDraft] = useState(false);
  const [isRejectingDraft, setIsRejectingDraft] = useState(false);
  const [isDraftsExpanded, setIsDraftsExpanded] = useState(false);
  const [isAssistantSetupOpen, setIsAssistantSetupOpen] = useState(false);
  /**
   * Whether reply assistance is actually set up, asked here so the panel can
   * say WHY there is nothing to show. "No pending drafts" is true whether the
   * feature is humming along with nothing to say or was never switched on, and
   * a mentor reading it had no way to tell which, nor anywhere to go.
   */
  const { status: assistantStatus } = useAutoReply();
  const [generatingConversationIds, setGeneratingConversationIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Cache messages by conversation ID for 0ms conversation switching
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const pendingConversationPromisesRef = useRef<Record<string, Promise<any>>>({});
  // Stable ref so socket handlers always see the latest selected conversation
  // without needing to be re-registered on every conversation switch.
  const selectedConversationIdRef = useRef<string | null>(null);
  // Open chats that got new messages while the tab was in the background.
  const unseenWhileAwayRef = useRef<Set<string>>(new Set());
  // message:new is sent to both the conversation room and the user room, so an
  // open chat gets each message twice. Track ids so we only handle it once.
  const handledMessageIdsRef = useRef<Set<string>>(new Set());

  // Mobile layout state: 'list' or 'chat'
  const [activeMobilePane, setActiveMobilePane] = useState<'list' | 'chat'>('list');

  const participantId = searchParams.get('participantId');
  const queryConversationId = searchParams.get('conversationId');

  // Scope the list to the clan picked in the sidebar (mentor + mentee dual-clan).
  // Shared with the sidebar unread badge — see lib/utils/clan-scope.ts.
  const portalClanId = role === 'mentee' ? menteeActiveClanId : activeClanId;
  const { visible: visibleConversations, hiddenByClan } = useMemo(
    () => scopeConversationsToClan(conversations, role, portalClanId),
    [conversations, role, portalClanId]
  );

  const selectedConversation = useMemo(
    () =>
      visibleConversations.find((c) => c.id === selectedConversationId) ||
      archivedConversations.find((c) => c.id === selectedConversationId) ||
      null,
    [visibleConversations, archivedConversations, selectedConversationId]
  );

  // Drop selection when the open thread is outside the selected clan.
  useEffect(() => {
    if (!selectedConversationId) return;
    const stillVisible = visibleConversations.some((c) => c.id === selectedConversationId)
      || archivedConversations.some((c) => c.id === selectedConversationId);
    if (!stillVisible) setSelectedConversationId(null);
  }, [selectedConversationId, visibleConversations, archivedConversations]);

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
            router.replace(workspacePath(`/${role}/messages?conversationId=${conversation.id}`));
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
        await loadPendingDrafts();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Could not open messages'));
      } finally {
        setIsBootstrapping(false);
      }
    };

    boot();
  }, [participantId, queryConversationId, role, router]);

  const loadPendingDrafts = async () => {
    if (role !== 'mentor') return;
    try {
      const drafts = await messagingApi.listPendingDrafts();
      setPendingDrafts(drafts);
    } catch (error: unknown) {
      console.error('Failed to load pending drafts', error);
    }
  };
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

  // Socket: connect ONCE per login. Use a ref inside handlers so they always
  // read the latest selectedConversationId without being re-registered.
  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;

    const socket = connectSocket(token);

    const onMessage = (payload: { conversationId: string; message: ChatMessage }) => {
      const incomingConversationId = payload?.conversationId;
      const incomingMessage = payload?.message;
      if (!incomingConversationId || !incomingMessage) return;
      if (handledMessageIdsRef.current.has(incomingMessage.id)) return;
      handledMessageIdsRef.current.add(incomingMessage.id);

      const isOpen = incomingConversationId === selectedConversationIdRef.current;
      const fromOther = incomingMessage.senderId !== user?.id;
      // Only count it as read if the user can actually see the chat right now.
      const seen = isOpen && fromOther && isReaderLooking(document);

      if (isOpen) {
        mergeIncomingMessage(incomingMessage);
        if (seen) {
          // They're looking at the chat, so clear the unread divider as well.
          setMessages((prev) => markThreadRead(prev, user?.id, new Date().toISOString()));
          messagingApi.markConversationRead(incomingConversationId).catch(() => {});
        } else if (fromOther) {
          // Keep it unread for now. It gets marked read when they come back to the tab.
          unseenWhileAwayRef.current.add(incomingConversationId);
        }
      }

      setConversations((prev) => {
        const target = prev.find((c) => c.id === incomingConversationId);
        if (!target) return prev;
        return prev
          .map((c) => {
            if (c.id !== incomingConversationId) return c;
            const unreadIncrement = incomingMessage.senderId === user?.id ? 0 : 1;
            return {
              ...c,
              lastMessage: incomingMessage,
              lastMessageAt: incomingMessage.createdAt,
              unreadCount: seen ? 0 : (c.unreadCount || 0) + unreadIncrement,
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
        prev.map((m) =>
          ids.has(m.id) && !m.deliveredAt ? { ...m, deliveredAt: new Date().toISOString() } : m
        )
      );
    };

    const onConversationRead = (payload: { conversationId?: string; userId?: string }) => {
      if (!payload?.conversationId || payload.conversationId !== selectedConversationIdRef.current) return;
      if (payload.userId === user?.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user?.id && !m.isRead
            ? { ...m, isRead: true, readAt: m.readAt || new Date().toISOString() }
            : m
        )
      );
    };

    const onReaction = (payload: { messageId?: string; reactions?: MessageReaction[] }) => {
      if (!payload?.messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m))
      );
    };

    const onAiDraftNew = (payload: { draft: any }) => {
      // Draft arrived — clear the generating loader for this conversation
      setGeneratingConversationIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.draft?.originalMessage?.threadId);
        return next;
      });
      setPendingDrafts((prev) => {
        if (prev.some((d) => d.id === payload.draft.id)) return prev;
        return [...prev, payload.draft];
      });
      toast.success('New AI Draft received', { icon: <Bot className="w-4 h-4 text-brand-600" /> });
    };

    const onAiDraftGenerating = (payload: { conversationId: string }) => {
      if (!payload?.conversationId) return;
      setGeneratingConversationIds((prev) => new Set([...prev, payload.conversationId]));
    };

    const onAiDraftApproved = (payload: { draftId: string }) => {
      if (!payload?.draftId) return;
      setPendingDrafts((prev) => prev.filter((d) => d.id !== payload.draftId));
    };

    const onAiDraftDone = (payload: { conversationId: string }) => {
      if (!payload?.conversationId) return;
      setGeneratingConversationIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.conversationId);
        return next;
      });
    };

    // On every (re)connect, rejoin the current conversation room.
    // This solves the race condition where the socket connects AFTER the
    // conversation:join useEffect has already fired with a null socket.
    const onConnect = () => {
      const convId = selectedConversationIdRef.current;
      if (convId) {
        socket.emit('conversation:join', { conversationId: convId });
      }
    };

    socket.on('connect', onConnect);
    socket.on('message:new', onMessage);
    socket.on('message:delivered', onDelivered);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:reaction', onReaction);
    socket.on('ai_draft:new', onAiDraftNew);
    socket.on('ai_draft:generating', onAiDraftGenerating);
    socket.on('ai_draft:approved', onAiDraftApproved);
    socket.on('ai_draft:done', onAiDraftDone);

    // If already connected (socket was created on a prior render), join immediately
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('message:new', onMessage);
      socket.off('message:delivered', onDelivered);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:reaction', onReaction);
      socket.off('ai_draft:new', onAiDraftNew);
      socket.off('ai_draft:generating', onAiDraftGenerating);
      socket.off('ai_draft:approved', onAiDraftApproved);
      socket.off('ai_draft:done', onAiDraftDone);
      // Do NOT disconnect here — the socket stays alive for the whole session.
      // It is only disconnected on unmount of the top-level layout.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // When the user comes back to the tab, mark what arrived while they were away
  // as read. The divider stays so they can see where the new messages start.
  useEffect(() => {
    const onReturn = () => {
      const conversationId = selectedConversationIdRef.current;
      if (!conversationId || !unseenWhileAwayRef.current.has(conversationId) || !isReaderLooking(document)) return;
      unseenWhileAwayRef.current.delete(conversationId);
      messagingApi.markConversationRead(conversationId).catch(() => {});
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, []);

  // Keep ref in sync — handlers read this ref to avoid stale closures
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Join/leave conversation socket rooms
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedConversationId) return;

    socket.emit('conversation:join', { conversationId: selectedConversationId });
    return () => {
      socket.emit('conversation:leave', { conversationId: selectedConversationId });
    };
  }, [selectedConversationId]);

  // When leaving a chat, mark its messages read locally and in the cache, so the
  // unread divider isn't still there the next time it's opened.
  const leaveConversation = (conversationId: string | null) => {
    if (!conversationId) return;
    unseenWhileAwayRef.current.delete(conversationId);
    if (conversationId !== selectedConversationIdRef.current) return;
    const shown = markThreadRead(messages, user?.id, new Date().toISOString());
    messageCacheRef.current[conversationId] = shown;
    setMessages(shown);
  };

  const handleSelectConversation = (id: string) => {
    if (id !== selectedConversationIdRef.current) leaveConversation(selectedConversationIdRef.current);
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

    // 1. Instantly append optimistic message & update lastMessage in state.
    // Replying means they've read the chat, so drop the unread divider too.
    setMessages((prev) => [...markThreadRead(prev, user?.id, new Date().toISOString()), optimisticMessage]);
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

  const handleApproveDraft = async (draftId: string) => {
    setIsApprovingDraft(true);
    try {
      await messagingApi.approveDraft(draftId, draftEditorText);
      setPendingDrafts(prev => prev.filter(d => d.id !== draftId));
      setEditingDraftId(null);
      setDraftEditorText('');
      toast.success('Draft approved and sent');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not approve draft'));
    } finally {
      setIsApprovingDraft(false);
    }
  };

  const handleRejectDraft = async (draftId: string) => {
    setIsRejectingDraft(true);
    try {
      await messagingApi.rejectDraft(draftId);
      setPendingDrafts(prev => prev.filter(d => d.id !== draftId));
      setEditingDraftId(null);
      setDraftEditorText('');
      toast.success('Draft rejected');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not reject draft'));
    } finally {
      setIsRejectingDraft(false);
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
    <div className={`mentor-inbox h-[calc(100dvh-6.5rem)] max-h-[calc(100dvh-6.5rem)] overflow-hidden`}>
      <div className={`grid grid-cols-1 xl:grid-cols-12 h-full gap-0`}>
        {/* Sidebar Panel */}
        <div
          className={`inbox-list-pane xl:col-span-4 h-full min-h-0 ${
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
            hiddenByClan={hiddenByClan}
            activeClanName={clans.find((c) => c.id === activeClanId)?.name ?? null}
            onShowAllClans={() => setActiveClanId(ALL_CLANS)}
          />
        </div>


        {/* Chat Thread Pane */}
        <div
          className={`inbox-thread-pane xl:col-span-8 h-full min-h-0 flex flex-col relative ${
            activeMobilePane === 'chat' ? 'block' : 'hidden xl:block'
          }`}
        >
          {/* AI Drafts Panel — always visible for mentors when a real conversation is selected */}
          {role === 'mentor' && selectedConversationId && !selectedConversationId.startsWith('temp-') && (() => {
            const conversationDrafts = pendingDrafts.filter(d => d.originalMessage?.threadId === selectedConversationId);
            const isGenerating = generatingConversationIds.has(selectedConversationId);
            const draftCount = conversationDrafts.length;

            return isDraftsExpanded ? (
              <div className="absolute bottom-20 right-6 z-20 w-[420px] max-w-[calc(100%-3rem)] bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-4 overflow-y-auto max-h-[50vh] transition-all animate-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-brand-500/15 text-brand-600 dark:text-brand-400 rounded-lg border border-brand-500/20">
                      <Wand2 className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">AI Drafts</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 font-semibold border border-brand-500/20">
                      {draftCount}
                    </span>
                  </div>
                  <button onClick={() => setIsDraftsExpanded(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors" aria-label="Collapse AI drafts">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {draftCount === 0 && !isGenerating && (
                    assistantStatus && (!assistantStatus.canEnable || !assistantStatus.enabled) ? (
                      <div className="rounded-xl border border-border bg-muted/40 p-3">
                        <p className="text-xs font-medium text-foreground">
                          {assistantStatus.canEnable
                            ? 'Reply assistance is ready, but switched off.'
                            : 'Reply assistance is not set up yet.'}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {assistantStatus.canEnable
                            ? 'Turn it on and drafts will appear here as mentees write to you.'
                            : 'It writes drafts in your own words, grounded in your own material. Three short steps, right here.'}
                        </p>
                        <button
                          onClick={() => setIsAssistantSetupOpen(true)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          {assistantStatus.canEnable ? 'Turn it on' : 'Set it up'}
                        </button>
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <p className="text-xs text-muted-foreground">No pending drafts for this conversation.</p>
                        <button
                          onClick={() => setIsAssistantSetupOpen(true)}
                          className="mt-1.5 text-[11px] font-medium text-brand-600 hover:underline"
                        >
                          Reply assistance settings
                        </button>
                      </div>
                    )
                  )}
                  {conversationDrafts.map(draft => {
                    const isEditing = editingDraftId === draft.id;
                    const confidenceColor = draft.confidenceScore >= 0.8 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/20' : 'text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/20';
                    return (
                      <div key={draft.id} className="bg-slate-100/60 dark:bg-black/30 border border-border rounded-xl p-3 shadow-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]">
                            Replying to: <span className="text-foreground italic">"{draft.originalMessage?.messageText}"</span>
                          </span>
                          <div className="flex gap-1.5 items-center shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${confidenceColor}`}>
                              {Math.round(draft.confidenceScore * 100)}% Confidence
                            </span>
                            {draft.groundingScore !== undefined && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                {Math.round(draft.groundingScore * 100)}% Grounded
                              </span>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="mt-2">
                            <textarea
                              value={draftEditorText}
                              onChange={(e) => setDraftEditorText(e.target.value)}
                              className="w-full text-sm resize-none bg-card border border-border text-foreground rounded-lg p-2 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none"
                              rows={3}
                            />
                            <div className="flex items-center gap-2 mt-2 justify-end">
                              <button
                                onClick={() => { setEditingDraftId(null); setDraftEditorText(''); }}
                                className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5 rounded-md font-medium transition-colors"
                                disabled={isApprovingDraft}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleApproveDraft(draft.id)}
                                disabled={!draftEditorText.trim() || isApprovingDraft}
                                className="text-xs px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors"
                              >
                                {isApprovingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Approve & Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{draft.draftContent}</p>
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => handleRejectDraft(draft.id)}
                                disabled={isRejectingDraft}
                                className="text-xs font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => { setEditingDraftId(draft.id); setDraftEditorText(draft.draftContent); }}
                                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                Review & Edit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Generating loader row — appears while RAG pipeline is running */}
                  {isGenerating && (
                    <div className="flex items-center gap-2.5 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600 shrink-0" />
                      <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">Generating new draft…</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsDraftsExpanded(true)}
                className="absolute bottom-20 right-6 z-20 flex items-center gap-2 bg-brand-600 text-white px-3 py-2 rounded-xl shadow-xl hover:bg-brand-700 active:scale-95 transition-all animate-in fade-in zoom-in-95"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs font-semibold">
                  {draftCount} Draft{draftCount !== 1 ? 's' : ''}
                </span>
                {isGenerating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Wand2 className="w-4 h-4" />
                }
              </button>
            );
          })()}
          {/*
            * An admin has no drafts panel of their own - auto reply is a
            * mentor's feature - but they are the only person who can add the
            * workspace-wide key that clears step one for every mentor. A quiet
            * pill rather than the mentor's brand button: it is a setup door,
            * not something they use in the course of a conversation.
            */}
          {role === 'admin' && selectedConversationId && (
            <button
              onClick={() => setIsAssistantSetupOpen(true)}
              className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-xl transition-colors hover:text-foreground"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Reply assistance
            </button>
          )}
          {(role === 'mentor' || role === 'admin') && (
            <ReplyAssistantDrawer
              open={isAssistantSetupOpen}
              onClose={() => setIsAssistantSetupOpen(false)}
              role={role === 'admin' ? 'admin' : 'mentor'}
            />
          )}
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
            onBackToList={() => {
              // Deselect the chat so new messages show as unread while on the list.
              leaveConversation(selectedConversationId);
              setSelectedConversationId(null);
              setActiveMobilePane('list');
            }}
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
