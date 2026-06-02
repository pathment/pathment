import { useMemo, useState } from 'react';
import {
  Gift,
  Trophy,
  Link2,
  Sparkles,
  Check,
  Copy,
  Star,
  Building2,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel } from '@/lib/ui';
import { Modal, Field, SelectInput, Segmented } from '@/components/overlays';
import { useStore } from '@/store/AppStore';

/* ----------------------------------------------------------------
   Rewards & incentives - the gamification economy. XP earned across
   roadmaps and streaks can be spent here, milestones unlock perks,
   referrals compound reach, and top mentees get surfaced to partners.
----------------------------------------------------------------- */

type View = 'gifts' | 'incentives' | 'referrals' | 'talent';

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'gifts', label: 'Gifts catalog' },
  { value: 'incentives', label: 'Incentives' },
  { value: 'referrals', label: 'Referrals' },
  { value: 'talent', label: 'Talent network' },
];

interface GiftItem {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  stock: string;
}

const GIFTS: GiftItem[] = [
  { id: 'swag', name: 'Swag pack', blurb: 'Tee, stickers, and a notebook shipped to the door.', cost: 600, stock: 'In stock' },
  { id: 'credit', name: 'Course credit', blurb: 'One free elective course of their choosing.', cost: 1500, stock: 'In stock' },
  { id: 'oneonone', name: '1:1 with a senior eng', blurb: 'Forty-five minutes with a staff engineer at a partner.', cost: 2400, stock: 'Limited' },
  { id: 'conf', name: 'Conference ticket', blurb: 'A pass to a regional engineering conference.', cost: 4000, stock: 'Limited' },
];

interface Milestone {
  id: string;
  name: string;
  reward: string;
  cost: number;
}

const MILESTONES: Milestone[] = [
  { id: 'first-roadmap', name: 'First roadmap complete', reward: 'Swag pack + 250 XP', cost: 250 },
  { id: 'streak-30', name: '30-day streak', reward: 'Course credit voucher', cost: 800 },
  { id: 'ten-reviews', name: 'Ten clean reviews', reward: 'Profile spotlight badge', cost: 400 },
  { id: 'mentor-pick', name: "Mentor's pick of the month", reward: '1:1 with a senior engineer', cost: 1200 },
];

interface Referral {
  id: string;
  invited: string;
  status: 'joined' | 'invited' | 'completed';
  reward: string;
}

const REFERRAL_SEED: Referral[] = [
  { id: 'r1', invited: 'Hamza Sheikh', status: 'completed', reward: '+500 XP' },
  { id: 'r2', invited: 'Noor Fatima', status: 'joined', reward: '+200 XP' },
  { id: 'r3', invited: 'Bilal Ahmed', status: 'invited', reward: 'Pending' },
];

const REFERRAL_TONE: Record<Referral['status'], 'emerald' | 'sky' | 'neutral'> = {
  completed: 'emerald',
  joined: 'sky',
  invited: 'neutral',
};

const REFERRAL_LABEL: Record<Referral['status'], string> = {
  completed: 'Completed',
  joined: 'Joined',
  invited: 'Invited',
};

const INVITE_LINK = 'https://pathment.app/join?ref=mentor-7f3a';

export function Rewards() {
  const { mentees } = useStore();

  const [view, setView] = useState<View>('gifts');

  // gifts: redeem flow
  const [redeemFor, setRedeemFor] = useState<GiftItem | null>(null);
  const [redeemMentee, setRedeemMentee] = useState('');
  const [redeemed, setRedeemed] = useState<Array<{ gift: string; name: string }>>([]);

  // referrals: copy state
  const [copied, setCopied] = useState(false);

  // talent: nominations keyed by mentee id
  const [nominated, setNominated] = useState<Record<number, boolean>>({});

  // Milestone unlockers - first few mentees stand in as the people who hit them.
  const milestoneOwners = useMemo(
    () => MILESTONES.map((m, i) => ({ milestone: m, owner: mentees[i % Math.max(mentees.length, 1)] })),
    [mentees],
  );

  // Talent ranking - a simple local blend of progress and reliability.
  const ranked = useMemo(
    () =>
      [...mentees]
        .map((m) => ({ m, score: Math.round(m.absoluteProgress * 0.6 + m.onTimeRate * 0.4) }))
        .sort((a, b) => b.score - a.score),
    [mentees],
  );

  const openRedeem = (gift: GiftItem) => {
    setRedeemFor(gift);
    setRedeemMentee('');
  };

  const confirmRedeem = () => {
    if (!redeemFor || !redeemMentee) return;
    const who = mentees.find((m) => m.id === Number(redeemMentee));
    setRedeemed((prev) => [{ gift: redeemFor.name, name: who?.name ?? 'a mentee' }, ...prev].slice(0, 4));
    setRedeemFor(null);
    setRedeemMentee('');
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(INVITE_LINK);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const toggleNominate = (id: number) =>
    setNominated((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Page>
      <PageHeader
        title="Rewards"
        subtitle="The incentive economy - spend earned XP, unlock milestones, grow the network, and surface talent"
      />

      <div className="mb-6">
        <Segmented value={view} onChange={setView} options={VIEWS} />
      </div>

      {/* ---------------------------------------------------------- GIFTS */}
      {view === 'gifts' && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Redeemable gifts</SectionLabel>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              {GIFTS.length} items
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {GIFTS.map((g) => (
              <Card key={g.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-r border border-hairline text-ink-mute">
                    <Gift className="h-5 w-5" />
                  </span>
                  <Badge tone="brand">{g.cost} XP</Badge>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-ink">{g.name}</h3>
                <p className="mt-1 flex-1 text-xs text-ink-mute">{g.blurb}</p>
                <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                  <span className="font-mono text-[11px] text-ink-faint">{g.stock}</span>
                  <Button size="sm" variant="soft" onClick={() => openRedeem(g)}>
                    Redeem
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {redeemed.length > 0 && (
            <Card className="mt-4 p-5">
              <SectionLabel>Recently redeemed</SectionLabel>
              <ul className="divide-y divide-hairline">
                {redeemed.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 py-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="text-ink-soft">
                      <span className="font-medium text-ink">{r.gift}</span> redeemed for {r.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------- INCENTIVES */}
      {view === 'incentives' && (
        <section>
          <SectionLabel>Milestone rewards</SectionLabel>
          <Card className="p-0">
            <ul className="divide-y divide-hairline">
              {milestoneOwners.map(({ milestone, owner }) => (
                <li
                  key={milestone.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-r border border-hairline text-ink-mute">
                    <Trophy className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{milestone.name}</div>
                    <div className="mt-0.5 text-xs text-ink-mute">Reward: {milestone.reward}</div>
                  </div>
                  {owner ? (
                    <span className="flex items-center gap-2">
                      <Avatar initials={owner.avatar} name={owner.name} size="xs" />
                      <span className="text-xs text-ink-soft">{owner.name}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint">Unclaimed</span>
                  )}
                  <span className="font-mono text-[11px] text-ink-faint tnum">+{milestone.cost} XP</span>
                  <Badge tone={owner ? 'emerald' : 'neutral'}>
                    {owner ? 'Unlocked' : 'Locked'}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Sparkles className="h-3 w-3" />
            Milestones unlock automatically as mentees hit the underlying activity.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------------- REFERRALS */}
      {view === 'referrals' && (
        <section className="space-y-4">
          <Card className="p-5">
            <SectionLabel>Your invite link</SectionLabel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-r border border-hairline bg-neutral-50 px-3 py-2">
                <Link2 className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="truncate font-mono text-xs text-ink-soft">{INVITE_LINK}</span>
              </div>
              <Button variant={copied ? 'success' : 'soft'} onClick={copyLink} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-mute">
              Share this link with people you think would thrive here. You earn 200 XP when an invite
              joins, and 500 XP once they finish their first roadmap.
            </p>
          </Card>

          <Card className="p-0">
            <div className="border-b border-hairline px-5 py-3">
              <SectionLabel>Your referrals</SectionLabel>
            </div>
            <ul className="divide-y divide-hairline">
              {REFERRAL_SEED.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <span className="min-w-0 flex-1 text-sm text-ink">{r.invited}</span>
                  <Badge tone={REFERRAL_TONE[r.status]}>{REFERRAL_LABEL[r.status]}</Badge>
                  <span className="font-mono text-[11px] text-ink-faint tnum">{r.reward}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ---------------------------------------------------------- TALENT */}
      {view === 'talent' && (
        <section>
          <SectionLabel>Talent network</SectionLabel>
          <Card className="p-0">
            <ul className="divide-y divide-hairline">
              {ranked.map(({ m, score }, i) => {
                const isUp = !!nominated[m.id];
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <span className="w-6 shrink-0 font-mono text-[11px] text-ink-faint tnum">
                      {i + 1}
                    </span>
                    <Avatar initials={m.avatar} name={m.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                        {isUp && (
                          <Badge tone="brand">
                            <Star className="h-3 w-3" /> Promoted
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-mute">
                        {m.program} · {m.level}
                      </div>
                    </div>
                    <span className="hidden font-mono text-[11px] text-ink-faint tnum sm:inline">
                      score {score}
                    </span>
                    <Button
                      size="sm"
                      variant={isUp ? 'outline' : 'soft'}
                      onClick={() => toggleNominate(m.id)}
                    >
                      {isUp ? 'Nominated' : 'Nominate'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Building2 className="h-3 w-3" />
            Nominated mentees are surfaced to partner companies looking to hire.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------------- REDEEM MODAL */}
      <Modal
        open={redeemFor !== null}
        onClose={() => setRedeemFor(null)}
        title={redeemFor ? `Redeem ${redeemFor.name}` : 'Redeem gift'}
        subtitle={redeemFor ? `Costs ${redeemFor.cost} XP from the mentee's balance.` : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setRedeemFor(null)}>
              Cancel
            </Button>
            <Button onClick={confirmRedeem} disabled={!redeemMentee}>
              <Check className="h-4 w-4" /> Confirm redeem
            </Button>
          </div>
        }
      >
        <Field label="Redeem for" hint="Pick which mentee receives this reward.">
          <SelectInput value={redeemMentee} onChange={(e) => setRedeemMentee(e.target.value)} autoFocus>
            <option value="">Select a mentee…</option>
            {mentees.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </Modal>
    </Page>
  );
}
