'use client';

import { useState } from 'react';
import {
  Download,
  CheckCircle2,
  Users,
  Hourglass,
  UserCheck,
  TrendingUp,
  Clock,
  Loader2,
} from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { TablePagination } from '@/components/shared/TablePagination';
import {
  StatusBadge,
  AvatarWithInitials,
  ProgressBar,
  StatsCard,
  PageHeader,
  SearchAndFilterBar,
} from '@/components/admin/ui';
import { useEnrollmentList, Enrollment } from '@/lib/hooks/admin/useEnrollmentList';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Convert enrollment data to CSV
const convertToCSV = (data: Enrollment[]): string => {
  if (data.length === 0) return '';

  // Define CSV headers
  const headers = [
    'Enrollment ID',
    'Mentee ID',
    'Mentee Name',
    'Mentee Email',
    'Mentor ID',
    'Mentor Name',
    'Mentor Email',
    'Match Status',
    'Program ID',
    'Program Name',
    'Program Type',
    'Program Status',
    'Current Level ID',
    'Current Level Name',
    'Level Duration (Weeks)',
    'Enrollment Status',
    'Current Week',
    'Tasks Completed',
    'Total Tasks',
    'Progress (%)',
    'Enrolled Date',
    'Completion Requested Date',
    'Completion Requested By',
    'Completion Rejection Reason',
  ];

  // Convert data rows
  const rows = data.map((enrollment) => {
    const match = enrollment.matches?.[0];
    const mentor = match?.mentor;
    const mentorId = mentor?.id || '';
    const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}`.trim() : 'Not assigned';
    const mentorEmail = mentor?.email || 'N/A';
    const matchStatus = match?.status || 'No match';
    
    const completionRequested = enrollment.completionRequestedAt
      ? new Date(enrollment.completionRequestedAt).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        })
      : 'N/A';

    const enrolledDate = enrollment.enrolledAt 
      ? new Date(enrollment.enrolledAt).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        })
      : 'N/A';

    return [
      enrollment.id || '',
      enrollment.menteeId || '',
      `${enrollment.mentee?.firstName || ''} ${enrollment.mentee?.lastName || ''}`.trim() || 'N/A',
      enrollment.mentee?.email || 'N/A',
      mentorId,
      mentorName,
      mentorEmail,
      matchStatus,
      enrollment.programId || '',
      enrollment.program?.name || 'N/A',
      enrollment.program?.type || 'N/A',
      enrollment.program?.status || 'N/A',
      enrollment.currentLevelId || '',
      enrollment.currentLevel?.name || 'N/A',
      enrollment.currentLevel?.durationWeeks?.toString() || 'N/A',
      enrollment.status || 'N/A',
      enrollment.currentWeek?.toString() || '0',
      enrollment.tasksCompleted?.toString() || '0',
      enrollment.tasksTotal?.toString() || '0',
      parseFloat(enrollment.overallProgressPercentage || '0').toFixed(2),
      enrolledDate,
      completionRequested,
      enrollment.completionRequestedByRole || 'N/A',
      enrollment.completionRejectionReason || 'N/A',
    ];
  });

  // Escape CSV fields that contain commas or quotes
  const escapeCSVField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  // Build CSV string
  const csvContent = [
    headers.map(escapeCSVField).join(','),
    ...rows.map((row) => row.map(String).map(escapeCSVField).join(',')),
  ].join('\n');

  return csvContent;
};

// Download CSV file
const downloadCSV = (content: string, filename: string) => {
  // Add UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: DataTableColumn<Enrollment>[] = [
  {
    key: 'mentee',
    label: 'Mentee',
    render: (_, row) => (
      <AvatarWithInitials firstName={row.mentee?.firstName} lastName={row.mentee?.lastName} email={row.mentee?.email} />
    ),
  },
  {
    key: 'matches',
    label: 'Mentor',
    render: (_, row) => {
      const mentor = row.matches?.[0]?.mentor;
      return mentor ? (
        <AvatarWithInitials firstName={mentor.firstName} lastName={mentor.lastName} email={mentor.email} colorClass="bg-purple-100 text-purple-700" />
      ) : (
        <span className="text-slate-400 text-sm">Not assigned</span>
      );
    },
  },
  {
    key: 'program',
    label: 'Program',
    render: (_, row) => (
      <div className="min-w-0">
        <p className="text-sm text-slate-900 truncate max-w-[180px]">{row.program?.name ?? '—'}</p>
        {row.currentLevel && (
          <p className="text-xs text-slate-500 mt-0.5">Level: {row.currentLevel.name}</p>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'overallProgressPercentage',
    label: 'Progress',
    render: (_, row) => {
      const pct = parseFloat(row.overallProgressPercentage) || 0;
      return (
        <ProgressBar
          value={pct}
          sub={`${row.tasksCompleted}/${row.tasksTotal} tasks · Week ${row.currentWeek}`}
        />
      );
    },
  },
  {
    key: 'enrolledAt',
    label: 'Enrolled',
    sortable: true,
    render: (val) =>
      val ? (
        <span className="text-sm text-slate-600">
          {new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ) : <span className="text-slate-400">—</span>,
  },
];
// ─── Actions column is added inside the component to access state ─────────────
const STATUS_OPTIONS = [
  { value: 'all',               label: 'All Status' },
  { value: 'pending_approval',  label: 'Pending Approval' },
  { value: 'approved',          label: 'Approved' },
  { value: 'pending_match',     label: 'Pending Match' },
  { value: 'matched',           label: 'Matched' },
  { value: 'active',            label: 'Active' },
  { value: 'level_completed',   label: 'Level Completed' },
  { value: 'program_completed', label: 'Program Completed' },
  { value: 'pending_completion', label: 'Pending Completion' },
  { value: 'rejected',          label: 'Rejected' },
  { value: 'dropped',           label: 'Dropped' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EnrollmentOverviewPage() {
  const {
    enrollments, isLoading, error, isEmpty,
    pagination,
    search, status, hasActiveFilters,
    setSearch, setStatus, resetFilters,
    stats, refetch,
  } = useEnrollmentList();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const handleExportCSV = async () => {
    try {
      setExportLoading(true);
      toast.info('Fetching enrollment data...');

      // Fetch all enrollments without pagination
      const response = await enrollmentApi.getAll({
        limit: 10000, // Large limit to get all records
        ...(status !== 'all' && { status }),
        ...(search && { search }),
      });

      const allEnrollments: Enrollment[] = response?.data?.enrollments ?? [];

      if (allEnrollments.length === 0) {
        toast.warning('No enrollments to export');
        return;
      }

      // Convert to CSV
      const csvContent = convertToCSV(allEnrollments);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const statusSuffix = status !== 'all' ? `_${status}` : '';
      const filename = `enrollments${statusSuffix}_${timestamp}.csv`;

      // Download
      downloadCSV(csvContent, filename);

      toast.success(`Successfully exported ${allEnrollments.length} enrollment(s) with 24 data columns`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err?.response?.data?.message || 'Failed to export CSV');
    } finally {
      setExportLoading(false);
    }
  };

  const handleApproveCompletion = async (enrollmentId: string) => {
    try {
      setActionLoading(enrollmentId);
      const res = await enrollmentApi.approveCompletion(enrollmentId);
      const result = (res as any)?.data?.result;
      if (result?.autoPromoted) {
        toast.success(`Level complete! Mentee advanced to "${result.nextLevelName}" — awaiting new mentor match.`);
      } else if (result?.hasNextLevel === false) {
        toast.success('Program completed!');
      } else {
        toast.success('Completion approved!');
      }
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to approve completion');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteToNextLevel = async (enrollmentId: string) => {
    try {
      setActionLoading(enrollmentId);
      const res = await enrollmentApi.promoteToNextLevel(enrollmentId);
      toast.success((res as any)?.data?.message || (res as any)?.message || 'Mentee promoted to next level!');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to promote to next level');
    } finally {
      setActionLoading(null);
    }
  };

  const actionColumn: DataTableColumn<Enrollment> = {
    key: 'id',
    label: 'Action',
    render: (id: string, row: Enrollment) => {
      const busy = actionLoading === id;
      if (row.status === 'pending_completion') {
        return (
          <button
            onClick={() => handleApproveCompletion(id)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Approve
          </button>
        );
      }
      if (row.status === 'level_completed') {
        return (
          <button
            onClick={() => handlePromoteToNextLevel(id)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
            Promote
          </button>
        );
      }
      return <span className="text-slate-300 text-xs">—</span>;
    },
  };

  const tableColumns = [...columns, actionColumn];

  const statCards = [
    { label: 'Total Enrollments', value: pagination.total,      icon: Users,     color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Active / Matched',  value: stats.active,          icon: UserCheck, color: 'text-green-600 bg-green-50'   },
    { label: 'Pending Approval',  value: stats.pendingApproval, icon: Hourglass, color: 'text-amber-600 bg-amber-50'   },
    { label: 'Pending Match',     value: stats.pendingMatch,     icon: Clock,     color: 'text-blue-600 bg-blue-50'     },
  ];

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title="Enrollment Overview"
        subtitle="Track mentee–mentor pairings and program progress"
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
        actions={
          <button 
            onClick={handleExportCSV}
            disabled={exportLoading || isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export CSV
              </>
            )}
          </button>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <StatsCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            colorClass={card.color}
          />
        ))}
      </div>

      {/* ── Filters ── */}
      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search mentee name, email or program…"
        filters={[
          {
            value: status,
            onChange: (v) => setStatus(v as typeof status),
            options: STATUS_OPTIONS,
          },
        ]}
        activeChips={[
          ...(search ? [{ label: `"${search}"`, onRemove: () => setSearch('') }] : []),
          ...(status !== 'all'
            ? [{ label: STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status, onRemove: () => setStatus('all') }]
            : []),
        ]}
        onClearAll={hasActiveFilters ? resetFilters : undefined}
      />

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <DataTable<Enrollment>
          columns={tableColumns}
          data={enrollments}
          rowKey="id"
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          skeletonRows={10}
          emptyState={{
            title: hasActiveFilters ? 'No enrollments match your filters' : 'No enrollments yet',
            description: hasActiveFilters
              ? 'Try adjusting your search or status filter'
              : 'Enrollments will appear here once mentees enrol in programs',
            action: hasActiveFilters ? { label: 'Clear filters', onClick: resetFilters } : undefined,
          }}
          className="border-0 rounded-none"
        />

        {!isLoading && !error && !isEmpty && (
          <div className="border-t border-slate-100 px-4">
            <TablePagination pagination={pagination} isLoading={isLoading} showPageSize pageSizeOptions={[10, 20, 50]} />
          </div>
        )}
      </div>
    </>
  );
}
