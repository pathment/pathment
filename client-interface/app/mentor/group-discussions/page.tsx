'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarClock, ChevronRight, Loader2, MessageCircle, MessageSquareQuote, Plus, Trash2, Users } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { EmptyState } from '@/components/shared/EmptyState';
import { DiscussionStateBadge, discussionTimeLabel } from '@/components/shared/discussions/DiscussionStatus';
import { ScenarioDrawer } from '@/components/shared/discussions/ScenarioDrawer';
import { EntityCard, entityCardSecondaryBtn, formatDateRange } from '@/components/admin/EntityCard';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { cleanHtml, isBlankHtml } from '@/lib/utils/html';
import { NewGroupDrawer } from '@/components/mentor/discussions/NewGroupDrawer';
import { useClanMentees } from '@/components/mentor/discussions/useClanMentees';
import { groupDiscussionsApi, scenarioLength, SCENARIO_MAX_CHARS, SCENARIO_TITLE_MAX, type DiscussionScenario } from '@/lib/services/group-discussions-api';
import { CharacterCount } from '@/components/shared/CharacterCount';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { useApiQuery, qk } from '@/lib/query';

const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A scenario's status pill, from its groups: open beats upcoming beats ended. */
function scenarioStatus(groups: DiscussionScenario['groups']) {
  if (groups.some((group) => group.state === 'open')) return { label: 'Open', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (groups.some((group) => group.state === 'upcoming')) return { label: 'Upcoming', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (groups.length) return { label: 'Ended', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return { label: 'No groups', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
}

/** When the scenario's groups run, from the first opening to the last close. */
function scenarioDates(groups: DiscussionScenario['groups']) {
  if (!groups.length) return 'No groups yet';
  const opens = groups.map((group) => group.opensAt).filter(Boolean).sort() as string[];
  const closes = groups.map((group) => group.closesAt).filter(Boolean).sort() as string[];
  return formatDateRange(opens[0], closes[closes.length - 1]) || 'No time limit';
}

/**
 * One scenario as a card, in the design of the Intake and Pools cards: what
 * it is, the facts across its groups, the groups themselves (each opening its
 * page), and what to do next.
 */
function ScenarioCard({ scenario, onRead, onNewGroup, onDelete }: {
  scenario: DiscussionScenario;
  onRead: () => void;
  onNewGroup: () => void;
  onDelete: () => void;
}) {
  const { groups } = scenario;
  const open = groups.filter((group) => group.state === 'open').length;
  const mentees = groups.reduce((sum, group) => sum + group.memberCount, 0);
  const messages = groups.reduce((sum, group) => sum + group.messageCount, 0);

  return (
    <EntityCard
      status={scenarioStatus(groups)}
      icon={(
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
          <MessageSquareQuote className="h-4.5 w-4.5" aria-hidden />
        </span>
      )}
      title={scenario.title}
      stats={[
        { label: 'Groups', value: groups.length },
        { label: 'Open now', value: open, tone: open ? 'good' : 'default' },
        { label: 'Mentees', value: mentees },
        { label: 'Messages', value: messages },
      ]}
      footer={scenarioDates(groups)}
      actions={(
        <>
          {scenario.prompt && (
            <button type="button" onClick={onRead} aria-haspopup="dialog" className={entityCardSecondaryBtn}>
              View scenario
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${scenario.title}`}
            title="Delete scenario"
            className={`${entityCardSecondaryBtn} hover:border-red-200 hover:text-red-600`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
      primaryLabel={<><Plus className="h-4 w-4" /> New group</>}
      onPrimary={onNewGroup}
    >
      {!groups.length ? (
        <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-slate-500">No groups yet. Add one to start this discussion.</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-muted/30 dark:divide-slate-800 dark:border-slate-800">
          {groups.map((group) => (
            <li key={group.id}>
              <Link href={`/mentor/group-discussions/${group.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 group-hover:text-brand-600">
                    <span className="truncate">{group.name}</span>
                    <DiscussionStateBadge state={group.state} />
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{discussionTimeLabel(group)}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums"><Users className="h-3.5 w-3.5" aria-hidden />{plural(group.memberCount, 'mentee')}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums"><MessageCircle className="h-3.5 w-3.5" aria-hidden />{plural(group.messageCount, 'message')}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </EntityCard>
  );
}

/**
 * Every scenario of the clan and the groups discussing it. This is the
 * mentor's way into a group's progress and chat.
 */
export default function MentorGroupDiscussionsPage() {
  const { activeClanId, clans } = useClan();
  const clanId = activeClanId === ALL_CLANS ? null : activeClanId;
  const needsClan = activeClanId === ALL_CLANS && clans.length > 1;
  const confirm = useConfirm();

  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.mentor.groupDiscussions(clanId),
    queryFn: () => groupDiscussionsApi.list(clanId),
    enabled: !needsClan,
  });
  const mentees = useClanMentees(data?.clanId ?? clanId);

  const [creatingScenario, setCreatingScenario] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  // The editor reads its content once, so each new scenario gets a fresh one.
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [groupFor, setGroupFor] = useState<DiscussionScenario | null>(null);
  // Scenarios can run to pages, so the list shows titles and opens one in the scenario drawer.
  const [readingId, setReadingId] = useState<string | null>(null);

  const scenarios = data?.scenarios ?? [];
  const reading = scenarios.find((scenario) => scenario.id === readingId) ?? null;

  const createScenario = async () => {
    setSaving(true);
    try {
      await groupDiscussionsApi.createScenario({ clanId: data?.clanId ?? clanId, title: title.trim(), prompt: isBlankHtml(prompt) ? undefined : cleanHtml(prompt) });
      toast.success('Scenario created');
      setCreatingScenario(false);
      setTitle('');
      setPrompt('');
      await refetch();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not create the scenario');
    } finally {
      setSaving(false);
    }
  };

  const deleteScenario = async (scenario: DiscussionScenario) => {
    const ok = await confirm({
      title: `Delete "${scenario.title}"?`,
      description: scenario.groups.length
        ? `Its ${scenario.groups.length} group${scenario.groups.length === 1 ? '' : 's'} and all their messages are deleted too. This cannot be undone.`
        : 'This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await groupDiscussionsApi.deleteScenario(scenario.id);
      toast.success('Scenario deleted');
      await refetch();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not delete it');
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquareQuote className="w-6 h-6 text-brand-600" aria-hidden /> Group discussions
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">Give a scenario to a group of mentees and follow how they discuss it.</p>
        </div>
        {!needsClan && (
          <button
            type="button"
            onClick={() => { setEditorKey((key) => key + 1); setCreatingScenario(true); }}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New scenario
          </button>
        )}
      </div>

      {needsClan ? (
        <EmptyState title="Select a clan" description="Choose a clan in the sidebar to see its group discussions." />
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : !scenarios.length ? (
        <EmptyState
          icon={<MessageSquareQuote className="h-6 w-6" />}
          title="No scenarios yet"
          description="Create a scenario, then add a group of mentees to discuss it."
          action={{ label: 'New scenario', onClick: () => { setEditorKey((key) => key + 1); setCreatingScenario(true); } }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onRead={() => setReadingId(scenario.id)}
              onNewGroup={() => setGroupFor(scenario)}
              onDelete={() => deleteScenario(scenario)}
            />
          ))}
        </div>
      )}

      <Drawer
        open={creatingScenario}
        onClose={() => setCreatingScenario(false)}
        title="New scenario"
        footer={(
          <button
            type="button"
            onClick={createScenario}
            disabled={saving || !title.trim() || scenarioLength(prompt) > SCENARIO_MAX_CHARS}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create scenario
          </button>
        )}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="scenario-title" className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input id="scenario-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={SCENARIO_TITLE_MAX} placeholder="e.g. The missed deadline" aria-describedby="scenario-title-count" className={FIELD} />
            <CharacterCount id="scenario-title-count" count={title.length} max={SCENARIO_TITLE_MAX} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Scenario</span>
            <RichTextEditor key={editorKey} content={prompt} onChange={setPrompt} placeholder="What should the group discuss?" minHeight="220px" />
            <CharacterCount count={scenarioLength(prompt)} max={SCENARIO_MAX_CHARS} />
          </div>
        </div>
      </Drawer>

      {reading && (
        <ScenarioDrawer open onClose={() => setReadingId(null)} title={reading.title} prompt={reading.prompt} />
      )}

      {groupFor && (
        <NewGroupDrawer
          scenarioId={groupFor.id}
          scenarioTitle={groupFor.title}
          mentees={mentees}
          onClose={() => setGroupFor(null)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
