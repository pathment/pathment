'use client';

import Link from 'next/link';
import { Clock, Users, BookOpen, Loader2 } from 'lucide-react';
import { useMenteePrograms } from '@/lib/hooks/mentee';
import { SearchAndFilterBar, StatusBadge } from '@/components/admin/ui';

export default function MenteeProgramsPage() {
  const {
    programs,
    filteredPrograms,
    loading,
    searchQuery,
    statusFilter,
    setSearchQuery,
    setStatusFilter,
  } = useMenteePrograms();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Discover Programs</h1>
        <p className="text-slate-600">Browse available mentorship programs and start your learning journey</p>
      </div>

      {/* Search & Filters */}
      <SearchAndFilterBar
        search={searchQuery}
        onSearch={setSearchQuery}
        placeholder="Search programs..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'all', label: 'All Programs' },
              { value: 'published', label: 'Published' },
            ],
          },
        ]}
      />

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
                  <StatusBadge status={program.status} noIcon />
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
