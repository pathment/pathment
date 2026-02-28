'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles, Star, Users, Loader2, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { enrollmentApi, matchingApi, mentorApi } from '@/lib/services/enrollment-api';
import { programManagementApi } from '@/lib/services/program-api';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { toast } from 'sonner';

export default function MentorAssignment() {
  const [selectedProgram, setSelectedProgram] = useState('');
  const [showAISuggestions, setShowAISuggestions] = useState(true);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  
  const [programs, setPrograms] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [mentors, setMentors] = useState<Record<string, any[]>>({});
  const [suggestions, setSuggestions] = useState<Record<string, any[]>>({});

  const [mentorSearch, setMentorSearch] = useState('');
  const [allMentors, setAllMentors] = useState<any[]>([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);
  const [mentorPage, setMentorPage] = useState(1);
  const [mentorTotalPages, setMentorTotalPages] = useState(1);
  const [mentorTotal, setMentorTotal] = useState(0);
  const MENTOR_LIMIT = 10;
  const debouncedMentorSearch = useDebounce(mentorSearch, 400);

  useEffect(() => {
    fetchPrograms();
    fetchAllMentors();
  }, []);

  useEffect(() => {
    if (selectedProgram) {
      fetchEnrollments();
    }
  }, [selectedProgram]);

  useEffect(() => {
    setMentorPage(1);
  }, [debouncedMentorSearch]);

  useEffect(() => {
    fetchAllMentors();
  }, [debouncedMentorSearch, mentorPage]);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getAll();
      const programsList = Array.isArray(response?.data) ? response.data : [];
      setPrograms(programsList);
      
      if (programsList.length > 0 && !selectedProgram) {
        setSelectedProgram(programsList[0].id);
      }
    } catch (error: any) {
      console.error('Failed to fetch programs:', error);
      toast.error('Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({
        programId: selectedProgram,
        status: 'pending_match'
      });
      
      const enrollmentsList = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(enrollmentsList);

      // Fetch mentors and suggestions for each enrollment
      for (const enrollment of enrollmentsList) {
        if (enrollment.currentLevel?.id) {
          await fetchLevelMentors(enrollment.currentLevel.id);
          await fetchAISuggestions(enrollment.id);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllMentors = async () => {
    try {
      setMentorsLoading(true);
      const response = await mentorApi.getAll({
        ...(debouncedMentorSearch.trim() && { search: debouncedMentorSearch.trim() }),
        page: mentorPage,
        limit: MENTOR_LIMIT,
      });
      setAllMentors(Array.isArray(response?.data?.mentors) ? response.data.mentors : []);
      setMentorTotalPages(response?.pagination?.totalPages ?? 1);
      setMentorTotal(response?.pagination?.totalItems ?? 0);
    } catch (error: any) {
      console.error('Failed to fetch mentors:', error);
    } finally {
      setMentorsLoading(false);
    }
  };

  const fetchLevelMentors = async (levelId: string) => {
    try {
      const response = await matchingApi.getLevelMentors(levelId);
      const mentorsList = response?.data?.mentors || response?.mentors || [];
      setMentors(prev => ({ ...prev, [levelId]: mentorsList }));
    } catch (error: any) {
      console.error('Failed to fetch level mentors:', error);
    }
  };

  const fetchAISuggestions = async (enrollmentId: string) => {
    try {
      const response = await matchingApi.getSuggestions(enrollmentId);
      const suggestionsList = response?.data?.suggestions || response?.suggestions || [];
      setSuggestions(prev => ({ ...prev, [enrollmentId]: suggestionsList }));
    } catch (error: any) {
      console.error('Failed to fetch AI suggestions:', error);
    }
  };

  const handleCreateMatch = async (enrollmentId: string, mentorId: string, levelId: string) => {
    try {
      setMatching(enrollmentId);
      await matchingApi.createMatch({ enrollmentId, mentorId, levelId });
      toast.success('Match created successfully!');
      
      // Refresh enrollments
      await fetchEnrollments();
    } catch (error: any) {
      console.error('Failed to create match:', error);
      toast.error(error.response?.data?.message || 'Failed to create match');
    } finally {
      setMatching(null);
    }
  };

  const selectedProgramData = programs.find(p => p.id === selectedProgram);

  const handleAutoMatch = async () => {
    if (!confirm(`Auto-match all pending enrollments${selectedProgram ? ' in this program' : ''}? This will assign the top AI-suggested mentor to each unmatched mentee.`)) return;
    try {
      setAutoMatching(true);
      const response = await matchingApi.autoMatchPending(selectedProgram || undefined);
      const { summary } = response?.data || {};
      toast.success(
        `Auto-match complete: ${summary?.matched ?? 0} matched, ${summary?.skipped ?? 0} skipped, ${summary?.failed ?? 0} failed`
      );
      if ((summary?.matched ?? 0) > 0) {
        await fetchEnrollments();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Auto-match failed');
    } finally {
      setAutoMatching(false);
    }
  };

  if (loading && programs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>
        <h1 className="text-slate-900 mb-2">Mentor Assignment</h1>
        <p className="text-slate-600">Match mentees with mentors using AI-powered recommendations</p>
      </div>

      {/* AI Matching Banner */}
      {showAISuggestions && (
        <div className="bg-linear-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-indigo-900 mb-2">AI Matching Enabled</h2>
              <p className="text-indigo-700 text-sm mb-4">
                Our AI analyzes mentee backgrounds, skills, and learning goals to suggest the best mentor matches 
                based on expertise, availability, and teaching style compatibility.
              </p>
              <button
                onClick={handleAutoMatch}
                disabled={autoMatching || enrollments.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {autoMatching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Matching...</>
                ) : (
                  'Auto-Match All Pending'
                )}
              </button>
            </div>
            <button
              onClick={() => setShowAISuggestions(false)}
              className="text-indigo-600 hover:text-indigo-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Program Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <label className="block text-slate-900 mb-3">Filter by Program</label>
        <select
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className="w-full md:w-96 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-slate-900 mb-2">No Pending Matches</h3>
          <p className="text-slate-600 text-sm">All mentees in this program have been matched with mentors.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Unmatched Mentees */}
          <div>
            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-slate-900">Pending Matches</h2>
                  <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm">
                    {enrollments.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-200">
                {enrollments.map((enrollment) => {
                  const mentee = enrollment.mentee;
                  const profile = enrollment.mentee?.menteeProfile;
                  const currentLevel = enrollment.currentLevel;
                  const enrollmentSuggestions = suggestions[enrollment.id] || [];
                  const topSuggestion = enrollmentSuggestions[0];
                  const levelMentorsList = currentLevel ? (mentors[currentLevel.id] || []) : [];

                  return (
                    <div key={enrollment.id} className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-slate-600">
                            {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-slate-900 mb-1">
                            {mentee?.firstName} {mentee?.lastName}
                          </h3>
                          <p className="text-slate-600 text-sm mb-2">
                            {profile?.priorExperience || profile?.currentEducation || 'No background available'}
                          </p>
                          <div className="flex items-center gap-2 text-slate-500 text-xs mb-3">
                            <span>Level: {currentLevel?.name || 'N/A'}</span>
                          </div>
                          {((profile?.learningGoals && profile.learningGoals.length > 0) || (profile?.interests && profile.interests.length > 0)) && (
                            <div className="flex flex-wrap gap-2">
                              {profile?.learningGoals?.map((goal: string, idx: number) => (
                                <span key={`goal-${idx}`} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                                  {goal}
                                </span>
                              ))}
                              {profile?.interests?.map((interest: string, idx: number) => (
                                <span key={`interest-${idx}`} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                  {interest}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* AI Suggested Mentor */}
                      {topSuggestion ? (
                        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <span className="text-indigo-900 text-sm">
                              AI Recommended Match for {topSuggestion.level?.name || currentLevel?.name || 'Current Level'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-200 rounded-full flex items-center justify-center">
                                <span className="text-indigo-700 text-sm">
                                  {topSuggestion.mentor?.firstName?.[0]}{topSuggestion.mentor?.lastName?.[0]}
                                </span>
                              </div>
                              <div>
                                <div className="text-slate-900 text-sm">
                                  {topSuggestion.mentor?.firstName} {topSuggestion.mentor?.lastName}
                                </div>
                                <div className="text-slate-600 text-xs">
                                  {Math.round(topSuggestion.matchScore)}% match
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleCreateMatch(enrollment.id, topSuggestion.mentor.id, currentLevel.id)}
                              disabled={matching === enrollment.id}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {matching === enrollment.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Assigning...
                                </>
                              ) : (
                                'Assign'
                              )}
                            </button>
                          </div>
                          <p className="text-slate-600 text-xs mt-2">
                            {topSuggestion.reason}
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                          <p className="text-slate-600 text-sm">No mentor suggestions available</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Available Mentors */}
          <div>
            <div className="bg-white rounded-2xl border border-slate-200">
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
                    className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-56"
                  />
                </div>
              </div>
              <div className="divide-y divide-slate-200">
                {mentorsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
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
                    const capacity = mentor.mentorProfile?.currentMenteeCount ?? 0;
                    const maxCapacity = mentor.mentorProfile?.maxMentees || 6;
                    const capacityPercent = maxCapacity > 0 ? (capacity / maxCapacity) * 100 : 0;

                    return (
                      <div key={mentor.id} className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-purple-700">
                              {mentor.firstName?.[0]}{mentor.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-slate-900">
                                {mentor.firstName} {mentor.lastName}
                              </h3>
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
                            {mentor.mentorProfile?.specialization && mentor.mentorProfile.specialization.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {mentor.mentorProfile.specialization.map((skill: string, idx: number) => (
                                  <span key={idx} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                    {skill}
                                  </span>
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

                        {/* Capacity Bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                            <span>Capacity</span>
                            <span>{Math.round(capacityPercent)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                capacityPercent < 70
                                  ? 'bg-green-500'
                                  : capacityPercent < 90
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
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
              {/* Mentor Pagination */}
              {mentorTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Page {mentorPage} of {mentorTotalPages}
                  </p>
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
