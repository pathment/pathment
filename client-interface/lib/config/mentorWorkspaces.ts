/** Related tools share navigation while keeping existing deep links. */
export const mentorWorkspaces = [
  { label: 'My mentees', tabs: [
    { href: '/mentor/mentees', label: 'My mentees' },
    { href: '/mentor/clan-team', label: 'Clan team' },
  ] },
  { label: 'Curriculum', tabs: [
    { href: '/mentor/roadmaps', label: 'Roadmaps' },
    { href: '/mentor/interviews', label: 'Interviews' },
    { href: '/mentor/quizzes', label: 'Quizzes' },
    { href: '/mentor/programs', label: 'Programs' },
    { href: '/mentor/library', label: 'Library' },
    { href: '/mentor/talks', label: 'Talks' },
  ] },
  { label: 'Recognition', tabs: [
    { href: '/mentor/top-performers', label: 'Top performers' },
    { href: '/mentor/promotions', label: 'Promotions' },
    { href: '/mentor/certificates', label: 'Certificates' },
    { href: '/mentor/rewards', label: 'Rewards' },
  ] },
  { label: 'Insights', tabs: [
    { href: '/mentor/reports', label: 'Reports' },
    { href: '/mentor/scores', label: 'Progress scores' },
    { href: '/mentor/leaderboard', label: 'Leaderboard' },
  ] },
  { label: 'Community', tabs: [
    { href: '/mentor/community', label: 'Community' },
    { href: '/mentor/announcements', label: 'Announcements' },
  ] },
];
export const matchesMentorPath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
