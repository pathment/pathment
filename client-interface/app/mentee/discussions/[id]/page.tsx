'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { workspacePath } from '@/lib/services/workspace-scope';

/**
 * A group discussion opens in Messages, where its chat lives with the
 * scenario pinned above it, its meeting and the mentee's own participation.
 * This page used to show the same chat a second time; it now keeps the links
 * that point here working (notifications, bookmarks), carrying `join=meeting`
 * so a "Join meeting" link still joins on arrival.
 */
export default function MenteeDiscussionRedirect() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    const params = new URLSearchParams({ discussion: id });
    if (searchParams.get('join') === 'meeting') params.set('join', 'meeting');
    router.replace(workspacePath(`/mentee/messages?${params.toString()}`));
  }, [id, searchParams, router]);

  return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-label="Opening the discussion" /></div>;
}
