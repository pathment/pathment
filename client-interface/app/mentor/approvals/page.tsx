'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ClipboardCheck, CheckCircle2, Clock, Loader2, ChevronRight, CalendarClock, Check, X,
  Search, ArrowDownUp, Layers, RotateCcw, ArrowUpRight, XCircle,
} from 'lucide-react';
import { useMentorApprovals, type ApprovalItem } from '@/lib/hooks/mentor';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { BulkReviewDrawer } from '@/components/mentor/BulkReviewDrawer';
import { todayInZone, dateInZone, addDaysToDateStr, zoneLabel } from '@/lib/utils/datetime';

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Days a submission has been waiting (for the fairness emphasis at >= 3 days).
function waitingDays(iso: string): number {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.floor((Date.now() - d) / 86400000);
}

type Tab = 'review' | 'changes' | 'extensions';

export default function MentorApprovals() {
  const { queue, changesRequested, loading, error, refetch, bulkReview, handleExtension } = useMentorApprovals();
  const [tab, setTab] = useState<Tab>('review');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [extBusy, setExtBusy] = useState<string | null>(null);
  // Mentor-chosen new due date per extension request (YYYY-MM-DD).
  const [extDates, setExtDates] = useState<Record<string, string>>({});

  // To-review controls.
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [groupByTask, setGroupByTask] = useState(false);

  // Sent-back controls (its own search + sort + decision filter, independent of To-review).
  const [changesSearch, setChangesSearch] = useState('');
  const [changesNewestFirst, setChangesNewestFirst] = useState(true);
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'changes' | 'rejected'>('all');

  // A deadline is the MENTEE's calendar day — compute "today" and the current
  // due date in THEIR timezone (not UTC / the mentor's browser) so the date the
  // mentor picks matches what the mentee experiences and what the server anchors.
  const todayStr = (item: ApprovalItem) => todayInZone(item.menteeTimezone || undefined);
  const suggestedDate = (item: ApprovalItem) => {
    const tz = item.menteeTimezone || undefined;
    const today = todayInZone(tz);
    const dueStr = item.dueDate ? dateInZone(item.dueDate, tz) : '';
    // Start from the later of today / current due (so it's always in the future
    // even when overdue), then add the requested days.
    const base = dueStr && dueStr > today ? dueStr : today;
    return addDaysToDateStr(base, item.extensionDays || 3);
  };

  // Split the queue: work submissions to review vs pending extension requests.
  const reviewItems = useMemo(() => queue.filter((q) => !q.isExtensionRequest), [queue]);
  const extensionItems = useMemo(() => queue.filter((q) => q.isExtensionRequest), [queue]);

  // Apply search + late-only + sort to the To-review list (queue is already loaded).
  const filteredReview = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = reviewItems;
    if (q) {
      list = list.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.mentee?.name || '').toLowerCase().includes(q)
      );
    }
    if (lateOnly) list = list.filter((it) => it.isLate);
    const sorted = [...list].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    );
    return newestFirst ? sorted.reverse() : sorted;
  }, [reviewItems, search, lateOnly, newestFirst]);

  // Cluster filtered items by task (roadmapTaskId, falling back to title).
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: ApprovalItem[] }>();
    for (const it of filteredReview) {
      const key = it.roadmapTaskId ?? `title:${it.title}`;
      if (!map.has(key)) map.set(key, { title: it.title, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.values()];
  }, [filteredReview]);

  // Counts per decision (for the filter chips), independent of search.
  const changesCounts = useMemo(() => ({
    all: changesRequested.length,
    changes: changesRequested.filter((it) => it.decision === 'changes').length,
    rejected: changesRequested.filter((it) => it.decision === 'rejected').length,
  }), [changesRequested]);

  // Apply decision filter + search + sort to the Sent-back list.
  const filteredChanges = useMemo(() => {
    const q = changesSearch.trim().toLowerCase();
    let list = changesRequested;
    if (decisionFilter !== 'all') list = list.filter((it) => it.decision === decisionFilter);
    if (q) {
      list = list.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.mentee?.name || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort(
      (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
    );
    return changesNewestFirst ? sorted.reverse() : sorted;
  }, [changesRequested, changesSearch, changesNewestFirst, decisionFilter]);

  const selectedItems = useMemo(
    () => queue.filter((q) => selected.has(q.submissionId)),
    [queue, selected]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allFilteredSelected =
    filteredReview.length > 0 && filteredReview.every((q) => selected.has(q.submissionId));
  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredReview.forEach((q) => next.delete(q.submissionId));
      else filteredReview.forEach((q) => next.add(q.submissionId));
      return next;
    });
  };

  // Select / deselect every item within one task group.
  const groupAllSelected = (g: { items: ApprovalItem[] }) =>
    g.items.length > 0 && g.items.every((q) => selected.has(q.submissionId));
  const toggleGroup = (g: { items: ApprovalItem[] }) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (groupAllSelected(g)) g.items.forEach((q) => next.delete(q.submissionId));
      else g.items.forEach((q) => next.add(q.submissionId));
      return next;
    });

  const runBulkReview = async (submissionIds: string[], payload: Parameters<typeof bulkReview>[1]) => {
    await bulkReview(submissionIds, payload);
    setSelected(new Set());
    toast.success(`Reviewed ${submissionIds.length} submission${submissionIds.length === 1 ? '' : 's'}`);
  };

  const decideExtension = async (item: ApprovalItem, approved: boolean) => {
    const newDate = approved ? (extDates[item.submissionId] || suggestedDate(item)) : undefined;
    try {
      setExtBusy(item.submissionId);
      await handleExtension(item.submissionId, approved, newDate);
      toast.success(
        approved
          ? `Extension approved — new due date ${new Date(`${newDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'Extension declined'
      );
    } catch {
      toast.error('Could not update the extension request');
    } finally {
      setExtBusy(null);
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'review', label: 'To review', count: reviewItems.length },
    { key: 'changes', label: 'Sent back', count: changesRequested.length },
    { key: 'extensions', label: 'Extension requests', count: extensionItems.length },
  ];

  // A single waiting-age badge, amber once a submission has waited >= 3 days.
  const WaitBadge = ({ iso }: { iso: string }) => {
    const stale = waitingDays(iso) >= 3;
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] ${
          stale ? 'bg-amber-100 text-amber-700' : 'text-slate-500'
        }`}
        title={stale ? 'Waiting 3+ days' : undefined}
      >
        <Clock className="w-3 h-3" />
        {timeAgo(iso)}
      </span>
    );
  };

  // Shared row body for a To-review item (used flat AND inside groups).
  const ReviewRow = ({ item }: { item: ApprovalItem }) => (
    <div className="flex items-center gap-4 px-5 py-4">
      <input
        type="checkbox"
        checked={selected.has(item.submissionId)}
        onChange={() => toggle(item.submissionId)}
        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
      />

      <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
        <span className="text-brand-700 text-xs font-medium">{item.mentee?.avatar}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
          <span>{item.mentee?.name}</span>
          {item.type && (<><span className="text-slate-300">·</span><span className="capitalize">{item.type}</span></>)}
          <span className="text-slate-300">·</span>
          <WaitBadge iso={item.submittedAt} />
          {item.isLate && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
              <Clock className="w-3 h-3" />late
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => setReviewing(item)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700 shrink-0"
      >
        Review <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Approvals</h1>
          <p className="text-slate-600">
            {loading
              ? 'Loading…'
              : `${reviewItems.length} submission${reviewItems.length === 1 ? '' : 's'} to review` +
                (changesRequested.length ? ` · ${changesRequested.length} awaiting resubmission` : '') +
                (extensionItems.length ? ` · ${extensionItems.length} extension request${extensionItems.length === 1 ? '' : 's'}` : '')}
          </p>
        </div>
        {tab === 'review' && (
          <button
            onClick={() => setBulkOpen(true)}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
          >
            <ClipboardCheck className="w-4 h-4" />
            Review{selected.size > 0 ? ` ${selected.size}` : ''} selected
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs ${
                t.key === 'extensions' ? 'bg-amber-100 text-amber-700'
                  : t.key === 'changes' ? 'bg-orange-100 text-orange-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading / error */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : tab === 'review' ? (
        /* ── To review ───────────────────────────────────────────── */
        <>
          {/* Controls */}
          {reviewItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search mentee or task…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={() => setNewestFirst((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700"
                title="Toggle sort order"
              >
                <ArrowDownUp className="w-4 h-4" />
                {newestFirst ? 'Newest first' : 'Oldest first'}
              </button>
              <button
                onClick={() => setLateOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm ${
                  lateOnly
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                Late only
              </button>
              <button
                onClick={() => setGroupByTask((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm ${
                  groupByTask
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                <Layers className="w-4 h-4" />
                Group by task
              </button>
            </div>
          )}

          {/* Select-all affordance for the current filtered set */}
          {filteredReview.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <button onClick={selectAllFiltered} className="inline-flex items-center gap-2 hover:text-slate-700">
                <input
                  type="checkbox"
                  readOnly
                  checked={allFilteredSelected}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600"
                />
                Select all ({filteredReview.length})
              </button>
              {selected.size > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => setSelected(new Set())} className="hover:text-slate-700">
                    Clear selection ({selected.size})
                  </button>
                </>
              )}
            </div>
          )}

          {reviewItems.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-brand-300 mx-auto mb-3" />
              <p className="text-slate-600">All caught up - nothing waiting on you.</p>
            </div>
          ) : filteredReview.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <p className="text-slate-600">No submissions match these filters.</p>
            </div>
          ) : groupByTask ? (
            /* Grouped by task */
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.title + g.items[0]?.submissionId} className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <input
                      type="checkbox"
                      checked={groupAllSelected(g)}
                      onChange={() => toggleGroup(g)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
                    />
                    <p className="text-sm font-semibold text-slate-800 truncate flex-1">{g.title}</p>
                    <span className="text-xs text-slate-500 shrink-0">{g.items.length} submission{g.items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.items.map((item) => <ReviewRow key={item.submissionId} item={item} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Flat list */
            <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {filteredReview.map((item) => <ReviewRow key={item.submissionId} item={item} />)}
            </div>
          )}
        </>
      ) : tab === 'changes' ? (
        /* ── Changes requested (awaiting resubmission) ───────────── */
        <>
          {changesRequested.length > 0 && (
            <div className="space-y-3">
              {/* Decision filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: 'all' as const, label: 'All', count: changesCounts.all, active: 'bg-slate-900 text-white border-slate-900', dot: '' },
                  { key: 'changes' as const, label: 'Changes requested', count: changesCounts.changes, active: 'bg-orange-600 text-white border-orange-600', dot: 'bg-orange-500' },
                  { key: 'rejected' as const, label: 'Rejected', count: changesCounts.rejected, active: 'bg-red-600 text-white border-red-600', dot: 'bg-red-500' },
                ]).map((chip) => {
                  const isActive = decisionFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setDecisionFilter(chip.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                        isActive ? chip.active : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {chip.dot && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/80' : chip.dot}`} />}
                      {chip.label}
                      <span className={`text-xs ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{chip.count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search + sort */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={changesSearch}
                    onChange={(e) => setChangesSearch(e.target.value)}
                    placeholder="Search mentee or task…"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={() => setChangesNewestFirst((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  title="Toggle sort order"
                >
                  <ArrowDownUp className="w-4 h-4" />
                  {changesNewestFirst ? 'Newest first' : 'Oldest first'}
                </button>
              </div>
            </div>
          )}

          {changesRequested.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">Nothing waiting on a resubmission.</p>
              <p className="text-slate-400 text-sm mt-1">Tasks you send back for changes show up here until the mentee resubmits.</p>
            </div>
          ) : filteredChanges.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <p className="text-slate-600">No tasks match these filters.</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {filteredChanges.map((item) => {
                const isRejected = item.decision === 'rejected';
                return (
                <div key={item.taskId} className="flex items-start gap-4 px-5 py-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isRejected ? 'bg-red-100' : 'bg-orange-100'}`}>
                    <span className={`text-xs font-medium ${isRejected ? 'text-red-700' : 'text-orange-700'}`}>{item.mentee?.avatar}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      {isRejected ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px]">
                          <XCircle className="w-3 h-3" />
                          rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[11px]">
                          <RotateCcw className="w-3 h-3" />
                          changes requested
                        </span>
                      )}
                      {item.revisionCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                          revision {item.revisionCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                      <span>{item.mentee?.name}</span>
                      {item.type && (<><span className="text-slate-300">·</span><span className="capitalize">{item.type}</span></>)}
                      <span className="text-slate-300">·</span>
                      <span>sent back {timeAgo(item.requestedAt)}</span>
                      {item.isLate && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                          <Clock className="w-3 h-3" />late
                        </span>
                      )}
                    </div>
                    {(item.revisionNotes || item.feedbackText) && (
                      <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <span className="text-slate-400">{isRejected ? 'Rejection reason: ' : 'You asked for: '}</span>
                        {item.revisionNotes || item.feedbackText}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/mentor/tasks/${item.taskId}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700 shrink-0"
                  >
                    View task <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Extension requests ──────────────────────────────────── */
        extensionItems.length === 0 ? (
          <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
            <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No extension requests right now.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {extensionItems.map((item) => {
              const busy = extBusy === item.submissionId;
              return (
                <div key={item.submissionId} className="flex items-start gap-4 px-5 py-4">
                  <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-amber-700 text-xs font-medium">{item.mentee?.avatar}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">
                        <CalendarClock className="w-3 h-3" />
                        {item.extensionDays ? `+${item.extensionDays} day${item.extensionDays === 1 ? '' : 's'}` : 'extension'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{item.mentee?.name}</span>
                      <span className="text-slate-300">·</span>
                      <span>{timeAgo(item.submittedAt)}</span>
                      {item.isLate && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                          <Clock className="w-3 h-3" />late
                        </span>
                      )}
                    </div>
                    {item.extensionReason && (
                      <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        “{item.extensionReason}”
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      New due date
                      <input
                        type="date"
                        min={todayStr(item)}
                        value={extDates[item.submissionId] || suggestedDate(item)}
                        onChange={(e) => setExtDates((p) => ({ ...p, [item.submissionId]: e.target.value }))}
                        disabled={busy}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </label>
                    <span className="text-[10px] text-slate-400">Ends 11:59 PM {item.menteeTimezone ? `(${zoneLabel(item.menteeTimezone)})` : ''} in the mentee&apos;s timezone</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        onClick={() => decideExtension(item, false)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Decline
                      </button>
                      <button
                        onClick={() => decideExtension(item, true)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {reviewing && (
        <ReviewDrawer
          item={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => { setSelected(new Set()); refetch(); }}
        />
      )}

      {bulkOpen && selectedItems.length > 0 && (
        <BulkReviewDrawer
          items={selectedItems}
          onClose={() => setBulkOpen(false)}
          onReviewed={() => {}}
          onSubmit={runBulkReview}
        />
      )}
    </div>
  );
}
