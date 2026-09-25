'use client';

import { NO_CERTIFICATE, reviewSelection, aiSelection, decisionPayload } from '@/lib/utils/certificate-decision';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Award, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, Loader2, RefreshCw,
  Sparkles, XCircle,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { certificatesApi, type MenteeEvidence, type EvidenceRoadmap } from '@/lib/services/certificates-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { getTierBadgeColor } from '@/lib/utils/certificates';

interface MenteeEvidenceDrawerProps {
  templateId: string | null;
  initialSelection?: string;
  /** Open when set; the drawer fetches this mentee's case. */
  menteeId: string | null;
  onClose: () => void;
  /**
   * Adjust the roster's tier locally. Used only when no review round is open —
   * with a round, the decision is recorded against the round instead.
   */
  onTierChange?: (menteeId: string, tier: string) => void;
  /** Fired after a decision is saved, so the caller can reload its lists. */
  onDecided?: () => void;
  /** False for someone reading their own certificate. */
  canDecide?: boolean;
  navigation?: {
    position: number;
    total: number;
    onPrevious?: () => void;
    onNext?: () => void;
  };
}

/**
 * The case for one mentee's certificate.
 *
 * "Why did this person get Silver?" used to be answerable only from a stored AI
 * result — so it had no answer at all until somebody ran the evaluation, and a
 * stale one afterwards. This reads the record live and lays out the four things
 * that actually decide a grade: what the numbers are, how they measure against
 * the tier thresholds, what the AI made of them, and what a human decided.
 *
 * The override sits at the top rather than the bottom. When a mentor overrules
 * the AI, that — and their reason — is the single thing an admin opens this to
 * read; burying it under the metrics would make them hunt for it.
 */
export function MenteeEvidenceDrawer({
  templateId, menteeId, onClose, onTierChange, onDecided, canDecide = true, initialSelection, navigation,
}: MenteeEvidenceDrawerProps) {
  const [evidence, setEvidence] = useState<MenteeEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftTier, setDraftTier] = useState('');
  const [reason, setReason] = useState('');

  /**
   * Deps are the two ids and nothing else — deliberately.
   *
   * `onClose` used to be in here. Both call sites pass an inline arrow, so it
   * is a new function on every render: `load` changed identity every render,
   * the effect below re-fired, the fetch set state, and that rendered again.
   * The drawer hammered the endpoint in a loop until the request timed out and
   * sat blank. A callback prop must never gate a fetch.
   */
  const load = useCallback(async () => {
    if (!templateId || !menteeId) { setEvidence(null); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await certificatesApi.getMenteeEvidence(templateId, menteeId);
      if (res.success && res.data) {
        setEvidence(res.data);
        setDraftTier(initialSelection ?? (res.data.verification ? reviewSelection(res.data.verification) : aiSelection(res.data.ai)));
        setReason(res.data.verification?.overrideReason || '');
      } else {
        setError('That record came back empty.');
      }
    } catch (err) {
      // Closing the drawer on failure left the person staring at the roster
      // with no idea what happened. Say what went wrong, here, with a retry.
      setError(extractApiErrorMessage(err, 'Could not load this record.'));
    } finally {
      setLoading(false);
    }
  }, [templateId, menteeId, initialSelection]);

  useEffect(() => {
    if (!menteeId) { setEvidence(null); setError(null); return; }
    load();
  }, [menteeId, load]);

  useEffect(() => {
    if (!menteeId || !navigation) return;
    const navigate = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowLeft' && navigation.onPrevious) {
        event.preventDefault();
        navigation.onPrevious();
      }
      if (event.key === 'ArrowRight' && navigation.onNext) {
        event.preventDefault();
        navigation.onNext();
      }
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [menteeId, navigation]);

  const tierName = (id: string | null | undefined) =>
    id === NO_CERTIFICATE ? 'No certificate' : evidence?.criteria.find((c) => c.id === id)?.name || id || '—';

  const v = evidence?.verification ?? null;
  const m = evidence?.metrics;
  const basis = m?.completion_basis;

  /** A change away from the AI's pick needs a reason — the server insists too. */
  const aiTier = v?.aiDecision === 'no_certificate' ? NO_CERTIFICATE : v?.aiTier ?? aiSelection(evidence?.ai);
  const isChange = Boolean(draftTier && draftTier !== aiTier);
  const needsReason = isChange || draftTier === NO_CERTIFICATE || (v?.status === 'verified' && draftTier !== reviewSelection(v));
  const reasonMissing = needsReason && !reason.trim();

  const save = async () => {
    if (!templateId || !menteeId) return;
    // With no review round there is nothing to record a decision against, so
    // the change just moves the roster's tier and is signed off later.
    if (!v) {
      if (draftTier === NO_CERTIFICATE) { toast.error('An admin must open the review round before this decision can be recorded.'); return; }
      onTierChange?.(menteeId, draftTier);
      toast.success('Badge updated for this roster');
      onClose();
      return;
    }
    try {
      setSaving(true);
      await certificatesApi.verifyOne(templateId, menteeId, {
        ...decisionPayload(draftTier),
        reason: needsReason ? reason.trim() : undefined,
      });
      toast.success(isChange ? 'Grade changed and signed off' : 'Grade signed off');
      await onDecided?.();
      if (navigation?.onNext) navigation.onNext();
      else onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not save that decision'));
    } finally {
      setSaving(false);
    }
  };

  const name = evidence
    ? `${evidence.mentee.firstName} ${evidence.mentee.lastName}`.trim()
    : 'Certificate record';

  return (
    <Drawer
      open={Boolean(menteeId)}
      onClose={onClose}
      title={name}
      subtitle="Why this certificate"
      width="md"
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            Could not load this record
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:border-brand-500/40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : !evidence ? null : (
        <div className="space-y-5 pt-1">
          {navigation && navigation.total > 1 && (
            <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>Review progress</span>
                    <span>{navigation.position} / {navigation.total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.round((navigation.position / navigation.total) * 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={navigation.onPrevious} disabled={!navigation.onPrevious} aria-label="Previous mentee" className="rounded-lg border border-border p-2 text-foreground hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={navigation.onNext} disabled={!navigation.onNext} aria-label="Next mentee" className="rounded-lg border border-border p-2 text-foreground hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          )}
          {/* ── Who ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
            <Avatar src={evidence.mentee.profilePictureUrl ?? undefined} name={name} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {evidence.clan ? `${evidence.clan.name} · ` : ''}{evidence.mentee.email}
              </p>
            </div>
          </div>

          <DecisionBlock evidence={evidence} tierName={tierName} />
          {canDecide && !!v?.decisionHistory?.length && (
            <details className="rounded-xl border border-border p-3 text-xs">
              <summary className="cursor-pointer font-medium">Decision history</summary>
              <ol className="mt-3 space-y-3">
                {v.decisionHistory.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <p>{new Date(entry.at).toLocaleString()} · {entry.byName || 'Reviewer'} · {entry.from.decision === 'no_certificate' ? 'No certificate' : tierName(entry.from.tier)} → {entry.to.decision === 'no_certificate' ? 'No certificate' : tierName(entry.to.tier)}</p>
                    <p className="text-muted-foreground">{entry.reason || 'Confirmed the recommendation.'}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {/* ── The numbers behind it ──────────────────────────────────── */}
          {m && (
            <section className="space-y-2.5">
              <SectionLabel>What the record says</SectionLabel>

              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-foreground">Completion rate</span>
                  <span className="text-lg font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                    {m.completion_rate}%
                  </span>
                </div>
                {/* The sum, not just the result: a percentage nobody can check
                    is a number people argue with. */}
                {basis && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">
                      {basis.counted_completed} of {basis.counted_total}
                    </span>{' '}
                    {basis.basis === 'roadmap' ? 'roadmap tasks completed' : 'assigned tasks completed'}
                    {basis.basis === 'roadmap' && basis.custom_total > 0 && (
                      <> · {basis.custom_completed}/{basis.custom_total} extra custom tasks, not counted here</>
                    )}
                    {basis.basis === 'all_assigned' && (
                      <> · no roadmap tasks were assigned, so all assigned work is counted</>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Metric label="On-time submissions" value={`${Math.round(m.on_time_rate)}%`} />
                <Metric
                  label="Attendance"
                  value={m.cohort_reviews.data_available && m.cohort_reviews.attendance_pct != null
                    ? `${m.cohort_reviews.attendance_pct}%`
                    : 'No sessions'}
                  sub={m.cohort_reviews.data_available
                    ? `${m.cohort_reviews.present} present · ${m.cohort_reviews.excused} excused · ${m.cohort_reviews.absent} absent`
                    : undefined}
                />
                <Metric
                  label="Open blockers"
                  value={String(m.blockers.open)}
                  sub={`${m.blockers.resolved} of ${m.blockers.total} resolved`}
                  tone={m.blockers.open > 0 ? 'warn' : 'ok'}
                />
                <Metric
                  label="Average rating"
                  value={m.avg_rating != null ? `${m.avg_rating} / 5` : 'Not rated'}
                />
                <Metric label="Task score" value={`${m.score_breakdown.task_score}%`}
                  sub="60% points · 40% rating" />
                <Metric label="Overall score" value={`${m.normalized_score}%`}
                  sub="the composite the tiers are graded on" />
              </div>
            </section>
          )}

          <WorkBlock roadmaps={evidence.roadmaps || []} />

          {draftTier === NO_CERTIFICATE ? (
            <details className="space-y-3 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium">Eligibility by certificate type</summary>
              {evidence.criteria.map(tier => <ThresholdBlock key={tier.id} evidence={evidence} tier={tier.id} tierName={tierName} />)}
            </details>
          ) : <ThresholdBlock evidence={evidence} tier={draftTier || aiTier} tierName={tierName} />}

          {/* ── The AI's view, when it has one ─────────────────────────── */}
          {evidence.ai && (
            <section className="space-y-2.5">
              <SectionLabel>What the AI made of it</SectionLabel>
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  Proposed {tierName(aiSelection(evidence.ai))}
                  {evidence.ai.match_score != null && ` · ${Math.round(evidence.ai.match_score)}% match`}
                </div>
                <p className="text-xs text-foreground leading-relaxed">
                  {evidence.ai.reasoning || 'No reasoning was recorded for this evaluation.'}
                </p>
              </div>

              {(evidence.ai.matched_keywords?.length > 0 || evidence.ai.missing_keywords?.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {(evidence.ai.matched_keywords || []).map((kw) => (
                    <span key={`m-${kw}`} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> {kw}
                    </span>
                  ))}
                  {(evidence.ai.missing_keywords || []).map((kw) => (
                    <span key={`x-${kw}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      <XCircle className="w-3 h-3" /> {kw}
                    </span>
                  ))}
                </div>
              )}

              {(evidence.ai.custom_rules_check || []).length > 0 && (
                <div className="space-y-1.5">
                  {evidence.ai.custom_rules_check!.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5">
                      {rule.passed
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                        : <XCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{rule.rule}</p>
                        {rule.evidence && (
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{rule.evidence}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!evidence.ai && (
            <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground">
              The AI has not graded this cohort yet. Everything above is measured straight from the record.
            </p>
          )}

          {/* ── Change the grade ───────────────────────────────────────── */}
          {canDecide && (
            <section className="space-y-2.5">
              <SectionLabel>{v ? 'Your decision' : 'Assign a badge'}</SectionLabel>
              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <SelectMenu
                  value={draftTier}
                  onChange={setDraftTier}
                  options={[{ value: NO_CERTIFICATE, label: 'No certificate' }, ...evidence.criteria.map((c) => ({ value: c.id, label: c.name }))]}
                  placeholder="Pick a badge"
                  ariaLabel="Badge"
                  className="w-full"
                />

                {/* Required, because an admin reading this in a month — and the
                    mentor themselves — need to know why the evidence was
                    overruled. The server rejects an override without one. */}
                {needsReason && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-foreground">
                      Explain this decision ({tierName(draftTier)}). <span className="text-amber-600">Required</span>
                    </label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. mentored two juniors all season on top of their own track"
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !draftTier || reasonMissing}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {v
                    ? `${isChange ? 'Save change and sign off' : 'Sign off this grade'}${navigation?.onNext ? ' · Next' : ''}`
                    : 'Set badge'}
                </button>
                {reasonMissing && (
                  <p className="text-[11px] font-medium text-amber-600">A reason is needed to change a grade.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
  );
}

function Metric({
  label, value, sub, tone = 'plain',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'plain' | 'ok' | 'warn';
}) {
  const valueTone = tone === 'warn'
    ? 'text-amber-600 dark:text-amber-400'
    : tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${valueTone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * What was decided, and by whom. An override shows the journey — what the AI
 * said, what it became, and why — because that is the record an admin reviews.
 */
function DecisionBlock({
  evidence, tierName,
}: {
  evidence: MenteeEvidence;
  tierName: (id: string | null | undefined) => string;
}) {
  const v = evidence.verification;
  const issued = evidence.issued;

  if (issued) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Award className="w-4 h-4 shrink-0 text-emerald-500" />
          <span className="text-sm font-semibold text-foreground">Issued {tierName(issued.tier)}</span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(issued.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
        {issued.certificateNumber && (
          <p className="font-mono text-[11px] text-muted-foreground">{issued.certificateNumber}</p>
        )}
        {v?.overridden && <OverrideNote v={v} tierName={tierName} />}
      </div>
    );
  }

  if (!v) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-border bg-card p-4">
        <Clock className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
        <p className="text-xs text-muted-foreground">
          No review round is open for this certificate yet, so no grade has been signed off.
        </p>
      </div>
    );
  }

  if (v.status !== 'verified') {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <Clock className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
        <p className="text-xs text-foreground">
          Awaiting a mentor&apos;s sign-off. The AI proposed{' '}
          <span className="font-semibold">{tierName(v.aiDecision === 'no_certificate' ? NO_CERTIFICATE : v.aiTier)}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-500" />
        <span className="text-sm font-semibold text-foreground">
          Signed off as {tierName(reviewSelection(v))}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getTierBadgeColor(v.finalTier || '')}`}>
          {tierName(reviewSelection(v))}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {v.verifiedBy ? `by ${v.verifiedBy}` : 'by a mentor'}
        {v.verifiedAt && ` · ${new Date(v.verifiedAt).toLocaleDateString()}`}
      </p>
      {v.overrideReason && <OverrideNote v={v} tierName={tierName} />}
    </div>
  );
}

function OverrideNote({
  v, tierName,
}: {
  v: NonNullable<MenteeEvidence['verification']>;
  tierName: (id: string | null | undefined) => string;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        {v.overridden ? 'Changed by a mentor' : 'Review reason'}
        <span className="font-normal normal-case text-muted-foreground">
          {tierName(v.aiDecision === 'no_certificate' ? NO_CERTIFICATE : v.aiTier)} → {tierName(reviewSelection(v))}
        </span>
      </p>
      <p className="text-xs text-foreground leading-relaxed">
        {v.overrideReason || 'No reason was recorded.'}
      </p>
    </div>
  );
}

/**
 * How this mentee measures against the thresholds of the tier in question.
 *
 * Each row is "required vs actual", not a bare tick: a mentor asking why
 * somebody missed Gold needs the number they fell short on, and by how much.
 * Thresholds the template leaves unset are omitted rather than shown as
 * passed — there was nothing to pass.
 */
function ThresholdBlock({
  evidence, tier, tierName,
}: {
  evidence: MenteeEvidence;
  tier: string | null;
  tierName: (id: string | null | undefined) => string;
}) {
  if (!tier) return null;
  const thresholds = evidence.criteria.find((c) => c.id === tier);
  if (!thresholds) return null;

  const m = evidence.metrics;
  const attendance = m.cohort_reviews.data_available ? m.cohort_reviews.attendance_pct : null;

  const rows = [
    { label: 'Overall score',   required: thresholds.minScorePercent,   actual: m.normalized_score,        unit: '%' },
    { label: 'Completion rate', required: thresholds.minCompletionRate, actual: m.completion_rate,         unit: '%' },
    { label: 'On-time rate',    required: thresholds.minOnTimeRate,     actual: Math.round(m.on_time_rate), unit: '%' },
    { label: 'Average rating',  required: thresholds.minAvgRating,      actual: m.avg_rating,              unit: '' },
    { label: 'Attendance',      required: thresholds.minAttendanceRate, actual: attendance,                unit: '%' },
  ].filter((r) => r.required != null);

  // Blockers read the other way round — a maximum, not a minimum.
  const maxBlockers = thresholds.maxOpenBlockers;
  const blockerRow = maxBlockers != null && maxBlockers >= 0
    ? { label: 'Open blockers', required: maxBlockers, actual: m.blockers.open, atMost: true }
    : null;

  if (rows.length === 0 && !blockerRow) {
    return (
      <section className="space-y-2.5">
        <SectionLabel>Against {tierName(tier)}</SectionLabel>
        <p className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
          {tierName(tier)} sets no numeric thresholds. Check its keyword and custom-rule evidence before deciding.
        </p>
      </section>
    );
  }

  const eligible = evidence.constraints.maxEligibleTier;

  return (
    <section className="space-y-2.5">
      <SectionLabel>Against {tierName(tier)}</SectionLabel>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map((r) => {
          const ok = r.actual != null && r.actual >= (r.required as number);
          return (
            <ThresholdRow
              key={r.label}
              label={r.label}
              ok={ok}
              detail={r.actual == null
                ? `no data · needs ${r.required}${r.unit}`
                : `${r.actual}${r.unit} · needs ${r.required}${r.unit}`}
            />
          );
        })}
        {blockerRow && (
          <ThresholdRow
            label={blockerRow.label}
            ok={blockerRow.actual <= blockerRow.required}
            detail={`${blockerRow.actual} open · at most ${blockerRow.required}`}
          />
        )}
      </div>
      {eligible !== tier && (
        <p className="text-[11px] text-muted-foreground">
          {eligible ? <>On the thresholds alone this mentee clears <span className="font-medium text-foreground">{tierName(eligible)}</span>.</> : 'This mentee does not meet the numeric requirements for any configured certificate type.'}
        </p>
      )}
    </section>
  );
}

function ThresholdRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
        {ok
          ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          : <XCircle className="w-4 h-4 shrink-0 text-red-500" />}
        {label}
      </span>
      <span className={`text-[11px] tabular-nums ${ok ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400 font-medium'}`}>
        {detail}
      </span>
    </div>
  );
}

/**
 * The work behind the grade, roadmap by roadmap.
 *
 * A completion percentage is a claim; the tasks under it are the evidence. An
 * admin deciding whether to trust a mentor's grade needs to see which syllabus
 * the mentee was set, how much of it is finished, and exactly what is still
 * outstanding — so each roadmap opens to the task list rather than stopping at
 * a number.
 *
 * Collapsed by default: the counts answer the usual question, and the list is
 * there for the times they do not.
 */
function WorkBlock({ roadmaps }: { roadmaps: EvidenceRoadmap[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!roadmaps.length) {
    return (
      <section className="space-y-2.5">
        <SectionLabel>The work</SectionLabel>
        <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground">
          No tasks have been assigned to this mentee yet.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5">
      <SectionLabel>The work</SectionLabel>
      {roadmaps.map((roadmap) => {
        const key = roadmap.id ?? 'custom';
        const isOpen = open === key;
        return (
          <div key={key} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : key)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{roadmap.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{roadmap.completed} of {roadmap.total}</span> done
                  {roadmap.remaining > 0 && ` · ${roadmap.remaining} outstanding`}
                  {roadmap.late > 0 && ` · ${roadmap.late} late`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                  {roadmap.percent}%
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* A bar reads faster than a number when comparing two mentees. */}
            <div className="h-1 w-full bg-muted">
              <div className="h-full bg-brand-500" style={{ width: `${roadmap.percent}%` }} />
            </div>

            {isOpen && (
              <ul className="divide-y divide-border border-t border-border">
                {roadmap.tasks.map((task, i) => (
                  <li key={`${task.title}-${i}`} className="flex items-start gap-2.5 px-4 py-2.5">
                    {task.status === 'completed'
                      ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                      : <Circle className="w-4 h-4 shrink-0 text-muted-foreground/50 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs ${task.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {task.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {task.status === 'completed' ? 'Completed' : task.status.replace(/_/g, ' ')}
                        {task.rating != null && ` · rated ${task.rating}/5`}
                        {task.isLate && ' · late'}
                        {task.difficulty && ` · ${task.difficulty}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
