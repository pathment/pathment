'use client';

import Link from 'next/link';
import {
  ArrowLeft, Mail, GraduationCap, Briefcase, Star,
  CheckCircle2, TrendingUp, Award, Trophy, Flame,
  AlertCircle, Loader2, UserCheck, BookOpen, Users2,
  Target, ListChecks, Clock,
} from 'lucide-react';
import { useMenteeProfile } from '@/lib/hooks/admin';
import { StatsCard, PageHeader } from '@/components/admin/ui';
import { MenteePauseButton } from '@/components/mentor/MenteePauseButton';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROFICIENCY_CLS: Record<string, string> = {
  beginner:     'bg-slate-100 text-slate-600',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced:     'bg-brand-100 text-brand-700',
  expert:       'bg-purple-100 text-purple-700',
};

const TASK_STATUS_CLS: Record<string, string> = {
  completed:       'bg-green-100 text-green-700',
  submitted:       'bg-blue-100 text-blue-700',
  in_progress:     'bg-amber-100 text-amber-700',
  revision_needed: 'bg-red-100 text-red-700',
  assigned:        'bg-slate-100 text-slate-600',
  not_started:     'bg-slate-100 text-slate-500',
  cancelled:       'bg-slate-100 text-slate-400',
};

/** "program_completed" → "Program Completed" */
const formatStatus = (s: string | null | undefined): string => {
  if (!s) return '-';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** "Today" / "Yesterday" / "5d ago" / "3 mo ago" / "Never". */
function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Never';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const initialsOf = (a?: string, b?: string) => `${a?.[0] ?? ''}${b?.[0] ?? ''}`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMenteeProfilePage() {
  const {
    mentee, assignedMentor, coMentors, currentClan,
    enrollments, recentTasks, stats, isLoading, error,
  } = useMenteeProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !mentee) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Mentee not found</h2>
        <p className="text-slate-500 text-sm mb-6">{error ?? 'This mentee profile does not exist.'}</p>
        <Link href="/admin/users/mentees" className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Mentees
        </Link>
      </div>
    );
  }

  const mp = mentee.menteeProfile;
  const initials = initialsOf(mentee.firstName, mentee.lastName);
  const overallProgress = stats?.overallProgress ?? 0;
  const points = stats?.points ?? mp?.totalPoints ?? 0;
  const tasksCompleted = stats?.tasksCompleted ?? mp?.totalTasksCompleted ?? 0;
  const lastActive = stats?.lastActive ?? mp?.lastActivityDate ?? mentee.lastLoginAt ?? null;

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={`${mentee.firstName} ${mentee.lastName}`}
        subtitle={mentee.email}
        backHref="/admin/users/mentees"
        backLabel="Back to Mentees"
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Identity card */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-20 h-20 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-2xl font-bold mb-4">
                {initials}
              </div>
              <p className="text-xl font-bold text-slate-900">{mentee.firstName} {mentee.lastName}</p>
              {(mp?.currentOccupation || mp?.currentEducation) && (
                <p className="text-slate-600 text-sm mt-1">{mp?.currentOccupation ?? mp?.currentEducation}</p>
              )}
              {currentClan && (
                <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                  <Users2 className="w-3.5 h-3.5" />
                  {currentClan.name}
                </span>
              )}
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <a href={`mailto:${mentee.email}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-brand-600 transition-colors">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                {mentee.email}
              </a>
              {mp?.currentEducation && (
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />
                  {mp.currentEducation}
                </div>
              )}
              {mp?.currentOccupation && (
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                  {mp.currentOccupation}
                </div>
              )}
            </div>

            {/* Pause / resume this mentee (kept in clan, out of reports). */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <MenteePauseButton menteeId={mentee.id} className="w-full justify-center" />
            </div>
          </div>

          {/* Assigned mentor */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-400" />
              Assigned Mentor
            </h3>
            {assignedMentor ? (
              <Link
                href={`/admin/mentors/${assignedMentor.id}`}
                className="flex items-center gap-3 group"
              >
                <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-semibold shrink-0">
                  {initialsOf(assignedMentor.firstName, assignedMentor.lastName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-brand-600 truncate">
                    {assignedMentor.firstName} {assignedMentor.lastName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{assignedMentor.email}</p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-slate-400">No mentor assigned</p>
            )}

            {coMentors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Co-mentors</p>
                <div className="space-y-2">
                  {coMentors.map((cm) => (
                    <Link
                      key={cm.id}
                      href={`/admin/mentors/${cm.id}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600"
                    >
                      <div className="w-7 h-7 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {initialsOf(cm.firstName, cm.lastName)}
                      </div>
                      <span className="truncate">{cm.firstName} {cm.lastName}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5 space-y-3">
            {(mp?.currentStreakDays ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 flex items-center gap-2"><Flame className="w-4 h-4" />Current Streak</span>
                <span className="text-sm font-medium text-orange-600">{mp?.currentStreakDays}d</span>
              </div>
            )}
            {(mp?.totalBadgesEarned ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 flex items-center gap-2"><Award className="w-4 h-4" />Badges Earned</span>
                <span className="text-sm font-medium text-slate-900">{mp?.totalBadgesEarned}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4" />Last Active</span>
              <span className="text-sm font-medium text-slate-900">{relativeTime(lastActive)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 flex items-center gap-2"><Award className="w-4 h-4" />Member Since</span>
              <span className="text-sm font-medium text-slate-900">
                {new Date(mentee.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatsCard icon={TrendingUp}   label="Progress"        value={`${overallProgress}%`}                           colorClass="text-brand-600 bg-brand-50" />
            <StatsCard icon={CheckCircle2} label="Tasks Completed"  value={`${tasksCompleted}/${stats?.tasksTotal ?? tasksCompleted}`} colorClass="text-green-600 bg-green-50" />
            <StatsCard icon={Trophy}       label="Points"           value={points.toLocaleString()}                        colorClass="text-amber-600 bg-amber-50" />
            <StatsCard icon={Users2}       label="Clan"             value={stats?.currentClanName ?? currentClan?.name ?? '-'} colorClass="text-purple-600 bg-purple-50" />
          </div>

          {/* Learning goals / interests */}
          {((mp?.learningGoals?.length ?? 0) > 0 || (mp?.interests?.length ?? 0) > 0) && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
              {(mp?.learningGoals?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-slate-400" />
                    Learning Goals
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {mp!.learningGoals!.map((g) => (
                      <span key={g} className="px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-sm font-medium">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {(mp?.interests?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-slate-400" />
                    Interests
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {mp!.interests!.map((i) => (
                      <span key={i} className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-full text-sm font-medium">{i}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          {mentee.skills && mentee.skills.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" />
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {mentee.skills.map((skill) => {
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

          {/* Enrollments */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" />
                Enrollments
              </h3>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                {enrollments.length}
              </span>
            </div>

            {enrollments.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-400">Not enrolled in any program yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {enrollments.map((enr) => {
                  const pct = Math.round(parseFloat(String(enr.overallProgressPercentage ?? 0)));
                  return (
                    <div key={enr.id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {enr.program?.name ?? 'Program'}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                              {formatStatus(enr.status)}
                            </span>
                            {enr.clan && (
                              <span className="inline-flex items-center gap-1">
                                <Users2 className="w-3 h-3" />{enr.clan.name}
                              </span>
                            )}
                            {enr.mentor && (
                              <span className="inline-flex items-center gap-1">
                                <UserCheck className="w-3 h-3" />
                                {enr.mentor.firstName} {enr.mentor.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-semibold text-slate-900">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent tasks */}
          {recentTasks.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-slate-400" />
                  Recent Tasks
                </h3>
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                  {recentTasks.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-4 px-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                      {task.completedAt && (
                        <p className="text-xs text-slate-400 mt-0.5">Completed {relativeTime(task.completedAt)}</p>
                      )}
                    </div>
                    {task.points > 0 && (
                      <span className="text-xs text-amber-600 font-medium shrink-0">+{task.points} pts</span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 ${TASK_STATUS_CLS[task.status] ?? TASK_STATUS_CLS.assigned}`}>
                      {formatStatus(task.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
