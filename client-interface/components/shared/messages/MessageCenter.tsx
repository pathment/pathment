'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

import { messagingApi } from '@/lib/services/messaging-api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/services/socket-client';
import { useAuth } from '@/lib/context/AuthContext';
import type { ChatMessage, ConversationSummary } from '@/lib/types/messaging';

interface MessageCenterProps {
  role: 'admin' | 'mentor' | 'mentee';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  return fallback;
}

export default function MessageCenter({ role }: MessageCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [composer, setComposer] = useState('');
  const [startParticipantId, setStartParticipantId] = useState('');
  const messageListEndRef = useRef<HTMLDivElement | null>(null);

  const participantId = searchParams.get('participantId');
  const queryConversationId = searchParams.get('conversationId');

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
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
      if (prev.some((message) => message.id === incoming.id)) {
        return prev;
      }
      return [...prev, incoming];
    });
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      messageListEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  const loadConversations = async () => {
    const list = await messagingApi.listConversations(50);
    setConversations(list);
    return list;
  };

  const loadMessages = async (conversationId: string) => {
    setIsMessagesLoading(true);
    try {
      const list = await messagingApi.listMessages(conversationId, 100);
      setMessages(list);
      await messagingApi.markConversationRead(conversationId);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
        )
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to load messages'));
    } finally {
      setIsMessagesLoading(false);
    }
  };

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
            router.replace(`/${role}/messages?conversationId=${conversation.id}`);
          }
        } else {
          const initialConversationId = queryConversationId || list[0]?.id || null;
          setSelectedConversationId(initialConversationId);
          if (initialConversationId) {
            await loadMessages(initialConversationId);
          }
        }

      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Failed to initialize messaging'));
      } finally {
        setIsBootstrapping(false);
      }
    };

    boot();
  }, [participantId, queryConversationId, role, router]);

  useEffect(() => {
    if (!selectedConversationId || isBootstrapping) {
      return;
    }

    loadMessages(selectedConversationId);
  }, [isBootstrapping, selectedConversationId]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      return;
    }

    const socket = connectSocket(token);

    const onMessage = (payload: { conversationId: string; message: ChatMessage }) => {
      const incomingConversationId = payload?.conversationId;
      const incomingMessage = payload?.message;
      if (!incomingConversationId || !incomingMessage) {
        return;
      }

      if (incomingConversationId === selectedConversationId) {
        mergeIncomingMessage(incomingMessage);

        // If user is currently viewing this conversation, keep it read in real-time.
        if (incomingMessage.senderId !== user?.id) {
          messagingApi.markConversationRead(incomingConversationId).catch(() => {
            // Non-blocking: badge will re-sync on next fetch/socket refresh even if this fails.
          });
        }

        scrollToBottom('smooth');
      }

      setConversations((prev) => {
        const target = prev.find((conversation) => conversation.id === incomingConversationId);
        if (!target) {
          return prev;
        }

        return prev
          .map((conversation) => {
            if (conversation.id !== incomingConversationId) {
              return conversation;
            }
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

    socket.on('message:new', onMessage);

    return () => {
      socket.off('message:new', onMessage);
      const currentSocket = getSocket();
      if (currentSocket?.connected) {
        disconnectSocket();
      }
    };
  }, [selectedConversationId, user?.id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedConversationId) {
      return;
    }

    socket.emit('conversation:join', { conversationId: selectedConversationId });
    return () => {
      socket.emit('conversation:leave', { conversationId: selectedConversationId });
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    scrollToBottom(isMessagesLoading ? 'auto' : 'smooth');
  }, [messages, selectedConversationId, isMessagesLoading]);

  const handleSendMessage = async () => {
    if (!selectedConversationId || !composer.trim() || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const sent = await messagingApi.sendMessage({
        conversationId: selectedConversationId,
        messageText: composer.trim(),
      });

      mergeIncomingMessage(sent);
      setComposer('');
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversationId
            ? { ...conversation, lastMessage: sent, lastMessageAt: sent.createdAt }
            : conversation
        )
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to send message'));
    } finally {
      setIsSending(false);
    }
  };

  const handleStartConversation = async () => {
    const participant = startParticipantId.trim();
    if (!participant) {
      return;
    }

    try {
      const conversation = await messagingApi.createDirectConversation(participant);
      const list = await loadConversations();
      const nextConversationId = conversation?.id || list[0]?.id || null;

      setStartParticipantId('');
      setSelectedConversationId(nextConversationId);
      if (nextConversationId) {
        await loadMessages(nextConversationId);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not start conversation'));
    }
  };

  if (isBootstrapping) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 mb-1">Messages</h1>
          <p className="text-slate-600 text-sm capitalize">
            Realtime chat for {role}, mentors, and mentees
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={startParticipantId}
            onChange={(event) => setStartParticipantId(event.target.value)}
            placeholder="Recipient User ID"
            className="h-10 w-44 border border-slate-200 rounded-lg px-3 text-sm"
          />
          <button
            onClick={handleStartConversation}
            className="h-10 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
          >
            Start Chat
          </button>
          <button
            onClick={async () => {
              await loadConversations();
              if (selectedConversationId) {
                await loadMessages(selectedConversationId);
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-[70vh] xl:h-[calc(100dvh-10rem)]">
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col xl:h-full min-h-0">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-slate-900">Conversations</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {conversations.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No conversations yet. Use a &quot;Message&quot; button from any user card to start one.
              </div>
            ) : (
              conversations.map((conversation) => {
                const participant = conversation.participants[0];
                const fullName = `${participant?.firstName || ''} ${participant?.lastName || ''}`.trim();
                const title = fullName || participant?.email || 'Conversation';

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      selectedConversationId === conversation.id
                        ? 'bg-indigo-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-slate-900 truncate">{title}</p>
                      {conversation.unreadCount > 0 && (
                        <span className="min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-1">
                      {conversation.lastMessage?.messageText || 'No messages yet'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden xl:h-full min-h-0">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <h2 className="text-slate-900 truncate">{selectedTitle}</h2>
          </div>

          <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3 bg-slate-50">
            {isMessagesLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Send your first message.
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const mine = message.senderId === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        mine
                          ? 'ml-auto bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <p className="text-xs opacity-75 mb-1">
                        {mine
                          ? 'You'
                          : `${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() || 'User'}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{message.messageText}</p>
                      <p className="text-[11px] opacity-70 mt-2">
                        {new Date(message.createdAt).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
                <div ref={messageListEndRef} />
              </>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={2}
                placeholder="Type a message..."
                disabled={!selectedConversationId || isSending}
                className="flex-1 resize-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!selectedConversationId || !composer.trim() || isSending}
                className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
