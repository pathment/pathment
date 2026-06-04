'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FileText, Loader2, Copy, Check, AlertTriangle, Star, TrendingUp, TrendingDown,
  Minus, ClipboardCheck, Flag, ArrowUpRight, Activity, Gauge, Sparkles, Printer, RefreshCw,
} from 'lucide-react';
import { useMentorCohort, type CohortMentee } from '@/lib/hooks/mentor';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useAuth } from '@/lib/context/AuthContext';

// ── Helpers ────────────────────────────────────────────────────────────────
const pct = (n: number) => `${Math.round(n)}%`;
const firstName = (full: string) => full.split(' ')[0];
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** A single, transparent next step for an at-risk mentee. */
function nextStep(m: CohortMentee): string {
  if (m.openBlockers > 0) return `Clear ${m.openBlockers} blocker${m.openBlockers > 1 ? 's' : ''}`;
  if (m.pendingApprovals > 0) return `Review ${m.pendingApprovals} submission${m.pendingApprovals > 1 ? 's' : ''}`;
  if (m.relativeProgress - m.absoluteProgress >= 15) return 'Falling behind pace — check in';
  if (m.momentum === 'down') return 'Going quiet — reach out';
  return 'Check in';
}

// Literal class strings (no runtime concatenation) so Tailwind keeps them.
const HEALTH_BANDS = [
  { min: 78, label: 'Healthy', tone: 'text-emerald-700', stroke: 'stroke-emerald-500', soft: 'bg-emerald-50 border-emerald-200' },
  { min: 58, label: 'Steady', tone: 'text-indigo-700', stroke: 'stroke-indigo-500', soft: 'bg-indigo-50 border-indigo-200' },
  { min: 40, label: 'Needs attention', tone: 'text-amber-700', stroke: 'stroke-amber-500', soft: 'bg-amber-50 border-amber-200' },
  { min: 0, label: 'At risk', tone: 'text-red-700', stroke: 'stroke-red-500', soft: 'bg-red-50 border-red-200' },
] as const;
const bandFor = (score: number) => HEALTH_BANDS.find((b) => score >= b.min)!;

function Avatar({ m }: { m: CohortMentee }) {
  return m.profilePictureUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.profilePictureUrl} alt={m.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
      <span className="text-indigo-700 text-xs font-semibold">{m.avatar}</span>
    </div>
  );
}

function MomentumPill({ momentum }: { momentum: CohortMentee['momentum'] }) {
  const cfg = {
    up: { Icon: TrendingUp, cls: 'text-emerald-600' },
    flat: { Icon: Minus, cls: 'text-slate-400' },
    down: { Icon: TrendingDown, cls: 'text-red-500' },
  }[momentum];
  return <cfg.Icon className={`w-4 h-4 ${cfg.cls}`} />;
}

export default function MentorReports() {
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const { user } = useAuth();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [copied, setCopied] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const report = useMemo(() => {
    if (!cohort.length) return null;
    const size = cohort.length;

    const avgProgress = Math.round(avg(cohort.map((m) => m.absoluteProgress)));
    const avgOnTime = Math.round(avg(cohort.map((m) => m.onTimeRate)));
    const rated = cohort.filter((m) => m.avgRating > 0);
    const avgRating = rated.length ? Number(avg(rated.map((m) => m.avgRating)).toFixed(1)) : null;

    const onTrack = cohort.filter((m) => m.risk === 'low');
    const watch = cohort.filter((m) => m.risk === 'watch');
    const high = cohort.filter((m) => m.risk === 'high');
    const atRisk = [...high, ...watch].sort((a, b) => (a.risk === 'high' ? -1 : 1) - (b.risk === 'high' ? -1 : 1));

    const rising = cohort.filter((m) => m.momentum === 'up').length;
    const steady = cohort.filter((m) => m.momentum === 'flat').length;
    const slipping = cohort.filter((m) => m.momentum === 'down').length;

    const pending = totals?.pendingApprovals ?? cohort.reduce((n, m) => n + m.pendingApprovals, 0);
    const openBlockers = totals?.openBlockers ?? cohort.reduce((n, m) => n + m.openBlockers, 0);

    // Health: progress + on-time delivery + share of the cohort on track.
    const onTrackShare = onTrack.length / size;
    const health = Math.round(avgProgress * 0.4 + avgOnTime * 0.3 + onTrackShare * 100 * 0.3);

    // Highlights ranked by real momentum: progress made, on time, well-rated.
    const highlights = [...cohort]
      .sort((a, b) => (b.absoluteProgress + b.onTimeRate) - (a.absoluteProgress + a.onTimeRate))
      .slice(0, 3);

    const actions: string[] = [];
    if (pending > 0) actions.push(`Clear ${pending} pending review${pending > 1 ? 's' : ''} in your approvals queue.`);
    if (high.length) actions.push(`Prioritise ${high.map((m) => firstName(m.name)).join(', ')} — flagged at risk.`);
    if (openBlockers > 0) actions.push(`Help unblock ${openBlockers} open blocker${openBlockers > 1 ? 's' : ''} across the cohort.`);
    if (slipping > 0) actions.push(`Re-engage ${slipping} mentee${slipping > 1 ? 's' : ''} whose momentum is slipping.`);
    if (!actions.length) actions.push('Cohort is healthy — keep the steady cadence and celebrate the wins.');

    const band = bandFor(health);
    const overview =
      `Your ${size}-mentee cohort is ${band.label.toLowerCase()} this ${period}: ` +
      `${avgProgress}% average progress, ${avgOnTime}% on-time delivery` +
      `${avgRating ? `, ${avgRating}★ average work quality` : ''}. ` +
      `${onTrack.length} on track, ${watch.length} to watch, ${high.length} at risk.`;

    return {
      size, avgProgress, avgOnTime, avgRating, onTrack, watch, high, atRisk,
      rising, steady, slipping, pending, openBlockers, health, band, highlights, actions, overview,
    };
  }, [cohort, totals, period]);

  const copy = async () => {
    if (!report) return;
    const lines = [
      `COHORT REPORT — this ${period}${user?.firstName ? ` · ${user.firstName}` : ''}`,
      '='.repeat(48),
      '',
      report.overview,
      '',
      `Health score: ${report.health}/100 (${report.band.label})`,
      `Avg progress: ${report.avgProgress}%   On-time: ${report.avgOnTime}%${report.avgRating ? `   Quality: ${report.avgRating}★` : ''}`,
      `Momentum: ${report.rising} rising · ${report.steady} steady · ${report.slipping} slipping`,
      `Open work: ${report.pending} pending review${report.pending === 1 ? '' : 's'}, ${report.openBlockers} blocker${report.openBlockers === 1 ? '' : 's'}`,
      '',
      'TOP PERFORMERS',
      ...report.highlights.map((m) => `  • ${m.name} — ${pct(m.absoluteProgress)} progress, ${pct(m.onTimeRate)} on time${m.avgRating > 0 ? `, ${m.avgRating}★` : ''}`),
      '',
      'NEEDS ATTENTION',
      ...(report.atRisk.length
        ? report.atRisk.map((m) => `  • ${m.name} (${m.risk}) — ${m.riskReason || 'flagged'} → ${nextStep(m)}`)
        : ['  • Nobody flagged right now.']),
      '',
      'RECOMMENDED ACTIONS',
      ...report.actions.map((a, i) => `  ${i + 1}. ${a}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true); toast.success('Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy'); }
  };

  const draftWithAI = async () => {
    try {
      setAiLoading(true);
      const res = await mentorApi.getCohortReportSummary(period);
      const text = res?.data?.summary ?? res?.summary ?? '';
      if (!text) { toast.error('The model returned an empty draft — try again'); return; }
      setAiDraft(text);
      toast.success('Draft ready — edit it, then copy or print');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not draft the summary. Check Settings → AI Connections.'));
    } finally {
      setAiLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!aiDraft) return;
    try { await navigator.clipboard.writeText(aiDraft); toast.success('Draft copied'); }
    catch { toast.error('Could not copy'); }
  };

  const printReport = () => window.print();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1">Cohort report</h1>
          <p className="text-slate-600">A ready-to-share read of how your mentees are doing — drop it into your update.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(['week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={draftWithAI} disabled={!report || aiLoading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? 'Drafting…' : 'Draft with AI'}
          </button>
          <button onClick={printReport} disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Export as PDF (print → save as PDF)">
            <Printer className="w-4 h-4" />PDF
          </button>
          <button onClick={copy} disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : !report ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No cohort data to report on yet</p>
          <p className="text-slate-400 text-sm mt-1">Once you have active mentees, their summary shows up here.</p>
        </div>
      ) : (
        <div id="cohort-report" className="space-y-6">
          {/* Print-only header (the on-screen title/controls are hidden when printing) */}
          <div className="hidden print:block mb-2">
            <h1 className="text-xl font-bold text-slate-900">Cohort report — this {period}</h1>
            <p className="text-sm text-slate-500">{user?.firstName ? `${user.firstName} · ` : ''}{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* AI-drafted narrative (editable) */}
          {aiDraft !== null && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
              <div className="no-print flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h2 className="font-semibold text-slate-900">AI draft</h2>
                  <span className="text-xs text-slate-400">editable</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={draftWithAI} disabled={aiLoading}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-50 transition-colors">
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate
                  </button>
                  <button onClick={copyDraft}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
                    <Copy className="w-3.5 h-3.5" />Copy
                  </button>
                </div>
              </div>
              <textarea
                value={aiDraft}
                onChange={(e) => setAiDraft(e.target.value)}
                rows={Math.max(5, aiDraft.split('\n').length + 1)}
                className="no-print w-full bg-transparent text-sm text-slate-700 leading-relaxed resize-y focus:outline-none"
              />
              {/* Print rendering of the (possibly edited) draft */}
              <p className="hidden print:block text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiDraft}</p>
            </div>
          )}

          {/* Executive summary — health + distribution */}
          <div className={`rounded-2xl border p-6 ${report.band.soft}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {/* Health score */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9155" fill="none" className="stroke-white/70" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3" strokeLinecap="round"
                      className={report.band.stroke}
                      strokeDasharray={`${report.health}, 100`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">{report.health}</span>
                    <span className="text-[10px] text-slate-400">/ 100</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Gauge className={`w-4 h-4 ${report.band.tone}`} />
                    <span className={`text-sm font-semibold ${report.band.tone}`}>{report.band.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Cohort health</p>
                </div>
              </div>

              {/* Narrative */}
              <p className="text-sm text-slate-700 leading-relaxed flex-1">{report.overview}</p>
            </div>

            {/* Distribution bar */}
            <div className="mt-5">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-white/60">
                {report.onTrack.length > 0 && <div className="bg-emerald-500" style={{ width: `${(report.onTrack.length / report.size) * 100}%` }} />}
                {report.watch.length > 0 && <div className="bg-amber-400" style={{ width: `${(report.watch.length / report.size) * 100}%` }} />}
                {report.high.length > 0 && <div className="bg-red-500" style={{ width: `${(report.high.length / report.size) * 100}%` }} />}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{report.onTrack.length} on track</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{report.watch.length} to watch</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{report.high.length} at risk</span>
              </div>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Avg progress', value: `${report.avgProgress}%`, sub: 'through their programs' },
              { label: 'On-time delivery', value: `${report.avgOnTime}%`, sub: 'tasks met their due date' },
              { label: 'Work quality', value: report.avgRating ? `${report.avgRating}★` : '—', sub: report.avgRating ? 'avg task rating' : 'no ratings yet' },
              { label: 'Needs attention', value: String(report.atRisk.length), sub: `of ${report.size} mentees` },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
                <div className="text-xs text-slate-500">{c.label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{c.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Momentum + Open work */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" />Momentum</h2>
              <div className="space-y-3">
                {[
                  { label: 'Rising', n: report.rising, cls: 'bg-emerald-500' },
                  { label: 'Steady', n: report.steady, cls: 'bg-slate-300' },
                  { label: 'Slipping', n: report.slipping, cls: 'bg-red-500' },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-slate-600 shrink-0">{r.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.cls}`} style={{ width: `${(r.n / report.size) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-sm font-medium text-slate-700 tabular-nums shrink-0">{r.n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4">Open work</h2>
              <div className="space-y-3">
                <Link href="/mentor/review" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><ClipboardCheck className="w-4 h-4 text-indigo-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">Pending reviews</p>
                    <p className="text-xs text-slate-400">awaiting your feedback</p>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">{report.pending}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </Link>
                <Link href="/mentor/dashboard" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0"><Flag className="w-4 h-4 text-orange-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">Open blockers</p>
                    <p className="text-xs text-slate-400">slowing mentees down</p>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">{report.openBlockers}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                </Link>
              </div>
            </div>
          </div>

          {/* Top performers */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Top performers</h2>
            <div className="space-y-1">
              {report.highlights.map((m, i) => (
                <Link key={m.id} href={`/mentor/mentees/${m.id}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors group">
                  <span className="w-5 text-sm font-semibold text-slate-300 tabular-nums">{i + 1}</span>
                  <Avatar m={m} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400 truncate">{m.program}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                    <span>{pct(m.absoluteProgress)} done</span>
                    <span>{pct(m.onTimeRate)} on time</span>
                    {m.avgRating > 0 && <span className="inline-flex items-center gap-0.5 text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{m.avgRating}</span>}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </div>

          {/* Needs attention */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Needs attention</h2>
            {report.atRisk.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Check className="w-4 h-4 text-emerald-500" />Nobody’s flagged right now — nice work.
              </div>
            ) : (
              <div className="space-y-2">
                {report.atRisk.map((m) => (
                  <Link key={m.id} href={`/mentor/mentees/${m.id}`}
                    className="flex items-start gap-3 -mx-2 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                    <Avatar m={m} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${m.risk === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {m.risk === 'high' ? 'At risk' : 'Watch'}
                        </span>
                        <MomentumPill momentum={m.momentum} />
                      </div>
                      {m.riskReason && <p className="text-xs text-slate-500 mt-0.5">{m.riskReason}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-400">
                        <span>{pct(m.absoluteProgress)} progress</span>
                        {m.pendingApprovals > 0 && <span className="text-indigo-600">{m.pendingApprovals} to review</span>}
                        {m.openBlockers > 0 && <span className="text-orange-600">{m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}</span>}
                        <span>last active {m.lastActive}</span>
                      </div>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-600 group-hover:text-indigo-600 shrink-0 mt-0.5">
                      {nextStep(m)} <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recommended actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3">Recommended actions</h2>
            <ol className="space-y-2.5">
              {report.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {a}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Print isolation: only the report region prints, at full width. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #cohort-report, #cohort-report * { visibility: visible !important; }
          #cohort-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          #cohort-report .rounded-2xl, #cohort-report .rounded-xl { box-shadow: none !important; }
        }
      ` }} />
    </div>
  );
}
