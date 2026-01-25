'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Star,
  Target,
  Award,
  Loader2,
  Plus
} from 'lucide-react';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

export default function MenteeDashboard() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchEnrollments();
    }
  }, [user]);

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({ menteeId: user?.id });
      const enrollmentList = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(enrollmentList);
    } catch (error: any) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load your enrollments');
    } finally {
      setLoading(false);
    }
  };

  const activeEnrollment = enrollments.find(e => e.status === 'active');
  const pendingEnrollments = enrollments.filter(e => e.status === 'pending_approval');
  const approvedEnrollments = enrollments.filter(e => e.status === 'approved' || e.status === 'pending_match');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!</h1>
        <p className="text-slate-600">Keep up the great work on your learning journey</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* Quick Actions if no enrollments */}
          {enrollments.length === 0 && (
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-indigo-900 mb-3">Start Your Learning Journey</h2>
              <p className="text-indigo-700 mb-6">
                Browse available programs and request enrollment to get matched with a mentor
              </p>
              <Link
                href="/mentee/programs"
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
                Browse Programs
              </Link>
            </div>
          )}

          {/* Pending Approvals Alert */}
          {pendingEnrollments.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-amber-900 mb-2">Pending Approval</h3>
                  <p className="text-amber-700 text-sm mb-3">
                    {pendingEnrollments.length} enrollment request(s) awaiting admin approval
                  </p>
                  <div className="space-y-2">
                    {pendingEnrollments.map((enrollment) => (
                      <div key={enrollment.id} className="text-amber-900 text-sm">
                        • {enrollment.program?.name || 'Unknown Program'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Approved but not matched Alert */}
          {approvedEnrollments.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-blue-900 mb-2">Approved - Awaiting Mentor Match</h3>
                  <p className="text-blue-700 text-sm mb-3">
                    Your enrollment has been approved! Admin is matching you with a mentor.
                  </p>
                  <div className="space-y-2">
                    {approvedEnrollments.map((enrollment) => (
                      <div key={enrollment.id} className="text-blue-900 text-sm">
                        • {enrollment.program?.name || 'Unknown Program'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Program */}
          {activeEnrollment ? (
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h2 className="text-slate-900 mb-4">Current Program</h2>
                  <div className="mb-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-slate-900 mb-1">{activeEnrollment.program?.name || 'Unknown Program'}</h3>
                        <p className="text-slate-600 text-sm">
                          Week {activeEnrollment.currentWeek || 1} 
                        </p>
                      </div>
                      <Link
                        href="/mentee/tasks"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors"
                      >
                        View Tasks
                      </Link>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-slate-600">Overall Progress</span>
                        <span className="text-slate-900">{activeEnrollment.overallProgressPercentage || 0}%</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-indigo-600 to-purple-600 rounded-full"
                          style={{ width: `${activeEnrollment.overallProgressPercentage || 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-slate-600">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        {activeEnrollment.tasksCompleted || 0} tasks completed
                      </span>
                      <span className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-600" />
                        {(activeEnrollment.tasksTotal || 0) - (activeEnrollment.tasksCompleted || 0)} remaining
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
                  <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-indigo-900 mb-2">Keep Learning!</h3>
                  <p className="text-indigo-700 text-sm mb-4">
                    You&apos;re making great progress. Stay consistent!
                  </p>
                </div>
              </div>
            </div>
          ) : enrollments.length > 0 ? null : null}

          {/* All Enrollments */}
          {enrollments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-slate-900">My Enrollments</h2>
                <Link
                  href="/mentee/programs"
                  className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Browse More Programs
                </Link>
              </div>
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="p-4 border border-slate-200 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-slate-900">{enrollment.program?.name || 'Unknown Program'}</h3>
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
                        <div className="text-slate-600 text-sm">
                          Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 'use client';

// import Link from 'next/link';
// import {
//   BookOpen,
//   CheckCircle2,
//   Clock,
//   AlertCircle,
//   Calendar,
//   Star,
//   Target,
//   Award
// } from 'lucide-react';

// export default function MenteeDashboard() {
//   const currentProgram = {
//     name: 'Full Stack Development Bootcamp',
//     progress: 68,
//     currentWeek: 3,
//     totalWeeks: 12,
//     tasksCompleted: 24,
//     totalTasks: 35,
//     mentor: {
//       name: 'Sarah Johnson',
//       expertise: 'Full Stack Development',
//       rating: 4.9
//     }
//   };

//   const upcomingTasks = [
//     {
//       id: 1,
//       title: 'Build a React component library',
//       program: 'Full Stack Development',
//       dueDate: '2024-02-20',
//       status: 'assigned',
//       priority: 'high'
//     },
//     {
//       id: 2,
//       title: 'Implement user authentication',
//       program: 'Full Stack Development',
//       dueDate: '2024-02-22',
//       status: 'in_progress',
//       priority: 'medium'
//     },
//     {
//       id: 3,
//       title: 'Create REST API endpoints',
//       program: 'Full Stack Development',
//       dueDate: '2024-02-25',
//       status: 'assigned',
//       priority: 'medium'
//     }
//   ];

//   const recentFeedback = [
//     {
//       id: 1,
//       task: 'Build responsive landing page',
//       mentor: 'Sarah Johnson',
//       rating: 5,
//       comment: 'Excellent work! Your attention to detail and responsive design principles are outstanding.',
//       date: '2024-02-15'
//     },
//     {
//       id: 2,
//       task: 'JavaScript array methods exercise',
//       mentor: 'Sarah Johnson',
//       rating: 4,
//       comment: 'Good job! Consider using more modern ES6 methods for cleaner code.',
//       date: '2024-02-12'
//     }
//   ];

//   const stats = [
//     { label: 'Tasks Completed', value: currentProgram.tasksCompleted, icon: CheckCircle2, color: 'green' },
//     { label: 'In Progress', value: '2', icon: Clock, color: 'blue' },
//     { label: 'Pending Review', value: '1', icon: AlertCircle, color: 'yellow' },
//     { label: 'Average Rating', value: '4.5', icon: Star, color: 'purple' }
//   ];

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div>
//         <h1 className="text-slate-900 mb-2">Welcome back!</h1>
//         <p className="text-slate-600">Keep up the great work on your learning journey</p>
//       </div>

//       {/* Stats Grid */}
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
//         {stats.map((stat) => {
//           const Icon = stat.icon;
//           return (
//             <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
//               <div className="flex items-center gap-3 mb-4">
//                 <div className={`w-10 h-10 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
//                   <Icon className={`w-5 h-5 text-${stat.color}-600`} />
//                 </div>
//               </div>
//               <div className="text-slate-600 text-sm mb-1">{stat.label}</div>
//               <div className="text-slate-900 text-2xl">{stat.value}</div>
//             </div>
//           );
//         })}
//       </div>

//       <div className="grid lg:grid-cols-3 gap-8">
//         {/* Main Content */}
//         <div className="lg:col-span-2 space-y-6">
//           {/* Current Program */}
//           <div className="bg-white rounded-2xl border border-slate-200 p-6">
//             <h2 className="text-slate-900 mb-4">Current Program</h2>
//             <div className="mb-6">
//               <div className="flex items-start justify-between mb-3">
//                 <div>
//                   <h3 className="text-slate-900 mb-1">{currentProgram.name}</h3>
//                   <p className="text-slate-600 text-sm">
//                     Week {currentProgram.currentWeek} of {currentProgram.totalWeeks}
//                   </p>
//                 </div>
//                 <Link
//                   href="/mentee/tasks"
//                   className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors"
//                 >
//                   View Tasks
//                 </Link>
//               </div>
              
//               {/* Progress Bar */}
//               <div className="mb-4">
//                 <div className="flex items-center justify-between text-sm mb-2">
//                   <span className="text-slate-600">Overall Progress</span>
//                   <span className="text-slate-900">{currentProgram.progress}%</span>
//                 </div>
//                 <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
//                   <div
//                     className="h-full bg-linear-to-r from-indigo-600 to-purple-600 rounded-full"
//                     style={{ width: `${currentProgram.progress}%` }}
//                   />
//                 </div>
//               </div>

//               <div className="flex items-center gap-6 text-sm text-slate-600">
//                 <span className="flex items-center gap-2">
//                   <CheckCircle2 className="w-4 h-4 text-green-600" />
//                   {currentProgram.tasksCompleted} tasks completed
//                 </span>
//                 <span className="flex items-center gap-2">
//                   <Target className="w-4 h-4 text-indigo-600" />
//                   {currentProgram.totalTasks - currentProgram.tasksCompleted} remaining
//                 </span>
//               </div>
//             </div>

//             {/* Mentor Info */}
//             <div className="p-4 bg-slate-50 rounded-xl">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
//                   <span className="text-purple-700">
//                     {currentProgram.mentor.name.split(' ').map(n => n[0]).join('')}
//                   </span>
//                 </div>
//                 <div className="flex-1">
//                   <div className="text-slate-900 mb-1">Your Mentor</div>
//                   <div className="text-slate-600 text-sm">{currentProgram.mentor.name}</div>
//                   <div className="flex items-center gap-1 text-sm">
//                     <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
//                     <span className="text-slate-600">{currentProgram.mentor.rating}</span>
//                   </div>
//                 </div>
//                 <button className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-sm transition-colors">
//                   Message
//                 </button>
//               </div>
//             </div>
//           </div>

//           {/* Upcoming Tasks */}
//           <div className="bg-white rounded-2xl border border-slate-200">
//             <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
//               <h2 className="text-slate-900">Upcoming Tasks</h2>
//               <Link href="/mentee/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm">
//                 View all
//               </Link>
//             </div>
//             <div className="divide-y divide-slate-200">
//               {upcomingTasks.map((task) => (
//                 <Link
//                   key={task.id}
//                   href={`/mentee/tasks/${task.id}/submit`}
//                   className="block px-6 py-4 hover:bg-slate-50 transition-colors"
//                 >
//                   <div className="flex items-start justify-between mb-2">
//                     <div className="flex-1">
//                       <div className="flex items-center gap-2 mb-1">
//                         <h3 className="text-slate-900">{task.title}</h3>
//                         {task.priority === 'high' && (
//                           <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
//                             High Priority
//                           </span>
//                         )}
//                       </div>
//                       <div className="flex items-center gap-4 text-sm text-slate-600">
//                         <span className="flex items-center gap-1">
//                           <Calendar className="w-4 h-4" />
//                           Due {task.dueDate}
//                         </span>
//                       </div>
//                     </div>
//                     <span className={`px-3 py-1 rounded-lg text-xs ${
//                       task.status === 'in_progress'
//                         ? 'bg-blue-100 text-blue-700'
//                         : 'bg-slate-100 text-slate-700'
//                     }`}>
//                       {task.status === 'in_progress' ? 'In Progress' : 'Assigned'}
//                     </span>
//                   </div>
//                 </Link>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Sidebar */}
//         <div className="space-y-6">
//           {/* Recent Feedback */}
//           <div className="bg-white rounded-2xl border border-slate-200">
//             <div className="px-6 py-5 border-b border-slate-200">
//               <h3 className="text-slate-900">Recent Feedback</h3>
//             </div>
//             <div className="divide-y divide-slate-200">
//               {recentFeedback.map((feedback) => (
//                 <Link
//                   key={feedback.id}
//                   href={`/mentee/feedback/${feedback.id}`}
//                   className="block px-6 py-4 hover:bg-slate-50 transition-colors"
//                 >
//                   <div className="flex items-center gap-1 mb-2">
//                     {[...Array(5)].map((_, i) => (
//                       <Star
//                         key={i}
//                         className={`w-4 h-4 ${
//                           i < feedback.rating
//                             ? 'text-yellow-500 fill-yellow-500'
//                             : 'text-slate-300'
//                         }`}
//                       />
//                     ))}
//                   </div>
//                   <p className="text-slate-900 text-sm mb-2">{feedback.task}</p>
//                   <p className="text-slate-600 text-sm mb-2 line-clamp-2">{feedback.comment}</p>
//                   <p className="text-slate-500 text-xs">{feedback.date}</p>
//                 </Link>
//               ))}
//             </div>
//             <div className="px-6 py-4 border-t border-slate-200">
//               <Link href="/mentee/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm block text-center">
//                 View All Feedback
//               </Link>
//             </div>
//           </div>

//           {/* Learning Streak */}
//           <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
//             <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
//               <Award className="w-6 h-6 text-white" />
//             </div>
//             <h3 className="text-indigo-900 mb-2">7 Day Streak!</h3>
//             <p className="text-indigo-700 text-sm mb-4">
//               You&apos;ve been consistent with your learning. Keep it up!
//             </p>
//             <div className="flex gap-1">
//               {[...Array(7)].map((_, i) => (
//                 <div key={i} className="flex-1 h-2 bg-indigo-600 rounded-full" />
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }