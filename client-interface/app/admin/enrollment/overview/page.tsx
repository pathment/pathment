'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Filter, Download, CheckCircle2, Clock, XCircle, User, Loader2 } from 'lucide-react';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';

export default function EnrollmentOverview() {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({});
      const enrollmentsList = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(enrollmentsList);
    } catch (error: any) {
      console.error('Failed to fetch enrollments:', error);
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  };

  const filteredEnrollments = enrollments.filter(enrollment => {
    const matchesStatus = filterStatus === 'all' || enrollment.status === filterStatus;
    const matchesSearch = searchTerm === '' || 
      enrollment.mentee?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.mentee?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.program?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'matched':
        return 'bg-green-100 text-green-700';
      case 'pending_approval':
        return 'bg-amber-100 text-amber-700';
      case 'approved':
      case 'pending_match':
        return 'bg-blue-100 text-blue-700';
      case 'program_completed':
      case 'level_completed':
        return 'bg-indigo-100 text-indigo-700';
      case 'rejected':
      case 'dropped':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'matched':
      case 'program_completed':
      case 'level_completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'pending_approval':
      case 'approved':
      case 'pending_match':
        return <Clock className="w-4 h-4" />;
      case 'rejected':
      case 'dropped':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const stats = [
    { label: 'Total Enrollments', value: enrollments.length, color: 'indigo' },
    { label: 'Active', value: enrollments.filter(e => e.status === 'active' || e.status === 'matched').length, color: 'green' },
    { label: 'Pending Approval', value: enrollments.filter(e => e.status === 'pending_approval').length, color: 'amber' },
    { label: 'Pending Match', value: enrollments.filter(e => e.status === 'pending_match' || e.status === 'approved').length, color: 'blue' },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <h1 className="text-slate-900 mb-2">Enrollment Overview</h1>
          <p className="text-slate-600">Track mentee-mentor pairings and program progress</p>
        </div>
        <button className="mt-4 sm:mt-0 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export Data
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
            <div className="text-slate-600 text-sm mb-2">{stat.label}</div>
            <div className="text-slate-900 text-3xl">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by mentee, mentor, or program..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Status</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="pending_match">Pending Match</option>
              <option value="matched">Matched</option>
              <option value="active">Active</option>
              <option value="level_completed">Level Completed</option>
              <option value="program_completed">Program Completed</option>
              <option value="rejected">Rejected</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
        </div>
      </div>

      {/* Enrollments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No enrollments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Mentee</th>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Mentor</th>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Program</th>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Status</th>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Progress</th>
                  <th className="px-6 py-4 text-left text-slate-700 text-sm">Enrolled Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEnrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-slate-600 text-sm">
                            {enrollment.mentee?.firstName?.[0]}{enrollment.mentee?.lastName?.[0]}
                          </span>
                        </div>
                        <div>
                          <div className="text-slate-900">
                            {enrollment.mentee?.firstName} {enrollment.mentee?.lastName}
                          </div>
                          <div className="text-slate-500 text-xs">{enrollment.mentee?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {enrollment.mentor ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center">
                            <span className="text-purple-700 text-xs">
                              {enrollment.mentor.firstName?.[0]}{enrollment.mentor.lastName?.[0]}
                            </span>
                          </div>
                          <span className="text-slate-900 text-sm">
                            {enrollment.mentor.firstName} {enrollment.mentor.lastName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-sm">Not assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900 text-sm">{enrollment.program?.name || 'Unknown'}</div>
                      {enrollment.currentLevel && (
                        <div className="text-slate-500 text-xs mt-1">
                          Level: {enrollment.currentLevel.name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs ${getStatusColor(enrollment.status)}`}>
                        {getStatusIcon(enrollment.status)}
                        {getStatusLabel(enrollment.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{ width: `${enrollment.overallProgressPercentage || 0}%` }}
                          />
                        </div>
                        <span className="text-slate-600 text-sm">{enrollment.overallProgressPercentage || 0}%</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        Week {enrollment.currentWeek || 1}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-600 text-sm">
                        {enrollment.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString() : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
