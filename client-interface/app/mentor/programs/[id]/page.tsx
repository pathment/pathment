'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Users,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
  Loader2,
  Target,
} from 'lucide-react';
import { useMentorProgramDetail } from '@/lib/hooks/mentor';

export default function MentorProgramDetail() {
  const params = useParams();
  const id = params?.id as string;

  const {
    program,
    levels,
    roadmap,
    myMentees,
    loading,
    loadingRoadmap,
    activeTab,
    selectedLevelId,
    expandedWeeks,
    setActiveTab,
    setSelectedLevelId,
    toggleWeek,
  } = useMentorProgramDetail(id);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'mentees', label: `My Mentees (${myMentees.length})` },
  ] as const;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Program not found.</p>
        <Link href="/mentor/programs" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">
          Back to Programs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/mentor/programs"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Programs
      </Link>

      {/* Hero Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-slate-900">{program.name}</h1>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs capitalize">
                  {program.status}
                </span>
              </div>
            </div>
            <p className="text-slate-600 mt-3">{program.description || 'No description available'}</p>
            {program.tags && program.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {program.tags.map((tag: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="flex sm:flex-col gap-4 sm:gap-3 sm:text-right">
            <div className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-500 mb-0.5">Duration</div>
              <div className="text-slate-900 font-semibold text-sm">
                {program.totalDurationWeeks || '—'} weeks
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-500 mb-0.5">My Mentees</div>
              <div className="text-slate-900 font-semibold text-sm">{myMentees.length}</div>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-500 mb-0.5">Levels</div>
              <div className="text-slate-900 font-semibold text-sm">{levels.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Levels */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4">Program Levels</h2>
            {levels.length === 0 ? (
              <p className="text-slate-500 text-sm">No levels defined yet.</p>
            ) : (
              <div className="space-y-3">
                {levels.map((level, idx) => (
                  <div key={level.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-indigo-600 text-sm font-semibold">{idx + 1}</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-slate-900 font-medium">{level.name}</div>
                      {level.description && (
                        <p className="text-slate-500 text-sm mt-0.5 line-clamp-1">{level.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                      <Clock className="w-3.5 h-3.5" />
                      {level.durationWeeks} weeks
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Learning Outcomes of first level */}
          {levels[0]?.learningOutcomes?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-indigo-600" />
                <h2 className="text-slate-900">Learning Outcomes</h2>
              </div>
              <ul className="space-y-2">
                {levels[0].learningOutcomes.map((outcome: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── ROADMAP TAB ── */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          {/* Level selector */}
          {levels.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <span className="text-slate-600 text-sm font-medium">Level:</span>
              <div className="flex gap-2 flex-wrap">
                {levels.map((level) => (
                  <button
                    key={level.id}
                    onClick={() => setSelectedLevelId(level.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedLevelId === level.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {level.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingRoadmap ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : !roadmap ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No roadmap available for this level yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(roadmap.weeks || []).map((week: any, wIdx: number) => {
                const isOpen = expandedWeeks.has(week.id);
                return (
                  <div key={week.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {/* Week Header */}
                    <button
                      onClick={() => toggleWeek(week.id)}
                      className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-600 text-sm font-semibold">{wIdx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-slate-900 font-medium">{week.title}</div>
                        {week.milestone && (
                          <div className="text-slate-500 text-xs mt-0.5">🎯 {week.milestone}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-slate-400 text-sm">
                        <span>{week.tasks?.length || 0} tasks</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* Week Tasks */}
                    {isOpen && (
                      <div className="border-t border-slate-100 divide-y divide-slate-100">
                        {week.objectives && week.objectives.length > 0 && (
                          <div className="px-5 py-3 bg-indigo-50/50">
                            <p className="text-xs font-medium text-indigo-700 mb-1.5">Objectives</p>
                            <ul className="space-y-1">
                              {week.objectives.map((obj: string, i: number) => (
                                <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                                  <Circle className="w-3 h-3 text-indigo-400 mt-0.5 flex-shrink-0" />
                                  {obj}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(week.tasks || []).length === 0 ? (
                          <div className="px-5 py-4 text-sm text-slate-400">No tasks in this week.</div>
                        ) : (
                          (week.tasks || []).map((task: any, tIdx: number) => (
                            <div key={task.id} className="px-5 py-4 flex items-start gap-3">
                              <span className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-500 flex-shrink-0 mt-0.5">
                                {tIdx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-slate-900 text-sm font-medium">{task.title}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${
                                    task.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                                    task.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                    task.difficulty === 'hard' ? 'bg-orange-100 text-orange-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {task.difficulty}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs capitalize">
                                    {task.type}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-slate-500 text-xs line-clamp-2">{task.description}</p>
                                )}
                                {task.estimatedHours && (
                                  <div className="flex items-center gap-1 mt-1 text-slate-400 text-xs">
                                    <Clock className="w-3 h-3" />
                                    {task.estimatedHours}h estimated
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY MENTEES TAB ── */}
      {activeTab === 'mentees' && (
        <div className="space-y-4">
          {myMentees.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">You have no mentees in this program.</p>
            </div>
          ) : (
            myMentees.map((match: any) => {
              const mentee = match.mentee;
              const enrollment = match.enrollment;
              const progress = parseFloat(enrollment?.overallProgressPercentage || 0);
              const progressColor =
                progress >= 75 ? 'bg-green-500' :
                progress >= 50 ? 'bg-blue-500' :
                progress >= 25 ? 'bg-yellow-500' : 'bg-slate-300';

              return (
                <Link
                  key={match.id}
                  href={`/mentor/mentees/${mentee?.id}`}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-700 font-semibold text-lg">
                      {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-900 font-medium">
                        {mentee?.firstName} {mentee?.lastName}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-xs capitalize ${
                        match.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {match.status}
                      </span>
                    </div>
                    <p className="text-slate-500 text-sm truncate">{mentee?.email}</p>

                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${progressColor} rounded-full transition-all`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Level badge */}
                  {enrollment?.level?.name && (
                    <div className="hidden sm:block text-right flex-shrink-0">
                      <div className="text-xs text-slate-400 mb-0.5">Level</div>
                      <div className="text-sm text-slate-700 font-medium">{enrollment.level.name}</div>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
