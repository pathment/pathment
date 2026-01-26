'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, ClipboardList, Clock, CheckCircle2, AlertCircle, Plus, Loader2, FileText, Star, XCircle, Trash2, AlertTriangle } from 'lucide-react';
import { taskApi } from '@/lib/services/task-api';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export default function MentorTasks() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'create'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [mentees, setMentees] = useState<any[]>([]);
  const [cancellingTask, setCancellingTask] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  
  // Form state for custom task
  const [formData, setFormData] = useState({
    menteeId: '',
    enrollmentId: '',
    title: '',
    description: '',
    type: 'custom',
    difficulty: 'medium',
    dueDate: '',
    pointsBase: 10,
    deliverable: '',
    acceptanceCriteria: [] as string[]
  });

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch stats
      const statsRes = await taskApi.getMentorTaskStats(user!.id);
      setStats(statsRes.data.data.stats);
      
      // Fetch pending review tasks
      const pendingRes = await taskApi.getMentorTasks(user!.id, { pendingReview: true });
      setPendingTasks(pendingRes.data.data.tasks || []);
      
      // Fetch all tasks
      const allRes = await taskApi.getMentorTasks(user!.id);
      setAllTasks(allRes.data.data.tasks || []);
      
      // Fetch mentees for custom task form
      const menteesRes = await matchingApi.getMatches({ mentorId: user!.id, status: 'active' });
      const matchesList = menteesRes?.data?.matches || menteesRes?.matches || [];
      setMentees(matchesList);
      
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.menteeId || !formData.title || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await taskApi.createCustomTask(formData);
      toast.success('Custom task created successfully!');
      
      // Reset form
      setFormData({
        menteeId: '',
        enrollmentId: '',
        title: '',
        description: '',
        type: 'custom',
        difficulty: 'medium',
        dueDate: '',
        pointsBase: 10,
        deliverable: '',
        acceptanceCriteria: []
      });
      
      // Refresh data
      fetchData();
      setActiveTab('all');
    } catch (error: any) {
      console.error('Failed to create task:', error);
      toast.error(error.response?.data?.message || 'Failed to create custom task');
    }
  };

  const handleMenteeChange = (menteeId: string) => {
    const selectedMatch = mentees.find(m => m.menteeId === menteeId);
    setFormData({
      ...formData,
      menteeId,
      enrollmentId: selectedMatch?.enrollmentId || ''
    });
  };

  const handleReviewClick = (taskId: string) => {
    // TODO: Open review modal or navigate to review page
    toast.info('Review interface coming soon!');
  };

  const handleCancelTask = async (taskId: string) => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    try {
      await taskApi.cancelTask(taskId, cancelReason);
      toast.success('Task cancelled successfully');
      setCancellingTask(null);
      setCancelReason('');
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Failed to cancel task:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel task');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: any = {
      assigned: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Assigned' },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Progress' },
      submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted' },
      revision_needed: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' }
    };
    const badge = badges[status] || badges.assigned;
    return <span className={`px-3 py-1 ${badge.bg} ${badge.text} rounded-lg text-sm font-medium`}>{badge.label}</span>;
  };

  const getTaskSourceBadge = (isCustomTask: boolean) => {
    return isCustomTask ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">Custom</span>
    ) : (
      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">Roadmap</span>
    );
  };

  const filteredAllTasks = allTasks.filter(task => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      task.roadmapTask?.title?.toLowerCase().includes(searchLower) ||
      task.mentee?.firstName?.toLowerCase().includes(searchLower) ||
      task.mentee?.lastName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Task Management</h1>
        <p className="text-slate-600">Review submissions and manage tasks for your mentees</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Pending Review</div>
          <div className="text-slate-900 text-2xl">{stats?.pendingReview || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Reviewed Today</div>
          <div className="text-slate-900 text-2xl">{stats?.reviewedToday || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Total Tasks</div>
          <div className="text-slate-900 text-2xl">{stats?.total || 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex gap-6 px-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Pending Review
                {pendingTasks.length > 0 && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
                    {pendingTasks.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                All Tasks
              </div>
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'create'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Custom Task
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}

          {/* Pending Review Tab */}
          {!loading && activeTab === 'pending' && (
            <div>
              {pendingTasks.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">No pending reviews</p>
                  <p className="text-slate-500 text-sm">
                    You're all caught up! Task submissions will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-slate-900">{task.roadmapTask?.title}</h3>
                            {getTaskSourceBadge(task.isCustomTask)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              {task.mentee?.firstName} {task.mentee?.lastName}
                            </span>
                            <span>•</span>
                            <span>{task.enrollment?.program?.name}</span>
                            <span>•</span>
                            <span>Submitted {task.submittedAt ? new Date(task.submittedAt).toLocaleDateString() : 'recently'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(task.status)}
                        </div>
                      </div>

                      {task.submissions?.[0] && (
                        <div className="mb-4 p-4 bg-white rounded-lg">
                          <p className="text-slate-700 text-sm line-clamp-3">
                            {task.submissions[0].submissionText}
                          </p>
                          {task.submissions[0].submissionUrls?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-slate-600 text-xs mb-1">Attachments:</p>
                              {task.submissions[0].submissionUrls.map((url: string, idx: number) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline text-sm block"
                                >
                                  {url}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                        >
                          Review Submission
                        </button>
                        <button
                          onClick={() => setCancellingTask(task.id)}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors border border-red-200"
                        >
                          Cancel Task
                        </button>
                      </div>

                      {/* Cancel confirmation dialog */}
                      {cancellingTask === task.id && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-3 mb-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
                              <p className="text-red-700 text-sm mb-3">
                                This will mark the task as cancelled. The mentee will be notified.
                              </p>
                              <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Provide a reason for cancellation..."
                                className="w-full p-3 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleCancelTask(task.id)}
                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                >
                                  Confirm Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    setCancellingTask(null);
                                    setCancelReason('');
                                  }}
                                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200"
                                >
                                  Keep Task
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Tasks Tab */}
          {!loading && activeTab === 'all' && (
            <div>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search tasks..."
                    className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {filteredAllTasks.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">No tasks found</p>
                  <p className="text-slate-500 text-sm">
                    {searchTerm ? 'Try a different search term' : 'Tasks will appear here when mentees are assigned'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAllTasks.map((task) => (
                    <div key={task.id} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-slate-900">{task.roadmapTask?.title}</h4>
                            {getTaskSourceBadge(task.isCustomTask)}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <span>{task.mentee?.firstName} {task.mentee?.lastName}</span>
                            <span>•</span>
                            <span>{task.enrollment?.currentLevel?.name}</span>
                            <span>•</span>
                            <span>Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No deadline'}</span>
                            {task.finalRating && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                  {task.finalRating}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(task.status)}
                          {task.status !== 'completed' && task.status !== 'cancelled' && (
                            <button
                              onClick={() => setCancellingTask(task.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Cancel task"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cancel confirmation dialog */}
                      {cancellingTask === task.id && (
                        <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
                              <p className="text-red-700 text-sm mb-3">
                                This will mark the task as cancelled. The mentee will be notified.
                              </p>
                              <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Provide a reason for cancellation..."
                                className="w-full p-2 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-2 text-sm"
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleCancelTask(task.id)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => {
                                    setCancellingTask(null);
                                    setCancelReason('');
                                  }}
                                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create Custom Task Tab */}
          {!loading && activeTab === 'create' && (
            <div className="max-w-2xl">
              <h3 className="text-slate-900 mb-4">Assign Custom Task</h3>
              
              <form onSubmit={handleCreateCustomTask} className="space-y-6">
                <div>
                  <label className="block text-slate-700 text-sm mb-2">
                    Select Mentee <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={formData.menteeId}
                    onChange={(e) => handleMenteeChange(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Choose a mentee...</option>
                    {mentees.map((match) => (
                      <option key={match.menteeId} value={match.menteeId}>
                        {match.mentee?.firstName} {match.mentee?.lastName} - {match.enrollment?.program?.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 text-sm mb-2">
                    Task Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Build a REST API with authentication"
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 text-sm mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={6}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Provide detailed instructions for the task..."
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Task Type
                    </label>
                    <select 
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="custom">Custom</option>
                      <option value="exercise">Extra Practice</option>
                      <option value="project">Project</option>
                      <option value="practical">Practical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Difficulty
                    </label>
                    <select 
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Points
                    </label>
                    <input
                      type="number"
                      value={formData.pointsBase}
                      onChange={(e) => setFormData({ ...formData, pointsBase: parseInt(e.target.value) || 0 })}
                      placeholder="e.g., 100"
                      min="0"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                  >
                    Assign Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-900 text-sm font-medium mb-1">Custom Task Guidelines</p>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>• Be specific and clear in your instructions</li>
                      <li>• Set realistic deadlines based on task complexity</li>
                      <li>• Use appropriate difficulty levels</li>
                      <li>• Provide clear deliverables and success criteria</li>
                      <li>• Consider the mentee's current level and progress</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
