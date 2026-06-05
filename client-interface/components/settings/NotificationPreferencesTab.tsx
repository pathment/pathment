'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';

import { preferencesApi } from '@/lib/services/preferences-api';
import { categoriesForRole, groupsForRole, type AppRole } from '@/lib/config/notificationCategories';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-12 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-card after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
    </label>
  );
}

/**
 * Notification preferences that ACTUALLY gate email delivery — toggles map to
 * the server's `emailNotifications` keys (the notification matrix). Transactional
 * mail (password reset, account/invite) always sends and isn't shown here.
 * Shared across admin / mentor / mentee.
 */
export function NotificationPreferencesTab({ role }: { role: AppRole }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const categories = categoriesForRole(role);
  const groups = groupsForRole(role);

  useEffect(() => {
    preferencesApi.getEmailNotifications()
      .then((p) => setPrefs(p || {}))
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, []);

  // Default ON unless explicitly false (matches the server's fallback).
  const isOn = (key: string) => prefs[key] !== false;
  const masterOn = prefs.enabled !== false;
  const set = (key: string, value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      // Persist explicit booleans for this role's categories + the master switch.
      const payload: Record<string, boolean> = { enabled: masterOn };
      for (const c of categories) payload[c.key] = isOn(c.key);
      await preferencesApi.updateNotifications(payload);
      toast.success('Notification preferences saved');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save preferences'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-slate-900 mb-2">Email notifications</h2>
        <p className="text-slate-600">Choose which important updates we email you. Security emails (sign-in, password, invites) are always sent.</p>
      </div>

      {/* Master switch */}
      <div className="flex items-center justify-between p-5 border border-slate-200 rounded-xl bg-slate-50">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-brand-600" />
          <div>
            <div className="text-slate-900 font-medium">Email notifications</div>
            <div className="text-sm text-slate-600">Master switch — turn all of the below on or off.</div>
          </div>
        </div>
        <Toggle checked={masterOn} onChange={(v) => set('enabled', v)} />
      </div>

      {/* Per-category, grouped */}
      <div className={`space-y-6 ${masterOn ? '' : 'opacity-50 pointer-events-none'}`}>
        {groups.map((group) => (
          <div key={group}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{group}</p>
            <div className="space-y-2">
              {categories.filter((c) => c.group === group).map((c) => (
                <div key={c.key} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                  <div className="text-sm text-slate-800">{c.label}</div>
                  <Toggle checked={isOn(c.key)} disabled={!masterOn} onChange={(v) => set(c.key, v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
        Save preferences
      </button>
    </div>
  );
}

export default NotificationPreferencesTab;
