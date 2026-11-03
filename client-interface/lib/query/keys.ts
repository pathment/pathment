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
    /** Keyed by user so switching accounts cannot reuse another mentee's clans. */
    memberships: (userId: string) => ['clan', 'memberships', userId] as const,
    detail: (clanId: string) => ['clan', 'detail', clanId] as const,
    publicJoin: (clanId: string) => ['clan', 'public-join', clanId] as const,
    joinRequests: (clanId: string, status = 'pending') =>
      ['clan', 'join-requests', clanId, status] as const,
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

  // External courses (Buildment): connection status, assignable list, per-task enrollment.
  courses: {
    all: ['courses'] as const,
    status: ['courses', 'status'] as const,
    list: ['courses', 'list'] as const,
    enrollment: (taskId: string) => ['courses', 'enrollment', taskId] as const,
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
    taskProgress: (taskId: string) => ['mentor', 'task-progress', taskId] as const,
    library: ['mentor', 'library'] as const,
    talks: (search?: string, categoryId?: string) => ['mentor', 'talks', search || '', categoryId || ''] as const,
    talkCategories: ['mentor', 'talk-categories'] as const,
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
    /** A clan's scenarios with their groups, and one group with its progress. */
    groupDiscussions: (clanId: string | null) => ['mentor', 'group-discussions', clanId ?? ''] as const,
    groupDiscussion: (id: string) => ['mentor', 'group-discussion', id] as const,
    /** How a mentee took part in the group behind one of their tasks. */
    discussionParticipation: (taskId: string) => ['mentor', 'discussion-participation', taskId] as const,
  },

  mentee: {
    all: ['mentee'] as const,
    profile: (menteeId: string) => ['mentee', 'profile', menteeId] as const,
    activity: (menteeId: string, days: number) => ['mentee', 'activity', menteeId, days] as const,
    tasks: (menteeId: string, clanId?: string | null) => ['mentee', 'tasks', menteeId, clanId ?? ''] as const,
    enrollments: (menteeId: string) => ['mentee', 'enrollments', menteeId] as const,
    matches: (mentorId: string, menteeId: string) => ['mentee', 'matches', mentorId, menteeId] as const,
    schedule: (menteeId: string, clanId?: string | null) => ['mentee', 'schedule', menteeId, clanId ?? ''] as const,
    /** Today's blocks and their counts — the compact read for clan review. */
    planStrip: (menteeId: string, clanId?: string | null) => ['mentee', 'plan-strip', menteeId, clanId ?? ''] as const,
    /** The signed-in mentee's own group discussions. */
    groupDiscussions: ['mentee', 'group-discussions'] as const,
    groupDiscussion: (id: string) => ['mentee', 'group-discussion', id] as const,
    /** Who is in a group's chat; mentors read it through the same endpoint. */
    groupDiscussionMembers: (id: string) => ['mentee', 'group-discussion-members', id] as const,
  },

  /** Selection pools: the pre-clan qualifying round. */
  pool: {
    all: ['pools'] as const,
    list: (status?: string | null, programId?: string | null) => ['pools', 'list', status ?? '', programId ?? ''] as const,
    detail: (id: string) => ['pools', id] as const,
    options: (programId?: string | null) => ['pools', 'options', programId ?? ''] as const,
    assignments: (id: string) => ['pools', id, 'assignments'] as const,
    scores: (id: string) => ['pools', id, 'scores'] as const,
  },

  /** What a candidate sees of their own selection round. */
  candidate: {
    all: ['candidate'] as const,
    pools: ['candidate', 'pools'] as const,
    tasks: ['candidate', 'tasks'] as const,
    task: (taskId: string) => ['candidate', 'tasks', taskId] as const,
  },

  /** The handover pool: mentees offered out of one clan and taken into another. */
  handoverPool: {
    all: ['handover-pool'] as const,
    list: (status: string) => ['handover-pool', 'list', status] as const,
    overview: (programId?: string | null) => ['handover-pool', 'overview', programId ?? ''] as const,
    claimableClans: ['handover-pool', 'claimable-clans'] as const,
  },

  me: {
    activity: (days: number) => ['me', 'activity', days] as const,
    programs: ['me', 'programs'] as const,
    roadmaps: (clanId?: string | null) => ['me', 'roadmaps', clanId ?? ''] as const,
    progress: (clanId?: string | null) => ['me', 'progress', clanId ?? ''] as const,
    dailyLog: (clanId?: string | null) => ['me', 'daily-log', clanId ?? ''] as const,
    tasks: (params: Record<string, unknown>) => ['me', 'tasks', params] as const,
    taskStats: (enrollmentId: string | null, clanId?: string | null) =>
      ['me', 'task-stats', enrollmentId ?? 'all', clanId ?? ''] as const,
    meetings: ['me', 'meetings'] as const,
    task: (taskId: string, clanId?: string | null) => ['me', 'task', taskId, clanId ?? null] as const,
    bookable: ['me', 'bookable'] as const,
    enrollments: (menteeId: string) => ['me', 'enrollments', menteeId] as const,
    publicPrograms: ['me', 'public-programs'] as const,
    /** Which clans the signed-in mentee is paused in. Read on every mentee page. */
    pauseState: ['me', 'pause-state'] as const,
    /** Their clans, the clans they could ask to move to, and their own asks. */
    clanChange: ['me', 'clan-change'] as const,
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
    activity: (days: number, programId?: string | null) =>
      ['admin', 'activity', days, programId ?? ''] as const,
    storage: ['admin', 'storage'] as const,
    moderation: (status: string) => ['admin', 'moderation', status] as const,
    clanRequests: ['admin', 'clan-requests'] as const,
    cohorts: (programId?: string) => ['admin', 'cohorts', programId ?? 'all'] as const,
    orgInsights: ['admin', 'org-insights'] as const,
    orgRoadmaps: ['admin', 'org-roadmaps'] as const,
    clanHealth: ['admin', 'clan-health'] as const,
    aiConnections: ['admin', 'ai-connections'] as const,
    apps: ['admin', 'apps'] as const,
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
    programCompletion: (programId: string) => ['admin', 'program-completion', programId] as const,
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
    members: (type: string, id: string, page = '') => ['community', 'members', type, id, page] as const,
    leaderboard: (type: string, id: string, period: string) =>
      ['community', 'leaderboard', type, id, period] as const,
  },

  public: {
    program: (id: string) => ['public', 'program', id] as const,
    clanJoin: (token: string, viewer: string) => ['public', 'clan-join', token, viewer] as const,
  },

  announcements: ['announcements'] as const,

  /** Reference geography — the same for every viewer, so it caches hard. */
  geo: {
    countries: ['geo', 'countries'] as const,
    states: (country: string) => ['geo', 'states', country] as const,
    cities: (country: string, state: string, q: string) => ['geo', 'cities', country, state, q] as const,
  },

  // Platform console (operator surface) - all cross-workspace.
  platform: {
    all: ['platform'] as const,
    me: ['platform', 'me'] as const,
    metrics: ['platform', 'metrics'] as const,
    admins: (includeRevoked: boolean) => ['platform', 'admins', includeRevoked] as const,
    audit: (params: Record<string, unknown>) => ['platform', 'audit', params] as const,
    auditActions: ['platform', 'audit-actions'] as const,
    organizations: (params: Record<string, unknown>) => ['platform', 'organizations', params] as const,
    organization: (id: string) => ['platform', 'organization', id] as const,
    organizationMembers: (id: string, params: Record<string, unknown>) => ['platform', 'organization', id, 'members', params] as const,
    organizationAudit: (id: string, page: number) => ['platform', 'organization', id, 'audit', page] as const,
    plans: ['platform', 'plans'] as const,
    billingRequests: ['platform', 'billing-requests'] as const,
    overridesReport: ['platform', 'overrides-report'] as const,
    leads: (params: Record<string, unknown>) => ['platform', 'leads', params] as const,
    feedback: (params: Record<string, unknown>) => ['platform', 'feedback', params] as const,
    users: (q: string) => ['platform', 'users', q] as const,
    user: (id: string) => ['platform', 'user', id] as const,
    ops: ['platform', 'ops'] as const,
    apps: ['platform', 'apps'] as const,
    storage: ['platform', 'storage'] as const,
    featureUsage: (id: string, days: number) => ['platform', 'organization', id, 'feature-usage', days] as const,
    slugCheck: (slug: string) => ['platform', 'slug-check', slug] as const,
  },
} as const;
