'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Users2, Plus, X, Loader2, Trash2, UserPlus, Crown, GraduationCap, Search, ArrowRightLeft } from 'lucide-react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { ReassignClanModal } from '@/components/admin/ReassignClanModal';
import { useAdminClans, type Clan } from '@/lib/hooks/admin';
import { clanApi } from '@/lib/services/clan-api';
import { programsApi } from '@/lib/services/program-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { menteeApi } from '@/lib/services/mentee-api';

interface Person { id: string; firstName: string; lastName: string; email?: string }

const ROLE_LABEL: Record<string, string> = {
  lead_mentor: 'Lead mentor', co_mentor: 'Co-mentor', mentee: 'Mentee', core_team: 'Core team',
};

// ── Create drawer ──────────────────────────────────────────────────────────────
function CreateClanDrawer({ programs, mentors, onClose, onCreated }: {
  programs: any[]; mentors: Person[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [programId, setProgramId] = useState('');
  const [leadMentorId, setLeadMentorId] = useState('');
  const [levelLabel, setLevelLabel] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !programId) { toast.error('Name and program are required'); return; }
    try {
      setSaving(true);
      await clanApi.create({
        name: name.trim(), programId,
        leadMentorId: leadMentorId || undefined,
        levelLabel: levelLabel.trim() || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success('Clan created');
      onCreated(); onClose();
    } catch { toast.error('Could not create the clan'); }
    finally { setSaving(false); }
  };

  const field = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="New clan" className="relative w-full max-w-md h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold">New clan</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Clan name (e.g. Phoenix)" className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program <span className="text-red-500">*</span></label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={field}>
              <option value="">Select a program</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lead mentor <span className="text-slate-400 font-normal">(optional)</span></label>
            <select value={leadMentorId} onChange={(e) => setLeadMentorId(e.target.value)} className={field}>
              <option value="">No lead mentor yet</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Level label <span className="text-slate-400 font-normal">(optional)</span></label>
            <input value={levelLabel} onChange={(e) => setLevelLabel(e.target.value)} placeholder="e.g. Intermediate" className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. frontend, react" className={field} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create clan
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function ClanDrawer({ clanId, mentors, mentees, onClose, onChanged }: {
  clanId: string; mentors: Person[]; mentees: Person[]; onClose: () => void; onChanged: () => void;
}) {
  const [clan, setClan] = useState<Clan | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'mentee' | 'co_mentor' | 'lead_mentor'>('mentee');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<{ userId: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { const res = await clanApi.get(clanId); setClan(res?.data?.clan ?? null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anyone can be a co/lead mentor (mentor OR mentee), so non-mentee roles pick
  // from everyone (deduped); the mentee role still lists mentees to place.
  const everyone = Array.from(new Map([...mentors, ...mentees].map((p) => [p.id, p])).values());
  const options = role === 'mentee' ? mentees : everyone;

  const add = async () => {
    if (!userId) { toast.error('Pick a person'); return; }
    try {
      setBusy(true);
      await clanApi.addMember(clanId, userId, role);
      toast.success('Member added');
      setUserId('');
      await load(); onChanged();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add member'); }
    finally { setBusy(false); }
  };

  const remove = async (uid: string) => {
    try {
      setBusy(true);
      await clanApi.removeMember(clanId, uid);
      toast.success('Member removed');
      await load(); onChanged();
    } catch { toast.error('Could not remove member'); }
    finally { setBusy(false); }
  };

  const members = clan?.memberships ?? [];
  const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 truncate">{clan?.name || 'Clan'}</h2>
            <p className="text-sm text-slate-500">{clan?.program?.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
          ) : (
            <>
              {/* Add member */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-brand-500" />Add member</h3>
                <div className="flex flex-wrap gap-2">
                  <select value={role} onChange={(e) => { setRole(e.target.value as any); setUserId(''); }} className={field}>
                    <option value="mentee">Mentee</option>
                    <option value="co_mentor">Co-mentor</option>
                    <option value="lead_mentor">Lead mentor</option>
                  </select>
                  <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${field} flex-1 min-w-40`}>
                    <option value="">Select {role === 'mentee' ? 'mentee' : 'person'}</option>
                    {options.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                  </select>
                  <button onClick={add} disabled={busy} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">Adding a mentee here places them in this clan (their mentor assignment).</p>
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
                        <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-xs font-medium">
                            {m.user?.firstName?.[0]}{m.user?.lastName?.[0]}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{m.user?.firstName} {m.user?.lastName}</p>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            {m.role.includes('mentor') ? <Crown className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
                            {ROLE_LABEL[m.role] || m.role}
                          </span>
                        </div>
                        {m.role === 'mentee' && (
                          <button onClick={() => setMoving({ userId: m.userId, name: `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim() })} disabled={busy} title="Move to another clan" className="text-slate-400 hover:text-brand-600 disabled:opacity-50 shrink-0">
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => remove(m.userId)} disabled={busy} className="text-slate-400 hover:text-red-500 disabled:opacity-50 shrink-0">
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
      </div>

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
    </div>
  );
}

function AdminClansInner() {
  const { clans, loading, error, refetch } = useAdminClans();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<any[]>([]);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [mentees, setMentees] = useState<Person[]>([]);
  const [creating, setCreating] = useState(false);
  const [openClan, setOpenClan] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [programFilter, setProgramFilter] = useState('all');

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

  const counts = (c: Clan) => {
    const ms = c.memberships ?? [];
    return {
      mentees: ms.filter((m) => m.role === 'mentee').length,
      mentors: ms.filter((m) => m.role.includes('mentor')).length,
    };
  };

  // Distinct programs present in the clan list (for the program filter).
  const programOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of clans) if (c.program?.id) seen.set(c.program.id, c.program.name || 'Program');
    return [{ value: 'all', label: 'All programs' }, ...[...seen].map(([value, label]) => ({ value, label }))];
  }, [clans]);

  // Client-side search across name, program, lead mentor and tags + program filter.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clans.filter((c) => {
      if (programFilter !== 'all' && c.program?.id !== programFilter) return false;
      if (!q) return true;
      const lead = c.leadMentor ? `${c.leadMentor.firstName} ${c.leadMentor.lastName}` : '';
      const hay = [c.name, c.program?.name, lead, ...(c.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [clans, query, programFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Clans</h1>
          <p className="text-slate-600">Mentor-led groups inside each program. Place a mentee in a clan to assign them.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" />New clan
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : clans.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No clans yet - create one to start grouping mentees under mentors.</p>
        </div>
      ) : (
        <>
          {/* Search + filter toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clans by name, program, lead mentor, or tag…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {programOptions.length > 2 && (
              <div className="sm:w-64">
                <SelectMenu value={programFilter} onChange={setProgramFilter} options={programOptions} ariaLabel="Filter by program" />
              </div>
            )}
            <span className="text-xs text-slate-500 shrink-0 tabular-nums">{filtered.length} of {clans.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No clans match your search.</p>
              <button onClick={() => { setQuery(''); setProgramFilter('all'); }} className="text-brand-600 hover:text-brand-700 text-sm font-medium mt-2">Clear filters</button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c) => {
            const n = counts(c);
            return (
              <button key={c.id} onClick={() => setOpenClan(c.id)}
                className="text-left bg-card rounded-2xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-slate-900 truncate">{c.name}</h3>
                  {c.levelLabel && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs shrink-0">{c.levelLabel}</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{c.program?.name}</p>
                {c.leadMentor && (
                  <p className="text-xs text-slate-600 mt-2 flex items-center gap-1"><Crown className="w-3 h-3 text-amber-500" />{c.leadMentor.firstName} {c.leadMentor.lastName}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{n.mentees} mentees</span>
                  <span className="inline-flex items-center gap-1"><Crown className="w-3.5 h-3.5" />{n.mentors} mentors</span>
                </div>
                {c.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 text-xs">{t}</span>)}
                  </div>
                )}
              </button>
            );
              })}
            </div>
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
