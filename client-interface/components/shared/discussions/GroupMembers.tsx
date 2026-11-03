'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Drawer } from '@/components/shared/Drawer';
import { groupDiscussionsApi, type DiscussionParticipant } from '@/lib/services/group-discussions-api';
import { useAuth } from '@/lib/context/AuthContext';
import { useApiQuery, qk } from '@/lib/query';

/** What each part in a group discussion is called, in the chat and the member list. */
export const DISCUSSION_ROLE_LABEL: Record<DiscussionParticipant['role'], string> = {
  mentor: 'Discussion Lead',
  mentee: 'Participant',
};

/** Everyone in a group's chat. The chat and the member drawer share one request. */
export function useGroupMembers(groupId: string | undefined, enabled = true) {
  return useApiQuery({
    queryKey: qk.mentee.groupDiscussionMembers(groupId ?? ''),
    queryFn: () => groupDiscussionsApi.members(groupId!),
    enabled: enabled && !!groupId,
  });
}

const nameOf = (member: DiscussionParticipant) =>
  `${member.firstName} ${member.lastName}`.trim() || (member.role === 'mentor' ? 'Mentor' : 'Mentee');

/** Search appears once the list is long enough to need it. */
const SEARCH_FROM = 8;

/**
 * The people in a group's chat, opened from its header the way a group chat
 * app shows its members. Mentees and mentors see the same list.
 */
export function GroupMembersButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { user } = useAuth();
  const { data: members = [], loading, error } = useGroupMembers(groupId, open);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? members.filter((member) => nameOf(member).toLowerCase().includes(q)) : members;
    return [
      { label: 'Discussion Lead', people: visible.filter((member) => member.role === 'mentor') },
      { label: 'Participants', people: visible.filter((member) => member.role === 'mentee') },
    ].filter((section) => section.people.length);
  }, [members, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors shrink-0"
        aria-label="Group members"
        title="Group members"
      >
        <Users className="w-5 h-5" />
      </button>
      <Drawer
        open={open}
        onClose={() => { setOpen(false); setQuery(''); }}
        title="Group members"
        subtitle={loading ? undefined : `${members.length} member${members.length === 1 ? '' : 's'}`}
        width="sm"
      >
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Could not load the members.</p>
        ) : (
          <div className="space-y-5">
            {members.length >= SEARCH_FROM && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search members…"
                  aria-label="Search members"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            {!sections.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nobody by that name</p>
            )}

            {sections.map((section) => (
              <section key={section.label}>
                <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {section.label} <span className="tabular-nums">· {section.people.length}</span>
                </h3>
                <ul className="space-y-0.5">
                  {section.people.map((member) => {
                    const isMe = member.userId === user?.id;
                    return (
                      <li key={member.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted">
                        <Avatar name={nameOf(member)} src={member.profilePictureUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{nameOf(member)}</p>
                          {isMe && <p className="text-xs text-muted-foreground">You</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
