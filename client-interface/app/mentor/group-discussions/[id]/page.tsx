'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, MessageCircle, Trash2, UserPlus } from 'lucide-react';
import { Dropdown } from '@/components/shared/Dropdown';
import { DiscussionStateBadge, discussionTimeLabel } from '@/components/shared/discussions/DiscussionStatus';
import { MemberProgress, memberName } from '@/components/mentor/discussions/MemberProgress';
import { DiscussionMeetingPanel } from '@/components/mentor/discussions/DiscussionMeetingPanel';
import { MenteePicker } from '@/components/mentor/discussions/MenteePicker';
import { useClanMentees } from '@/components/mentor/discussions/useClanMentees';
import { announceGroupTasks } from '@/components/mentor/discussions/announceGroupTasks';
import { groupDiscussionsApi, type DiscussionMember } from '@/lib/services/group-discussions-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { useApiQuery, qk } from '@/lib/query';

/** One group: who is contributing. Its chat opens in Messages. */
export default function MentorGroupDiscussionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const chatHref = `/mentor/messages?discussion=${id}`;
  // Older message notifications link here with the conversation; the chat is in Messages now.
  const notifiedConversationId = useSearchParams().get('conversationId');
  useEffect(() => {
    if (notifiedConversationId) router.replace(`${chatHref}&conversationId=${notifiedConversationId}`);
  }, [notifiedConversationId, chatHref, router]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const { data: group, loading, error, refetch } = useApiQuery({
    queryKey: qk.mentor.groupDiscussion(id),
    queryFn: () => groupDiscussionsApi.getGroup(id),
    enabled: !!id,
    // Contribution moves while mentees talk; the chat itself is live.
    refetchInterval: 30_000,
  });

  const clanMentees = useClanMentees(group?.clanId);
  const addable = useMemo(() => {
    const seated = new Set((group?.members ?? []).map((m) => m.userId));
    return clanMentees.filter((m) => !seated.has(m.id));
  }, [clanMentees, group?.members]);

  const addPicked = async (close: () => void) => {
    setAdding(true);
    try {
      const updated = await groupDiscussionsApi.addMembers(id, [...picked]);
      announceGroupTasks(updated.tasks);
      await refetch();
      close();
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Could not add them');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (member: DiscussionMember) => {
    const ok = await confirm({
      title: `Remove ${memberName(member)} from this group?`,
      description: 'They can no longer read or post in this chat. Their messages stay.',
      variant: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await groupDiscussionsApi.removeMember(id, member.userId);
      await refetch();
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Could not remove them');
    }
  };

  const deleteGroup = async () => {
    const ok = await confirm({
      title: 'Delete this group discussion?',
      description: 'The group, its chat and every message are deleted for everyone. Assigned tasks stay. This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await groupDiscussionsApi.deleteGroup(id);
      toast.success('Group discussion deleted');
      router.push('/mentor/group-discussions');
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Could not delete it');
    }
  };

  const back = (
    <Link href="/mentor/group-discussions" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
      <ChevronLeft className="h-4 w-4" /> Group discussions
    </Link>
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  if (error || !group) {
    return (
      <div className="space-y-4">
        {back}
        <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          This group could not be found, or you do not run its clan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-slate-900 text-xl sm:text-2xl font-bold">{group.name}</h1>
            <DiscussionStateBadge state={group.state} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {discussionTimeLabel(group)}{group.state === 'ended' ? ' · Ended: only you can post' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={chatHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <MessageCircle className="h-4 w-4" /> Open chat
          </Link>
          <button
            type="button"
            onClick={deleteGroup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      <DiscussionMeetingPanel groupId={group.id} groupName={group.name} />

      <MemberProgress
        members={group.members}
        onRemove={remove}
        action={(
          <Dropdown
            align="end"
            width="w-80"
            onClosed={() => setPicked(new Set())}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-muted"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add mentees
              </button>
            )}
          >
            {(close) => (
              <div className="space-y-2 p-2">
                <MenteePicker mentees={addable} selected={picked} onChange={setPicked} />
                <button
                  type="button"
                  onClick={() => addPicked(close)}
                  disabled={!picked.size || adding}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {picked.size ? `Add ${picked.size} mentee${picked.size === 1 ? '' : 's'}` : 'Select mentees to add'}
                </button>
              </div>
            )}
          </Dropdown>
        )}
      />
    </div>
  );
}
