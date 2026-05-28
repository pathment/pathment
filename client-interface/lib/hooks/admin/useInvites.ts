import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export type InviteStatusFilter = 'all' | 'active' | 'used' | 'expired' | 'revoked';

export type InviteRecord = {
  id: string;
  email: string;
  role: 'mentor' | 'mentee';
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  inviter?: { firstName: string; lastName: string; email: string };
  usedByUser?: { firstName: string; lastName: string; email: string };
};

export type CreatedInvite = {
  id: string;
  email: string;
  role: 'mentor' | 'mentee';
  expiresAt: string;
  createdAt: string;
  inviteUrl: string;
};

export type CsvRow = {
  email: string;
  role: string;
};

export type BulkReport = {
  successCount: number;
  skippedCount: number;
  totalProcessed: number;
  successfulInvites: { email: string; role: string }[];
  skippedInvites: { email: string; role: string; reason: string }[];
};

export const MAX_CSV_SIZE = 5 * 1024 * 1024;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const VALID_ROLES = ['mentor', 'mentee'];

export function isRowValid(row: CsvRow): boolean {
  return EMAIL_REGEX.test(row.email) && VALID_ROLES.includes(row.role);
}

export function parseCsvText(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().replace(/\s/g, '');
  if (!header.includes('email') || !header.includes('role')) return [];

  const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const emailIdx = headerCols.indexOf('email');
  const roleIdx = headerCols.indexOf('role');
  if (emailIdx === -1 || roleIdx === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const email = cols[emailIdx]?.toLowerCase() || '';
    const role = cols[roleIdx]?.toLowerCase() || '';
    if (email || role) {
      rows.push({ email, role });
    }
  }
  return rows;
}

export function useInvites() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<InviteStatusFilter>('active');
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string>('');
  const [form, setForm] = useState({
    email: '',
    role: 'mentee' as 'mentor' | 'mentee',
    expiresInHours: 72,
  });

  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);
  const [csvFilter, setCsvFilter] = useState<'valid' | 'invalid' | 'all'>('valid');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvites = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await apiClient.get<any>(apiConfig.endpoints.adminInvites, {
        params: { status, limit: 100, offset: 0 },
      });
      const rows = response?.data?.invites || response?.invites || [];
      setInvites(rows);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to load invites'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email) {
      toast.error('Email is required');
      return;
    }

    try {
      setCreating(true);
      const response = await apiClient.post<any>(apiConfig.endpoints.adminInvites, form);
      const invite: CreatedInvite | undefined = response?.data?.invite || response?.invite;

      if (!invite?.inviteUrl) {
        throw new Error('Invite URL was not returned');
      }

      setCreatedInviteUrl(invite.inviteUrl);
      toast.success('Invite created successfully');
      setForm((prev) => ({ ...prev, email: '' }));
      await fetchInvites(true);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to create invite'));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await apiClient.post(apiConfig.endpoints.revokeAdminInvite(id));
      toast.success('Invite revoked');
      await fetchInvites(true);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to revoke invite'));
    }
  };

  const inviteCountLabel = useMemo(() => {
    if (status === 'all') return `${invites.length} invites`;
    return `${invites.length} ${status} invite${invites.length === 1 ? '' : 's'}`;
  }, [invites.length, status]);

  const handleFileSelected = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file');
      return;
    }
    if (file.size > MAX_CSV_SIZE) {
      toast.error('File exceeds the 5MB size limit');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text);
      if (rows.length === 0) {
        toast.error('No valid rows found. Ensure the CSV has "email" and "role" columns.');
        return;
      }
      setCsvRows(rows);
      setBulkReport(null);
      toast.success(`${rows.length} rows parsed from CSV`);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateCsvRow = (index: number, field: keyof CsvRow, value: string) => {
    setCsvRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    );
  };

  const removeCsvRow = (index: number) => {
    setCsvRows((prev) => prev.filter((_, i) => i !== index));
  };

  const validRows = useMemo(() => csvRows.filter(isRowValid), [csvRows]);
  const invalidCount = csvRows.length - validRows.length;

  const filteredCsvRows = useMemo(() => {
    if (csvFilter === 'valid') return csvRows.map((r, i) => ({ ...r, _idx: i })).filter((r) => isRowValid(r));
    if (csvFilter === 'invalid') return csvRows.map((r, i) => ({ ...r, _idx: i })).filter((r) => !isRowValid(r));
    return csvRows.map((r, i) => ({ ...r, _idx: i }));
  }, [csvRows, csvFilter]);

  const handleBulkSend = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to send');
      return;
    }

    try {
      setBulkSending(true);
      const response = await apiClient.post<any>(apiConfig.endpoints.bulkAdminInvites, {
        invites: validRows,
      });
      const report: BulkReport = response?.data?.report || response?.report;

      const clientSkippedRows = csvRows.filter(r => !isRowValid(r)).map(r => {
        let reason = 'Invalid format';
        if (!EMAIL_REGEX.test(r.email) && !VALID_ROLES.includes(r.role)) reason = 'Invalid email and role';
        else if (!EMAIL_REGEX.test(r.email)) reason = 'Invalid email';
        else if (!VALID_ROLES.includes(r.role)) reason = 'Invalid role';
        return { email: r.email, role: r.role, reason };
      });

      if (clientSkippedRows.length > 0) {
        report.skippedInvites = [...clientSkippedRows, ...(report.skippedInvites || [])];
        report.skippedCount = report.skippedInvites.length;
        report.totalProcessed = report.successCount + report.skippedCount;
      }

      setBulkReport(report);
      setCsvRows([]);
      toast.success(`${report.successCount} invites sent successfully`);
      await fetchInvites(true);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Bulk invite failed'));
    } finally {
      setBulkSending(false);
    }
  };

  return {
    loading,
    creating,
    refreshing,
    status,
    setStatus,
    invites,
    createdInviteUrl,
    form,
    setForm,
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
    inviteCountLabel,
    handleFileSelected,
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
  };
}
