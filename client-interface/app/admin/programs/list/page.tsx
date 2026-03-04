'use client';

import Link from 'next/link';
import {
  Plus, Users, Calendar, TrendingUp,
  MoreVertical, Eye, Edit, Trash2, ArrowUpDown,
} from 'lucide-react';
import { TablePagination } from '@/components/shared/TablePagination';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader, StatusBadge, SearchAndFilterBar } from '@/components/admin/ui';
import { useProgramList, ProgramStatus, ProgramSortBy, SortOrder } from '@/lib/hooks/admin/useProgramList';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ProgramCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-5 bg-slate-200 rounded w-48" />
            <div className="h-5 bg-slate-200 rounded w-20" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 bg-slate-100 rounded w-24" />
            <div className="h-4 bg-slate-100 rounded w-16" />
            <div className="h-4 bg-slate-100 rounded w-28" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 bg-slate-100 rounded-full w-16" />
            <div className="h-5 bg-slate-100 rounded-full w-20" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-xs h-1.5 bg-slate-100 rounded-full" />
            <div className="h-4 bg-slate-100 rounded w-8" />
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-center space-y-1">
            <div className="h-7 bg-slate-200 rounded w-8 mx-auto" />
            <div className="h-4 bg-slate-100 rounded w-14" />
          </div>
          <div className="text-center space-y-1">
            <div className="h-7 bg-slate-200 rounded w-8 mx-auto" />
            <div className="h-4 bg-slate-100 rounded w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  active:    'bg-green-100 text-green-700',
  draft:     'bg-amber-100 text-amber-700',
  completed: 'bg-indigo-100 text-indigo-700',
  archived:  'bg-slate-100 text-slate-600',
};

const STATUS_OPTIONS: { value: ProgramStatus; label: string }[] = [
  { value: 'all',       label: 'All Status' },
  { value: 'published', label: 'Published' },
  { value: 'draft',     label: 'Draft' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived',  label: 'Archived' },
];

const TYPE_OPTIONS = [
  { value: 'all',         label: 'All Types' },
  { value: 'mentorship',  label: 'Mentorship' },
  { value: 'internship',  label: 'Internship' },
  { value: 'training',    label: 'Training' },
  { value: 'onboarding',  label: 'Onboarding' },
];

const SORT_OPTIONS: { value: ProgramSortBy; label: string }[] = [
  { value: 'createdAt',  label: 'Newest first' },
  { value: 'name',       label: 'Name A–Z' },
  { value: 'startDate',  label: 'Start date' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgramListPage() {
  const {
    programs, isLoading, error, isEmpty,
    pagination,
    search, status, type, sortBy, sortOrder, hasActiveFilters,
    setSearch, setStatus, setType, setSortBy, setSortOrder,
    resetFilters, refetch, handleDelete,
  } = useProgramList();

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title="Programs"
        subtitle="Manage all mentorship programs"
        actions={
          <Link
            href="/admin/programs/create"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Program
          </Link>
        }
      />

      {/* ── Filters ── */}
      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name or description…"
        filters={[
          {
            value: status,
            onChange: (v) => setStatus(v as ProgramStatus),
            options: STATUS_OPTIONS,
          },
          {
            value: type,
            onChange: setType,
            options: TYPE_OPTIONS,
          },
        ]}
        activeChips={[
          ...(search ? [{ label: `"${search}"`, onRemove: () => setSearch('') }] : []),
          ...(status !== 'all' ? [{ label: STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status, onRemove: () => setStatus('all') }] : []),
          ...(type !== 'all' ? [{ label: TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type, onRemove: () => setType('all') }] : []),
        ]}
        onClearAll={hasActiveFilters ? resetFilters : undefined}
      />

      {/* Sort row */}
      <div className="flex flex-wrap items-center gap-3 mb-6 -mt-3">
        <div className="flex items-center gap-2 text-sm text-slate-500 mr-2">
          <TrendingUp className="w-4 h-4" />
          <span>Sort:</span>
        </div>
        <div className="flex items-center gap-1.5">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                if (sortBy === o.value) {
                  setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                } else {
                  setSortBy(o.value);
                  setSortOrder('DESC');
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === o.value
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {o.label}
              {sortBy === o.value && (
                <ArrowUpDown className="w-3 h-3" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && !isLoading && (
        <ErrorState message={error} onRetry={refetch} className="mb-6" />
      )}

      {/* ── Program Cards ── */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: pagination.limit }).map((_, i) => (
            <ProgramCardSkeleton key={i} />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          title={hasActiveFilters ? 'No programs match your filters' : 'No programs yet'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or filters'
              : 'Create your first mentorship program to get started'
          }
          action={
            hasActiveFilters
              ? { label: 'Clear filters', onClick: resetFilters }
              : { label: 'Create Program', href: '/admin/programs/create' }
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            {programs.map((program) => (
              <div
                key={program.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Program Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/admin/programs/${program.id}`}
                        className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {program.name}
                      </Link>
                      <StatusBadge status={program.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 mb-3">
                      {program.type && <span className="capitalize">{program.type}</span>}
                      {program.type && <span>·</span>}
                      <span>{program.totalDurationWeeks} weeks</span>
                      {program.startDate && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(program.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Tags */}
                    {program.tags && program.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {program.tags.map((tag: string) => (
                          <span key={tag} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 max-w-xs h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${program.completion || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums">{program.completion || 0}% complete</span>
                    </div>
                  </div>

                  {/* Stats + Actions */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{program._count?.enrollments ?? 0}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Users className="w-3.5 h-3.5" />
                        Mentees
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{program._count?.mentors ?? program.mentors ?? 0}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Mentors</p>
                    </div>

                    {/* Dropdown actions */}
                    <div className="relative group">
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreVertical className="w-5 h-5 text-slate-500" />
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <Link
                          href={`/admin/programs/${program.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700 rounded-t-xl text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </Link>
                        <Link
                          href={`/admin/programs/${program.id}/roadmap`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm"
                        >
                          <Edit className="w-4 h-4" />
                          Edit Roadmap
                        </Link>
                        <button
                          onClick={() => handleDelete(program.id, program.name)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-red-600 w-full rounded-b-xl text-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Program
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Pagination ── */}
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 px-4">
            <TablePagination
              pagination={pagination}
              isLoading={isLoading}
              showInfo
              showPageSize
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        </>
      )}
    </>
  );
}
