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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROFICIENCY_CLS: Record<string, string> = {
  beginner:     'bg-slate-100 text-slate-600',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced:     'bg-indigo-100 text-indigo-700',
  expert:       'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMentorProfilePage() {
  const { mentor, activeMatches, isLoading, error } = useMentorProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
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
        <Link href="/admin/matching/mentor-assignment" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Mentor Assignment
        </Link>
      </div>
    );
  }

  const mp = mentor.mentorProfile;
  const initials = `${mentor.firstName?.[0] ?? ''}${mentor.lastName?.[0] ?? ''}`;
  const capacityPct = mp?.maxMentees ? Math.round(((mp.currentMenteeCount ?? 0) / mp.maxMentees) * 100) : 0;

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={`${mentor.firstName} ${mentor.lastName}`}
        subtitle={mp?.title ?? undefined}
        backHref="/admin/matching/mentor-assignment"
        backLabel="Back to Mentor Assignment"
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Identity card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-20 h-20 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-2xl font-bold mb-4">
                {initials}
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
              <a href={`mailto:${mentor.email}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-indigo-600 transition-colors">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                {mentor.email}
              </a>
              {mp?.linkedinUrl && (
                <a href={mp.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-indigo-600 transition-colors">
                  <Linkedin className="w-4 h-4 text-slate-400 shrink-0" />
                  LinkedIn Profile
                </a>
              )}
              {mp?.githubUrl && (
                <a href={mp.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-indigo-600 transition-colors">
                  <Github className="w-4 h-4 text-slate-400 shrink-0" />
                  GitHub Profile
                </a>
              )}
              {mp?.portfolioUrl && (
                <a href={mp.portfolioUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-indigo-600 transition-colors">
                  <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  Portfolio
                </a>
              )}
            </div>
          </div>

          {/* Capacity */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Mentee Capacity</h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-slate-900">{mp?.currentMenteeCount ?? 0}</span>
              <span className="text-sm text-slate-500">of {mp?.maxMentees ?? '—'} max</span>
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
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
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
                    <span key={l} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium capitalize">{l}</span>
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
            <StatsCard icon={Users}      label="Total Mentored"  value={mp?.totalMenteesGuided ?? 0}   colorClass="text-indigo-600 bg-indigo-50" />
            <StatsCard icon={TrendingUp} label="Success Rate"    value={`${mp?.successRate ?? 0}%`}    colorClass="text-green-600 bg-green-50" />
            <StatsCard icon={Star}       label="Avg Rating"      value={mp?.avgFeedbackRating != null ? Number(mp.avgFeedbackRating).toFixed(1) : '—'} colorClass="text-amber-600 bg-amber-50" />
            <StatsCard icon={CheckCircle2} label="Tasks Reviewed" value={mp?.totalTasksReviewed ?? 0}  colorClass="text-purple-600 bg-purple-50" />
          </div>

          {/* Specializations */}
          {mp?.specialization && mp.specialization.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-400" />
                Specializations
              </h3>
              <div className="flex flex-wrap gap-2">
                {mp.specialization.map((s) => (
                  <span key={s} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {mentor.skills && mentor.skills.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
          <div className="bg-white rounded-2xl border border-slate-200">
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
                      <div className="w-9 h-9 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
                        {match.mentee?.firstName?.[0]}{match.mentee?.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {match.mentee?.firstName} {match.mentee?.lastName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {match.enrollment?.program?.name ?? 'No program'} · {match.enrollment?.status ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
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
        </div>
      </div>
    </>
  );
}
