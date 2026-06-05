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
  { target: '[data-tour="notifications"]', title: 'Notifications', body: 'Real-time updates — new tasks, messages, blockers and reviews — show up here the moment they happen.' },
  { target: `a[href="/${role}/settings"]`, title: 'Settings & themes', body: 'Edit your profile and skills, and pick your color vibe + light/dark mode in the Appearance tab.' },
  { target: null, title: "You're all set 🎉", body: 'That’s the quick tour. You can replay it anytime from the “?” button at the top of the sidebar.' },
];

export const WALKTHROUGHS: Record<UserRole, TourStep[]> = {
  mentor: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick 60-second tour of your mentor workspace. You can skip anytime — and replay it later.' },
    { target: 'a[href="/mentor/dashboard"]', title: 'Cockpit', body: 'Your home base. See who needs attention today, your cohort’s health, and jump straight in.' },
    { target: '[data-tour="group:mentees"]', title: 'My Mentees', body: 'Everyone you mentor lives in this section — your mentee directory, work approvals, cohort review, at-risk, and promotions.' },
    { target: '[data-tour="group:teaching"]', title: 'Teaching', body: 'Build and run the curriculum: roadmaps, your programs, schedules, reports, and progress scores.' },
    ...COMMON_TAIL('mentor'),
  ],
  mentee: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick tour of your learning space. You can skip anytime — and replay it later.' },
    { target: 'a[href="/mentee/dashboard"]', title: 'This Week', body: 'Your single most important next action, front and center — so you always know what to do next.' },
    { target: 'a[href="/mentee/tasks"]', title: 'My Tasks', body: 'Everything assigned to you. Open a task and submit your work right here.' },
    { target: 'a[href="/mentee/meetings"]', title: 'My Mentor', body: 'Book 1:1s from your mentor’s open times and keep in touch.' },
    { target: '[data-tour="group:mentee-progress"]', title: 'Progress', body: 'Your daily log, blockers (counted fairly toward progress, not against you), overall progress, and gamification all live here.' },
    ...COMMON_TAIL('mentee'),
  ],
  admin: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick tour of your admin console. You can skip anytime — and replay it later.' },
    { target: 'a[href="/admin/dashboard"]', title: 'Dashboard', body: 'Org-wide health at a glance — programs, clans, and who’s at risk.' },
    { target: '[data-tour="group:admissions"]', title: 'Admissions', body: 'Run intake end-to-end: cohorts & applications, assessments you build, and registration invites — all in one section.' },
    { target: '[data-tour="group:people"]', title: 'People & Clans', body: 'Enrollments, clans (the mentor-led groups), the mentor/mentee directories, and clan change requests.' },
    { target: '[data-tour="group:analytics"]', title: 'Analytics', body: 'Insights with the fairness lens (absolute vs. credited progress) and platform activity.' },
    ...COMMON_TAIL('admin'),
  ],
};
