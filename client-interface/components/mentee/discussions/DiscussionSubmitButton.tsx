'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { SubmitTaskDrawer } from '@/components/mentee/SubmitTaskDrawer';
import type { MyDiscussionTask } from '@/lib/services/group-discussions-api';
import { useInvalidate, qk } from '@/lib/query';

/**
 * Submit work, from inside the group's chat: the same submission drawer as the
 * task list, for the mentee's own Group Discussion task. Nothing shows when
 * there is no task to hand in (none assigned, or it is already done).
 */
export function DiscussionSubmitButton({ task, groupId }: { task?: MyDiscussionTask | null; groupId: string }) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidate();
  if (!task || task.status === 'completed' || task.status === 'cancelled') return null;

  const label = task.status === 'submitted' ? 'Update submission' : task.status === 'revision_needed' ? 'Re-submit' : 'Submit work';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Submit</span>
      </button>
      <SubmitTaskDrawer
        open={open}
        task={task}
        onClose={() => setOpen(false)}
        onSubmitted={() => invalidate(
          qk.mentee.groupDiscussions,
          qk.mentee.groupDiscussion(groupId),
          ['me', 'tasks'],
          ['me', 'task'],
        )}
      />
    </>
  );
}
