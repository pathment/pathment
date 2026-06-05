'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Loader2, Trash2 } from 'lucide-react';

import { messagingApi } from '@/lib/services/messaging-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { TablePagination } from '@/components/shared/TablePagination';
import type { NotificationItem } from '@/lib/types/messaging';

interface NotificationsPageProps {
  role: 'admin' | 'mentor' | 'mentee';
}

function isNonMessageNotification(notification: NotificationItem): boolean {
  return notification.type !== 'message';
}

function formatTime(dateString: string): string {
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
}

export default function NotificationsPage({ role }: NotificationsPageProps) {
  const pagination = usePagination({ initialPage: 1, initialLimit: 10 });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await messagingApi.listNotifications(200);
      const filtered = data.notifications.filter(isNonMessageNotification);
      setNotifications(filtered);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications().catch((error) => {
      console.error('Failed to load notifications:', error);
    });
  }, [loadNotifications]);

  useEffect(() => {
    pagination.setTotal(notifications.length);
  }, [notifications.length, pagination.setTotal]);

  const paginatedNotifications = useMemo(() => {
    const from = pagination.offset;
    const to = from + pagination.limit;
    return notifications.slice(from, to);
  }, [notifications, pagination.limit, pagination.offset]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === 'unread').length,
    [notifications]
  );

  const handleMarkRead = async (notificationId: string) => {
    try {
      await messagingApi.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, status: 'read', readAt: new Date().toISOString() }
            : item
        )
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await messagingApi.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await messagingApi.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, status: 'read', readAt: new Date().toISOString() }))
      );
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900">Notifications</h1>
          <p className="text-slate-600 text-sm capitalize">
            {role} notifications ({unreadCount} unread)
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Mark all as read
        </button>
      </div>

      <div className="bg-card border border-slate-200 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Bell className="w-8 h-8 text-slate-300" />
            <span>No notifications yet</span>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {paginatedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 transition-colors ${
                    notification.status === 'unread' ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{notification.title}</p>
                        {notification.status === 'unread' && (
                          <span className="w-2 h-2 rounded-full bg-brand-600" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-2 text-xs text-slate-400">{formatTime(notification.createdAt)}</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {notification.status === 'unread' && (
                        <button
                          onClick={() => handleMarkRead(notification.id)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-100 rounded"
                          aria-label="Mark notification read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(notification.id)}
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

            <div className="px-4 py-3 border-t border-slate-200">
              <TablePagination pagination={pagination} isLoading={isLoading} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
