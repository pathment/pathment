'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';

interface PendingMatch {
  id: string;
  mentee: {
    id: string;
    name: string;
    email: string;
  };
  program: string;
  enrolledAt: string;
  waitTime: string;
}

interface RecentActivityProps {
  pendingMatches?: PendingMatch[];
}

export function RecentActivity({ pendingMatches = [] }: RecentActivityProps) {
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900 font-semibold">Pending Matches</h2>
            {pendingMatches.length > 0 && (
              <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-medium">
                {pendingMatches.length}
              </span>
            )}
          </div>
        </div>
        {pendingMatches.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No pending mentor matches
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-200">
              {pendingMatches.map((match) => (
                <div key={match.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-slate-600 text-sm font-medium">
                        {match.mentee.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-900 text-sm font-medium mb-1">{match.mentee.name}</div>
                      <div className="text-slate-600 text-xs mb-2">{match.program}</div>
                      <div className="flex items-center gap-1 text-orange-600 text-xs">
                        <Clock className="w-3 h-3" />
                        Waiting {match.waitTime}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-200">
              <Link
                href="/admin/matching/mentor-assignment"
                className="block text-center text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                Assign Mentors
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
