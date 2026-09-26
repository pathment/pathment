export interface AdminWorkspaceTab {
  href: string;
  label: string;
  permission?: string;
}
export const adminWorkspaces: { label: string; tabs: AdminWorkspaceTab[] }[] = [
  {
    label: "Admissions",
    tabs: [
      {
        href: "/admin/cohorts",
        label: "Intake",
        permission: "intake.manage",
      },
      {
        href: "/admin/assessments",
        label: "Assessments",
        permission: "assessment.author",
      },
      {
        href: "/admin/invites",
        label: "Invites",
        permission: "invite.create",
      },
    ],
  },
  {
    label: "People",
    tabs: [
      {
        href: "/admin/clans",
        label: "Clans",
        permission: "clan.create",
      },
      {
        href: "/admin/users/mentors",
        label: "Mentors",
        permission: "user.manage",
      },
      {
        href: "/admin/users/mentees",
        label: "Mentees",
        permission: "user.manage",
      },
      {
        href: "/admin/enrollment/overview",
        label: "Enrollments",
        permission: "mentee.manage",
      },
      {
        href: "/admin/requests",
        label: "Clan requests",
        permission: "mentee.manage",
      },
    ],
  },
  {
    label: "Learning",
    tabs: [
      {
        href: "/admin/programs/list",
        label: "Programs",
        permission: "program.manage",
      },
      {
        href: "/admin/roadmaps",
        label: "Roadmaps",
        permission: "roadmap.author",
      },
      {
        href: "/admin/schedules",
        label: "Schedules",
        permission: "program.manage",
      },
      {
        href: "/admin/library",
        label: "Library",
      },
      {
        href: "/admin/mentor-spec",
        label: "Handbook",
      },
    ],
  },
  {
    label: "Recognition",
    tabs: [
      {
        href: "/admin/certificates",
        label: "Certificates",
        permission: "program.manage",
      },
      {
        href: "/admin/promotions",
        label: "Co-mentor nominations",
        permission: "user.manage",
      },
      {
        href: "/admin/top-performers",
        label: "Top performers",
        permission: "user.manage",
      },
      {
        href: "/admin/rewards",
        label: "Rewards",
        permission: "gamification.manage",
      },
      { href: "/admin/badges", label: "Badges", permission: "gamification.manage" },
    ],
  },
  {
    label: "Community",
    tabs: [
      {
        href: "/admin/announcements",
        label: "Announcements",
        permission: "community.moderate",
      },
      {
        href: "/admin/meetings",
        label: "Live meetings",
        permission: "analytics.view",
      },
      {
        href: "/admin/moderation",
        label: "Moderation",
        permission: "community.moderate",
      },
      {
        href: "/admin/feedback",
        label: "Feedback",
        permission: "feedback.manage",
      },
    ],
  },
  {
    label: "Insights",
    tabs: [
      {
        href: "/admin/insights",
        label: "Overview",
        permission: "analytics.view",
      },
      {
        href: "/admin/review-records",
        label: "Review records",
        permission: "analytics.view",
      },
      {
        href: "/admin/activity",
        label: "Activity",
        permission: "analytics.view",
      },
      {
        href: "/admin/follow-ups",
        label: "Follow-ups",
        permission: "analytics.view",
      },
    ],
  },
  {
    label: "Administration",
    tabs: [
      {
        href: "/admin/access",
        label: "Roles & access",
        permission: "access.manage",
      },
      {
        href: "/admin/emails",
        label: "Email queue",
        permission: "system.settings",
      },
      {
        href: "/admin/changelog",
        label: "What's new",
        permission: "system.settings",
      },
    ],
  },
];
export function matchesAdminTab(pathname: string, href: string) {
  if (
    href === "/admin/programs/list" &&
    pathname.startsWith("/admin/programs/")
  )
    return true;
  if (href === "/admin/users/mentors" && pathname.startsWith("/admin/mentors/"))
    return true;
  if (href === "/admin/users/mentees" && pathname.startsWith("/admin/mentees/"))
    return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
