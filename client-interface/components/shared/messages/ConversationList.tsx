'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { Archive, ArchiveRestore, Filter, MessageSquare, MoreVertical, RefreshCw, Search, Trash2, Check, CheckCheck } from 'lucide-react';

import type { ConversationSummary, SearchableUser } from '@/lib/types/messaging';
import UserSearchCombobox from './UserSearchCombobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ConversationTab = 'all' | 'unread' | 'archived' | 'discussions';

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  role: 'admin' | 'mentor' | 'mentee';
  onStartConversation: (selectedUser: SearchableUser) => void;
  onRefresh: () => void;
  onArchiveConversation?: (id: string) => void;
  onUnarchiveConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  /** Adds a Discussions tab, whose list is drawn by the caller. */
  discussions?: { count: number; render: (searchQuery: string) => ReactNode };
  allCount?: number;
  archivedCount?: number;
  isBootstrapping?: boolean;
  /**
   * How many conversations the sidebar's clan picker is holding back, and how
   * to clear it. An empty list that a filter caused has to say so — reading
   * "No conversations yet" while the sidebar shows an unread badge is how a
   * working inbox comes across as broken.
   */
  hiddenByClan?: number;
  activeClanName?: string | null;
  onShowAllClans?: () => void;
}

/** Format last message time */
function conversationTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const within7 = (today.getTime() - date.getTime()) / 86400000 < 7;
  if (within7) return date.toLocaleDateString([], { weekday: 'short' });

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  role,
  onStartConversation,
  onRefresh,
  onArchiveConversation,
  onUnarchiveConversation,
  onDeleteConversation,
  activeTab,
  onTabChange,
  discussions,
  allCount,
  archivedCount,
  hiddenByClan = 0,
  activeClanName,
  onShowAllClans,
  isBootstrapping = false,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCountTotal = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      // Tab filter
      if (activeTab === 'unread' && (!conversation.unreadCount || conversation.unreadCount === 0)) {
        return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;

      const participant = conversation.participants[0];
      const fullName = `${participant?.firstName || ''} ${participant?.lastName || ''}`.toLowerCase();
      const email = (participant?.email || '').toLowerCase();
      const query = searchQuery.toLowerCase();

      return fullName.includes(query) || email.includes(query);
    });
  }, [conversations, activeTab, searchQuery]);

  return (
    <div className="conversation-list flex flex-col h-full bg-card rounded-3xl border border-border overflow-hidden shadow-xs">
      {/* Sidebar Header */}
      <div className="p-4 sm:p-5 border-b border-border bg-muted/30 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">Messages</h1>
            <p className="text-xs text-muted-foreground capitalize">{role === 'mentor' ? 'Your clan conversations' : role === 'admin' ? 'People, support and coordination' : 'Your conversations'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <UserSearchCombobox onSelect={onStartConversation} />
            <button
              onClick={onRefresh}
              title="Refresh conversations"
              className="h-9 w-9 flex items-center justify-center border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
              aria-label="Refresh conversations"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search conversations" placeholder={activeTab === 'discussions' ? 'Search discussions…' : 'Search by name or email…'}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100/70 dark:bg-black/30 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap p-0.5 bg-slate-100/80 dark:bg-black/40 border border-transparent dark:border-border/60 rounded-xl">
          <button
            aria-pressed={activeTab === 'all'} onClick={() => onTabChange('all')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'all'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All {allCount !== undefined ? `(${allCount})` : ''}
          </button>
          <button
            aria-pressed={activeTab === 'unread'} onClick={() => onTabChange('unread')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'unread'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Unread
            {unreadCountTotal > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                {unreadCountTotal}
              </span>
            )}
          </button>
          <button
            aria-pressed={activeTab === 'archived'} onClick={() => onTabChange('archived')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'archived'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Archived {archivedCount !== undefined ? `(${archivedCount})` : ''}
          </button>
          {discussions && (
            <button
              aria-pressed={activeTab === 'discussions'} onClick={() => onTabChange('discussions')}
              className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                activeTab === 'discussions'
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Discussions ({discussions.count})
            </button>
          )}
        </div>
      </div>

      {/* Conversations list stream */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60">
        {activeTab === 'discussions' && discussions ? discussions.render(searchQuery) : isBootstrapping ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-200 dark:bg-white/10 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 dark:bg-white/5 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            {/* A list emptied by the clan picker is not an empty inbox. Name the
                filter, count what it is holding back, and offer the way out. */}
            {!searchQuery && activeTab !== 'unread' && hiddenByClan > 0 ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  No conversations in {activeClanName || 'this clan'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hiddenByClan} conversation{hiddenByClan === 1 ? ' is' : 's are'} in your other clans.
                </p>
                {onShowAllClans && (
                  <button
                    type="button"
                    onClick={onShowAllClans}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-700 dark:text-brand-400 hover:bg-brand-500/20 transition-colors"
                  >
                    Show all clans
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {searchQuery ? 'No matching chats' : activeTab === 'unread' ? 'No unread messages' : 'No conversations yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery ? 'Try searching another name' : 'Click "New Chat" to message someone'}
                </p>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const participant = conversation.participants[0];
            const fullName = `${participant?.firstName || ''} ${participant?.lastName || ''}`.trim();
            const title = fullName || participant?.email || 'System Conversation';
            const isSelected = selectedConversationId === conversation.id;
            const hasUnread = conversation.unreadCount > 0;

            return (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full text-left p-3.5 transition-colors duration-150 flex items-start gap-3 relative cursor-pointer group ${
                  isSelected
                    ? 'bg-brand-500/10'
                    : 'hover:bg-slate-100/60 dark:hover:bg-white/5'
                }`}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-600 rounded-r-full" />
                )}

                {/* Avatar */}
                {/* Shared Avatar — see ChatWindow: next/image throws in
                    render for an unconfigured host and takes the page with it. */}
                <Avatar
                  name={title}
                  src={participant?.profilePictureUrl}
                  initials={(participant?.firstName?.[0] || title[0] || 'C').toUpperCase()}
                  size="md"
                  className="shrink-0 border border-border mt-0.5"
                />

                {/* Participant + Message detail */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <button type="button" aria-label={`Open conversation with ${title}`} aria-current={isSelected ? 'true' : undefined} onClick={event => { event.stopPropagation(); onSelectConversation(conversation.id); }} className={`text-left text-sm truncate focus-visible:outline-2 focus-visible:outline-brand-500 ${hasUnread ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                      {title}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400">
                        {conversationTime(conversation.lastMessageAt)}
                      </span>

                      {/* 3-dots menu trigger */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all text-slate-500"
                            aria-label="Conversation actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          {activeTab === 'archived' ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnarchiveConversation?.(conversation.id);
                              }}
                              className="cursor-pointer text-slate-700 dark:text-slate-300"
                            >
                              <ArchiveRestore className="w-4 h-4 mr-2" />
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onArchiveConversation?.(conversation.id);
                              }}
                              className="cursor-pointer text-slate-700 dark:text-slate-300"
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation?.(conversation.id);
                            }}
                            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate flex items-center gap-1 ${hasUnread ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {conversation.lastMessage?.senderId && conversation.lastMessage.senderId !== participant?.id && (() => {
                        const isRead = Boolean(conversation.lastMessage.isRead || conversation.lastMessage.readAt);
                        const isDelivered = Boolean(conversation.lastMessage.deliveredAt);
                        if (isRead) {
                          return (
                            <span title="Seen" className="inline-flex shrink-0">
                              <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
                            </span>
                          );
                        }
                        if (isDelivered) {
                          return (
                            <span title="Delivered" className="inline-flex shrink-0">
                              <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                            </span>
                          );
                        }
                        return (
                          <span title="Sent" className="inline-flex shrink-0">
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        );
                      })()}
                      <span className="truncate">{conversation.lastMessage?.messageText || 'No messages yet'}</span>
                    </p>
                    {hasUnread && (
                      <span className="min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
