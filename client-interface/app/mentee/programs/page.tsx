'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Clock, Users, BookOpen, Star, Loader2, Filter } from 'lucide-react';
import { programManagementApi } from '@/lib/services/program-api';
import { toast } from 'sonner';

export default function MenteeProgramsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getAll({ status: 'published' });
      const programsList = response || response?.programs || [];
      setPrograms(programsList);
    } catch (error: any) {
      console.error('Failed to fetch programs:', error);
      toast.error('Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  const filteredPrograms = programs.filter((program) => {
    const matchesSearch = program.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      program.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || program.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Discover Programs</h1>
        <p className="text-slate-600">Browse available mentorship programs and start your learning journey</p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Filter */}
          <div className="sm:w-48">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
              >
                <option value="all">All Programs</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Programs Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-slate-900 mb-2">No Programs Found</h3>
          <p className="text-slate-600">
            {searchQuery ? 'Try adjusting your search or filters' : 'No programs are currently available'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrograms.map((program) => (
            <Link
              key={program.id}
              href={`/mentee/programs/${program.id}/enroll`}
              className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-indigo-300 hover:shadow-lg transition-all group"
            >
              {/* Program Header */}
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {program.name}
                  </h3>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                    {program.status}
                  </span>
                </div>
                <p className="text-slate-600 text-sm line-clamp-2">
                  {program.description || 'No description available'}
                </p>
              </div>

              {/* Skills Tags */}
              {program.skillTags && program.skillTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {program.skillTags.slice(0, 3).map((tag: string, idx: number) => (
                    <span key={idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                  {program.skillTags.length > 3 && (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                      +{program.skillTags.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-slate-600 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{program.totalDurationWeeks || 0} weeks</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>{program.currentEnrollments || 0} enrolled</span>
                </div>
              </div>

              {/* CTA */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-indigo-600 group-hover:text-indigo-700 text-sm flex items-center gap-2">
                  <span>View Details & Enroll</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Results Count */}
      {!loading && filteredPrograms.length > 0 && (
        <div className="text-center text-slate-600 text-sm">
          Showing {filteredPrograms.length} of {programs.length} programs
        </div>
      )}
    </div>
  );
}
