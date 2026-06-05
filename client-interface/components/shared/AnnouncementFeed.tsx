'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Pin, Trash2, CheckCircle2, ThumbsUp, Loader2 } from 'lucide-react';
import { announcementsApi } from '@/lib/services/announcements-api';
import type { Announcement } from '@/lib/hooks/shared/useAnnouncements';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Shared announcement feed — pinned-first cards with audience labels + reactions.
 * Pin/delete controls appear only for announcements the viewer can manage
 * (`canManage` — admin sees all; authors see their own via the `mine` flag).
 */
export function AnnouncementFeed({
  announcements,
  loading,
  error,
  onRefresh,
  canManage = false,
  emptyHint = 'No announcements yet.',
}: {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  canManage?: boolean;
  emptyHint?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    try { setBusy(id); await fn(); onRefresh(); }
    catch { toast.error('Action failed'); } finally { setBusy(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;
  if (error) return (
    <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
      <p className="text-slate-600 mb-3">{error}</p>
      <button onClick={onRefresh} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
    </div>
  );
  if (announcements.length === 0) return (
    <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
      <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-600">{emptyHint}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {announcements.map((a) => {
        const manage = canManage || a.mine;
        return (
          <div key={a.id} className={`bg-card rounded-2xl border p-5 ${a.pinned ? 'border-brand-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin className="w-3.5 h-3.5 text-brand-500" />}
                  <h3 className="font-medium text-slate-900">{a.title}</h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {a.author?.name}{a.author?.role ? ` · ${a.author.role}` : ''} · to {a.audienceLabel} · {timeAgo(a.at)}
                </p>
              </div>
              {manage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => act(a.id, () => announcementsApi.togglePin(a.id))} disabled={busy === a.id}
                    title={a.pinned ? 'Unpin' : 'Pin'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${a.pinned ? 'text-brand-600' : 'text-slate-400'}`}>
                    <Pin className="w-4 h-4" />
                  </button>
                  <button onClick={() => act(a.id, () => announcementsApi.remove(a.id))} disabled={busy === a.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{a.body}</p>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => act(a.id, () => announcementsApi.react(a.id, 'acknowledged'))} disabled={busy === a.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${a.myReactions.includes('acknowledged') ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />Acknowledged {a.reactions.acknowledged > 0 && a.reactions.acknowledged}
              </button>
              <button onClick={() => act(a.id, () => announcementsApi.react(a.id, 'helpful'))} disabled={busy === a.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${a.myReactions.includes('helpful') ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <ThumbsUp className="w-3.5 h-3.5" />Helpful {a.reactions.helpful > 0 && a.reactions.helpful}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
