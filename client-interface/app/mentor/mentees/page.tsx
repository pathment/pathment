'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, Users, TrendingUp, Clock, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export default function MyMentees() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('all');

  useEffect(() => {
    if (user?.id) {
      fetchMyMatches();
    }
  }, [user]);

  const fetchMyMatches = async () => {
    try {
      setLoading(true);
      const response = await matchingApi.getMatches({ mentorId: user?.id, status: 'active' });
      const matchesList = response?.data?.matches || response?.matches || [];
      setMatches(matchesList);
    } catch (error: any) {
      console.error('Failed to fetch matches:', error);
      toast.error('Failed to load your mentees');
    } finally {
      setLoading(false);
    }
  };

  // Get unique programs for filter
  const programs = [...new Set(matches.map(m => m.enrollment?.program?.name))].filter(Boolean);

  // Filter matches
  const filteredMatches = matches.filter(match => {
    const mentee = match.mentee;
    const program = match.enrollment?.program?.name || '';
    
    const matchesSearch = searchTerm === '' || 
      mentee?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mentee?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProgram = filterProgram === 'all' || program === filterProgram;
    
    return matchesSearch && matchesProgram;
  });

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'bg-green-600';
    if (progress >= 50) return 'bg-blue-600';
    if (progress >= 25) return 'bg-yellow-600';
    return 'bg-slate-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My Mentees</h1>
        <p className="text-slate-600">Track and support your mentees' learning progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Total Mentees</div>
          <div className="text-slate-900 text-2xl">{matches.length}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Avg Progress</div>
          <div className="text-slate-900 text-2xl">
            {matches.length > 0 
              ? Math.round(matches.reduce((acc, m) => acc + (m.enrollment?.overallProgressPercentage || 0), 0) / matches.length)
              : 0}%
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Programs</div>
          <div className="text-slate-900 text-2xl">{programs.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or program..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Programs</option>
              {programs.map(program => (
                <option key={program} value={program}>{program}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mentees List */}
      <div className="bg-white rounded-2xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-2">
              {searchTerm || filterProgram !== 'all' ? 'No mentees found' : 'No mentees assigned yet'}
            </p>
            <p className="text-slate-500 text-sm">
              {searchTerm || filterProgram !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Your mentees will appear here once admin assigns them'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredMatches.map((match) => {
              const mentee = match.mentee;
              const enrollment = match.enrollment;
              const progress = enrollment?.overallProgressPercentage || 0;

              return (
                <Link
                  key={match.id}
                  href={`/mentor/mentees/${match.menteeId}`}
                  className="block p-6 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-indigo-200 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-indigo-700 text-lg">
                        {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-slate-900 text-lg mb-1">
                            {mentee?.firstName} {mentee?.lastName}
                          </h3>
                          <p className="text-slate-600 text-sm">
                            {mentee?.email}
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">
                          Active
                        </span>
                      </div>

                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-slate-700 text-sm">
                            {enrollment?.program?.name || 'Unknown Program'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 text-sm">
                            {enrollment?.currentLevel?.name || 'Level 1'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 text-sm">
                            Week {enrollment?.currentWeek || 1}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-slate-600">Overall Progress</span>
                          <span className="text-slate-900">{progress}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProgressColor(progress)} rounded-full transition-all`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="w-4 h-4" />
                          Matched {match.matchedAt ? new Date(match.matchedAt).toLocaleDateString() : 'Recently'}
                        </span>
                        {/* TODO: Add pending tasks count when API is ready */}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        // TODO: Open message modal
                        toast.info('Messaging feature coming soon!');
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
