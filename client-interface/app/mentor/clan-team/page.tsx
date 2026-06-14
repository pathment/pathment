'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Crown, HeartHandshake, Loader2, Search, Shield, SlidersHorizontal, Trash2, UserPlus, Users2, X } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/services/api-client';
import { clanApi } from '@/lib/services/clan-api';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';
import { CoMentorPermissionsDrawer } from '@/components/shared/CoMentorPermissionsDrawer';

interface Member {
  role: 'lead_mentor' | 'co_mentor' | 'core_team' | 'mentee';
  user: { id: string; firstName: string; lastName: string; email: string; role: string };
}
interface ClanDetail {
  id: string;
  name: string;
  program?: { id: string; name: string };
  memberships: Member[];
}
interface MyMembership {
  role: string;
  clan: { id: string; name: string; programId: string; status: string };
}

const name = (u: { firstName: string; lastName: string; email: string }) => `${u.firstName} ${u.lastName}`.trim() || u.email;
const initials = (u: { firstName: string; lastName: string; email: string }) =>
  (`${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.trim() || u.email[0] || '?').toUpperCase();

export default function ClanTeamPage() {
  const [memberships, setMemberships] = useState<MyMembership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clanApi.myMemberships()
      .then((r: any) => {
        const mine: MyMembership[] = (r.data?.memberships || [])
          .filter((m: any) => ['lead_mentor', 'co_mentor'].includes(m.role));
        setMemberships(mine);
      })
      .catch(() => toast.error('Could not load your clans'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2 inline-flex items-center gap-2"><Users2 className="w-6 h-6 text-brand-600" /> Clan Team</h1>
        <p className="text-slate-600">Manage your clan - add or remove mentees, co-mentors, and core-team members.</p>
      </div>

      <PendingCoverInvites />

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : memberships.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-card p-12 text-center text-slate-400">
          You&apos;re not part of any clan as a mentor yet.
        </div>
      ) : (
        <div className="space-y-5">
          {memberships.map((m) => (
            <ClanTeamCard key={m.clan.id} clanId={m.clan.id} myRole={m.role} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClanTeamCard({ clanId, myRole }: { clanId: string; myRole: string }) {
  const [clan, setClan] = useState<ClanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingMentees, setAddingMentees] = useState(false);
  const [permMember, setPermMember] = useState<Member | null>(null);
  const canManage = myRole === 'lead_mentor';

  const load = useCallback(() => {
    setLoading(true);
    clanApi.get(clanId)
      .then((r: any) => setClan(r.data?.clan || r.data))
      .catch(() => toast.error('Could not load clan'))
      .finally(() => setLoading(false));
  }, [clanId]);
  useEffect(load, [load]);

  const remove = async (userId: string, label: string) => {
    if (!confirm(`Remove ${label} from this clan? They'll be unassigned and can be placed again.`)) return;
    try { await clanApi.removeMember(clanId, userId); toast.success('Removed'); load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not remove')); }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-card p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }
  if (!clan) return null;

  const members = clan.memberships || [];
  const lead = members.filter((m) => m.role === 'lead_mentor');
  const co = members.filter((m) => m.role === 'co_mentor');
  const core = members.filter((m) => m.role === 'core_team');
  const mentees = members.filter((m) => m.role === 'mentee');
  const menteeCount = mentees.length;

  const Person = ({ m, removable, managePerms }: { m: Member; removable: boolean; managePerms?: boolean }) => (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-sm font-medium flex items-center justify-center shrink-0">{initials(m.user)}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{name(m.user)}</p>
          <p className="text-xs text-slate-500 truncate">{m.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {managePerms && canManage && (
          <button onClick={() => setPermMember(m)} className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label="Edit permissions" title="Edit permissions"><SlidersHorizontal className="w-4 h-4" /></button>
        )}
        {removable && canManage && (
          <button onClick={() => remove(m.user.id, name(m.user))} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );

  const Section = ({ icon, title, items, removable, managePerms }: { icon: React.ReactNode; title: string; items: Member[]; removable: boolean; managePerms?: boolean }) => (
    items.length === 0 ? null : (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2 inline-flex items-center gap-1.5">{icon} {title}</p>
        <div className="grid sm:grid-cols-2 gap-2">{items.map((m) => <Person key={m.user.id} m={m} removable={removable} managePerms={managePerms} />)}</div>
      </div>
    )
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{clan.name}</h2>
          <p className="text-sm text-slate-500">{clan.program?.name} · {menteeCount} mentee{menteeCount === 1 ? '' : 's'}</p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setAddingMentees(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-500/15 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100">
              <Users2 className="w-4 h-4" /> Add mentees
            </button>
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <UserPlus className="w-4 h-4" /> Add to team
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400 shrink-0">View only (co-mentor)</span>
        )}
      </div>

      <div className="mt-5 space-y-5">
        <Section icon={<Crown className="w-3.5 h-3.5" />} title="Lead mentor" items={lead} removable={false} />
        <Section icon={<Shield className="w-3.5 h-3.5" />} title="Co-mentors" items={co} removable managePerms />
        <Section icon={<Users2 className="w-3.5 h-3.5" />} title="Core team" items={core} removable />
        <Section icon={<HeartHandshake className="w-3.5 h-3.5" />} title={`Mentees (${menteeCount})`} items={mentees} removable />
        {co.length === 0 && core.length === 0 && mentees.length === 0 && (
          <p className="text-sm text-slate-400">No members yet.</p>
        )}
      </div>

      {canManage && <CrossClanSection clanId={clanId} clanName={clan.name} />}

      {adding && <AddTeamMemberDrawer clanId={clanId} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
      {addingMentees && <AddMenteesDrawer clanId={clanId} clanName={clan.name} onClose={() => setAddingMentees(false)} onChanged={() => load()} />}
      {permMember && <CoMentorPermissionsDrawer clanId={clanId} userId={permMember.user.id} name={name(permMember.user)} onClose={() => setPermMember(null)} onSaved={load} />}
    </div>
  );
}

interface CrossClan { id: string; kind: string; user: string | null; userId?: string | null; toClanId?: string | null; fromClan: string | null; toClan: string | null; note: string | null; status?: string; at: string }
interface MyCrossClan { id: string; kind: string; status: string; toClan: string | null; fromClan: string | null; note: string | null; at: string }

const KIND_LABEL: Record<string, string> = {
  cover: 'Cover',
  specialist: 'Specialist',
  co_mentee_access: 'Mentee access',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<string, string> = { pending: 'Awaiting acceptance', active: 'Active', declined: 'Declined' };

/** A mentor's own inbox of cover requests addressed to them - accept or decline. */
function PendingCoverInvites() {
  const [rows, setRows] = useState<MyCrossClan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    clanRequestsApi.listMyCrossClan()
      .then((r: any) => setRows(r.data?.crossClan || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      await clanRequestsApi.respondCrossClan(id, accept);
      toast.success(accept ? 'Accepted - you now have access' : 'Declined');
      load();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not respond')); }
    finally { setBusy(null); }
  };

  const pending = rows.filter((r) => r.status === 'pending');
  const active = rows.filter((r) => r.status === 'active');
  if (loading || (pending.length === 0 && active.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 dark:bg-brand-500/10 p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
        <HeartHandshake className="w-4 h-4 text-brand-600" /> Cross-clan help for you
      </p>

      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              You’ve been asked to provide {(KIND_LABEL[r.kind] || r.kind).toLowerCase()} for <span className="font-semibold">{r.toClan || 'a clan'}</span>
            </p>
            {r.note && <p className="text-xs text-slate-500 mt-0.5">“{r.note}”</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => respond(r.id, true)} disabled={busy === r.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept
            </button>
            <button onClick={() => respond(r.id, false)} disabled={busy === r.id}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50">
              Decline
            </button>
          </div>
        </div>
      ))}

      {active.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card px-4 py-2.5">
          <p className="text-sm text-slate-700">
            You’re currently providing {(KIND_LABEL[r.kind] || r.kind).toLowerCase()} for <span className="font-medium">{r.toClan || 'a clan'}</span>
          </p>
          <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 shrink-0">Active</span>
        </div>
      ))}
    </div>
  );
}

/** Lead-mentor view: who is covering / helping THIS clan, plus a way to request cover. */
function CrossClanSection({ clanId, clanName }: { clanId: string; clanName: string }) {
  const [rows, setRows] = useState<CrossClan[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [permCover, setPermCover] = useState<CrossClan | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    clanRequestsApi.listCrossClan(clanId)
      .then((r: any) => setRows(r.data?.crossClan || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [clanId]);
  useEffect(load, [load]);

  const remove = async (id: string, label: string) => {
    if (!confirm(`Remove cross-clan help from ${label}?`)) return;
    try { await clanRequestsApi.removeCrossClan(id); toast.success('Removed'); load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not remove')); }
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 inline-flex items-center gap-1.5">
            <HeartHandshake className="w-3.5 h-3.5" /> Cover &amp; cross-clan help
          </p>
          <p className="text-xs text-slate-500 mt-1">Bring in a mentor from another clan to cover or lend a hand.</p>
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-500/15 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 shrink-0">
          <UserPlus className="w-4 h-4" /> Request cover
        </button>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No cover or cross-clan helpers right now.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {rows.map((c) => {
            const incoming = c.toClanId ? c.toClanId === clanId : c.toClan === clanName;
            // An active cover INTO this clan grants co_mentor here → its
            // permissions can be fine-tuned, just like a team co-mentor.
            const canTune = incoming && c.status === 'active' && !!c.userId;
            return (
              <div key={c.id} className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.user || 'Someone'}</p>
                    <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">{KIND_LABEL[c.kind] || c.kind}</span>
                    {c.status && c.status !== 'active' && (
                      <span className={`text-[11px] rounded-full px-1.5 py-0.5 ${STATUS_BADGE[c.status] || 'bg-slate-100 text-slate-500'}`}>{STATUS_LABEL[c.status] || c.status}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {incoming ? 'Helping this clan' : `Lent to ${c.toClan || 'another clan'}`}
                    {c.fromClan ? ` · from ${c.fromClan}` : ''}
                  </p>
                  {c.note && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.note}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canTune && (
                    <button onClick={() => setPermCover(c)} className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label="Edit permissions" title="Edit permissions"><SlidersHorizontal className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => remove(c.id, c.user || 'this person')} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddCoverDrawer clanId={clanId} clanName={clanName} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
      {permCover && permCover.userId && (
        <CoMentorPermissionsDrawer clanId={clanId} userId={permCover.userId} name={permCover.user || undefined} onClose={() => setPermCover(null)} />
      )}
    </div>
  );
}

function AddCoverDrawer({ clanId, clanName, onClose, onAdded }: { clanId: string; clanName: string; onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<'cover' | 'specialist' | 'co_mentee_access'>('cover');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; firstName: string; lastName: string; email: string; role: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      apiClient.get<any>('/messaging/users/search', { params: { q } })
        .then((r) => setResults(r.data?.users || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = async () => {
    if (!picked) { toast.error('Pick a person'); return; }
    setSaving(true);
    try {
      await clanRequestsApi.createCrossClan({ kind, userId: picked.id, toClanId: clanId, note: note.trim() || undefined });
      toast.success(`${name(picked)} will help ${clanName}`);
      onAdded();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not request cover')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Request cross-clan cover" subtitle={`Someone to help ${clanName}`}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={add} disabled={saving || !picked} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Request
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Kind of help</label>
          <div className="grid grid-cols-3 gap-2">
            {(['cover', 'specialist', 'co_mentee_access'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`rounded-lg border px-2 py-2 text-xs ${kind === k ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Who will help</label>
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{name(picked)}</p>
                <p className="text-xs text-slate-500">{picked.email}</p>
              </div>
              <button onClick={() => setPicked(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {searching ? (
                  <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
                ) : results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">{query.trim().length < 2 ? 'Type to search.' : 'No matches.'}</p>
                ) : results.map((u) => (
                  <button key={u.id} onClick={() => { setPicked(u); setResults([]); setQuery(''); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50">
                    <p className="text-sm font-medium text-slate-900">{name(u)}</p>
                    <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Note <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. covering while I'm on leave next week" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>
    </Drawer>
  );
}

/** Lead-mentor: pull in unassigned mentees, or invite a new one straight into the clan. */
function AddMenteesDrawer({ clanId, clanName, onClose, onChanged }: { clanId: string; clanName: string; onClose: () => void; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback((q: string) => {
    setLoading(true);
    clanApi.availableMembers(clanId, q || undefined)
      .then((r: any) => setPeople(r.data?.people || []))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [clanId]);

  useEffect(() => {
    const t = setTimeout(() => load(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const add = async (p: { id: string; name: string }) => {
    setBusy(p.id);
    try {
      await clanApi.addMember(clanId, p.id, 'mentee');
      toast.success(`${p.name} added to ${clanName}`);
      setPeople((prev) => prev.filter((x) => x.id !== p.id));
      onChanged();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not add')); }
    finally { setBusy(null); }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) { toast.error('Enter an email'); return; }
    setInviting(true);
    try {
      await clanApi.inviteToClan(clanId, inviteEmail.trim());
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send invite')); }
    finally { setInviting(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Add mentees" subtitle={`Bring people into ${clanName}`}
      footer={<div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Done</button></div>}>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Invite someone new</label>
          <div className="flex gap-2">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="email@example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); invite(); } }}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={invite} disabled={inviting} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
              {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Invite
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">They get a magic-link to join this clan as a mentee.</p>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-1">Available people <span className="text-slate-400 font-normal">(not in any clan)</span></label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
            ) : people.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No unassigned people{query ? ' match your search' : ' right now'}.</p>
            ) : people.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">{p.email}</p>
                </div>
                <button onClick={() => add(p)} disabled={busy === p.id} className="px-2.5 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-700 text-xs font-medium hover:bg-brand-100 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function AddTeamMemberDrawer({ clanId, onClose, onAdded }: { clanId: string; onClose: () => void; onAdded: () => void }) {
  const [role, setRole] = useState<'co_mentor' | 'core_team'>('co_mentor');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; firstName: string; lastName: string; email: string; role: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      // Consistent candidate pool: ANYONE active (mentor or mentee) not already
      // in this clan — the same source the admin picker uses.
      apiClient.get<any>(`/clans/${clanId}/candidates`, { params: { q } })
        .then((r) => setResults(r.data?.people || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, clanId]);

  const add = async () => {
    if (!picked) { toast.error('Pick a person'); return; }
    setSaving(true);
    try {
      await clanApi.addMember(clanId, picked.id, role);
      toast.success(`Added ${name(picked)} as ${role === 'co_mentor' ? 'co-mentor' : 'core team'}`);
      onAdded();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not add to team')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Add to team" subtitle="Co-mentors help you run the clan"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={add} disabled={saving || !picked} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <div className="grid grid-cols-2 gap-2">
            {(['co_mentor', 'core_team'] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2 text-sm ${role === r ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {r === 'co_mentor' ? 'Co-mentor' : 'Core team'}
              </button>
            ))}
          </div>
          {role === 'co_mentor' && (
            <p className="mt-1.5 text-xs text-slate-400">Co-mentors get the same access as you by default. You can fine-tune their permissions after adding them.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Person</label>
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{name(picked)}</p>
                <p className="text-xs text-slate-500">{picked.email}</p>
              </div>
              <button onClick={() => setPicked(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {searching ? (
                  <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
                ) : results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">{query.trim().length < 2 ? 'Type to search.' : 'No matches.'}</p>
                ) : results.map((u) => (
                  <button key={u.id} onClick={() => { setPicked(u); setResults([]); setQuery(''); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50">
                    <p className="text-sm font-medium text-slate-900">{name(u)}</p>
                    <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}
