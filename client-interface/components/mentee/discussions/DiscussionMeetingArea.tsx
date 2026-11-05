'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { MyDiscussionResult } from './MyDiscussionResult';

/**
 * "My participation", at the top of a group's chat in Messages: the mentee's
 * own speaking time, activity and feedback, in a drawer. (The meeting itself
 * is joined from the banner at the top of the page, not from the chat.)
 */
export function MyParticipationButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="My participation"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700 dark:text-slate-300"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">My participation</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="My participation" subtitle="Speaking time, chat activity and your mentor's feedback">
        <MyDiscussionResult groupId={groupId} embedded />
      </Drawer>
    </>
  );
}
