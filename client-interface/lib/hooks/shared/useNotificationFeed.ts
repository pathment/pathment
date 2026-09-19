'use client';

import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { messagingApi } from '@/lib/services/messaging-api';
import { acquireSocket } from '@/lib/services/socket-client';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { useClan } from '@/lib/context/ClanContext';
import { roleFromPathname } from '@/lib/utils/notification-audience';

export interface FeedNotification {
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

const EMPTY: FeedNotification[] = [];

/** A notification body arrives as a string or a { messageText } object. */
export const toMessageText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = (value as { messageText?: unknown }).messageText;
    if (typeof candidate === 'string') return candidate;
  }
  return 'You have a new message';
};

const isNonMessage = (n: { type?: string }) => n.type !== 'message';

/**
 * The notification feed, shared by every bell on screen.
 *
 * The bell renders twice (desktop sidebar + mobile header, hidden by CSS only),
 * so a per-component fetch meant two of everything. One cached query serves both,
 * and the socket invalidates it rather than each bell re-reading the list.
 *
 * Mutations write to the cache directly so the badge updates immediately, then
 * invalidate to reconcile with the server.
 */
export function useNotificationFeed(userId: string | undefined) {
  const client = useQueryClient();
  const key = qk.messaging.notifications;
  const { activeClanId, menteeActiveClanId } = useClan();

  const { data, loading, refetch } = useApiQuery<FeedNotification[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await messagingApi.listNotifications(50);
      return (res.notifications as FeedNotification[]).filter(isNonMessage);
    },
    enabled: !!userId,
    staleTime: STALE.short,
  });

  useEffect(() => {
    if (!userId) return;
    const socket = acquireSocket();
    if (!socket) return;

    const invalidate = () => client.invalidateQueries({ queryKey: key });
    const onNew = (payload: { type?: string; title?: string; clanId?: string | null }) => {
      if ((payload?.type || 'message') === 'message') return;
      const portal = typeof window !== 'undefined' ? roleFromPathname(window.location.pathname) : null;
      const active = portal === 'mentee' ? menteeActiveClanId : (portal === 'mentor' ? activeClanId : null);
      const scoped = Boolean(payload?.clanId);
      const isActiveClan = !scoped || payload.clanId === active;
      if (isActiveClan && payload?.title) toast.message(payload.title);
      invalidate();
    };

    socket.on('notification:new', onNew);
    socket.on('notification:unread-count', invalidate);
    // Detach handlers only — the connection is shared and outlives this hook.
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:unread-count', invalidate);
    };
  }, [userId, client, key, activeClanId, menteeActiveClanId]);

  const patch = useCallback(
    (fn: (list: FeedNotification[]) => FeedNotification[]) =>
      client.setQueryData<FeedNotification[]>(key, (prev) => fn(prev ?? [])),
    [client, key]
  );

  const mutate = useCallback(
    async (call: Promise<unknown>, optimistic: (list: FeedNotification[]) => FeedNotification[]) => {
      patch(optimistic);
      try {
        await call;
      } finally {
        client.invalidateQueries({ queryKey: key });
      }
    },
    [patch, client, key]
  );

  const markRead = useCallback((id: string) => mutate(
    messagingApi.markNotificationRead(id),
    (list) => list.map((n) => (n.id === id ? { ...n, status: 'read', readAt: new Date().toISOString() } : n))
  ), [mutate]);

  const markAllRead = useCallback(() => mutate(
    messagingApi.markAllNotificationsRead(),
    (list) => list.map((n) => ({ ...n, status: 'read' as const, readAt: new Date().toISOString() }))
  ), [mutate]);

  const remove = useCallback((id: string) => mutate(
    messagingApi.deleteNotification(id),
    (list) => list.filter((n) => n.id !== id)
  ), [mutate]);

  return { notifications: data ?? EMPTY, loading, reload: refetch, markRead, markAllRead, remove };
}
