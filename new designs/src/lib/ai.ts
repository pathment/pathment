import type { AIProvider, AIFeature, DelayCategory, TaskType, Effort, ScheduleSlot } from './types';

export const PROVIDER_META: Record<
  AIProvider,
  { label: string; hint: string; keyPrefix: string; models: string[] }
> = {
  groq: { label: 'Groq', hint: 'Fastest. Great for summaries & nudges.', keyPrefix: 'gsk_', models: ['llama-3.3-70b', 'mixtral-8x7b'] },
  openai: { label: 'OpenAI', hint: 'Strong reasoning for delay analysis.', keyPrefix: 'sk-', models: ['gpt-4o', 'gpt-4o-mini'] },
  anthropic: { label: 'Anthropic', hint: 'Nuanced, careful coaching language.', keyPrefix: 'sk-ant-', models: ['claude-sonnet-4', 'claude-haiku-4'] },
  gemini: { label: 'Google Gemini', hint: 'Long context, low cost.', keyPrefix: 'AIza', models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
  custom: { label: 'Custom / self-hosted', hint: 'Any OpenAI-compatible endpoint.', keyPrefix: '', models: ['custom'] },
};

export const FEATURE_META: Record<
  AIFeature,
  { label: string; desc: string }
> = {
  summary: {
    label: 'Per-mentee summary',
    desc: 'The "state of this mentee" paragraph at the top of each profile.',
  },
  delay: {
    label: 'Delay reasoning',
    desc: 'Classifies late work as external constraint, scope, or avoidance.',
  },
  atrisk: {
    label: 'At-risk ranking',
    desc: 'Ranks who is slipping and separates struggling-despite-effort from disengaged.',
  },
  nudge: {
    label: 'Automatic nudges',
    desc: 'Drafts gentle, context-aware reminders to mentees who are slipping.',
  },
  stall: {
    label: 'Stall / early warning',
    desc: 'Flags mentees who have not progressed a task in too long — before the deadline blows up.',
  },
  coaching: {
    label: 'Coaching suggestions',
    desc: 'Suggests how to support this specific person, grounded in their working style.',
  },
  feedback: {
    label: 'Draft-feedback assist',
    desc: 'Drafts review feedback mapped to the specific approval criteria a submission misses.',
  },
};

export const DELAY_CATEGORY_META: Record<
  DelayCategory,
  { label: string; tone: 'emerald' | 'amber' | 'rose'; desc: string }
> = {
  external: {
    label: 'External constraint',
    tone: 'emerald',
    desc: 'Real-world friction outside their control — counts in their favour.',
  },
  scope: {
    label: 'Scope / difficulty',
    tone: 'amber',
    desc: 'The work was harder or larger than planned — adjust the plan.',
  },
  avoidance: {
    label: 'Avoidance',
    tone: 'rose',
    desc: 'No clear obstacle — effort is missing. Worth a direct check-in.',
  },
};

/* Build the default approval checklist from a task's criteria. The first ~60%
   are treated as hard gates (required), the rest as soft/advisory — mirroring
   the brief's "block approval until required checks are ticked" rule (§6.2). */
export function buildChecklist(criteria: string[] = []) {
  const hardCount = Math.ceil(criteria.length * 0.6);
  return criteria.map((label, i) => ({
    id: `${i}`,
    label,
    required: i < hardCount,
  }));
}

/* ----------------------------------------------------------------
   Effort — a quick "expected effort" scale for assigned tasks (§5)
----------------------------------------------------------------- */
export const EFFORT_META: Record<Effort, { label: string; hint: string }> = {
  xs: { label: 'XS', hint: '~30 min' },
  s: { label: 'S', hint: '~2 hrs' },
  m: { label: 'M', hint: 'half-day' },
  l: { label: 'L', hint: 'multi-day' },
};

/* ----------------------------------------------------------------
   Sensible per-task-type presets — so assigning is seconds, not setup (§5).
   Choosing a type auto-fills the approval checklist + effort; the mentor
   only edits the deltas.
----------------------------------------------------------------- */
export const TASK_TYPE_PRESETS: Record<
  TaskType,
  { effort: Effort; criteria: string[] }
> = {
  project: {
    effort: 'l',
    criteria: ['Repo / link present', 'Meets acceptance criteria', 'On time or delay accepted', 'Tests included'],
  },
  assignment: {
    effort: 'm',
    criteria: ['Deliverable submitted', 'Meets the learning outcome', 'On time or delay accepted'],
  },
  quiz: {
    effort: 's',
    criteria: ['Score ≥ threshold'],
  },
  reading: {
    effort: 'xs',
    criteria: ['Marked complete', 'Reflection note'],
  },
  video: {
    effort: 'xs',
    criteria: ['Watched', 'Key takeaways noted'],
  },
  discussion: {
    effort: 's',
    criteria: ['Posted', 'Replied to a peer'],
  },
};

/* Quick due-date presets for the assign flow. */
export const DUE_PRESETS: { label: string; offsetDays: number }[] = [
  { label: 'Today', offsetDays: 0 },
  { label: '+3 days', offsetDays: 3 },
  { label: 'Next week', offsetDays: 7 },
  { label: '+2 weeks', offsetDays: 14 },
];

/* Each task type ships with a default schedule slot (brief §5). Overridable. */
export const TYPE_DEFAULT_SLOT: Record<TaskType, ScheduleSlot> = {
  reading: 'morning',
  discussion: 'lunch',
  video: 'lunch',
  project: 'anytime',
  assignment: 'anytime',
  quiz: 'dinner',
};

/* Display meta for the four schedule slots. */
export const SLOT_META: Record<
  ScheduleSlot,
  { label: string; blurb: string }
> = {
  morning: { label: 'Morning', blurb: 'Start the day — reading, mindset' },
  lunch: { label: 'Lunch', blurb: 'Midday — talks, discussion' },
  dinner: { label: 'Dinner', blurb: 'Evening — quizzes, review' },
  anytime: { label: 'Anytime', blurb: 'Core work — projects, assignments' },
};

export const SLOT_ORDER: ScheduleSlot[] = ['morning', 'lunch', 'dinner', 'anytime'];
