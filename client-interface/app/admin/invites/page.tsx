'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCw, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

type InviteStatusFilter = 'all' | 'active' | 'used' | 'expired' | 'revoked';

type InviteRecord = {
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

type CreatedInvite = {
  id: string;
  email: string;
  role: 'mentor' | 'mentee';
  expiresAt: string;
  createdAt: string;
  inviteUrl: string;
};

export default function AdminInvitesPage() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-slate-900 font-semibold">Registration Invites</h1>
        <p className="text-slate-600">Mentor and mentee signup is invite-only. Create one-time invites below.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          <h2>Create Invite</h2>
        </div>

        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="invitee@company.com"
              className="md:col-span-2 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as 'mentor' | 'mentee' }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="w-full pl-[5.5rem] pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Expiry in hours"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-slate-500 text-sm">hrs</span>
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-5 py-2.5 rounded-lg"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Create Invite Link
          </button>
        </form>

        {createdInviteUrl && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
            <p className="text-indigo-900 text-sm">New invite link generated. Share it securely:</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                readOnly
                value={createdInviteUrl}
                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => handleCopyLink(createdInviteUrl)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-indigo-200 rounded-lg text-indigo-700 hover:bg-indigo-100"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-slate-900">Invite Inventory</h2>
            <p className="text-slate-600 text-sm">{inviteCountLabel}</p>
          </div>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InviteStatusFilter)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
