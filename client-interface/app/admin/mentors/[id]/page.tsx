'use client';

import Link from 'next/link';
import {
  ArrowLeft, Mail, Building2, Briefcase, Star,
  Users, CheckCircle2, Clock, TrendingUp, Award,
  Linkedin, Github, Globe, AlertCircle, Loader2,
  UserCheck, BookOpen, ChevronRight,
} from 'lucide-react';
import { useMentorProfile } from '@/lib/hooks/admin';
import type { MentorSkill, MentorActiveMatch } from '@/lib/hooks/admin';
import { StatsCard, PageHeader } from '@/components/admin/ui';
import { MentorFeedbackAdminPanel } from '@/components/admin/MentorFeedbackAdminPanel';
import { Avatar } from '@/components/shared/Avatar';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROFICIENCY_CLS: Record<string, string> = {
  beginner:     'bg-slate-100 text-slate-600',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced:     'bg-brand-100 text-brand-700',
  expert:       'bg-purple-100 text-purple-700',
};

/** "program_completed" → "Program Completed" */
const formatStatus = (s: string | null | undefined): string => {
  if (!s) return '-';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Show "-" for zero/null ratings & percentages */
const formatRate = (val: number | string | null | undefined): string => {
  const n = parseFloat(String(val ?? 0));
  return n > 0 ? `${Math.round(n)}%` : '-';
};

const formatRating = (val: number | string | null | undefined): string => {
  const n = parseFloat(String(val ?? 0));
  return n > 0 ? n.toFixed(1) : '-';
};

/** "all" → "All Levels", null/undefined → "-", otherwise title-case */
const formatLevel = (l: string | null | undefined): string => {
  if (!l) return '-';
  return l === 'all' ? 'All Levels' : l.replace(/\b\w/g, (c) => c.toUpperCase());
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMentorProfilePage() {
  const { mentor, activeMatches, isLoading, error } = useMentorProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !mentor) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Mentor not found</h2>
        <p className="text-slate-500 text-sm mb-6">{error ?? 'This mentor profile does not exist.'}</p>
        <Link href="/admin/users/mentors" className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Mentors
        </Link>
      </div>
    );
  }

  const mp = mentor.mentorProfile;
  const capacityPct = mp?.maxMentees ? Math.round(((mp.currentMenteeCount ?? 0) / mp.maxMentees) * 100) : 0;

  // Deduplicate specializations - filter out any value that is just the org name
  const specializations = (mp?.specialization ?? []).filter(
    (s) => s && s !== mp?.organization
  );

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={`${mentor.firstName} ${mentor.lastName}`}
        subtitle={mp?.organization ?? undefined}
        backHref="/admin/users/mentors"
        backLabel="Back to Mentors"
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Identity card */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="mb-4">
                <Avatar name={`${mentor.firstName} ${mentor.lastName}`} src={(mentor as { profilePictureUrl?: string | null }).profilePictureUrl} size="xl" />
              </div>
              <p className="text-xl font-bold text-slate-900">{mentor.firstName} {mentor.lastName}</p>
              {mp?.title && <p className="text-slate-600 text-sm mt-1">{mp.title}</p>}
              {mp?.organization && (
                <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {mp.organization}
                </p>
              )}

              {/* Accepting badge */}
              <span className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${mp?.isAcceptingMentees !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${mp?.isAcceptingMentees !== false ? 'bg-green-500' : 'bg-slate-400'}`} />
                {mp?.isAcceptingMentees !== false ? 'Accepting mentees' : 'Not accepting mentees'}
              </span>
            </div>

            {/* Contact + links */}
            <div className="space-y-3">
              <a href={`mailto:${mentor.email}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                {mentor.email}
              </a>
              {mp?.linkedinUrl && (
                <a href={mp.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors">
                  <Linkedin className="w-4 h-4 text-slate-400 shrink-0" />
                  LinkedIn Profile
                </a>
              )}
              {mp?.githubUrl && (
                <a href={mp.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors">
                  <Github className="w-4 h-4 text-slate-400 shrink-0" />
                  GitHub Profile
                </a>
              )}
              {mp?.portfolioUrl && (
                <a href={mp.portfolioUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors">
                  <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  Portfolio
                </a>
              )}
            </div>
          </div>

          {/* Capacity */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Mentee Capacity</h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-slate-900">{mp?.currentMenteeCount ?? 0}</span>
              <span className="text-sm text-slate-500">of {mp?.maxMentees ?? '-'} max</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all ${capacityPct < 70 ? 'bg-green-500' : capacityPct < 90 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(capacityPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">{capacityPct}% capacity used</p>
          </div>

          {/* Meta */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5 space-y-3">
            {mp?.yearsOfExperience != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 flex items-center gap-2"><Briefcase className="w-4 h-4" />Experience</span>
                <span className="text-sm font-medium text-slate-900">{mp.yearsOfExperience} yrs</span>
              </div>
            )}
            {mp?.avgResponseTimeHours != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4" />Avg Response</span>
                <span className="text-sm font-medium text-slate-900">{mp.avgResponseTimeHours}h</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 flex items-center gap-2"><Award className="w-4 h-4" />Member Since</span>
              <span className="text-sm font-medium text-slate-900">
                {new Date(mentor.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </div>
            {mp?.preferredMenteeLevel && mp.preferredMenteeLevel.length > 0 && (
              <div>
                <p className="text-sm text-slate-500 mb-2">Preferred Level</p>
                <div className="flex flex-wrap gap-1.5">
                  {mp.preferredMenteeLevel.map((l) => (
                    <span key={l} className="px-2 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs font-medium">
                      {formatLevel(l)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatsCard icon={Users}        label="Active Mentees"  value={activeMatches.length}              colorClass="text-brand-600 bg-brand-50" />
            <StatsCard icon={TrendingUp}   label="Success Rate"    value={formatRate(mp?.successRate)}       colorClass="text-green-600 bg-green-50" />
            <StatsCard icon={Star}         label="Avg Rating"      value={formatRating(mp?.avgFeedbackRating)} colorClass="text-amber-600 bg-amber-50" />
            <StatsCard icon={CheckCircle2} label="Tasks Reviewed"  value={mp?.totalTasksReviewed ?? 0}       colorClass="text-purple-600 bg-purple-50" />
          </div>

          {/* Specializations */}
          {specializations.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-400" />
                Specializations
              </h3>
              <div className="flex flex-wrap gap-2">
                {specializations.map((s) => (
                  <span key={s} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {mentor.skills && mentor.skills.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" />
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {mentor.skills.map((skill) => {
                  const level = skill.UserSkill?.proficiencyLevel ?? 'intermediate';
                  return (
                    <span key={skill.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${PROFICIENCY_CLS[level] ?? PROFICIENCY_CLS.intermediate}`}>
                      {skill.name}
                      <span className="opacity-60 capitalize">· {level}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active mentees */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" />
                Current Mentees
              </h3>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                {activeMatches.length}
              </span>
            </div>

            {activeMatches.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-400">No active mentees right now</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeMatches.map((match) => {
                  const pct = parseFloat(String(match.enrollment?.overallProgressPercentage ?? 0));
                  return (
                    <div key={match.id} className="flex items-center gap-4 px-6 py-4">
                      <Avatar name={`${match.mentee?.firstName ?? ''} ${match.mentee?.lastName ?? ''}`.trim()} src={match.mentee?.profilePictureUrl} size="md" href={match.mentee?.id ? `/admin/mentees/${match.mentee.id}` : undefined} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {match.mentee?.firstName} {match.mentee?.lastName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {match.enrollment?.program?.name ?? 'No program'}
                          {match.enrollment?.status && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                              {formatStatus(match.enrollment.status)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{pct}% progress</p>
                        </div>
                        <Link
                          href={`/admin/enrollment/overview`}
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Anonymous mentee feedback (admin moderation view) */}
          {mentor?.id && <MentorFeedbackAdminPanel mentorId={mentor.id} />}
        </div>
      </div>
    </>
  );
}
