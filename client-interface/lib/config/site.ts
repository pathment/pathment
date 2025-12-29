export const siteConfig = {
  name: 'Pathment',
  description: 'AI-Powered Mentorship Platform',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  links: {
    github: 'https://github.com/Sheryar-Ahmed/pathment',
  },
};

export const navigationConfig = {
  admin: [
    {
      title: 'Dashboard',
      href: '/admin/dashboard',
      icon: 'LayoutDashboard',
    },
    {
      title: 'Programs',
      href: '/admin/programs/list',
      icon: 'BookOpen',
    },
    {
      title: 'Enrollment',
      href: '/admin/enrollment/overview',
      icon: 'Users',
    },
    {
      title: 'Matching',
      href: '/admin/matching/mentor-assignment',
      icon: 'UserCheck',
    },
  ],
  mentor: [
    {
      title: 'Dashboard',
      href: '/mentor/dashboard',
      icon: 'LayoutDashboard',
    },
    {
      title: 'Mentees',
      href: '/mentor/mentees',
      icon: 'Users',
    },
    {
      title: 'Tasks',
      href: '/mentor/tasks/assign',
      icon: 'CheckSquare',
    },
    {
      title: 'Review Queue',
      href: '/mentor/review-queue',
      icon: 'Inbox',
    },
  ],
  mentee: [
    {
      title: 'Dashboard',
      href: '/mentee/dashboard',
      icon: 'LayoutDashboard',
    },
    {
      title: 'Programs',
      href: '/mentee/programs/enroll',
      icon: 'BookOpen',
    },
    {
      title: 'Tasks',
      href: '/mentee/tasks/list',
      icon: 'CheckSquare',
    },
    {
      title: 'Feedback',
      href: '/mentee/feedback',
      icon: 'MessageSquare',
    },
  ],
};
