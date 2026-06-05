/**
 * Mirror of server/src/config/notificationMatrix.js → EMAIL_PREFERENCE_CATEGORIES.
 * The emailable, non-transactional notification categories a user can toggle.
 * Each `key` is the preferenceKey the orchestrator checks in `emailNotifications`.
 *
 * `roles` lists who actually RECEIVES that notification, so each role only sees
 * the toggles relevant to them. Labels are written role-neutrally so they read
 * clearly for everyone who sees them. Keep in sync with the server.
 */
export type AppRole = 'admin' | 'mentor' | 'mentee';

export interface EmailCategory {
  group: string;
  key: string;
  label: string;
  roles: AppRole[];
}

export const EMAIL_PREFERENCE_CATEGORIES: EmailCategory[] = [
  // Tasks
  { group: 'Tasks', key: 'task_assigned', label: 'A task is assigned to you', roles: ['mentee'] },
  { group: 'Tasks', key: 'task_submitted', label: 'A mentee submits work for review', roles: ['mentor'] },
  { group: 'Tasks', key: 'deadline_approaching', label: 'A task deadline is approaching', roles: ['mentee'] },
  { group: 'Tasks', key: 'deadline_passed', label: 'A task deadline has passed', roles: ['mentee', 'mentor'] },
  { group: 'Tasks', key: 'extension_requested', label: 'A deadline extension is requested', roles: ['mentor'] },
  { group: 'Tasks', key: 'extension_handled', label: 'Your extension request is decided', roles: ['mentee'] },
  // Feedback
  { group: 'Feedback', key: 'submission_reviewed', label: 'Your submission has been reviewed', roles: ['mentee'] },
  { group: 'Feedback', key: 'feedback_sent', label: 'You receive new feedback', roles: ['mentee'] },
  // Program
  { group: 'Program', key: 'enrollment_updates', label: 'Enrollment updates', roles: ['mentee', 'admin'] },
  { group: 'Program', key: 'mentor_assignment', label: 'A mentor is assigned', roles: ['mentee', 'admin'] },
  { group: 'Program', key: 'program_updates', label: 'Program updates', roles: ['mentee', 'mentor', 'admin'] },
  { group: 'Program', key: 'meeting_cancelled', label: 'A 1:1 meeting is cancelled', roles: ['mentee', 'mentor'] },
  // Milestones
  { group: 'Milestones', key: 'completion_ready_for_signoff', label: 'A mentee is ready for completion sign-off', roles: ['mentor', 'admin'] },
  { group: 'Milestones', key: 'program_completed', label: 'A program is completed', roles: ['mentee', 'mentor', 'admin'] },
  // Digests
  { group: 'Digests', key: 'weekly_progress_report', label: 'Weekly progress report', roles: ['mentee', 'mentor', 'admin'] },
];

/** The categories a given role actually receives (for showing relevant toggles). */
export const categoriesForRole = (role: AppRole | string) =>
  EMAIL_PREFERENCE_CATEGORIES.filter((c) => c.roles.includes(role as AppRole));

/** Distinct groups present for a role, in canonical order. */
export const groupsForRole = (role: AppRole | string) => {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const c of categoriesForRole(role)) if (!seen.has(c.group)) { seen.add(c.group); groups.push(c.group); }
  return groups;
};
