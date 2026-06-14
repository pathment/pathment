'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Drawer } from '@/components/shared/Drawer';
import { clanApi } from '@/lib/services/clan-api';
import { CO_MENTOR_PERMISSIONS } from '@/lib/config/permissions';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Lead mentor / admin tool: a co-mentor starts with every default permission;
 * un-checking one revokes it for this person, in this clan only — no matter how
 * they became a co-mentor (team add, cross-clan cover, or an IAM grant). Saving
 * an empty set restores full parity. Self-fetches the current state, so any
 * surface can open it with just a clanId + userId. The server re-enforces.
 */
export function CoMentorPermissionsDrawer({
  clanId, userId, name, onClose, onSaved,
}: {
  clanId: string;
  userId: string;
  name?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    clanApi.getMemberPermissions(clanId, userId)
      .then((r: any) => { if (alive) setDenied(new Set(r.data?.denied ?? [])); })
      .catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load permissions')); onClose(); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clanId, userId, onClose]);

  const toggle = (key: string) => {
    setDenied((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const grantedCount = CO_MENTOR_PERMISSIONS.length - denied.size;

  const save = async () => {
    setSaving(true);
    try {
      await clanApi.setMemberPermissions(clanId, userId, [...denied]);
      toast.success('Permissions updated');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update permissions'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Co-mentor permissions"
      subtitle={name || undefined}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDenied(new Set())}
            disabled={loading || denied.size === 0}
            className="px-3 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
          >
            Reset to full access
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
            <button onClick={save} disabled={saving || loading} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 dark:bg-brand-500/10 px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600">
              Co-mentors get the same access as you by default. Turn off anything you don&apos;t want
              this person to do. Managing the team stays with you and admins.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            {grantedCount} of {CO_MENTOR_PERMISSIONS.length} permissions enabled
          </p>

          <div className="space-y-2">
            {CO_MENTOR_PERMISSIONS.map((p) => {
              const enabled = !denied.has(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors ${
                    enabled ? 'border-brand-200 bg-brand-50/40 dark:bg-brand-500/10' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggle(p.key)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{p.label}</span>
                    <span className="block text-xs text-slate-500">{p.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </Drawer>
  );
}
