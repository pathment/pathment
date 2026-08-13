'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Search, X } from 'lucide-react';
import { useInvites, isRowValid, EMAIL_REGEX, VALID_ROLES, CSV_TEMPLATE, type InviteStatusFilter } from '@/lib/hooks/admin';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { TablePagination } from '@/components/shared/TablePagination';

export default function AdminInvitesPage() {
  const {
    loading,
    creating,
    refreshing,
    status,
    setStatus,
    invites,
    pagination,
    search,
    setSearch,
    programFilter,
    setProgramFilter,
    clanFilter,
    setClanFilter,
    createdInviteUrl,
    form,
    setForm,
    programs,
    clans,
    csvRows,
    setCsvRows,
    isDragging,
    bulkSending,
    bulkReport,
    setBulkReport,
    csvFilter,
    setCsvFilter,
    fileInputRef,
    fetchInvites,
    handleCreateInvite,
    handleCopyLink,
    handleRevoke,
    handleResend,
    resendingId,
    inviteCountLabel,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInputChange,
    updateCsvRow,
    removeCsvRow,
    validRows,
    invalidCount,
    filteredCsvRows,
    handleBulkSend,
  } = useInvites();

  const confirm = useConfirm();

  /**
   * Resend reissues the invite with the same email, role and placement. Tokens are
   * stored hashed, so a resend always mints a NEW link - which means resending a
   * still-active invite kills the link that was already sent. Confirm that case.
   */
  const resendInvite = async (invite: { id: string; email: string }, isActive: boolean) => {
    if (isActive) {
      const ok = await confirm({
        title: 'Resend this invite?',
        description: `A new link will be emailed to ${invite.email}. The link they already have will stop working.`,
        confirmLabel: 'Resend',
      });
      if (!ok) return;
    }
    await handleResend(invite.id);
  };

  const csvColumns: DataTableColumn<typeof filteredCsvRows[0]>[] = [
    {
      key: '_idx',
      label: '#',
      render: (_, row) => {
        const valid = isRowValid(row);
        return <span className={valid ? 'text-slate-400' : 'text-red-400'}>{row._idx + 1}</span>;
      },
    },
    {
      key: 'email',
      label: 'Email',
      render: (_, row) => {
        const emailBad = !EMAIL_REGEX.test(row.email);
        return (
          <input
            type="email"
            value={row.email}
            onChange={(e) => updateCsvRow(row._idx, 'email', e.target.value)}
            className={`w-full px-2 py-1 border rounded-md focus:outline-none focus:ring-1 text-sm ${emailBad
              ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-400'
              : 'border-slate-200 focus:ring-brand-500'
              }`}
          />
        );
      },
    },
    {
      key: 'role',
      label: 'Role',
      render: (_, row) => {
        const roleBad = !VALID_ROLES.includes(row.role);
        return (
          <select
            value={VALID_ROLES.includes(row.role) ? row.role : ''}
            onChange={(e) => updateCsvRow(row._idx, 'role', e.target.value)}
            className={`px-2 py-1 border rounded-md focus:outline-none focus:ring-1 text-sm ${roleBad
              ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-400'
              : 'border-slate-200 focus:ring-brand-500'
              }`}
          >
            {roleBad && <option value="">Invalid: {row.role}</option>}
            <option value="mentee">Mentee</option>
            <option value="mentor">Mentor</option>
          </select>
        );
      },
    },
    {
      key: 'program',
      label: 'Program',
      render: (_, row) => (
        <input
          value={row.program ?? ''}
          onChange={(e) => updateCsvRow(row._idx, 'program', e.target.value)}
          placeholder={row.role === 'mentee' ? 'Required' : '-'}
          className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
        />
      ),
    },
    {
      key: 'clan',
      label: 'Clan',
      render: (_, row) => (
        <input
          value={row.clan ?? ''}
          onChange={(e) => updateCsvRow(row._idx, 'clan', e.target.value)}
          placeholder={row.role === 'mentor' ? 'Required' : 'Optional'}
          className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const valid = isRowValid(row);
        const emailBad = !EMAIL_REGEX.test(row.email);
        const roleBad = !VALID_ROLES.includes(row.role);

        if (valid) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Valid
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {emailBad && roleBad ? 'Bad email & role' : emailBad ? 'Invalid email' : 'Invalid role'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <button
          type="button"
          onClick={() => removeCsvRow(row._idx)}
          className="text-slate-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const successColumns: DataTableColumn<{ email: string; role: string; program?: string; clan?: string; _idx: number }>[] = [
    { key: 'email', label: 'Email', headerClassName: 'text-emerald-700', cellClassName: 'text-slate-700' },
    { key: 'role', label: 'Role', headerClassName: 'text-emerald-700', cellClassName: 'capitalize text-slate-600' },
    { key: 'program', label: 'Program', headerClassName: 'text-emerald-700', cellClassName: 'text-slate-600', render: (_, r) => r.program || '-' },
    { key: 'clan', label: 'Clan', headerClassName: 'text-emerald-700', cellClassName: 'text-slate-600', render: (_, r) => r.clan || '-' },
  ];

  const skippedColumns: DataTableColumn<{ email: string; role: string; reason: string; program?: string; clan?: string; _idx: number }>[] = [
    { key: 'email', label: 'Email', headerClassName: 'text-amber-700', cellClassName: 'text-slate-700' },
    { key: 'role', label: 'Role', headerClassName: 'text-amber-700', cellClassName: 'capitalize text-slate-600' },
    { key: 'reason', label: 'Reason', headerClassName: 'text-amber-700', cellClassName: 'text-amber-700' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-slate-900 font-semibold">Invites</h1>
        <p className="text-slate-600">Mentor and mentee signup is invite-only. Create one-time invites below.</p>
      </div>

      {/* Single invite form */}
      <div className="bg-card border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <UserPlus className="w-5 h-5 text-brand-600" />
          <h2>Create Invite</h2>
        </div>

        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="invitee@company.com"
              className="md:col-span-2 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as 'mentor' | 'mentee' }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="mentee">Mentee</option>
              <option value="mentor">Mentor</option>
            </select>
            <div className="relative flex items-center">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-slate-500 text-sm">Expires in</span>
              </div>
              <input
                type="number"
                min={1}
                max={720}
                value={form.expiresInHours}
                onChange={(e) => setForm((prev) => ({ ...prev, expiresInHours: Number(e.target.value) || 72 }))}
                className="w-full pl-[5.5rem] pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                title="Expiry in hours"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-slate-500 text-sm">hrs</span>
              </div>
            </div>
          </div>

          {/* Placement - the invite is the enrollment. Mentees need a program;
              mentors need a clan (program just narrows the clan list). */}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Program {form.role === 'mentee'
                  ? <span className="text-red-500">*</span>
                  : <span className="text-slate-400 font-normal">(filters clans)</span>}
              </label>
              <select
                value={form.programId}
                onChange={(e) => setForm((prev) => ({ ...prev, programId: e.target.value, clanId: '' }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select a program…</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Clan {form.role === 'mentor'
                  ? <span className="text-red-500">*</span>
                  : <span className="text-slate-400 font-normal">(optional)</span>}
              </label>
              <select
                value={form.clanId}
                onChange={(e) => setForm((prev) => ({ ...prev, clanId: e.target.value }))}
                disabled={!form.programId}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{form.programId ? 'Select a clan…' : 'Pick a program first'}</option>
                {clans.filter((c) => c.programId === form.programId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-5 py-2.5 rounded-lg"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Create Invite Link
          </button>
        </form>

        {createdInviteUrl && (
          <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl p-4 space-y-3">
            <p className="text-brand-900 text-sm">New invite link generated. Share it securely:</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                readOnly
                value={createdInviteUrl}
                className="w-full px-3 py-2 bg-card border border-brand-200 rounded-lg text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => handleCopyLink(createdInviteUrl)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-brand-200 rounded-lg text-brand-700 hover:bg-brand-100"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk CSV upload */}
      <div className="bg-card border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 text-slate-900">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-600" />
            <h2>Bulk Invite via CSV</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'pathment-invites-template.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
          >
            <Copy className="w-3.5 h-3.5" /> Download template
          </button>
        </div>

        {csvRows.length === 0 && !bulkReport && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragging
              ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10'
              : 'border-slate-300 hover:border-brand-300 hover:bg-slate-50'
              }`}
          >
            <FileSpreadsheet className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">Drop your CSV file here or click to browse</p>
            <p className="text-slate-500 text-sm mt-1">
              Columns: <code className="text-slate-600">email, role, program, clan</code> · mentees need a program, mentors a clan · Max 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        )}

        {csvRows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {(['valid', 'invalid', 'all'] as const).map((f) => {
                  const count = f === 'valid' ? validRows.length : f === 'invalid' ? invalidCount : csvRows.length;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setCsvFilter(f)}
                      className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${csvFilter === f
                        ? 'bg-card text-slate-900 shadow-sm font-medium'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      {f} ({count})
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCsvRows([])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleBulkSend}
                  disabled={bulkSending || validRows.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-lg"
                >
                  {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Confirm & Send ({validRows.length})
                </button>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-xl">
              <DataTable
                columns={csvColumns}
                data={filteredCsvRows}
                rowKey="_idx"
                tableClassName="text-sm"
                className="border-0"
              />
            </div>
          </div>
        )}

        {bulkReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-semibold text-slate-900">{bulkReport.totalProcessed}</p>
                <p className="text-slate-500 text-sm">Total Processed</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-semibold text-emerald-700">{bulkReport.successCount}</p>
                <p className="text-emerald-600 text-sm">Invites Sent</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-semibold text-amber-700">{bulkReport.skippedCount}</p>
                <p className="text-amber-600 text-sm">Skipped</p>
              </div>
            </div>

            {bulkReport.successfulInvites.length > 0 && (
              <details className="border border-emerald-200 rounded-xl">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-emerald-800 bg-emerald-50 rounded-xl hover:bg-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {bulkReport.successfulInvites.length} Successful Invite{bulkReport.successfulInvites.length !== 1 ? 's' : ''}
                </summary>
                <div className="max-h-[250px] overflow-y-auto">
                  <DataTable
                    columns={successColumns}
                    data={bulkReport.successfulInvites.map((inv, i) => ({ ...inv, _idx: i }))}
                    rowKey="_idx"
                    tableClassName="text-sm"
                    className="border-0 rounded-none"
                  />
                </div>
              </details>
            )}

            {bulkReport.skippedInvites.length > 0 && (
              <details className="border border-amber-200 rounded-xl" open>
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-amber-800 bg-amber-50 rounded-xl hover:bg-amber-100 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {bulkReport.skippedInvites.length} Skipped Row{bulkReport.skippedInvites.length !== 1 ? 's' : ''}
                </summary>
                <div className="max-h-[250px] overflow-y-auto">
                  <DataTable
                    columns={skippedColumns}
                    data={bulkReport.skippedInvites.map((inv, i) => ({ ...inv, _idx: i }))}
                    rowKey="_idx"
                    tableClassName="text-sm"
                    className="border-0 rounded-none"
                  />
                </div>
              </details>
            )}

            <button
              type="button"
              onClick={() => setBulkReport(null)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              <Upload className="w-4 h-4" />
              Upload Another CSV
            </button>
          </div>
        )}
      </div>

      {/* Invite inventory */}
      <div className="bg-card border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-slate-900">Invite Inventory</h2>
            <p className="text-slate-600 text-sm">{inviteCountLabel}</p>
          </div>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InviteStatusFilter)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="active">Active</option>
              <option value="all">All</option>
              <option value="used">Used</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
            <button
              type="button"
              onClick={() => fetchInvites(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters: search by email, narrow by program → clan (clan list follows the chosen program) */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email…"
              className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <SelectMenu
            value={programFilter}
            onChange={setProgramFilter}
            options={[{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.name }))]}
            placeholder="All programs"
            ariaLabel="Filter by program"
            className="sm:w-52"
          />
          <SelectMenu
            value={clanFilter}
            onChange={setClanFilter}
            options={[{ value: '', label: 'All clans' }, ...clans.filter((c) => !programFilter || c.programId === programFilter).map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="All clans"
            ariaLabel="Filter by clan"
            className="sm:w-52"
          />
        </div>

        {invites.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-600">
            No invites found for this filter.
          </div>
        )}

        {invites.length > 0 && (
          <div className="space-y-3">
            {invites.map((invite) => {
              const isActive = !invite.usedAt && !invite.revokedAt && new Date(invite.expiresAt) > new Date();

              return (
                <div key={invite.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-slate-900 font-medium">{invite.email}</div>
                      <div className="text-slate-600 text-sm">
                        <span className="capitalize">{invite.role}</span> invite · Expires {new Date(invite.expiresAt).toLocaleString()}
                      </div>
                      {(invite.program || invite.clan) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {invite.program && (
                            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs">{invite.program.name}</span>
                          )}
                          {invite.clan && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{invite.clan.name}</span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">Created {new Date(invite.createdAt).toLocaleString()}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-md">Active</span>
                      ) : invite.usedAt ? (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-md">Used</span>
                      ) : invite.revokedAt ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-md">Revoked</span>
                      ) : (
                        <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs rounded-md">Expired</span>
                      )}

                      {/* A used invite already became an account - there's nothing
                          left to resend. Everything else can be reissued as-is. */}
                      {!invite.usedAt && (
                        <button
                          type="button"
                          onClick={() => resendInvite(invite, isActive)}
                          disabled={resendingId === invite.id}
                          title="Reissue with the same role, program and clan"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-brand-200 text-brand-700 rounded-md hover:bg-brand-50 disabled:opacity-50"
                        >
                          {resendingId === invite.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Send className="w-3 h-3" />}
                          Resend
                        </button>
                      )}

                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(invite.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded-md hover:bg-red-50"
                        >
                          <XCircle className="w-3 h-3" />
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>

                  {invite.usedByUser && (
                    <div className="mt-2 text-xs text-slate-500">
                      Consumed by {invite.usedByUser.firstName} {invite.usedByUser.lastName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pagination.total > pagination.limit && (
          <TablePagination pagination={pagination} isLoading={loading || refreshing} className="pt-1" />
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5" />
        <p className="text-amber-800 text-sm">
          Invite links are single-use and grant account creation for the invited role only.
        </p>
      </div>
    </div>
  );
}
