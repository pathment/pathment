import type {
  Mentee,
  ProgramHealth,
  AIKey,
  AIRouting,
  TaskTemplate,
  TrackTemplate,
  FeedbackTemplate,
  Notification,
  Roadmap,
  RoadmapProgress,
  Document,
  Insight,
  MessageTemplate,
  ScheduledMeeting,
  Schedule,
  ScheduleTemplate,
  DailyLogEntry,
  AvailabilitySlot,
  ReleaseNote,
  Collaborator,
} from '@/lib/types';

export const CURRENT_MENTOR = {
  name: 'Sarah Chen',
  avatar: 'SC',
  role: 'Senior Mentor',
  program: 'Full-Stack Web Development',
  acceptingMentees: true,
  maxMentees: 8,
};

export const MENTEES: Mentee[] = [
  {
    id: 1,
    name: 'Aisha Khan',
    avatar: 'AK',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 72,
    relativeProgress: 88,
    momentum: 'up',
    risk: 'low',
    lastActive: '2h ago',
    pendingApprovals: 2,
    openBlockers: 1,
    onTimeRate: 84,
    sentiment: 'positive',
    joined: 'Jan 2025',
    location: 'Toronto, CA',
    email: 'aisha.k@email.com',
    aiSummary:
      'Strong, steady momentum. Two submissions are waiting on you. One open technical blocker on JWT auth — she flagged it early rather than stalling, which fits her pattern. Relative progress is well above absolute because she carried a full-time job deadline last week.',
    aiSignals: [
      '5 of last 6 tasks on time',
      'Logged a job-load friction event last week',
      'Opened blocker within 1 day of getting stuck',
    ],
    personality: { consistency: 85, communication: 78, resilience: 92, independence: 70 },
    tasks: [
      { id: 101, title: 'Build REST API for blog platform', type: 'project', status: 'submitted', due: 'Today', submittedAt: '2h ago', track: 'Core', brief: 'Implement a CRUD API with auth-protected routes and pagination.', criteria: ['Repo link present', 'Auth on write routes', 'Pagination working', 'README with setup'], artifact: 'github.com/aisha-k/blog-api' },
      { id: 102, title: 'Read: Database Indexing Strategies', type: 'reading', status: 'in_progress', due: 'Tomorrow', track: 'Core' },
      { id: 103, title: 'Quiz: SQL Fundamentals', type: 'quiz', status: 'completed', due: 'Yesterday', score: 92, track: 'Core' },
      { id: 104, title: 'Refactor: extract service layer', type: 'assignment', status: 'submitted', due: 'Today', submittedAt: '40m ago', track: 'Stretch', brief: 'Move business logic out of route handlers into a service layer.', criteria: ['Routes are thin', 'Services unit-tested', 'No logic in controllers'], artifact: 'github.com/aisha-k/blog-api/pull/12', extensionRequested: true },
      { id: 105, title: 'Mindset talk', type: 'discussion', status: 'completed', due: 'Daily', track: 'Talks', slot: 'morning', recurrence: 'daily', score: 100 },
      { id: 110, title: 'Mindset talk reflection', type: 'discussion', status: 'submitted', due: 'Today', submittedAt: '1h ago', track: 'Talks', slot: 'morning', recurrence: 'daily', brief: 'One thing from this morning’s mindset talk you’ll apply today.', artifact: 'notion.so/aisha/mindset' },
      { id: 111, title: 'Dean talk takeaways', type: 'discussion', status: 'submitted', due: 'Today', submittedAt: '20m ago', track: 'Talks', slot: 'dinner', recurrence: 'daily', criteria: ['Posted', 'Replied to a peer'] },
      { id: 106, title: 'Mindset talk', type: 'discussion', status: 'assigned', due: 'Daily', track: 'Habits', slot: 'morning', recurrence: 'daily', brief: 'A short morning talk to set the day’s mindset.' },
      { id: 107, title: 'Engineering talk — fall in love with the craft', type: 'discussion', status: 'assigned', due: 'Daily', track: 'Habits', slot: 'lunch', recurrence: 'daily' },
      { id: 108, title: 'Personal branding block', type: 'assignment', status: 'in_progress', due: 'Fri', track: 'Stretch', slot: 'anytime', brief: 'Spend focused time improving your professional brand.' },
      { id: 109, title: 'Roadmap: Add authentication', type: 'project', status: 'assigned', due: '+7d', track: 'Backend Foundations', roadmapId: 1, roadmapStepId: 13, brief: 'Add authentication to your CRUD API.', criteria: ['Auth on write routes', 'Tokens validated'], effort: 'l' },
    ],
    blockers: [
      { id: 1, title: 'Stuck on JWT refresh-token flow', category: 'technical', severity: 'medium', daysOpen: 2, taskId: 109, taskTitle: 'Roadmap: Add authentication' },
    ],
    delays: [
      { id: 1, task: 'CSS Grid Layout', reason: 'Full-time job release week', kind: 'job', days: 2, accepted: true, date: 'May 21', category: 'external', aiRationale: 'Reason aligns with a recurring job-load pattern; she submitted within 2 days and kept communicating. Reads as a genuine external constraint, not avoidance.' },
    ],
    notes: [
      { id: 1, date: 'May 15', summary: 'Discussed career goals — wants to move into backend. Very motivated, prefers async written feedback.', sentiment: 'positive', nextSteps: ['Share backend track', 'Pair on auth Thursday'], by: 'Sarah Chen', kind: '1:1' },
    ],
  },
  {
    id: 2,
    name: 'Diego Morales',
    avatar: 'DM',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 41,
    relativeProgress: 79,
    momentum: 'up',
    risk: 'watch',
    riskReason: 'Behind on plan, but fighting real constraints',
    lastActive: '1d ago',
    pendingApprovals: 1,
    openBlockers: 2,
    onTimeRate: 58,
    sentiment: 'neutral',
    joined: 'Jan 2025',
    location: 'Lahore, PK',
    email: 'diego.m@email.com',
    aiSummary:
      'Behind on absolute progress, but relative progress is strong — he has logged repeated electricity outages and is on a shared machine. This reads as "struggling despite effort," not disengagement. He still shows up and submits late rather than ghosting. Worth protecting his deadlines, not pushing harder.',
    aiSignals: [
      '3 electricity friction events this month',
      'Submits late but consistently (no skipped tasks)',
      'Replies to nudges within hours',
    ],
    personality: { consistency: 55, communication: 72, resilience: 95, independence: 60 },
    tasks: [
      { id: 201, title: 'Responsive dashboard layout', type: 'project', status: 'submitted', due: '2 days late', submittedAt: '3h ago', late: true, track: 'Core', brief: 'Build a responsive admin dashboard from the provided Figma.', criteria: ['Matches breakpoints', 'No layout shift', 'Accessible nav'], artifact: 'github.com/diego-m/dashboard' },
      { id: 202, title: 'Reading: Flexbox deep-dive', type: 'reading', status: 'in_progress', due: 'Overdue', late: true, track: 'Core' },
      { id: 203, title: 'Quiz: HTML semantics', type: 'quiz', status: 'assigned', due: 'Fri', track: 'Core' },
    ],
    blockers: [
      { id: 1, title: 'Power outages blocking evening work', category: 'access', severity: 'high', daysOpen: 9 },
      { id: 2, title: 'Local dev env breaks on shared PC', category: 'technical', severity: 'medium', daysOpen: 4 },
    ],
    delays: [
      { id: 1, task: 'Responsive dashboard layout', reason: 'Area-wide power cut 6pm–11pm', kind: 'electricity', days: 2, accepted: true, date: 'May 28', category: 'external', aiRationale: 'Third electricity event this month, all in the same evening window — corroborated by his logged location. Strong external-constraint signal; protect the deadline.' },
      { id: 2, task: 'Flexbox deep-dive', reason: 'Shared machine unavailable', kind: 'hardware', days: 1, accepted: true, date: 'May 24', category: 'external', aiRationale: 'Consistent with a shared-hardware constraint he raised in his last 1:1. Low avoidance risk — he still submitted.' },
    ],
    notes: [
      { id: 1, date: 'May 18', summary: 'Shares a laptop with sibling, only has reliable power mornings. Agreed to shift his due dates to mornings his time.', sentiment: 'neutral', nextSteps: ['Shift due times to AM PKT', 'Check in next week'] },
    ],
  },
  {
    id: 3,
    name: 'Priya Nair',
    avatar: 'PN',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 31,
    relativeProgress: 34,
    momentum: 'down',
    risk: 'high',
    riskReason: 'Behind on both, no reason logged, going quiet',
    lastActive: '6d ago',
    pendingApprovals: 0,
    openBlockers: 0,
    onTimeRate: 44,
    sentiment: 'low',
    joined: 'Jan 2025',
    location: 'Bengaluru, IN',
    email: 'priya.n@email.com',
    aiSummary:
      'Disengagement risk. No login for 6 days, two tasks untouched past their start, and no friction or blocker logged to explain it. This is different from Diego — there is effort missing, not just obstacles. Recommend a direct, warm check-in before the deadline blows up. Two automated nudges already went unanswered.',
    aiSignals: [
      'No activity in 6 days',
      'Tasks untouched past start date',
      '2 nudges sent, 0 replies',
      'Sentiment trending down over 3 weeks',
    ],
    personality: { consistency: 40, communication: 38, resilience: 50, independence: 65 },
    tasks: [
      { id: 301, title: 'API integration exercise', type: 'assignment', status: 'assigned', due: 'Overdue', late: true, track: 'Core' },
      { id: 302, title: 'Reading: REST best practices', type: 'reading', status: 'assigned', due: 'Overdue', late: true, track: 'Core' },
      { id: 303, title: 'Quiz: HTTP methods', type: 'quiz', status: 'assigned', due: 'Mon', track: 'Core' },
    ],
    blockers: [],
    delays: [],
    notes: [
      { id: 1, date: 'May 6', summary: 'Quieter than usual. Mentioned feeling behind the cohort. Watch for disengagement.', sentiment: 'low', nextSteps: ['Personal check-in', 'Reassure on pace'], by: 'Sarah Chen', kind: '1:1' },
      { id: 2, date: 'May 20', summary: 'Initial session — anxiety around pace and comparison to peers. Coping strategies discussed; follow-up in 2 weeks.', sentiment: 'neutral', by: 'Dr. Maya Brooks', kind: 'Psychological session' },
    ],
  },
  {
    id: 4,
    name: 'Liam Walsh',
    avatar: 'LW',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 95,
    relativeProgress: 76,
    momentum: 'flat',
    risk: 'low',
    lastActive: '5h ago',
    pendingApprovals: 1,
    openBlockers: 0,
    onTimeRate: 97,
    sentiment: 'positive',
    joined: 'Jan 2025',
    location: 'Dublin, IE',
    email: 'liam.w@email.com',
    aiSummary:
      'Top of the cohort on absolute output and almost always early — but relative progress is lower, which is worth reading carefully: he has no logged friction, so he may simply be coasting on easy ground rather than being stretched. Consider adding a stretch track to keep him engaged.',
    aiSignals: [
      '97% on-time, mostly early',
      'No friction logged',
      'Has not opened the stretch tasks offered',
    ],
    personality: { consistency: 96, communication: 65, resilience: 70, independence: 90 },
    tasks: [
      { id: 401, title: 'Auth middleware implementation', type: 'project', status: 'submitted', due: 'Tomorrow', submittedAt: '5h ago', track: 'Core', brief: 'Implement role-based auth middleware with tests.', criteria: ['Role checks', 'Tests pass', 'Handles edge cases'], artifact: 'github.com/liam-w/auth-mw' },
      { id: 402, title: 'Stretch: rate limiting', type: 'assignment', status: 'assigned', due: 'Next week', track: 'Stretch' },
    ],
    blockers: [],
    delays: [],
    notes: [],
  },
  {
    id: 5,
    name: 'Fatima Noor',
    avatar: 'FN',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 64,
    relativeProgress: 71,
    momentum: 'up',
    risk: 'low',
    lastActive: '3h ago',
    pendingApprovals: 0,
    openBlockers: 1,
    onTimeRate: 79,
    sentiment: 'positive',
    joined: 'Jan 2025',
    location: 'Karachi, PK',
    email: 'fatima.n@email.com',
    aiSummary:
      'Solid and improving. One knowledge blocker on async patterns — she has been working at it for a day. No submissions waiting. Momentum is up three weeks running.',
    aiSignals: ['Momentum up 3 weeks', 'On-time rate climbing', 'One self-resolved blocker last week'],
    personality: { consistency: 80, communication: 85, resilience: 75, independence: 72 },
    tasks: [
      { id: 501, title: 'Async/await refactor', type: 'assignment', status: 'in_progress', due: 'Thu', track: 'Core' },
      { id: 502, title: 'Reading: Event loop', type: 'reading', status: 'completed', due: 'Mon', score: 100, track: 'Core' },
    ],
    blockers: [{ id: 1, title: 'Confused by promise chaining vs async/await', category: 'knowledge', severity: 'low', daysOpen: 1 }],
    delays: [],
    notes: [],
  },
  {
    id: 6,
    name: 'Tomas Berg',
    avatar: 'TB',
    program: 'Full-Stack Web',
    level: 'Intermediate',
    week: 6,
    totalWeeks: 12,
    absoluteProgress: 53,
    relativeProgress: 49,
    momentum: 'down',
    risk: 'watch',
    riskReason: 'Slipping on both scales, two late tasks',
    lastActive: '2d ago',
    pendingApprovals: 1,
    openBlockers: 1,
    onTimeRate: 62,
    sentiment: 'neutral',
    joined: 'Jan 2025',
    location: 'Oslo, NO',
    email: 'tomas.b@email.com',
    aiSummary:
      'Drifting. Two late tasks this week and momentum has turned down, but he is still active and responsive. A short check-in now likely prevents this becoming a Priya situation. No strong friction signal yet — ask what changed.',
    aiSignals: ['Momentum turned down this week', '2 late tasks', 'Still logging in (active 2d ago)'],
    personality: { consistency: 60, communication: 70, resilience: 64, independence: 68 },
    tasks: [
      { id: 601, title: 'Form validation library', type: 'project', status: 'submitted', due: '1 day late', submittedAt: '1d ago', late: true, track: 'Core', brief: 'Build a small composable validation library.', criteria: ['Composable rules', 'Tests', 'Docs'], artifact: 'github.com/tomas-b/validate' },
      { id: 602, title: 'Quiz: Regex basics', type: 'quiz', status: 'assigned', due: 'Overdue', late: true, track: 'Core' },
    ],
    blockers: [{ id: 1, title: 'Unclear on validation requirements', category: 'knowledge', severity: 'medium', daysOpen: 3 }],
    delays: [],
    notes: [],
  },
];

/* Clans — groups under a clan leader (mentor), each running a program on a
   schedule-driven roadmap chain. */
export const PROGRAMS: ProgramHealth[] = [
  { id: 1, name: 'Phoenix Clan', program: 'Full-Stack Web Development', leader: 'Sarah Chen', leaderAvatar: 'SC', status: 'amber', cohortSize: 24, completion: 61, onTime: 72, dropoff: 8, extensions: 14, blockers: 9, mentorLoad: '6 mentors · balanced', atRisk: 3 },
  { id: 2, name: 'Atlas Clan', program: 'Data Analytics Foundations', leader: 'Marcus Reed', leaderAvatar: 'MR', status: 'green', cohortSize: 18, completion: 78, onTime: 85, dropoff: 4, extensions: 6, blockers: 3, mentorLoad: '4 mentors · light', atRisk: 1 },
  { id: 3, name: 'Vega Clan', program: 'Product Design Track', leader: 'Lena Ortiz', leaderAvatar: 'LO', status: 'green', cohortSize: 15, completion: 74, onTime: 81, dropoff: 5, extensions: 7, blockers: 4, mentorLoad: '3 mentors · balanced', atRisk: 1 },
  { id: 4, name: 'Titan Clan', program: 'Cloud & DevOps', leader: 'Dane Whitaker', leaderAvatar: 'DW', status: 'red', cohortSize: 21, completion: 38, onTime: 49, dropoff: 19, extensions: 22, blockers: 17, mentorLoad: '3 mentors · overloaded', atRisk: 7 },
  { id: 5, name: 'Nova Clan', program: 'Mobile Engineering', leader: 'Priya Raman', leaderAvatar: 'PR', status: 'amber', cohortSize: 16, completion: 56, onTime: 68, dropoff: 9, extensions: 11, blockers: 6, mentorLoad: '4 mentors · balanced', atRisk: 2 },
];

// The mentee currently signed in (mentee app uses Aisha's view)
export const CURRENT_MENTEE = MENTEES[0];

/* Which mentees are on which roadmap, and the step they're on. */
export const SEED_ROADMAP_PROGRESS: RoadmapProgress[] = [
  // Aisha on Backend Foundations, step 3 (auth) — in her "anytime" slot's chain
  { roadmapId: 1, menteeId: 1, currentStep: 2, startedAt: 'Apr 2025', slot: 'anytime' },
  { roadmapId: 90, menteeId: 2, currentStep: 0, startedAt: 'May 2025', slot: 'anytime' },
];

/* ----------------------------------------------------------------
   Seed notifications (brief §7.3) — mentor inbox + mentee inbox.
----------------------------------------------------------------- */
export const SEED_NOTIFICATIONS: Notification[] = [
  { id: 9001, role: 'mentor', kind: 'review', title: '2 submissions waiting', body: 'Aisha Khan submitted 2 tasks for review.', at: '2h ago', menteeId: 1, to: '/mentor/approvals' },
  { id: 9002, role: 'mentor', kind: 'friction', title: 'Diego logged an electricity outage', body: 'Area-wide power cut — third this month.', at: '5h ago', menteeId: 2, to: '/mentor/mentee/2' },
  { id: 9003, role: 'mentor', kind: 'blocker', title: 'Priya has gone quiet', body: 'No activity in 6 days, 2 nudges unanswered.', at: '1d ago', menteeId: 3, to: '/mentor/mentee/3' },
  { id: 9101, role: 'mentee', kind: 'nudge', title: 'Gentle nudge from Pathment', body: 'Your "Database Indexing" reading is due tomorrow — you\'ve got this.', at: '3h ago', to: '/mentee/task/102' },
  { id: 9102, role: 'mentee', kind: 'meeting', title: '1:1 with Sarah on Thursday', body: 'Bring your auth questions.', at: '1d ago' },
  { id: 9201, role: 'admin', kind: 'system', title: 'Cloud & DevOps needs attention', body: '19% drop-off, 7 at-risk mentees.', at: '4h ago', to: '/admin/health' },
];

/* ----------------------------------------------------------------
   AI "bring your own key" seed (brief §7 + §8.1 mentor settings)
   One key is connected out of the box so the feature routing reads
   as live; the mentor can add OpenAI / Anthropic / others.
----------------------------------------------------------------- */
export const DEFAULT_AI_KEYS: AIKey[] = [
  {
    id: 'key_groq',
    provider: 'groq',
    label: 'Groq — fast summaries',
    keyMasked: 'gsk_••••••••7f3a',
    model: 'llama-3.3-70b',
    status: 'connected',
    addedAt: 'May 20',
  },
];

export const DEFAULT_AI_ROUTING: AIRouting = {
  summary: 'key_groq',
  delay: 'key_groq',
  atrisk: 'key_groq',
  nudge: 'key_groq',
  stall: 'key_groq',
  coaching: null,
  feedback: null,
};

/* ----------------------------------------------------------------
   Task & track template library (brief §5) — the reusable lane.
----------------------------------------------------------------- */
export const TASK_TEMPLATES: TaskTemplate[] = [
  { id: 'tt_hooks', title: 'Build a custom React hook', type: 'project', brief: 'Create a reusable hook (e.g. useLocalStorage) with tests.', defaultEffort: 'm', criteria: ['Repo / link present', 'Uses useState + useEffect correctly', 'Includes unit tests'], defaultDueOffsetDays: 7 },
  { id: 'tt_sql', title: 'SQL fundamentals quiz', type: 'quiz', brief: 'Multiple-choice quiz on joins, indexing and aggregation.', defaultEffort: 's', criteria: ['Score ≥ 80%'], defaultDueOffsetDays: 3 },
  { id: 'tt_rest', title: 'Reading: REST best practices', type: 'reading', brief: 'Read the REST API design guide and note 3 takeaways.', defaultEffort: 'xs', criteria: ['Marked complete', 'Reflection note'], defaultDueOffsetDays: 3 },
  { id: 'tt_auth', title: 'Auth middleware implementation', type: 'project', brief: 'Implement role-based auth middleware with tests.', defaultEffort: 'l', criteria: ['Role checks', 'Tests pass', 'Handles edge cases'], defaultDueOffsetDays: 7 },
  { id: 'tt_async', title: 'Async/await refactor', type: 'assignment', brief: 'Refactor promise chains to async/await.', defaultEffort: 'm', criteria: ['No promise chains remain', 'Error handling preserved'], defaultDueOffsetDays: 5 },
  { id: 'tt_perf', title: 'Profiling & performance tuning', type: 'assignment', brief: 'Profile the app and fix the top bottleneck.', defaultEffort: 'l', criteria: ['Before/after metrics', 'Bottleneck identified', 'Fix verified'], defaultDueOffsetDays: 10 },
];

export const TRACK_TEMPLATES: TrackTemplate[] = [
  { id: 'trt_backend', name: 'Backend Deep-Dive', color: 'brand', taskTemplateIds: ['tt_auth', 'tt_async', 'tt_sql'] },
  { id: 'trt_perf', name: 'Performance Track', color: 'amber', taskTemplateIds: ['tt_perf', 'tt_rest'] },
];

/* Message templates a mentor can pick, tweak, and send to a mentee. Tokens
   {name}, {mentor}, {task} are filled in when composing. */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'mt_checkin',
    label: 'Gentle check-in',
    subject: 'Checking in',
    body: "Hi {name}, just checking in — I noticed things have been a little quiet. No pressure at all; I'm here to help if anything's getting in the way. Want to grab 15 minutes this week?\n\n— {mentor}",
  },
  {
    id: 'mt_offtrack',
    label: 'Drifting off-track',
    subject: 'Let’s get you back on track',
    body: "Hi {name}, I can see a few tasks have slipped and I want to make sure you're set up to succeed. Let's figure out together what's realistic this week — even one small step forward counts. Reply here or book a 1:1 and we'll sort it.\n\n— {mentor}",
  },
  {
    id: 'mt_kudos',
    label: 'Kudos / encouragement',
    subject: 'Nice work',
    body: "Hi {name}, just wanted to say your effort lately has really shown — especially given everything you're juggling. Keep going, you're doing better than the raw numbers suggest.\n\n— {mentor}",
  },
  {
    id: 'mt_overdue',
    label: 'Overdue task nudge',
    subject: 'Quick nudge on {task}',
    body: "Hi {name}, your task \"{task}\" is past its date. If you're stuck or something came up, just log a blocker or reply here — I'd rather know early than have it pile up.\n\n— {mentor}",
  },
];

/* The org-wide DEFAULT schedule — applied to every mentee, overridable per
   individual. Each slot is a "track": a roadmap chain or a recurring task.
   The headline example: Anytime runs Frontend → Backend as a roadmap chain. */
export const DEFAULT_SCHEDULE: Schedule = [
  {
    id: 'morning',
    label: 'Morning',
    time: '8:30 AM',
    kind: 'recurring',
    recurring: { title: 'Mindset talk', type: 'discussion', recurrence: 'daily', brief: 'A short morning talk to set the right mindset for the day.' },
  },
  {
    id: 'lunch',
    label: 'Lunch',
    time: '1:00 PM',
    kind: 'recurring',
    recurring: { title: 'Engineering talk', type: 'discussion', recurrence: 'daily', brief: 'A lunchtime talk to fall in love with engineering.' },
  },
  {
    id: 'dinner',
    label: 'Dinner',
    time: '7:00 PM',
    kind: 'recurring',
    recurring: { title: 'Dean talk', type: 'discussion', recurrence: 'daily', brief: 'An evening talk from the dean.' },
  },
  {
    id: 'anytime',
    label: 'Anytime',
    time: 'Flexible',
    kind: 'roadmap',
    roadmapChain: [2, 1], // Frontend Craft → Backend Foundations
    bookable: true, // mentees can book a 1:1 with their mentor in this slot
  },
];

/* Named, reusable schedule templates. The org publishes one (inheritable by
   any mentor); mentors create their own and assign mentees to them. */
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 1,
    name: 'Org Standard Day',
    description: 'Published by the organization — the day structure every clan can adopt. Fill the slots per mentee after assigning.',
    source: 'org',
    schedule: DEFAULT_SCHEDULE,
    // pure structure: named time slots, no tasks/roadmaps
    blocks: [
      { id: 101, label: 'Morning talk', time: '8:30 AM' },
      { id: 102, label: 'Lunch talk', time: '1:00 PM' },
      { id: 103, label: 'Dinner talk', time: '7:00 PM' },
      { id: 104, label: 'Core work', time: 'Flexible', bookable: true },
    ],
  },
  {
    id: 2,
    name: 'Interview Prep Day',
    description: 'A heads-down structure: deep-work morning, midday session, evening recap.',
    source: 'mentor',
    schedule: DEFAULT_SCHEDULE,
    blocks: [
      { id: 201, label: 'Deep work', time: '9:00 AM' },
      { id: 202, label: 'Session', time: '12:30 PM', bookable: true },
      { id: 203, label: 'Recap', time: '6:00 PM' },
    ],
  },
];

/* The mentor's Calendly-style 1:1 availability — concrete bookable slots. */
export const SEED_AVAILABILITY: AvailabilitySlot[] = [
  { id: 5001, day: 'Tue', time: '10:00 AM', durationMins: 30 },
  { id: 5002, day: 'Tue', time: '2:30 PM', durationMins: 30 },
  { id: 5003, day: 'Wed', time: '11:00 AM', durationMins: 20 },
  { id: 5004, day: 'Thu', time: '4:00 PM', durationMins: 30, taken: true, takenBy: 1 },
  { id: 5005, day: 'Fri', time: '9:30 AM', durationMins: 45 },
];

/* Collaborators — specialists invited onto a mentee. They log attributed data. */
export const SEED_COLLABORATORS: Collaborator[] = [
  { id: 8801, name: 'Dr. Maya Brooks', avatar: 'MB', role: 'Psychologist', menteeId: 3, invitedBy: 'Sarah Chen', status: 'active' },
];

/* Super-admin release notes broadcast to mentors. */
export const SEED_RELEASE_NOTES: ReleaseNote[] = [
  { id: 4001, title: 'New: log 1:1 availability', body: 'You can now publish concrete 1:1 time slots — mentees book directly. Set yours under Schedules → 1:1 availability.', program: undefined, channels: ['in_app', 'email'], at: 'May 28', by: 'Org · Product' },
  { id: 4002, title: 'Reminder: complete weekly reviews by Friday', body: 'Please run your clan review before the weekend so at-risk flags stay current.', program: 'Full-Stack Web Development', channels: ['in_app'], at: 'May 26', by: 'Org · Ops' },
];

/* Seed daily logs for Aisha — a few recent days, one partial, one missed (so
   the backfill flow has something to fill). */
export const SEED_DAILY_LOGS: DailyLogEntry[] = [
  { id: 6001, menteeId: 1, date: 'Mon May 26', dateKey: '2025-05-26', slotsDone: ['morning', 'lunch', 'dinner'], tasksDone: [103], note: 'Mindset talk hit home — kept focus through the SQL quiz.', loggedAt: 'logged Mon' },
  { id: 6002, menteeId: 1, date: 'Tue May 27', dateKey: '2025-05-27', slotsDone: ['morning', 'lunch'], tasksDone: [], note: 'Missed the dean talk, ran late on the API work.', loggedAt: 'logged Tue' },
  { id: 6003, menteeId: 1, date: 'Wed May 28', dateKey: '2025-05-28', slotsDone: ['morning', 'lunch', 'dinner'], tasksDone: [101], note: '', loggedAt: 'logged Wed' },
];

/* A couple of scheduled 1:1s to seed both apps. */
export const SCHEDULED_MEETINGS: ScheduledMeeting[] = [
  { id: 7001, menteeId: 1, kind: '1:1', date: 'Thu, May 29', time: '2:00 PM', durationMins: 30, agenda: 'Auth questions + backend roadmap', status: 'scheduled' },
  { id: 7002, menteeId: 3, kind: '1:1', date: 'Wed, May 28', time: '10:00 AM', durationMins: 20, agenda: 'Re-engage — check what changed', status: 'scheduled' },
];

/* One-click feedback templates shown as chips in the review drawer. The first
   few show by default; mentors can hide any or add their own. */
export const FEEDBACK_TEMPLATES: FeedbackTemplate[] = [
  { id: 'ft_solid', text: 'Solid work — meets the bar. Nice handling of edge cases.' },
  { id: 'ft_tighten', text: 'Good effort. A couple of things to tighten before this is done.' },
  { id: 'ft_mitigation', text: 'Great mitigation given the constraints you logged this week.' },
  { id: 'ft_artifact', text: 'Missing the required artifact — please re-submit with the repo link.' },
  { id: 'ft_tests', text: 'Add tests for the edge cases and this is good to go.', hidden: true },
  { id: 'ft_readme', text: 'Please add a short README so the next reader can run it.', hidden: true },
];

/* ----------------------------------------------------------------
   Roadmaps — ordered sequences. Approving a linked task advances the
   roadmap and assigns the next step. Includes org-published roadmaps
   a mentor can import.
----------------------------------------------------------------- */
export const ROADMAPS: Roadmap[] = [
  {
    id: 1,
    name: 'Backend Foundations',
    description: 'A guided path from HTTP basics to a deployed, auth-protected API.',
    source: 'local',
    skillTags: ['Node', 'APIs', 'Auth'],
    steps: [
      { id: 11, title: 'HTTP & REST fundamentals', type: 'reading', effort: 'xs', dueOffsetDays: 3, criteria: ['Marked complete', 'Reflection note'] },
      { id: 12, title: 'Build a CRUD API', type: 'project', effort: 'l', dueOffsetDays: 7, criteria: ['Repo present', 'CRUD works', 'README'] },
      { id: 13, title: 'Add authentication', type: 'project', effort: 'l', dueOffsetDays: 7, criteria: ['Auth on write routes', 'Tokens validated'] },
      { id: 14, title: 'Deploy & monitor', type: 'assignment', effort: 'm', dueOffsetDays: 5, criteria: ['Deployed URL', 'Basic logging'] },
    ],
  },
  {
    id: 2,
    name: 'Frontend Craft',
    description: 'Component thinking through to a polished, accessible UI.',
    source: 'local',
    skillTags: ['React', 'A11y', 'CSS'],
    steps: [
      { id: 21, title: 'Component composition', type: 'reading', effort: 'xs', dueOffsetDays: 3 },
      { id: 22, title: 'Build a design-system button', type: 'project', effort: 'm', dueOffsetDays: 5 },
      { id: 23, title: 'Accessible forms', type: 'assignment', effort: 'm', dueOffsetDays: 5 },
    ],
  },
  {
    id: 90,
    name: 'Org: Professional Skills',
    description: 'Published by the organization — communication, ownership, and craft.',
    source: 'org',
    published: true,
    skillTags: ['Communication', 'Ownership'],
    steps: [
      { id: 901, title: 'Writing a great PR description', type: 'reading', effort: 'xs', dueOffsetDays: 2 },
      { id: 902, title: 'Give & receive code review', type: 'discussion', effort: 's', dueOffsetDays: 4 },
      { id: 903, title: 'Own an incident write-up', type: 'assignment', effort: 'm', dueOffsetDays: 7 },
    ],
  },
  {
    id: 91,
    name: 'Org: Data Literacy',
    description: 'Published by the organization — read, query and reason with data.',
    source: 'org',
    published: true,
    skillTags: ['SQL', 'Analysis'],
    steps: [
      { id: 911, title: 'SQL joins & aggregation', type: 'quiz', effort: 's', dueOffsetDays: 3 },
      { id: 912, title: 'Build a metrics dashboard', type: 'project', effort: 'l', dueOffsetDays: 10 },
    ],
  },
  /* ---- Famous published curricula any mentor can import & assign ---- */
  {
    id: 92,
    name: 'NeetCode 150',
    description: 'The classic 150-problem DSA roadmap, grouped by pattern — from Arrays & Hashing to Dynamic Programming.',
    source: 'org',
    published: true,
    skillTags: ['DSA', 'Interview Prep', 'Algorithms'],
    steps: [
      { id: 9201, title: 'Arrays & Hashing (9 problems)', type: 'assignment', effort: 'm', dueOffsetDays: 5, criteria: ['All 9 solved', 'Approach noted for each'] },
      { id: 9202, title: 'Two Pointers (5 problems)', type: 'assignment', effort: 's', dueOffsetDays: 4 },
      { id: 9203, title: 'Sliding Window (6 problems)', type: 'assignment', effort: 'm', dueOffsetDays: 5 },
      { id: 9204, title: 'Stack (7 problems)', type: 'assignment', effort: 'm', dueOffsetDays: 5 },
      { id: 9205, title: 'Binary Search (7 problems)', type: 'assignment', effort: 'm', dueOffsetDays: 5 },
      { id: 9206, title: 'Linked List (11 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 7 },
      { id: 9207, title: 'Trees (15 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 9 },
      { id: 9208, title: 'Tries (3 problems)', type: 'assignment', effort: 's', dueOffsetDays: 3 },
      { id: 9209, title: 'Heap / Priority Queue (7 problems)', type: 'assignment', effort: 'm', dueOffsetDays: 5 },
      { id: 9210, title: 'Backtracking (9 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 7 },
      { id: 9211, title: 'Graphs (13 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 9 },
      { id: 9212, title: '1-D Dynamic Programming (12 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 8 },
      { id: 9213, title: '2-D Dynamic Programming (11 problems)', type: 'assignment', effort: 'l', dueOffsetDays: 8 },
      { id: 9214, title: 'Greedy, Intervals & Math (final set)', type: 'project', effort: 'l', dueOffsetDays: 10, criteria: ['Remaining problems solved', 'Mock interview booked'] },
    ],
  },
  {
    id: 93,
    name: 'Grind 75',
    description: 'A focused, time-boxed interview-prep list — the modern Blind 75 successor, ordered by week.',
    source: 'org',
    published: true,
    skillTags: ['DSA', 'Interview Prep'],
    steps: [
      { id: 9301, title: 'Week 1 — Arrays, strings, hashmaps', type: 'assignment', effort: 'm', dueOffsetDays: 7 },
      { id: 9302, title: 'Week 2 — Two pointers & sliding window', type: 'assignment', effort: 'm', dueOffsetDays: 7 },
      { id: 9303, title: 'Week 3 — Stacks, queues & linked lists', type: 'assignment', effort: 'm', dueOffsetDays: 7 },
      { id: 9304, title: 'Week 4 — Trees & graphs', type: 'assignment', effort: 'l', dueOffsetDays: 7 },
      { id: 9305, title: 'Week 5 — Dynamic programming', type: 'assignment', effort: 'l', dueOffsetDays: 7 },
      { id: 9306, title: 'Week 6 — Mixed review + mock interviews', type: 'project', effort: 'l', dueOffsetDays: 7, criteria: ['2 mock interviews done', 'Weak areas logged'] },
    ],
  },
  {
    id: 94,
    name: 'System Design Primer',
    description: 'From fundamentals to designing real systems — published for senior-track mentees.',
    source: 'org',
    published: true,
    skillTags: ['System Design', 'Architecture', 'Scalability'],
    steps: [
      { id: 9401, title: 'Scalability & performance basics', type: 'reading', effort: 's', dueOffsetDays: 4 },
      { id: 9402, title: 'Databases, caching & sharding', type: 'reading', effort: 'm', dueOffsetDays: 5 },
      { id: 9403, title: 'Load balancing & queues', type: 'reading', effort: 'm', dueOffsetDays: 5 },
      { id: 9404, title: 'Design a URL shortener', type: 'project', effort: 'l', dueOffsetDays: 7, criteria: ['Design doc', 'Trade-offs covered'] },
      { id: 9405, title: 'Design a news feed', type: 'project', effort: 'l', dueOffsetDays: 7 },
      { id: 9406, title: 'Mock system-design interview', type: 'discussion', effort: 'm', dueOffsetDays: 5 },
    ],
  },
];

/* ----------------------------------------------------------------
   Documents — org-shared mentor library (guidance + reading).
----------------------------------------------------------------- */
export const DOCUMENTS: Document[] = [
  { id: 1, title: 'The Pathment Mentoring Playbook', category: 'guidance', summary: 'How we mentor: the relative-vs-absolute lens, running a great 1:1, and coaching by working style.', author: 'Org · People team', updatedAt: 'May 12', pinned: true, readMins: 12 },
  { id: 2, title: 'Running an effective weekly review', category: 'guidance', summary: 'A 20-minute standup format: attendance, blockers, fast approvals, who needs you most.', author: 'Sarah Chen', updatedAt: 'May 18', pinned: true, readMins: 6 },
  { id: 3, title: 'Giving feedback that lands', category: 'guidance', summary: 'Specific, kind, actionable. Templates for approve-with-notes and request-changes.', author: 'Org · L&D', updatedAt: 'Apr 30', readMins: 8 },
  { id: 4, title: 'Spotting disengagement early', category: 'reading', summary: 'The difference between struggling-despite-effort and quietly checking out.', author: 'Org · L&D', updatedAt: 'Apr 22', readMins: 5 },
  { id: 5, title: 'Approval rubric — projects', category: 'template', summary: 'The default checklist and quality bar for project submissions.', author: 'Org · Curriculum', updatedAt: 'May 02', readMins: 3 },
  { id: 6, title: 'Code of conduct & escalation', category: 'policy', summary: 'When and how to escalate a struggling or at-risk mentee.', author: 'Org · People team', updatedAt: 'Mar 15', readMins: 4 },
  { id: 7, title: 'Async coaching: doing it over text', category: 'reading', summary: 'Keeping momentum between sessions without scheduling overhead.', author: 'Sarah Chen', updatedAt: 'May 20', readMins: 7 },
];

/* A few mentor-logged insights to seed the per-mentee insight dashboard. */
export const SEED_INSIGHTS: Insight[] = [
  { id: 8001, menteeId: 1, kind: 'personality', note: 'Prefers async written feedback; gets more done when she can process on her own time.', at: 'May 15', by: 'Sarah Chen', source: '1:1' },
  { id: 8002, menteeId: 1, kind: 'analytical', note: 'Strong at decomposition — broke the auth problem into clean sub-steps unprompted.', at: 'May 19', by: 'Sarah Chen', source: 'observation' },
  { id: 8003, menteeId: 2, kind: 'strength', note: 'Remarkable resilience — keeps submitting despite repeated power outages.', at: 'May 18', by: 'Sarah Chen', source: '1:1' },
  { id: 8004, menteeId: 2, kind: 'issue', note: 'Environment instability on shared hardware keeps costing him hours.', at: 'May 24', by: 'Sarah Chen', source: 'text' },
];
