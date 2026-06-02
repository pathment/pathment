import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  X,
  Plus,
  Shield,
  UserPlus,
  HeartHandshake,
  Repeat,
  ScrollText,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar } from '@/lib/ui';
import { Modal, Field, TextInput, TextArea, SelectInput, Segmented } from '@/components/overlays';
import { useStore } from '@/store/AppStore';

type Tab = 'requests' | 'crossclan' | 'policies';

const CHANGE_REASONS = [
  'Wrong technology fit',
  'Level mismatch',
  'Schedule conflict',
  'Mentor rapport',
  'Relocation / timezone',
];

const RESOLUTIONS = [
  'Approved — better fit',
  'Approved — capacity available',
  'Denied — clan at capacity',
  'Denied — within cooldown window',
  'Deferred — revisit next cycle',
];

type ReqStatus = 'pending' | 'approved' | 'denied';
interface ChangeReq {
  id: number;
  menteeId: number;
  from: string;
  to: string;
  reason: string;
  status: ReqStatus;
  resolution?: string;
  at: string;
}

const ASSIGN_TYPES = ['Additional responsibility', 'Co-mentee access', 'Psychologist'] as const;
type AssignType = (typeof ASSIGN_TYPES)[number];
interface CrossAssign {
  id: number;
  type: AssignType;
  from: string;
  to: string;
  note?: string;
}

interface Policy {
  id: number;
  title: string;
  category: string;
  body: string;
}

const SEED_POLICIES: Policy[] = [
  { id: 1, title: 'Clan change cooldown', category: 'Clan change', body: 'A mentee can request at most one clan change every 30 days, unless flagged for a level or technology mismatch by their mentor.' },
  { id: 2, title: 'Cross-clan responsibility limits', category: 'Cross-clan', body: 'A mentor may take additional responsibility for at most one other clan at a time, to protect their primary cohort.' },
  { id: 3, title: 'Promotion eligibility', category: 'Promotion', body: 'Co-mentor promotion requires four weeks of consistent activity, a brief interview, and clan-leader approval.' },
  { id: 4, title: 'Psychologist referral', category: 'Wellbeing', body: 'Any mentor or collaborator can request a psychologist session. Notes are attributed and visible only to the assigned specialist and clan leader.' },
];

export function ClanRequests() {
  const { mentees, programs, getMentee } = useStore();
  const [tab, setTab] = useState<Tab>('requests');

  const clans = useMemo(() => programs.map((p) => p.name), [programs]);
  const clanOf = (i: number) => clans[i % Math.max(clans.length, 1)] ?? 'Phoenix Clan';

  // change requests seeded from a few mentees
  const [requests, setRequests] = useState<ChangeReq[]>(() =>
    mentees.slice(0, 4).map((m, i) => ({
      id: 1000 + m.id,
      menteeId: m.id,
      from: clanOf(i),
      to: clanOf(i + 1),
      reason: CHANGE_REASONS[i % CHANGE_REASONS.length],
      status: 'pending' as ReqStatus,
      at: ['2h ago', '5h ago', '1d ago', '2d ago'][i] ?? 'recently',
    })),
  );
  const [resolving, setResolving] = useState<ChangeReq | null>(null);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [resolveNote, setResolveNote] = useState('');

  const openResolve = (r: ChangeReq, approve: boolean) => {
    setResolving(r);
    setResolution(approve ? RESOLUTIONS[0] : RESOLUTIONS[2]);
    setResolveNote('');
  };
  const applyResolve = () => {
    if (!resolving) return;
    const approve = resolution.startsWith('Approved');
    setRequests((prev) =>
      prev.map((r) =>
        r.id === resolving.id
          ? { ...r, status: approve ? 'approved' : 'denied', resolution: resolveNote.trim() ? `${resolution} · ${resolveNote.trim()}` : resolution }
          : r,
      ),
    );
    setResolving(null);
  };

  // cross-clan assignments
  const [assigns, setAssigns] = useState<CrossAssign[]>([
    { id: 1, type: 'Psychologist', from: 'Org wellbeing', to: 'Phoenix Clan', note: 'Dr. Maya Brooks covers sessions across the clan.' },
    { id: 2, type: 'Additional responsibility', from: 'Sarah Chen', to: 'Atlas Clan', note: 'Covering reviews while their lead is on leave.' },
  ]);
  const [newAssign, setNewAssign] = useState(false);
  const [aType, setAType] = useState<AssignType>('Additional responsibility');
  const [aFrom, setAFrom] = useState('');
  const [aTo, setATo] = useState('');
  const [aNote, setANote] = useState('');
  const addAssign = () => {
    setAssigns((prev) => [
      { id: Date.now(), type: aType, from: aFrom.trim() || 'Unassigned', to: aTo.trim() || clans[0] || 'Clan', note: aNote.trim() || undefined },
      ...prev,
    ]);
    setNewAssign(false);
    setAFrom('');
    setATo('');
    setANote('');
  };

  const [policies] = useState<Policy[]>(SEED_POLICIES);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <Page>
      <PageHeader
        title="Clan requests & policies"
        subtitle="Clan changes, cross-clan assignments, and the policies that govern them"
        actions={
          tab === 'crossclan' ? (
            <Button onClick={() => setNewAssign(true)}>
              <Plus className="h-4 w-4" /> New assignment
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'requests', label: `Change requests${pendingCount ? ` (${pendingCount})` : ''}` },
            { value: 'crossclan', label: 'Cross-clan' },
            { value: 'policies', label: 'Policies' },
          ]}
        />
      </div>

      {tab === 'requests' && (
        <section className="space-y-2.5">
          {requests.map((r) => {
            const m = getMentee(r.menteeId);
            const tone = r.status === 'approved' ? 'emerald' : r.status === 'denied' ? 'rose' : 'amber';
            return (
              <Card key={r.id} className="flex flex-wrap items-center gap-4 p-4">
                <Avatar initials={m?.avatar ?? '?'} name={m?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{m?.name ?? 'Mentee'}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{r.at}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-mute">
                    <Badge tone="neutral">{r.from}</Badge>
                    <ArrowRight className="h-3 w-3 text-ink-faint" />
                    <Badge tone="brand">{r.to}</Badge>
                    <span className="text-ink-faint">·</span>
                    <span>{r.reason}</span>
                  </div>
                  {r.resolution && (
                    <div className="mt-1.5 text-[11px] text-ink-soft">Resolution: {r.resolution}</div>
                  )}
                </div>
                {r.status === 'pending' ? (
                  <div className="flex items-center gap-2">
                    <Button variant="soft" size="sm" onClick={() => openResolve(r, true)}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openResolve(r, false)}>
                      <X className="h-3.5 w-3.5" /> Deny
                    </Button>
                  </div>
                ) : (
                  <Badge tone={tone}>{r.status === 'approved' ? 'Approved' : 'Denied'}</Badge>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {tab === 'crossclan' && (
        <section className="space-y-2.5">
          <Card className="flex items-start gap-3 border-dashed p-4">
            <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" />
            <p className="text-xs leading-relaxed text-ink-mute">
              Grant a clan additional responsibility, give a mentor co-mentee access across clans, or assign
              a psychologist to support a clan. Every assignment is logged and attributed.
            </p>
          </Card>
          {assigns.map((a) => {
            const Icon = a.type === 'Psychologist' ? HeartHandshake : a.type === 'Co-mentee access' ? UserPlus : Repeat;
            return (
              <Card key={a.id} className="flex flex-wrap items-center gap-4 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.type === 'Psychologist' ? 'violet' : 'brand'}>{a.type}</Badge>
                    <span className="text-sm text-ink-soft">{a.from}</span>
                    <ArrowRight className="h-3 w-3 text-ink-faint" />
                    <span className="text-sm font-medium text-ink">{a.to}</span>
                  </div>
                  {a.note && <div className="mt-1 text-xs text-ink-mute">{a.note}</div>}
                </div>
                <button
                  onClick={() => setAssigns((prev) => prev.filter((x) => x.id !== a.id))}
                  title="Remove"
                  className="rounded-r grid h-8 w-8 place-items-center text-ink-faint hover:bg-neutral-100 hover:text-[#FF3B30]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Card>
            );
          })}
        </section>
      )}

      {tab === 'policies' && (
        <section className="space-y-2.5">
          {policies.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 shrink-0 text-ink-mute" />
                <span className="text-sm font-semibold text-ink">{p.title}</span>
                <Badge tone="neutral">{p.category}</Badge>
              </div>
              <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-mute">{p.body}</p>
            </Card>
          ))}
          <Card className="flex items-center gap-3 border-dashed p-4 text-xs text-ink-faint">
            <Shield className="h-4 w-4 shrink-0" />
            Policies are set by the organization and apply across all clans.
          </Card>
        </section>
      )}

      {/* resolve a change request with dropdown reasoning */}
      {resolving && (
        <Modal
          open
          onClose={() => setResolving(null)}
          title="Resolve clan change request"
          subtitle={`${getMentee(resolving.menteeId)?.name ?? 'Mentee'} · ${resolving.from} to ${resolving.to}`}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setResolving(null)}>
                Cancel
              </Button>
              <Button onClick={applyResolve}>
                <Check className="h-4 w-4" /> Record decision
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label="Reason">
              <SelectInput value={resolution} onChange={(e) => setResolution(e.target.value)}>
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Note" hint="Optional context shared with the mentee and their leaders.">
              <TextArea rows={2} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Add a short note." />
            </Field>
          </div>
        </Modal>
      )}

      {/* new cross-clan assignment */}
      {newAssign && (
        <Modal
          open
          onClose={() => setNewAssign(false)}
          title="New cross-clan assignment"
          subtitle="Additional responsibility, co-mentee access, or a psychologist."
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setNewAssign(false)}>
                Cancel
              </Button>
              <Button onClick={addAssign}>
                <Plus className="h-4 w-4" /> Add assignment
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label="Type">
              <SelectInput value={aType} onChange={(e) => setAType(e.target.value as AssignType)}>
                {ASSIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From">
                <TextInput value={aFrom} onChange={(e) => setAFrom(e.target.value)} placeholder="Mentor or clan" />
              </Field>
              <Field label="To">
                <SelectInput value={aTo} onChange={(e) => setATo(e.target.value)}>
                  <option value="">Select clan…</option>
                  {clans.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Note">
              <TextArea rows={2} value={aNote} onChange={(e) => setANote(e.target.value)} placeholder="What is this assignment for?" />
            </Field>
          </div>
        </Modal>
      )}
    </Page>
  );
}
