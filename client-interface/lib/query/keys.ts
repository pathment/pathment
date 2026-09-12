/**
 * Every query key in one place.
 *
 * Keys are hierarchical, so a prefix invalidates everything beneath it:
 * `invalidateQueries({ queryKey: qk.mentee.all })` clears every mentee query,
 * while `qk.mentee.profile(id)` clears one. Define keys here rather than inline
 * so invalidation targets are discoverable and typos cannot silently create a
 * second cache entry.
 */
export const qk = {
  auth: {
    permissions: ['auth', 'permissions'] as const,
    twoFactor: ['auth', '2fa-status'] as const,
  },

  profile: {
    appearance: ['profile', 'appearance'] as const,
    me: ['profile', 'me'] as const,
  },

  clan: {
    all: ['clan'] as const,
    memberships: ['clan', 'memberships'] as const,
    detail: (clanId: string) => ['clan', 'detail', clanId] as const,
  },

  changelog: {
    feed: (role: string) => ['changelog', 'feed', role] as const,
  },

  messaging: {
    all: ['messaging'] as const,
    notifications: ['messaging', 'notifications'] as const,
    recentNotifications: (limit: number) => ['messaging', 'notifications', 'recent', limit] as const,
    conversations: (archived: boolean) => ['messaging', 'conversations', archived] as const,
    /**
     * Sidebar badge only — the derived unread total, not the conversation list.
     * Keyed by PORTAL: the conversation list is now scoped to the hat the user
     * has on, so a mentee-portal count and a mentor-portal count are different
     * numbers and must not share one cache entry.
     */
    unreadCount: (portal: string) => ['messaging', 'unread-count', portal] as const,
    mentorDocuments: ['messaging', 'mentor-documents'] as const,
  },

  mentor: {
    all: ['mentor'] as const,
    cohort: ['mentor', 'cohort'] as const,
    approvalsCount: ['mentor', 'approvals-count'] as const,
    approvals: ['mentor', 'approvals'] as const,
    mentees: ['mentor', 'mentees'] as const,
    programs: ['mentor', 'programs'] as const,
    programDetail: (programId: string) => ['mentor', 'program', programId] as const,
    roadmaps: ['mentor', 'roadmaps'] as const,
    tracks: (menteeId: string) => ['mentor', 'tracks', menteeId] as const,
    library: ['mentor', 'library'] as const,
    rewards: ['mentor', 'rewards'] as const,
    scheduleTemplates: ['mentor', 'schedule-templates'] as const,
    feedbackSnippets: ['mentor', 'feedback-snippets'] as const,
    promotions: ['mentor', 'promotions'] as const,
    transfersConfig: ['mentor', 'transfers-config'] as const,
    spec: ['mentor', 'spec'] as const,
    taskDetail: (taskId: string) => ['mentor', 'task', taskId] as const,
    clanPerformance: (clanId: string) => ['mentor', 'clan-performance', clanId] as const,
    autoReply: ['mentor', 'auto-reply'] as const,
    availability: ['mentor', 'availability'] as const,
    meetings: ['mentor', 'meetings'] as const,
    taskStats: (mentorId: string) => ['mentor', 'task-stats', mentorId] as const,
    pendingReviews: (mentorId: string) => ['mentor', 'pending-reviews', mentorId] as const,
  },

  mentee: {
    all: ['mentee'] as const,
    profile: (menteeId: string) => ['mentee', 'profile', menteeId] as const,
    activity: (menteeId: string, days: number) => ['mentee', 'activity', menteeId, days] as const,
    tasks: (menteeId: string) => ['mentee', 'tasks', menteeId] as const,
    enrollments: (menteeId: string) => ['mentee', 'enrollments', menteeId] as const,
    matches: (mentorId: string, menteeId: string) => ['mentee', 'matches', mentorId, menteeId] as const,
    schedule: (menteeId: string) => ['mentee', 'schedule', menteeId] as const,
  },

  me: {
    activity: (days: number) => ['me', 'activity', days] as const,
    programs: ['me', 'programs'] as const,
    roadmaps: ['me', 'roadmaps'] as const,
    progress: ['me', 'progress'] as const,
    dailyLog: ['me', 'daily-log'] as const,
    tasks: (params: Record<string, unknown>) => ['me', 'tasks', params] as const,
    taskStats: (enrollmentId: string | null) => ['me', 'task-stats', enrollmentId ?? 'all'] as const,
    meetings: ['me', 'meetings'] as const,
    task: (taskId: string) => ['me', 'task', taskId] as const,
    bookable: ['me', 'bookable'] as const,
    enrollments: (menteeId: string) => ['me', 'enrollments', menteeId] as const,
    publicPrograms: ['me', 'public-programs'] as const,
    program: (programId: string) => ['me', 'program', programId] as const,
    programEnrollment: (programId: string, menteeId: string) =>
      ['me', 'program-enrollment', programId, menteeId] as const,
  },

  admin: {
    all: ['admin'] as const,
    dashboard: ['admin', 'dashboard'] as const,
    clans: ['admin', 'clans'] as const,
    programs: ['admin', 'programs'] as const,
    mentors: ['admin', 'mentors'] as const,
    mentees: ['admin', 'mentees'] as const,
    activity: (days: number) => ['admin', 'activity', days] as const,
    moderation: (status: string) => ['admin', 'moderation', status] as const,
    clanRequests: ['admin', 'clan-requests'] as const,
    cohorts: (programId?: string) => ['admin', 'cohorts', programId ?? 'all'] as const,
    orgInsights: ['admin', 'org-insights'] as const,
    orgRoadmaps: ['admin', 'org-roadmaps'] as const,
    clanHealth: ['admin', 'clan-health'] as const,
    aiConnections: ['admin', 'ai-connections'] as const,
    clanList: (page: number, limit: number, search: string, programId: string) =>
      ['admin', 'clans', page, limit, search, programId] as const,
    menteeList: (page: number, limit: number, search: string) =>
      ['admin', 'mentees', page, limit, search] as const,
    mentorList: (page: number, limit: number, search: string) =>
      ['admin', 'mentors', page, limit, search] as const,
    mentorProfile: (id: string) => ['admin', 'mentor-profile', id] as const,
    menteeProfileDetail: (id: string) => ['admin', 'mentee-profile', id] as const,
    programList: (params: Record<string, unknown>) => ['admin', 'program-list', params] as const,
    enrollmentList: (params: Record<string, unknown>) => ['admin', 'enrollment-list', params] as const,
    enrollmentStats: ['admin', 'enrollment-stats'] as const,
    cohort: (cohortId: string) => ['admin', 'cohort', cohortId] as const,
    program: (programId: string) => ['admin', 'program', programId] as const,
    programEnrollments: (programId: string) => ['admin', 'program-enrollments', programId] as const,
    pendingMatches: (programId: string) => ['admin', 'pending-matches', programId] as const,
    matchSuggestions: (enrollmentIds: string[]) => ['admin', 'match-suggestions', enrollmentIds] as const,
    availableMentors: (page: number, search: string) => ['admin', 'available-mentors', page, search] as const,
    invites: (params: Record<string, unknown>) => ['admin', 'invites', params] as const,
    placementOptions: ['admin', 'placement-options'] as const,
    applications: (cohortId: string) => ['admin', 'applications', cohortId] as const,
  },

  community: {
    all: ['community'] as const,
    spaces: ['community', 'spaces'] as const,
    feed: (params: Record<string, unknown>) => ['community', 'feed', params] as const,
    people: (type: string, id: string) => ['community', 'people', type, id] as const,
    members: (type: string, id: string) => ['community', 'members', type, id] as const,
    leaderboard: (type: string, id: string, period: string) =>
      ['community', 'leaderboard', type, id, period] as const,
  },

  public: {
    program: (id: string) => ['public', 'program', id] as const,
  },

  certificates: {
    all: ['certificates'] as const,
    templates: ['certificates', 'templates'] as const,
    template: (id: string) => ['certificates', 'template', id] as const,
    qualifications: (templateId: string, programId: string) =>
      ['certificates', 'qualifications', templateId, programId] as const,
    aiStatus: (templateId: string, runId?: string | null) =>
      ['certificates', 'ai-status', templateId, runId ?? 'latest'] as const,
  },

  announcements: ['announcements'] as const,
} as const;
