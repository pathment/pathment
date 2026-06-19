'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, Save, CheckCircle2, XCircle } from 'lucide-react';
import {
  systemSettingsApi,
  type CohortReviewClanGrant,
  type CohortReviewEditRequest,
  type OrgSystemSettings,
} from '@/lib/services/system-settings-api';
import { useAdminClans } from '@/lib/hooks/admin';
import { Switch } from '@/components/ui/switch';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const DEFAULT: OrgSystemSettings = { cohortReviewDeleteLocked: false };

export function OrgSystemSettingsTab() {
  const { clans, loading: clansLoading } = useAdminClans();
  const [settings, setSettings] = useState<OrgSystemSettings>(DEFAULT);
  const [requests, setRequests] = useState<CohortReviewEditRequest[]>([]);
  const [grants, setGrants] = useState<CohortReviewClanGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grantClanId, setGrantClanId] = useState('');
  const [grantExpires, setGrantExpires] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, rRes, gRes] = await Promise.all([
        systemSettingsApi.get(),
        systemSettingsApi.listEditRequests('pending'),
        systemSettingsApi.listClanGrants(),
      ]);
      setSettings(sRes?.data?.settings ?? DEFAULT);
      setRequests(rRes?.data?.requests ?? []);
      setGrants(gRes?.data?.grants ?? []);
    } catch {
      toast.error('Could not load system settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveLock = async (locked: boolean) => {
    try {
      setSaving(true);
      const res = await systemSettingsApi.update({ cohortReviewDeleteLocked: locked });
      setSettings(res?.data?.settings ?? { ...settings, cohortReviewDeleteLocked: locked });
      toast.success(locked ? 'Cohort review deletion locked' : 'Cohort review deletion unlocked');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save setting'));
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id: string, status: 'approved' | 'denied') => {
    try {
      setBusyId(id);
      await systemSettingsApi.resolveEditRequest(id, { status });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success(status === 'approved' ? 'Request approved' : 'Request denied');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not resolve request'));
    } finally {
      setBusyId(null);
    }
  };

  const createGrant = async () => {
    if (!grantClanId || !grantExpires) {
      toast.error('Pick a clan and expiry time');
      return;
    }
    try {
      setSaving(true);
      await systemSettingsApi.createClanGrant({
        clanId: grantClanId,
        expiresAt: new Date(grantExpires).toISOString(),
        note: grantNote.trim() || undefined,
      });
      toast.success('Clan unlock window created');
      setGrantNote('');
      setGrantExpires('');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create clan grant'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-slate-900 mb-1">Organization settings</h2>
        <p className="text-sm text-slate-600">Org-wide policies stored in system settings.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 rounded-xl bg-slate-100 text-slate-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Lock cohort review deletion</h3>
              <p className="text-sm text-slate-600 mt-1">
                Mentors cannot delete cohort-review sessions while this is on. They can request
                permission, or you can grant a clan a temporary unlock window.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.cohortReviewDeleteLocked}
            disabled={saving}
            onCheckedChange={saveLock}
            aria-label="Lock cohort review deletion"
          />
        </div>
      </div>

      {settings.cohortReviewDeleteLocked && (
        <>
          <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-medium text-slate-900">Pending mentor requests</h3>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{r.mentor?.name || 'Mentor'}</p>
                        <p className="text-xs text-slate-500">
                          Session {r.session?.sessionDate} {r.session?.title ? `· ${r.session.title}` : ''}
                          {r.clan?.name ? ` · ${r.clan.name}` : ''}
                        </p>
                        {r.reason && <p className="mt-2 text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{r.reason}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => resolve(r.id, 'approved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => resolve(r.id, 'denied')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Deny
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-medium text-slate-900">Temporary clan unlock</h3>
            <p className="text-sm text-slate-600">Allow a clan&apos;s mentors to delete reviews until the expiry time.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <select
                value={grantClanId}
                onChange={(e) => setGrantClanId(e.target.value)}
                disabled={clansLoading || saving}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-card"
              >
                <option value="">Select clan…</option>
                {clans.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={grantExpires}
                onChange={(e) => setGrantExpires(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="Optional note"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={createGrant}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Grant clan window
            </button>
            {grants.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Active grants</p>
                {grants.map((g) => (
                  <p key={g.id} className="text-sm text-slate-700">
                    {g.clan?.name || g.clanId} · until {new Date(g.expiresAt).toLocaleString()}
                    {g.note ? ` · ${g.note}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
