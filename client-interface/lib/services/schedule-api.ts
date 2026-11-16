import { apiClient } from './api-client';

export interface ScheduleBlock { id: string; label: string; time: string; days: string; bookable: boolean }
/** Live per-roadmap progress the server attaches to a roadmap slot (read-only). */
export interface ChainRoadmapDetail {
  id: string; name: string; started: boolean; completed: boolean;
  currentStep: number; totalSteps: number; percent: number;
}
export interface RecurringSlotConfig {
  mode?: 'once' | 'weekly';
  task?: { type: string; title?: string };
  mentorId?: string;
  clanId?: string;
  title: string;
  type: string;
  recurrence?: string;
  dayOfWeek?: number;
  daysOfWeek?: number[];
  timeLocal?: string;
  timezone?: string;
  startsOn?: string;
  endsOn?: string | null;
  dueOffsetDays?: number;
  intervalWeeks?: number;
}

export interface ScheduleSlot {
  id: string; label: string; time: string; days: string;
  kind: 'roadmap' | 'recurring' | 'empty';
  roadmapChain: string[];
  /** Step index of the chain's FIRST roadmap to start the mentee at (skip known steps). */
  startStep?: number;
  recurring: RecurringSlotConfig | null;
  bookable: boolean;
  /** Server-enriched: each chained roadmap's name + this mentee's live progress. */
  chainDetails?: ChainRoadmapDetail[];
}


// ── The day planner ─────────────────────────────────────────────────────────

/** What this viewer may do to one block, decided on the server and sent down. */
export interface SlotRights {
  canAddItems: boolean;
  canRetime: boolean;
  canRemove: boolean;
  canLock: boolean;
  /** Sit out one day of a block somebody else set, without deleting it. */
  canHide: boolean;
}

export interface PlanItem {
  id: string;
  title: string;
  type: string;
  status: 'assigned' | 'in_progress' | 'submitted' | 'revision_needed' | 'completed';
  dueDate: string | null;
  estimatedHours: number | null;
  /**
   * `personal` finishes on a tick. `review` goes to the mentor through the
   * submission flow — the one distinction a mentee actually feels.
   */
  kind: 'personal' | 'review';
  points: number | null;
  /** In this block because its roadmap is, rather than because it was put here. */
  fromRoadmapSlot?: boolean;
  repeat?: RepeatRule | null;
  /** "Every weekday" — written by the server so both sides read it the same. */
  repeatLabel?: string | null;
  /**
   * The day this instance is for ('YYYY-MM-DD'), when it is one of a series.
   * The board only sends occurrences whose day has arrived.
   */
  occurrenceDate?: string | null;
}

export interface PlanSlot {
  id: string;
  label: string;
  time: string;
  kind: 'roadmap' | 'recurring' | 'empty';
  owner: 'mentor' | 'mentee';
  locked: boolean;
  /** The mentee made this block their own, so "apply to all" skips it. */
  editedByMentee: boolean;
  items: PlanItem[];
  done: number;
  /** Live progress per roadmap, on a `kind: 'roadmap'` block. Null otherwise. */
  chainDetails: ChainRoadmapDetail[] | null;
  rights: SlotRights;
}

export interface PlanBoard {
  menteeId: string;
  clanId: string | null;
  hasSchedule: boolean;
  timezone: string | null;
  slots: PlanSlot[];
  unplanned: PlanItem[];
  viewer: { isOwnerMentee: boolean; canAssign: boolean };
}

/** How an item repeats. Null means it does not. */
export interface RepeatRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** 0 = Sunday. Weekly only. */
  days?: number[];
  until?: string;
}

/** A day-shape an admin has published for mentees to take. */
export interface SelectableTemplate {
  id: string;
  name: string;
  description: string | null;
  blocks: { label: string; time: string }[];
}

/** How far through today's plan one mentee is. */
export interface PlanProgress { hasPlan: boolean; total: number; done: number }

export interface PlanStrip {
  hasSchedule: boolean;
  blocks: { id: string; time: string; label: string; total: number; done: number }[];
  unplanned: number;
}

/** One slot of a mentee's filled schedule (what the read-only views render). */
export interface MenteeScheduleResult {
  templateId: string | null;
  templateName: string | null;
  schedule: ScheduleSlot[];
}

/** Schedule engine: reusable templates + per-mentee filled slot schedules. */
export const scheduleApi = {
  listTemplates: () => apiClient.get('/schedules/templates'),
  createTemplate: (data: { name: string; description?: string; blocks: Partial<ScheduleBlock>[] }) =>
    apiClient.post('/schedules/templates', data),
  updateTemplate: (id: string, data: { name?: string; description?: string; blocks?: Partial<ScheduleBlock>[] }) =>
    apiClient.patch(`/schedules/templates/${id}`, data),
  deleteTemplate: (id: string) => apiClient.delete(`/schedules/templates/${id}`),
  importTemplate: (orgId: string) => apiClient.post('/schedules/templates/import', { orgId }),
  assign: (id: string, menteeIds: string[]) => apiClient.post(`/schedules/templates/${id}/assign`, { menteeIds }),

  // Admin org templates (the shared library mentors import).
  listOrgTemplates: () => apiClient.get('/schedules/org'),
  createOrgTemplate: (data: { name: string; description?: string; blocks: Partial<ScheduleBlock>[] }) =>
    apiClient.post('/schedules/org', data),
  updateOrgTemplate: (id: string, data: { name?: string; description?: string; blocks?: Partial<ScheduleBlock>[] }) =>
    apiClient.patch(`/schedules/org/${id}`, data),
  deleteOrgTemplate: (id: string) => apiClient.delete(`/schedules/org/${id}`),

  getMenteeSchedule: (menteeId: string) =>
    apiClient.get<{ data: { schedule: MenteeScheduleResult | null } }>(`/schedules/mentee/${menteeId}`),
  getMySchedule: () => apiClient.get<{ data: { schedule: MenteeScheduleResult | null } }>('/schedules/me'),
  updateSlot: (menteeId: string, slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; startStep?: number; recurring?: Partial<RecurringSlotConfig> | null; bookable?: boolean;
  }) => apiClient.patch(`/schedules/mentee/${menteeId}/slot/${slotId}`, patch),
  // Push one slot's config to ALL (or selected) the mentor's mentees who have that slot.
  applySlotToAll: (slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; startStep?: number; recurring?: Partial<RecurringSlotConfig> | null;
    /** Reset even the mentees who had adapted this block. Ask for it by name. */
    force?: boolean;
  }, menteeIds?: string[]) => apiClient.post<{
    message?: string;
    data: { applied: number; skipped: { menteeId: string; name: string; reason: string }[] };
  }>(`/schedules/slot/${slotId}/apply-all`, { ...patch, menteeIds }),
  // Materialize recurring slot tasks immediately for all (or selected) assigned mentees.
  activateSlot: (slotId: string, menteeIds?: string[]) =>
    apiClient.post<{ data: { appliedMentees: number; createdTasks: number } }>(`/schedules/slot/${slotId}/activate`, { menteeIds }),

  // ── The day planner ───────────────────────────────────────────────────────
  // `menteeId` is 'me' for a mentee looking at their own day; the server
  // resolves it, so there is one set of endpoints rather than a mentee copy and
  // a mentor copy that drift apart.
  getBoard: (menteeId: string, clanId?: string | null) =>
    apiClient.get<{ data: PlanBoard }>(`/schedules/board/${menteeId}${clanId ? `?clanId=${clanId}` : ''}`),
  /** Today's plan progress for a whole row of mentees (clan review's faces). */
  getStrips: (menteeIds: string[], clanId?: string | null) =>
    apiClient.post<{ data: { progress: Record<string, PlanProgress> } }>('/schedules/board/strips', { menteeIds, clanId: clanId || null }),
  getStrip: (menteeId: string, clanId?: string | null) =>
    apiClient.get<{ data: PlanStrip }>(`/schedules/board/${menteeId}/strip${clanId ? `?clanId=${clanId}` : ''}`),
  addPlanItem: (menteeId: string, slotId: string, body: {
    title: string; kind?: 'personal' | 'review'; clanId?: string | null;
    dueDate?: string | null; repeat?: Partial<RepeatRule> | null;
  }) =>
    apiClient.post<{ data: { item: PlanItem } }>(`/schedules/board/${menteeId}/slots/${slotId}/items`, body),
  movePlanItem: (taskId: string, slotId: string | null, clanId?: string | null) =>
    apiClient.patch(`/schedules/board/items/${taskId}/move`, { slotId, clanId }),
  // These two carry the clan for the same reason `movePlanItem` does: a
  // mentor's grant is clan-scoped, and the task itself may carry no clan.
  setPlanItemDone: (taskId: string, done: boolean, clanId?: string | null) =>
    apiClient.patch<{ data: { status: string; nextOccurrence: string | null } }>(
      `/schedules/board/items/${taskId}/done`, { done, clanId }),
  setPlanItemRepeat: (taskId: string, repeat: Partial<RepeatRule> | null, clanId?: string | null) =>
    apiClient.patch<{ data: { repeat: RepeatRule | null } }>(
      `/schedules/board/items/${taskId}/repeat`, { repeat, clanId }),
  addPlanSlot: (menteeId: string, body: { label: string; time: string; clanId?: string | null }) =>
    apiClient.post<{ data: { slot: PlanSlot } }>(`/schedules/board/${menteeId}/slots`, body),
  updatePlanSlot: (menteeId: string, slotId: string, patch: { label?: string; time?: string; locked?: boolean; clanId?: string | null }) =>
    apiClient.patch<{ data: { slot: PlanSlot } }>(`/schedules/board/${menteeId}/slots/${slotId}`, patch),
  removePlanSlot: (menteeId: string, slotId: string, clanId?: string | null) =>
    apiClient.delete(`/schedules/board/${menteeId}/slots/${slotId}${clanId ? `?clanId=${clanId}` : ''}`),
  hidePlanSlot: (menteeId: string, slotId: string, hide: boolean, clanId?: string | null) =>
    apiClient.post(`/schedules/board/${menteeId}/slots/${slotId}/hide`, { hide, clanId }),
  listSelectableTemplates: (menteeId: string, clanId?: string | null) =>
    apiClient.get<{ data: { templates: SelectableTemplate[] } }>(
      `/schedules/board/${menteeId}/templates${clanId ? `?clanId=${clanId}` : ''}`),
  applySelectableTemplate: (menteeId: string, templateId: string, clanId?: string | null) =>
    apiClient.post<{ data: { added: number; skipped: number } }>(
      `/schedules/board/${menteeId}/apply-template`, { templateId, clanId }),
};
