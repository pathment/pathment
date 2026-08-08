'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Archive, ArchiveRestore, Filter, MessageSquare, MoreVertical, RefreshCw, Search, Trash2 } from 'lucide-react';

import type { ConversationSummary, SearchableUser } from '@/lib/types/messaging';
import UserSearchCombobox from './UserSearchCombobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  activeTab: 'all' | 'unread' | 'archived';
  onTabChange: (tab: 'all' | 'unread' | 'archived') => void;
  allCount?: number;
  archivedCount?: number;
  isBootstrapping?: boolean;
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
  allCount,
  archivedCount,
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
    <div className="flex flex-col h-full bg-card rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
      {/* Sidebar Header */}
      <div className="p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Messages</h1>
            <p className="text-xs text-slate-500 capitalize">{role} workspace</p>
          </div>
          <div className="flex items-center gap-1.5">
            <UserSearchCombobox onSelect={onStartConversation} />
            <button
              onClick={onRefresh}
              title="Refresh conversations"
              className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900/80 rounded-xl">
          <button
            onClick={() => onTabChange('all')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'all'
                ? 'bg-card text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All {allCount !== undefined ? `(${allCount})` : ''}
          </button>
          <button
            onClick={() => onTabChange('unread')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'unread'
                ? 'bg-card text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
            onClick={() => onTabChange('archived')}
            className={`flex-1 py-1 px-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'archived'
                ? 'bg-card text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Archived {archivedCount !== undefined ? `(${archivedCount})` : ''}
          </button>
        </div>
      </div>

      {/* Conversations list stream */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {isBootstrapping ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {searchQuery ? 'No matching chats' : activeTab === 'unread' ? 'No unread messages' : 'No conversations yet'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery ? 'Try searching another name' : 'Click "New Chat" to message someone'}
            </p>
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
                className={`w-full text-left p-3.5 transition-all flex items-start gap-3 relative cursor-pointer group ${
                  isSelected
                    ? 'bg-brand-50/80 dark:bg-brand-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                }`}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-600 rounded-r-full" />
                )}

                {/* Avatar */}
                {participant?.profilePictureUrl ? (
                  <Image
                    src={participant.profilePictureUrl}
                    alt={title}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-800 mt-0.5"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-sm shrink-0 border border-brand-200/50 mt-0.5">
                    {(participant?.firstName?.[0] || title[0] || 'C').toUpperCase()}
                  </div>
                )}

                {/* Participant + Message detail */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                      {title}
                    </p>
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
                    <p className={`text-xs truncate ${hasUnread ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {conversation.lastMessage?.messageText || 'No messages yet'}
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
