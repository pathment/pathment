import type { UserRole } from '@/lib/types';

export interface TourStep {
  /** CSS selector for the element to spotlight, or null for a centered card. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STORAGE_PREFIX = 'pathment-tour-seen';
export const TOUR_EVENT = 'pathment:start-tour';

// Standalone nav links are targeted by href; collapsible section parents by their
// `data-tour="group:*"` hook (so the spotlight lands on the always-visible section
// header, not a child hidden inside a collapsed group). The bell + help use their
// own data-tour. Steps whose target isn't on screen are skipped safely.
const COMMON_TAIL = (role: UserRole): TourStep[] => [
  { target: '[data-tour="notifications"]', title: 'Notifications', body: 'Real-time updates - new tasks, messages, blockers and reviews - show up here the moment they happen.' },
  { target: '[data-tour="feedback"]', title: 'Got a bug or idea?', body: 'Hit this button anytime to report a bug or suggest an improvement. Attach a screenshot or short clip, and track the status of your reports under "My reports".' },
  { target: `a[href="/${role}/settings"]`, title: 'Settings & preferences', body: 'Edit your profile, pick your color vibe + light/dark, and in Notifications choose exactly which emails you receive. Mentors and admins can also connect their own AI key here.' },
  { target: null, title: 'You\'re all set', body: 'That\'s the quick tour. Replay it anytime from the "?" button at the top of the sidebar.' },
];

export const WALKTHROUGHS: Record<UserRole, TourStep[]> = {
  mentor: [
    { target: null, title: 'Welcome to Pathment', body: 'A quick 60-second tour of your mentor workspace. You can skip anytime - and replay it later.' },
    { target: 'a[href="/mentor/dashboard"]', title: 'Cockpit', body: 'Your home base. See who needs attention today, your cohort health, and jump straight in.' },
    { target: '[data-tour="group:mentees"]', title: 'My Mentees', body: 'Everyone you mentor lives in this section - your mentee directory, Clan Team, approvals, cohort review, at-risk, and promotions.' },
    { target: null, title: 'Inactive mentee suggestions', body: 'At the top of My Mentees you will see a suggestions queue - Pathment flags mentees who have gone quiet based on attendance and submissions. Pause them with one click to keep your cohort focused.' },
    { target: null, title: 'Pause in Cohort Review', body: 'You can also pause a mentee mid-review: hit the pause icon next to their name. They are removed from the queue for the current session and you can resume them any time from the same page.' },
    { target: '[data-tour="group:teaching"]', title: 'Teaching', body: 'Build and run the curriculum: roadmaps, your programs, schedules, reports, and progress scores.' },
    ...COMMON_TAIL('mentor'),
  ],
  mentee: [
    { target: null, title: 'Welcome to Pathment', body: 'A quick tour of your learning space. You can skip anytime - and replay it later.' },
    { target: 'a[href="/mentee/dashboard"]', title: 'This Week', body: 'Your single most important next action, front and center - so you always know what to do next.' },
    { target: 'a[href="/mentee/tasks"]', title: 'My Tasks', body: 'Everything assigned to you. Open a task and submit your work right here.' },
    { target: 'a[href="/mentee/meetings"]', title: 'My Mentor', body: 'Book 1:1s from your mentor\'s open times and keep in touch.' },
    { target: '[data-tour="group:mentee-progress"]', title: 'Progress', body: 'Your daily log, blockers (counted fairly toward progress, not against you), overall progress, and gamification all live here.' },
    ...COMMON_TAIL('mentee'),
  ],
  admin: [
    { target: null, title: 'Welcome to Pathment', body: 'A quick tour of your admin console. You can skip anytime - and replay it later.' },
    { target: 'a[href="/admin/dashboard"]', title: 'Dashboard', body: 'Org-wide health at a glance - programs, clans, and who is at risk.' },
    { target: '[data-tour="group:admissions"]', title: 'Admissions', body: 'Run intake end-to-end: cohorts & applications, the assessments you build, shareable public apply links, and registration invites - all in one section.' },
    { target: '[data-tour="group:people"]', title: 'People & Clans', body: 'Enrollments, clans (the mentor-led groups), the mentor/mentee directories, and clan change requests.' },
    { target: null, title: 'Paused mentees', body: 'Mentors can pause inactive mentees. You will see the same paused/suggestion panel at the top of Users - Mentees, and can pause or resume anyone from their profile.' },
    { target: 'a[href="/admin/access"]', title: 'Roles & Access', body: 'Decide who can do what: grant scoped roles (program admin, intake manager, moderator, lead/co-mentor...), invite teammates with a role pre-assigned, or build custom roles.' },
    { target: '[data-tour="group:analytics"]', title: 'Analytics', body: 'Insights with the fairness lens (absolute vs. credited progress) and platform activity.' },
    { target: 'a[href="/admin/feedback"]', title: 'Feedback inbox', body: 'All user-submitted bug reports and suggestions land here. Set a status, reply, and the reporter gets notified by email.' },
    ...COMMON_TAIL('admin'),
  ],
};
