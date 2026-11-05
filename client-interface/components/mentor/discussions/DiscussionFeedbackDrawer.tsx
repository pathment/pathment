'use client';

import { Info } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { DiscussionParticipation } from './DiscussionParticipation';
import { FeedbackForm } from './FeedbackForm';
import type { ApprovalItem } from '@/lib/hooks/mentor';
import type { MeetingFeedback } from '@/lib/services/group-discussions-api';

export interface FeedbackTarget {
  menteeId: string;
  name: string;
  avatarUrl?: string | null;
  task: { id: string; status: string } | null;
  feedback: MeetingFeedback | null;
}

/** Why there is nothing to approve, in the words a mentor needs. */
function statusNote(task: FeedbackTarget['task']) {
  if (!task) return 'No group discussion task is assigned to them, so there is nothing to approve. Your feedback is still saved and shows on their discussion page.';
  if (task.status === 'completed') return 'Their task is already approved. Your feedback updates their stars and what they see; the review itself stays as it was written.';
  if (task.status === 'revision_needed') return 'Changes were requested on their task. Your feedback is saved, and their next submission comes back to Approvals.';
  return 'Their task is not submitted yet: it is handed in when they join the meeting. Your feedback is saved and is there when you review it.';
}

/**
 * One mentee's group discussion feedback, always in a drawer, from the live
 * meeting's ★ and the meeting summary alike.
 *
 * With their task waiting for review it is the review drawer itself, so the
 * mentor rates and approves in one place. Otherwise it is the same discussion
 * section (stats and sliders) in the shared drawer, with a note on why there
 * is nothing to approve, so the button behaves the same in every case.
 */
export function DiscussionFeedbackDrawer({ groupId, target, reviewItem, onClose, onChanged }: {
  groupId: string;
  target: FeedbackTarget;
  /** Their task in the review queue, when it is waiting for review. */
  reviewItem: ApprovalItem | null;
  onClose: () => void;
  /** Feedback saved or the task reviewed: refresh whatever shows it. */
  onChanged: () => void;
}) {
  if (reviewItem) {
    return <ReviewDrawer item={reviewItem} showMentee onClose={onClose} onReviewed={onChanged} />;
  }

  return (
    <Drawer
      open
      onClose={() => { onChanged(); onClose(); }}
      title="Group discussion feedback"
      headerMeta={(
        <div className="flex items-center gap-2">
          <Avatar name={target.name} src={target.avatarUrl} size="sm" />
          <span className="truncate text-sm font-medium text-slate-800">{target.name}</span>
        </div>
      )}
      footer={(dismiss) => (
        <div className="flex w-full items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <p className="flex-1 text-xs text-muted-foreground">{statusNote(target.task)}</p>
          <button type="button" onClick={dismiss} className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Done
          </button>
        </div>
      )}
    >
      {target.task ? (
        <DiscussionParticipation taskId={target.task.id} menteeId={target.menteeId} menteeName={target.name} canRate />
      ) : (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-medium text-slate-700">Your feedback</h3>
          <FeedbackForm
            groupId={groupId}
            menteeId={target.menteeId}
            menteeName={target.name}
            initial={target.feedback}
            onSaved={onChanged}
            compact
          />
        </div>
      )}
    </Drawer>
  );
}
