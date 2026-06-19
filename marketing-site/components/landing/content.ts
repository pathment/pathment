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
      'Pathment analyzes skills, goals, and availability to recommend optimal mentor-mentee pairs, with admin approval on every match before programs go live.',
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
    title: 'Real-time visibility for program leads',
    description:
      'Track program wellness, detect at-risk pairs, and generate promotion-ready summaries, so leaders always know who is progressing and who needs support.',
    visual: 'insights',
  },
] as const;

export const navItems = [
  { href: '#solutions', label: 'Solutions' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
] as const;

export const heroHighlights = [
  'AI-generated roadmaps',
  'Mentor matching & approvals',
  'Task review & feedback',
  'Gamified progress',
] as const;

// Real traction (Pathment + the Dev Weekends fellowship it runs on). Scrolls in
// the marquee strip under the hero. Keep these honest and update as they grow.
export const impactStats = [
  { value: '3,000+', label: 'mentees on Pathment' },
  { value: '1,600+', label: 'engineers trained' },
  { value: '200+', label: 'job placements' },
  { value: '100+', label: 'certified fellows' },
  { value: '9', label: 'Google Summer of Code acceptances' },
  { value: '7', label: 'countries' },
  { value: '30,000+', label: 'community members' },
] as const;

export const solutionTabs = [
  {
    id: 'matching',
    tabLabel: 'Smart Mentor Matching',
    icon: 'users',
    headline: 'Pair every mentee with the right mentor',
    description:
      'Pathment analyzes skills, goals, and availability to recommend optimal mentor-mentee pairs, with admin approval on every match before programs go live.',
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
      'Track program wellness, detect at-risk pairs, and generate promotion-ready summaries, so leaders always know who is progressing and who needs support.',
    visual: 'insights',
  },
  {
    id: 'operations',
    tabLabel: 'Mentor Operations',
    icon: 'messages',
    headline: 'Structured check-ins that keep pairs on track',
    description:
      'Run mentorship programs with structured check-in templates, async feedback loops, and milestone reviews, without chasing updates manually.',
    visual: 'operations',
  },
] as const;

export const featureCards = [
  {
    icon: 'clipboard-check',
    title: 'Task Submit & Review',
    description:
      'Mentees submit versioned work with files and links. Mentors approve, request changes, or leave inline feedback, and the roadmap advances automatically on approval.',
    layout: 'featured',
    visual: 'task-review',
  },
  {
    icon: 'file-text',
    title: 'Intake & Assessments',
    description:
      'Shareable cohort apply links, admin-built assessments, and a magic-link status page, accept, invite, register, and place applicants in one structured flow.',
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
      'Mentors publish availability, mentees book 1:1s, and both sides capture meeting notes with sentiment and next steps, all in one place.',
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
      '1:1 chat with delivery and read receipts, emoji reactions, and notifications, so mentor-mentee communication stays tied to the work, not scattered across tools.',
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
      'Launch cohorts with AI-generated roadmaps, smart mentor matching, and structured check-in templates, no manual setup required.',
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
    label: 'No clear path:',
    body: 'Milestones are generic and untracked, so mentees never quite know what to work on next.',
  },
  {
    label: 'No visibility:',
    body: 'Program leads can’t see who’s progressing, who’s stuck, or where to step in, until it’s too late.',
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

// Real flagship: the Dev Weekends fellowship runs on Pathment. All numbers below
// are real and supplied by the team. No invented quotes or logos.
export const devWeekends = {
  name: 'Dev Weekends',
  url: 'https://devweekends.com',
  kicker: 'Powering Dev Weekends',
  title: 'A free developer fellowship, run on Pathment',
  blurb:
    'Dev Weekends is a free, volunteer-driven developer fellowship running across 7 countries. They use Pathment to train engineers, run structured mentorship and mock interviews, and get fellows placement-ready, free forever.',
  stats: [
    { value: '1,600+', label: 'Engineers trained' },
    { value: '200+', label: 'Job placements', detail: '25+ at Turing, 50+ remote' },
    { value: '100+', label: 'Certified fellows' },
    { value: '9', label: 'GSoC acceptances', detail: 'plus ESoC & LFX' },
    { value: '30,000+', label: 'Community members' },
    { value: '7', label: 'Countries' },
  ],
} as const;

// Honest, attractive integration story. Bring-your-own-key AI (any OpenAI-compatible
// provider) is the real differentiator; email + media handling are built in.
export const integrations = [
  { name: 'Groq', category: 'AI' },
  { name: 'OpenAI', category: 'AI' },
  { name: 'Anthropic', category: 'AI' },
  { name: 'OpenRouter', category: 'AI' },
  { name: 'Resend', category: 'Email' },
  { name: 'Cloudinary', category: 'Files & media' },
] as const;

export const faqItems = [
  {
    question: 'Do I need technical skills to set this up?',
    answer:
      'No. Pathment is built for program leads, mentors, and ops teams. You configure everything through an admin dashboard, no engineering work required to get started.',
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
    question: 'Can we pilot before rolling out everywhere?',
    answer:
      'Yes. Most teams start with a single cohort or group, validate the workflow, and expand once they see progress they can measure.',
  },
  {
    question: 'What does Pathment connect to?',
    answer:
      'Almost everything runs in one place: programs, roadmaps, task submission and review, scheduling, community, and 1:1 messaging. For AI features like roadmap generation you bring your own key from any OpenAI-compatible provider (Groq, OpenAI, Anthropic, or OpenRouter), so you control the model and the cost. Email is handled by Resend and file uploads by Cloudinary, both built in. There is nothing to wire up before your first cohort.',
  },
  {
    question: 'What if we need a custom program structure?',
    answer:
      'Pathment is built around programs, cohorts, and mentor-led clans, with custom roadmaps, roles, and scoped permissions, so you can model your own progression paths and team structure without a rebuild.',
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
