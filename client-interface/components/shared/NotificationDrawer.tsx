'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, X, Check, Trash2, Clock, ListTodo, MessageSquare, Award, Trophy, Zap, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { messagingApi } from '@/lib/services/messaging-api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  actionUrl?: string;
  actionLabel?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
  readAt?: string;
}

interface NotificationDrawerProps {
  userId: string;
  apiBaseUrl: string;
  showLabel?: boolean;
}

interface NotificationSocketPayload {
  id?: string;
  type?: string;
  title?: string;
  message?: unknown;
  actionUrl?: string;
}

const toNotificationMessageText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { messageText?: unknown }).messageText;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return 'You have a new message';
};

const isNonMessageNotification = (notification: { type?: string }): boolean => {
  return notification.type !== 'message';
};

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
  apiBaseUrl,
  showLabel = false
}: NotificationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const notificationsPath = getRoleNotificationsPath(pathname || '');

  // Load notifications on mount and when drawer opens
  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await messagingApi.listNotifications(50);
      const filtered = data.notifications.filter(isNonMessageNotification);
      setNotifications(filtered);
      setUnreadCount(filtered.filter((item) => item.status === 'unread').length);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize socket connection for realtime updates
  useEffect(() => {
    if (!userId) return;

    const socketUrl = apiBaseUrl.endsWith('/api') 
      ? apiBaseUrl.slice(0, -4) 
      : apiBaseUrl;

    const newSocket = io(socketUrl, {
      auth: {
        token: localStorage.getItem('token')
      }
    });

    const handleNotificationNew = (data: NotificationSocketPayload) => {
      const incomingType = data?.type || 'message';
      if (incomingType === 'message') {
        return;
      }

      setNotifications((prev) => [
        {
          id: data?.id || `notif-${Date.now()}`,
          type: incomingType,
          title: data?.title || 'New message',
          message: toNotificationMessageText(data?.message),
          status: 'unread',
          actionUrl: data?.actionUrl,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
      setUnreadCount((prev) => prev + 1);
    };

    const handleUnreadCountUpdate = async (data: { unreadCount: number }) => {
      if (typeof data?.unreadCount !== 'number') {
        return;
      }

      try {
        const latest = await messagingApi.listNotifications(50);
        const filtered = latest.notifications.filter(isNonMessageNotification);
        setUnreadCount(filtered.filter((item) => item.status === 'unread').length);
      } catch (error) {
        console.error('Failed to refresh notification count:', error);
      }
    };

    newSocket.on('notification:new', handleNotificationNew);
    newSocket.on('notification:unread-count', handleUnreadCountUpdate);

    return () => {
      newSocket.off('notification:new', handleNotificationNew);
      newSocket.off('notification:unread-count', handleUnreadCountUpdate);
      newSocket.disconnect();
    };
  }, [apiBaseUrl, userId]);

  // Ensure we only render portal on client.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Keep bell count accurate even before opening drawer.
  useEffect(() => {
    if (!userId) return;

    const loadUnreadCount = async () => {
      try {
        const data = await messagingApi.listNotifications(50);
        const filtered = data.notifications.filter(isNonMessageNotification);
        setUnreadCount(filtered.filter((item) => item.status === 'unread').length);
      } catch (error) {
        console.error('Failed to load notification count:', error);
      }
    };

    loadUnreadCount();
  }, [userId]);

  // Load notifications when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  // Lock background scroll while sheet is open.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleMarkRead = async (notificationId: string) => {
    try {
      await messagingApi.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await messagingApi.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read' as const, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await messagingApi.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (notifications.find((n) => n.id === notificationId)?.status === 'unread') {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

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
            className="fixed inset-0 z-70 bg-black/30 lg:left-64"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <aside
            className="fixed right-0 top-0 z-80 h-dvh w-full max-w-md bg-card shadow-2xl border-l border-slate-200 flex flex-col"
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

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Clock className="w-6 h-6 animate-spin" />
                  <span>Loading notifications...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 px-6 text-center">
                  <Bell className="w-8 h-8 text-slate-300" />
                  <span>No notifications yet</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => (
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
                          <p className="mt-1 text-xs text-slate-600 line-clamp-2">{toNotificationMessageText(notification.message)}</p>
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
