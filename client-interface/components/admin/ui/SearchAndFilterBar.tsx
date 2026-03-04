import React from 'react';
import { Search, X } from 'lucide-react';

export interface FilterConfig {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export interface ActiveChip {
  label: string;
  onRemove: () => void;
}

interface SearchAndFilterBarProps {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  filters?: FilterConfig[];
  activeChips?: ActiveChip[];
  onClearAll?: () => void;
  /** Extra class names on the wrapper card */
  className?: string;
}

export function SearchAndFilterBar({
  search,
  onSearch,
  placeholder = 'Search…',
  filters = [],
  activeChips = [],
  onClearAll,
  className = '',
}: SearchAndFilterBarProps) {
  const hasChips = activeChips.length > 0;

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 mb-6 ${className}`}>
      <div className={`grid gap-3 ${filters.length > 0 ? `sm:grid-cols-${Math.min(filters.length + 1, 4)}` : ''}`}>
        {/* Search */}
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic filter selects */}
        {filters.map((filter, i) => (
          <select
            key={i}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700 appearance-none bg-white"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}
      </div>

      {/* Active filter chips */}
      {hasChips && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-slate-500">Active filters:</span>
          {activeChips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
            >
              {chip.label}
              <button onClick={chip.onRemove}><X className="w-3 h-3" /></button>
            </span>
          ))}
          {onClearAll && (
            <button onClick={onClearAll} className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
