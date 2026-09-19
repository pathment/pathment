'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, X, Check, Trash2, Clock, ListTodo, MessageSquare, Award, Trophy, Zap, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { matchesRole, roleFromPathname, type NotificationRole } from '@/lib/utils/notification-audience';
import { useNotificationFeed, toMessageText } from '@/lib/hooks/shared/useNotificationFeed';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';

interface Notification {
  id: string;
  type: string;
  audience?: 'mentor' | 'mentee' | 'admin' | 'any';
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  actionUrl?: string;
  actionLabel?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  clanId?: string | null;
  createdAt: string;
  readAt?: string;
}

interface NotificationDrawerProps {
  userId: string;
  showLabel?: boolean;
}

// Per-type icon + tint so notifications are scannable at a glance.
const TYPE_ICON: Record<string, { Icon: typeof Bell; cls: string }> = {
  task: { Icon: ListTodo, cls: 'bg-brand-50 text-brand-600' },
  feedback: { Icon: MessageSquare, cls: 'bg-violet-50 text-violet-600' },
  badge: { Icon: Award, cls: 'bg-amber-50 text-amber-600' },
  milestone: { Icon: Trophy, cls: 'bg-emerald-50 text-emerald-600' },
  message: { Icon: MessageSquare, cls: 'bg-sky-50 text-sky-600' },
  system: { Icon: Bell, cls: 'bg-slate-100 text-slate-500' },
  challenge: { Icon: Zap, cls: 'bg-orange-50 text-orange-600' },
};
const typeMeta = (t?: string) => TYPE_ICON[t || 'system'] || TYPE_ICON.system;

const getRoleNotificationsPath = (pathname: string): string => {
  const role = pathname.split('/')[1];
  if (role === 'admin' || role === 'mentor' || role === 'mentee') {
    return `/${role}/notifications`;
  }
  return '/notifications';
};

export default function NotificationDrawer({
  userId,
  showLabel = false
}: NotificationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeRole } = useAuth();
  const { activeClanId, menteeActiveClanId } = useClan();
  const [isOpen, setIsOpen] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // The feed itself is shared: this bell renders twice (desktop sidebar + mobile
  // header) and both are always in the DOM, so owning the state here meant two
  // of every fetch and two sockets. See useNotificationFeed.
  const {
    notifications, loading, reload, markRead, markAllRead, remove,
  } = useNotificationFeed(userId);
  // Only blank the list when there is genuinely nothing to show; a background
  // refresh must not replace a populated list with a spinner.
  const isLoading = loading && notifications.length === 0;

  const notificationsPath = getRoleNotificationsPath(pathname || '');

  // Scope to the role the viewer is currently in: prefer the active-role toggle,
  // fall back to the portal in the URL, else show everything. A dual-role
  // mentor/mentee sees only the active hat's items; single-role users see all
  // theirs (they never receive the other role's notifications).
  const role: NotificationRole | null = (activeRole as NotificationRole) || roleFromPathname(pathname);
  const roleScoped = useMemo(
    () => notifications.filter((n) => matchesRole(n.audience, role)),
    [notifications, role]
  );
  const clanScoped = useMemo(() => {
    const portalClan = role === 'mentee' ? menteeActiveClanId : role === 'mentor' ? activeClanId : null;
    if (!portalClan || portalClan === ALL_CLANS) return roleScoped;
    return roleScoped.filter((n) => !n.clanId || n.clanId === portalClan);
  }, [roleScoped, role, menteeActiveClanId, activeClanId]);
  const visibleNotifications = showAllRoles ? notifications : clanScoped;
  const unreadCount = useMemo(
    () => clanScoped.filter((item) => item.status === 'unread').length,
    [clanScoped]
  );
  const hiddenOtherRoleCount = notifications.length - roleScoped.length;

  // Ensure we only render portal on client.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Opening the drawer asks for a fresh read; the cache serves the current list
  // meanwhile, so there is no spinner over existing data.
  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen, reload]);

  // Lock background scroll while sheet is open.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleMarkRead = (notificationId: string) => markRead(notificationId);
  const handleMarkAllRead = () => markAllRead();
  const handleDelete = (notificationId: string) => remove(notificationId);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      setIsOpen(false);
    }
    if (notification.status === 'unread') {
      handleMarkRead(notification.id);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  // Handle Escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  return (
    <>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative rounded-xl transition-colors duration-200 ${
          showLabel ? 'w-full flex items-center gap-3 px-3 py-2.5 text-left' : 'p-2'
        } ${
          isOpen
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Open notifications"
      >
        <span className="relative shrink-0">
          <Bell className={showLabel ? 'w-4 h-4' : 'w-5 h-5'} />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {showLabel && <span className="text-sm font-medium">Notifications</span>}
      </button>

      {isMounted && isOpen && createPortal(
        <>
          <div
            className="fixed inset-0 z-70 bg-black/30 dark:bg-black/60 lg:left-64"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <aside
            className="fixed right-0 top-0 z-80 h-dvh w-full max-w-md bg-card shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col"
            role="dialog"
            aria-labelledby="notif-title"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
              <div>
                <h2 id="notif-title" className="text-base font-semibold text-slate-900">
                  Notifications
                </h2>
                <p className="text-sm text-slate-500">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  {role && <span className="capitalize"> · {showAllRoles ? 'all roles' : role}</span>}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close notifications"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role scope toggle — only meaningful for dual-role users who actually
                have other-role notifications to reveal. */}
            {role && (showAllRoles || hiddenOtherRoleCount > 0) && (
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {showAllRoles
                    ? 'Showing notifications for all your roles'
                    : `${hiddenOtherRoleCount} from your other role${hiddenOtherRoleCount === 1 ? '' : 's'} hidden`}
                </span>
                <button
                  onClick={() => setShowAllRoles((v) => !v)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0"
                >
                  {showAllRoles ? `Show only ${role}` : 'Show all'}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Clock className="w-6 h-6 animate-spin" />
                  <span>Loading notifications...</span>
                </div>
              ) : visibleNotifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 px-6 text-center">
                  <Bell className="w-8 h-8 text-slate-300" />
                  <span>{role && !showAllRoles ? `No ${role} notifications` : 'No notifications yet'}</span>
                  {role && !showAllRoles && hiddenOtherRoleCount > 0 && (
                    <button onClick={() => setShowAllRoles(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      Show {hiddenOtherRoleCount} from your other role{hiddenOtherRoleCount === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibleNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`group px-4 py-3 cursor-pointer transition-colors ${
                        notification.status === 'unread'
                          ? 'bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20'
                          : 'bg-card hover:bg-slate-50'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleNotificationClick(notification);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {(() => { const { Icon, cls } = typeMeta(notification.type); return (
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                        ); })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">{notification.title}</p>
                            {notification.status === 'unread' && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
                          </div>
                          <p className="mt-1 text-xs text-slate-600 line-clamp-2">{toMessageText(notification.message)}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-xs text-slate-400">{formatTime(notification.createdAt)}</p>
                            {notification.actionUrl && notification.actionLabel && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600">
                                · {notification.actionLabel} <ChevronRight className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          {notification.status === 'unread' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkRead(notification.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-100 rounded"
                              aria-label="Mark notification read"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notification.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded"
                            aria-label="Delete notification"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-card">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleMarkAllRead}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Mark all as read
                </button>
                <button
                  onClick={() => {
                    router.push(notificationsPath);
                    setIsOpen(false);
                  }}
                  className="px-3 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
                >
                  View all
                </button>
              </div>
            </div>
          </aside>
        </>,
        document.body
      )}
    </>
  );
}

export { NotificationDrawer };
