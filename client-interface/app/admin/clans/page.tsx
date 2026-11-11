'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Users2, Plus, X, Loader2, Trash2, UserPlus, Crown, GraduationCap, Search, ArrowRightLeft, SlidersHorizontal, PauseCircle, PlayCircle, Link2, MoonStar, Sun } from 'lucide-react';
import { SelectMenu, type SelectOption } from '@/components/shared/SelectMenu';
import { TablePagination } from '@/components/shared/TablePagination';
import { Drawer } from '@/components/shared/Drawer';
import { ClanAvatarEditor } from '@/components/shared/ClanAvatarEditor';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { ClanStatusBadge, CLAN_STATUS_HINT } from '@/components/shared/ClanStatusBadge';
import { Avatar } from '@/components/shared/Avatar';
import { CoMentorPermissionsDrawer } from '@/components/shared/CoMentorPermissionsDrawer';
import { ReassignClanModal } from '@/components/admin/ReassignClanModal';
import { ClanLevelsField } from '@/components/admin/ClanLevelsField';
import { useAdminClanPublicJoin, useAdminClans, type Clan, type ClanMembershipRow } from '@/lib/hooks/admin';
import { clanApi } from '@/lib/services/clan-api';
import { programsApi } from '@/lib/services/program-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { menteeApi } from '@/lib/services/mentee-api';
import { formatDateTime } from '@/lib/utils/datetime';

interface Person {
  id: string; firstName: string; lastName: string; email?: string; role?: string;
  /** Set when they're ALREADY a mentee of another clan — adding is a move, not an add. */
  placedClanId?: string | null; placedClanName?: string | null;
  /** Set when they can't be a mentee at all (currently: platform admins). */
  blockedReason?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  lead_mentor: 'Lead mentor', co_mentor: 'Co-mentor', mentee: 'Mentee', core_team: 'Core team',
};

// ── Create drawer ──────────────────────────────────────────────────────────────
function CreateClanDrawer({ programs, mentors, onClose, onCreated }: {
  programs: any[]; mentors: Person[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'cohort' | 'standing'>('cohort');
  const [programId, setProgramId] = useState('');
  const [leadMentorId, setLeadMentorId] = useState('');
  const [levelLabel, setLevelLabel] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [countries, setCountries] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !programId) { toast.error('Name and program are required'); return; }
    try {
      setSaving(true);
      await clanApi.create({
        name: name.trim(), programId, kind,
        leadMentorId: leadMentorId || undefined,
        levelLabel: levelLabel.trim() || undefined,
        levels,
        countries: countries.split(',').map((c) => c.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success('Clan created');
      onCreated(); onClose();
    } catch { toast.error('Could not create the clan'); }
    finally { setSaving(false); }
  };

  const field = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  const programOpts = useMemo<SelectOption[]>(
    () => programs.map((p: any) => ({ value: p.id, label: p.name })),
    [programs]
  );
  const mentorOpts = useMemo<SelectOption[]>(
    () => mentors.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim() })),
    [mentors]
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width="sm"
      title="New clan"
      footer={(dismiss) => (
        <>
          <button onClick={dismiss} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create clan
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Clan name (e.g. Phoenix)" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Program <span className="text-red-500">*</span></label>
          <SelectMenu value={programId} onChange={setProgramId} options={programOpts} placeholder="Select a program" ariaLabel="Program" />
        </div>
        {/* An admin could approve a mentor's request for a standing clan and
            could not make one themselves. The rule is about authority, not
            about which door you came through. */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Kind</label>
          <SelectMenu
            value={kind}
            onChange={(value) => setKind(value as 'cohort' | 'standing')}
            options={[
              { value: 'cohort', label: 'Cohort clan', description: 'Runs with the programme, capped at 25 by default' },
              { value: 'standing', label: 'Standing clan', description: 'Open-ended mentoring space, no cap, no programme enrolment' },
            ]}
            ariaLabel="Clan kind"
          />
          <p className="mt-1 text-xs text-slate-500">
            {kind === 'standing'
              ? 'A standing clan keeps running after its programme closes. Work done in it does not count toward the programme record.'
              : 'A cohort clan belongs to the programme intake and closes with it.'}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Lead mentor <span className="text-slate-400 font-normal">(optional)</span></label>
          <SelectMenu value={leadMentorId} onChange={setLeadMentorId} options={mentorOpts} placeholder="No lead mentor yet" ariaLabel="Lead mentor" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Level label <span className="text-slate-400 font-normal">(optional)</span></label>
          <input value={levelLabel} onChange={(e) => setLevelLabel(e.target.value)} placeholder="e.g. Intermediate" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Levels served <span className="text-slate-400 font-normal">(for intake assignment)</span></label>
          <ClanLevelsField programId={programId} value={levels} onChange={setLevels} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Countries served <span className="text-slate-400 font-normal">(comma-separated, optional)</span></label>
          <input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="e.g. Pakistan, India" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. frontend, react" className={field} />
        </div>
      </div>
    </Drawer>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function ClanDrawer({ clanId, mentors, mentees, onClose, onChanged }: {
  clanId: string; mentors: Person[]; mentees: Person[]; onClose: () => void; onChanged: () => void;
}) {
  const [clan, setClan] = useState<Clan | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'mentee' | 'co_mentor' | 'lead_mentor'>('mentee');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<{ userId: string; name: string } | null>(null);
  const [permMember, setPermMember] = useState<any | null>(null);
  const [levelsDraft, setLevelsDraft] = useState<string[]>([]);
  const [savingLevels, setSavingLevels] = useState(false);
  const [details, setDetails] = useState({ name: '', description: '', whatsappGroupLink: '', leadMentorId: '', maxMentees: '25', status: 'active', tags: '', countries: '' });
  const {
    publicJoin,
    publicJoinLoading,
    publicJoinBusy,
    savePublicJoinAccess,
  } = useAdminClanPublicJoin(clanId);

  // Searchable person picker (server-backed) so ANYONE is findable — not just the
  // first 20 of a base-role directory. This is how a removed/re-roled person
  // reliably shows up to be re-added.
  const [pickQuery, setPickQuery] = useState('');
  const [pickResults, setPickResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Person | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clanApi.get(clanId);
      const c = res?.data?.clan ?? null; setClan(c);
      setLevelsDraft(Array.isArray(c?.levels) ? c.levels : []);
      setDetails({
        name: c?.name ?? '', description: c?.description ?? '', whatsappGroupLink: c?.whatsappGroupLink ?? '', leadMentorId: c?.leadMentor?.id ?? '',
        maxMentees: String(c?.maxMentees ?? 25), status: c?.status ?? 'active',
        tags: (c?.tags ?? []).join(', '), countries: (c?.countries ?? []).join(', '),
      });
    }
    finally { setLoading(false); }
  };

  // Save all clan detail edits (incl. levels) in one call.
  const detailsDirty = !!clan && (
    details.name !== (clan.name ?? '') ||
    details.description !== (clan.description ?? '') ||
    details.whatsappGroupLink !== (clan.whatsappGroupLink ?? '') ||
    details.leadMentorId !== (clan.leadMentor?.id ?? '') ||
    details.maxMentees !== String(clan.maxMentees ?? 25) ||
    details.status !== (clan.status ?? 'active') ||
    details.tags !== (clan.tags ?? []).join(', ') ||
    details.countries !== (clan.countries ?? []).join(', ') ||
    JSON.stringify(levelsDraft) !== JSON.stringify(clan.levels ?? [])
  );
  const saveDetails = async () => {
    if (!details.name.trim()) { toast.error('Name is required'); return; }
    setSavingLevels(true);
    try {
      await clanApi.update(clanId, {
        name: details.name.trim(),
        description: details.description.trim() || null,
        whatsappGroupLink: details.whatsappGroupLink.trim() || null,
        leadMentorId: details.leadMentorId || null,
        maxMentees: Math.max(1, parseInt(details.maxMentees, 10) || 25),
        status: details.status,
        tags: details.tags.split(',').map((t) => t.trim()).filter(Boolean),
        countries: details.countries.split(',').map((c) => c.trim()).filter(Boolean),
        levels: levelsDraft,
      });
      toast.success('Clan updated');
      await load(); onChanged();
    } catch { toast.error('Could not update the clan'); }
    finally { setSavingLevels(false); }
  };
  useEffect(() => { load(); }, [clanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mentee role → unassigned mentees; co/lead → any active person not already a
  // mentor here (candidates endpoint). Debounced.
  useEffect(() => {
    const q = pickQuery.trim();
    if (q.length < 1) { setPickResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      const req = role === 'mentee' ? clanApi.availableMembers(clanId, q) : clanApi.candidates(clanId, q);
      req
        .then((r: any) => { if (alive) setPickResults((r.data?.people || []).map((p: any) => ({
          id: p.id,
          firstName: p.firstName ?? (p.name || '').split(' ')[0] ?? '',
          lastName: p.lastName ?? (p.name || '').split(' ').slice(1).join(' '),
          email: p.email, role: p.role,
          placedClanId: p.placedClanId ?? null, placedClanName: p.placedClanName ?? null,
          blockedReason: p.blockedReason ?? null,
        }))); })
        .catch(() => { if (alive) setPickResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [pickQuery, role, clanId]);

  const add = async () => {
    if (!picked) { toast.error('Search and pick a person'); return; }
    try {
      setBusy(true);
      await clanApi.addMember(clanId, picked.id, role);
      toast.success('Member added');
      setPicked(null); setPickQuery(''); setPickResults([]);
      await load(); onChanged();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add member'); }
    finally { setBusy(false); }
  };

  // Role-scoped: a member listed twice (mentee + co-mentor of this clan) loses
  // only the role on the row you clicked.
  const remove = async (uid: string, role: ClanMembershipRow['role']) => {
    try {
      setBusy(true);
      await clanApi.removeMember(clanId, uid, role);
      toast.success('Member removed');
      await load(); onChanged();
    } catch { toast.error('Could not remove member'); }
    finally { setBusy(false); }
  };

  const members = clan?.memberships ?? [];
  const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <>
      <Drawer open onClose={onClose} title={clan?.name || 'Clan'} subtitle={clan?.program?.name} width="lg">
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
          ) : (
            <>
              {/* Clan details — name, lead, capacity, status, levels, tags. */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4 text-brand-500" />Clan details</h3>
                  <button
                    onClick={saveDetails}
                    disabled={savingLevels || !detailsDirty}
                    className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {savingLevels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Save changes
                  </button>
                </div>
                <ClanAvatarEditor clanId={clanId} name={clan?.name || details.name} avatarUrl={clan?.avatarUrl} onChanged={(avatarUrl) => { setClan(previous => previous ? { ...previous, avatarUrl } : previous); onChanged(); }} />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                    <input value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} className={`w-full ${field}`} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                    <input value={details.description} onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))} placeholder="What this clan is about" className={`w-full ${field}`} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">WhatsApp group link <span className="font-normal text-slate-400">— emailed to new mentees + shown in-app</span></label>
                    <input value={details.whatsappGroupLink} onChange={(e) => setDetails((d) => ({ ...d, whatsappGroupLink: e.target.value }))} placeholder="https://chat.whatsapp.com/…" className={`w-full ${field}`} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Lead mentor</label>
                    <SelectMenu value={details.leadMentorId} onChange={(v) => setDetails((d) => ({ ...d, leadMentorId: v }))}
                      options={mentors.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim() }))} placeholder="No lead mentor" ariaLabel="Lead mentor" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Capacity</label>
                    <input type="number" min={1} value={details.maxMentees} onChange={(e) => setDetails((d) => ({ ...d, maxMentees: e.target.value }))} className={`w-full ${field}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                    <select value={details.status} onChange={(e) => setDetails((d) => ({ ...d, status: e.target.value }))} className={`w-full ${field}`}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="archived">Archived</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">{CLAN_STATUS_HINT[details.status]}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Levels served <span className="text-slate-400 font-normal">(intake matching)</span></label>
                  <ClanLevelsField programId={clan?.programId} value={levelsDraft} onChange={setLevelsDraft} />
                  <p className="text-xs text-slate-400 mt-1">Candidates of these levels are matched here during assignment. None = any level.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Countries served <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                  <input value={details.countries} onChange={(e) => setDetails((d) => ({ ...d, countries: e.target.value }))} placeholder="e.g. Pakistan, India" className={`w-full ${field}`} />
                  <p className="text-xs text-slate-400 mt-1">Candidates from these countries are matched here. None = any country.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                  <input value={details.tags} onChange={(e) => setDetails((d) => ({ ...d, tags: e.target.value }))} placeholder="e.g. frontend, react" className={`w-full ${field}`} />
                </div>
              </div>

              {/* Public clan joining — admin permission only (lead generates the link). */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-brand-500" /> Public clan joining access
                </h3>
                <p className="text-xs text-slate-500">
                  Disabled by default. When allowed, the Clan Lead Mentor can generate a shareable link.
                  Visitors request to join; membership still requires Lead Mentor approval.
                </p>
                {publicJoinLoading ? (
                  <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading public joining state…
                  </p>
                ) : publicJoin ? (
                  <>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-slate-300"
                        checked={Boolean(publicJoin.publicJoinAllowed)}
                        disabled={publicJoinBusy}
                        onChange={async (e) => {
                          if (await savePublicJoinAccess(e.target.checked)) onChanged();
                        }}
                      />
                      <span className="text-sm text-slate-700">
                        Allow this clan to use public joining links
                      </span>
                    </label>

                    <p className="text-xs text-slate-500">
                      {publicJoin.publicJoinAllowed
                        ? publicJoin.publicJoinEnabled
                          ? 'Access granted · Lead Mentor has an active public joining link.'
                          : publicJoin.publicJoinLinkExists
                            ? 'Access granted · Link exists but is currently disabled by the Lead Mentor.'
                            : 'Access granted · The Clan Lead Mentor may generate the link and set its join window.'
                        : 'This clan is not authorized to generate or use a public joining link. Any existing link is inactive.'}
                      {publicJoin.publicJoinWindowStatus && publicJoin.publicJoinWindowStatus !== 'active' ? (
                        <> · Window {publicJoin.publicJoinWindowStatus}</>
                      ) : null}
                      {publicJoin.publicJoinStartsAt || publicJoin.publicJoinEndsAt ? (
                        <>
                          {' '}· {publicJoin.publicJoinStartsAt ? formatDateTime(publicJoin.publicJoinStartsAt) : 'now'}
                          {' → '}
                          {publicJoin.publicJoinEndsAt ? formatDateTime(publicJoin.publicJoinEndsAt) : 'no end'}
                        </>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Could not load public joining state.</p>
                )}
              </div>

              {/* Add member */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-brand-500" />Add member</h3>
                <div className="flex flex-wrap gap-2">
                  <select value={role} onChange={(e) => { setRole(e.target.value as any); setPicked(null); setPickQuery(''); setPickResults([]); }} className={field}>
                    <option value="mentee">Mentee</option>
                    <option value="co_mentor">Co-mentor</option>
                    <option value="lead_mentor">Lead mentor</option>
                  </select>
                  <div className="flex-1 min-w-40">
                    {picked ? (
                      <div className="flex items-center justify-between gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <span className="truncate">{picked.firstName} {picked.lastName}{picked.email ? ` · ${picked.email}` : ''}</span>
                        <button onClick={() => setPicked(null)} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder={`Search ${role === 'mentee' ? 'a mentee' : 'anyone'} by name or email…`}
                          className={`${field} w-full`} />
                        {(pickResults.length > 0 || searching) && (
                          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-card shadow-lg dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                            {searching ? (
                              <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-brand-600" /></div>
                            ) : pickResults.map((p) => {
                              // A platform admin can't be a mentee — show them
                              // greyed with the reason rather than omitting them,
                              // which is what made the search look broken.
                              const blocked = role === 'mentee' && !!p.blockedReason;
                              const placedElsewhere = role === 'mentee' && !!p.placedClanId;
                              return (
                              <button key={p.id} disabled={blocked}
                                onClick={() => { if (!blocked) { setPicked(p); setPickResults([]); } }}
                                className={`w-full text-left px-3 py-2 text-sm ${blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
                                <span className="block text-slate-900">
                                  {p.firstName} {p.lastName}
                                  {role === 'mentee' && p.role === 'mentor' && (
                                    <span className="ml-2 align-middle rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Mentor</span>
                                  )}
                                  {placedElsewhere && (
                                    <span className="ml-2 align-middle rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">Also in {p.placedClanName}</span>
                                  )}
                                </span>
                                {p.email && <span className="block text-xs text-slate-500">{p.email}</span>}
                                {blocked && <span className="block text-xs text-slate-400">Platform admins can&apos;t be added as a mentee</span>}
                              </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={add} disabled={busy || !picked} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Search finds anyone (incl. someone you removed earlier). Adding a mentee here places them in this clan
                  {' '}without removing them from another clan.
                </p>
              </div>

              {/* Members */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">Members ({members.length})</h3>
                {members.length === 0 ? (
                  <p className="text-sm text-slate-500">No members yet.</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                        <Avatar
                          name={`${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim()}
                          src={m.user?.profilePictureUrl}
                          size="md"
                          href={m.user?.id ? `/admin/${String(m.role).includes('mentor') ? 'mentors' : 'mentees'}/${m.user.id}` : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{m.user?.firstName} {m.user?.lastName}</p>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            {m.role.includes('mentor') ? <Crown className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
                            {ROLE_LABEL[m.role] || m.role}
                            {m.status === 'paused' && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">Paused</span>}
                          </span>
                        </div>
                        {m.role === 'mentee' && (
                          <button
                            onClick={async () => {
                              setBusy(true);
                              try {
                                if (m.status === 'paused') { await mentorApi.resumeMentee(m.userId, clanId); toast.success('Resumed'); }
                                else { await mentorApi.pauseMentee(m.userId, undefined, clanId); toast.success('Paused — kept in clan, out of reports'); }
                                await load();
                              } catch { toast.error('Could not update pause'); } finally { setBusy(false); }
                            }}
                            disabled={busy}
                            title={m.status === 'paused' ? 'Resume mentee' : 'Pause mentee'}
                            className={`shrink-0 disabled:opacity-50 ${m.status === 'paused' ? 'text-brand-600 hover:text-brand-700' : 'text-slate-400 hover:text-amber-600'}`}
                          >
                            {m.status === 'paused' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                          </button>
                        )}
                        {m.role === 'co_mentor' && (
                          <button onClick={() => setPermMember(m)} disabled={busy} title="Edit permissions" className="text-slate-400 hover:text-brand-600 disabled:opacity-50 shrink-0">
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                        )}
                        {m.role === 'mentee' && (
                          <button onClick={() => setMoving({ userId: m.userId, name: `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim() })} disabled={busy} title="Move to another clan" className="text-slate-400 hover:text-brand-600 disabled:opacity-50 shrink-0">
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => remove(m.userId, m.role)} disabled={busy} title={`Remove as ${ROLE_LABEL[m.role] || m.role}`} className="text-slate-400 hover:text-red-500 disabled:opacity-50 shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Drawer>

      {moving && (
        <ReassignClanModal
          menteeId={moving.userId}
          menteeName={moving.name}
          currentClanId={clanId}
          currentProgramId={clan?.program?.id ?? null}
          onClose={() => setMoving(null)}
          onDone={() => { load(); onChanged(); }}
        />
      )}

      {permMember && (
        <CoMentorPermissionsDrawer
          clanId={clanId}
          userId={permMember.user?.id ?? permMember.userId}
          name={`${permMember.user?.firstName ?? ''} ${permMember.user?.lastName ?? ''}`.trim() || undefined}
          onClose={() => setPermMember(null)}
          onSaved={() => { load(); onChanged(); }}
        />
      )}
    </>
  );
}

function AdminClansInner() {
  // Server-side search + program filter + pagination (capped on the backend).
  const {
    clans,
    loading,
    error,
    refetch,
    pagination,
    search,
    setSearch,
    programFilter,
    setProgramFilter,
    selected,
    selectedCount,
    allVisibleSelected,
    bulkBusy,
    toggleOne,
    toggleAllVisible,
    clearSelected,
    applyBulkPublicJoinAccess,
  } = useAdminClans();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<any[]>([]);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [mentees, setMentees] = useState<Person[]>([]);
  const [creating, setCreating] = useState(false);
  const [openClan, setOpenClan] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  // One click from the directory. Inactive clans keep working; the system just
  // stops suggesting them when it distributes mentees.
  const toggleActive = async (c: Clan) => {
    const next = c.status === 'inactive' ? 'active' : 'inactive';
    setStatusBusy(c.id);
    try {
      await clanApi.update(c.id, { status: next });
      toast.success(next === 'inactive'
        ? `${c.name} marked inactive — it keeps working but won't be suggested for new mentees`
        : `${c.name} is active again and will be suggested for new mentees`);
      refetch();
    } catch { toast.error('Could not change the clan status'); }
    finally { setStatusBusy(null); }
  };

  // Deep-link support: /admin/clans?clan=<id> opens that clan's drawer.
  useEffect(() => {
    const id = searchParams.get('clan');
    if (id) setOpenClan(id);
  }, [searchParams]);

  useEffect(() => {
    programsApi.getAll().then((r: any) => setPrograms(Array.isArray(r?.data) ? r.data : (r?.data?.programs ?? []))).catch(() => {});
    mentorApi.getAll().then((r: any) => setMentors(r?.data?.mentors ?? [])).catch(() => {});
    menteeApi.getAll().then((r: any) => setMentees(r?.data?.mentees ?? [])).catch(() => {});
  }, []);

  // Active-member counts come from the paginated endpoint (falls back to any
  // loaded memberships, e.g. when opened via the drawer).
  const counts = (c: Clan) => ({
    mentees: c.menteeCount ?? (c.memberships ?? []).filter((m) => m.role === 'mentee').length,
    mentors: c.mentorCount ?? (c.memberships ?? []).filter((m) => m.role.includes('mentor')).length,
  });

  // Program filter options from the full program list (not just loaded clans).
  const programOptions = useMemo(
    () => [{ value: '', label: 'All programs' }, ...programs.map((p: any) => ({ value: p.id, label: p.name }))],
    [programs]
  );
  const hasFilters = !!search.trim() || !!programFilter;

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Clans</h1>
          <p className="text-slate-600">Mentor-led groups inside each program. Place a mentee in a clan to assign them.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" />New clan
        </button>
      </div>

      {loading && clans.length === 0 ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* Search + filter toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clans by name, program, lead mentor, or tag…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {programOptions.length > 1 && (
              <div className="sm:w-64">
                <SelectMenu value={programFilter} onChange={setProgramFilter} options={programOptions} placeholder="All programs" ariaLabel="Filter by program" />
              </div>
            )}
            <span className="text-xs text-slate-500 shrink-0 tabular-nums">{pagination.total} clan{pagination.total === 1 ? '' : 's'}</span>
          </div>

          {clans.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
                Select all on this page
              </label>
              {selectedCount > 0 && (
                <span className="text-xs text-slate-500 tabular-nums">{selectedCount} selected</span>
              )}
            </div>
          )}

          {selectedCount > 0 && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 inline-flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-brand-600" />
                    Public joining for {selectedCount} clan{selectedCount === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Allows Lead Mentors to generate a joining link and set its start/end window.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => applyBulkPublicJoinAccess(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Allow public joining
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => applyBulkPublicJoinAccess(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Remove access
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={clearSelected}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {clans.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              {hasFilters ? (
                <>
                  <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">No clans match your search.</p>
                  <button onClick={() => { setSearch(''); setProgramFilter(''); }} className="text-brand-600 hover:text-brand-700 text-sm font-medium mt-2">Clear filters</button>
                </>
              ) : (
                <>
                  <Users2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">No clans yet. Create one to group mentees under mentors.</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-border bg-card">
              <table className="admin-table"><caption>Clan directory</caption>
                <thead><tr><th><span className="sr-only">Selection</span></th><th>Clan & program</th><th>Lead mentor</th><th>Mentees</th><th>Mentors</th><th>Public joining</th><th><span className="sr-only">Manage</span></th></tr></thead>
                <tbody>{clans.map((c) => {
                  const n = counts(c);
                  return <tr key={c.id} className={selected.has(c.id) ? 'bg-brand-50 dark:bg-brand-950/30' : ''}>
                    <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Select ${c.name}`} className="h-4 w-4 rounded border-border" /></td>
                    <td><div className="flex items-center gap-3"><ClanAvatar name={c.name} src={c.avatarUrl} size="sm"/><button type="button" onClick={() => setOpenClan(c.id)} className="font-semibold text-brand-700 dark:text-brand-300 text-left hover:underline">{c.name}</button><ClanStatusBadge status={c.status} /></div><p className="text-xs text-muted-foreground mt-1">{c.program?.name || 'No program'}{c.levelLabel ? ` · ${c.levelLabel}` : ''}</p>{c.tags?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{c.tags.slice(0,3).join(' · ')}{c.tags.length>3 ? ` +${c.tags.length-3}` : ''}</p>}</td>
                    <td>{c.leadMentor ? `${c.leadMentor.firstName} ${c.leadMentor.lastName}` : <span className="text-amber-700 dark:text-amber-300">Needs a lead mentor</span>}</td>
                    <td className="tabular-nums">{n.mentees}</td><td className="tabular-nums">{n.mentors}</td>
                    <td><span className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${c.publicJoinAllowed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{c.publicJoinAllowed ? c.publicJoinEnabled ? 'Link active' : 'Allowed' : 'Closed'}</span></td>
                    <td><div className="flex items-center justify-end gap-1.5">
                      {c.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() => toggleActive(c)}
                          disabled={statusBusy === c.id}
                          title={c.status === 'inactive' ? 'Mark active: suggested again for new mentees' : 'Mark inactive: keeps working, never suggested for new mentees'}
                          aria-label={c.status === 'inactive' ? `Mark ${c.name} active` : `Mark ${c.name} inactive`}
                          className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          {statusBusy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : c.status === 'inactive' ? <Sun className="w-3.5 h-3.5" /> : <MoonStar className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button type="button" onClick={()=>setOpenClan(c.id)} className="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted" aria-label={`Manage ${c.name}`}>Manage</button>
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}

          {pagination.total > pagination.limit && (
            <TablePagination pagination={pagination} isLoading={loading} className="pt-1" />
          )}
        </>
      )}

      {creating && <CreateClanDrawer programs={programs} mentors={mentors} onClose={() => setCreating(false)} onCreated={refetch} />}
      {openClan && <ClanDrawer clanId={openClan} mentors={mentors} mentees={mentees} onClose={() => setOpenClan(null)} onChanged={refetch} />}
    </div>
  );
}

export default function AdminClans() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>}>
      <AdminClansInner />
    </Suspense>
  );
}
