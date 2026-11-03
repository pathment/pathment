'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Loader2, MessageSquareQuote } from 'lucide-react';
import { DISCUSSION_CLOSED_NOTE, DiscussionMeta, DiscussionStateBadge, discussionStateHint } from '@/components/shared/discussions/DiscussionStatus';
import { GroupChat } from '@/components/shared/discussions/GroupChat';
import { RichContent } from '@/components/shared/RichContent';
import { GroupMembersButton } from '@/components/shared/discussions/GroupMembers';
import { DiscussionSubmitButton } from '@/components/mentee/discussions/DiscussionSubmitButton';
import { groupDiscussionsApi } from '@/lib/services/group-discussions-api';
import { useApiQuery, qk } from '@/lib/query';

/** The scenario, and the group's chat. Posting follows the group's schedule. */
export default function MenteeDiscussionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: group, loading, error } = useApiQuery({
    queryKey: qk.mentee.groupDiscussion(id),
    queryFn: () => groupDiscussionsApi.mineOne(id),
    enabled: !!id,
    // The chat opens and freezes on a clock, so a page left open should follow it.
    refetchInterval: 60_000,
  });

  const back = (
    <Link href="/mentee/messages?tab=discussions" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
      <ChevronLeft className="h-4 w-4" /> Discussions
    </Link>
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  if (error || !group) {
    return (
      <div className="space-y-4">
        {back}
        <p className="rounded-2xl border border-slate-200 bg-card py-14 text-center text-sm text-slate-500">
          You are not part of this discussion.
        </p>
      </div>
    );
  }

  const prompt = group.scenario?.prompt;

  return (
    <div className="space-y-6">
      {back}
      <div className="mentee-page-heading">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-slate-900 break-words">{group.scenario?.title || group.name}</h1>
          <DiscussionStateBadge state={group.state} />
        </div>
        <DiscussionMeta group={group} />
      </div>
      <div className={`grid items-start gap-4 ${prompt ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
        {/* The scenario comes first on a phone: it is what the chat is about. */}
        {prompt && (
          <aside className="rounded-2xl border border-slate-200 bg-card p-5 lg:order-last lg:max-h-[65vh] lg:overflow-y-auto">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageSquareQuote className="h-4 w-4 text-brand-600" aria-hidden />
              The scenario
            </h2>
            <RichContent html={prompt} className="text-slate-700 dark:text-slate-300" />
          </aside>
        )}
        <div className="h-[65vh] min-h-[420px] min-w-0">
          <GroupChat
            conversationId={group.conversationId}
            groupId={group.id}
            title="Group chat"
            subtitle={discussionStateHint(group)}
            canPost={group.state === 'open'}
            closedNote={DISCUSSION_CLOSED_NOTE[group.state]}
            actions={(
              <>
                <DiscussionSubmitButton task={group.myTask} groupId={group.id} />
                <GroupMembersButton groupId={group.id} />
              </>
            )}
          />
        </div>
      </div>
    </div>
  );
}
