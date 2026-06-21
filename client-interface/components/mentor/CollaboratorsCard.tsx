'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, Loader2, Trash2, Stethoscope } from 'lucide-react';
import type { ProfileCollaborator } from '@/lib/types/insights';

/**
 * Collaborators - specialists invited to work with a mentee (psychologist,
 * career coach, guest mentor…). Mirrors the prototype's collaborators panel.
 */
export function CollaboratorsCard({
  collaborators,
  onAdd,
  onRemove,
}: {
  collaborators: ProfileCollaborator[];
  onAdd: (data: { name: string; role: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invite = async () => {
    if (!name.trim() || !role.trim()) { toast.error('Name and role are required'); return; }
    try {
      setSaving(true);
      await onAdd({ name: name.trim(), role: role.trim() });
      setName(''); setRole('');
      toast.success('Collaborator invited');
    } catch { toast.error('Could not invite'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { setBusyId(id); await onRemove(id); toast.success('Removed'); }
    catch { toast.error('Could not remove'); }
    finally { setBusyId(null); }
  };

  const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="bg-card rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
        <Stethoscope className="w-4 h-4 text-brand-500" />
        <h2 className="text-slate-900">Collaborators</h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Dr. Maya Brooks)" className={`${field} flex-1 min-w-40`} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Psychologist)" className={`${field} flex-1 min-w-32`} />
          <button onClick={invite} disabled={saving} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Invite
          </button>
        </div>

        {collaborators.length === 0 ? (
          <p className="text-sm text-slate-500">No collaborators invited.</p>
        ) : (
          <div className="space-y-2">
            {collaborators.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-brand-700 text-xs font-medium">{c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.role}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.status}</span>
                <button onClick={() => remove(c.id)} disabled={busyId === c.id} className="text-slate-400 hover:text-red-500 disabled:opacity-50 shrink-0">
                  {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
