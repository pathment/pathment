'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Sparkles, Star, Users, Loader2, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useMentorAssignment } from '@/lib/hooks/admin';
import { PageHeader } from '@/components/admin/ui';
import { Avatar } from '@/components/shared/Avatar';

export default function MentorAssignment() {
  const [showAISuggestions, setShowAISuggestions] = useState(true);

  // ── per-enrollment manual override state ────────────────────────────────
  const [overrides, setOverrides] = useState<Record<string, {
    open: boolean;
    mentorId: string;
  }>>({});

  const patchOverride = (enrollmentId: string, patch: Partial<{ open: boolean; mentorId: string }>) => {
    setOverrides(prev => {
      const existing = prev[enrollmentId] ?? { open: false, mentorId: '' };
      return { ...prev, [enrollmentId]: { ...existing, ...patch } };
    });
  };

  const {
    programs,
    selectedProgram,
    setSelectedProgram,
    enrollments,
    suggestions,
    loading,
    allMentors,
    mentorsLoading,
    mentorSearch,
    setMentorSearch,
    mentorPage,
    setMentorPage,
    mentorTotalPages,
    mentorTotal,
    matching,
    autoMatching,
    handleCreateMatch,
    handleAutoMatch,
  } = useMentorAssignment();

  if (loading && programs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Mentor Assignment"
        subtitle="Match mentees with mentors using AI-powered recommendations"
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      {/* Clan-based placement banner - the preferred path */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 dark:bg-brand-500/10 px-5 py-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Placement is now clan-based</p>
            <p className="text-sm text-slate-600">
              Place a mentee into a clan and they inherit that clan&apos;s mentor(s). The 1:1 matching below still works for direct assignments.
            </p>
          </div>
        </div>
        <Link href="/admin/clans" className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Manage clans <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* AI Matching Banner */}
      {showAISuggestions && (
        <div className="bg-linear-to-r from-brand-50 dark:from-brand-500/10 to-brand-50 dark:to-transparent border border-brand-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-brand-900 mb-2">AI Matching Enabled</h2>
              <p className="text-brand-700 text-sm mb-4">
                Our AI analyzes mentee backgrounds, skills, and learning goals to suggest the best mentor matches
                based on expertise, availability, and teaching style compatibility.
              </p>
              <button
                onClick={handleAutoMatch}
                disabled={autoMatching || enrollments.length === 0}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {autoMatching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Matching…</>
                ) : (
                  'Auto-Match All Pending'
                )}
              </button>
            </div>
            <button onClick={() => setShowAISuggestions(false)} className="text-brand-600 hover:text-brand-700">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Program Filter */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6 mb-6">
        <label className="block text-slate-900 mb-3">Filter by Program</label>
        <select
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className="w-full md:w-96 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          disabled={loading}
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-slate-900 mb-2">No Pending Matches</h3>
          <p className="text-slate-600 text-sm">All mentees in this program have been matched with mentors.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* ── Pending Matches ───────────────────────────────────────────── */}
          <div>
            <div className="bg-card rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-slate-900">Pending Matches</h2>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm">
                  {enrollments.length}
                </span>
              </div>
              <div className="divide-y divide-slate-200">
                {enrollments.map((enrollment) => {
                  const mentee       = enrollment.mentee;
                  const profile      = mentee?.menteeProfile;
                  const topSuggestion = (suggestions[enrollment.id] || [])[0];

                  return (
                    <div key={enrollment.id} className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <Avatar name={`${mentee?.firstName ?? ''} ${mentee?.lastName ?? ''}`.trim()} src={mentee?.profilePictureUrl} size="lg" href={mentee?.id ? `/admin/mentees/${mentee.id}` : undefined} />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-slate-900 mb-1">{mentee?.firstName} {mentee?.lastName}</h3>
                          <p className="text-slate-600 text-sm mb-2">
                            {profile?.priorExperience || profile?.currentEducation || 'No background available'}
                          </p>
                          {((profile?.learningGoals?.length > 0) || (profile?.interests?.length > 0)) && (
                            <div className="flex flex-wrap gap-2">
                              {profile?.learningGoals?.map((goal: string, idx: number) => (
                                <span key={`goal-${idx}`} className="px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs">{goal}</span>
                              ))}
                              {profile?.interests?.map((interest: string, idx: number) => (
                                <span key={`interest-${idx}`} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">{interest}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {topSuggestion ? (
                        <div className="p-4 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-brand-600" />
                            <span className="text-brand-900 text-sm">
                              AI Recommended Match
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar name={`${topSuggestion.mentor?.firstName ?? ''} ${topSuggestion.mentor?.lastName ?? ''}`.trim()} src={topSuggestion.mentor?.profilePictureUrl} size="md" href={topSuggestion.mentor?.id ? `/admin/mentors/${topSuggestion.mentor.id}` : undefined} />
                              <div>
                                <div className="text-slate-900 text-sm">
                                  {topSuggestion.mentor?.firstName} {topSuggestion.mentor?.lastName}
                                </div>
                                <div className="text-slate-600 text-xs">{Math.round(topSuggestion.matchScore)}% match</div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleCreateMatch(enrollment.id, topSuggestion.mentor.id)}
                              disabled={matching === enrollment.id}
                              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {matching === enrollment.id ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</>
                              ) : (
                                'Assign'
                              )}
                            </button>
                          </div>
                          <p className="text-slate-600 text-xs mt-2">{topSuggestion.reason}</p>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                          <p className="text-slate-600 text-sm">No mentor suggestions available</p>
                        </div>
                      )}

                      {/* ── Manual Override ─────────────────────────────── */}
                      <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => patchOverride(enrollment.id, { open: !overrides[enrollment.id]?.open })}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm transition-colors"
                        >
                          <span>Assign manually (pick any mentor)</span>
                          {overrides[enrollment.id]?.open
                            ? <ChevronUp className="w-4 h-4 text-slate-500" />
                            : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </button>

                        {overrides[enrollment.id]?.open && (
                          <div className="p-4 bg-card border-t border-slate-200 space-y-3">
                            {/* Mentor picker */}
                            <div>
                              <label className="block text-slate-600 text-xs mb-1.5">Mentor</label>
                              <select
                                value={overrides[enrollment.id]?.mentorId || ''}
                                onChange={(e) => patchOverride(enrollment.id, { mentorId: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                              >
                                <option value="">Select mentor…</option>
                                {allMentors.map((m: any) => (
                                  <option key={m.id} value={m.id}>
                                    {m.firstName} {m.lastName}{m.mentorProfile?.title ? ` - ${m.mentorProfile.title}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              disabled={
                                matching === enrollment.id ||
                                !overrides[enrollment.id]?.mentorId
                              }
                              onClick={() => {
                                const mntr = overrides[enrollment.id]?.mentorId;
                                if (mntr) handleCreateMatch(enrollment.id, mntr);
                              }}
                              className="w-full px-4 py-2 bg-[#1e293b] hover:bg-[#0f172a] text-white rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {matching === enrollment.id
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</>
                                : 'Assign Manually'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Available Mentors ─────────────────────────────────────────── */}
          <div>
            <div className="bg-card rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-slate-900">Available Mentors</h2>
                  <p className="text-slate-500 text-xs mt-0.5">{mentorTotal} mentor{mentorTotal !== 1 ? 's' : ''}</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={mentorSearch}
                    onChange={(e) => setMentorSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent w-56"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {mentorsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                  </div>
                ) : allMentors.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-slate-900 mb-2">
                      {mentorSearch.trim() ? 'No mentors found' : 'No Mentors Available'}
                    </h3>
                    <p className="text-slate-600 text-sm">
                      {mentorSearch.trim()
                        ? `No mentors match "${mentorSearch.trim()}"`
                        : 'There are no active mentors in the system.'}
                    </p>
                  </div>
                ) : (
                  allMentors.map((mentor: any) => {
                    const capacity        = mentor.mentorProfile?.currentMenteeCount ?? 0;
                    const maxCapacity     = mentor.mentorProfile?.maxMentees || 6;
                    const capacityPercent = maxCapacity > 0 ? (capacity / maxCapacity) * 100 : 0;

                    return (
                      <div key={mentor.id} className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <Avatar name={`${mentor.firstName ?? ''} ${mentor.lastName ?? ''}`.trim()} src={mentor.profilePictureUrl} size="lg" href={mentor.id ? `/admin/mentors/${mentor.id}` : undefined} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-slate-900">{mentor.firstName} {mentor.lastName}</h3>
                              {mentor.mentorProfile?.rating && (
                                <div className="flex items-center gap-1">
                                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                  <span className="text-slate-700 text-sm">{mentor.mentorProfile.rating}</span>
                                </div>
                              )}
                            </div>
                            {mentor.mentorProfile?.title && (
                              <p className="text-slate-500 text-xs mb-2">
                                {mentor.mentorProfile.title}
                                {mentor.mentorProfile.organization ? ` · ${mentor.mentorProfile.organization}` : ''}
                              </p>
                            )}
                            {mentor.mentorProfile?.specialization?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {mentor.mentorProfile.specialization.map((skill: string, idx: number) => (
                                  <span key={idx} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">{skill}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {capacity}/{maxCapacity} mentees
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                            <span>Capacity</span>
                            <span>{Math.round(capacityPercent)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                capacityPercent < 70 ? 'bg-green-500' : capacityPercent < 90 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                            />
                          </div>
                        </div>

                        <Link
                          href={`/admin/mentors/${mentor.id}`}
                          className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Profile
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>

              {mentorTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-sm text-slate-500">Page {mentorPage} of {mentorTotalPages}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMentorPage(p => Math.max(1, p - 1))}
                      disabled={mentorPage === 1 || mentorsLoading}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <span className="text-sm text-slate-700 min-w-12 text-center">
                      {mentorPage} / {mentorTotalPages}
                    </span>
                    <button
                      onClick={() => setMentorPage(p => Math.min(mentorTotalPages, p + 1))}
                      disabled={mentorPage === mentorTotalPages || mentorsLoading}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

