'use client';

import Link from 'next/link';
import { Users, Calendar } from 'lucide-react';

interface Program {
  id: string;
  name: string;
  enrollments: number;
  status: string;
  completion: number;
  startDate: string;
  mentors?: number;
}

interface ProgramListCardProps {
  programs?: Program[];
}

export function ProgramListCard({ programs = [] }: ProgramListCardProps) {
  return (
    <div className="lg:col-span-2">
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-slate-900 font-semibold">Recent Programs</h2>
          <Link href="/admin/programs/list" className="text-indigo-600 hover:text-indigo-700 text-sm">
            View all
          </Link>
        </div>
        {programs.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No programs available
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {programs.map((program) => (
              <Link
                key={program.id}
                href={`/admin/programs/${program.id}`}
                className="block px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-slate-900 font-medium mb-1">{program.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {program.enrollments} enrolled
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {program.startDate ? new Date(program.startDate).toLocaleDateString() : 'No date'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs ${
                      program.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : program.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {program.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${program.completion}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600">{program.completion}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
