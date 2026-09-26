/** Keep deep links stable while grouping related learner tools. */
export const menteeWorkspaces = [
  {
    label: "My learning",
    tabs: [
      { href: "/mentee/tasks", label: "Tasks" },
      { href: "/mentee/roadmap", label: "Roadmap" },
      { href: "/mentee/library", label: "Library" },
    ],
  },
  {
    label: "My progress",
    tabs: [
      { href: "/mentee/progress", label: "Overview" },
      { href: "/mentee/daily-log", label: "Daily log" },
      { href: "/mentee/gamification", label: "XP & badges" },
      { href: "/mentee/certificates", label: "Certificates" },
    ],
  },
  {
    label: "My support",
    tabs: [
      { href: "/mentee/meetings", label: "My mentor" },
      { href: "/mentee/blockers", label: "Roadblocks" },
    ],
  },
  {
    label: "Community",
    tabs: [
      { href: "/mentee/community", label: "Conversations" },
      { href: "/mentee/announcements", label: "Announcements" },
    ],
  },
];
