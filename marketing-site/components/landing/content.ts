export const heroFloatingCards = [
  {
    icon: 'users',
    title: 'Smart mentor matching',
    description: 'Pair mentees with the right mentors based on skills, goals, and availability.',
    position: 'top-[4%] left-0 xl:-left-16',
    delay: 0,
  },
  {
    icon: 'chart',
    title: 'Progress analytics',
    description: 'Track milestone completion and program health in one unified view.',
    position: 'top-[2%] right-0 xl:-right-12',
    delay: 0.5,
  },
  {
    icon: 'roadmap',
    title: 'AI-generated roadmaps',
    description: 'Personalized progression paths broken into milestones and actionable tasks.',
    position: 'bottom-[22%] left-0 xl:-left-20',
    delay: 1,
  },
  {
    icon: 'trophy',
    title: 'Gamified progress',
    description: 'Points, badges, and leaderboards keep mentees motivated and visible.',
    position: 'bottom-[14%] right-0 xl:-right-16',
    delay: 1.5,
  },
] as const;

export const platformHighlights = [
  {
    id: 'matching',
    label: 'Smart matching',
    title: 'Pair every mentee with the right mentor',
    description:
      'Pathment analyzes skills, goals, and availability to recommend optimal mentor-mentee pairs — with admin approval on every match before programs go live.',
    visual: 'matching',
  },
  {
    id: 'roadmaps',
    label: 'AI roadmaps',
    title: 'Personalized progression paths at scale',
    description:
      'AI-generated roadmaps break career goals into milestones and tasks, automatically adjusting as mentees complete work and grow their capabilities.',
    visual: 'roadmaps',
  },
  {
    id: 'insights',
    label: 'Program insights',
    title: 'Real-time visibility for engineering leaders',
    description:
      'Track program wellness, detect at-risk pairs, and generate promotion-ready summaries — so leaders always know who is progressing and who needs support.',
    visual: 'insights',
  },
] as const;

export const navItems = [
  { href: '#solutions', label: 'Solutions' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
] as const;

export const heroHighlights = [
  'Built for 800+ engineers',
  'AI-generated roadmaps',
  'Smart mentor matching',
  'Gamified progress',
] as const;

export const trustLogos = [
  { name: 'Northwind', icon: 'snowflake' },
  { name: 'Globex', icon: 'arrow-box' },
  { name: 'Initech', icon: 'diamonds' },
  { name: 'Acme Corp', icon: 'angle' },
  { name: 'Umbrella', icon: 'layers' },
  { name: 'Codecraft', icon: 'brackets' },
] as const;

export const solutionTabs = [
  {
    id: 'matching',
    tabLabel: 'Smart Mentor Matching',
    icon: 'users',
    headline: 'Pair every mentee with the right mentor',
    description:
      'Pathment analyzes skills, goals, and availability to recommend optimal mentor-mentee pairs — with admin approval on every match before programs go live.',
    visual: 'matching',
  },
  {
    id: 'roadmaps',
    tabLabel: 'AI-Generated Roadmaps',
    icon: 'git-branch',
    headline: 'Personalized progression paths at scale',
    description:
      'AI-generated roadmaps break career goals into milestones and tasks, automatically adjusting as mentees complete work and grow their capabilities.',
    visual: 'roadmap',
  },
  {
    id: 'insights',
    tabLabel: 'Program Analytics',
    icon: 'line-chart',
    headline: 'Real-time visibility for engineering leaders',
    description:
      'Track program wellness, detect at-risk pairs, and generate promotion-ready summaries — so leaders always know who is progressing and who needs support.',
    visual: 'insights',
  },
  {
    id: 'operations',
    tabLabel: 'Mentor Operations',
    icon: 'messages',
    headline: 'Structured check-ins that keep pairs on track',
    description:
      'Run mentorship programs with structured check-in templates, async feedback loops, and milestone reviews — without chasing updates manually.',
    visual: 'operations',
  },
] as const;

export const featureCards = [
  {
    icon: 'clipboard-check',
    title: 'Task Submit & Review',
    description:
      'Mentees submit versioned work with files and links. Mentors approve, request changes, or leave inline feedback — and the roadmap advances automatically on approval.',
    layout: 'featured',
    visual: 'task-review',
  },
  {
    icon: 'file-text',
    title: 'Intake & Assessments',
    description:
      'Shareable cohort apply links, admin-built assessments, and a magic-link status page — accept, invite, register, and place applicants in one structured flow.',
    layout: 'compact',
    visual: 'intake',
  },
  {
    icon: 'heart',
    title: 'Community Feed',
    description:
      'Scoped feeds for clans, cohorts, and programs. Post wins, ask questions, give kudos, and keep mentorship social without the Slack sprawl.',
    layout: 'compact',
    visual: 'community',
  },
  {
    icon: 'calendar',
    title: 'Scheduling & 1:1s',
    description:
      'Mentors publish availability, mentees book 1:1s, and both sides capture meeting notes with sentiment and next steps — all in one place.',
    layout: 'compact',
    visual: 'scheduling',
  },
  {
    icon: 'trophy',
    title: 'Gamification & Rewards',
    description:
      'Points, badges, challenges, and leaderboards keep long programs engaging. Mentees redeem XP for gifts from a curated catalog.',
    layout: 'featured',
    visual: 'gamification',
  },
] as const;

export const deepFeatures = [
  {
    label: 'Org Structure',
    title: 'Programs, cohorts, and mentor-led clans',
    description:
      'Run structured programs with intake seasons and mentor-led clans. Place mentees into groups, manage co-mentors, and scale mentorship without losing the personal touch.',
    cta: 'Explore capabilities',
    href: '#features',
    visual: 'org-structure',
  },
  {
    label: 'Real-time Messaging',
    title: 'Keep every conversation in context',
    description:
      '1:1 chat with delivery and read receipts, emoji reactions, and notifications — so mentor-mentee communication stays tied to the work, not scattered across tools.',
    cta: 'See how it works',
    href: '#how-it-works',
    visual: 'messaging',
  },
] as const;

export const workflowSteps = [
  {
    step: '01',
    icon: 'plug',
    title: 'Connect your org',
    description:
      'Set up your isolated workspace, import your engineering structure, and configure role-based programs for admins, mentors, and mentees.',
  },
  {
    step: '02',
    icon: 'rocket',
    title: 'Deploy programs',
    description:
      'Launch cohorts with AI-generated roadmaps, smart mentor matching, and structured check-in templates — no manual setup required.',
  },
  {
    step: '03',
    icon: 'trending',
    title: 'Track & improve',
    description:
      'Monitor results in real time, surface at-risk pairs, and optimize program performance with AI-powered progression insights.',
  },
] as const;

export const currentStatePoints = [
  {
    label: 'Ad-hoc matching:',
    body: 'Programs depend heavily on accidental personal connections and individual efforts, leading to unequal opportunity.',
  },
  {
    label: 'No progression blueprint:',
    body: 'Milestones are generic, non-standardized, and untracked. Mentees lack definitive skill targets.',
  },
  {
    label: 'Blind engineering leaders:',
    body: 'Executive teams cannot see capability growth in real-time, resulting in promotion misalignment and talent churn.',
  },
] as const;

export const pathmentSystemPoints = [
  {
    label: 'Smart matching:',
    body: 'Mentees are paired with the right mentors based on skills, goals, and availability, with admin approval.',
  },
  {
    label: 'AI-generated pathways:',
    body: 'Personalized roadmaps break goals into milestones and actionable tasks, adjusting as progress is made.',
  },
  {
    label: 'Gamified progress:',
    body: 'Points, badges, and leaderboards keep mentees motivated while leaders see capability growth in real time.',
  },
] as const;

export const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'VP Engineering, Northwind Systems',
    quote:
      'Pathment gave us the visibility we never had. We can finally see who\'s progressing, who\'s stuck, and where to invest in our people.',
    rating: 5,
  },
  {
    name: 'Marcus Webb',
    role: 'Engineering Director, Globex Digital',
    quote:
      'Our mentorship program went from ad-hoc coffee chats to a structured system. Promotion reviews are now backed by real progression data.',
    rating: 5,
  },
  {
    name: 'Priya Sharma',
    role: 'Head of People, Initech Labs',
    quote:
      'The AI-generated roadmaps save our mentors hours every week. Mentees know exactly what to work on next — no more guesswork.',
    rating: 5,
  },
  {
    name: 'James Okonkwo',
    role: 'Staff Engineer, Acme Platform',
    quote:
      'As a mentor, I finally have a system that tracks what we\'ve covered and what\'s next. The check-in templates alone changed everything.',
    rating: 5,
  },
  {
    name: 'Elena Rodriguez',
    role: 'CTO, Umbrella Tech',
    quote:
      'We scaled from 40 to 200 engineers without losing our culture of growth. Pathment made mentorship operational, not optional.',
    rating: 5,
  },
] as const;

export const faqItems = [
  {
    question: 'Do I need technical skills to set this up?',
    answer:
      'No. Pathment is designed for engineering leaders and people ops teams. You configure programs through an intuitive admin dashboard — no engineering resources required to get started.',
  },
  {
    question: 'How does AI-generated roadmap creation work?',
    answer:
      'Pathment analyzes each mentee\'s current skills, target role, and goals to generate a structured progression roadmap with milestones and tasks. The roadmap adapts automatically as mentees complete work.',
  },
  {
    question: 'How secure is our data?',
    answer:
      'Every organization runs in an isolated workspace on a private subdomain. Data is fully separated between tenants, with email verification, secure password reset, and role-based access controls.',
  },
  {
    question: 'Can we pilot before rolling out company-wide?',
    answer:
      'Yes. Most teams start with a single cohort or engineering group, validate the workflow, and expand once they see measurable progression outcomes.',
  },
  {
    question: 'What tools does Pathment integrate with?',
    answer:
      'Pathment connects with the tools your engineering teams already use — including Slack, GitHub, Jira, Notion, Google Calendar, and Linear — to keep mentorship aligned with daily work.',
  },
  {
    question: 'What if we need a custom program structure?',
    answer:
      'Our solution engineering team works with enterprise customers to design custom progression blueprints, role frameworks, and program templates tailored to your organization\'s career ladder.',
  },
] as const;

export const footerColumns = [
  {
    title: 'Product',
    links: [
      { href: '#solutions', label: 'Solutions' },
      { href: '#features', label: 'Features' },
      { href: '#how-it-works', label: 'How It Works' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '#', label: 'Documentation' },
      { href: '#request-access', label: 'Request Access' },
      { href: 'mailto:hello@pathment.me', label: 'Contact Support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '#', label: 'About Us' },
      { href: '#', label: 'Careers' },
      { href: '#', label: 'Privacy Policy' },
    ],
  },
] as const;
