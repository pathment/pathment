'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDrawerMotion, drawerPanelClass, drawerBackdropClass } from '@/components/shared/drawerMotion';
import { toast } from 'sonner';
import { X, Loader2, Check, Plus, Trash2, Search, Route, FileText, Eye } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { taskApi } from '@/lib/services/task-api';
import { tracksApi, type Track } from '@/lib/services/tracks-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { groupDiscussionsApi, scenarioLength, SCENARIO_MAX_CHARS } from '@/lib/services/group-discussions-api';
import { CharacterCount } from '@/components/shared/CharacterCount';
import { useApiQuery, useInvalidate, qk } from '@/lib/query';
import { useMentorRoadmaps } from '@/lib/hooks/mentor';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { RoadmapStepsDrawer } from '@/components/mentor/RoadmapStepsDrawer';
import { StepCustomizeModal } from '@/components/mentor/StepCustomizeModal';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { initialTaskSchedule, type TaskScheduleDraft } from './TaskScheduleFields';
import { TaskTimingRow, dayKey, inDays, niceDate } from './TaskTimingRow';
import { cleanHtml, isBlankHtml } from '@/lib/utils/html';
import { renderRichContent } from '@/lib/utils/richText';
import { pointsForDifficulty } from '@/lib/config/points';
import { useFormDraft, clearFormDraft } from '@/lib/hooks/shared/useFormDraft';
import { interviewApi, type InterviewKitSummary } from '@/lib/services/interview-api';
import { quizApi, type QuizKitSummary } from '@/lib/services/quiz-api';
import Link from 'next/link';
import { Mic, ListChecks, Code2, CalendarRange, ChevronDown, Video, GraduationCap, MessageSquareQuote } from 'lucide-react';
import { useCoursesStatus, useCourses } from '@/lib/hooks/shared';
import { coursesApi, formatCoursePrice, type CourseEnrollResult, type CourseLifecycle } from '@/lib/services/courses-api';
import { OpenSourceOrgPicker } from '@/components/shared/OpenSourceOrgPicker';
import type { OpenSourceOrg } from '@/lib/services/open-source-orgs-api';
import { TalkPicker } from '@/components/shared/TalkPicker';
import type { TalkItem } from '@/lib/services/talks-api';
import { useClan, ALL_CLANS, isHistoricalCohortClan } from '@/lib/context/ClanContext';
import { useScrollLock } from '@/lib/hooks/useScrollLock';

type AssignSource = 'custom' | 'roadmap';

const TYPES = ['assignment', 'project', 'quiz', 'reading', 'interview', 'group_discussion', 'video', 'open_source', 'talk'] as const;
const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment', project: 'Project', quiz: 'Quiz', quizKit: 'Quiz', reading: 'Reading', video: 'Video Presentation', discussion: 'Discussion', group_discussion: 'Group Discussion', interview: 'Interview', open_source: 'Open Source', talk: 'Talk / Podcast', course: 'Course',
};
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
const DUE_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 }, { label: '+2 weeks', days: 14 },
];
/** The first day a Group Discussion task can be due: when it closes, or else when it opens. */
const discussionDueDay = (group?: { opensAt: string | null; closesAt: string | null } | null) => {
  const at = group?.closesAt ?? group?.opensAt;
  const day = at ? dayKey(new Date(at)) : '';
  return day >= dayKey(new Date()) ? day : '';
};
// Roadmap assignment deadline is optional — `null` = "Default" (use step timing).
const ROADMAP_DUE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Default', days: null }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 }, { label: '+2 weeks', days: 14 },
];
const presetDateStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; };

/**
 * Who the work is going to.
 *
 * This was `{ id, name, level, risk }` and the picker rendered a checkbox, a
 * name and nothing else, so choosing between forty people meant recognising
 * forty names in a scrolling list. Everything below is optional and every
 * field is already loaded by the screens that open this drawer - they simply
 * were not passing it.
 *
 * The extra facts are the ones that change WHO you pick: somebody with no
 * work at all is the reason the bulk assign exists, somebody with a queue
 * waiting on you probably should not get more, and a mentor in two clans
 * needs to see which clan a name belongs to before assigning across them.
 */
export interface AssignDrawerMentee {
  id: string;
  name: string;
  level?: string;
  risk?: string;
  /** Profile photo; falls back to initials. */
  avatarUrl?: string | null;
  /** Which clan this person is in - the mentor may lead several. */
  clanName?: string | null;
  /** Total tasks ever assigned. 0 is the single most useful signal here. */
  taskCount?: number;
  /** Submissions sitting in this mentor's review queue. */
  pendingApprovals?: number;
  /** Open roadblocks: a reason to talk before piling more on. */
  openBlockers?: number;
}

/**
 * AssignTaskDrawer - accessible right-side drawer to assign a custom task to one
 * mentee (single) or many (bulk). Replaces the old broken /mentor/tasks?tab=create
 * navigation. Full fields + focus trap + Escape + ARIA, re-skinned indigo/slate.
 */
export function AssignTaskDrawer({
  mode,
  mentee,
  cohort = [],
  onClose,
  onAssigned,
  scheduleSlotId,
  slotLabel,
}: {
  mode: 'single' | 'bulk';
  mentee?: AssignDrawerMentee;
  cohort?: AssignDrawerMentee[];
  onClose: () => void;
  onAssigned?: () => void;
  /**
   * Assign straight into a block on the mentee's day.
   *
   * Opened from the planner, the mentor has already said WHEN — so the task is
   * stamped with the block on creation rather than being assigned and then
   * dragged, which is two steps and a chance to forget the second.
   */
  scheduleSlotId?: string;
  /** That block's name, so the drawer can say where this is going. */
  slotLabel?: string;
}) {
  const { clans, activeClanId } = useClan();
  const historical = isHistoricalCohortClan(
    activeClanId === ALL_CLANS ? null : clans.find((c) => c.id === activeClanId),
  );
  const [source, setSource] = useState<AssignSource>('custom');
  // document.body does not exist during the server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Mounted by the parent, so the exit has to finish before the parent is
  // told to remove it — otherwise there is nothing left to animate.
  const { shown, beginExit } = useDrawerMotion(onClose);

  // roadmap mode
  const { local: localRoadmaps, loading: roadmapsLoading } = useMentorRoadmaps();
  /**
   * The roadmap list had no ceiling and no search, so it grew with the
   * library: a workspace with twenty roadmaps pushed the steps, the
   * deadline and everything else that makes an assignment off the bottom
   * of the drawer, and finding one meant scrolling the whole panel past
   * a dozen near-identical "Full Stack Engineering Roadmap" cards.
   */
  const [roadmapQuery, setRoadmapQuery] = useState('');
  const [roadmapId, setRoadmapId] = useState('');
  const selectedRoadmap = localRoadmaps.find((r) => r.id === roadmapId) || null;
  const matchingRoadmaps = (() => {
    const q = roadmapQuery.trim().toLowerCase();
    if (!q) return localRoadmaps;
    return localRoadmaps.filter((r) => `${r.name} ${r.description || ''}`.toLowerCase().includes(q));
  })();
  // Mentees who already have the selected roadmap - can't be assigned it again.
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  // Multi-step batch assign: which steps to hand over now + per-mentee status.
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [viewSteps, setViewSteps] = useState(false);
  // Per-step, per-mentee customizations made at assign time, keyed by stepId.
  const [stepOverrides, setStepOverrides] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [customizeStep, setCustomizeStep] = useState<{ step: any; index: number } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [stepStatus, setStepStatus] = useState<{
    index: number; stepId: string; title: string; status: string | null;
    /** Advisory: the same step in ANOTHER clan. Never locks anything. */
    otherClanStatus?: { status: string; clanId: string; clanName: string | null } | null;
  }[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const toggleStep = (i: number) => setSelectedSteps((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const ACTIVE_TASK = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted'];

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('assignment');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<string>('medium');
  // Task value (XP + Coins on approval). Defaults with difficulty; mentor can override.
  const [pointsBase, setPointsBase] = useState<number>(pointsForDifficulty('medium'));
  const [dueDays, setDueDays] = useState<number>(7);
  // An exact date (free picker) overrides the preset when set; presets clear it.
  const [dueExact, setDueExact] = useState<string>('');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [resources, setResources] = useState<{ title: string; url: string }[]>([]);
  const [trackId, setTrackId] = useState<string>('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [openSourceOrgs, setOpenSourceOrgs] = useState<OpenSourceOrg[]>([]);
  const [talks, setTalks] = useState<TalkItem[]>([]);

  // Interview type: pick a kit + per-assignment options (retake / camera / AI).
  const [kits, setKits] = useState<InterviewKitSummary[]>([]);
  const [kitsLoading, setKitsLoading] = useState(false);
  const kitsFetchedRef = useRef(false);
  const [kitId, setKitId] = useState('');
  const [allowRetake, setAllowRetake] = useState(false);
  const [cameraRequired, setCameraRequired] = useState(false);
  const [aiGrading, setAiGrading] = useState(false);
  const selectedKit = kits.find((k) => k.id === kitId) || null;

  const [schedule, setSchedule] = useState<TaskScheduleDraft>(initialTaskSchedule);

  // Load the mentor's interview kits the first time they pick the Interview type.
  // Guard on a ref (not `kitsLoading`) so toggling loading state doesn't re-run
  // this effect and cancel the in-flight request via its own cleanup.
  useEffect(() => {
    if (type !== 'interview' || kitsFetchedRef.current) return;
    let active = true;
    kitsFetchedRef.current = true;
    setKitsLoading(true);
    interviewApi.listKits('published')
      .then((res: any) => { if (active) setKits(res?.data?.kits ?? []); })
      .catch(() => { if (active) { setKits([]); kitsFetchedRef.current = false; } })
      .finally(() => { if (active) setKitsLoading(false); });
    return () => { active = false; };
  }, [type]);

  // When a kit is chosen, seed the option toggles from its defaults.
  useEffect(() => {
    if (!selectedKit) return;
    setAllowRetake(selectedKit.allowRetakeDefault);
    setCameraRequired(selectedKit.cameraDefault);
    setAiGrading(selectedKit.aiGradingDefault);
  }, [kitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quiz type: pick a kit + per-assignment options (evaluation mode / retake).
  const [quizKits, setQuizKits] = useState<QuizKitSummary[]>([]);
  const [quizKitsLoading, setQuizKitsLoading] = useState(false);
  const quizKitsFetchedRef = useRef(false);
  const [quizKitId, setQuizKitId] = useState('');
  const [quizEvalMode, setQuizEvalMode] = useState<'auto' | 'review'>('auto');
  const [quizAllowRetake, setQuizAllowRetake] = useState(false);
  const selectedQuizKit = quizKits.find((k) => k.id === quizKitId) || null;

  // Course type (Buildment): offered only while the workspace's connection is
  // live. A course is always "assign now", in two steps: Enroll takes the seat
  // on Buildment, and only a confirmed enrollment unlocks Assign.
  const { connected: coursesConnected, loading: coursesStatusLoading } = useCoursesStatus();
  const isCourse = type === 'course';
  const { courses, loading: coursesLoading, refetch: refetchCourses } = useCourses(coursesConnected && isCourse);

  // A Group Discussion task points at a group of this clan that has not ended.
  // The group has its own schedule, so the task is assigned now with a plain
  // deadline, like a course. The id is resolved against the list, so a clan
  // switch cannot send a group from the previous clan.
  const isGroupDiscussion = type === 'group_discussion';
  const assignedNow = isCourse || isGroupDiscussion;
  const discussionClanId = activeClanId === ALL_CLANS ? null : activeClanId;
  const { data: discussionData, loading: discussionsLoading } = useApiQuery({
    queryKey: qk.mentor.groupDiscussions(discussionClanId),
    queryFn: () => groupDiscussionsApi.list(discussionClanId),
    enabled: isGroupDiscussion,
  });
  const discussionOptions = (discussionData?.scenarios ?? []).flatMap((scenario) => scenario.groups
    .filter((group) => group.state !== 'ended')
    .map((group) => ({
      id: group.id,
      label: `${scenario.title} · ${group.name}`,
      repeat: group.repeat,
      opensAt: group.opensAt,
      closesAt: group.closesAt,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      scenarioPrompt: scenario.prompt ?? '',
      scenarioGroupIds: scenario.groups.map((sibling) => sibling.id),
    })));
  const [discussionGroupId, setDiscussionGroupId] = useState('');
  const linkedDiscussion = discussionOptions.find((option) => option.id === discussionGroupId) ?? null;
  const earliestDue = isGroupDiscussion ? discussionDueDay(linkedDiscussion) : '';
  // The scenario belongs to the group discussion, not the task: it is plain text
  // read live by the chat and the task page, so it is edited here and saved back
  // rather than copied into the task's brief. Compared with what was picked, so a
  // refetch while this is open cannot make an untouched text overwrite a newer one.
  const [scenarioText, setScenarioText] = useState('');
  const [scenarioPicked, setScenarioPicked] = useState('');
  const scenarioChanged = !!linkedDiscussion && scenarioText.trim() !== scenarioPicked;
  const scenarioCleared = scenarioChanged && isBlankHtml(scenarioText);
  // Only an edit is held to the limit: an older, longer scenario left as it is still assigns.
  const scenarioTooLong = scenarioChanged && scenarioLength(scenarioText) > SCENARIO_MAX_CHARS;
  const invalidate = useInvalidate();
  const [courseId, setCourseId] = useState('');
  const selectedCourse = courses.find((c) => c.courseId === courseId) || null;
  // Seats held for the picked course, by mentee id. One that never becomes a
  // task is released (enrollment cancelled, type changed, drawer closed).
  const [enrolled, setEnrolled] = useState<Record<string, { assignmentId: string; lifecycle: CourseLifecycle }>>({});
  const [enrollErrors, setEnrollErrors] = useState<Record<string, string>>({});
  const [enrolling, setEnrolling] = useState(false);
  const enrolledRef = useRef(enrolled);
  enrolledRef.current = enrolled;
  const courseIdRef = useRef(courseId);
  courseIdRef.current = courseId;
  const refetchCoursesRef = useRef(refetchCourses);
  refetchCoursesRef.current = refetchCourses;
  const releaseSeats = useCallback((only?: string[]) => {
    const held = enrolledRef.current;
    const ids = (only ?? Object.keys(held)).filter((id) => held[id]);
    if (!ids.length) return;
    const items = ids.map((id) => ({ menteeId: id, assignmentId: held[id].assignmentId }));
    setEnrolled((prev) => { const next = { ...prev }; ids.forEach((id) => delete next[id]); return next; });
    coursesApi.release(courseIdRef.current, items)
      .then(() => refetchCoursesRef.current())
      .catch((error: unknown) => toast.error(extractApiErrorMessage(error, 'Could not cancel the Buildment enrollment')));
  }, []);
  const typeOptions: readonly string[] = coursesConnected ? [...TYPES, 'course'] : TYPES;
  // A restored draft may name the Course type after the connection went away.
  useEffect(() => {
    if (isCourse && !coursesStatusLoading && !coursesConnected) setType('assignment');
  }, [isCourse, coursesStatusLoading, coursesConnected]);

  // Leaving the course flow gives back any seat that was not assigned.
  useEffect(() => {
    if (!isCourse || source !== 'custom') { releaseSeats(); setEnrollErrors((prev) => (Object.keys(prev).length ? {} : prev)); }
  }, [isCourse, source, releaseSeats]);

  useEffect(() => {
    if (type !== 'quiz' || quizKitsFetchedRef.current) return;
    let active = true;
    quizKitsFetchedRef.current = true;
    setQuizKitsLoading(true);
    quizApi.listKits('published')
      .then((res: any) => { if (active) setQuizKits(res?.data?.kits ?? []); })
      .catch(() => { if (active) { setQuizKits([]); quizKitsFetchedRef.current = false; } })
      .finally(() => { if (active) setQuizKitsLoading(false); });
    return () => { active = false; };
  }, [type]);

  // When a quiz kit is chosen, seed the option controls from its defaults.
  useEffect(() => {
    if (!selectedQuizKit) return;
    setQuizEvalMode(selectedQuizKit.evaluationDefault);
    setQuizAllowRetake(selectedQuizKit.allowRetakeDefault);
  }, [quizKitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // bulk targeting
  const [selected, setSelected] = useState<Set<string>>(new Set(mentee ? [mentee.id] : []));
  const [search, setSearch] = useState('');

  const [saving, setSaving] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = 'assign-task-title';
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const draftKey = `pathment:assign-task:${mode}:${mentee?.id ?? 'bulk'}`;

  type AssignDraft = {
    schedule?: TaskScheduleDraft;
    source: AssignSource;
    roadmapId: string;
    title: string;
    type: string;
    description: string;
    difficulty: string;
    pointsBase?: number;
    dueDays: number;
    dueExact: string;
    deliverable: string;
    criteria: string[];
    resources: { title: string; url: string }[];
    trackId: string;
    kitId: string;
    quizKitId: string;
    selected: string[];
  };

  const { flush: flushDraft } = useFormDraft<AssignDraft>(draftKey, {
    schedule, source, roadmapId, title, type, description, difficulty, pointsBase, dueDays, dueExact,
    deliverable, criteria, resources, trackId, kitId, quizKitId, selected: [...selected],
  }, (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.source === 'custom' || d.source === 'roadmap') setSource(d.source);
    if (typeof d.roadmapId === 'string') setRoadmapId(d.roadmapId);
    if (typeof d.title === 'string') setTitle(d.title);
    // A plain discussion is no longer offered here, so an old draft starts as an assignment.
    if (typeof d.type === 'string') setType(['recurring', 'discussion'].includes(d.type) ? 'assignment' : d.type);
    if (d.schedule && ['now', 'once', 'weekly'].includes(d.schedule.mode)) setSchedule({ ...initialTaskSchedule(), ...d.schedule });
    if (typeof d.description === 'string') setDescription(d.description);
    if (typeof d.difficulty === 'string') setDifficulty(d.difficulty);
    if (typeof d.pointsBase === 'number' && d.pointsBase > 0) setPointsBase(d.pointsBase);
    if (typeof d.dueDays === 'number') setDueDays(d.dueDays);
    if (typeof d.dueExact === 'string') setDueExact(d.dueExact);
    if (typeof d.deliverable === 'string') setDeliverable(d.deliverable);
    if (Array.isArray(d.criteria)) setCriteria(d.criteria);
    if (Array.isArray(d.resources)) setResources(d.resources);
    if (typeof d.trackId === 'string') setTrackId(d.trackId);
    if (typeof d.kitId === 'string') setKitId(d.kitId);
    if (typeof d.quizKitId === 'string') setQuizKitId(d.quizKitId);
    if (Array.isArray(d.selected)) setSelected(new Set(d.selected));
  });

  // Load this mentee's lanes for the track picker (single mode only).
  useEffect(() => {
    if (mode !== 'single' || !mentee?.id) return;
    let active = true;
    tracksApi.listForMentee(mentee.id).then((res: any) => {
      if (active) setTracks(res?.data?.tracks ?? []);
    }).catch(() => { /* lanes are optional */ });
    return () => { active = false; };
  }, [mode, mentee?.id]);

  // When a roadmap is picked, load who already has it so we can disable them.
  useEffect(() => {
    if (source !== 'roadmap' || !roadmapId) { setAssignedIds(new Set()); return; }
    let active = true;
    setAssigneesLoading(true);
    mentorApi.getRoadmapAssignees(roadmapId)
      .then((res: any) => { if (active) setAssignedIds(new Set<string>(res?.data?.menteeIds ?? res?.menteeIds ?? [])); })
      .catch(() => { if (active) setAssignedIds(new Set()); })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [source, roadmapId]);

  // Load this mentee's per-step status so the mentor can batch-assign without
  // double-giving steps, and see how many are already active. Single mode only.
  useEffect(() => {
    setSelectedSteps(new Set());
    setStepOverrides({});
    if (source !== 'roadmap' || !roadmapId) { setStepStatus([]); setActiveCount(0); return; }
    let active = true;
    if (mode === 'single' && mentee) {
      setStepsLoading(true);
      mentorApi.getRoadmapMenteeSteps(roadmapId, mentee.id)
        .then((res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!active) return;
          const steps = res?.data?.steps ?? [];
          setStepStatus(steps);
          setActiveCount(res?.data?.activeCount ?? 0);
          const firstFree = steps.find((s: { status: string | null }) => !s.status);
          setSelectedSteps(firstFree ? new Set([firstFree.index]) : new Set());
        })
        .catch(() => { if (active) { setStepStatus([]); setActiveCount(0); } })
        .finally(() => { if (active) setStepsLoading(false); });
    } else {
      // Bulk: no per-mentee status — default to the first step.
      setStepStatus([]); setActiveCount(0); setSelectedSteps(new Set([0]));
    }
    return () => { active = false; };
  }, [source, roadmapId, mode, mentee?.id]);

  const closeKeepingDraft = useCallback(() => { releaseSeats(); flushDraft(); beginExit(); }, [releaseSeats, flushDraft, beginExit]);

  // Focus first field on open.
  useEffect(() => { titleRef.current?.focus(); }, []);

  // Escape to close (draft is flushed first) + Ctrl/Cmd+Enter to submit + Tab trap.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeKeepingDraft(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void submitRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = drawerRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [closeKeepingDraft]);

  const toggleMentee = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Matches the clan as well as the name: once a clan is on screen, typing it
  // is the obvious way to narrow a roster that spans two of them.
  const filteredCohort = cohort.filter((m) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return m.name.toLowerCase().includes(needle) || (m.clanName || '').toLowerCase().includes(needle);
  });
  // Send a date-only value (YYYY-MM-DD). The server anchors it to end-of-day in
  // the mentee's timezone, so "Today" means their whole day — not the current
  // instant (which would be instantly overdue and drift a day across timezones).
  const dueISO = () => {
    if (dueExact) return dueExact;
    const d = new Date(); d.setDate(d.getDate() + dueDays);
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const dueTooEarly = !!earliestDue && dueISO() < earliestDue;
  const cleanCriteria = criteria.map((c) => c.trim()).filter(Boolean);

  const rawTargetIds = mode === 'bulk' ? [...selected] : (mentee ? [mentee.id] : []);
  // Re-assigning a roadmap a mentee already has is allowed: the server updates
  // their progress (moves them to the chosen start step) idempotently rather than
  // duplicating. We surface it as a note, not a hard block.
  const blockSet = new Set<string>();
  const targetIds = rawTargetIds.filter((id) => !blockSet.has(id));
  const targetCount = targetIds.length;
  const blockedCount = rawTargetIds.length - targetCount;
  // Course: who still needs enrolling, and whether everyone targeted is enrolled.
  const toEnroll = targetIds.filter((id) => !enrolled[id]);
  const enrolledTargets = targetCount - toEnroll.length;
  const courseReady = !!courseId && targetCount > 0 && toEnroll.length === 0;
  const menteeName = (id: string) => (mentee?.id === id ? mentee.name : cohort.find((m) => m.id === id)?.name) || 'A mentee';
  const firstName = mentee?.name?.split(' ')[0] || 'the mentee';

  const enroll = async () => {
    if (activeClanId === ALL_CLANS && clans.length > 1) {
      toast.error('Select a clan in the sidebar before assigning work.');
      return;
    }
    if (historical || !courseId || enrolling || !toEnroll.length) return;
    try {
      setEnrolling(true);
      const res: any = await coursesApi.enroll(courseId, toEnroll); // eslint-disable-line @typescript-eslint/no-explicit-any
      const results: CourseEnrollResult[] = res?.data?.results ?? [];
      const ok = results.filter((r) => r.ok && r.assignmentId);
      const failed = results.filter((r) => !r.ok);
      setEnrolled((prev) => ({
        ...prev,
        ...Object.fromEntries(ok.map((r) => [r.menteeId, { assignmentId: r.assignmentId as string, lifecycle: r.lifecycle || 'PENDING_ACCOUNT' }])),
      }));
      setEnrollErrors(Object.fromEntries(failed.map((r) => [r.menteeId, r.error || 'Could not enroll'])));
      if (failed.length) toast.error(mode === 'single' ? (failed[0].error || 'Could not enroll') : `${failed.length} mentee${failed.length > 1 ? 's' : ''} couldn't be enrolled`);
      else toast.success(mode === 'single' ? `${firstName} is enrolled on Buildment` : `${ok.length} mentee${ok.length === 1 ? '' : 's'} enrolled on Buildment`);
      refetchCourses();
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Could not enroll on Buildment'));
    } finally {
      setEnrolling(false);
    }
  };

  // Single-mode roadmap where the one mentee already has this roadmap.
  const canSubmit = !historical && targetCount > 0 && (source === 'custom'
    ? (!!title.trim() && (type !== 'interview' || !!kitId) && (type !== 'quiz' || !!quizKitId) && (type !== 'open_source' || openSourceOrgs.length > 0) && (type !== 'talk' || talks.length > 0) && (type !== 'course' || courseReady) && (!isGroupDiscussion || (!!linkedDiscussion && !scenarioCleared && !scenarioTooLong && !dueTooEarly)) &&(assignedNow || schedule.mode === 'now' || (!!schedule.startsOn && !!schedule.timeLocal && schedule.dueOffsetDays > 0 && (schedule.mode !== 'weekly' || schedule.daysOfWeek.length > 0))))
    : (!!roadmapId && selectedSteps.size > 0));

  const submit = async () => {
    if (historical) {
      toast.error('This cohort is historical. An admin must reopen the program before assigning tasks.');
      return;
    }
    // Multi-clan mentors must pick Standee vs cohort so work never lands on the wrong side.
    if (activeClanId === ALL_CLANS && clans.length > 1) {
      toast.error('Select a clan in the sidebar before assigning work.');
      return;
    }
    if (!canSubmit || saving) return;
    try {
      setSaving(true);

      // ── Assign from a roadmap ────────────────────────────────────────────
      if (source === 'roadmap') {
        const res: any = await mentorApi.assignRoadmap(roadmapId, { menteeIds: targetIds, stepIndexes: [...selectedSteps], dueDate: dueExact || undefined, stepOverrides: Object.keys(stepOverrides).length ? stepOverrides : undefined });
        const assigned = res?.data?.assigned ?? targetIds.length;
        const failed = res?.data?.failed ?? 0;
        if (assigned === 0) {
          toast.error(res?.data?.results?.find((r: any) => !r.ok)?.error || 'Could not assign the roadmap');
          setSaving(false);
          return;
        }
        if (failed) toast.error(`${failed} mentee${failed > 1 ? 's' : ''} couldn't be assigned`);
        toast.success(`Roadmap assigned to ${assigned} mentee${assigned > 1 ? 's' : ''}`);
        clearFormDraft(draftKey);
        onAssigned?.();
        beginExit();
        return;
      }

      // ── Assign a custom task ─────────────────────────────────────────────
      // Saved first, so a scenario that cannot be saved assigns nothing.
      if (isGroupDiscussion && linkedDiscussion && scenarioChanged) {
        await groupDiscussionsApi.updateScenario(linkedDiscussion.scenarioId, { prompt: cleanHtml(scenarioText) });
        await invalidate(
          qk.mentor.groupDiscussions(discussionClanId),
          ...linkedDiscussion.scenarioGroupIds.map((id) => qk.mentor.groupDiscussion(id)),
        );
      }
      const cleanResources = resources
        .map((r) => ({ title: r.title.trim(), url: r.url.trim() }))
        .filter((r) => r.url)
        .map((r) => ({ title: r.title || r.url, url: r.url }));
      const base = {
        title: title.trim(),
        description: isGroupDiscussion ? '' : cleanHtml(description),
        type,
        difficulty,
        dueDate: schedule.mode === 'now' || assignedNow ? dueISO() : undefined,
        pointsBase: Number.isFinite(pointsBase) && pointsBase > 0 ? Math.min(200, Math.round(pointsBase)) : undefined,
        deliverable: (deliverable.trim() || undefined),
        acceptanceCriteria: cleanCriteria,
        resources: (cleanResources.length ? cleanResources : undefined),
        // Interview tasks carry the kit + options; the runner/grading use these.
        ...(type === 'interview' && kitId
          ? { interview: { kitId, allowRetake, cameraRequired, aiGradingEnabled: aiGrading } }
          : {}),
        ...(type === 'quiz' && quizKitId
          ? { quiz: { kitId: quizKitId, evaluationMode: quizEvalMode, allowRetake: quizAllowRetake } }
          : {}),
        ...(type === 'open_source' && openSourceOrgs.length > 0
          ? { openSourceOrgIds: openSourceOrgs.map((o) => o.id) }
          : {}),
        ...(type === 'talk' && talks.length > 0
          ? { talkIds: talks.map((t) => t.id) }
          : {}),
        // Course tasks carry the provider's course id plus the enrollment made by
        // "Enroll" — the server confirms it with Buildment instead of enrolling again.
        ...(type === 'course' && courseId
          ? { course: mode === 'bulk'
            ? { courseId, assignmentIds: Object.fromEntries(targetIds.map((id) => [id, enrolled[id]?.assignmentId])) }
            : { courseId, assignmentId: enrolled[mentee!.id]?.assignmentId } }
          : {}),
        ...(isGroupDiscussion && linkedDiscussion ? { discussionGroupId: linkedDiscussion.id } : {}),
        ...(schedule.mode !== 'now' && !assignedNow ? { schedule: { ...schedule, mode: schedule.mode } } : {}),
        ...(scheduleSlotId ? { scheduleSlotId } : {}),
      };
      if (mode === 'bulk') {
        const res: any = await taskApi.bulkCreateCustomTasks({ ...base, menteeIds: [...selected] });
        const assigned = res?.data?.assigned ?? 0;
        const failed = (res?.data?.results || []).filter((r: any) => !r.ok);
        if (assigned === 0) {
          toast.error(failed[0]?.error || 'No tasks were assigned');
          setSaving(false);
          return;
        }
        if (failed.length) toast.error(`${failed.length} mentee${failed.length > 1 ? 's' : ''} couldn't be assigned`);
        toast.success(`Task ${schedule.mode === 'now' || assignedNow ? 'assigned' : 'scheduled'} for ${assigned} mentee${assigned > 1 ? 's' : ''}`);
        // Enrolled but not assigned (deselected, or their task failed): give the seat back.
        const assignedIds = new Set<string>(((res?.data?.results || []) as { menteeId: string; ok: boolean }[]).filter((r) => r.ok).map((r) => r.menteeId));
        releaseSeats(Object.keys(enrolled).filter((id) => !assignedIds.has(id)));
      } else {
        await taskApi.createCustomTask({ ...base, menteeId: mentee!.id, trackId: trackId || undefined });
        toast.success(slotLabel
          ? `Assigned into ${slotLabel}`
          : `Task assigned to ${mentee?.name || 'the mentee'}`);
      }
      onAssigned?.();
      clearFormDraft(draftKey);
      beginExit();
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Could not assign'));
    } finally {
      setSaving(false);
    }
  };
  submitRef.current = submit;

  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void submitRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
      active
        ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
    }`;

  /**
   * Rendered into <body>, not where it is written.
   *
   * The shared Drawer panel carries `will-change: transform`, which makes it a
   * containing block for `position: fixed` descendants. Opened from inside the
   * day planner, this drawer was therefore sized to the planner's panel rather
   * than the viewport, and the two overlapped instead of stacking. A portal
   * takes it back out to the page. `dark` lives on <html>, so theming is
   * unaffected.
   */
  if (!mounted) return null;
  return createPortal(
      <div className="fixed inset-0 z-60 flex justify-end" onKeyDown={onKeyDown}>
        <div className={drawerBackdropClass(shown)} onClick={closeKeepingDraft} aria-hidden="true" />
        <div
          ref={drawerRef}
          data-drawer-motion
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col ${drawerPanelClass(shown)}`}
        >
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* Who this is for, shown rather than spelled out. */}
              {mode === 'single' && mentee && (
                <Avatar name={mentee.name} src={mentee.avatarUrl ?? null} size="md" className="shrink-0" />
              )}
              <div className="min-w-0">
                <h2 id={titleId} className="font-semibold text-slate-900">Assign a task</h2>
                <p className="truncate text-sm text-slate-500">
                  {mode === 'bulk'
                    ? `${selected.size} mentee${selected.size === 1 ? '' : 's'} selected`
                    : [
                      `to ${mentee?.name ?? 'mentee'}`,
                      mentee?.clanName || null,
                      mentee?.taskCount === 0 ? 'no tasks yet' : null,
                      mentee?.pendingApprovals ? `${mentee.pendingApprovals} awaiting review` : null,
                    ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <button onClick={closeKeepingDraft} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          <>
              {/* Source tabs - custom task vs assign from a roadmap */}
              <div className="px-6 pt-4">
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                  {([['custom', 'Custom task', FileText], ['roadmap', 'From roadmap', Route]] as const).map(([key, label, Icon]) => (
                    <button key={key} type="button" onClick={() => setSource(key)} aria-pressed={source === key}
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${source === key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                      <Icon className="w-4 h-4" />{label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {source === 'custom' && (<>
                <div>
                  <label htmlFor="assign-task-title-input" className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                  <input id="assign-task-title-input" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a responsive navbar" className={field} />
                </div>

                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">Type</span>
                  <div className="flex flex-wrap gap-2">
                    {typeOptions.map((t) => (
                      <button key={t} type="button" onClick={() => setType(t)} className={pill(type === t)} aria-pressed={type === t}>{TYPE_LABEL[t]}</button>
                    ))}
                  </div>
                </div>

                {type === 'interview' && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <Mic className="w-4 h-4 text-brand-600" /> Interview kit <span className="text-red-500">*</span>
                    </div>
                    {kitsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading your kits…</div>
                    ) : kits.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No <span className="font-medium">published</span> interview kits to assign.{' '}
                        <Link href="/mentor/interviews" className="text-brand-600 hover:text-brand-700 font-medium">Build or publish one →</Link>
                      </p>
                    ) : (
                      <>
                        <select value={kitId} onChange={(e) => setKitId(e.target.value)} className={field} aria-label="Interview kit">
                          <option value="">Select a kit…</option>
                          {kits.map((k) => (
                            <option key={k.id} value={k.id}>{k.title} · {k.questionCount} Q</option>
                          ))}
                        </select>
                        {selectedKit && (
                          <p className="text-[11px] text-slate-400">
                            {selectedKit.questionCount} question{selectedKit.questionCount === 1 ? '' : 's'} · scored out of {selectedKit.totalPoints} ·{' '}
                            {selectedKit.timingMode === 'total' ? 'one total timer' : 'per-question timing'}
                            <span className="block">Awards up to {pointsBase} XP &amp; Coins (task value), pro-rated by their score.</span>
                          </p>
                        )}
                        <div className="space-y-2 pt-1">
                          {([
                            ['Allow re-attempt', allowRetake, setAllowRetake, 'Off = strict one-take'],
                            ['Require camera', cameraRequired, setCameraRequired, 'Proctor snapshots during the interview'],
                            ['AI draft grading', aiGrading, setAiGrading, 'Uses your BYO AI key; mentor still decides'],
                          ] as const).map(([label, val, setter, hint]) => (
                            <label key={label} className="flex items-start gap-2.5 cursor-pointer">
                              <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                              <span className="text-sm text-slate-700">{label}<span className="block text-[11px] text-slate-400">{hint}</span></span>
                            </label>
                          ))}
                        </div>
                        <Link href="/mentor/interviews" className="inline-block text-xs text-brand-600 hover:text-brand-700">Manage kits →</Link>
                      </>
                    )}
                  </div>
                )}

              {isGroupDiscussion && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                      <MessageSquareQuote className="w-4 h-4 text-brand-600 dark:text-brand-400" /> Group discussion <span className="text-red-500">*</span>
                    </div>
                    <Link href="/mentor/group-discussions" className="text-xs text-brand-600 hover:text-brand-700">
                      View or create →
                    </Link>
                  </div>
                  {activeClanId === ALL_CLANS && clans.length > 1 ? (
                    <p className="text-sm text-slate-500">Select a clan in the sidebar to see its group discussions.</p>
                  ) : discussionsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading group discussions…</div>
                  ) : discussionOptions.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No open group discussions in this clan.{' '}
                      <Link href="/mentor/group-discussions" className="text-brand-600 hover:text-brand-700 font-medium">Create one →</Link>
                    </p>
                  ) : (
                    <>
                      <select
                        value={discussionGroupId}
                        onChange={(e) => {
                          setDiscussionGroupId(e.target.value);
                          const picked = discussionOptions.find((option) => option.id === e.target.value);
                          if (picked && !title.trim()) setTitle(`Discuss: ${picked.scenarioTitle}`);
                          setScenarioText(picked?.scenarioPrompt ?? '');
                          setScenarioPicked(picked?.scenarioPrompt ?? '');
                          // The deadline follows the group: its close, or a date moved
                          // up to its start. A date the last group set leaves with it.
                          const kept = dueExact === earliestDue ? '' : dueExact;
                          const pickedDay = discussionDueDay(picked);
                          setDueExact(picked?.closesAt || pickedDay > (kept || dayKey(inDays(dueDays))) ? pickedDay : kept);
                        }}
                        className={field}
                        aria-label="Group discussion"
                      >
                        <option value="">Select a group…</option>
                        {discussionOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">The mentee is added to the group if they are not in it already.</p>
                    </>
                  )}
                </div>
              )}

              {type === 'talk' && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                      <Video className="w-4 h-4 text-brand-600 dark:text-brand-400" /> Talk / Podcast <span className="text-red-500">*</span>
                    </div>
                    <Link href="/mentor/talks" className="text-xs text-brand-600 hover:text-brand-700">
                      Explore library →
                    </Link>
                  </div>
                  <TalkPicker
                    multiple
                    value={talks}
                    onChange={(selectedTalks) => {
                      setTalks(selectedTalks || []);
                      if (!title.trim() && Array.isArray(selectedTalks) && selectedTalks.length > 0) {
                        setTitle(`Watch: ${selectedTalks[0].title}`);
                      }
                    }}
                  />
                </div>
              )}
                {type === 'quiz' && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <ListChecks className="w-4 h-4 text-brand-600" /> Quiz <span className="text-red-500">*</span>
                    </div>
                    {quizKitsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading your quizzes…</div>
                    ) : quizKits.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No <span className="font-medium">published</span> quizzes to assign.{' '}
                        <Link href="/mentor/quizzes" className="text-brand-600 hover:text-brand-700 font-medium">Build or publish one →</Link>
                      </p>
                    ) : (
                      <>
                        <select value={quizKitId} onChange={(e) => setQuizKitId(e.target.value)} className={field} aria-label="Quiz">
                          <option value="">Select a quiz…</option>
                          {quizKits.map((k) => (
                            <option key={k.id} value={k.id}>{k.title} · {k.questionCount} Q</option>
                          ))}
                        </select>
                        {selectedQuizKit && (
                          <p className="text-[11px] text-slate-400">
                            {selectedQuizKit.questionCount} question{selectedQuizKit.questionCount === 1 ? '' : 's'} · scored out of {selectedQuizKit.totalPoints}
                            {selectedQuizKit.passScore != null ? ` · pass ${selectedQuizKit.passScore}%` : ''}
                            <span className="block">Awards up to {pointsBase} XP &amp; Coins (task value), pro-rated by their score.</span>
                          </p>
                        )}
                        {/* Auto vs mentor-review — the key choice for a quiz. */}
                        <div>
                          <span className="block text-xs font-medium text-slate-600 mb-1.5">How to grade</span>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              ['auto', 'Auto-grade', 'Score & points post the moment they submit'],
                              ['review', 'Mentor review', 'Auto-scored, but you confirm before points post'],
                            ] as const).map(([val, label, hint]) => (
                              <button key={val} type="button" onClick={() => setQuizEvalMode(val)}
                                className={`text-left rounded-lg border p-2.5 ${quizEvalMode === val ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                                <span className="block text-sm font-medium text-slate-800">{label}</span>
                                <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                          <input type="checkbox" checked={quizAllowRetake} onChange={(e) => setQuizAllowRetake(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                          <span className="text-sm text-slate-700">Allow re-attempt<span className="block text-[11px] text-slate-400">Off = strict one-take</span></span>
                        </label>
                        <Link href="/mentor/quizzes" className="inline-block text-xs text-brand-600 hover:text-brand-700">Manage quizzes →</Link>
                      </>
                    )}
                  </div>
                )}

                {isCourse && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <GraduationCap className="w-4 h-4 text-brand-600" /> Buildment course <span className="text-red-500">*</span>
                    </div>
                    {coursesLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-1"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading courses…</div>
                    ) : courses.length === 0 ? (
                      <p className="text-sm text-slate-500">No courses are available to your workspace on Buildment yet.</p>
                    ) : (
                      <>
                        <select
                          value={courseId}
                          onChange={(e) => {
                            setCourseId(e.target.value);
                            setEnrollErrors({});
                            const picked = courses.find((c) => c.courseId === e.target.value);
                            if (picked && !title.trim()) setTitle(picked.title);
                          }}
                          // The seats held belong to this course — cancel the enrollment to change it.
                          disabled={enrolling || Object.keys(enrolled).length > 0}
                          className={`${field} disabled:opacity-60 disabled:cursor-not-allowed`}
                          aria-label="Course"
                        >
                          <option value="">Select a course…</option>
                          {courses.map((c) => {
                            const full = c.availableSeats !== null && c.availableSeats <= 0;
                            return <option key={c.courseId} value={c.courseId} disabled={full}>{c.title}{full ? ' (no seats left)' : ''}</option>;
                          })}
                        </select>
                        {selectedCourse && (
                          <p className="text-xs text-slate-500">
                            {formatCoursePrice(selectedCourse)}
                            {selectedCourse.availableSeats !== null ? ` · ${selectedCourse.availableSeats} seat${selectedCourse.availableSeats === 1 ? '' : 's'} left` : ''}
                          </p>
                        )}
                        {mode === 'bulk' && selectedCourse && selectedCourse.availableSeats !== null && selected.size > selectedCourse.availableSeats && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Only {selectedCourse.availableSeats} seat{selectedCourse.availableSeats === 1 ? '' : 's'} left for {selected.size} mentees — the rest won&apos;t be enrolled.
                          </p>
                        )}
                        {courseId && (
                          <div className="space-y-2 border-t border-brand-200/70 dark:border-brand-500/20 pt-3">
                            {enrolledTargets > 0 && (
                              <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                                <span className="flex-1">
                                  {mode === 'single'
                                    ? `${firstName} is enrolled on Buildment.`
                                    : `${enrolledTargets} of ${targetCount} mentee${targetCount === 1 ? '' : 's'} enrolled on Buildment.`}
                                  {courseReady && <span className="block text-xs text-slate-500">You can assign the task now.</span>}
                                  {mode === 'single' && enrolled[mentee?.id || '']?.lifecycle === 'PENDING_ACCOUNT' && (
                                    <span className="block text-xs text-slate-500">They have no Buildment account yet — they&apos;ll be asked to register with their Pathment email.</span>
                                  )}
                                  {mode === 'single' && enrolled[mentee?.id || '']?.lifecycle === 'PAYMENT_REQUIRED' && (
                                    <span className="block text-xs text-slate-500">Buildment is waiting for payment before they can start.</span>
                                  )}
                                </span>
                                <button type="button" onClick={() => releaseSeats()} disabled={saving || enrolling}
                                  className="text-xs font-medium text-slate-500 hover:text-red-600 shrink-0 disabled:opacity-50">Cancel enrollment</button>
                              </div>
                            )}
                            {targetIds.filter((id) => enrollErrors[id] && !enrolled[id]).map((id) => (
                              <p key={id} role="alert" className="text-xs text-red-600 dark:text-red-400">
                                {mode === 'bulk' ? `${menteeName(id)}: ` : ''}{enrollErrors[id]}
                              </p>
                            ))}
                            {toEnroll.length > 0 && (
                              <button type="button" onClick={enroll} disabled={enrolling || historical}
                                className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                                {enrolling ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <GraduationCap className="w-4 h-4" />}
                                {mode === 'single'
                                  ? `Enroll ${firstName} on Buildment`
                                  : `Enroll ${toEnroll.length} mentee${toEnroll.length === 1 ? '' : 's'} on Buildment`}
                              </button>
                            )}
                            {mode === 'bulk' && targetCount === 0 && <p className="text-xs text-slate-500">Select mentees below to enroll them.</p>}
                          </div>
                        )}
                        <p className="text-xs text-slate-500">
                          Enroll first: it takes a seat on Buildment using {mode === 'single' ? `${firstName}'s` : 'each mentee\'s'}{' '}Pathment
                          email, and Assign unlocks once Buildment confirms. A seat you don&apos;t assign is released when you
                          cancel the enrollment or close this drawer. The task completes on its own when the course is finished.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {type === 'open_source' && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                      <Code2 className="w-4 h-4 text-brand-600 dark:text-brand-400" /> Organization <span className="text-red-500">*</span>
                    </div>
                    <OpenSourceOrgPicker multiple value={openSourceOrgs} onChange={setOpenSourceOrgs} />
                  </div>
                )}

                {/* Two menus where there used to be a three-way mode switch
                    and, below it, a second "Due" block that only appeared in
                    one of the three modes. Same two facts, asked once each. */}
                {!assignedNow && (
                  <TaskTimingRow
                    due={{ days: dueDays, exact: dueExact }}
                    onDueChange={(next) => { setDueDays(next.days); setDueExact(next.exact); }}
                    schedule={schedule}
                    onScheduleChange={setSchedule}
                  />
                )}

                {isGroupDiscussion ? (
                  <div>
                    <span className="block text-sm font-medium text-slate-700 mb-1">Scenario</span>
                    {/* Keyed by the group: the editor reads its content once. A
                        scenario written before the editor (plain text or
                        markdown) opens formatted. */}
                    {linkedDiscussion ? (
                      <>
                        <RichTextEditor
                          key={linkedDiscussion.id}
                          content={renderRichContent(scenarioPicked)}
                          onChange={setScenarioText}
                          placeholder="What should the group discuss?"
                          minHeight="160px"
                        />
                        <CharacterCount count={scenarioLength(scenarioText)} max={SCENARIO_MAX_CHARS} />
                      </>
                    ) : (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
                        Select a group to see its scenario
                      </p>
                    )}
                    {linkedDiscussion && (
                      <p className={`text-xs mt-1 ${scenarioCleared ? 'text-red-500' : 'text-slate-500'}`}>
                        {scenarioCleared
                          ? 'This group discussion needs its scenario.'
                          : linkedDiscussion.scenarioGroupIds.length > 1
                            ? `Changes are saved when you assign, and show in all ${linkedDiscussion.scenarioGroupIds.length} groups on this scenario.`
                            : 'Changes are saved to the group discussion when you assign.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Brief</label>
                    <RichTextEditor content={description} onChange={setDescription} placeholder="Optional — what should they do?" minHeight="120px" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    {/* A course is enrolled on the provider the moment it is
                        assigned and cannot repeat, and a group discussion has
                        its own schedule, so both keep a plain deadline rather
                        than the timing row above. */}
                    {assignedNow && <div>
                      <span className="block text-sm font-medium text-slate-700 mb-1.5">Due</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DUE_PRESETS.map((d) => (
                          <button key={d.label} type="button" disabled={dayKey(inDays(d.days)) < earliestDue} onClick={() => { setDueDays(d.days); setDueExact(''); }} className={`${pill(!dueExact && dueDays === d.days)} disabled:cursor-not-allowed disabled:opacity-40`} aria-pressed={!dueExact && dueDays === d.days}>{d.label}</button>
                        ))}
                      </div>
                      <input aria-label="Exact due date" type="date" value={dueExact} onChange={(e) => setDueExact(e.target.value)}
                        min={earliestDue || new Date().toISOString().split('T')[0]}
                        className="mt-1.5 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <p className={`text-[11px] mt-1 ${dueTooEarly ? 'text-red-500' : 'text-slate-400'}`}>
                        {earliestDue
                          ? `${!linkedDiscussion?.closesAt ? 'Discussion opens' : linkedDiscussion.repeat === 'weekly' ? 'Session closes' : 'Discussion closes'} ${niceDate(earliestDue)}. The task can't be due before this.`
                          : 'Pick a preset or an exact date.'}
                      </p>
                    </div>}
                    <div>
                      <span className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DIFFICULTIES.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setDifficulty(d);
                              setPointsBase(pointsForDifficulty(d));
                            }}
                            className={`${pill(difficulty === d)} capitalize`}
                            aria-pressed={difficulty === d}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                {(
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="assign-task-points" className="block text-sm font-medium text-slate-700 mb-1">Task value (XP &amp; Coins)</label>
                      <input
                        id="assign-task-points"
                        type="number"
                        min={1}
                        max={200}
                        value={pointsBase}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value));
                          setPointsBase(Number.isFinite(v) ? Math.max(1, Math.min(200, v)) : pointsForDifficulty(difficulty));
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
                      />
                      <p className="mt-1 text-xs text-slate-400">Defaults with difficulty; you can override.</p>
                    </div>
                    {mode === 'single' && tracks.length > 0 && (
                      <div>
                        <label htmlFor="assign-task-track" className="block text-sm font-medium text-slate-700 mb-1">Track</label>
                        <select id="assign-task-track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className={field}>
                          <option value="">No track</option>
                          {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {type !== 'interview' && type !== 'quiz' && !isCourse && (<details className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium">Deliverable, checks &amp; resources <span className="text-muted-foreground font-normal">(optional)</span></summary>
                <div className="space-y-4 mt-4">
                <div>
                  <label htmlFor="assign-task-deliverable" className="block text-sm font-medium text-slate-700 mb-1">Deliverable</label>
                  <input id="assign-task-deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="What should they submit?" className={field} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">Acceptance criteria</span>
                    <button type="button" onClick={() => setCriteria((c) => [...c, ''])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add check</button>
                  </div>
                  <div className="space-y-2">
                    {criteria.length === 0 && <p className="text-xs text-slate-400">No criteria yet. Add checks the mentee must meet.</p>}
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={c}
                          onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Check ${i + 1}`}
                          aria-label={`Acceptance criterion ${i + 1}`}
                          className={field}
                        />
                        <button type="button" onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove criterion" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">Resources</span>
                    <button type="button" onClick={() => setResources((r) => [...r, { title: '', url: '' }])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add resource</button>
                  </div>
                  <div className="space-y-2">
                    {resources.length === 0 && <p className="text-xs text-slate-400">No resources yet — add helpful links (docs, videos, repos).</p>}
                    {resources.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={r.title} onChange={(e) => setResources((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                          placeholder="Label" aria-label={`Resource ${i + 1} label`} className={`${field} flex-1`} />
                        <input value={r.url} onChange={(e) => setResources((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                          placeholder="https://…" aria-label={`Resource ${i + 1} URL`} className={`${field} flex-2`} />
                        <button type="button" onClick={() => setResources((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove resource" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                </details>)}
                </>)}

                {source === 'roadmap' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="block text-sm font-medium text-slate-700">Pick a roadmap</span>
                        {!roadmapsLoading && localRoadmaps.length > 0 && (
                          <span className="text-xs text-slate-400 tabular-nums">
                            {matchingRoadmaps.length === localRoadmaps.length
                              ? `${localRoadmaps.length} available`
                              : `${matchingRoadmaps.length} of ${localRoadmaps.length}`}
                          </span>
                        )}
                      </div>
                      {roadmapsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading your roadmaps…</div>
                      ) : localRoadmaps.length === 0 ? (
                        <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-3">No roadmaps yet. Create or import one on the Roadmaps page, then assign it here.</p>
                      ) : (
                        <>
                          {/* Appears once the list is long enough to be worth
                              searching; below that it is one more thing to read. */}
                          {localRoadmaps.length > 5 && (
                            <div className="mb-2 flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 dark:border-slate-700">
                              <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                              <input
                                value={roadmapQuery}
                                onChange={(e) => setRoadmapQuery(e.target.value)}
                                aria-label="Search roadmaps"
                                placeholder="Search roadmaps…"
                                className="w-full bg-transparent py-2 text-sm focus:outline-none"
                              />
                              {roadmapQuery && (
                                <button type="button" onClick={() => setRoadmapQuery('')} aria-label="Clear roadmap search" className="shrink-0 p-1 text-slate-400 hover:text-slate-700">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {/*
                              A fixed window with its own scrollbar. The list used
                              to extend as far as the library went and take the
                              rest of the form with it.
                          */}
                          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                            {matchingRoadmaps.length === 0 ? (
                              <p className="px-1 py-6 text-center text-sm text-slate-400">
                                No roadmap matches &ldquo;{roadmapQuery}&rdquo;.
                              </p>
                            ) : matchingRoadmaps.map((r) => (
                              <button key={r.id} type="button" onClick={() => { setRoadmapId(r.id); setSelectedSteps(new Set()); }}
                                className={`w-full text-left rounded-xl border p-3 transition-colors ${roadmapId === r.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                                <div className="flex items-center gap-2">
                                  <Route className="w-4 h-4 text-brand-500 shrink-0" />
                                  <span className="text-sm font-medium text-slate-900 truncate">{r.name}</span>
                                  <span className="ml-auto text-xs text-slate-400 shrink-0">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</span>
                                </div>
                                {r.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{r.description}</p>}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {roadmapId && assigneesLoading && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />Checking who already has this roadmap…</p>
                    )}

                    {selectedRoadmap && selectedRoadmap.steps.length > 0 && (() => {
                      // Per-mentee status when single; plain step list when bulk.
                      const rows = stepStatus.length
                        ? stepStatus
                        // Bulk mode has no single mentee, so no cross-clan context either.
                        : selectedRoadmap.steps.map((s, i) => ({ index: i, stepId: s.id, title: s.title, status: null as string | null, otherClanStatus: null as { status: string; clanId: string; clanName: string | null } | null }));
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="block text-sm font-medium text-slate-700">Steps to assign <span className="text-red-500">*</span></span>
                            <div className="flex items-center gap-3">
                              {mode === 'single' && activeCount > 0 && (
                                <span className="text-xs text-amber-600">{mentee?.name?.split(' ')[0] ?? 'They'} has {activeCount} active task{activeCount === 1 ? '' : 's'}</span>
                              )}
                              <button type="button" onClick={() => setViewSteps(true)}
                                className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"><Eye className="w-3.5 h-3.5" />View details</button>
                            </div>
                          </div>
                          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 dark:divide-slate-700 dark:border-slate-700">
                            {stepsLoading ? (
                              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-brand-600" /></div>
                            ) : rows.map((s) => {
                              const isActive = !!s.status && ACTIVE_TASK.includes(s.status);
                              const isDone = s.status === 'completed';
                              const checked = selectedSteps.has(s.index) || isActive;
                              return (
                                <label key={s.stepId || s.index} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${isActive ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                  <input type="checkbox" disabled={isActive} checked={checked} onChange={() => toggleStep(s.index)}
                                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                                  <span className="flex-1 truncate text-slate-700">{s.index + 1}. {s.title}</span>
                                  <span className="text-[10px] text-slate-400 shrink-0">{pointsForDifficulty(selectedRoadmap.steps[s.index]?.difficulty)} pts</span>

                                  {!!stepOverrides[s.stepId] && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">customized</span>}
                                  {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 shrink-0">assigned</span>}
                                  {isDone && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">done</span>}
                                  {/* ADVISORY. Only shown when this clan has no
                                      status of its own, dashed so it reads as
                                      context rather than state. It deliberately
                                      does not reach `checked` or `disabled` —
                                      you can still assign it. */}
                                  {!s.status && s.otherClanStatus && (
                                    <span
                                      title={`Already ${s.otherClanStatus.status.replace(/_/g, ' ')} in ${s.otherClanStatus.clanName ?? 'another clan'} — you can still assign it here`}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full border border-dashed shrink-0 ${
                                        s.otherClanStatus.status === 'completed'
                                          ? 'border-emerald-300 text-emerald-700'
                                          : 'border-sky-300 bg-sky-50/60 text-sky-700 dark:border-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                                      }`}
                                    >
                                      {s.otherClanStatus.status === 'completed' ? 'done' : 'in progress'} in {s.otherClanStatus.clanName ?? 'another clan'}
                                    </span>
                                  )}
                                  <button type="button" title="View / customize step"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCustomizeStep({ step: selectedRoadmap.steps[s.index], index: s.index }); }}
                                    className="p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-slate-100 shrink-0"><Eye className="w-3.5 h-3.5" /></button>
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Tick the steps to hand over now — give several at once for the week. Already-assigned steps are locked. Steps marked from another clan are advisory — you can still assign them.</p>
                        </div>
                      );
                    })()}
                    {selectedRoadmap && selectedRoadmap.steps.length > 0 && (
                      <div>
                        <span className="block text-sm font-medium text-slate-700 mb-1.5">Deadline <span className="text-slate-400 font-normal">(optional)</span></span>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {ROADMAP_DUE_PRESETS.map((p) => {
                            const val = p.days == null ? '' : presetDateStr(p.days);
                            return (
                              <button key={p.label} type="button" onClick={() => setDueExact(val)} className={pill(dueExact === val)} aria-pressed={dueExact === val}>{p.label}</button>
                            );
                          })}
                        </div>
                        <input aria-label="Exact due date" type="date" value={dueExact} onChange={(e) => setDueExact(e.target.value)}
                          min={new Date().toISOString().split('T')[0]} className={field} />
                        <p className="text-xs text-slate-400 mt-1">&ldquo;Default&rdquo; uses the step&apos;s own timing (+7 days).</p>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'bulk' && (
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">
                        Assign to <span className="text-slate-400 font-normal">({targetCount})</span>
                        {blockedCount > 0 && <span className="ml-1 text-xs text-amber-600">· {blockedCount} already assigned</span>}
                      </span>
                      <div className="flex gap-3 text-xs">
                        <button type="button" onClick={() => setSelected(new Set(cohort.map((m) => m.id)))} className="text-brand-600 hover:text-brand-700">Select all</button>
                        <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-700">Clear</button>
                      </div>
                    </div>
                    <div className="relative mb-2">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mentees…" aria-label="Search mentees" className={`${field} pl-9`} />
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {filteredCohort.length === 0 && <p className="text-xs text-slate-400 px-3 py-3">No mentees match.</p>}
                      {filteredCohort.map((m) => {
                        const blocked = blockSet.has(m.id);
                        /**
                         * The facts that change who you pick, in the order they
                         * matter. "No tasks yet" comes first because it is the
                         * reason bulk assign exists, and a review queue is a
                         * reason to think twice before adding to it.
                         */
                        const facts = [
                          m.clanName || null,
                          m.taskCount === 0 ? 'No tasks yet' : null,
                          m.pendingApprovals ? `${m.pendingApprovals} awaiting review` : null,
                          m.openBlockers ? `${m.openBlockers} roadblock${m.openBlockers === 1 ? '' : 's'}` : null,
                          m.level || null,
                        ].filter(Boolean) as string[];

                        return (
                          <label key={m.id} className={`flex items-center gap-3 px-3 py-2 ${blocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}>
                            <input type="checkbox" disabled={blocked} checked={!blocked && selected.has(m.id)} onChange={() => toggleMentee(m.id)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed shrink-0" />
                            <Avatar name={m.name} src={m.avatarUrl ?? null} size="sm" className="shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-700">{m.name}</span>
                              {facts.length > 0 && (
                                <span className="block truncate text-[11px] text-slate-400">{facts.join(' · ')}</span>
                              )}
                            </span>
                            {blocked && (
                              <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">Assigned</span>
                            )}
                            {!blocked && m.risk === 'high' && (
                              <span title="At risk" className="text-[11px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md shrink-0">At risk</span>
                            )}
                            {!blocked && m.risk === 'watch' && (
                              <span title="Worth watching" className="text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">Watch</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={closeKeepingDraft} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                <button onClick={submit} disabled={!canSubmit || saving} title={source === 'custom' && isCourse && !courseReady ? 'Enroll on Buildment first' : 'Ctrl+Enter'} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Check className="w-4 h-4" />}
                  {source === 'roadmap'
                    ? (mode === 'bulk' ? `Assign roadmap to ${targetCount}` : 'Assign roadmap')
                    : isCourse ? (mode === 'bulk' ? `Assign course to ${selected.size}` : 'Assign course')
                    : (schedule.mode !== 'now' ? `Schedule${mode === 'bulk' ? ` for ${selected.size}` : ' task'}` : mode === 'bulk' ? `Assign to ${selected.size}` : 'Assign task')}
                </button>
              </div>
            </>
        </div>
        {viewSteps && selectedRoadmap && <RoadmapStepsDrawer roadmap={selectedRoadmap} onClose={() => setViewSteps(false)} />}
        {customizeStep && (
          <StepCustomizeModal
            step={customizeStep.step}
            index={customizeStep.index}
            editable
            menteeLabel={mode === 'single' ? (mentee?.name?.split(' ')[0]) : 'the selected mentees'}
            initialOverride={stepOverrides[customizeStep.step.id] || null}
            onClose={() => setCustomizeStep(null)}
            onSave={(ov) => setStepOverrides((prev) => {
              const next = { ...prev };
              if (ov) next[customizeStep.step.id] = ov; else delete next[customizeStep.step.id];
              return next;
            })}
          />
        )}
      </div>,
    document.body,
  );
}
