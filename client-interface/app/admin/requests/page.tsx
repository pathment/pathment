'use client';

import { Suspense, useEffect, useState } from 'react';
import { AdminScopeFilter } from '@/components/admin/AdminScopeFilter';
import { useAdminScope, ALL_PROGRAMS, ALL_CLANS_IN_SCOPE } from '@/lib/context/AdminScopeContext';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { GitPullRequest, Loader2, Check, X, Plus, Trash2, ArrowRight, Search, UserRound, MessageSquareQuote } from 'lucide-react';
import { useClanRequests, type ChangeRequest } from '@/lib/hooks/admin';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';
import { apiClient } from '@/lib/services/api-client';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { StandingClanRequests } from '@/components/shared/StandingClanRequests';

type Tab = 'requests' | 'cross' | 'standing';
const CROSS_KINDS = [
  { key: 'cover', label: 'Mentor cover' },
  { key: 'specialist', label: 'Specialist' },
  { key: 'co_mentee_access', label: 'Co-mentee access' },
];
const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', denied: 'bg-slate-100 text-slate-500',
  // A mentor withdrew their own request before anyone decided.
  cancelled: 'bg-slate-100 text-slate-500',
};
const CROSS_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', active: 'bg-emerald-100 text-emerald-700', declined: 'bg-slate-100 text-slate-500',
};
const CROSS_STATUS_LABEL: Record<string, string> = { pending: 'Awaiting acceptance', active: 'Active', declined: 'Declined' };

function AdminClanRequestsInner() {
  const { requests, crossClan, loading, error, refetch } = useClanRequests();
  const [tab, setTab] = useState<Tab>('requests');
  const searchParams = useSearchParams();

  // Deep-link support: /admin/requests?tab=cross opens the Cross-clan tab
  // (e.g. from the "Cross-clan cover arranged" notification) - reactive, so it
  // also switches when the user is already on the page.
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'cross' || t === 'requests' || t === 'standing') setTab(t);
  }, [searchParams]);
  const [busy, setBusy] = useState<string | null>(null);

  // cross-clan form
  const [ccKind, setCcKind] = useState('cover');
  const [ccNote, setCcNote] = useState('');
  const [ccUserQuery, setCcUserQuery] = useState('');
  const [ccUserResults, setCcUserResults] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [ccUser, setCcUser] = useState<{ id: string; name: string } | null>(null);
  const [ccToClan, setCcToClan] = useState('');
  const [ccFromClan, setCcFromClan] = useState('');
  const [clans, setClans] = useState<{ id: string; name: string; programId: string | null; kind: string; takingPeople: boolean }[]>([]);
  const [showCcForm, setShowCcForm] = useState(false);

  const act = async (id: string, fn: () => Promise<unknown>, msg = 'Done') => {
    try { setBusy(id); await fn(); toast.success(msg); refetch(); } catch (e: any) { toast.error(e?.response?.data?.message || 'Action failed'); } finally { setBusy(null); }
  };

  /*
   * Deciding a mentee's own request.
   *
   * The other two origins name their destination when they are raised, so the
   * inline Approve is a complete decision and stays as it was. A mentee's ask
   * often names none at all - that is the whole point of letting them raise one
   * - so approving it means CHOOSING a clan, and there is nowhere on a row to
   * do that. It also means a denial has to carry a reason: the mentee is told
   * the outcome either way, and "no" with nothing after it just produces the
   * same request again next week.
   */
  const [deciding, setDeciding] = useState<{ request: ChangeRequest; approve: boolean } | null>(null);
  const [decisionClan, setDecisionClan] = useState('');
  const [decisionNote, setDecisionNote] = useState('');

  const openDecision = (request: ChangeRequest, approve: boolean) => {
    setDeciding({ request, approve });
    // Their stated preference, pre-selected - it is usually the right answer,
    // and the admin only has to intervene when it is not.
    setDecisionClan(approve ? (request.toClanId || '') : '');
    setDecisionNote('');
  };

  const submitDecision = async () => {
    if (!deciding) return;
    const { request, approve } = deciding;
    if (approve && !decisionClan) { toast.error('Choose the clan to move them into'); return; }
    if (!approve && !decisionNote.trim()) { toast.error('Explain the decision so the mentee knows where they stand'); return; }
    try {
      setBusy(request.id);
      await clanRequestsApi.resolveRequest(
        request.id,
        approve ? 'approved' : 'denied',
        decisionNote.trim() || undefined,
        approve ? decisionClan : undefined,
      );
      toast.success(approve ? 'Approved - mentee moved' : 'Denied, and the mentee has been told');
      setDeciding(null);
      refetch();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally { setBusy(null); }
  };

  /**
   * Where this person can actually be sent.
   *
   * Bounded by the request's programme only for a MOVE. A placement comes out
   * of a closed or standing clan, which approving does not end, so bounding it
   * by that clan's programme offered an empty picker for exactly the people
   * with nowhere left to go — the case the mentee raised it about.
   */
  const destinationsFor = (request: ChangeRequest) => clans.filter((c) => {
    if (c.id === request.fromClanId || !c.takingPeople) return false;
    if (request.moveKind === 'placement') return true;
    return !request.programId || c.programId === request.programId;
  });

  // Load clans for the cross-clan pickers.
  useEffect(() => {
    apiClient.get<any>('/clans').then((r) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      programId: c.programId ?? c.program?.id ?? null,
      kind: c.kind ?? 'cohort',
      // A frozen clan, a standing clan or one whose program has closed is a
      // record, not somewhere to send a person.
      takingPeople: (c.kind ?? 'cohort') === 'cohort' && !c.frozenAt && !c.program?.closedAt,
    })))).catch(() => {});
  }, []);

  // Debounced person search for the cross-clan helper.
  useEffect(() => {
    const q = ccUserQuery.trim();
    if (q.length < 2) { setCcUserResults([]); return; }
    const t = setTimeout(() => {
      apiClient.get<any>('/messaging/users/search', { params: { q, limit: 10 } })
        .then((r) => setCcUserResults(r.data?.users || [])).catch(() => setCcUserResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [ccUserQuery]);

  const addCross = async () => {
    if (!ccUser) { toast.error('Pick the person who will help'); return; }
    if (!ccToClan) { toast.error('Pick the clan they will help'); return; }
    try {
      setBusy('cc');
      await clanRequestsApi.createCrossClan({
        kind: ccKind,
        userId: ccUser.id,
        toClanId: ccToClan,
        fromClanId: ccFromClan || undefined,
        note: ccNote.trim() || undefined,
      });
      toast.success(`${ccUser.name} can now help that clan`);
      setCcUser(null); setCcUserQuery(''); setCcToClan(''); setCcFromClan(''); setCcNote(''); setShowCcForm(false);
      refetch();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add'); } finally { setBusy(null); }
  };

  /**
   * The queue, narrowed to the programme (and clan) the admin is working in.
   *
   * With forty-odd clans in a workspace this list is unreadable whole, and
   * "which of these belong to the programme I am running" was not a question
   * it could answer. Filtered in the browser because the whole queue is one
   * small read; a row with no clan on either side is never hidden, because
   * hiding what cannot be classified is how a request goes missing.
   */
  const { programId: scopeProgram, clanId: scopeClan } = useAdminScope();
  const inScope = <T extends { programId?: string | null; fromClanId?: string | null; toClanId?: string | null }>(row: T) => {
    if (scopeClan !== ALL_CLANS_IN_SCOPE) {
      if (!row.fromClanId && !row.toClanId) return true;
      return row.fromClanId === scopeClan || row.toClanId === scopeClan;
    }
    if (scopeProgram !== ALL_PROGRAMS) return !row.programId || row.programId === scopeProgram;
    return true;
  };
  const visibleRequests = requests.filter(inScope);
  const visibleCrossClan = crossClan.filter(inScope);

  const pendingCount = visibleRequests.filter((r) => r.status === 'pending').length;
  const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'requests', label: 'Change requests', count: pendingCount },
    { key: 'cross', label: 'Cross-clan' },
    { key: 'standing', label: 'Standing clans' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2">Clan requests</h1>
        <p className="text-slate-600">Mentee move requests, temporary cross-clan support, and standing clan requests (also actionable from the notification bell).</p>
      </div>

      {/* The programme this queue is about. Shared with the other People
          screens, so it is chosen once. */}
      <AdminScopeFilter showClan />

      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}{t.count ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'standing' ? <StandingClanRequests admin /> : loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* Change requests */}
          {tab === 'requests' && (
            visibleRequests.length === 0 ? (
              <div className="bg-card rounded-2xl border border-slate-200 py-12 px-6 text-center">
                <GitPullRequest className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No clan-change requests</p>
                <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">When a mentee asks to move clan, or a mentor asks another clan to take one of theirs, it shows up here. Approving moves the mentee, and their work goes with them.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleRequests.map((r) => (
                  <div key={r.id} className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{r.mentee}</p>
                        {/* A mentor's ask is already with the receiving clan — say
                            so, so an admin doesn't think it's stuck on them. */}
                        {r.origin === 'mentor' && (
                          <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            Mentor request{r.requestedBy ? ` · ${r.requestedBy}` : ''}
                          </span>
                        )}
                        {/* The mentee asked for this themselves, and only an
                            admin can answer it - no mentor can approve a move
                            out of their own clan. */}
                        {r.origin === 'mentee' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            <UserRound className="w-3 h-3" />Asked by the mentee
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span>{r.fromClan || '-'}</span><ArrowRight className="w-3 h-3" />
                        {/* No destination is a real state, not missing data:
                            the mentee left the choice to whoever picks this up. */}
                        {r.toClan
                          ? <span>{r.toClan}{r.origin === 'mentee' && r.status === 'pending' ? ' (their preference)' : ''}</span>
                          : <span className="italic text-slate-400">{r.status === 'pending' ? 'you choose' : 'not decided'}</span>}
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mt-1">{r.reason}</p>}
                      {r.resolutionNote && (
                        <p className="mt-1 inline-flex items-start gap-1 text-xs text-slate-400">
                          <MessageSquareQuote className="w-3 h-3 mt-0.5 shrink-0" />{r.resolutionNote}
                        </p>
                      )}
                      {r.origin === 'mentor' && r.status === 'pending' && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Waiting on {r.toClan}&apos;s mentors — approve here only if you want to decide it for them.
                        </p>
                      )}
                    </div>
                    {r.status === 'pending' ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => (r.origin === 'mentee'
                            ? openDecision(r, true)
                            : act(r.id, () => clanRequestsApi.resolveRequest(r.id, 'approved'), 'Approved - mentee moved'))}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Approve</button>
                        <button
                          onClick={() => (r.origin === 'mentee'
                            ? openDecision(r, false)
                            : act(r.id, () => clanRequestsApi.resolveRequest(r.id, 'denied'), 'Denied'))}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50"><X className="w-3.5 h-3.5" />Deny</button>
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Cross-clan */}
          {tab === 'cross' && (
            <div className="space-y-4">
              {/* Current assignments first - this is what people come to see. */}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  Cross-clan support {visibleCrossClan.length > 0 && <span className="text-slate-400 font-normal">· {visibleCrossClan.length}</span>}
                </h2>
                <button onClick={() => setShowCcForm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                  <Plus className="w-4 h-4" />Grant access
                </button>
              </div>

              {visibleCrossClan.length === 0 ? (
                <div className="bg-card rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                  No cross-clan support yet. Use <span className="font-medium">Grant access</span> to bring a mentor into another clan.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleCrossClan.map((c) => (
                    <div key={c.id} className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium shrink-0">{CROSS_KINDS.find((k) => k.key === c.kind)?.label ?? c.kind}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate">
                          <span className="font-medium">{c.user || '-'}</span>
                          <span className="text-slate-400"> → {c.toClan || '-'}</span>
                        </p>
                        {c.note && <p className="text-xs text-slate-500 truncate">{c.note}</p>}
                      </div>
                      {c.status && c.status !== 'active' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${CROSS_STATUS_CLASS[c.status] || 'bg-slate-100 text-slate-500'}`}>{CROSS_STATUS_LABEL[c.status] || c.status}</span>
                      )}
                      <button onClick={() => act(c.id, () => clanRequestsApi.removeCrossClan(c.id), 'Removed')} disabled={busy === c.id} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Grant form lives in the shared side-drawer for consistency. */}
              <Drawer
                open={showCcForm}
                onClose={() => setShowCcForm(false)}
                width="md"
                title="Grant cross-clan access"
                subtitle="Give someone temporary co-mentor access to another clan"
              >
                <div className="space-y-4">
                  {/* Person picker */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Person who will help</label>
                    {ccUser ? (
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-800">{ccUser.name}</span>
                        <button onClick={() => { setCcUser(null); setCcUserQuery(''); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input value={ccUserQuery} onChange={(e) => setCcUserQuery(e.target.value)} placeholder="Search by name or email…" className={`${field} w-full pl-9`} />
                        </div>
                        {ccUserResults.length > 0 && (
                          <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                            {ccUserResults.map((u) => (
                              <button key={u.id} onClick={() => { setCcUser({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email }); setCcUserResults([]); }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                                <p className="text-sm text-slate-900">{`${u.firstName} ${u.lastName}`.trim() || u.email}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                      <SelectMenu value={ccKind} onChange={setCcKind} options={CROSS_KINDS.map((k) => ({ value: k.key, label: k.label }))} searchable={false} ariaLabel="Type" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Clan to help <span className="text-rose-500">*</span></label>
                      <SelectMenu value={ccToClan} onChange={setCcToClan} options={clans.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select a clan…" ariaLabel="Clan to help" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">From clan <span className="text-slate-400">(optional)</span></label>
                    <SelectMenu value={ccFromClan} onChange={setCcFromClan} options={clans.map((c) => ({ value: c.id, label: c.name }))} placeholder="Any clan" ariaLabel="From clan" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Note <span className="text-slate-400">(optional)</span></label>
                    <input value={ccNote} onChange={(e) => setCcNote(e.target.value)} placeholder="e.g. covering while the lead is on leave" className={`${field} w-full`} />
                  </div>

                  <p className="text-xs text-slate-400">They get co-mentor access to that clan (review tasks, see mentees) until you remove it.</p>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button onClick={() => setShowCcForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">Cancel</button>
                    <button onClick={addCross} disabled={busy === 'cc'} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busy === 'cc' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Grant access
                    </button>
                  </div>
                </div>
              </Drawer>
            </div>
          )}
        </>
      )}

      {/* Deciding a mentee's own request: choose where they go, or say why not. */}
      <Drawer
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        width="md"
        title={deciding?.approve
          ? (deciding.request.moveKind === 'placement' ? 'Approve the placement' : 'Approve the move')
          : 'Deny the request'}
        subtitle={deciding ? `${deciding.request.mentee || 'This mentee'} · out of ${deciding.request.fromClan || 'their clan'}` : undefined}
      >
        {deciding && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500 mb-1">What they said</p>
              <p className="text-sm text-slate-700">{deciding.request.reason || 'No reason given.'}</p>
            </div>

            {deciding.approve ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Move them into <span className="text-rose-500">*</span>
                  </label>
                  <SelectMenu
                    value={decisionClan}
                    onChange={setDecisionClan}
                    options={destinationsFor(deciding.request).map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select a clan…"
                    ariaLabel="Clan to move them into"
                  />
                  {destinationsFor(deciding.request).length === 0 && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      No clan is currently taking people. Open one, or deny with a note saying when
                      to ask again.
                    </p>
                  )}
                  {deciding.request.toClanId ? (
                    <p className="text-[11px] text-slate-400 mt-1">
                      They asked for {deciding.request.toClan}. You can place them elsewhere.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      They left the choice to you.
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {deciding.request.moveKind === 'placement'
                    ? `${deciding.request.fromClan || 'Their current clan'} has closed or is a standing clan, so this adds them to the new clan and leaves that record untouched — including any certificates from it. They may be placed in a different program.`
                    : 'Their tasks, submissions, feedback and day log come with them. The old clan\u2019s record is left exactly as it is.'}
                </p>
              </>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Note to the mentee {deciding.approve
                  ? <span className="text-slate-400">(optional)</span>
                  : <span className="text-rose-500">*</span>}
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={deciding.approve
                  ? 'e.g. your new mentor runs the review at 6pm your time'
                  : 'e.g. we are moving your review slot instead - speak to your mentor this week'}
                className={`${field} w-full`}
              />
              <p className="text-[11px] text-slate-400 mt-1">They see this on their My clan page.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setDeciding(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={submitDecision}
                disabled={busy === deciding.request.id}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${deciding.approve ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'}`}
              >
                {busy === deciding.request.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : deciding.approve ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                {deciding.approve ? 'Approve and move' : 'Deny'}
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function AdminClanRequests() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>}>
      <AdminClanRequestsInner />
    </Suspense>
  );
}
