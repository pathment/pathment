'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  UserCheck,
  TrendingDown,
  Star,
  ExternalLink,
  Loader2,
  Trash2,
  ShieldOff,
  ShieldCheck,
  Pencil,
} from 'lucide-react';
import { EditUserDrawer } from '@/components/admin/EditUserDrawer';
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
import { useMentorsList, MentorListItem, AcceptingFilter } from '@/lib/hooks/admin/useMentorsList';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { useConfirm } from '@/lib/context/ConfirmContext';

// ─── Column definitions ───────────────────────────────────────────────────────

/** "Today" / "Yesterday" / "5d ago" / "3 mo ago" / "Never". */
function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Never';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const columns: DataTableColumn<MentorListItem>[] = [
  {
    key: 'firstName',
    label: 'Mentor',
    render: (_, row) => (
      <div className="flex items-center gap-2">
        <AvatarWithInitials
          firstName={row.firstName}
          lastName={row.lastName}
          email={row.email}
          src={row.profilePictureUrl}
          href={`/admin/mentors/${row.id}`}
          colorClass="bg-purple-100 text-purple-700"
        />
        {row.status === 'suspended' && (
          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium dark:bg-amber-500/10 dark:text-amber-300">Suspended</span>
        )}
      </div>
    ),
  },
  {
    key: 'mentorProfile' as keyof MentorListItem,
    label: 'Title / Organization',
    render: (_, row) => {
      const mp = row.mentorProfile;
      return (
        <div className="min-w-0">
          <p className="text-sm text-slate-900 truncate">{mp?.title ?? '-'}</p>
          {mp?.organization && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{mp.organization}</p>
          )}
        </div>
      );
    },
  },
  {
    key: 'capacity' as keyof MentorListItem,
    label: 'Capacity',
    render: (_, row) => {
      const mp = row.mentorProfile;
      const current = mp?.currentMenteeCount ?? 0;
      const max = mp?.maxMentees ?? 0;
      const pct = max > 0 ? Math.round((current / max) * 100) : 0;
      return (
        <div className="min-w-[110px]">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-medium text-slate-700">{current}/{max}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct < 70 ? 'bg-green-500' : pct < 90 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      );
    },
  },
  {
    key: 'clans' as keyof MentorListItem,
    label: 'Clans',
    render: (_, row) => {
      const clans = row.clans ?? [];
      if (clans.length === 0) return <span className="text-slate-400 text-sm">—</span>;
      const visible = clans.slice(0, 2);
      const remaining = clans.length - visible.length;
      return (
        <div className="flex flex-col gap-1">
          {visible.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 text-xs text-slate-700">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.role === 'lead_mentor' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                {c.role === 'lead_mentor' ? 'Lead' : 'Co'}
              </span>
              <span className="truncate max-w-[120px]">{c.name}</span>
            </span>
          ))}
          {remaining > 0 && <span className="text-xs text-slate-400">+{remaining} more</span>}
        </div>
      );
    },
  },
  {
    key: 'specializations' as keyof MentorListItem,
    label: 'Specializations',
    render: (_, row) => {
      const specs = row.specializations ?? [];
      if (specs.length === 0) return <span className="text-slate-400 text-sm">—</span>;
      const visible = specs.slice(0, 2);
      const remaining = specs.length - visible.length;
      return (
        <div className="flex flex-wrap gap-1">
          {visible.map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium"
            >
              {s}
            </span>
          ))}
          {remaining > 0 && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
              +{remaining}
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: 'accepting' as keyof MentorListItem,
    label: 'Status',
    render: (_, row) => {
      const accepting = row.mentorProfile?.isAcceptingMentees !== false;
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            accepting ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${accepting ? 'bg-green-500' : 'bg-slate-400'}`}
          />
          {accepting ? 'Accepting' : 'Closed'}
        </span>
      );
    },
  },
  {
    key: 'activeMentees' as keyof MentorListItem,
    label: 'Active mentees',
    render: (_, row) => <span className="text-sm font-medium text-slate-700 tabular-nums">{row.activeMentees ?? 0}</span>,
  },
  {
    key: 'lastLoginAt' as keyof MentorListItem,
    label: 'Last active',
    render: (_, row) => <span className="text-sm text-slate-600">{relativeTime(row.lastLoginAt)}</span>,
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
        <span className="text-slate-400">-</span>
      ),
  },
];

const ACCEPTING_OPTIONS = [
  { value: 'all', label: 'All Mentors' },
  { value: 'accepting', label: 'Accepting Mentees' },
  { value: 'not_accepting', label: 'Not Accepting' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMentorsListPage() {
  const {
    mentors,
    isLoading,
    error,
    pagination,
    search,
    setSearch,
    acceptingFilter,
    setAcceptingFilter,
    refetch,
  } = useMentorsList();

  const confirm = useConfirm();
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<MentorListItem | null>(null);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendRow, setSuspendRow] = useState<MentorListItem | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({ title: `Delete ${name}?`, description: `Their active mentee assignments will be cancelled. This permanently removes the account and cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      setDeleteLoading(id);
      await mentorApi.deleteUser(id);
      toast.success(`${name} has been deleted.`);
      refetch();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleOpenSuspendModal = (row: MentorListItem) => {
    setSuspendRow(row);
    setSuspendModalOpen(true);
  };

  const handleCloseSuspendModal = () => {
    setSuspendModalOpen(false);
    setSuspendRow(null);
  };

  const handleConfirmSuspend = async () => {
    if (!suspendRow) return;
    const isSuspended = suspendRow.status === 'suspended';
    const name = `${suspendRow.firstName} ${suspendRow.lastName}`;
    try {
      setSuspendLoading(suspendRow.id);
      if (isSuspended) {
        await mentorApi.unsuspendUser(suspendRow.id);
        toast.success(`${name} has been unsuspended.`);
      } else {
        await mentorApi.suspendUser(suspendRow.id);
        toast.success(`${name} has been suspended.`);
      }
      handleCloseSuspendModal();
      refetch();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, `Failed to ${isSuspended ? 'unsuspend' : 'suspend'} user`));
    } finally {
      setSuspendLoading(null);
    }
  };

  // Stats derived from current page
  const acceptingCount = mentors.filter(
    (m) => m.mentorProfile?.isAcceptingMentees !== false
  ).length;

  const atCapacityCount = mentors.filter((m) => {
    const mp = m.mentorProfile;
    return mp?.maxMentees ? (mp.currentMenteeCount ?? 0) >= mp.maxMentees : false;
  }).length;

  const avgRating = (() => {
    const rated = mentors.filter((m) => m.mentorProfile?.avgFeedbackRating);
    if (!rated.length) return '-';
    const avg =
      rated.reduce((s, m) => s + Number(m.mentorProfile!.avgFeedbackRating), 0) / rated.length;
    return avg.toFixed(1);
  })();

  const actionColumn: DataTableColumn<MentorListItem> = {
    key: 'actions' as keyof MentorListItem,
    label: 'Actions',
    align: 'right',
    render: (_, row) => {
      const isSuspended = row.status === 'suspended';
      const name = `${row.firstName} ${row.lastName}`;
      return (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/admin/mentors/${row.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Profile
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
            onClick={() => setEditUser(row)}
            title="Edit user"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />Edit
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
        title="Mentors"
        subtitle="All registered mentors on the platform"
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={GraduationCap}
          label="Total Mentors"
          value={isLoading ? '-' : pagination.total}
          colorClass="text-purple-600 bg-purple-50"
        />
        <StatsCard
          icon={UserCheck}
          label="Accepting Now"
          value={isLoading ? '-' : acceptingCount}
          colorClass="text-green-600 bg-green-50"
          sub="on this page"
        />
        <StatsCard
          icon={TrendingDown}
          label="At Full Capacity"
          value={isLoading ? '-' : atCapacityCount}
          colorClass="text-amber-600 bg-amber-50"
          sub="on this page"
        />
        <StatsCard
          icon={Star}
          label="Avg Rating"
          value={isLoading ? '-' : avgRating}
          colorClass="text-brand-600 bg-brand-50"
          sub="on this page"
        />
      </div>

      {/* Search + Filter */}
      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name or email…"
        filters={[
          {
            value: acceptingFilter,
            onChange: (v) => setAcceptingFilter(v as AcceptingFilter),
            options: ACCEPTING_OPTIONS,
          },
        ]}
      />

      {/* Table */}
      <DataTable<MentorListItem>
        columns={[...columns, actionColumn]}
        data={mentors}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyState={{
          title: 'No mentors found',
          description: search
            ? 'No mentors match your search. Try a different name or email.'
            : acceptingFilter !== 'all'
              ? 'No mentors match this filter.'
              : 'No mentors are registered on the platform yet.',
        }}
      />

      <TablePagination pagination={pagination} isLoading={isLoading} />

      {/* Suspend/Unsuspend Modal */}
      <AlertDialog open={suspendModalOpen} onOpenChange={setSuspendModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendRow?.status === 'suspended' ? 'Unsuspend Mentor?' : 'Suspend Mentor?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendRow?.status === 'suspended'
                ? `${suspendRow.firstName} ${suspendRow.lastName} will regain access to their account and their mentee assignments.`
                : `${suspendRow?.firstName} ${suspendRow?.lastName} will be immediately logged out and cannot log in. Their mentee assignments will be paused.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspendLoading === suspendRow?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSuspend}
              disabled={suspendLoading === suspendRow?.id}
              className={suspendRow?.status === 'suspended' ? 'bg-green-600' : 'bg-red-600'}
            >
              {suspendLoading === suspendRow?.id ? 'Processing...' : suspendRow?.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editUser && (
        <EditUserDrawer
          user={{ id: editUser.id, firstName: editUser.firstName, lastName: editUser.lastName, email: editUser.email, role: 'mentor' }}
          onClose={() => setEditUser(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
