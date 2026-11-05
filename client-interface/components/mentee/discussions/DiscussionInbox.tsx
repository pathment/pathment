'use client';

import { Loader2, Lock, MessageSquare, MessageSquareQuote } from 'lucide-react';
import {
  DISCUSSION_CLOSED_NOTE, DiscussionStateBadge, discussionStateHint, sortDiscussions,
} from '@/components/shared/discussions/DiscussionStatus';
import { GroupChat } from '@/components/shared/discussions/GroupChat';
import { PinnedScenario } from '@/components/shared/discussions/PinnedScenario';
import { GroupMembersButton } from '@/components/shared/discussions/GroupMembers';
import type { DiscussionMeeting, DiscussionWindowFields, MyDiscussionTask } from '@/lib/services/group-discussions-api';
import { DiscussionSubmitButton } from './DiscussionSubmitButton';
import { MyParticipationButton } from './DiscussionMeetingArea';

/** What a row and its chat need: a mentee's own groups and a mentor's both fit. */
export type InboxDiscussion = DiscussionWindowFields & {
  id: string;
  name: string;
  clanName?: string | null;
  conversationId: string;
  scenario: { title: string; prompt: string | null } | null;
  /** A mentee's own task for the group, handed in from the chat. */
  myTask?: MyDiscussionTask | null;
  /** The group's live meeting, joined from the top of the chat. */
  meeting?: DiscussionMeeting | null;
};

const titleOf = (group: InboxDiscussion) => group.scenario?.title || group.name;

/**
 * The Discussions tab of Messages. Every group is listed so a mentee can see
 * what is coming, but one that has not started cannot be opened yet. The
 * mentor who runs them (`owner`) can open any of them.
 */
export function DiscussionRows({ groups, loading, query, selectedId, onOpen, owner = false }: {
  groups: InboxDiscussion[];
  loading: boolean;
  query: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  owner?: boolean;
}) {
  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }

  const search = query.trim().toLowerCase();
  const visible = sortDiscussions(groups).filter((group) =>
    !search || [titleOf(group), group.name, group.clanName].some((text) => text?.toLowerCase().includes(search)));

  if (!visible.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">{search ? 'No matching discussions' : 'No discussions yet'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {search
            ? 'Try searching another title'
            : owner ? 'Create one in Curriculum → Group discussions.' : 'When your mentor adds you to a group, it shows up here.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {visible.map((group) => {
        const locked = !owner && group.state === 'upcoming';
        const selected = selectedId === group.id;
        const Icon = locked ? Lock : MessageSquareQuote;
        return (
          <button
            key={group.id}
            type="button"
            disabled={locked}
            onClick={() => onOpen(group.id)}
            aria-current={selected ? 'true' : undefined}
            title={locked ? discussionStateHint(group) : undefined}
            className={`relative flex w-full items-start gap-3 p-3.5 text-left transition-colors duration-150 ${
              selected ? 'bg-brand-500/10' : locked ? 'cursor-not-allowed' : 'hover:bg-slate-100/60 dark:hover:bg-white/5'
            }`}
          >
            {selected && <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-600 rounded-r-full" />}
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              locked ? 'bg-muted text-muted-foreground' : 'bg-brand-500/10 text-brand-600'
            }`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 flex items-center justify-between gap-2">
                <span className={`truncate text-sm font-semibold ${locked ? 'text-muted-foreground' : 'text-slate-800 dark:text-slate-200'}`}>
                  {titleOf(group)}
                </span>
                <span className="shrink-0"><DiscussionStateBadge state={group.state} /></span>
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {group.name}{group.clanName ? ` · ${group.clanName}` : ''}
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{discussionStateHint(group)}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * One open discussion in the Messages pane: the one place a discussion opens.
 * Its mentor (`owner`) can post at any time. A mentee also gets their own
 * participation here; the group's meeting is joined from the banner at the
 * top of the page, and its video sits above Messages.
 */
export function DiscussionThread({ group, onBack, owner = false }: { group: InboxDiscussion; onBack: () => void; owner?: boolean }) {
  return (
    <GroupChat
      key={group.id}
      conversationId={group.conversationId}
      groupId={group.id}
      title={titleOf(group)}
      canPost={owner || group.state === 'open'}
      closedNote={DISCUSSION_CLOSED_NOTE[group.state]}
      header={(
        <>
          <PinnedScenario
            title={titleOf(group)}
            prompt={group.scenario?.prompt}
            onBack={onBack}
            trailing={(
              <>
                {!owner && <MyParticipationButton groupId={group.id} />}
                {!owner && <DiscussionSubmitButton task={group.myTask} groupId={group.id} />}
                <GroupMembersButton groupId={group.id} />
              </>
            )}
          />
        </>
      )}
    />
  );
}
