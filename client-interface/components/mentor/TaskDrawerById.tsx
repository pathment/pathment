'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { MenteeTaskDrawer } from '@/components/mentor/MenteeTaskDrawer';
import { InterviewReviewDrawer } from '@/components/mentor/InterviewReviewDrawer';
import { QuizReviewDrawer } from '@/components/mentor/QuizReviewDrawer';
import taskApi from '@/lib/services/task-api';

/**
 * Loads a task by id and opens it in the shared MenteeTaskDrawer — the same
 * beautiful in-context drawer the Clan Review uses. Lets any list (mentee
 * detail, approvals) open a task as a drawer instead of navigating to a page.
 */
export function TaskDrawerById({ taskId, onClose, onChanged }: { taskId: string; onClose: () => void; onChanged: () => void }) {
  const [task, setTask] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    taskApi.getTaskById(taskId)
      .then((r: any) => { if (active) setTask(r?.data?.task ?? null); }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => { if (active) setTask(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId]);

  if (loading) {
    return <Drawer open onClose={onClose} title="Loading task…"><div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div></Drawer>;
  }
  if (!task) {
    return <Drawer open onClose={onClose} title="Task"><p className="text-sm text-slate-500">Could not load this task.</p></Drawer>;
  }
  const taskType = task.roadmapTask?.type || task.type;
  const interviewManageable = ['assigned', 'not_started', 'in_progress'].includes(task.status);
  if (taskType === 'interview' && !interviewManageable) {
    return <InterviewReviewDrawer taskId={task.id} onClose={onClose} onFinalized={onChanged} />;
  }
  if (taskType === 'quiz' && ['submitted', 'revision_needed', 'completed'].includes(task.status)) {
    return <QuizReviewDrawer taskId={task.id} onClose={onClose} onReviewed={onChanged} />;
  }
  return <MenteeTaskDrawer task={task} onClose={onClose} onChanged={onChanged} />;
}
