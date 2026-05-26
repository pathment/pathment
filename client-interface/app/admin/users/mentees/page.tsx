'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  School,
  BookOpen,
  CheckCircle2,
  Trophy,
  ExternalLink,
  Flame,
  Trash2,
  Loader2,
  ShieldOff,
  ShieldCheck,
} from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { TablePagination } from '@/components/shared/TablePagination';
import {
  StatsCard,
  PageHeader,
  SearchAndFilterBar,
  AvatarWithInitials,
} from '@/components/admin/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMenteesList, MenteeListItem } from '@/lib/hooks/admin/useMenteesList';
import { menteeApi } from '@/lib/services/mentee-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: DataTableColumn<MenteeListItem>[] = [
  {
    key: 'firstName',
    label: 'Mentee',
    render: (_, row) => (
      <AvatarWithInitials
        firstName={row.firstName}
        lastName={row.lastName}
        email={row.email}
        colorClass="bg-indigo-100 text-indigo-700"
      />
    ),
  },
  {
    key: 'background' as keyof MenteeListItem,
    label: 'Background',
    render: (_, row) => {
      const mp = row.menteeProfile;
      const primary = mp?.currentOccupation ?? mp?.currentEducation;
      const secondary = mp?.currentOccupation ? mp?.currentEducation : undefined;
      return (
        <div className="min-w-0">
          <p className="text-sm text-slate-900 truncate">{primary ?? '—'}</p>
          {secondary && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{secondary}</p>
          )}
        </div>
      );
    },
  },
  {
    key: 'programs' as keyof MenteeListItem,
    label: 'Programs',
    render: (_, row) => {
      const enrolled = row.menteeProfile?.totalProgramsEnrolled ?? 0;
      const completed = row.menteeProfile?.totalProgramsCompleted ?? 0;
      return (
        <div className="text-sm">
          <span className="text-slate-900 font-medium">{enrolled}</span>
          <span className="text-slate-400 mx-1">enrolled</span>
          <span className="text-slate-400">·</span>
          <span className="text-green-600 font-medium mx-1">{completed}</span>
          <span className="text-slate-400">completed</span>
        </div>
      );
    },
  },
  {
    key: 'progress' as keyof MenteeListItem,
    label: 'Progress',
    render: (_, row) => {
      const tasks = row.menteeProfile?.totalTasksCompleted ?? 0;
      const points = row.menteeProfile?.totalPoints ?? 0;
      const level = row.menteeProfile?.currentLevel ?? 1;
      return (
        <div className="text-sm space-y-0.5">
          <p className="text-slate-700">
            <span className="font-medium">{tasks}</span>
            <span className="text-slate-400 ml-1 text-xs">tasks done</span>
          </p>
          <p className="text-indigo-600 text-xs font-medium">
            {points.toLocaleString()} pts · Lvl {level}
          </p>
        </div>
      );
    },
  },
  {
    key: 'streak' as keyof MenteeListItem,
    label: 'Streak',
    render: (_, row) => {
      const streak = row.menteeProfile?.currentStreakDays ?? 0;
      return streak > 0 ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-orange-600">
          <Flame className="w-3.5 h-3.5" />
          {streak}d
        </span>
      ) : (
        <span className="text-slate-400 text-sm">—</span>
      );
    },
  },
  {
    key: 'createdAt',
    label: 'Joined',
    sortable: true,
    render: (val) =>
      val ? (
        <span className="text-sm text-slate-600">
          {new Date(val).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMenteesListPage() {
  const {
    mentees,
    isLoading,
    error,
    pagination,
    search,
    setSearch,
    refetch,
  } = useMenteesList();

  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendRow, setSuspendRow] = useState<MenteeListItem | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Permanently delete ${name}? This removes all their enrollments and data and cannot be undone.`)) return;
    try {
      setDeleteLoading(id);
      await menteeApi.deleteUser(id);
      toast.success(`${name} has been deleted.`);
      refetch();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleOpenSuspendModal = (row: MenteeListItem) => {
    setSuspendRow(row);
    setSuspendModalOpen(true);
  };

  const handleCloseSuspendModal = () => {
    setSuspendModalOpen(false);
    setSuspendRow(null);
  };

  const handleConfirmSuspend = async () => {
    if (!suspendRow) return;

    const row = suspendRow;
    const isSuspended = row.status === 'suspended';
    const name = `${row.firstName} ${row.lastName}`;

    try {
      setSuspendLoading(row.id);
      if (isSuspended) {
        await menteeApi.unsuspendUser(row.id);
        toast.success(`${name} has been unsuspended.`);
      } else {
        await menteeApi.suspendUser(row.id);
        toast.success(`${name} has been suspended.`);
      }
      handleCloseSuspendModal();
      refetch();
    } catch (err: any) {
      toast.error(
        extractApiErrorMessage(
          err,
          `Failed to ${isSuspended ? 'unsuspend' : 'suspend'} user`,
        ),
      );
    } finally {
      setSuspendLoading(null);
    }
  };

  // Stats derived from current page
  const enrolledCount = mentees.filter(
    (m) => (m.menteeProfile?.totalProgramsEnrolled ?? 0) > 0
  ).length;

  const completedPrograms = mentees.reduce(
    (sum, m) => sum + (m.menteeProfile?.totalProgramsCompleted ?? 0),
    0
  );

  const totalPoints = mentees.reduce(
    (sum, m) => sum + (m.menteeProfile?.totalPoints ?? 0),
    0
  );

  const actionColumn: DataTableColumn<MenteeListItem> = {
    key: 'actions' as keyof MenteeListItem,
    label: '',
    render: (_, row) => {
      const isSuspended = row.status === 'suspended';
      const name = `${row.firstName} ${row.lastName}`;
      return (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/enrollment/overview`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title={`View enrollments for ${name}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Enrollments
          </Link>
          <button
            onClick={() => handleOpenSuspendModal(row)}
            disabled={suspendLoading === row.id}
            title={isSuspended ? 'Unsuspend' : 'Suspend'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
              isSuspended
                ? 'text-green-700 hover:bg-green-50'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            {suspendLoading === row.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : isSuspended
                ? <ShieldCheck className="w-3.5 h-3.5" />
                : <ShieldOff className="w-3.5 h-3.5" />}
            {isSuspended ? 'Unsuspend' : 'Suspend'}
          </button>
          <button
            onClick={() => handleDelete(row.id, name)}
            disabled={deleteLoading === row.id}
            title="Delete permanently"
            className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleteLoading === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      );
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mentees"
        subtitle="All registered mentees on the platform"
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={School}
          label="Total Mentees"
          value={isLoading ? '—' : pagination.total}
          colorClass="text-indigo-600 bg-indigo-50"
        />
        <StatsCard
          icon={BookOpen}
          label="Currently Enrolled"
          value={isLoading ? '—' : enrolledCount}
          colorClass="text-blue-600 bg-blue-50"
          sub="on this page"
        />
        <StatsCard
          icon={CheckCircle2}
          label="Programs Completed"
          value={isLoading ? '—' : completedPrograms}
          colorClass="text-green-600 bg-green-50"
          sub="on this page"
        />
        <StatsCard
          icon={Trophy}
          label="Total Points Earned"
          value={isLoading ? '—' : totalPoints.toLocaleString()}
          colorClass="text-amber-600 bg-amber-50"
          sub="on this page"
        />
      </div>

      {/* Search */}
      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name or email…"
      />

      {/* Table */}
      <DataTable<MenteeListItem>
        columns={[...columns, actionColumn]}
        data={mentees}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyState={{
          title: 'No mentees found',
          description: search
            ? 'No mentees match your search. Try a different name or email.'
            : 'No mentees are registered on the platform yet.',
        }}
      />

      <TablePagination pagination={pagination} isLoading={isLoading} />

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendModalOpen} onOpenChange={setSuspendModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendRow?.status === 'suspended' ? 'Unsuspend User?' : 'Suspend User?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendRow?.status === 'suspended'
                ? `You are about to unsuspend ${suspendRow.firstName} ${suspendRow.lastName}. They will be able to log in again.`
                : `You are about to suspend ${suspendRow?.firstName} ${suspendRow?.lastName}. They will be logged out immediately and cannot log in until unsuspended.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspendLoading === suspendRow?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSuspend}
              disabled={suspendLoading === suspendRow?.id}
              className={suspendRow?.status === 'suspended' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {suspendLoading === suspendRow?.id
                ? 'Processing...'
                : suspendRow?.status === 'suspended'
                  ? 'Unsuspend'
                  : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
