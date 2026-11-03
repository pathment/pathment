import { toast } from 'sonner';
import type { GroupTaskAssignment } from '@/lib/services/group-discussions-api';

const mentees = (count: number) => `${count} mentee${count === 1 ? '' : 's'}`;

/**
 * Tell the mentor who was given the Group Discussion task when mentees were
 * added to a group, and who could not be, with the first reason why.
 */
export function announceGroupTasks(tasks?: GroupTaskAssignment) {
  if (!tasks) return;
  if (tasks.assigned) toast.success(`Group Discussion task assigned to ${mentees(tasks.assigned)}`);
  if (tasks.failed.length) {
    toast.error(`Could not assign the task to ${mentees(tasks.failed.length)}: ${tasks.failed[0].error}`);
  }
}
