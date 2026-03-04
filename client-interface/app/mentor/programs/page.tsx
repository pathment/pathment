'use client';

import Link from 'next/link';
import { BookOpen, Users, ChevronRight, Loader2, TrendingUp } from 'lucide-react';
import { useMentorPrograms } from '@/lib/hooks/mentor';

export default function MentorProgramsPage() {
  const { programs, loading } = useMentorPrograms();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My Programs</h1>
        <p className="text-slate-600">Programs you are mentoring in</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-slate-900 mb-2">No Programs Yet</h3>
          <p className="text-slate-600">You haven't been assigned to any programs yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program) => (
            <Link
              key={program.id}
              href={`/mentor/programs/${program.id}`}
              className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-indigo-300 hover:shadow-lg transition-all group flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs capitalize">
                  {program.status || 'active'}
                </span>
              </div>

              {/* Name & Description */}
              <h3 className="text-slate-900 group-hover:text-indigo-600 transition-colors mb-1">
                {program.name}
              </h3>
              <p className="text-slate-500 text-sm line-clamp-2 mb-4 flex-1">
                {program.description || 'No description available'}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Mentees</span>
                  </div>
                  <span className="text-slate-900 font-semibold">{program.menteeCount}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Avg Progress</span>
                  </div>
                  <span className="text-slate-900 font-semibold">{program.avgProgress}%</span>
                </div>
              </div>

              {/* Tags */}
              {program.tags && program.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {program.tags.slice(0, 3).map((tag: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-sm text-indigo-600 font-medium group-hover:underline">
                  View Program
                </span>
                <ChevronRight className="w-4 h-4 text-indigo-600" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
