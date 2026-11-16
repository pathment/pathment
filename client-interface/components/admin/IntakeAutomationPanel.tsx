'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Github, Loader2, Sparkles, UsersRound } from 'lucide-react';
import { applicationApi } from '@/lib/services/intake-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

type IntakePool = { id: string; name: string; status: string; attached: boolean };

/**
 * What happens to an applicant without anyone pressing anything.
 *
 *   apply → Pathment AI reviews them (the form, their GitHub, the assessment
 *   if there is one) against the level criteria below and sets their level →
 *   they join every attached selection pool at that level → the pool hands
 *   them that level's work.
 *
 * Each step is a switch here, so an intake can run fully hands-off or stop at
 * any point for a person to decide.
 */
export function IntakeAutomationPanel({ cohortId, hasLevels }: { cohortId: string; hasLevels: boolean }) {
  const [autoReview, setAutoReview] = useState<boolean | null>(null);
  const [readGithub, setReadGithub] = useState<boolean | null>(null);
  const [pools, setPools] = useState<IntakePool[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    applicationApi.getLevelRules(cohortId)
      .then((r: { data?: { autoReview?: boolean; readGithub?: boolean } }) => {
        if (!alive) return;
        setAutoReview(r?.data?.autoReview !== false);
        setReadGithub(r?.data?.readGithub !== false);
      })
      .catch(() => { if (alive) { setAutoReview(true); setReadGithub(true); } });
    applicationApi.intakePools(cohortId)
      .then((r) => { if (alive) setPools(r?.data?.pools ?? []); })
      .catch(() => { if (alive) setPools([]); });
    return () => { alive = false; };
  }, [cohortId]);

  const saveSwitch = async (key: 'autoReview' | 'readGithub', value: boolean) => {
    setBusy(key);
    try {
      await applicationApi.setReviewAutomation(cohortId, { [key]: value });
      if (key === 'autoReview') setAutoReview(value); else setReadGithub(value);
      toast.success(key === 'autoReview'
        ? (value ? 'Pathment AI will review and level each applicant' : 'Applicants wait for you to review them')
        : (value ? 'The review will read applicants’ GitHub' : 'GitHub will not be read'));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save'));
    } finally { setBusy(null); }
  };

  const togglePool = async (pool: IntakePool) => {
    setBusy(pool.id);
    try {
      await applicationApi.setIntakePool(cohortId, pool.id, !pool.attached);
      setPools((cur) => (cur || []).map((p) => (p.id === pool.id ? { ...p, attached: !p.attached } : p)));
      toast.success(pool.attached ? `Detached from ${pool.name}` : `Attached: applicants go into ${pool.name}, including everyone who already applied`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not change the pool'));
    } finally { setBusy(null); }
  };

  const attached = (pools || []).filter((p) => p.attached);

  return (
    <div className="space-y-3">
      <Switch
        icon={<Sparkles className="h-4 w-4 text-brand-600" />}
        title="Automatic AI review"
        text={hasLevels
          ? 'Pathment AI reviews each applicant against the level criteria as soon as they apply (or when their assessment comes in) and sets their level. Off: a review only recommends, and you apply it.'
          : 'Add levels to this intake to let Pathment AI place applicants.'}
        checked={!!autoReview}
        loading={autoReview === null || busy === 'autoReview'}
        disabled={!hasLevels}
        onChange={(v) => saveSwitch('autoReview', v)}
      />
      <Switch
        icon={<Github className="h-4 w-4 text-slate-700" />}
        title="Read their GitHub"
        text="When an answer has a GitHub link or username, the review reads their public profile (repositories, languages, recent activity) as evidence, not just what they typed."
        checked={!!readGithub}
        loading={readGithub === null || busy === 'readGithub'}
        onChange={(v) => saveSwitch('readGithub', v)}
      />

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <UsersRound className="h-4 w-4 text-brand-600" /> Selection pools
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Applicants join every attached pool at their level, and the pool gives them that level&apos;s work.
        </p>
        {pools === null ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading pools…</div>
        ) : pools.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No open selection pool in this program yet. <Link href="/admin/pools" className="font-medium text-brand-700 hover:underline">Create one</Link>, then attach it here.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {pools.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-2.5 py-2">
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/pools/${p.id}`} className="block truncate text-sm text-slate-800 hover:text-brand-700">{p.name}</Link>
                  <span className="text-[11px] capitalize text-slate-400">{p.status}</span>
                </span>
                <button
                  type="button"
                  onClick={() => togglePool(p)}
                  disabled={busy === p.id}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${p.attached
                    ? 'bg-brand-50 text-brand-700 hover:bg-rose-50 hover:text-rose-700'
                    : 'border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'}`}
                  title={p.attached ? 'Detach: new applicants stop going into this pool' : 'Attach: applicants go into this pool'}
                >
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : p.attached ? 'Attached' : 'Attach'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The pipeline, said plainly, so an admin knows what one applicant will go through. */}
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {autoReview && hasLevels ? 'Apply → AI review sets their level' : 'Apply → you review them'}
        {attached.length
          ? ` → joins ${attached.map((p) => p.name).join(', ')} at ${autoReview && hasLevels ? 'that level' : 'the level they picked (or you set)'} → gets that level’s work.`
          : ' → no pool attached, so they stay here.'}
      </p>
    </div>
  );
}

function Switch({ icon, title, text, checked, loading, disabled = false, onChange }: {
  icon: React.ReactNode; title: string; text: string; checked: boolean; loading: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border border-slate-200 p-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{text}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled || loading} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
      <span aria-hidden className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'} peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}
