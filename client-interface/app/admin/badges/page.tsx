'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { Drawer } from '@/components/shared/Drawer';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { gamificationApi } from '@/lib/services/gamification-api';
import {
  BADGE_ICON_PRESETS,
  BadgeEmblem,
  PresetIconGlyph,
  defaultPresetForBadge,
  parseBadgeIconUrl,
  storedIconValue,
  type BadgeIconPreset,
} from '@/components/shared/BadgeEmblem';

type Badge = {
  id: string; name: string; description: string; category: string; audience: 'mentee' | 'mentor';
  criteriaType: string; criteriaValue: Record<string, number | boolean | string>; pointsReward: number;
  isActive: boolean; retiredAt: string | null; totalUnlocked: number; iconUrl?: string | null;
};
type Member = { id: string; firstName: string; lastName: string };
type AuditEntry = {
  id: string; action: string; createdAt: string; user?: Member;
  newValues?: { reason?: string; userId?: string; xpPreserved?: boolean; reawardBlocked?: boolean };
};
type AwardEntry = {
  id: string; userId: string; unlockedAt: string; revokedAt: string | null;
  revokeReason?: string | null; User?: Member;
};
type History = { history: AuditEntry[]; awards: AwardEntry[] };

const AUDIT_LABELS: Record<string, { title: string; tone: string }> = {
  'badge.created': { title: 'Badge created', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  'badge.updated': { title: 'Badge updated', tone: 'bg-slate-100 text-slate-800 ring-slate-200' },
  'badge.awarded': { title: 'Awarded to member', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  'badge.revoked': { title: 'Award revoked', tone: 'bg-rose-50 text-rose-800 ring-rose-200' },
};

const menteeRules: Record<string, [string, string]> = {
  custom: ['Admin-verified recognition (manual)', ''],
  tasks_completed: ['Tasks completed', 'count'],
  programs_completed: ['Programs completed', 'count'],
  badges_earned: ['Badges earned', 'count'],
  streak_days: ['Daily activity streak', 'days'],
  points_milestone: ['Total XP', 'threshold'],
  avg_rating: ['Average task rating', 'minRating'],
  level_reached: ['Level reached', 'level'],
};

const mentorRules: Record<string, [string, string]> = {
  custom: ['Admin-verified recognition (manual)', ''],
  mentor_accepted_answers: ['Accepted community answers', 'count'],
  mentor_qualifying_reviews: ['Qualifying task reviews', 'count'],
  mentor_distinct_mentees: ['Distinct mentees reviewed', 'menteeCount'],
  mentor_rating: ['Mentor rating average', 'minRating'],
  mentor_sessions_finished: ['Finished review sessions', 'count'],
  mentor_cert_verifications: ['Certificate verifications completed', 'count'],
};

const rules: Record<string, [string, string]> = { ...menteeRules, ...mentorRules };

const MENTOR_RULE_HELP: Record<string, string> = {
  custom: 'You award this with written evidence. Not granted automatically.',
  mentor_accepted_answers: 'Counts answers accepted by someone else (same ledger as mentor XP). Self-accepts excluded.',
  mentor_qualifying_reviews: 'Counts individual reviews. Excludes bulk rubber-stamps like “Approved.” without notes, inline feedback, or checked criteria.',
  mentor_distinct_mentees: 'Same qualifying reviews, counted by different mentees.',
  mentor_rating: 'Uses program reviews attributed to this mentor. Needs at least 3 reviews (product minimum) before the average can unlock.',
  mentor_sessions_finished: 'Counts finished cohort review sessions this mentor started. Scheduled-only sessions do not count.',
  mentor_cert_verifications: 'Counts certificate rows they verified (verifiedBy). Clan role alone is not enough.',
};
const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function personName(user?: Member | null) {
  if (!user) return 'System';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || 'Unknown member';
}

export default function BadgesPage() {
  const confirm = useConfirm();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Badge | 'new' | null>(null);
  const [selected, setSelected] = useState<Badge | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [seedResult, setSeedResult] = useState<null | {
    created: number;
    skipped: number;
    createdNames: string[];
  }>(null);
  const [highlightNames, setHighlightNames] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: { badges: Badge[] } }>('/gamification/badges?active=all');
      setBadges(res.data.badges); setError('');
    } catch (e) { setError(extractApiErrorMessage(e, 'Could not load badges')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      if (search.trim().length < 2) { setMembers([]); return; }
      try {
        const res = await apiClient.get<{ data: { members: Member[] } }>('/gamification/badge-recipients', { params: { search } });
        if (current) setMembers(res.data.members);
      } catch { if (current) toast.error('Could not search members'); }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [search]);
  const readHistory = async (badge: Badge) => {
    setSelected(badge); setHistory(null); setMemberId(''); setReason(''); setSearch('');
    try { setHistory((await apiClient.get<{ data: History }>(`/gamification/badges/${badge.id}/history`)).data); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not load history')); }
  };
  const act = async (operation: () => Promise<unknown>, successMessage = 'Saved') => {
    setBusy(true);
    try {
      await operation();
      await load();
      if (selected) await readHistory(selected);
      toast.success(successMessage);
    }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save')); }
    finally { setBusy(false); }
  };

  const addDefaultBadges = async () => {
    const ok = await confirm({
      title: 'Add default badges?',
      description:
        'Adds Pathment’s starter set for this organization only: mentee automatic badges (published) and mentor recognition drafts (unpublished). Existing badges with the same name are left unchanged. No users are awarded.',
      confirmLabel: 'Add defaults',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiClient.post<{
        message?: string;
        data: { created: number; skipped: number; createdNames?: string[]; count: number };
      }>('/gamification/setup-badges');
      const created = Number(res.data?.created || 0);
      const skipped = Number(res.data?.skipped || 0);
      const createdNames = res.data?.createdNames || [];
      setSeedResult({ created, skipped, createdNames });
      setHighlightNames(createdNames);
      await load();
      if (created > 0) {
        toast.success(`Added ${created} default badge${created === 1 ? '' : 's'}`, {
          description: createdNames.slice(0, 4).join(', ') + (createdNames.length > 4 ? ` (+${createdNames.length - 4} more)` : ''),
        });
      } else {
        toast.message('Defaults already present', {
          description: `${skipped} badges verified — nothing new was added.`,
        });
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add default badges'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1>Organization badges</h1>
        <p className="text-sm text-slate-500">Recognize mentors and mentees. Published automatic badges are checked during activity; manual badges require evidence.</p>
      </div>
      <div className="flex gap-2">
        <button className={button} disabled={busy} onClick={() => void addDefaultBadges()}>
          {busy ? 'Working…' : 'Add default badges'}
        </button>
        <button className={button} onClick={() => setEditing('new')}>Create badge</button>
      </div>
    </div>
    <p className="text-sm text-slate-500">Rules and XP become fixed once a badge is earned. Pause stops new awards; retirement is permanent. Revocation preserves historical XP and blocks re-award for the same person. Icons can always be updated — awards reuse the badge definition.</p>

    {seedResult && (
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          seedResult.created > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
            : 'border-slate-200 bg-slate-50 text-slate-800'
        }`}
        role="status"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {seedResult.created > 0
                ? `Added ${seedResult.created} default badge${seedResult.created === 1 ? '' : 's'}`
                : 'Default badges already set up'}
            </p>
            <p className="mt-1 opacity-80">
              {seedResult.created > 0
                ? `${seedResult.skipped} were already in this organization and were skipped. New cards are highlighted below.`
                : `${seedResult.skipped} defaults were checked — none needed to be created.`}
            </p>
            {seedResult.createdNames.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {seedResult.createdNames.map((name) => (
                  <li key={name} className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium ring-1 ring-emerald-200">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="text-xs font-medium underline-offset-2 hover:underline"
            onClick={() => { setSeedResult(null); setHighlightNames([]); }}
          >
            Dismiss
          </button>
        </div>
      </div>
    )}

    {(() => {
      const drafts = badges.filter(b => !b.isActive && !b.retiredAt && b.audience === 'mentor');
      if (!drafts.length) return null;
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Unpublished mentor recognition ({drafts.length})</p>
          <p className="mt-1 text-amber-900/80">Draft mentor badges are invisible to mentors until you publish them. Open each card and choose Publish when the evidence rule is ready.</p>
          <ul className="mt-2 list-disc pl-5 text-amber-900/90">{drafts.map(d => <li key={d.id}>{d.name}</li>)}</ul>
        </div>
      );
    })()}
    {loading && <p>Loading badges…</p>}
    {error && <div role="alert">{error} <button className={button} onClick={load}>Retry</button></div>}
    {!loading && !error && !badges.length && <p>No badges yet. Create one or add the defaults.</p>}
    <div className="grid gap-4 md:grid-cols-2">{[...badges].sort((a, b) => {
      const draftScore = (x: Badge) => (!x.isActive && !x.retiredAt ? 0 : 1);
      const highlightScore = (x: Badge) => (highlightNames.includes(x.name) ? 0 : 1);
      return highlightScore(a) - highlightScore(b) || draftScore(a) - draftScore(b) || a.name.localeCompare(b.name);
    }).map(b => {
      const justAdded = highlightNames.includes(b.name);
      return (
      <article
        key={b.id}
        className={`rounded-xl border bg-card p-5 space-y-3 ${
          justAdded
            ? 'border-emerald-400 ring-2 ring-emerald-100'
            : !b.isActive && !b.retiredAt
              ? 'border-amber-300 ring-1 ring-amber-100'
              : 'border-slate-200'
        }`}
      >
      <div className="flex items-start gap-3">
        <BadgeEmblem name={b.name} category={b.category} criteriaType={b.criteriaType} iconUrl={b.iconUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{b.name}</h2>
            {justAdded && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Just added
              </span>
            )}
          </div>
          <p className="text-sm">{b.description}</p>
        </div>
      </div>
      <p className="text-sm text-slate-500">{b.audience} · {b.pointsReward} XP · {b.retiredAt ? 'Retired' : b.isActive ? 'Published' : 'Paused / draft'} · {b.criteriaType === 'custom' ? 'Manual award' : rules[b.criteriaType]?.[0] || b.criteriaType}</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || Boolean(b.retiredAt)} onClick={() => setEditing(b)}>Edit</button>
        <button className={button} disabled={busy || Boolean(b.retiredAt)} onClick={() => act(() => apiClient.patch(`/gamification/badges/${b.id}`, { isActive: !b.isActive }))}>{b.isActive ? 'Pause' : 'Publish'}</button>
        <button className={button} disabled={busy || Boolean(b.retiredAt)} onClick={async () => {
          if (await confirm({ title: 'Retire badge?', description: 'Existing awards remain. This badge cannot be published again.', confirmLabel: 'Retire' }))
            await act(() => apiClient.patch(`/gamification/badges/${b.id}`, { retire: true }));
        }}>Retire</button>
        <button className={button} disabled={busy} onClick={() => readHistory(b)}>Awards and history</button>
      </div>
    </article>
    );})}</div>
    {editing && <BadgeEditor badge={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    {selected && (
      <BadgeAwardsDrawer
        badge={selected}
        history={history}
        busy={busy}
        reason={reason}
        setReason={setReason}
        search={search}
        setSearch={setSearch}
        members={members}
        memberId={memberId}
        setMemberId={setMemberId}
        onClose={() => setSelected(null)}
        onAct={act}
      />
    )}
  </div>;
}

function BadgeAwardsDrawer({
  badge,
  history,
  busy,
  reason,
  setReason,
  search,
  setSearch,
  members,
  memberId,
  setMemberId,
  onClose,
  onAct,
}: {
  badge: Badge;
  history: History | null;
  busy: boolean;
  reason: string;
  setReason: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  members: Member[];
  memberId: string;
  setMemberId: (value: string) => void;
  onClose: () => void;
  onAct: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const [awardFilter, setAwardFilter] = useState<'active' | 'revoked' | 'all'>('active');
  const canAward = badge.isActive && !badge.retiredAt;
  const reasonReady = reason.trim().length >= 10;
  const awards = history?.awards || [];
  const activeCount = awards.filter((a) => !a.revokedAt).length;
  const revokedCount = awards.filter((a) => a.revokedAt).length;
  const filtered = awards.filter((a) => {
    if (awardFilter === 'active') return !a.revokedAt;
    if (awardFilter === 'revoked') return Boolean(a.revokedAt);
    return true;
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={badge.name}
      subtitle="Award members, review who holds this badge, and check the audit trail"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 ring-1 ring-emerald-200">
            {activeCount} active
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
            {revokedCount} revoked
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
            {badge.pointsReward} XP on award
          </span>
        </div>

        {!canAward && (
          <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Revocation reason</h2>
            <p className="text-xs text-slate-500">
              {badge.retiredAt
                ? 'This badge is retired — new awards are closed. You can still revoke existing ones with a reason below.'
                : 'Publish this badge to award new members. You can still revoke existing awards with a reason below.'}
            </p>
            <label className="block text-sm text-slate-700">
              Reason
              <textarea
                className={`${field} mt-1 min-h-[72px]`}
                value={reason}
                maxLength={2000}
                placeholder="Why is this award being revoked?"
                onChange={(e) => setReason(e.target.value)}
              />
              <span className={`mt-1 block text-xs ${reasonReady ? 'text-slate-500' : 'text-amber-700'}`}>
                {reason.trim().length}/10 characters minimum
              </span>
            </label>
          </section>
        )}

        {canAward ? (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Award this badge</h2>
              <p className="mt-1 text-xs text-slate-500">
                Add clear evidence (at least 10 characters). Mentors and mentees see the badge; XP is added once from this definition.
              </p>
            </div>
            <label className="block text-sm text-slate-700">
              Evidence
              <textarea
                className={`${field} mt-1 min-h-[88px]`}
                value={reason}
                maxLength={2000}
                placeholder="What did this person do that earns recognition?"
                onChange={(e) => setReason(e.target.value)}
              />
              <span className={`mt-1 block text-xs ${reasonReady ? 'text-slate-500' : 'text-amber-700'}`}>
                {reason.trim().length}/10 characters minimum
              </span>
            </label>
            <label className="block text-sm text-slate-700">
              Find member
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${field} pl-9`}
                  value={search}
                  placeholder="Type at least 2 letters"
                  onChange={(e) => { setSearch(e.target.value); setMemberId(''); }}
                />
              </div>
            </label>
            <label className="block text-sm text-slate-700">
              Recipient
              <select className={`${field} mt-1`} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">{members.length ? 'Select member' : (search.trim().length < 2 ? 'Start typing a name' : 'No matches')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`${button} bg-brand-600 text-white border-brand-600 hover:bg-brand-700`}
              disabled={busy || !memberId || !reasonReady}
              onClick={() => onAct(() => apiClient.post('/gamification/badges/award', {
                userId: memberId, badgeId: badge.id, context: { reason },
              }))}
            >
              Award with evidence
            </button>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Who has this badge</h2>
              <p className="text-xs text-slate-500">Revoking keeps historical XP and blocks re-award for the same person.</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {([
                ['active', `Active (${activeCount})`],
                ['revoked', `Revoked (${revokedCount})`],
                ['all', `All (${awards.length})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-md px-2.5 py-1 font-medium ${awardFilter === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setAwardFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!history && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading awards…
            </p>
          )}
          {history && !filtered.length && (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              {awardFilter === 'active' && 'No active awards yet.'}
              {awardFilter === 'revoked' && 'No revoked awards.'}
              {awardFilter === 'all' && 'No awards recorded for this badge.'}
            </div>
          )}
          <ul className="space-y-2">
            {filtered.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{personName(a.User)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.revokedAt ? `Revoked · earned ${formatWhen(a.unlockedAt)}` : `Earned ${formatWhen(a.unlockedAt)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                    a.revokedAt ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  }`}>
                    {a.revokedAt ? 'Revoked' : 'Active'}
                  </span>
                </div>
                {!a.revokedAt && (
                  <button
                    type="button"
                    className={`${button} mt-3 text-rose-700 border-rose-200 hover:bg-rose-50`}
                    disabled={busy || !reasonReady}
                    title={!reasonReady ? 'Enter a revocation reason in the evidence field (10+ characters)' : 'Revoke this award'}
                    onClick={() => onAct(() => apiClient.post(`/gamification/badges/${badge.id}/revoke`, {
                      userId: a.userId, reason,
                    }))}
                  >
                    Revoke award
                  </button>
                )}
                {a.revokedAt && (
                  <p className="mt-2 text-xs text-slate-500">Re-award blocked · historical XP kept</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={showAudit}
            onClick={() => setShowAudit((open) => !open)}
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Audit trail</h2>
              <p className="text-xs text-slate-500">
                {history ? `${history.history.length} events · create, update, award, revoke` : 'System activity for this badge'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
              {showAudit ? 'Hide' : 'Show'}
              {showAudit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {showAudit && (
            <div className="border-t border-slate-200 px-4 py-3">
              {!history && <p className="text-sm text-slate-500">Loading audit…</p>}
              {history && !history.history.length && (
                <p className="text-sm text-slate-500">No audit events yet.</p>
              )}
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {history?.history.map((h) => {
                  const meta = AUDIT_LABELS[h.action] || {
                    title: h.action.replace(/^badge\./, '').replace(/_/g, ' '),
                    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
                  };
                  return (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[1.28rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400" aria-hidden />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${meta.tone}`}>
                          {meta.title}
                        </span>
                        <span className="text-xs text-slate-500">{formatWhen(h.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        by {personName(h.user)}
                        {h.newValues?.reason ? (
                          <span className="text-slate-500"> · “{h.newValues.reason}”</span>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function BadgeEditor({ badge, onClose, onSaved }: { badge: Badge | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(badge?.name || '');
  const [description, setDescription] = useState(badge?.description || '');
  const [audience, setAudience] = useState(badge?.audience || 'mentee');
  const [type, setType] = useState(badge?.criteriaType || 'custom');
  const thresholdKey = rules[type]?.[1] || 'count';
  const [value, setValue] = useState(Number(badge?.criteriaValue?.[thresholdKey] || badge?.criteriaValue?.count || 1));
  const [xp, setXp] = useState(badge?.pointsReward || 0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const parsed = useMemo(() => parseBadgeIconUrl(badge?.iconUrl), [badge?.iconUrl]);
  const categoryPreview = badge?.category || (audience === 'mentor' ? 'mentor' : 'achievement');
  const defaultPreset = defaultPresetForBadge({ category: categoryPreview, criteriaType: type });
  const [preset, setPreset] = useState<BadgeIconPreset | 'default'>(
    parsed.kind === 'preset' && parsed.preset ? parsed.preset : 'default'
  );
  const [imageUrl, setImageUrl] = useState<string | null>(parsed.kind === 'image' ? parsed.imageUrl : null);
  const availableRules = audience === 'mentor' ? mentorRules : menteeRules;
  const locked = Boolean(badge?.totalUnlocked) || Boolean(badge && !rules[badge.criteriaType]);
  const isAutomatic = type !== 'custom';

  const previewIconUrl = storedIconValue({
    preset: imageUrl ? null : preset,
    imageUrl,
  });

  const buildCriteriaValue = () => {
    if (type === 'custom') return { manual: true };
    if (type === 'mentor_rating') return { minRating: value, minReviews: 3 };
    const key = rules[type]?.[1] || 'count';
    return { [key]: value };
  };

  const onPickImage = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      const url = await gamificationApi.uploadBadgeImage(file);
      setImageUrl(url);
      setPreset('default');
      toast.success('Artwork uploaded');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    const iconUrl = storedIconValue({ preset: imageUrl ? null : preset, imageUrl });
    const data = {
      name,
      description,
      iconUrl,
      ...(!locked ? {
        audience,
        criteriaType: type,
        criteriaValue: buildCriteriaValue(),
        pointsReward: xp,
      } : {}),
    };
    try {
      if (badge) await apiClient.patch(`/gamification/badges/${badge.id}`, data);
      else await apiClient.post('/gamification/badges', { ...data, category: audience === 'mentor' ? 'mentor' : 'achievement', isActive: false });
      onSaved(); toast.success('Badge saved');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save badge')); }
    finally { setSaving(false); }
  };

  return <Drawer open onClose={onClose} title={badge ? 'Edit badge' : 'Create draft badge'}>
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <BadgeEmblem
          name={name || 'Badge preview'}
          category={categoryPreview}
          criteriaType={type}
          iconUrl={previewIconUrl}
        />
        <div className="min-w-0 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Icon preview</p>
          <p>Defaults follow the badge type. Optional preset or artwork applies everywhere this badge appears.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Icon</legend>
        <p className="text-xs text-slate-500">Optional. Leave on Default to use the category icon ({defaultPreset}).</p>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          <button
            type="button"
            className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] ${preset === 'default' && !imageUrl ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600'}`}
            onClick={() => { setPreset('default'); setImageUrl(null); }}
            aria-pressed={preset === 'default' && !imageUrl}
          >
            <PresetIconGlyph preset={defaultPreset} />
            Default
          </button>
          {BADGE_ICON_PRESETS.map((key) => (
            <button
              key={key}
              type="button"
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] capitalize ${preset === key && !imageUrl ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600'}`}
              onClick={() => { setPreset(key); setImageUrl(null); }}
              aria-pressed={preset === key && !imageUrl}
              aria-label={`Use ${key} icon`}
            >
              <PresetIconGlyph preset={key} />
              {key}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Custom artwork (optional)</p>
        <p className="mb-2 text-xs text-slate-500">PNG, JPG, WebP, or GIF. Stored on the badge definition — not copied per award.</p>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {imageUrl ? 'Replace artwork' : 'Upload artwork'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onPickImage(e.target.files?.[0])}
            />
          </label>
          {imageUrl && (
            <button type="button" className="text-xs text-slate-500 hover:text-rose-600" onClick={() => setImageUrl(null)}>
              Remove artwork
            </button>
          )}
        </div>
      </div>

      <label className="block text-sm">Name<input required maxLength={100} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Description and evidence required<textarea required maxLength={2000} className={field} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="block text-sm">Audience<select disabled={locked} className={field} value={audience} onChange={e => { setAudience(e.target.value as 'mentor' | 'mentee'); setType('custom'); setValue(1); }}><option value="mentee">Mentee</option><option value="mentor">Mentor</option></select></label>

      {audience === 'mentor' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p className="font-medium text-slate-800">{isAutomatic ? 'Automatic award' : 'Manual award'}</p>
          <p className="mt-1">{MENTOR_RULE_HELP[type] || 'Choose a rule below.'}</p>
          {isAutomatic && (
            <p className="mt-1">Past qualifying activity counts toward progress. Publishing does not mass-award; the badge unlocks on the mentor’s next qualifying event after publish.</p>
          )}
        </div>
      )}

      <label className="block text-sm">Rule<select disabled={locked} className={field} value={type} onChange={e => { setType(e.target.value); setValue(1); }}>{Object.entries(availableRules).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}{!availableRules[type] && rules[type] && <option value={type}>{rules[type][0]} (existing)</option>}</select></label>
      {type !== 'custom' && (
        <label className="block text-sm">
          {type === 'mentor_rating' ? 'Minimum average rating' : 'Threshold'}
          <input
            disabled={locked}
            required
            type="number"
            min={type === 'avg_rating' || type === 'mentor_rating' ? 0.1 : 1}
            max={['avg_rating', 'level_reached', 'mentor_rating'].includes(type) ? 5 : undefined}
            step={type === 'avg_rating' || type === 'mentor_rating' ? 0.1 : 1}
            className={field}
            value={value}
            onChange={e => setValue(Number(e.target.value))}
          />
        </label>
      )}
      <label className="block text-sm">XP reward<input disabled={locked} required type="number" min={0} max={10000} step={1} className={field} value={xp} onChange={e => setXp(Number(e.target.value))} /></label>
      {locked && <p className="text-sm text-slate-500">The existing rules and XP are preserved. Icons can still be changed. Create a new badge for different rules.</p>}
      <button disabled={saving || uploading} className={button} type="submit">{saving ? 'Saving…' : 'Save badge'}</button>
    </form>
  </Drawer>;
}
