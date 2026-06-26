import React from 'react';

export type AttendanceFilter = 'all' | 'present' | 'absent' | 'excused';

interface AttendanceFiltersProps {
  currentFilter: AttendanceFilter;
  onFilterChange: (filter: AttendanceFilter) => void;
}

export function AttendanceFilters({ currentFilter, onFilterChange }: AttendanceFiltersProps) {
  const filters: { value: AttendanceFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Excused' },
  ];

  return (
    <div className="flex items-center gap-2">
      {filters.map((f) => {
        const isActive = currentFilter === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isActive
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
