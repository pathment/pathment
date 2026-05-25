'use client';

import React from 'react';

interface EnrollmentPipelineProps {
  byStatus: Record<string, number>;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  rejected: { label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  pending_match: { label: 'Pending Match', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  matched: { label: 'Matched', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending_completion: { label: 'Pending Completion', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  level_completed: { label: 'Level Completed', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  program_completed: { label: 'Completed', color: 'bg-green-50 text-green-700 border-green-200' },
  dropped: { label: 'Dropped', color: 'bg-slate-50 text-slate-600 border-slate-200' }
};

const pipelineOrder = [
  'pending_approval',
  'approved',
  'pending_match',
  'matched',
  'active',
  'pending_completion',
  'level_completed',
  'program_completed',
  'rejected',
  'dropped'
];

export function EnrollmentPipeline({ byStatus }: EnrollmentPipelineProps) {
  const sortedEntries = pipelineOrder
    .filter(status => byStatus[status] !== undefined)
    .map(status => ({ status, count: byStatus[status] }));

  const extraEntries = Object.entries(byStatus)
    .filter(([status]) => !pipelineOrder.includes(status))
    .map(([status, count]) => ({ status, count }));

  const allEntries = [...sortedEntries, ...extraEntries];

  if (allEntries.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Enrollment Pipeline</h2>
        <p className="text-sm text-slate-500">No enrollment data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-900 mb-4">Enrollment Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {allEntries.map(({ status, count }) => {
          const config = statusConfig[status] || {
            label: status.replace(/_/g, ' '),
            color: 'bg-slate-50 text-slate-600 border-slate-200'
          };
          return (
            <div
              key={status}
              className={`rounded-xl border px-4 py-3 transition-all duration-150 hover:shadow-sm ${config.color}`}
            >
              <p className="text-xs font-medium opacity-80 mb-1 capitalize">{config.label}</p>
              <p className="text-xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
