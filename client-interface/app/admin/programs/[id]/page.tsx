'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Users,
  UserCheck,
  UserPlus,
  Clock,
  CheckCircle2,
  Circle,
  Sparkles,
  Share2,
  Loader2,
  RotateCw,
  BookOpen,
  Trash2,
  Edit2,
  GripVertical
} from 'lucide-react';
import { programManagementApi } from '@/lib/services/program-api';
import { levelMentorApi } from '@/lib/services/level-mentor-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';

export default function ProgramDetails() {
  const params = useParams();
  const id = params?.id as string;
  const [activeTab, setActiveTab] = useState<'overview' | 'levels' | 'mentors' | 'enrollments'>('overview');
  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<any[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [assignedMentors, setAssignedMentors] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProgram();
      fetchLevels();
      fetchMentorAssignments();
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'levels' && selectedLevelId) {
      fetchRoadmap();
    } else if (activeTab === 'enrollments') {
      fetchEnrollments();
    }
  }, [activeTab, selectedLevelId]);

  const fetchProgram = async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getById(id);
      const programData = response?.data?.program || response?.program || response;
      setProgram(programData);
    } catch (error: any) {
      console.error('Failed to fetch program:', error);
      toast.error(error.response?.data?.message || 'Failed to load program');
    } finally {
      setLoading(false);
    }
  };

  const fetchLevels = async () => {
    try {
      const response = await programManagementApi.levels.getByProgram(id);
      const levelsList = response?.data?.levels || response?.levels || response || [];
      const levelsArray = Array.isArray(levelsList) ? levelsList : [];
      setLevels(levelsArray);
      
      if (levelsArray.length > 0 && !selectedLevelId) {
        setSelectedLevelId(levelsArray[0].id);
      }
    } catch (error: any) {
      console.error('Failed to fetch levels:', error);
    }
  };

  const fetchMentorAssignments = async () => {
    try {
      const response = await levelMentorApi.getProgramMentorAssignments(id);
      const assignments = response?.data?.assignments || response?.assignments || [];
      
      // Flatten mentors from all levels
      const mentorsFlat = assignments.flatMap((assignment: any) => 
        assignment.mentors.map((mentor: any) => ({
          id: mentor.id,
          name: `${mentor.firstName} ${mentor.lastName}`,
          mentees: mentor.mentorProfile?.currentMenteeCount || 0,
          expertise: mentor.mentorProfile?.specialization?.[0] || 'General',
          title: mentor.mentorProfile?.title || 'Mentor'
        }))
      );
      
      setAssignedMentors(mentorsFlat);
    } catch (error: any) {
      console.error('Failed to fetch mentor assignments:', error);
      // Don't show error toast as this is not critical
    }
  };

  const fetchEnrollments = async () => {
    try {
      setLoadingEnrollments(true);
      const response = await enrollmentApi.getAll({ programId: id });
      const enrollmentList = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(enrollmentList);
    } catch (error: any) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load enrollments');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const handleApproveEnrollment = async (enrollmentId: string) => {
    try {
      await enrollmentApi.approve(enrollmentId);
      toast.success('Enrollment approved successfully');
      fetchEnrollments(); // Refresh list
    } catch (error: any) {
      console.error('Failed to approve enrollment:', error);
      toast.error(error.response?.data?.message || 'Failed to approve enrollment');
    }
  };

  const handleRejectEnrollment = async (enrollmentId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await enrollmentApi.reject(enrollmentId, reason || undefined);
      toast.success('Enrollment rejected');
      fetchEnrollments(); // Refresh list
    } catch (error: any) {
      console.error('Failed to reject enrollment:', error);
      toast.error(error.response?.data?.message || 'Failed to reject enrollment');
    }
  };

  const fetchRoadmap = async () => {
    if (!selectedLevelId) return;
    
    try {
      setLoadingRoadmap(true);
      const response = await programManagementApi.roadmaps.getByLevel(id, selectedLevelId);
      const roadmapData = response?.data?.roadmap || response?.roadmap || response;
      setRoadmap(roadmapData);
    } catch (error: any) {
      if (error.response?.status === 404) {
        setRoadmap(null);
      } else {
        console.error('Failed to fetch roadmap:', error);
      }
    } finally {
      setLoadingRoadmap(false);
    }
  };

  const handleGenerateRoadmap = async () => {
    if (!selectedLevelId) {
      toast.error('Please select a level first');
      return;
    }

    const confirmGenerate = confirm(
      roadmap 
        ? 'This will replace the existing roadmap. Continue?' 
        : 'Generate AI roadmap for this level?'
    );
    
    if (!confirmGenerate) return;

    try {
      setGeneratingRoadmap(true);
      const response = await programManagementApi.roadmaps.generate(
        id,
        selectedLevelId,
        'Generate a comprehensive roadmap with practical tasks and learning objectives'
      );
      
      const newRoadmap = response?.data?.roadmap || response?.roadmap || response;
      setRoadmap(newRoadmap);
      toast.success('Roadmap generated successfully!');
    } catch (error: any) {
      console.error('Failed to generate roadmap:', error);
      toast.error(error.response?.data?.message || 'Failed to generate roadmap');
    } finally {
      setGeneratingRoadmap(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-600 mb-4">Program not found</p>
        <Link
          href="/admin/programs/list"
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Programs
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/programs/list"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Programs
        </Link>
        
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-slate-900">{program.name}</h1>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">
                {program.status}
              </span>
            </div>
            <p className="text-slate-600 mb-4">{program.description || 'No description available'}</p>
            {program.tags && program.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {program.tags.map((tag: string, idx: number) => (
                  <span key={idx} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Link
              href={`/admin/programs/${id}/roadmap`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit Roadmap
            </Link>
            <button className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-slate-600 text-sm">Enrollments</span>
          </div>
          <div className="text-slate-900 text-2xl">{program._count?.enrollments || program.enrollments || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-slate-600 text-sm">Mentors</span>
          </div>
          <div className="text-slate-900 text-2xl">{program._count?.mentors || program.mentors || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-slate-600 text-sm">Completion</span>
          </div>
          <div className="text-slate-900 text-2xl">{program.completion || 0}%</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-slate-600 text-sm">Duration</span>
          </div>
          <div className="text-slate-900 text-2xl">{program.duration || 'N/A'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-slate-200">
          <div className="flex gap-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'levels', label: 'Levels & Roadmaps' },
              { id: 'mentors', label: 'Mentors' },
              { id: 'enrollments', label: 'Enrollments' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'overview' | 'levels' | 'mentors' | 'enrollments')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h2 className="text-slate-900 mb-4">Program Information</h2>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Type</div>
                    <div className="text-slate-900">{program.type}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Level</div>
                    <div className="text-slate-900">{program.level}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Start Date</div>
                    <div className="text-slate-900">{program.startDate ? new Date(program.startDate).toLocaleDateString() : new Date(program.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">End Date</div>
                    <div className="text-slate-900">{program.endDate ? new Date(program.endDate).toLocaleDateString() : 'Ongoing'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-slate-900">Program Levels</h2>
                <div className="flex items-center gap-2">
                  {levels.length > 0 && (
                    <>
                      <Link
                        href={`/admin/programs/create?programId=${id}&step=2`}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                      >
                        + Add Level
                      </Link>
                      <Link
                        href={`/admin/programs/${id}/roadmap`}
                        className="text-indigo-600 hover:text-indigo-700 text-sm"
                      >
                        Manage Roadmaps →
                      </Link>
                    </>
                  )}
                </div>
              </div>
              {levels.length > 0 ? (
                <div className="space-y-3">
                  {levels.map((level: any) => (
                    <div key={level.id} className="p-4 border border-slate-200 rounded-xl">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-slate-900 mb-1">{level.name}</div>
                          <div className="text-sm text-slate-600">
                            {level.durationWeeks} weeks
                          </div>
                        </div>
                        <Link
                          href={`/admin/programs/${id}/roadmap?level=${level.id}`}
                          className="text-indigo-600 hover:text-indigo-700 text-sm"
                        >
                          View Roadmap →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-2">No Levels Yet</h3>
                  <p className="text-slate-600 text-sm mb-6 max-w-sm mx-auto">
                    Create program levels to organize learning paths and generate AI roadmaps for each level.
                  </p>
                  <Link
                    href={`/admin/programs/create?programId=${id}&step=2`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Create Levels
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-4">Assigned Mentors</h3>
              <div className="space-y-3">
                {assignedMentors.map((mentor) => (
                  <div key={mentor.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-slate-600 text-sm">
                        {mentor.name.split(' ').map((n: string) => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-900 text-sm">{mentor.name}</div>
                      <div className="text-slate-600 text-xs">{mentor.mentees} mentees</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href={`/admin/programs/${id}/mentors`}
                className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm block text-center"
              >
                Manage Mentors
              </Link>
            </div>

            <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-indigo-900 mb-2">AI Roadmap</h3>
              <p className="text-indigo-700 text-sm mb-4">
                This program uses AI-generated learning paths tailored to each mentee&apos;s progress.
              </p>
              <Link
                href={`/admin/programs/${id}/roadmap`}
                className="text-indigo-600 hover:text-indigo-700 text-sm"
              >
                Edit Roadmap →
              </Link>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'levels' && (
        <div className="space-y-6">
          {/* Level Selector */}
          {levels.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-slate-900 font-semibold mb-4">Select Level</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {levels.map((level: any) => (
                  <button
                    key={level.id}
                    onClick={() => setSelectedLevelId(level.id)}
                    className={`p-4 border-2 rounded-xl transition-all text-left ${
                      selectedLevelId === level.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900">{level.name}</div>
                    <div className="text-sm text-slate-600 mt-1">
                      {level.durationWeeks} weeks
                    </div>
                    {level.description && (
                      <div className="text-xs text-slate-500 mt-2 line-clamp-2">
                        {level.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Roadmap Content */}
          {loadingRoadmap ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : !roadmap ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Sparkles className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">No Roadmap Yet</h2>
              <p className="text-slate-600 mb-6">
                Generate an AI-powered learning roadmap for this level to get started.
              </p>
              <button
                onClick={handleGenerateRoadmap}
                disabled={generatingRoadmap}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors flex items-center gap-2 mx-auto"
              >
                {generatingRoadmap ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate AI Roadmap
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* AI Info Banner */}
              <div className="bg-linear-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-indigo-900 mb-2">
                        AI-Generated Learning Path
                      </h2>
                      <p className="text-indigo-700 text-sm">
                        This roadmap was generated using AI based on the program objectives and skill requirements.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateRoadmap}
                    disabled={generatingRoadmap}
                    className="px-4 py-2 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-700 rounded-lg text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    {generatingRoadmap ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Regenerate
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Roadmap Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="text-2xl font-bold text-slate-900 mb-1">
                    {roadmap.weeks?.length || 0}
                  </div>
                  <div className="text-slate-600 text-sm">Total Weeks</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="text-2xl font-bold text-slate-900 mb-1">
                    {roadmap.weeks?.reduce((sum: number, week: any) => sum + (week.tasks?.length || 0), 0) || 0}
                  </div>
                  <div className="text-slate-600 text-sm">Total Tasks</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="text-2xl font-bold text-slate-900 mb-1">
                    {roadmap.weeks?.reduce(
                      (sum: number, week: any) => sum + week.tasks?.reduce((s: number, t: any) => s + (t.estimatedHours || 0), 0),
                      0
                    ) || 0}h
                  </div>
                  <div className="text-slate-600 text-sm">Estimated Hours</div>
                </div>
              </div>

              {/* Weekly Roadmap */}
              <div className="space-y-6">
                {roadmap.weeks?.map((week: any) => (
                  <div key={week.id} className="bg-white rounded-2xl border border-slate-200">
                    {/* Week Header */}
                    <div className="p-6 border-b border-slate-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-slate-900 mb-3">
                            Week {week.weekNumber}: {week.title}
                          </h2>
                          
                          {/* Objectives */}
                          {week.objectives && week.objectives.length > 0 && (
                            <div className="mb-4">
                              <div className="text-sm font-medium text-slate-700 mb-2">
                                Learning Objectives
                              </div>
                              <div className="space-y-2">
                                {week.objectives.map((objective: string, idx: number) => (
                                  <div key={idx} className="flex items-start gap-2 text-slate-600 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                    {objective}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Milestone */}
                          {week.milestone && (
                            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                              <div className="text-sm font-medium text-indigo-900 mb-1">
                                Week Milestone
                              </div>
                              <div className="text-sm text-indigo-700">{week.milestone}</div>
                            </div>
                          )}
                        </div>
                        <Link
                          href={`/admin/programs/${id}/roadmap`}
                          className="ml-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </Link>
                      </div>
                    </div>

                    {/* Tasks */}
                    <div className="p-6 space-y-4">
                      {week.tasks && week.tasks.length > 0 ? (
                        week.tasks.map((task: any) => (
                          <div
                            key={task.id}
                            className="p-5 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors"
                          >
                            <div className="flex items-start gap-4">
                              <BookOpen className="w-5 h-5 text-indigo-600 mt-1" />
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-semibold text-slate-900">{task.title}</h3>
                                  <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                                    {task.type}
                                  </span>
                                  {task.difficulty && (
                                    <span
                                      className={`px-2 py-1 rounded text-xs ${
                                        task.difficulty === 'easy'
                                          ? 'bg-green-100 text-green-700'
                                          : task.difficulty === 'medium'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {task.difficulty}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-600 text-sm mb-3">{task.description}</p>
                                
                                {/* Deliverable & Time */}
                                {(task.deliverable || task.estimatedHours) && (
                                  <div className="flex items-center gap-4 text-sm">
                                    {task.deliverable && (
                                      <div className="text-slate-600">
                                        <span className="font-medium">Deliverable:</span> {task.deliverable}
                                      </div>
                                    )}
                                    {task.estimatedHours && (
                                      <div className="flex items-center gap-1 text-slate-600">
                                        <Clock className="w-4 h-4" />
                                        {task.estimatedHours}h
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-slate-500 py-8">
                          No tasks in this week yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'mentors' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="max-w-lg mx-auto">
            <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
              Assign Mentors to Levels
            </h2>
            <p className="text-slate-600 mb-8">
              Before you can match mentees to mentors, you need to assign mentors to specific program levels. 
              This allows the system to suggest the best mentor matches based on level expertise.
            </p>
            <Link
              href={`/admin/programs/${id}/mentors`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
            >
              <UserPlus className="w-5 h-5" />
              Manage Level Mentors
            </Link>
            <div className="mt-8 pt-8 border-t border-slate-200">
              <p className="text-slate-500 text-sm">
                After assigning mentors to levels, you can match them with mentees from the{' '}
                <Link href="/admin/matching/mentor-assignment" className="text-indigo-600 hover:underline">
                  Mentor Assignment
                </Link>{' '}
                page.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'enrollments' && (
        <div className="space-y-6">
          {loadingEnrollments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-900 mb-2">No Enrollments Yet</h3>
              <p className="text-slate-600">
                Mentees haven't enrolled in this program yet.
              </p>
            </div>
          ) : (
            <>
              {/* Pending Approvals */}
              {enrollments.filter((e: any) => e.status === 'pending_approval').length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <h3 className="text-slate-900">Pending Approvals ({enrollments.filter((e: any) => e.status === 'pending_approval').length})</h3>
                  </div>
                  <div className="space-y-3">
                    {enrollments
                      .filter((e: any) => e.status === 'pending_approval')
                      .map((enrollment: any) => (
                        <div key={enrollment.id} className="p-4 border border-amber-200 bg-amber-50 rounded-xl">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="text-slate-900 mb-1">
                                {enrollment.mentee?.firstName} {enrollment.mentee?.lastName}
                              </div>
                              <div className="text-slate-600 text-sm">{enrollment.mentee?.email}</div>
                              <div className="text-slate-500 text-xs mt-1">
                                Requested {new Date(enrollment.enrolledAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApproveEnrollment(enrollment.id)}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectEnrollment(enrollment.id)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* All Enrollments */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-slate-900 mb-4">All Enrollments ({enrollments.length})</h3>
                <div className="space-y-2">
                  {enrollments.map((enrollment: any) => (
                    <div key={enrollment.id} className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="text-slate-900">
                              {enrollment.mentee?.firstName} {enrollment.mentee?.lastName}
                            </div>
                            <span className={`px-2 py-1 rounded text-xs ${
                              enrollment.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' :
                              enrollment.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                              enrollment.status === 'pending_match' ? 'bg-purple-100 text-purple-700' :
                              enrollment.status === 'matched' ? 'bg-green-100 text-green-700' :
                              enrollment.status === 'active' ? 'bg-indigo-100 text-indigo-700' :
                              enrollment.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {enrollment.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-slate-600 text-sm mt-1">{enrollment.mentee?.email}</div>
                        </div>
                        {enrollment.status === 'approved' && (
                          <Link
                            href={`/admin/matching/mentor-assignment?enrollmentId=${enrollment.id}`}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                          >
                            Match Mentor
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
