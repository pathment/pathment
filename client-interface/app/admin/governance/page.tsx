'use client';

import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgGovernance } from '@/lib/hooks/admin/useOrgGovernance';
import { Switch } from '@/components/ui/switch';

/** Admin governance — org-wide compliance toggles (RBAC: system.settings). */
export default function AdminGovernancePage() {
  const { governance, loading, saving, save } = useOrgGovernance();

  const toggleDeleteLock = async (locked: boolean) => {
    try {
      await save({ cohortReviewDeleteLocked: locked });
      toast.success(locked ? 'Cohort review deletion is now locked' : 'Cohort review deletion is unlocked');
    } catch {
      toast.error('Could not update governance settings');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-600" /> Governance
        </h1>
        <p className="text-slate-600 text-sm">
          Org-wide compliance controls. Changes apply to every mentor immediately.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 p-2 rounded-xl bg-slate-100 text-slate-600 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-slate-900 font-medium">Lock cohort review deletion</h2>
              <p className="text-sm text-slate-600 mt-1">
                When enabled, mentors cannot delete cohort-review sessions — including empty drafts.
                Records stay intact for audit and compliance. Mentors can still edit and reopen finished sessions.
              </p>
              {governance.cohortReviewDeleteLocked && (
                <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Deletion is currently locked org-wide.
                </p>
              )}
            </div>
          </div>
          <Switch
            checked={governance.cohortReviewDeleteLocked}
            disabled={saving}
            onCheckedChange={toggleDeleteLock}
            aria-label="Lock cohort review deletion"
          />
        </div>
      </div>
    </div>
  );
}
